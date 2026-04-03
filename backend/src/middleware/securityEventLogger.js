/**
 * Security Event Logger Middleware
 *
 * Tüm security event'lerini DB'ye yazar.
 * Red Alert bu event'leri okuyarak spike detection yapar.
 */

import prisma from '../prismaClient.js';

// ============================================================================
// FLOOD PROTECTION: Dedupe Window
// ============================================================================
// Prevents DB flood from bot attacks (e.g., 10,000 auth failures in 1 minute)
// Same event type + IP + endpoint within 60 seconds → deduplicated

const eventCache = new Map();
const DEDUPE_WINDOW_MS = 60 * 1000; // 60 seconds

/**
 * Generate dedupe key for event
 */
function getDedupeKey({ type, ipAddress, endpoint, businessId }) {
  return `${type}:${ipAddress || 'null'}:${endpoint || 'null'}:${businessId || 'null'}`;
}

/**
 * Check if event should be deduped
 */
function shouldDedupe({ type, ipAddress, endpoint, businessId }) {
  const key = getDedupeKey({ type, ipAddress, endpoint, businessId });
  const lastLogged = eventCache.get(key);

  if (lastLogged && Date.now() - lastLogged < DEDUPE_WINDOW_MS) {
    return true; // Skip duplicate
  }

  eventCache.set(key, Date.now());
  return false;
}

// Cleanup old entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of eventCache.entries()) {
    if (now - timestamp > DEDUPE_WINDOW_MS * 2) {
      eventCache.delete(key);
    }
  }
}, 60000);

/**
 * Sanitize URL for logging (remove query params with potential PII)
 * Example: http://example.com/path?token=secret → http://example.com/path
 */
function sanitizeUrlForLogging(url) {
  try {
    const parsed = new URL(url);
    // Remove query params and hash to avoid logging sensitive data
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return '[invalid-url]';
  }
}

/**
 * Security event severity levels
 */
export const SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Security event types
 */
export const EVENT_TYPE = {
  AUTH_FAILURE: 'auth_failure',
  CROSS_TENANT_ATTEMPT: 'cross_tenant_attempt',
  FIREWALL_BLOCK: 'firewall_block',
  CONTENT_SAFETY_BLOCK: 'content_safety_block',
  SSRF_BLOCK: 'ssrf_block',
  RATE_LIMIT_HIT: 'rate_limit_hit',
  WEBHOOK_INVALID_SIGNATURE: 'webhook_invalid_signature',
  PII_LEAK_BLOCK: 'pii_leak_block',
  SENSITIVE_DATA_ACCESS: 'sensitive_data_access',
};

/**
 * Log security event to database
 *
 * @param {Object} params - Event parameters
 * @param {string} params.type - Event type (from EVENT_TYPE)
 * @param {string} params.severity - Severity level (from SEVERITY)
 * @param {number} params.businessId - Business ID (nullable)
 * @param {number} params.userId - User ID (nullable)
 * @param {string} params.ipAddress - Client IP address
 * @param {string} params.userAgent - User agent string
 * @param {string} params.endpoint - API endpoint
 * @param {string} params.method - HTTP method
 * @param {number} params.statusCode - HTTP status code
 * @param {Object} params.details - Additional context (JSON)
 */
export async function logSecurityEvent({
  type,
  severity,
  businessId = null,
  userId = null,
  ipAddress = null,
  userAgent = null,
  endpoint = null,
  method = null,
  statusCode = null,
  details = {}
}) {
  // P0 FIX: Dedupe check to prevent DB flood from bot attacks
  if (shouldDedupe({ type, ipAddress, endpoint, businessId })) {
    console.log(`⏭️  SecurityEvent deduped: ${type} (${ipAddress}) - within 60s window`);
    return; // Skip duplicate event
  }

  try {
    await prisma.securityEvent.create({
      data: {
        type,
        severity,
        businessId,
        userId,
        ipAddress,
        userAgent,
        endpoint,
        method,
        statusCode,
        details
      }
    });

    console.log(`🚨 SecurityEvent logged: ${type} (${severity}) - ${endpoint || 'N/A'}`);
  } catch (error) {
    // CRITICAL: Don't let logging failure break the request
    console.error('❌ Failed to log security event:', error.message);
  }
}

/**
 * Express middleware wrapper for security event logging
 * Attaches logSecurityEvent to req object
 */
export function attachSecurityLogger(req, res, next) {
  req.logSecurityEvent = async (params) => {
    await logSecurityEvent({
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      endpoint: req.path,
      method: req.method,
      ...params
    });
  };

  next();
}

/**
 * Helper: Log auth failure
 */
export async function logAuthFailure(req, reason, statusCode = 401) {
  await logSecurityEvent({
    type: EVENT_TYPE.AUTH_FAILURE,
    severity: SEVERITY.MEDIUM,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    endpoint: req.path,
    method: req.method,
    statusCode,
    details: { reason }
  });
}

/**
 * Helper: Log cross-tenant attempt
 */
export async function logCrossTenantAttempt(req, attackerBusinessId, targetBusinessId, userId = null) {
  await logSecurityEvent({
    type: EVENT_TYPE.CROSS_TENANT_ATTEMPT,
    severity: SEVERITY.CRITICAL,
    businessId: attackerBusinessId,
    userId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    endpoint: req.path,
    method: req.method,
    statusCode: 403,
    details: {
      attackerBusinessId,
      targetBusinessId,
      reason: 'cross_tenant_access_denied'
    }
  });
}

/**
 * Helper: Log webhook signature failure
 */
export async function logWebhookSignatureFailure(req, webhookType, statusCode = 401) {
  await logSecurityEvent({
    type: EVENT_TYPE.WEBHOOK_INVALID_SIGNATURE,
    severity: SEVERITY.HIGH,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    endpoint: req.path,
    method: req.method,
    statusCode,
    details: {
      webhookType,
      providedSignature: req.headers['x-hub-signature-256']?.substring(0, 20) || 'missing'
    }
  });
}

/**
 * Helper: Log firewall block (prompt injection, data dump, etc.)
 */
export async function logFirewallBlock(req, reason, businessId = null) {
  await logSecurityEvent({
    type: EVENT_TYPE.FIREWALL_BLOCK,
    severity: SEVERITY.HIGH,
    businessId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    endpoint: req.path,
    method: req.method,
    statusCode: 400,
    details: { reason }
  });
}

/**
 * Helper: Log SSRF block
 */
export async function logSSRFBlock(req, blockedUrl, businessId = null) {
  await logSecurityEvent({
    type: EVENT_TYPE.SSRF_BLOCK,
    severity: SEVERITY.CRITICAL,
    businessId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    endpoint: req.path,
    method: req.method,
    statusCode: 400,
    details: {
      blockedUrl: sanitizeUrlForLogging(blockedUrl), // P0 FIX: Remove query params (PII risk)
      reason: 'ssrf_attempt_detected'
    }
  });
}

/**
 * Helper: Log rate limit hit
 */
export async function logRateLimitHit(req, limit, window) {
  await logSecurityEvent({
    type: EVENT_TYPE.RATE_LIMIT_HIT,
    severity: SEVERITY.LOW,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    endpoint: req.path,
    method: req.method,
    statusCode: 429,
    details: {
      limit,
      window,
      reason: 'rate_limit_exceeded'
    }
  });
}

/**
 * Helper: Log PII leak block
 */
export async function logPIILeakBlock(req, piiTypes, businessId = null) {
  await logSecurityEvent({
    type: EVENT_TYPE.PII_LEAK_BLOCK,
    severity: SEVERITY.CRITICAL,
    businessId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    endpoint: req.path,
    method: req.method,
    statusCode: 400,
    details: {
      piiTypes, // ['phone', 'email', etc.]
      reason: 'unmasked_pii_detected'
    }
  });
}

/**
 * Helper: Log sensitive data access audit event (metadata only).
 */
export async function logSensitiveDataAccess(req, details = {}) {
  await logSecurityEvent({
    type: EVENT_TYPE.SENSITIVE_DATA_ACCESS,
    severity: SEVERITY.MEDIUM,
    businessId: req.businessId || null,
    userId: req.userId || null,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    endpoint: req.path,
    method: req.method,
    statusCode: 200,
    details: {
      resourceType: details.resourceType || 'unknown',
      resourceId: details.resourceId || null,
      actorRole: details.actorRole || null,
    },
  });
}

export default {
  logSecurityEvent,
  attachSecurityLogger,
  logAuthFailure,
  logCrossTenantAttempt,
  logWebhookSignatureFailure,
  logFirewallBlock,
  logSSRFBlock,
  logRateLimitHit,
  logPIILeakBlock,
  logSensitiveDataAccess,
  SEVERITY,
  EVENT_TYPE
};
