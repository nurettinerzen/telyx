/**
 * Metrics API
 *
 * Endpoints for monitoring production health:
 * - Tool execution metrics
 * - Shadow mode comparison
 * - Idempotency stats
 * - Classifier health
 *
 * SECURITY: Protected by admin session auth (or internal IP allowlist)
 */

import express from 'express';
import { getDashboardMetrics } from '../services/routing-metrics.js';
import { getShadowModeStats } from '../utils/shadow-mode.js';
import { getIdempotencyStats } from '../services/tool-idempotency.js';
import { authenticateToken } from '../middleware/auth.js';
import { isAdmin } from '../middleware/adminAuth.js';

const router = express.Router();

// IP allowlist for metrics access (localhost + internal IPs)
const ALLOWED_IPS = [
  '127.0.0.1',
  '::1',
  'localhost',
  // Add internal IPs here (e.g., Render internal network)
];

/**
 * Authentication middleware for metrics endpoints
 *
 * Allows access if:
 * - Request comes from allowed IP (localhost, internal)
 * - Request has authenticated admin session (cookie/Bearer)
 * - METRICS_AUTH_DISABLED=true (for local dev only)
 */
function metricsAuth(req, res, next) {
  // Option 1: Skip auth in dev (explicit flag required)
  if (process.env.METRICS_AUTH_DISABLED === 'true') {
    return next();
  }

  // Option 2: Request from allowed IP
  const clientIp = req.ip || req.connection.remoteAddress || '';
  const normalizedIp = clientIp.replace('::ffff:', ''); // IPv4-mapped IPv6

  if (ALLOWED_IPS.includes(normalizedIp)) {
    return next();
  }

  // Option 3: Authenticated admin session (cookie/Bearer)
  return authenticateToken(req, res, () => {
    return isAdmin(req, res, next);
  });
}

// Apply auth to all metrics routes
router.use(metricsAuth);

/**
 * Mask PII in metrics data
 * - Phone numbers: 905xxxxxxxx -> 905***xxx
 * - Names: removed or truncated
 * - Order numbers: xxxxx
 */
function maskPII(obj) {
  if (!obj) return obj;
  if (typeof obj !== 'object') return obj;

  const masked = Array.isArray(obj) ? [] : {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();

    // Mask phone numbers
    if (lowerKey.includes('phone') || lowerKey.includes('from') || lowerKey.includes('to')) {
      if (typeof value === 'string' && /^\d{10,15}$/.test(value)) {
        masked[key] = value.slice(0, 3) + '***' + value.slice(-3);
        continue;
      }
    }

    // Mask names
    if (lowerKey.includes('name') || lowerKey.includes('customer')) {
      if (typeof value === 'string') {
        masked[key] = value.length > 2 ? value[0] + '***' : '***';
        continue;
      }
    }

    // Mask order/ticket numbers
    if (lowerKey.includes('order') || lowerKey.includes('ticket') || lowerKey.includes('number')) {
      if (typeof value === 'string') {
        masked[key] = '***' + value.slice(-3);
        continue;
      }
    }

    // Recurse for nested objects/arrays
    if (typeof value === 'object' && value !== null) {
      masked[key] = maskPII(value);
    } else {
      masked[key] = value;
    }
  }

  return masked;
}

/**
 * GET /api/metrics/dashboard
 *
 * Comprehensive dashboard metrics
 */
router.get('/dashboard', async (req, res) => {
  try {
    const metrics = getDashboardMetrics();

    // Mask PII unless explicitly requested by authenticated admin
    // SECURITY: raw=true requires admin auth, IP-only access always gets masked data
    const isAuthenticatedAdmin = !!(req.user && req.user.role === 'ADMIN');
    const shouldMask = !(req.query.raw === 'true' && isAuthenticatedAdmin);
    const safeMetrics = shouldMask ? maskPII(metrics) : metrics;

    res.json({
      success: true,
      metrics: safeMetrics,
      masked: shouldMask,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Dashboard metrics error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/metrics/shadow-mode
 *
 * Shadow mode comparison statistics
 * (Only available when shadow mode is running)
 */
router.get('/shadow-mode', async (req, res) => {
  try {
    const stats = getShadowModeStats();

    if (stats.totalRuns === 0) {
      return res.json({
        success: true,
        message: 'No shadow mode data yet. Enable with FEATURE_WHATSAPP_SHADOW_MODE=true',
        stats
      });
    }

    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Shadow mode metrics error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/metrics/idempotency
 *
 * Tool idempotency cache statistics
 */
router.get('/idempotency', async (req, res) => {
  try {
    const stats = getIdempotencyStats();

    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Idempotency metrics error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/metrics/health
 *
 * Quick health check
 */
router.get('/health', async (req, res) => {
  try {
    const dashboardMetrics = getDashboardMetrics();

    const health = {
      status: 'healthy',
      checks: {
        toolFailRate: {
          value: dashboardMetrics.tools?.overallFailRate || 0,
          threshold: 0.05, // 5%
          healthy: (dashboardMetrics.tools?.overallFailRate || 0) < 0.05
        },
        classifierTimeout: {
          value: dashboardMetrics.violations?.filter(v => v.type === 'CLASSIFIER_TIMEOUT').length || 0,
          threshold: 10,
          healthy: (dashboardMetrics.violations?.filter(v => v.type === 'CLASSIFIER_TIMEOUT').length || 0) < 10
        },
        blockedClaims: {
          value: dashboardMetrics.blockedClaims?.blockedClaimCount || 0,
          threshold: 100,
          healthy: true // Blocked claims are GOOD (protection working)
        }
      }
    };

    // Overall health
    const allHealthy = Object.values(health.checks).every(check => check.healthy);
    health.status = allHealthy ? 'healthy' : 'degraded';

    res.json({
      success: true,
      health,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Health check error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      health: {
        status: 'error'
      }
    });
  }
});

export default router;
