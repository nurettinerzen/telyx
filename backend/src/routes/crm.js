/**
 * CRM Management API Routes
 * Authenticated endpoints for managing CRM webhook and viewing CRM data
 *
 * Available only for PRO and ENTERPRISE plans
 */

import express from 'express';
import crypto from 'crypto';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';
import { hasProFeatures } from '../config/plans.js';

const router = express.Router();

const CRM_PLAN_CHECK_SUBSCRIPTION_SELECT = {
  id: true,
  businessId: true,
  plan: true,
  status: true
};

// All routes require authentication
router.use(authenticateToken);

/**
 * Check if user's plan allows CRM integration
 */
async function checkPlanAccess(businessId) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      subscription: {
        select: CRM_PLAN_CHECK_SUBSCRIPTION_SELECT
      }
    }
  });

  if (!business) {
    return { allowed: false, error: 'Business not found', status: 404 };
  }

  const currentPlan = business.subscription?.plan || 'FREE';

  if (!hasProFeatures(currentPlan)) {
    return {
      allowed: false,
      error: 'upgrade_required',
      message: 'Bu özellik Pro ve Kurumsal paketlerde kullanılabilir.',
      currentPlan: currentPlan,
      status: 403
    };
  }

  return { allowed: true, business };
}

/**
 * Get webhook info and stats
 * GET /api/crm/webhook
 */
router.get('/webhook', async (req, res) => {
  try {
    const businessId = req.businessId;

    // Check plan access
    const access = await checkPlanAccess(businessId);
    if (!access.allowed) {
      return res.status(access.status).json({
        error: access.error,
        message: access.message,
        currentPlan: access.currentPlan
      });
    }

    // Get or create webhook config
    let webhook = await prisma.crmWebhook.findUnique({
      where: { businessId }
    });

    if (!webhook) {
      webhook = await prisma.crmWebhook.create({
        data: { businessId }
      });
    }

    // Get statistics
    const [orderCount, stockCount, ticketCount] = await Promise.all([
      prisma.crmOrder.count({ where: { businessId } }),
      prisma.crmStock.count({ where: { businessId } }),
      prisma.crmTicket.count({ where: { businessId } })
    ]);

    // Get last updates
    const [lastOrder, lastStock, lastTicket] = await Promise.all([
      prisma.crmOrder.findFirst({
        where: { businessId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true }
      }),
      prisma.crmStock.findFirst({
        where: { businessId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true }
      }),
      prisma.crmTicket.findFirst({
        where: { businessId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true }
      })
    ]);

    const apiUrl = process.env.BACKEND_URL;

    res.json({
      webhook: {
        businessId: businessId,
        webhookSecret: webhook.webhookSecret,
        isActive: webhook.isActive,
        lastDataAt: webhook.lastDataAt,
        authHeader: 'X-Webhook-Secret',
        url: `${apiUrl}/api/webhook/crm/${businessId}/${webhook.webhookSecret}`
      },
      stats: {
        orders: { count: orderCount, lastUpdate: lastOrder?.updatedAt },
        stock: { count: stockCount, lastUpdate: lastStock?.updatedAt },
        tickets: { count: ticketCount, lastUpdate: lastTicket?.updatedAt }
      }
    });

  } catch (error) {
    console.error('CRM webhook get error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Regenerate webhook secret
 * POST /api/crm/webhook/regenerate
 */
router.post('/webhook/regenerate', async (req, res) => {
  try {
    const businessId = req.businessId;

    // Check plan access
    const access = await checkPlanAccess(businessId);
    if (!access.allowed) {
      return res.status(access.status).json({ error: access.error });
    }

    const newSecret = crypto.randomUUID();

    const webhook = await prisma.crmWebhook.update({
      where: { businessId },
      data: { webhookSecret: newSecret }
    });

    const apiUrl = process.env.BACKEND_URL;

    res.json({
      webhookSecret: webhook.webhookSecret,
      authHeader: 'X-Webhook-Secret',
      url: `${apiUrl}/api/webhook/crm/${businessId}/${webhook.webhookSecret}`
    });

  } catch (error) {
    console.error('CRM webhook regenerate error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Toggle webhook active state
 * PATCH /api/crm/webhook/toggle
 */
router.patch('/webhook/toggle', async (req, res) => {
  try {
    const businessId = req.businessId;

    // Check plan access
    const access = await checkPlanAccess(businessId);
    if (!access.allowed) {
      return res.status(access.status).json({ error: access.error });
    }

    const webhook = await prisma.crmWebhook.findUnique({
      where: { businessId }
    });

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not configured' });
    }

    const updated = await prisma.crmWebhook.update({
      where: { businessId },
      data: { isActive: !webhook.isActive }
    });

    res.json({ isActive: updated.isActive });

  } catch (error) {
    console.error('CRM webhook toggle error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Delete CRM data by type
 * DELETE /api/crm/data/:type
 */
router.delete('/data/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const businessId = req.businessId;

    // Check plan access
    const access = await checkPlanAccess(businessId);
    if (!access.allowed) {
      return res.status(access.status).json({ error: access.error });
    }

    let deleted = 0;

    switch (type) {
      case 'orders':
        const orderResult = await prisma.crmOrder.deleteMany({
          where: { businessId }
        });
        deleted = orderResult.count;
        break;
      case 'stock':
        const stockResult = await prisma.crmStock.deleteMany({
          where: { businessId }
        });
        deleted = stockResult.count;
        break;
      case 'tickets':
        const ticketResult = await prisma.crmTicket.deleteMany({
          where: { businessId }
        });
        deleted = ticketResult.count;
        break;
      case 'all':
        const [o, s, t] = await Promise.all([
          prisma.crmOrder.deleteMany({ where: { businessId } }),
          prisma.crmStock.deleteMany({ where: { businessId } }),
          prisma.crmTicket.deleteMany({ where: { businessId } })
        ]);
        deleted = o.count + s.count + t.count;
        break;
      default:
        return res.status(400).json({ error: 'Invalid type. Use: orders, stock, tickets, or all' });
    }

    res.json({ deleted });

  } catch (error) {
    console.error('CRM data delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get CRM orders list
 * GET /api/crm/orders
 */
router.get('/orders', async (req, res) => {
  try {
    const businessId = req.businessId;
    const { limit = 50, offset = 0 } = req.query;

    const orders = await prisma.crmOrder.findMany({
      where: { businessId },
      orderBy: { updatedAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset)
    });

    const total = await prisma.crmOrder.count({ where: { businessId } });

    res.json({ orders, total });

  } catch (error) {
    console.error('CRM orders get error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get CRM stock list
 * GET /api/crm/stock
 */
router.get('/stock', async (req, res) => {
  try {
    const businessId = req.businessId;
    const { limit = 50, offset = 0 } = req.query;

    const stock = await prisma.crmStock.findMany({
      where: { businessId },
      orderBy: { updatedAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset)
    });

    const total = await prisma.crmStock.count({ where: { businessId } });

    res.json({ stock, total });

  } catch (error) {
    console.error('CRM stock get error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get CRM tickets list
 * GET /api/crm/tickets
 */
router.get('/tickets', async (req, res) => {
  try {
    const businessId = req.businessId;
    const { limit = 50, offset = 0 } = req.query;

    const tickets = await prisma.crmTicket.findMany({
      where: { businessId },
      orderBy: { updatedAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset)
    });

    const total = await prisma.crmTicket.count({ where: { businessId } });

    res.json({ tickets, total });

  } catch (error) {
    console.error('CRM tickets get error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
