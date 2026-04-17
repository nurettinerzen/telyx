// ============================================================================
// CREDITS API - KREDİ SATIN ALMA VE BAKIYE YÖNETİMİ
// ============================================================================
// FILE: backend/src/routes/credits.js
//
// Handles credit purchases, balance inquiries, and purchase history
// ============================================================================

import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';
import { calculateCreditPrice, getRegionalPricing } from '../config/plans.js';

const router = express.Router();

const CREDITS_SUBSCRIPTION_SELECT = {
  id: true,
  businessId: true,
  plan: true,
  currentPeriodEnd: true,
  minutesLimit: true,
  minutesUsed: true,
  creditMinutes: true,
  creditMinutesUsed: true,
  overageMinutes: true,
  overageRate: true,
  overageLimit: true,
  overageLimitReached: true,
  packageWarningAt80: true,
  creditWarningAt80: true,
  business: {
    select: { country: true }
  }
};

// All routes require authentication
router.use(authenticateToken);

// ============================================================================
// GET /api/credits/balance - Bakiye sorgula
// ============================================================================
router.get('/balance', async (req, res) => {
  try {
    const businessId = req.businessId;

    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      select: CREDITS_SUBSCRIPTION_SELECT
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // Get plan config for correct minutes limit
    const country = subscription.business?.country || 'TR';
    const regionalPricing = getRegionalPricing(country);
    const planPricing = regionalPricing.plans[subscription.plan];

    // Use plan config minutes if available, otherwise fall back to DB value
    // For legacy plans (BASIC, PROFESSIONAL), use their configured values
    const configMinutesLimit = planPricing?.minutes ?? subscription.minutesLimit;

    // Calculate remaining values using config-based limit
    const packageRemaining = Math.max(0, configMinutesLimit - subscription.minutesUsed);
    const creditRemaining = Math.max(0, subscription.creditMinutes - subscription.creditMinutesUsed);

    res.json({
      package: {
        limit: configMinutesLimit,
        used: subscription.minutesUsed,
        remaining: packageRemaining,
        percentage: configMinutesLimit > 0
          ? Math.round((subscription.minutesUsed / configMinutesLimit) * 100)
          : 0
      },
      credit: {
        total: subscription.creditMinutes,
        used: subscription.creditMinutesUsed,
        remaining: creditRemaining,
        percentage: subscription.creditMinutes > 0
          ? Math.round((subscription.creditMinutesUsed / subscription.creditMinutes) * 100)
          : 0
      },
      overage: {
        minutes: subscription.overageMinutes,
        rate: subscription.overageRate,
        amount: subscription.overageMinutes * subscription.overageRate,
        limit: subscription.overageLimit,
        limitReached: subscription.overageLimitReached
      },
      warnings: {
        packageAt80: subscription.packageWarningAt80,
        creditAt80: subscription.creditWarningAt80
      },
      plan: subscription.plan,
      periodEnd: subscription.currentPeriodEnd
    });
  } catch (error) {
    console.error('❌ Get balance error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// POST /api/credits/calculate - Fiyat hesapla
// ============================================================================
router.post('/calculate', async (req, res) => {
  try {
    const { minutes } = req.body;

    if (!minutes || minutes < 1) {
      return res.status(400).json({ error: 'Geçersiz dakika miktarı' });
    }

    const calculation = calculateCreditPrice(minutes);

    res.json(calculation);
  } catch (error) {
    console.error('❌ Calculate error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// GET /api/credits/pricing - Fiyatlandırma tablosu
// ============================================================================
router.get('/pricing', async (req, res) => {
  try {
    res.json({
      // Tek fiyat: 7₺/dk
      unitPrice: 7.00,
      currency: 'TRY',
      note: 'İstediğiniz kadar dakika alabilirsiniz.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// POST /api/credits/purchase - Kredi satın al
// ============================================================================
router.post('/purchase', async (req, res) => {
  return res.status(410).json({
    error: 'LEGACY_CREDITS_DISABLED',
    message: 'Legacy credit purchases are disabled. Use Stripe wallet top-up on the PAYG plan instead.',
    upgradePath: '/api/balance/topup'
  });
});

// ============================================================================
// GET /api/credits/history - Satın alma geçmişi
// ============================================================================
router.get('/history', async (req, res) => {
  try {
    const businessId = req.businessId;
    const { limit = 20, offset = 0 } = req.query;

    const [purchases, total] = await Promise.all([
      prisma.creditPurchase.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset)
      }),
      prisma.creditPurchase.count({
        where: { businessId }
      })
    ]);

    res.json({
      purchases,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + purchases.length < total
      }
    });
  } catch (error) {
    console.error('❌ Get history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// GET /api/credits/usage-logs - Kullanım logları
// ============================================================================
router.get('/usage-logs', async (req, res) => {
  try {
    const businessId = req.businessId;
    const { limit = 50, offset = 0, type } = req.query;

    const where = { businessId };
    if (type) {
      where.type = type;
    }

    const [logs, total] = await Promise.all([
      prisma.usageLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset)
      }),
      prisma.usageLog.count({ where })
    ]);

    res.json({
      logs,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + logs.length < total
      }
    });
  } catch (error) {
    console.error('❌ Get usage logs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// GET /api/credits/can-make-call - Arama yapılabilir mi?
// ============================================================================
router.get('/can-make-call', async (req, res) => {
  try {
    const businessId = req.businessId;

    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      select: {
        minutesLimit: true,
        minutesUsed: true,
        creditMinutes: true,
        creditMinutesUsed: true,
        overageLimit: true,
        overageMinutes: true,
        overageLimitReached: true
      }
    });

    if (!subscription) {
      return res.json({
        allowed: false,
        reason: 'NO_SUBSCRIPTION',
        message: 'Aktif abonelik bulunamadı.'
      });
    }

    // Aşım limiti aşıldıysa
    if (subscription.overageLimitReached) {
      return res.json({
        allowed: false,
        reason: 'OVERAGE_LIMIT_REACHED',
        message: 'Aşım limitine ulaşıldı. Kredi satın alarak aramaya devam edebilirsiniz.'
      });
    }

    // Kalan dakika kontrolü
    const packageRemaining = subscription.minutesLimit - subscription.minutesUsed;
    const creditRemaining = subscription.creditMinutes - subscription.creditMinutesUsed;
    const overageRemaining = subscription.overageLimit - subscription.overageMinutes;

    const totalAvailable = packageRemaining + creditRemaining + overageRemaining;

    if (totalAvailable <= 0) {
      return res.json({
        allowed: false,
        reason: 'NO_MINUTES',
        message: 'Kullanılabilir dakikanız kalmadı. Kredi satın alın.'
      });
    }

    res.json({
      allowed: true,
      availableMinutes: totalAvailable,
      breakdown: {
        package: Math.max(0, packageRemaining),
        credit: Math.max(0, creditRemaining),
        overage: Math.max(0, overageRemaining)
      }
    });
  } catch (error) {
    console.error('❌ Can make call check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// POST /api/credits/add-manual - Manuel kredi ekleme (Admin only)
// ============================================================================
router.post('/add-manual', async (req, res) => {
  try {
    const { businessId, minutes, reason } = req.body;
    const adminBusinessId = req.businessId;

    // TODO: Admin kontrolü ekle
    // Şimdilik sadece kendi business'ına eklemeye izin ver
    const targetBusinessId = businessId || adminBusinessId;

    if (!minutes || minutes < 1) {
      return res.status(400).json({ error: 'Geçersiz dakika miktarı' });
    }

    // Kredileri ekle
    const updatedSubscription = await prisma.subscription.update({
      where: { businessId: targetBusinessId },
      data: {
        creditMinutes: { increment: minutes }
      }
    });

    // Purchase kaydı oluştur (manuel)
    await prisma.creditPurchase.create({
      data: {
        businessId: targetBusinessId,
        minutes,
        amount: 0,
        unitPrice: 0,
        status: 'COMPLETED',
        paymentId: `manual-admin-${Date.now()}`
      }
    });

    // Usage log kaydet
    await prisma.usageLog.create({
      data: {
        businessId: targetBusinessId,
        type: 'CREDIT_MANUAL',
        minutes,
        source: 'ADMIN',
        metadata: { reason, addedBy: adminBusinessId }
      }
    });

    console.log(`🎁 Manuel kredi eklendi: Business ${targetBusinessId}, ${minutes} dk, Sebep: ${reason}`);

    res.json({
      success: true,
      message: `${minutes} dakika kredi eklendi.`,
      newBalance: updatedSubscription.creditMinutes
    });
  } catch (error) {
    console.error('❌ Manual credit add error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
