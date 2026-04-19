// ============================================================================
// USAGE API ROUTES - Kullanım Takibi
// ============================================================================
// FILE: backend/src/routes/usage.js
//
// Endpoints:
// GET  /api/usage - Kullanım kayıtları
// GET  /api/usage/stats - Özet istatistikler
// GET  /api/usage/can-make-call - Arama yapılabilir mi
// ============================================================================

import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';
import usageService from '../services/usageService.js';
import subscriptionService from '../services/subscriptionService.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// ============================================================================
// GET /api/usage - Kullanım kayıtları
// ============================================================================
router.get('/', async (req, res) => {
  try {
    const { businessId } = req.user;
    const {
      limit = 20,
      offset = 0,
      channel,
      chargeType,
      startDate,
      endDate
    } = req.query;

    const subscription = await prisma.subscription.findUnique({
      where: { businessId }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Abonelik bulunamadı' });
    }

    const result = await usageService.getUsageRecords(subscription.id, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      channel,
      chargeType,
      startDate,
      endDate
    });

    res.json({
      records: result.records,
      total: result.total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('❌ Get usage records error:', error);
    res.status(500).json({ error: error.message || 'Kullanım kayıtları alınamadı' });
  }
});

// ============================================================================
// GET /api/usage/stats - Özet istatistikler
// ============================================================================
router.get('/stats', async (req, res) => {
  try {
    const { businessId } = req.user;
    const { period = 'month' } = req.query;

    const subscription = await prisma.subscription.findUnique({
      where: { businessId }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Abonelik bulunamadı' });
    }

    // Calculate date range based on period
    let startDate = null;
    const endDate = new Date();

    switch (period) {
      case 'today':
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'all':
        startDate = null;
        break;
      default:
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
    }

    const stats = await usageService.getUsageStats(subscription.id, startDate, endDate);

    res.json({
      period,
      startDate,
      endDate,
      ...stats
    });

  } catch (error) {
    console.error('❌ Get usage stats error:', error);
    res.status(500).json({ error: error.message || 'Kullanım istatistikleri alınamadı' });
  }
});

// ============================================================================
// GET /api/usage/can-make-call - Arama yapılabilir mi
// ============================================================================
router.get('/can-make-call', async (req, res) => {
  try {
    const { businessId } = req.user;

    const result = await subscriptionService.canMakeCall(businessId);

    // Map reasons to user-friendly messages
    const reasonMessages = {
      NO_SUBSCRIPTION: 'Aktif abonelik bulunamadı',
      SUBSCRIPTION_INACTIVE: 'Abonelik aktif değil',
      FREE_PLAN: 'Ücretsiz planda arama yapılamaz',
      TRIAL_EXPIRED: 'Deneme süreniz doldu',
      INSUFFICIENT_BALANCE: 'Yetersiz bakiye',
      CONCURRENT_LIMIT_REACHED: 'Eş zamanlı arama limitine ulaşıldı',
      TRIAL_ACTIVE: 'Deneme aktif',
      BALANCE_AVAILABLE: 'Bakiye mevcut',
      INCLUDED_MINUTES_AVAILABLE: 'Dahil dakika mevcut',
      OVERAGE_AVAILABLE: 'Aşım bakiyesi mevcut',
      VOICE_ADDON_AVAILABLE: 'Ek ses paketi mevcut',
      OVERAGE_POSTPAID: 'Aşım kullanımı aktif',
      OVERAGE_LIMIT_REACHED: 'Ses aşım limitine ulaşıldı'
    };

    res.json({
      canMakeCall: result.canMakeCall,
      reason: result.reason,
      message: reasonMessages[result.reason] || result.reason,
      details: result.details || result
    });

  } catch (error) {
    console.error('❌ Can make call check error:', error);
    res.status(500).json({ error: error.message || 'Arama kontrolü yapılamadı' });
  }
});

// ============================================================================
// GET /api/usage/summary - Hızlı özet (dashboard için)
// ============================================================================
router.get('/summary', async (req, res) => {
  try {
    const { businessId } = req.user;

    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      include: {
        business: {
          select: { country: true }
        }
      }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Abonelik bulunamadı' });
    }

    // Get subscription details
    const details = await subscriptionService.getSubscriptionDetails(businessId);

    // Get this month's stats
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const stats = await usageService.getUsageStats(subscription.id, startOfMonth, new Date());

    res.json({
      plan: details.plan,
      status: details.status,
      balance: {
        tl: details.balance,
        minutes: details.balanceMinutes,
        pricePerMinute: details.pricePerMinute
      },
      includedMinutes: {
        total: details.includedMinutes,
        used: details.includedMinutesUsed,
        remaining: details.includedMinutesRemaining,
        resetAt: details.includedMinutesResetAt
      },
      trial: details.plan === 'TRIAL' ? {
        minutesUsed: details.trialMinutesUsed,
        minutesRemaining: details.trialMinutesRemaining,
        chatExpiry: details.trialChatExpiry,
        chatDaysRemaining: details.trialChatDaysRemaining
      } : null,
      autoReload: {
        enabled: details.autoReloadEnabled,
        threshold: details.autoReloadThreshold,
        amount: details.autoReloadAmount
      },
      thisMonth: {
        totalMinutes: stats.totalMinutes,
        totalCharge: stats.totalCharge,
        recordCount: stats.recordCount,
        byChannel: stats.byChannel
      }
    });

  } catch (error) {
    console.error('❌ Get usage summary error:', error);
    res.status(500).json({ error: error.message || 'Kullanım özeti alınamadı' });
  }
});

export default router;
