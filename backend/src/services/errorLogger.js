/**
 * Error Logger Service
 *
 * Central error logging for the Error Tracking Center (Red Alert).
 * Captures all application errors: tool failures, chat errors, API errors, etc.
 *
 * Design principles:
 * - NEVER let logging break the request (all writes in try/catch + timeout)
 * - PII-safe: all messages/stacks sanitized via redact.js
 * - Dedup: same error within 60s → increment counter, don't create new row
 * - Severity gate: low severity → console only, not DB
 * - SSOT: all categories/services defined here as enums
 */

import { prisma } from '../config/database.js';
import { createHash } from 'crypto';
import { redactMessage, redactStackTrace, normalizeForFingerprint } from '../utils/redact.js';

// ============================================================================
// SSOT ENUMS (Single Source of Truth)
// ============================================================================

export const ERROR_CATEGORY = {
  TOOL_FAILURE: 'tool_failure',
  CHAT_ERROR: 'chat_error',
  ASSISTANT_ERROR: 'assistant_error',
  API_ERROR: 'api_error',
  SYSTEM_ERROR: 'system_error',
  WEBHOOK_ERROR: 'webhook_error',
};

export const EXTERNAL_SERVICE = {
  GEMINI: 'gemini',
  ELEVENLABS: 'elevenlabs',
  GMAIL: 'gmail',
  OUTLOOK: 'outlook',
  GOOGLE_CALENDAR: 'google_calendar',
};

export const SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

// Known/expected error classes that should be downgraded to LOW (not logged to DB)
const EXPECTED_ERROR_CLASSES = [
  'ValidationError',
  'NotFoundError',
  'UserError',
  'BadRequestError',
  'ZodError',
];

// ============================================================================
// DEDUP SYSTEM
// ============================================================================
// Same error fingerprint within 60 seconds → update existing row instead of creating new one

const dedupeCache = new Map(); // fingerprint → { dbId, timestamp }
const DEDUPE_WINDOW_MS = 60 * 1000;

// Cleanup stale entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of dedupeCache.entries()) {
    if (now - entry.timestamp > DEDUPE_WINDOW_MS * 2) {
      dedupeCache.delete(key);
    }
  }
}, 60000);

/**
 * Generate fingerprint hash for deduplication
 */
function generateFingerprint({ category, source, errorCode, errorName, endpoint, toolName, externalService, message }) {
  const normalized = normalizeForFingerprint(message || '');
  const parts = [
    category || '',
    source || '',
    errorCode || errorName || '',
    endpoint || '',
    toolName || '',
    externalService || '',
    normalized,
  ].join('::');

  return createHash('md5').update(parts).digest('hex');
}

// ============================================================================
// TIMEOUT GUARD
// ============================================================================
// Ensure logError never blocks the request for more than 500ms

function withTimeout(promise, ms = 500) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('ErrorLogger timeout')), ms)
    ),
  ]);
}

// ============================================================================
// CORE: logError()
// ============================================================================

/**
 * Log an application error to the ErrorLog table.
 *
 * @param {Object} params
 * @param {string} params.category - ERROR_CATEGORY enum value (required)
 * @param {string} params.severity - SEVERITY enum value (required)
 * @param {string} params.message - Error message (will be PII-redacted)
 * @param {Error|null} params.error - Original Error object (for stack + name extraction)
 * @param {string} params.errorCode - App-specific error code (GEMINI_TIMEOUT, etc.)
 * @param {string} params.source - Where the error occurred (required)
 * @param {number} params.businessId - Business ID (nullable)
 * @param {number} params.userId - User ID (nullable)
 * @param {string} params.requestId - Request correlation ID
 * @param {string} params.sessionId - Chat session ID
 * @param {string} params.endpoint - API endpoint
 * @param {string} params.method - HTTP method
 * @param {string} params.toolName - Tool name (for tool errors)
 * @param {string} params.externalService - External service name (SSOT enum)
 * @param {number} params.externalStatus - External API HTTP status
 * @param {number} params.responseTimeMs - External call duration
 */
export async function logError({
  category,
  severity,
  message,
  error = null,
  errorCode = null,
  source,
  businessId = null,
  userId = null,
  requestId = null,
  sessionId = null,
  endpoint = null,
  method = null,
  toolName = null,
  externalService = null,
  externalStatus = null,
  responseTimeMs = null,
}) {
  try {
    // ---- Severity gate: LOW → console only, skip DB ----
    const effectiveSeverity = getEffectiveSeverity(severity, error);
    if (effectiveSeverity === SEVERITY.LOW) {
      console.log(`📋 [ErrorLog:skip] ${category}/${source}: ${message || error?.message || 'unknown'} (severity=low, skipped)`);
      return;
    }

    // ---- Sanitize ----
    const rawMessage = message || error?.message || 'Unknown error';
    const sanitizedMessage = redactMessage(rawMessage);
    const sanitizedStack = error?.stack ? redactStackTrace(error.stack) : null;

    // ---- Fingerprint & dedup ----
    const fingerprint = generateFingerprint({
      category,
      source,
      errorCode,
      errorName: error?.name,
      endpoint,
      toolName,
      externalService,
      message: rawMessage,
    });

    const cached = dedupeCache.get(fingerprint);
    if (cached && Date.now() - cached.timestamp < DEDUPE_WINDOW_MS) {
      // Duplicate within window → increment existing row
      try {
        await withTimeout(
          prisma.errorLog.update({
            where: { id: cached.dbId },
            data: {
              occurrenceCount: { increment: 1 },
              lastSeenAt: new Date(),
              latestRequestId: requestId,
            },
          })
        );
        cached.timestamp = Date.now(); // refresh dedup window
        console.log(`📋 [ErrorLog:dedup] ${category}/${source} → count++ (id=${cached.dbId})`);
      } catch (updateErr) {
        // If update fails (e.g., row deleted), fall through to create
        dedupeCache.delete(fingerprint);
      }
      return;
    }

    // ---- Create new error log entry ----
    const entry = await withTimeout(
      prisma.errorLog.create({
        data: {
          category,
          severity: effectiveSeverity,
          errorCode,
          message: sanitizedMessage,
          stackTrace: sanitizedStack,
          businessId: businessId ? parseInt(businessId) : null,
          userId: userId ? parseInt(userId) : null,
          requestId,
          sessionId,
          source,
          endpoint,
          method,
          toolName,
          externalService,
          externalStatus,
          responseTimeMs,
          fingerprint,
          occurrenceCount: 1,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          latestRequestId: requestId,
        },
      })
    );

    // Store in dedup cache
    dedupeCache.set(fingerprint, { dbId: entry.id, timestamp: Date.now() });

    console.log(`📋 [ErrorLog] ${effectiveSeverity.toUpperCase()} ${category}/${source}: ${sanitizedMessage.substring(0, 80)} (id=${entry.id})`);
  } catch (err) {
    // CRITICAL: Never let logging break the request
    console.error('📋 [ErrorLog:FAILED]', err.message);
  }
}

// ============================================================================
// SEVERITY GATING
// ============================================================================

/**
 * Determine effective severity — downgrade known/expected errors to LOW.
 */
function getEffectiveSeverity(severity, error) {
  // If error class is expected → LOW (won't be written to DB)
  if (error && EXPECTED_ERROR_CLASSES.includes(error.name)) {
    return SEVERITY.LOW;
  }
  return severity || SEVERITY.HIGH;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Log a tool execution error
 */
export async function logToolError(toolName, error, context = {}) {
  await logError({
    category: ERROR_CATEGORY.TOOL_FAILURE,
    severity: SEVERITY.HIGH,
    message: error?.message,
    error,
    source: 'tools/index',
    toolName,
    ...context,
  });
}

/**
 * Log a chat processing error
 */
export async function logChatError(error, context = {}) {
  await logError({
    category: ERROR_CATEGORY.CHAT_ERROR,
    severity: SEVERITY.HIGH,
    message: error?.message,
    error,
    source: 'chat-refactored',
    ...context,
  });
}

/**
 * Log an external API error
 */
export async function logApiError(externalService, error, context = {}) {
  await logError({
    category: ERROR_CATEGORY.API_ERROR,
    severity: SEVERITY.HIGH,
    message: error?.message,
    error,
    errorCode: error?.code || null,
    source: context.source || 'external-api',
    externalService,
    externalStatus: error?.response?.status || error?.status || null,
    ...context,
  });
}

/**
 * Log a system/infrastructure error (highest severity)
 */
export async function logSystemError(error, context = {}) {
  await logError({
    category: ERROR_CATEGORY.SYSTEM_ERROR,
    severity: SEVERITY.CRITICAL,
    message: error?.message,
    error,
    source: context.source || 'system',
    ...context,
  });
}

/**
 * Log an assistant CRUD error
 */
export async function logAssistantError(error, context = {}) {
  await logError({
    category: ERROR_CATEGORY.ASSISTANT_ERROR,
    severity: SEVERITY.HIGH,
    message: error?.message,
    error,
    source: 'routes/assistant',
    ...context,
  });
}

export default {
  logError,
  logToolError,
  logChatError,
  logApiError,
  logSystemError,
  logAssistantError,
  ERROR_CATEGORY,
  EXTERNAL_SERVICE,
  SEVERITY,
};
