// ============================================================================
// BALANCE API ROUTES - Bakiye Yönetimi
// ============================================================================
// FILE: backend/src/routes/balance.js
//
// Endpoints:
// POST /api/balance/topup - Bakiye yükle (SADECE PAYG)
// GET  /api/balance - Mevcut bakiye ve kullanım bilgisi
// GET  /api/balance/transactions - Bakiye hareketleri
// PUT  /api/balance/auto-reload - Otomatik yükleme ayarları (SADECE PAYG)
//
// NOT: Bakiye yükleme sadece PAYG (Kullandıkça Öde) planı için geçerlidir.
// Paket planları (STARTER/PRO/ENTERPRISE) postpaid aşım modeli kullanır.
// ============================================================================

import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';
import balanceService from '../services/balanceService.js';
import stripeService from '../services/stripe.js';
import { getWrittenUsageSummary } from '../services/writtenUsageService.js';
import { getBillingPlanDefinition } from '../config/billingCatalog.js';
import { buildUsageAlerts } from '../services/usageAlertService.js';
import {
  markBillingCheckoutSessionCompleted,
  recordBillingCheckoutSession
} from '../services/billingAudit.js';
import {
  getPricePerMinute,
  getMinTopupMinutes,
  calculateTLToMinutes,
  getIncludedMinutes,
  isPrepaidPlan,
  isPostpaidPlan,
  getPaymentModel,
  getFixedOveragePrice,
  getTokenPricePerK
} from '../config/plans.js';
import runtimeConfig from '../config/runtime.js';

const router = express.Router();

const BALANCE_LEGACY_SUBSCRIPTION_SELECT = {
  id: true,
  businessId: true,
  plan: true,
  status: true,
  paymentProvider: true,
  stripeCustomerId: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  balance: true,
  minutesLimit: true,
  minutesUsed: true,
  trialMinutesUsed: true,
  trialChatExpiry: true,
  includedMinutesUsed: true,
  overageMinutes: true,
  overageRate: true,
  overageLimit: true,
  overageLimitReached: true,
  creditMinutes: true,
  creditMinutesUsed: true,
  packageWarningAt80: true,
  creditWarningAt80: true,
  autoReloadEnabled: true,
  autoReloadThreshold: true,
  autoReloadAmount: true,
  enterpriseMinutes: true,
  enterpriseSupportInteractions: true,
  enterprisePrice: true,
  enterpriseConcurrent: true,
  enterpriseStartDate: true,
  enterpriseEndDate: true,
  enterprisePaymentStatus: true,
  business: {
    select: {
      country: true,
      name: true,
      users: {
        where: { role: 'OWNER' },
        take: 1,
        select: { email: true }
      }
    }
  }
};

const BALANCE_BILLING_EXTENSION_SELECT = {
  voiceAddOnMinutesBalance: true,
  writtenInteractionAddOnBalance: true
};

function isMissingBalanceExtensionError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '');
  return code === 'P2021'
    || code === 'P2022'
    || message.includes('voiceAddOnMinutesBalance')
    || message.includes('writtenInteractionAddOnBalance');
}

function resolveStripeCheckoutLocale(checkoutLocale, countryCode) {
  if (typeof stripeService.resolveCheckoutLocale === 'function') {
    return stripeService.resolveCheckoutLocale(checkoutLocale, countryCode);
  }

  return undefined;
}

async function findBalanceSubscriptionWithFallback(businessId) {
  try {
    return await prisma.subscription.findUnique({
      where: { businessId },
      select: {
        ...BALANCE_LEGACY_SUBSCRIPTION_SELECT,
        ...BALANCE_BILLING_EXTENSION_SELECT
      }
    });
  } catch (error) {
    if (!isMissingBalanceExtensionError(error)) {
      throw error;
    }

    return prisma.subscription.findUnique({
      where: { businessId },
      select: BALANCE_LEGACY_SUBSCRIPTION_SELECT
    });
  }
}

async function ensureStripeCustomerForSubscription(subscription, ownerEmail) {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe not configured');
  }

  const { customer, recreated } = await stripeService.ensureCustomer({
    stripeCustomerId: subscription.stripeCustomerId,
    email: ownerEmail,
    name: subscription.business?.name || `Business ${subscription.businessId}`,
    countryCode: subscription.business?.country || 'TR',
    metadata: { businessId: subscription.businessId }
  });

  if (recreated || subscription.stripeCustomerId !== customer.id || subscription.paymentProvider !== 'stripe') {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        stripeCustomerId: customer.id,
        paymentProvider: 'stripe'
      }
    });
  }

  return customer.id;
}

// Helper: Get chat/whatsapp token usage for current period
async function getTokenUsage(businessId, country, plan) {
  try {
    // Get current period start (beginning of month for simplicity)
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get ChatLog entries for this period
    const chatLogs = await prisma.chatLog.findMany({
      where: {
        businessId,
        createdAt: { gte: periodStart }
      },
      select: {
        channel: true,
        inputTokens: true,
        outputTokens: true,
        totalCost: true
      }
    });

    // Calculate totals
    let chatInputTokens = 0;
    let chatOutputTokens = 0;
    let chatCost = 0;
    let chatSessionCount = 0;
    let whatsappInputTokens = 0;
    let whatsappOutputTokens = 0;
    let whatsappCost = 0;
    let whatsappSessionCount = 0;

    for (const log of chatLogs) {
      if (log.channel === 'CHAT') {
        chatInputTokens += log.inputTokens || 0;
        chatOutputTokens += log.outputTokens || 0;
        chatCost += log.totalCost || 0;
        chatSessionCount++;
      } else if (log.channel === 'WHATSAPP') {
        whatsappInputTokens += log.inputTokens || 0;
        whatsappOutputTokens += log.outputTokens || 0;
        whatsappCost += log.totalCost || 0;
        whatsappSessionCount++;
      }
    }

    // Get token pricing for plan
    const pricing = getTokenPricePerK(plan, country);

    return {
      totalInputTokens: chatInputTokens + whatsappInputTokens,
      totalOutputTokens: chatOutputTokens + whatsappOutputTokens,
      totalCost: chatCost + whatsappCost,
      chat: {
        inputTokens: chatInputTokens,
        outputTokens: chatOutputTokens,
        cost: chatCost,
        sessionCount: chatSessionCount
      },
      whatsapp: {
        inputTokens: whatsappInputTokens,
        outputTokens: whatsappOutputTokens,
        cost: whatsappCost,
        sessionCount: whatsappSessionCount
      },
      pricing
    };
  } catch (error) {
    console.error('Error fetching token usage:', error);
    return null;
  }
}

// All routes require authentication
router.use(authenticateToken);

// ============================================================================
// POST /api/balance/topup - Bakiye yükle (SADECE PAYG)
// ============================================================================
router.post('/topup', async (req, res) => {
  try {
    const { businessId } = req.user;
    const amount = Number(req.body?.amount || 0);
    const checkoutLocale = req.body?.locale;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Geçersiz yükleme tutarı' });
    }

    // Get subscription
    const subscription = await findBalanceSubscriptionWithFallback(businessId);

    if (!subscription) {
      return res.status(404).json({ error: 'Abonelik bulunamadı' });
    }

    // ⚠️ SADECE PAYG planı bakiye yükleyebilir
    if (subscription.plan !== 'PAYG') {
      return res.status(400).json({
        error: 'Bakiye yükleme sadece Kullandıkça Öde planında kullanılabilir',
        hint: 'Paket planlarında aşım kullanımı ay sonu faturalandırılır'
      });
    }

    const country = subscription.business?.country || 'TR';
    const pricePerMinute = getPricePerMinute(subscription.plan, country);
    const minutes = Math.floor(amount / pricePerMinute);

    // Check minimum topup for PAYG
    const minMinutes = getMinTopupMinutes(country);
    if (minutes < minMinutes) {
      return res.status(400).json({
        error: `Minimum ${minMinutes} dakika karsiligi yukleme yapilabilir`,
        minMinutes,
        minAmount: minMinutes * pricePerMinute
      });
    }

    const stripeCustomerId = await ensureStripeCustomerForSubscription(
      subscription,
      subscription.business?.users?.[0]?.email || req.user?.email
    );

    const frontendUrl = runtimeConfig.frontendUrl;
    const session = await stripeService.createCreditPurchaseSession({
      stripeCustomerId,
      minutes,
      amount,
      currency: country === 'TR' ? 'TRY' : country === 'BR' ? 'BRL' : 'USD',
      countryCode: country,
      successUrl: `${frontendUrl}/dashboard/subscription?wallet_topup=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${frontendUrl}/dashboard/subscription?wallet_topup=cancel`,
      businessId: businessId.toString(),
      checkoutLocale
    });

    await recordBillingCheckoutSession({
      businessId,
      subscriptionId: subscription.id,
      provider: 'stripe',
      checkoutType: 'BALANCE_TOPUP',
      stripeCheckoutSessionId: session.id,
      stripeCustomerId,
      amount,
      currency: country === 'TR' ? 'TRY' : country === 'BR' ? 'BRL' : 'USD',
      checkoutUrl: session.url,
      successUrl: `${frontendUrl}/dashboard/subscription?wallet_topup=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${frontendUrl}/dashboard/subscription?wallet_topup=cancel`,
      metadata: {
        minutes,
        requestedAmount: amount
      }
    });

    res.json({
      success: true,
      provider: 'stripe',
      sessionUrl: session.url,
      sessionId: session.id,
      amount,
      minutes,
      message: `${minutes} dakika icin odeme oturumu olusturuldu`
    });

  } catch (error) {
    console.error('❌ Balance topup error:', error);
    res.status(500).json({ error: error.message || 'Bakiye yükleme hatası' });
  }
});

// ============================================================================
// GET /api/balance/verify-topup-session - Stripe topup success redirect verification
// ============================================================================
router.get('/verify-topup-session', async (req, res) => {
  try {
    const { businessId } = req.user;
    const sessionId = String(req.query?.session_id || '').trim();

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    const session = await stripeService.getStripeClient().checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    if (session.metadata?.type !== 'credit_purchase') {
      return res.status(400).json({ error: 'Session is not a credit purchase' });
    }

    const metadataBusinessId = parseInt(String(session.metadata?.businessId || ''), 10);
    if (!metadataBusinessId || metadataBusinessId !== businessId) {
      return res.status(403).json({ error: 'Top-up session does not belong to this business' });
    }

    const paymentIntentId = session.payment_intent ? String(session.payment_intent) : null;

    if (paymentIntentId && session.customer) {
      try {
        await stripeService.rememberCustomerPaymentMethod({
          customerId: String(session.customer),
          paymentIntentId
        });
      } catch (paymentMethodError) {
        console.warn('⚠️ Failed to persist Stripe payment method for top-up session:', paymentMethodError.message);
      }
    }

    const amountPaid = Number.isFinite(session.amount_total) ? session.amount_total / 100 : 0;
    const existingTopup = paymentIntentId
      ? await prisma.balanceTransaction.findFirst({
        where: {
          type: 'TOPUP',
          stripePaymentIntentId: paymentIntentId
        }
      })
      : null;

    if (!existingTopup) {
      const subscription = await prisma.subscription.findUnique({
        where: { businessId },
        select: { id: true }
      });

      if (!subscription) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      const minutes = session.metadata?.minutes || '0';

      await balanceService.topUp(
        subscription.id,
        amountPaid,
        { stripePaymentIntentId: paymentIntentId },
        `${minutes} dakika bakiye yüklendi`
      );
    }

    await markBillingCheckoutSessionCompleted(sessionId, {
      completedAt: new Date(),
      stripePaymentIntentId: paymentIntentId,
      stripeCustomerId: session.customer ? String(session.customer) : null,
      metadata: {
        businessId,
        minutes: session.metadata?.minutes || null,
        amountPaid
      }
    });

    const refreshedSubscription = await prisma.subscription.findUnique({
      where: { businessId },
      select: {
        balance: true,
        plan: true,
        business: {
          select: { country: true }
        }
      }
    });

    return res.json({
      success: true,
      balance: Number(refreshedSubscription?.balance || 0),
      plan: refreshedSubscription?.plan || null
    });
  } catch (error) {
    console.error('❌ Verify top-up session error:', error);
    return res.status(500).json({ error: error.message || 'Top-up verification failed' });
  }
});

// ============================================================================
// GET /api/balance - Mevcut bakiye ve kullanım bilgisi
// ============================================================================
router.get('/', async (req, res) => {
  try {
    const { businessId } = req.user;

    const subscription = await findBalanceSubscriptionWithFallback(businessId);

    if (!subscription) {
      return res.status(404).json({ error: 'Abonelik bulunamadı' });
    }

    const country = subscription.business?.country || 'TR';
    const plan = subscription.plan;
    const pricePerMinute = getPricePerMinute(plan, country);
    const paymentModel = getPaymentModel(plan);
    const overageRate = getFixedOveragePrice(country); // Sabit aşım fiyatı
    const writtenUsage = await getWrittenUsageSummary(subscription, { includeReserved: false });
    const billingPlan = getBillingPlanDefinition(subscription);

    // ENTERPRISE için dakika limiti database'den, diğerleri için plan config'den al
    const isEnterprise = plan === 'ENTERPRISE';
    const planIncludedMinutes = isEnterprise
      ? (subscription.enterpriseMinutes || 1000)
      : getIncludedMinutes(plan, country);

    // Calculate trial chat days remaining
    let trialChat = null;
    if (plan === 'TRIAL' && subscription.trialChatExpiry) {
      const now = new Date();
      const expiry = new Date(subscription.trialChatExpiry);
      const daysLeft = Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)));
      trialChat = { daysLeft, expiry: subscription.trialChatExpiry };
    }

    // PAYG: Bakiye bazlı (prepaid)
    // Paketler: Dahil dakika + postpaid aşım
    const isPAYG = plan === 'PAYG';
    const balanceMinutes = isPAYG
      ? calculateTLToMinutes(subscription.balance || 0, plan, country)
      : 0;
    const voiceAddOnRemaining = Number(subscription.voiceAddOnMinutesBalance || 0);
    const writtenAddOnRemaining = Number(subscription.writtenInteractionAddOnBalance || 0);

    // Enterprise için ödeme durumu bilgisi
    const enterpriseInfo = isEnterprise ? {
      paymentStatus: subscription.enterprisePaymentStatus,
      startDate: subscription.enterpriseStartDate,
      endDate: subscription.enterpriseEndDate,
      price: subscription.enterprisePrice,
      concurrent: subscription.enterpriseConcurrent
    } : null;
    const usageAlerts = buildUsageAlerts({
      subscription,
      billingPlan,
      supportUsage: writtenUsage,
      effectiveMinutesLimit: planIncludedMinutes,
      country
    });

    res.json({
      isNewSystem: true,

      // Basic info
      plan,
      paymentModel, // 'PREPAID' veya 'POSTPAID'
      currency: country === 'TR' ? '₺' : country === 'BR' ? 'R$' : '$',

      // PAYG için bakiye bilgisi (prepaid)
      balance: isPAYG ? (subscription.balance || 0) : null,
      balanceMinutes: isPAYG ? balanceMinutes : null,
      pricePerMinute: isPAYG ? pricePerMinute : null,

      // Paketler için dahil dakika bilgisi
      // ENTERPRISE: database'den al (özel limit)
      // Diğerleri: plan config'den al
      includedMinutes: !isPAYG && plan !== 'TRIAL' ? {
        used: subscription.includedMinutesUsed || 0,
        limit: planIncludedMinutes,
        addOnRemaining: voiceAddOnRemaining
      } : null,

      // Aşım bilgisi (postpaid paketler için - enterprise hariç)
      overage: paymentModel === 'POSTPAID' && !isEnterprise ? {
        minutes: subscription.overageMinutes || 0,
        amount: (subscription.overageMinutes || 0) * overageRate,
        rate: overageRate
      } : null,

      // Trial info (for TRIAL plan)
      trialMinutes: plan === 'TRIAL' ? {
        used: subscription.trialMinutesUsed || 0,
        limit: 15
      } : null,
      trialChat,

      // Auto-reload settings (sadece PAYG için)
      autoReload: isPAYG ? {
        enabled: subscription.autoReloadEnabled || false,
        threshold: subscription.autoReloadThreshold || 2,
        amount: subscription.autoReloadAmount || 5
      } : null,

      // Enterprise bilgileri
      enterprise: enterpriseInfo,

      // Written support usage
      writtenInteractions: writtenUsage ? {
        used: Number(writtenUsage.used || 0),
        limit: Number.isFinite(writtenUsage.total) ? Number(writtenUsage.total || 0) : 0,
        remaining: Number.isFinite(writtenUsage.remaining) ? Number(writtenUsage.remaining || 0) : 0,
        addOnRemaining: Number(writtenUsage.addOnRemaining || 0),
        overage: Number(writtenUsage.overage || 0),
        unitPrice: Number(writtenUsage.unitPrice || billingPlan.writtenInteractionUnitPrice || 0),
        configured: Boolean(writtenUsage.configured),
        note: writtenUsage.note || null,
        channels: writtenUsage.channels || {
          webchat: 0,
          whatsapp: 0,
          email: 0
        }
      } : null,

      voiceAddOnRemaining,
      writtenAddOnRemaining,
      usageAlerts,

      // Period info
      periodEnd: subscription.currentPeriodEnd,

      // Chat/WhatsApp token usage
      tokenUsage: await getTokenUsage(businessId, country, plan)
    });

  } catch (error) {
    console.error('❌ Get balance error:', error);
    res.status(500).json({ error: error.message || 'Bakiye bilgisi alınamadı' });
  }
});

// ============================================================================
// GET /api/balance/transactions - Bakiye hareketleri
// ============================================================================
router.get('/transactions', async (req, res) => {
  try {
    const { businessId } = req.user;
    const { limit = 20, offset = 0, type } = req.query;

    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      select: { id: true, businessId: true }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Abonelik bulunamadı' });
    }

    const result = await balanceService.getTransactions(subscription.id, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      type: type || null
    });

    res.json({
      transactions: result.transactions,
      total: result.total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('❌ Get transactions error:', error);
    res.status(500).json({ error: error.message || 'İşlem geçmişi alınamadı' });
  }
});

// ============================================================================
// PUT /api/balance/auto-reload - Otomatik yükleme ayarları (SADECE PAYG)
// ============================================================================
router.put('/auto-reload', async (req, res) => {
  try {
    const { businessId } = req.user;
    const { enabled, threshold, amount } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled alanı gerekli (true/false)' });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      select: {
        id: true,
        businessId: true,
        plan: true
      }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Abonelik bulunamadı' });
    }

    // ⚠️ SADECE PAYG planı otomatik yükleme kullanabilir
    if (subscription.plan !== 'PAYG') {
      return res.status(400).json({
        error: 'Otomatik yükleme sadece Kullandıkça Öde planında kullanılabilir'
      });
    }

    if (enabled) {
      if (!threshold || threshold < 1) {
        return res.status(400).json({ error: 'Eşik değeri en az 1 dakika olmalı' });
      }
      if (!amount || amount < 1) {
        return res.status(400).json({ error: 'Yükleme miktarı en az 1 dakika olmalı' });
      }
    }

    const updated = await balanceService.updateAutoReloadSettings(subscription.id, {
      enabled,
      threshold: threshold || 2,
      amount: amount || 5
    });

    res.json({
      success: true,
      autoReload: {
        enabled: updated.autoReloadEnabled,
        threshold: updated.autoReloadThreshold,
        amount: updated.autoReloadAmount
      },
      message: enabled ? 'Otomatik yükleme aktif edildi' : 'Otomatik yükleme kapatıldı'
    });

  } catch (error) {
    console.error('❌ Update auto-reload error:', error);
    res.status(500).json({ error: error.message || 'Otomatik yükleme ayarları güncellenemedi' });
  }
});

// ============================================================================
// POST /api/balance/create-checkout - Ödeme oturumu oluştur (SADECE PAYG)
// ============================================================================
router.post('/create-checkout', async (req, res) => {
  try {
    const { businessId } = req.user;
    const { minutes } = req.body;
    const checkoutLocale = req.body?.locale;

    if (!minutes || minutes <= 0) {
      return res.status(400).json({ error: 'Geçersiz dakika miktarı' });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      select: {
        ...BALANCE_LEGACY_SUBSCRIPTION_SELECT,
        ...BALANCE_BILLING_EXTENSION_SELECT
      }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Abonelik bulunamadı' });
    }

    // ⚠️ SADECE PAYG planı bakiye yükleyebilir
    if (subscription.plan !== 'PAYG') {
      return res.status(400).json({
        error: 'Bakiye yükleme sadece Kullandıkça Öde planında kullanılabilir',
        hint: 'Paket planlarında aşım kullanımı ay sonu faturalandırılır'
      });
    }

    const country = subscription.business?.country || 'TR';

    // Check minimum topup for PAYG
    const minMinutes = getMinTopupMinutes(country);
    if (minutes < minMinutes) {
      return res.status(400).json({
        error: `Minimum ${minMinutes} dakika yükleme yapılabilir`,
        minMinutes
      });
    }

    // Calculate amount
    const pricePerMinute = getPricePerMinute(subscription.plan, country);
    const amountTL = minutes * pricePerMinute;

    const stripeCustomerId = await ensureStripeCustomerForSubscription(
      subscription,
      subscription.business?.users?.[0]?.email || req.user?.email
    );
    const frontendUrl = runtimeConfig.frontendUrl;
    const session = await stripeService.createCreditPurchaseSession({
      stripeCustomerId,
      minutes,
      amount: amountTL,
      currency: country === 'TR' ? 'TRY' : country === 'BR' ? 'BRL' : 'USD',
      countryCode: country,
      successUrl: `${frontendUrl}/dashboard/subscription?wallet_topup=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${frontendUrl}/dashboard/subscription?wallet_topup=cancel`,
      businessId: businessId.toString(),
      checkoutLocale
    });

    await recordBillingCheckoutSession({
      businessId,
      subscriptionId: subscription.id,
      provider: 'stripe',
      checkoutType: 'BALANCE_TOPUP',
      stripeCheckoutSessionId: session.id,
      stripeCustomerId,
      amount: amountTL,
      currency: country === 'TR' ? 'TRY' : country === 'BR' ? 'BRL' : 'USD',
      checkoutUrl: session.url,
      successUrl: `${frontendUrl}/dashboard/subscription?wallet_topup=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${frontendUrl}/dashboard/subscription?wallet_topup=cancel`,
      metadata: {
        minutes,
        requestedAmount: amountTL
      }
    });

    return res.json({
      success: true,
      provider: 'stripe',
      sessionUrl: session.url,
      sessionId: session.id
    });

  } catch (error) {
    console.error('❌ Create checkout error:', error);
    res.status(500).json({ error: error.message || 'Ödeme oturumu oluşturulamadı' });
  }
});

export default router;
