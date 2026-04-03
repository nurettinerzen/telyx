// ============================================================================
// WEBHOOK INTEGRATION ROUTES
// ============================================================================
// FILE: backend/src/routes/webhook.js
//
// Handles Zapier/Make.com webhook configuration and incoming webhooks
// Note: /incoming endpoint has NO AUTH - validated by secret
// ============================================================================

import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';
import webhookService from '../services/webhook.js';
import { webhookRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// ============================================================================
// PUBLIC ROUTES (NO AUTH) - Incoming webhooks
// ============================================================================

/**
 * POST /api/webhook/incoming/:businessId
 * Receive incoming webhook data (NO AUTH - secret validates request)
 */
router.post('/incoming/:businessId', webhookRateLimiter.middleware(), async (req, res) => {
  try {
    const { businessId } = req.params;
    const payload = req.body;
    const webhookSecret = req.headers['x-webhook-secret'];

    console.log(`📥 Incoming webhook for business ${businessId}`);

    // Validate request
    const validation = await webhookService.validateWebhookRequest(businessId, webhookSecret);

    if (!validation.valid) {
      console.warn(`⚠️ Invalid webhook request: ${validation.error}`);
      return res.status(401).json({
        error: 'Unauthorized',
        message: validation.error
      });
    }

    // Process the webhook
    const result = await webhookService.processWebhook(parseInt(businessId), payload);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      message: 'Webhook processed successfully',
      ...result
    });

  } catch (error) {
    console.error('❌ Incoming webhook error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process webhook'
    });
  }
});

// ============================================================================
// PROTECTED ROUTES (REQUIRE AUTH) - Configuration
// ============================================================================

// Apply auth to remaining routes
router.use(authenticateToken);

/**
 * POST /api/webhook/setup
 * Setup/activate webhook for a business
 */
router.post('/setup', async (req, res) => {
  try {
    const config = await webhookService.createWebhookConfig(req.businessId);
    const webhookUrl = await webhookService.getWebhookUrl(req.businessId);

    // Also create/update Zapier integration record
    await prisma.integration.upsert({
      where: {
        businessId_type: {
          businessId: req.businessId,
          type: 'ZAPIER'
        }
      },
      update: {
        credentials: {
          webhookUrl,
          webhookSecret: config.webhookSecret
        },
        connected: true,
        isActive: true
      },
      create: {
        businessId: req.businessId,
        type: 'ZAPIER',
        credentials: {
          webhookUrl,
          webhookSecret: config.webhookSecret
        },
        connected: true,
        isActive: true
      }
    });

    console.log(`✅ Webhook setup for business ${req.businessId}`);

    res.json({
      success: true,
      message: 'Webhook activated successfully',
      webhookUrl,
      authHeader: 'X-Webhook-Secret',
      secret: config.webhookSecret,
      isActive: config.isActive
    });

  } catch (error) {
    console.error('❌ Webhook setup error:', error);
    res.status(500).json({
      error: 'Failed to setup webhook'
    });
  }
});

/**
 * GET /api/webhook/config
 * Get webhook configuration
 */
router.get('/config', async (req, res) => {
  try {
    const config = await prisma.webhookConfig.findUnique({
      where: { businessId: req.businessId }
    });

    if (!config) {
      return res.json({
        configured: false,
        webhookUrl: null,
        isActive: false
      });
    }

    const webhookUrl = await webhookService.getWebhookUrl(req.businessId);

    res.json({
      configured: true,
      webhookUrl,
      authHeader: 'X-Webhook-Secret',
      secret: config.webhookSecret,
      isActive: config.isActive,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt
    });

  } catch (error) {
    console.error('❌ Get webhook config error:', error);
    res.status(500).json({
      error: 'Failed to get configuration'
    });
  }
});

/**
 * POST /api/webhook/regenerate
 * Regenerate webhook secret
 */
router.post('/regenerate', async (req, res) => {
  try {
    const config = await webhookService.regenerateSecret(req.businessId);
    const webhookUrl = await webhookService.getWebhookUrl(req.businessId);

    // Update integration record
    await prisma.integration.updateMany({
      where: {
        businessId: req.businessId,
        type: 'ZAPIER'
      },
      data: {
        credentials: {
          webhookUrl,
          webhookSecret: config.webhookSecret
        }
      }
    });

    console.log(`✅ Webhook secret regenerated for business ${req.businessId}`);

    res.json({
      success: true,
      message: 'Webhook secret regenerated',
      webhookUrl,
      authHeader: 'X-Webhook-Secret',
      secret: config.webhookSecret
    });

  } catch (error) {
    console.error('❌ Regenerate secret error:', error);
    res.status(500).json({
      error: 'Failed to regenerate secret'
    });
  }
});

/**
 * POST /api/webhook/disable
 * Disable webhook
 */
router.post('/disable', async (req, res) => {
  try {
    await prisma.webhookConfig.updateMany({
      where: { businessId: req.businessId },
      data: { isActive: false }
    });

    // Update integration record
    await prisma.integration.updateMany({
      where: {
        businessId: req.businessId,
        type: 'ZAPIER'
      },
      data: {
        isActive: false,
        connected: false
      }
    });

    console.log(`✅ Webhook disabled for business ${req.businessId}`);

    res.json({
      success: true,
      message: 'Webhook disabled'
    });

  } catch (error) {
    console.error('❌ Disable webhook error:', error);
    res.status(500).json({
      error: 'Failed to disable webhook'
    });
  }
});

/**
 * GET /api/webhook/logs
 * Get recent webhook logs
 */
router.get('/logs', async (req, res) => {
  try {
    const { limit } = req.query;
    const result = await webhookService.getWebhookLogs(req.businessId, parseInt(limit) || 20);

    res.json(result);

  } catch (error) {
    console.error('❌ Get webhook logs error:', error);
    res.status(500).json({
      error: 'Failed to get logs'
    });
  }
});

/**
 * GET /api/webhook/orders
 * Get orders received via webhook
 */
router.get('/orders', async (req, res) => {
  try {
    const { limit } = req.query;

    const orders = await prisma.webhookOrder.findMany({
      where: { businessId: req.businessId },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit) || 50
    });

    res.json({
      success: true,
      orders,
      count: orders.length
    });

  } catch (error) {
    console.error('❌ Get webhook orders error:', error);
    res.status(500).json({
      error: 'Failed to get orders'
    });
  }
});

/**
 * GET /api/webhook/orders/:externalId
 * Get specific order by external ID
 */
router.get('/orders/:externalId', async (req, res) => {
  try {
    const { externalId } = req.params;
    const result = await webhookService.getOrderByExternalId(req.businessId, externalId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('❌ Get webhook order error:', error);
    res.status(500).json({
      error: 'Failed to get order'
    });
  }
});

/**
 * GET /api/webhook/inventory
 * Get inventory data received via webhook
 */
router.get('/inventory', async (req, res) => {
  try {
    const { limit } = req.query;

    const inventory = await prisma.webhookInventory.findMany({
      where: { businessId: req.businessId },
      orderBy: { updatedAt: 'desc' },
      take: parseInt(limit) || 50
    });

    res.json({
      success: true,
      inventory,
      count: inventory.length
    });

  } catch (error) {
    console.error('❌ Get webhook inventory error:', error);
    res.status(500).json({
      error: 'Failed to get inventory'
    });
  }
});

/**
 * GET /api/webhook/status
 * Get webhook integration status
 */
router.get('/status', async (req, res) => {
  try {
    const config = await prisma.webhookConfig.findUnique({
      where: { businessId: req.businessId }
    });

    const integration = await prisma.integration.findFirst({
      where: {
        businessId: req.businessId,
        type: 'ZAPIER'
      }
    });

    // Get recent activity stats
    const recentLogs = await prisma.webhookLog.count({
      where: {
        businessId: req.businessId,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      }
    });

    const ordersCount = await prisma.webhookOrder.count({
      where: { businessId: req.businessId }
    });

    res.json({
      configured: !!config,
      connected: integration?.connected || false,
      isActive: config?.isActive || false,
      stats: {
        recentWebhooks: recentLogs,
        totalOrders: ordersCount
      }
    });

  } catch (error) {
    console.error('❌ Get webhook status error:', error);
    res.status(500).json({
      error: 'Failed to get status'
    });
  }
});

export default router;
