/**
 * Safe Test Endpoints for Production Validation
 *
 * SECURITY:
 * - Admin-only access (AdminUser table + MFA)
 * - SAFE_TEST_MODE=true required in env
 * - Does NOT modify real data
 * - Only triggers SecurityEvent logging
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { isAdmin, requireAdminMfa } from '../middleware/adminAuth.js';
import { logSecurityEvent, EVENT_TYPE, SEVERITY } from '../middleware/securityEventLogger.js';
import prisma from '../prismaClient.js';

const router = express.Router();

const SAFE_TEST_MODE = process.env.SAFE_TEST_MODE === 'true';

// Safe mode check
const requireSafeMode = (req, res, next) => {
  if (!SAFE_TEST_MODE) {
    return res.status(403).json({
      error: 'SAFE_TEST_MODE=true required in environment',
      hint: 'Add SAFE_TEST_MODE=true to .env to enable test endpoints'
    });
  }
  next();
};

// Apply middleware to all routes
router.use(authenticateToken);
router.use(isAdmin);
router.use(requireAdminMfa);
router.use(requireSafeMode);

/**
 * POST /api/safe-test/auth-failure
 * Triggers AUTH_FAILURE event (simulates invalid credentials)
 */
router.post('/auth-failure', async (req, res) => {
  try {
    const beforeCount = await prisma.securityEvent.count({
      where: {
        type: EVENT_TYPE.AUTH_FAILURE,
        businessId: req.businessId,
      },
    });

    await logSecurityEvent({
      type: EVENT_TYPE.AUTH_FAILURE,
      severity: SEVERITY.HIGH,
      businessId: req.businessId,
      userId: req.userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      endpoint: '/api/safe-test/auth-failure',
      method: 'POST',
      statusCode: 401,
      details: {
        test: true,
        trigger: 'safe-test-endpoint',
        reason: 'Simulated invalid credentials',
        timestamp: new Date().toISOString(),
      },
    });

    const afterCount = await prisma.securityEvent.count({
      where: {
        type: EVENT_TYPE.AUTH_FAILURE,
        businessId: req.businessId,
      },
    });

    res.json({
      success: true,
      event: 'AUTH_FAILURE',
      severity: 'high',
      delta: {
        before: beforeCount,
        after: afterCount,
        increased: afterCount > beforeCount,
      },
      timestamp: new Date().toISOString(),
      message: 'AUTH_FAILURE event logged successfully',
    });
  } catch (error) {
    console.error('Safe test auth-failure error:', error);
    res.status(500).json({ error: 'Failed to log event' });
  }
});

/**
 * POST /api/safe-test/webhook-invalid-signature
 * Triggers WEBHOOK_INVALID_SIGNATURE event
 */
router.post('/webhook-invalid-signature', async (req, res) => {
  try {
    const beforeCount = await prisma.securityEvent.count({
      where: {
        type: EVENT_TYPE.WEBHOOK_INVALID_SIGNATURE,
        businessId: req.businessId,
      },
    });

    await logSecurityEvent({
      type: EVENT_TYPE.WEBHOOK_INVALID_SIGNATURE,
      severity: SEVERITY.HIGH,
      businessId: req.businessId,
      userId: req.userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      endpoint: '/api/safe-test/webhook-invalid-signature',
      method: 'POST',
      statusCode: 401,
      details: {
        test: true,
        trigger: 'safe-test-endpoint',
        channel: 'test-webhook',
        providedSignature: 'sha256=invalid_test_signature',
        expectedSignature: 'sha256=valid_expected_signature',
        timestamp: new Date().toISOString(),
      },
    });

    const afterCount = await prisma.securityEvent.count({
      where: {
        type: EVENT_TYPE.WEBHOOK_INVALID_SIGNATURE,
        businessId: req.businessId,
      },
    });

    res.json({
      success: true,
      event: 'WEBHOOK_INVALID_SIGNATURE',
      severity: 'high',
      delta: {
        before: beforeCount,
        after: afterCount,
        increased: afterCount > beforeCount,
      },
      timestamp: new Date().toISOString(),
      message: 'WEBHOOK_INVALID_SIGNATURE event logged successfully',
    });
  } catch (error) {
    console.error('Safe test webhook error:', error);
    res.status(500).json({ error: 'Failed to log event' });
  }
});

/**
 * POST /api/safe-test/ssrf-block
 * Triggers SSRF_BLOCK event
 */
router.post('/ssrf-block', async (req, res) => {
  try {
    const beforeCount = await prisma.securityEvent.count({
      where: {
        type: EVENT_TYPE.SSRF_BLOCK,
        businessId: req.businessId,
      },
    });

    await logSecurityEvent({
      type: EVENT_TYPE.SSRF_BLOCK,
      severity: SEVERITY.CRITICAL,
      businessId: req.businessId,
      userId: req.userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      endpoint: '/api/safe-test/ssrf-block',
      method: 'POST',
      statusCode: 403,
      details: {
        test: true,
        trigger: 'safe-test-endpoint',
        blockedUrl: 'http://169.254.169.254/latest/meta-data/',
        reason: 'AWS metadata endpoint blocked (SSRF attempt)',
        timestamp: new Date().toISOString(),
      },
    });

    const afterCount = await prisma.securityEvent.count({
      where: {
        type: EVENT_TYPE.SSRF_BLOCK,
        businessId: req.businessId,
      },
    });

    res.json({
      success: true,
      event: 'SSRF_BLOCK',
      severity: 'critical',
      delta: {
        before: beforeCount,
        after: afterCount,
        increased: afterCount > beforeCount,
      },
      timestamp: new Date().toISOString(),
      message: 'SSRF_BLOCK event logged successfully',
    });
  } catch (error) {
    console.error('Safe test SSRF error:', error);
    res.status(500).json({ error: 'Failed to log event' });
  }
});

/**
 * GET /api/safe-test/verify
 * Verifies safe test mode is enabled and returns current event counts
 */
router.get('/verify', async (req, res) => {
  try {
    const counts = await Promise.all([
      prisma.securityEvent.count({
        where: { type: EVENT_TYPE.AUTH_FAILURE, businessId: req.businessId },
      }),
      prisma.securityEvent.count({
        where: { type: EVENT_TYPE.WEBHOOK_INVALID_SIGNATURE, businessId: req.businessId },
      }),
      prisma.securityEvent.count({
        where: { type: EVENT_TYPE.SSRF_BLOCK, businessId: req.businessId },
      }),
    ]);

    res.json({
      safeTestMode: SAFE_TEST_MODE,
      adminEmail: req.userEmail,
      businessId: req.businessId,
      currentCounts: {
        auth_failure: counts[0],
        webhook_invalid_signature: counts[1],
        ssrf_block: counts[2],
      },
      availableTests: [
        'POST /api/safe-test/auth-failure',
        'POST /api/safe-test/webhook-invalid-signature',
        'POST /api/safe-test/ssrf-block',
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Safe test verify error:', error);
    res.status(500).json({ error: 'Failed to verify' });
  }
});

export default router;
