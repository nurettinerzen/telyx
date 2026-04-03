// ============================================================================
// UPDATED SUBSCRIPTION ROUTES
// ============================================================================
// FILE: backend/src/routes/subscription.js
//
// Enhanced with iyzico support for Turkish customers
// Stripe for global customers, iyzico for Turkey (TR)
// ============================================================================

// Load environment variables first
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken, verifyBusinessAccess } from '../middleware/auth.js';
import Stripe from 'stripe';
import crypto from 'crypto';
import emailService from '../services/emailService.js';
import iyzicoSubscription from '../services/iyzicoSubscription.js';
import paymentProvider from '../services/paymentProvider.js';
import balanceService from '../services/balanceService.js';
import { getEffectivePlanConfig } from '../services/planConfig.js';
import { getPlanWithPricing } from '../config/plans.js';
import { isPhoneInboundEnabledForBusinessRecord } from '../services/phoneInboundGate.js';
import { buildPhoneEntitlements } from '../services/phonePlanEntitlements.js';
import stripeService from '../services/stripe.js';
import { getAddOnCatalog, getBillingPlanDefinition } from '../config/billingCatalog.js';
import { getWrittenUsageSummary } from '../services/writtenUsageService.js';
import {
  resolvePlanFromStripePriceId,
  resolveStripePriceIdForPlan,
} from '../services/stripePlanCatalog.js';
import runtimeConfig from '../config/runtime.js';

const router = express.Router();

const LEGACY_SUBSCRIPTION_BASE_SELECT = {
  id: true,
  businessId: true,
  plan: true,
  status: true,
  paymentProvider: true,
  stripeCustomerId: true,
  stripeSubscriptionId: true,
  stripePriceId: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  minutesUsed: true,
  callsThisMonth: true,
  assistantsCreated: true,
  phoneNumbersUsed: true,
  minutesLimit: true,
  callsLimit: true,
  assistantsLimit: true,
  phoneNumbersLimit: true,
  balance: true,
  trialMinutesUsed: true,
  trialChatExpiry: true,
  trialStartDate: true,
  includedMinutesUsed: true,
  includedMinutesResetAt: true,
  autoReloadEnabled: true,
  autoReloadThreshold: true,
  autoReloadAmount: true,
  creditMinutes: true,
  creditMinutesUsed: true,
  overageMinutes: true,
  overageRate: true,
  overageLimit: true,
  overageBilledAt: true,
  packageWarningAt80: true,
  creditWarningAt80: true,
  overageLimitReached: true,
  lowBalanceWarningAt: true,
  concurrentLimit: true,
  activeCalls: true,
  chatTokensUsed: true,
  chatTokensResetAt: true,
  chatTokensLimit: true,
  chatDailyMessageDate: true,
  chatDailyMessageCount: true,
  enterpriseMinutes: true,
  enterpriseSupportInteractions: true,
  enterprisePrice: true,
  enterpriseConcurrent: true,
  enterpriseAssistants: true,
  enterpriseStartDate: true,
  enterpriseEndDate: true,
  enterprisePaymentStatus: true,
  enterpriseNotes: true,
  createdAt: true,
  updatedAt: true,
  business: {
    select: {
      id: true,
      country: true,
      name: true,
      phoneInboundEnabled: true,
      phoneNumbers: true
    }
  }
};

const BILLING_V2_EXTENSION_SELECT = {
  voiceAddOnMinutesBalance: true,
  writtenInteractionAddOnBalance: true,
  writtenOverageBilledAt: true
};

function isMissingBillingSchemaError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '');
  return code === 'P2021'
    || code === 'P2022'
    || message.includes('voiceAddOnMinutesBalance')
    || message.includes('writtenInteractionAddOnBalance')
    || message.includes('writtenOverageBilledAt')
    || message.includes('WrittenUsageEvent')
    || message.includes('AddOnPurchase');
}

async function findSubscriptionWithBillingFallback(businessId) {
  try {
    return await prisma.subscription.findUnique({
      where: { businessId },
      select: {
        ...LEGACY_SUBSCRIPTION_BASE_SELECT,
        ...BILLING_V2_EXTENSION_SELECT
      }
    });
  } catch (error) {
    if (!isMissingBillingSchemaError(error)) {
      throw error;
    }

    console.warn(`⚠️ Billing v2 schema not available for business ${businessId}, falling back to legacy subscription shape`);
    return prisma.subscription.findUnique({
      where: { businessId },
      select: LEGACY_SUBSCRIPTION_BASE_SELECT
    });
  }
}

// Lazy initialize Stripe to ensure env vars are loaded
let stripe = null;
function getStripe() {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

function hashValue(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').slice(0, 12);
}

function isMissingStripeSubscriptionError(error) {
  const message = String(error?.message || '');
  const code = String(error?.code || error?.raw?.code || '');
  return code === 'resource_missing' || message.includes('No such subscription');
}

async function getStripeSubscriptionIfExists(subscriptionId) {
  if (!subscriptionId || !getStripe()) {
    return null;
  }

  try {
    return await getStripe().subscriptions.retrieve(subscriptionId);
  } catch (error) {
    if (isMissingStripeSubscriptionError(error)) {
      console.warn(`⚠️ Stripe subscription ${subscriptionId} was not found in the current Stripe account.`);
      return null;
    }
    throw error;
  }
}

async function resolvePlanFromPriceId(priceId) {
  const knownPlan = resolvePlanFromStripePriceId(priceId);
  if (knownPlan) {
    return knownPlan;
  }

  if (!priceId || !getStripe()) {
    return null;
  }

  try {
    const price = await getStripe().prices.retrieve(priceId);
    if (price?.metadata?.type === 'enterprise') {
      return 'ENTERPRISE';
    }
  } catch (error) {
    console.log('⚠️ Could not resolve Stripe price metadata:', error.message);
  }

  return null;
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

async function ensureStripeCustomerForBusiness({
  businessId,
  ownerEmail,
  businessName,
  countryCode = 'TR'
}) {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe not configured');
  }

  const existingSubscription = await prisma.subscription.findUnique({
    where: { businessId },
    select: {
      id: true,
      plan: true,
      status: true,
      stripeCustomerId: true,
      paymentProvider: true
    }
  });

  const { customer, recreated } = await stripeService.ensureCustomer({
    stripeCustomerId: existingSubscription?.stripeCustomerId,
    email: ownerEmail,
    name: businessName || `Business ${businessId}`,
    countryCode,
    metadata: { businessId }
  });

  await prisma.subscription.upsert({
    where: { businessId },
    create: {
      businessId,
      stripeCustomerId: customer.id,
      paymentProvider: 'stripe',
      plan: existingSubscription?.plan || 'FREE',
      status: existingSubscription?.status || 'INCOMPLETE'
    },
    update: {
      stripeCustomerId: customer.id,
      paymentProvider: 'stripe'
    }
  });

  if (recreated) {
    console.warn(`⚠️ Replaced stale Stripe customer for business ${businessId}`);
  }

  return customer.id;
}

async function switchBusinessToPayg({ businessId, force = false }) {
  const currentSubscription = await prisma.subscription.findUnique({
    where: { businessId }
  });
  const paygConfig = PLAN_CONFIG.PAYG;

  const immediateSwitchPlans = ['FREE', 'TRIAL', 'PAYG', null, undefined];
  const isEnterprisePendingPayment = currentSubscription?.plan === 'ENTERPRISE'
    && currentSubscription?.enterprisePaymentStatus === 'pending';

  const canSwitchImmediately = !currentSubscription
    || immediateSwitchPlans.includes(currentSubscription.plan)
    || currentSubscription.status !== 'ACTIVE'
    || isEnterprisePendingPayment
    || force;

  if (canSwitchImmediately) {
    const now = new Date();
    const subscription = await prisma.subscription.upsert({
      where: { businessId },
      create: {
        businessId,
        plan: 'PAYG',
        status: 'ACTIVE',
        paymentProvider: 'stripe',
        balance: 0,
        minutesLimit: paygConfig.minutesLimit,
        callsLimit: paygConfig.callsLimit,
        assistantsLimit: paygConfig.assistantsLimit,
        phoneNumbersLimit: paygConfig.phoneNumbersLimit,
        includedMinutesUsed: 0,
        overageMinutes: 0,
        currentPeriodStart: now,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        pendingPlanId: null
      },
      update: {
        plan: 'PAYG',
        status: 'ACTIVE',
        paymentProvider: 'stripe',
        cancelAtPeriodEnd: false,
        pendingPlanId: null,
        minutesLimit: paygConfig.minutesLimit,
        callsLimit: paygConfig.callsLimit,
        assistantsLimit: paygConfig.assistantsLimit,
        phoneNumbersLimit: paygConfig.phoneNumbersLimit,
        stripeSubscriptionId: null,
        stripePriceId: null,
        iyzicoSubscriptionId: null,
        iyzicoReferenceCode: null,
        pendingSubscriptionToken: null,
        includedMinutesUsed: 0,
        overageMinutes: 0,
        currentPeriodStart: now,
        currentPeriodEnd: null
      }
    });

    return {
      success: true,
      immediate: true,
      subscription
    };
  }

  const periodEnd = currentSubscription.currentPeriodEnd
    || currentSubscription.enterpriseEndDate
    || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const previousPendingPlanId = currentSubscription.pendingPlanId || null;
  await prisma.subscription.update({
    where: { businessId },
    data: {
      cancelAtPeriodEnd: true,
      pendingPlanId: 'PAYG'
    }
  });

  if (currentSubscription.stripeSubscriptionId) {
    try {
      await getStripe().subscriptions.update(currentSubscription.stripeSubscriptionId, {
        cancel_at_period_end: true
      });
      console.log(`📅 Scheduled Stripe cancellation for subscription ${currentSubscription.stripeSubscriptionId}`);
    } catch (stripeError) {
      await prisma.subscription.update({
        where: { businessId },
        data: {
          cancelAtPeriodEnd: currentSubscription.cancelAtPeriodEnd || false,
          pendingPlanId: previousPendingPlanId
        }
      });
      console.error('Stripe cancellation error:', stripeError.message);
      throw stripeError;
    }
  }
  const subscription = await prisma.subscription.findUnique({
    where: { businessId }
  });

  return {
    success: true,
    immediate: false,
    subscription,
    periodEnd
  };
}

function resolveUsageCycleStart(subscription) {
  if (subscription?.currentPeriodStart) {
    return new Date(subscription.currentPeriodStart);
  }

  if (subscription?.trialStartDate) {
    return new Date(subscription.trialStartDate);
  }

  if (subscription?.includedMinutesResetAt) {
    const derivedStart = new Date(subscription.includedMinutesResetAt);
    derivedStart.setDate(derivedStart.getDate() - 30);
    return derivedStart;
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  return startOfMonth;
}

async function buildSupportUsageSummary({ businessId, subscription }) {
  const usageSummary = await getWrittenUsageSummary(subscription, { includeReserved: false });
  if (usageSummary && usageSummary.used > 0) {
    return usageSummary;
  }

  const periodStart = resolveUsageCycleStart(subscription);
  const [webchatSessions, whatsappSessions, answeredEmails] = await Promise.all([
    prisma.chatLog.count({
      where: {
        businessId,
        channel: 'CHAT',
        createdAt: { gte: periodStart }
      }
    }),
    prisma.chatLog.count({
      where: {
        businessId,
        channel: 'WHATSAPP',
        createdAt: { gte: periodStart }
      }
    }),
    prisma.emailMessage.count({
      where: {
        direction: 'OUTBOUND',
        status: 'SENT',
        thread: {
          businessId
        },
        createdAt: { gte: periodStart }
      }
    })
  ]);

  const used = webchatSessions + whatsappSessions + answeredEmails;
  return {
    ...(usageSummary || {}),
    metric: 'support_interactions',
    used,
    periodStart,
    channels: {
      webchat: webchatSessions,
      whatsapp: whatsappSessions,
      email: answeredEmails
    }
  };
}

function buildBillingSnapshot({
  subscription,
  supportUsage,
  billingPlan,
  effectiveMinutesLimit
}) {
  const voiceUsed = Number(subscription.includedMinutesUsed || 0);
  const voiceOverage = Number(subscription.overageMinutes || 0);
  const voiceIncluded = Math.max(Number(effectiveMinutesLimit || 0), 0);
  const voiceAddOnRemaining = Math.max(Number(subscription.voiceAddOnMinutesBalance || 0), 0);
  const writtenAddOnRemaining = Math.max(Number(subscription.writtenInteractionAddOnBalance || 0), 0);
  const writtenIncluded = Number.isFinite(supportUsage?.total)
    ? Math.max(Number(supportUsage.total || 0), 0)
    : 0;
  const writtenUsed = Number(supportUsage?.used || 0);
  const writtenOverage = Number(supportUsage?.overage || 0);
  const hasWrittenAllowance = writtenIncluded > 0 || writtenAddOnRemaining > 0;
  const hasVoiceAllowance = voiceIncluded > 0 || voiceAddOnRemaining > 0;

  return {
    plan: subscription.plan,
    status: subscription.status,
    channels: {
      webchat: billingPlan.channels.webchat,
      whatsapp: billingPlan.channels.whatsapp,
      email: billingPlan.channels.email,
      phone: billingPlan.channels.phone
    },
    entitlements: {
      concurrentCalls: billingPlan.concurrentCallLimit,
      assistants: billingPlan.assistantLimit
    },
    includedUsage: {
      writtenInteractions: {
        total: writtenIncluded,
        used: writtenUsed,
        remaining: hasWrittenAllowance
          ? Math.max(writtenIncluded + writtenAddOnRemaining - writtenUsed, 0)
          : null,
        overage: writtenOverage,
        overageUnitPrice: billingPlan.writtenInteractionUnitPrice
      },
      voiceMinutes: {
        total: voiceIncluded,
        used: voiceUsed,
        remaining: hasVoiceAllowance
          ? Math.max(voiceIncluded + voiceAddOnRemaining - voiceUsed, 0)
          : 0,
        overage: voiceOverage,
        overageUnitPrice: billingPlan.voiceMinuteUnitPrice
      }
    },
    addOns: {
      writtenInteractions: {
        remaining: writtenAddOnRemaining
      },
      voiceMinutes: {
        remaining: voiceAddOnRemaining
      }
    },
    wallet: {
      enabled: billingPlan.billingModel === 'payg',
      balance: Number(subscription.balance || 0),
      writtenUnitPrice: billingPlan.writtenInteractionUnitPrice,
      phoneMinuteUnitPrice: billingPlan.voiceMinuteUnitPrice
    },
    renewalDate: subscription.currentPeriodEnd || null
  };
}

function normalizeSubscriptionStatus(status) {
  const normalized = String(status || '').trim().toUpperCase();
  if (['ACTIVE', 'TRIAL', 'TRIALING', 'PAST_DUE', 'CANCELED', 'UNPAID', 'INCOMPLETE', 'INCOMPLETE_EXPIRED'].includes(normalized)) {
    return normalized === 'TRIALING' ? 'TRIAL' : normalized;
  }
  return normalized || 'ACTIVE';
}

function shouldExpireCycleScopedAddOns({ existingSubscription, nextPeriodStart, billingPlan }) {
  if (!existingSubscription?.currentPeriodStart || !nextPeriodStart) {
    return false;
  }

  if (!['recurring', 'enterprise'].includes(String(billingPlan?.billingModel || '').toLowerCase())) {
    return false;
  }

  return new Date(nextPeriodStart).getTime() > new Date(existingSubscription.currentPeriodStart).getTime();
}

async function recordCompletedAddOnPurchase(session) {
  const paymentIntentId = session.payment_intent ? String(session.payment_intent) : null;
  const sessionId = session.id ? String(session.id) : null;
  const subscriptionId = session.metadata?.subscriptionId
    ? Number.parseInt(session.metadata.subscriptionId, 10)
    : null;
  const businessId = session.metadata?.businessId
    ? Number.parseInt(session.metadata.businessId, 10)
    : null;
  const addOnKind = String(session.metadata?.addonKind || '').trim().toUpperCase();
  const quantity = Number.parseFloat(session.metadata?.quantity || '0');
  const unitPrice = Number.parseFloat(session.metadata?.unitPrice || '0');
  const amount = Number.isFinite(session.amount_total) ? session.amount_total / 100 : +(quantity * unitPrice).toFixed(2);

  if (!subscriptionId || !businessId || !['WRITTEN', 'VOICE'].includes(addOnKind) || !(quantity > 0)) {
    throw new Error(`Invalid add-on checkout metadata for session ${session.id}`);
  }

  const existingPurchase = await prisma.addOnPurchase.findFirst({
    where: {
      OR: [
        ...(paymentIntentId ? [{ stripePaymentIntentId: paymentIntentId }] : []),
        ...(sessionId ? [{ stripeSessionId: sessionId }] : [])
      ]
    }
  });

  if (existingPurchase?.status === 'COMPLETED') {
    return existingPurchase;
  }

  const updateData = addOnKind === 'VOICE'
    ? { voiceAddOnMinutesBalance: { increment: quantity } }
    : { writtenInteractionAddOnBalance: { increment: Math.round(quantity) } };

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: updateData
  });

  const purchaseData = {
    subscriptionId,
    businessId,
    kind: addOnKind,
    packageId: String(session.metadata?.packageId || ''),
    quantity,
    amount,
    unitPrice,
    stripePaymentIntentId: paymentIntentId,
    stripeSessionId: sessionId,
    status: 'COMPLETED',
    completedAt: new Date()
  };

  if (existingPurchase) {
    return prisma.addOnPurchase.update({
      where: { id: existingPurchase.id },
      data: purchaseData
    });
  }

  return prisma.addOnPurchase.create({
    data: purchaseData
  });
}

async function billWrittenOverageIfNeeded(subscription, billingWindowEnd = null) {
  if (!subscription?.id || !subscription?.currentPeriodStart) {
    return null;
  }

  const country = subscription.business?.country || 'TR';
  const billingPlan = getBillingPlanDefinition(subscription, country);
  if (!billingPlan.overageAllowed?.written) {
    return null;
  }

  if (!subscription.stripeCustomerId) {
    console.log(`ℹ️ Skipping written overage billing for subscription ${subscription.id}: no Stripe customer`);
    return null;
  }

  const periodStart = new Date(subscription.currentPeriodStart);
  const periodEnd = new Date(billingWindowEnd || subscription.currentPeriodEnd || Date.now());
  const lastBilledAt = subscription.writtenOverageBilledAt
    ? new Date(subscription.writtenOverageBilledAt)
    : null;
  const meterWindowStart = lastBilledAt && lastBilledAt > periodStart
    ? lastBilledAt
    : periodStart;

  const overageCount = await prisma.writtenUsageEvent.count({
    where: {
      subscriptionId: subscription.id,
      status: 'COMMITTED',
      chargeType: 'OVERAGE',
      createdAt: {
        gte: meterWindowStart,
        lt: periodEnd
      }
    }
  });

  if (overageCount <= 0) {
    return null;
  }

  const unitPrice = Number(billingPlan.writtenInteractionUnitPrice || 0);
  const totalAmount = +(overageCount * unitPrice).toFixed(2);
  const currency = country === 'TR' ? 'TRY' : country === 'BR' ? 'BRL' : 'USD';
  const invoiceResult = await stripeService.createWrittenOverageInvoice({
    customerId: subscription.stripeCustomerId,
    interactionCount: overageCount,
    unitPrice,
    totalAmount,
    currency,
    countryCode: country,
    businessName: subscription.business?.name || `Business ${subscription.businessId}`,
    periodStart: meterWindowStart,
    periodEnd
  });

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      writtenOverageBilledAt: periodEnd
    }
  });

  await prisma.balanceTransaction.create({
    data: {
      subscriptionId: subscription.id,
      type: 'OVERAGE',
      amount: -totalAmount,
      balanceBefore: Number(subscription.balance || 0),
      balanceAfter: Number(subscription.balance || 0),
      description: `Written overage billed: ${overageCount} interactions`,
      stripePaymentIntentId: null
    }
  });

  return invoiceResult;
}

// Plan configurations with both Stripe and iyzico pricing
// Updated: January 2026 - synced with pricing.js
const PLAN_CONFIG = {
  FREE: {
    name: 'FREE',
    price: 0,
    priceTRY: 0,
    minutesLimit: 0,
    callsLimit: 0,
    assistantsLimit: 1,
    phoneNumbersLimit: 0
  },
  PAYG: {
    name: 'PAYG',
    price: 0,
    priceTRY: 0,
    minutesLimit: 0, // Pay per minute, no limit
    callsLimit: -1, // unlimited
    assistantsLimit: 1,
    phoneNumbersLimit: 1,
    isPrepaid: true // Balance-based, not subscription
  },
  STARTER: {
    name: 'STARTER',
    stripePriceId: process.env.STRIPE_STARTER_PRICE_ID || 'price_starter',
    iyzicoPlanRef: process.env.IYZICO_STARTER_PLAN_REF,
    price: 55,        // $55 USD
    priceTRY: 2499,   // ₺2,499 TRY
    minutesLimit: 0,
    callsLimit: 0,
    assistantsLimit: 5,
    phoneNumbersLimit: 0
  },
  PRO: {
    name: 'PRO',
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID || 'price_pro',
    iyzicoPlanRef: process.env.IYZICO_PRO_PLAN_REF,
    price: 167,       // $167 USD
    priceTRY: 7499,   // ₺7,499 TRY
    minutesLimit: 500,
    callsLimit: -1,   // unlimited
    assistantsLimit: 10,
    phoneNumbersLimit: -1 // unlimited
  },
  ENTERPRISE: {
    name: 'ENTERPRISE',
    stripePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || 'price_enterprise',
    iyzicoPlanRef: process.env.IYZICO_ENTERPRISE_PLAN_REF,
    price: null,      // Contact sales
    priceTRY: null,   // İletişime geçin
    minutesLimit: -1, // unlimited (custom)
    callsLimit: -1,
    assistantsLimit: -1, // unlimited
    phoneNumbersLimit: -1 // custom
  }
};

// ============================================================================
// WEBHOOK - MUST BE FIRST (before express.json middleware)
// ============================================================================

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('✅ Webhook received:', event.type);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log('💳 Checkout completed:', session.id);
        console.log('📋 Session metadata:', JSON.stringify(session.metadata));

        if (session.metadata?.type === 'credit_purchase') {
          const paymentIntentId = session.payment_intent ? String(session.payment_intent) : null;
          const businessIdFromMetadata = session.metadata?.businessId
            ? parseInt(session.metadata.businessId, 10)
            : null;

          const existingTopup = paymentIntentId
            ? await prisma.balanceTransaction.findFirst({
              where: {
                type: 'TOPUP',
                stripePaymentIntentId: paymentIntentId
              }
            })
            : null;

          if (!existingTopup) {
            const targetSubscription = businessIdFromMetadata
              ? await prisma.subscription.findUnique({ where: { businessId: businessIdFromMetadata } })
              : await prisma.subscription.findFirst({ where: { stripeCustomerId: session.customer } });

            if (!targetSubscription) {
              throw new Error(`Balance top-up target subscription not found for checkout session ${session.id}`);
            }

            const amountPaid = Number.isFinite(session.amount_total) ? session.amount_total / 100 : 0;
            const minutes = session.metadata?.minutes || '0';

            await balanceService.topUp(
              targetSubscription.id,
              amountPaid,
              { stripePaymentIntentId: paymentIntentId },
              `${minutes} dakika bakiye yüklendi`
            );
          } else {
            console.log(`ℹ️ Balance top-up already processed for payment intent ${paymentIntentId}`);
          }

          break;
        }

        if (session.metadata?.type === 'addon_purchase') {
          await recordCompletedAddOnPurchase(session);
          console.log(`✅ Add-on purchase applied: ${session.metadata?.addonKind || 'UNKNOWN'} for session ${session.id}`);
          break;
        }

        // Check if this is an enterprise payment link
        // Try session metadata first, then line items
        let isEnterprise = session.metadata?.type === 'enterprise';
        let subscriptionId = session.metadata?.subscriptionId ? parseInt(session.metadata.subscriptionId) : null;

        // If no metadata on session, check if we can identify from line items or price
        if (!isEnterprise && session.subscription) {
          // Get the Stripe subscription to check price metadata
          try {
            const stripeSubscription = await getStripe().subscriptions.retrieve(session.subscription);
            const priceId = stripeSubscription.items?.data?.[0]?.price?.id;

            if (priceId) {
              // Check price metadata
              const price = await getStripe().prices.retrieve(priceId);
              console.log('💰 Price metadata:', JSON.stringify(price.metadata));

              if (price.metadata?.type === 'enterprise') {
                isEnterprise = true;
                subscriptionId = parseInt(price.metadata.subscriptionId);
                console.log('🔍 Found enterprise info from price metadata');
              }
            }
          } catch (e) {
            console.log('⚠️ Could not retrieve subscription/price details:', e.message);
          }
        }

        if (isEnterprise && subscriptionId) {
          const stripeSubId = session.subscription; // Stripe subscription ID from checkout
          console.log('💼 Enterprise payment link completed for subscription:', subscriptionId);

          // Önce mevcut subscription'ı al - enterprise detaylarını korumak için
          const existingSub = await prisma.subscription.findUnique({
            where: { id: subscriptionId }
          });

          if (!existingSub) {
            console.error('❌ Enterprise subscription not found:', subscriptionId);
            break;
          }

          // Ödeme yapıldı - pendingPlanId'yi aktif plan yap
          // Enterprise özellikleri (dakika, concurrent vs.) aktif olacak
          await prisma.subscription.update({
            where: { id: subscriptionId },
            data: {
              plan: 'ENTERPRISE', // Şimdi plan değişiyor
              pendingPlanId: null, // Bekleyen plan temizlendi
              enterprisePaymentStatus: 'paid',
              status: 'ACTIVE',
              stripeSubscriptionId: stripeSubId,
              stripeCustomerId: session.customer,
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
              // Enterprise limitleri aktif et
              minutesLimit: existingSub.enterpriseMinutes || 1000,
              concurrentLimit: existingSub.enterpriseConcurrent || 10,
              assistantsLimit: existingSub.enterpriseAssistants || 999
            }
          });

          console.log('✅ Enterprise subscription payment confirmed, plan activated. Stripe Sub:', stripeSubId);
          break;
        }

        // Regular subscription checkout
        const stripeSubscriptionId = session.subscription;
        const customerId = session.customer;
        const priceId = session.line_items?.data[0]?.price?.id || session.metadata?.priceId;

        // Determine plan from price ID
        const plan = await resolvePlanFromPriceId(priceId) || 'STARTER';

        const planConfig = PLAN_CONFIG[plan];

        // Update subscription in database
        const subscription = await prisma.subscription.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            stripeSubscriptionId: stripeSubscriptionId,
            stripePriceId: priceId,
            plan: plan,
            status: 'ACTIVE',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            // Set plan limits
            minutesLimit: planConfig.minutesLimit,
            callsLimit: planConfig.callsLimit,
            assistantsLimit: planConfig.assistantsLimit,
            phoneNumbersLimit: planConfig.phoneNumbersLimit
          }
        });

        // Get business ID
        const sub = await prisma.subscription.findFirst({
          where: { stripeCustomerId: customerId },
          include: {
            business: {
              select: {
                id: true,
                name: true,
                users: {
                  where: { role: 'OWNER' },
                  select: { email: true },
                  take: 1
                }
              }
            }
          }
        });

        if (sub && sub.business) {
          const businessId = sub.business.id;
          const ownerEmail = sub.business.users[0]?.email;

          // Note: Phone numbers are now provisioned manually via the Phone Numbers page
          // Users can add 11Labs phone numbers after subscription activation

          // Send payment success email
          if (ownerEmail) {
            const paidAmount = Number.isFinite(session.amount_total)
              ? session.amount_total / 100
              : planConfig.priceTRY;

            await emailService.sendPaymentSuccessEmail(
              ownerEmail,
              sub.business.name,
              paidAmount,
              plan
            );
          }
        }

        console.log('✅ Subscription activated:', plan);
        break;
      }

      case 'customer.subscription.updated': {
        const stripeSubscription = event.data.object;
        console.log('🔄 Subscription updated:', stripeSubscription.id);

        const priceId = stripeSubscription.items.data[0]?.price?.id;
        const resolvedPlan = await resolvePlanFromPriceId(priceId) || 'STARTER';
        const existingSubscription = await prisma.subscription.findFirst({
          where: { stripeSubscriptionId: stripeSubscription.id },
          include: {
            business: {
              select: { country: true, name: true }
            }
          }
        });
        const currentPeriodStart = new Date(stripeSubscription.current_period_start * 1000);
        const currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
        const billingPlan = getBillingPlanDefinition(
          existingSubscription ? { ...existingSubscription, plan: resolvedPlan } : { plan: resolvedPlan },
          existingSubscription?.business?.country || 'TR'
        );
        const shouldExpireAddOns = shouldExpireCycleScopedAddOns({
          existingSubscription,
          nextPeriodStart: currentPeriodStart,
          billingPlan
        });
        const pendingPlanId = existingSubscription?.pendingPlanId
          ? String(existingSubscription.pendingPlanId).toUpperCase()
          : null;
        const shouldApplyPendingPlan = Boolean(pendingPlanId) && shouldExpireAddOns;
        const effectivePlan = shouldApplyPendingPlan
          ? pendingPlanId
          : (pendingPlanId ? existingSubscription.plan : resolvedPlan);
        const planConfig = PLAN_CONFIG[effectivePlan] || PLAN_CONFIG.STARTER;

        if (shouldExpireAddOns && existingSubscription) {
          try {
            await billWrittenOverageIfNeeded(existingSubscription, currentPeriodStart);
          } catch (billingError) {
            console.error(`⚠️ Failed to bill written overage for subscription ${existingSubscription.id}:`, billingError.message);
          }
        }

        const updateData = {
          plan: effectivePlan,
          status: normalizeSubscriptionStatus(stripeSubscription.status),
          stripePriceId: priceId,
          currentPeriodStart,
          currentPeriodEnd,
          cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
          // Update limits
          minutesLimit: planConfig.minutesLimit,
          callsLimit: planConfig.callsLimit,
          assistantsLimit: planConfig.assistantsLimit,
          phoneNumbersLimit: planConfig.phoneNumbersLimit
        };

        if (shouldApplyPendingPlan) {
          updateData.pendingPlanId = null;
        }

        if (shouldExpireAddOns) {
          updateData.includedMinutesUsed = 0;
          updateData.packageWarningAt80 = false;
          updateData.creditWarningAt80 = false;
          updateData.voiceAddOnMinutesBalance = 0;
          updateData.writtenInteractionAddOnBalance = 0;
        }

        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: stripeSubscription.id },
          data: updateData
        });

        console.log('✅ Subscription plan updated to:', effectivePlan);
        break;
      }

      case 'customer.subscription.created': {
        const subscription = event.data.object;
        console.log('🆕 Subscription created:', subscription.id);

        // Check if this is an enterprise subscription
        const priceId = subscription.items?.data?.[0]?.price?.id;
        if (priceId) {
          try {
            const price = await getStripe().prices.retrieve(priceId);
            console.log('💰 New subscription price metadata:', JSON.stringify(price.metadata));

            if (price.metadata?.type === 'enterprise' && price.metadata?.subscriptionId) {
              const subscriptionId = parseInt(price.metadata.subscriptionId);
              console.log('💼 Enterprise subscription created for:', subscriptionId);

              // Get existing subscription
              const existingSub = await prisma.subscription.findUnique({
                where: { id: subscriptionId }
              });

              if (existingSub && existingSub.pendingPlanId === 'ENTERPRISE') {
                // Activate enterprise plan
                await prisma.subscription.update({
                  where: { id: subscriptionId },
                  data: {
                    plan: 'ENTERPRISE',
                    pendingPlanId: null,
                    enterprisePaymentStatus: 'paid',
                    status: 'ACTIVE',
                    stripeSubscriptionId: subscription.id,
                    stripeCustomerId: subscription.customer,
                    currentPeriodStart: new Date(subscription.current_period_start * 1000),
                    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
                    minutesLimit: existingSub.enterpriseMinutes || 1000,
                    concurrentLimit: existingSub.enterpriseConcurrent || 10,
                    assistantsLimit: existingSub.enterpriseAssistants || 999
                  }
                });
                console.log('✅ Enterprise plan activated via customer.subscription.created');
              }
            }
          } catch (e) {
            console.log('⚠️ Could not process new subscription:', e.message);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        console.log('❌ Subscription canceled:', subscription.id);

        const existingSubscription = await prisma.subscription.findFirst({
          where: { stripeSubscriptionId: subscription.id }
        });

        if (existingSubscription?.pendingPlanId === 'PAYG') {
          await prisma.subscription.updateMany({
            where: { stripeSubscriptionId: subscription.id },
            data: {
              plan: 'PAYG',
              status: 'ACTIVE',
              paymentProvider: 'stripe',
              stripeSubscriptionId: null,
              stripePriceId: null,
              pendingPlanId: null,
              cancelAtPeriodEnd: false,
              minutesLimit: PLAN_CONFIG.PAYG.minutesLimit,
              callsLimit: PLAN_CONFIG.PAYG.callsLimit,
              assistantsLimit: PLAN_CONFIG.PAYG.assistantsLimit,
              phoneNumbersLimit: PLAN_CONFIG.PAYG.phoneNumbersLimit,
              includedMinutesUsed: 0,
              overageMinutes: 0,
              currentPeriodStart: new Date(),
              currentPeriodEnd: null
            }
          });

          console.log('✅ Switched to PAYG after period-end cancellation');
          break;
        }

        // Downgrade to FREE plan
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            plan: 'FREE',
            status: 'CANCELED',
            stripeSubscriptionId: null,
            stripePriceId: null,
            pendingPlanId: null,
            cancelAtPeriodEnd: false,
            voiceAddOnMinutesBalance: 0,
            writtenInteractionAddOnBalance: 0,
            // Reset limits to FREE
            minutesLimit: 0,
            callsLimit: 0,
            assistantsLimit: 0,
            phoneNumbersLimit: 0
          }
        });

        console.log('✅ Downgraded to FREE plan');
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        console.log('✅ Payment succeeded:', invoice.id);
        console.log('📋 Invoice metadata:', JSON.stringify(invoice.metadata || {}));
        console.log('📋 Invoice subscription:', invoice.subscription);

        // Check if this is an enterprise subscription payment
        if (invoice.subscription) {
          try {
            const stripeSubscription = await getStripe().subscriptions.retrieve(invoice.subscription);
            const priceId = stripeSubscription.items?.data?.[0]?.price?.id;

            if (priceId) {
              const price = await getStripe().prices.retrieve(priceId);
              console.log('💰 Invoice price metadata:', JSON.stringify(price.metadata));

              if (price.metadata?.type === 'enterprise' && price.metadata?.subscriptionId) {
                const subscriptionId = parseInt(price.metadata.subscriptionId);
                console.log('💼 Enterprise invoice payment for subscription:', subscriptionId);

                // Get existing subscription
                const existingSub = await prisma.subscription.findUnique({
                  where: { id: subscriptionId }
                });

                if (existingSub && existingSub.plan !== 'ENTERPRISE') {
                  // Activate enterprise plan if not already active
                  await prisma.subscription.update({
                    where: { id: subscriptionId },
                    data: {
                      plan: 'ENTERPRISE',
                      pendingPlanId: null,
                      enterprisePaymentStatus: 'paid',
                      status: 'ACTIVE',
                      stripeSubscriptionId: invoice.subscription,
                      stripeCustomerId: invoice.customer,
                      currentPeriodStart: new Date(),
                      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                      minutesLimit: existingSub.enterpriseMinutes || 1000,
                      concurrentLimit: existingSub.enterpriseConcurrent || 10,
                      assistantsLimit: existingSub.enterpriseAssistants || 999
                    }
                  });
                  console.log('✅ Enterprise plan activated via invoice.payment_succeeded');
                }
                break;
              }
            }
          } catch (e) {
            console.log('⚠️ Could not check enterprise status:', e.message);
          }
        }

        // Regular payment - just update status
        await prisma.subscription.updateMany({
          where: { stripeCustomerId: invoice.customer },
          data: { status: 'ACTIVE' }
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        console.log('❌ Payment failed:', invoice.id);

        await prisma.subscription.updateMany({
          where: { stripeCustomerId: invoice.customer },
          data: { status: 'PAST_DUE' }
        });

        // Get owner email and send notification
        const sub = await prisma.subscription.findFirst({
          where: { stripeCustomerId: invoice.customer },
          include: {
            business: {
              select: {
                name: true,
                users: {
                  where: { role: 'OWNER' },
                  select: { email: true },
                  take: 1
                }
              }
            }
          }
        });

        if (sub?.business.users[0]?.email) {
          await emailService.sendPaymentFailedEmail(
            sub.business.users[0].email,
            sub.business.name
          );
        }
        break;
      }

      default:
        console.log(`ℹ️ Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('❌ Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// ============================================================================
// IYZICO WEBHOOK
// ============================================================================

router.post('/iyzico-webhook', express.json(), async (req, res) => {
  console.log('📥 iyzico webhook received', {
    webhookType: req.body?.iyziEventType || req.body?.status || 'unknown',
    hasToken: Boolean(req.body?.token),
    hasConversationId: Boolean(req.body?.conversationId),
  });

  try {
    const result = await iyzicoSubscription.processWebhook(req.body);

    if (result.success) {
      res.json({ received: true });
    } else {
      console.error('❌ iyzico webhook processing failed:', result.error);
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('❌ iyzico webhook error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// ============================================================================
// IYZICO PAYMENT CALLBACK (Simple checkout - not subscription)
// ============================================================================

router.post('/iyzico-payment-callback', async (req, res) => {
  const { token } = req.body;
  const { planId, businessId } = req.query;
  const frontendUrl = runtimeConfig.frontendUrl;

  console.log('📥 iyzico payment callback received:', {
    hasToken: Boolean(token),
    planId,
    businessId
  });

  if (!token) {
    return res.redirect(`${frontendUrl}/pricing?error=missing_token`);
  }

  try {
    // Retrieve checkout form result
    const Iyzipay = (await import('iyzipay')).default;
    const iyzipay = new Iyzipay({
      apiKey: process.env.IYZICO_API_KEY,
      secretKey: process.env.IYZICO_SECRET_KEY,
      uri: process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com'
    });

    const request = {
      locale: Iyzipay.LOCALE.TR,
      conversationId: `callback-${Date.now()}`,
      token: token
    };

    iyzipay.checkoutForm.retrieve(request, async (err, result) => {
      if (err) {
        console.error('iyzico retrieve error:', err);
        return res.redirect(`${frontendUrl}/pricing?error=payment_failed`);
      }

      console.log('iyzico payment result:', result.status, result.paymentStatus);

      if (result.status === 'success' && result.paymentStatus === 'SUCCESS') {
        // Payment successful - activate subscription
        const planConfig = PLAN_CONFIG[planId];

        if (planConfig && businessId) {
          await prisma.subscription.upsert({
            where: { businessId: parseInt(businessId) },
            create: {
              businessId: parseInt(businessId),
              paymentProvider: 'iyzico',
              iyzicoPaymentId: result.paymentId,
              plan: planId,
              status: 'ACTIVE',
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              minutesLimit: planConfig.minutesLimit,
              callsLimit: planConfig.callsLimit,
              assistantsLimit: planConfig.assistantsLimit,
              phoneNumbersLimit: planConfig.phoneNumbersLimit
            },
            update: {
              paymentProvider: 'iyzico',
              iyzicoPaymentId: result.paymentId,
              plan: planId,
              status: 'ACTIVE',
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              minutesLimit: planConfig.minutesLimit,
              callsLimit: planConfig.callsLimit,
              assistantsLimit: planConfig.assistantsLimit,
              phoneNumbersLimit: planConfig.phoneNumbersLimit
            }
          });

          console.log('✅ iyzico payment successful, plan activated:', planId);
        }

        return res.redirect(`${frontendUrl}/dashboard/assistant?success=true&provider=iyzico`);
      } else {
        console.log('❌ iyzico payment failed:', result.errorMessage);
        return res.redirect(`${frontendUrl}/pricing?error=payment_failed&message=${encodeURIComponent(result.errorMessage || 'Ödeme başarısız')}`);
      }
    });
  } catch (error) {
    console.error('iyzico callback error:', error);
    return res.redirect(`${frontendUrl}/pricing?error=callback_failed`);
  }
});

// iyzico Subscription Callback - POST handler for form submission
router.post('/iyzico-subscription-callback', async (req, res) => {
  const { token } = req.body;
  const frontendUrl = runtimeConfig.frontendUrl;

  console.log('📥 iyzico subscription callback received', { tokenHash: hashValue(token) });

  if (!token) {
    return res.redirect(`${frontendUrl}/dashboard/subscription?status=error&message=missing_token`);
  }

  try {
    // Retrieve subscription checkout form result using iyzicoSubscription service
    const result = await iyzicoSubscription.retrieveCheckoutFormResult(token);

    if (!result.success) {
      console.error('iyzico callback error:', result.error);
      return res.redirect(`${frontendUrl}/dashboard/subscription?status=error`);
    }

    console.log('iyzico subscription result received', {
      success: Boolean(result?.success),
      reference: result?.subscriptionReferenceCode ? hashValue(result.subscriptionReferenceCode) : null
    });

    // Find subscription by pending token
    const subscription = await prisma.subscription.findFirst({
      where: { pendingSubscriptionToken: token }
    });

    if (subscription) {
      const planId = subscription.pendingPlanId;
      const planConfig = PLAN_CONFIG[planId] || PLAN_CONFIG.STARTER;

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          plan: planId,
          status: 'ACTIVE',
          paymentProvider: 'iyzico',
          iyzicoSubscriptionId: result.subscriptionReferenceCode,
          iyzicoReferenceCode: result.subscriptionReferenceCode,
          currentPeriodStart: new Date(result.startDate),
          currentPeriodEnd: new Date(result.endDate),
          pendingSubscriptionToken: null,
          pendingPlanId: null,
          // Set plan limits
          minutesLimit: planConfig.minutesLimit,
          callsLimit: planConfig.callsLimit,
          assistantsLimit: planConfig.assistantsLimit,
          phoneNumbersLimit: planConfig.phoneNumbersLimit
        }
      });

      console.log('✅ iyzico subscription activated:', planId);
    }

    return res.redirect(`${frontendUrl}/dashboard/subscription?status=success`);
  } catch (error) {
    console.error('iyzico subscription callback error:', error);
    return res.redirect(`${frontendUrl}/dashboard/subscription?status=error`);
  }
});

// iyzico callback - POST handler (used by iyzicoSubscription service)
router.post('/iyzico-callback', async (req, res) => {
  const { token } = req.body;
  const frontendUrl = runtimeConfig.frontendUrl;

  console.log('📥 iyzico callback received', { tokenHash: hashValue(token) });

  if (!token) {
    return res.redirect(`${frontendUrl}/dashboard/subscription?status=error&message=missing_token`);
  }

  try {
    // Retrieve subscription checkout form result using iyzicoSubscription service
    const result = await iyzicoSubscription.retrieveCheckoutFormResult(token);

    if (!result.success) {
      console.error('iyzico callback error:', result.error);
      return res.redirect(`${frontendUrl}/dashboard/subscription?status=error`);
    }

    console.log('iyzico subscription result received', {
      success: Boolean(result?.success),
      reference: result?.subscriptionReferenceCode ? hashValue(result.subscriptionReferenceCode) : null
    });

    // Find subscription by pending token
    const subscription = await prisma.subscription.findFirst({
      where: { pendingSubscriptionToken: token }
    });

    if (subscription) {
      const planId = subscription.pendingPlanId;
      const planConfig = PLAN_CONFIG[planId] || PLAN_CONFIG.STARTER;

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          plan: planId,
          status: 'ACTIVE',
          paymentProvider: 'iyzico',
          iyzicoSubscriptionId: result.subscriptionReferenceCode,
          iyzicoReferenceCode: result.subscriptionReferenceCode,
          currentPeriodStart: new Date(result.startDate),
          currentPeriodEnd: new Date(result.endDate),
          pendingSubscriptionToken: null,
          pendingPlanId: null,
          // Set plan limits
          minutesLimit: planConfig.minutesLimit,
          callsLimit: planConfig.callsLimit,
          assistantsLimit: planConfig.assistantsLimit,
          phoneNumbersLimit: planConfig.phoneNumbersLimit
        }
      });

      console.log('✅ iyzico subscription activated:', planId);
    }

    return res.redirect(`${frontendUrl}/dashboard/subscription?status=success`);
  } catch (error) {
    console.error('iyzico callback error:', error);
    return res.redirect(`${frontendUrl}/dashboard/subscription?status=error`);
  }
});

// Legacy callback (GET - for backward compatibility)
router.get('/iyzico-callback', async (req, res) => {
  const frontendUrl = runtimeConfig.frontendUrl;
  return res.redirect(`${frontendUrl}/dashboard/subscription?status=error&message=use_post`);
});

// ============================================================================
// PUBLIC ROUTES (no auth required)
// ============================================================================

// Get available plans - PUBLIC (used by pricing page before login)
// Updated: January 2026 - synced with pricing.js
router.get('/plans', async (req, res) => {
  try {
    const plans = [
      {
        id: 'FREE',
        name: 'Free',
        price: 0,
        priceTRY: 0,
        currency: 'USD',
        interval: 'month',
        features: [
          'Web voice test only (60s limit)',
          '3 AI trainings',
          '0 permanent assistants',
          'No phone number',
          'No integrations',
          'No analytics'
        ],
        limits: PLAN_CONFIG.FREE
      },
      {
        id: 'PAYG',
        name: 'Pay As You Go',
        nameTR: 'Kullandıkça Öde',
        price: 0,
        priceTRY: 0,
        currency: 'USD',
        interval: 'month',
        isPrepaid: true,
        features: [
          '1 AI assistant',
          '1 phone number',
          'Pay per minute (balance-based)',
          'Unlimited calls',
          'Unlimited trainings',
          'Basic analytics',
          'All integrations',
          'Email support'
        ],
        limits: PLAN_CONFIG.PAYG
      },
      {
        id: 'STARTER',
        name: 'Starter',
        nameTR: 'Başlangıç',
        price: 55,          // $55 USD
        priceTRY: 2499,     // ₺2.499 TRY
        currency: 'USD',
        interval: 'month',
        stripePriceId: PLAN_CONFIG.STARTER.stripePriceId,
        iyzicoPlanRef: PLAN_CONFIG.STARTER.iyzicoPlanRef,
        popular: true,
        features: [
          '5 AI assistants',
          'Shared written support pool',
          'Webchat support',
          'WhatsApp support replies',
          'Email replies',
          'No phone access',
          'Basic analytics',
          'Written add-ons available'
        ],
        limits: PLAN_CONFIG.STARTER
      },
      {
        id: 'PRO',
        name: 'Pro',
        nameTR: 'Profesyonel',
        price: 167,         // $167 USD
        priceTRY: 7499,     // ₺7.499 TRY
        currency: 'USD',
        interval: 'month',
        stripePriceId: PLAN_CONFIG.PRO.stripePriceId,
        iyzicoPlanRef: PLAN_CONFIG.PRO?.iyzicoPlanRef,
        bestValue: true,
        features: [
          '10 AI assistants',
          'Phone enabled',
          '500 minutes per month',
          'Shared written support pool',
          '2 concurrent calls',
          'Unlimited trainings',
          'Advanced analytics with AI insights',
          'All integrations',
          'Batch/outbound calls',
          'Priority support',
          'API access',
          'Overage: 23₺/min'
        ],
        limits: PLAN_CONFIG.PRO
      },
      {
        id: 'ENTERPRISE',
        name: 'Enterprise',
        nameTR: 'Kurumsal',
        price: null,
        priceTRY: null,
        currency: 'USD',
        interval: 'month',
        contactSales: true,
        stripePriceId: PLAN_CONFIG.ENTERPRISE.stripePriceId,
        iyzicoPlanRef: PLAN_CONFIG.ENTERPRISE.iyzicoPlanRef,
        features: [
          'Unlimited AI assistants',
          'Unlimited phone numbers',
          'Custom minutes allocation',
          'Custom voice cloning',
          'White-label option',
          'Dedicated account manager',
          'SLA guarantee',
          'Custom integrations'
        ],
        limits: PLAN_CONFIG.ENTERPRISE
      }
    ];

    res.json(plans);
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({ error: 'Failed to get plans' });
  }
});

// ============================================================================
// AUTHENTICATED ROUTES
// ============================================================================

router.use(authenticateToken);

// Get current subscription
router.get('/current', verifyBusinessAccess, async (req, res) => {
  try {
    const { businessId } = req.user;

    const subscription = await findSubscriptionWithBillingFallback(businessId);

    if (!subscription) {
      const entitlements = buildPhoneEntitlements({
        plan: 'FREE',
        inboundEnabled: false
      });

      return res.json({
        plan: 'FREE',
        status: 'TRIAL',
        entitlements,
        usage: {
          minutes: { used: 0, limit: 0 },
          calls: { used: 0, limit: 0 },
          assistants: { used: 0, limit: 0 },
          phoneNumbers: { used: 0, limit: 0 }
        }
      });
    }

    const effectivePlanConfig = getEffectivePlanConfig(subscription);
    const effectiveInboundEnabled = isPhoneInboundEnabledForBusinessRecord(subscription.business);
    const entitlements = buildPhoneEntitlements({
      plan: subscription.plan,
      inboundEnabled: effectiveInboundEnabled
    });
    const supportUsage = await buildSupportUsageSummary({ businessId, subscription });
    const billingPlan = getBillingPlanDefinition(subscription);
    const addOnCatalog = getAddOnCatalog(subscription.business?.country || 'TR', subscription);
    const effectiveMinutesLimit = effectivePlanConfig.includedMinutes ?? subscription.minutesLimit;
    const effectiveAssistantsLimit = effectivePlanConfig.assistantsLimit ?? subscription.assistantsLimit;
    const effectivePhoneNumbersLimit = effectivePlanConfig.phoneNumbersLimit ?? subscription.phoneNumbersLimit;
    const effectiveConcurrentLimit = effectivePlanConfig.concurrentLimit ?? subscription.concurrentLimit;
    const billingSnapshot = buildBillingSnapshot({
      subscription,
      supportUsage,
      billingPlan,
      effectiveMinutesLimit
    });

    // Calculate usage percentages
    const response = {
      ...subscription,
      entitlements,
      billingSnapshot,
      addOnCatalog,
      supportUsage,
      writtenChannelsEnabled: Boolean(
        billingPlan.channels?.webchat
        || billingPlan.channels?.whatsapp
        || billingPlan.channels?.email
      ),
      paygWalletEnabled: billingPlan.billingModel === 'payg',
      writtenInteractionsIncluded: supportUsage?.configured ? Number(supportUsage.total || 0) : 0,
      writtenInteractionsUsed: Number(supportUsage?.used || 0),
      writtenInteractionsOverage: Number(supportUsage?.overage || 0),
      writtenInteractionUnitPrice: Number(billingPlan.writtenInteractionUnitPrice || 0),
      writtenAddOnRemaining: Number(subscription.writtenInteractionAddOnBalance || 0),
      writtenInteractionsResetAt: subscription.currentPeriodEnd || null,
      voiceMinutesIncluded: Number(effectiveMinutesLimit || 0),
      voiceMinutesUsed: Number(subscription.includedMinutesUsed || 0),
      voiceMinutesOverage: Number(subscription.overageMinutes || 0),
      phoneMinuteUnitPrice: Number(billingPlan.voiceMinuteUnitPrice || 0),
      voiceAddOnRemaining: Number(subscription.voiceAddOnMinutesBalance || 0),
      voiceMinutesResetAt: subscription.currentPeriodEnd || null,
      limits: {
        minutes: effectiveMinutesLimit,
        assistants: effectiveAssistantsLimit,
        phoneNumbers: effectivePhoneNumbersLimit,
        concurrent: effectiveConcurrentLimit,
        overageRate: effectivePlanConfig.overageRate ?? subscription.overageRate,
        outbound: {
          testCallEnabled: entitlements.outbound?.testCall?.enabled ?? false,
          campaignsEnabled: entitlements.outbound?.campaigns?.enabled ?? false,
          campaignsRequiredPlan: entitlements.outbound?.campaigns?.requiredPlan || null
        }
      },
      usage: {
        minutes: {
          used: subscription.minutesUsed,
          limit: effectiveMinutesLimit,
          percentage: effectiveMinutesLimit > 0
            ? Math.round((subscription.minutesUsed / effectiveMinutesLimit) * 100)
            : 0,
          unlimited: effectiveMinutesLimit === -1 || effectiveMinutesLimit === null
        },
        calls: {
          used: subscription.callsThisMonth,
          limit: subscription.callsLimit,
          percentage: subscription.callsLimit > 0
            ? Math.round((subscription.callsThisMonth / subscription.callsLimit) * 100)
            : 0,
          unlimited: subscription.callsLimit === -1
        },
        assistants: {
          used: subscription.assistantsCreated,
          limit: effectiveAssistantsLimit
        },
        phoneNumbers: {
          used: subscription.business.phoneNumbers?.length || 0,
          limit: effectivePhoneNumbersLimit
        },
        writtenInteractions: {
          included: supportUsage?.configured ? Number(supportUsage.total || 0) : 0,
          used: Number(supportUsage?.used || 0),
          overage: Number(supportUsage?.overage || 0),
          addOnRemaining: Number(subscription.writtenInteractionAddOnBalance || 0)
        },
        voiceMinutes: {
          included: Number(effectiveMinutesLimit || 0),
          used: Number(subscription.includedMinutesUsed || 0),
          overage: Number(subscription.overageMinutes || 0),
          addOnRemaining: Number(subscription.voiceAddOnMinutesBalance || 0)
        }
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

router.post('/addons/checkout', verifyBusinessAccess, async (req, res) => {
  try {
    const { businessId } = req.user;
    const { kind, packageId } = req.body || {};

    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      include: {
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
      }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const billingPlan = getBillingPlanDefinition(subscription);
    const normalizedKind = String(kind || '').trim().toUpperCase();
    const pool = normalizedKind === 'VOICE' ? 'voice' : 'written';
    const selectedPackage = (getAddOnCatalog(subscription.business?.country || 'TR', subscription)[pool] || [])
      .find((item) => item.id === packageId);

    if (!selectedPackage) {
      return res.status(400).json({ error: 'Invalid add-on package' });
    }

    if (subscription.plan === 'TRIAL' || subscription.plan === 'FREE') {
      return res.status(400).json({ error: 'Add-ons are not available on this plan' });
    }

    const stripeCustomerId = await ensureStripeCustomerForSubscription(
      subscription,
      subscription.business?.users?.[0]?.email || req.user?.email
    );
    const country = subscription.business?.country || 'TR';
    const frontendUrl = runtimeConfig.frontendUrl;

    const session = await stripeService.createAddonCheckoutSession({
      stripeCustomerId,
      countryCode: country,
      currency: country === 'TR' ? 'TRY' : country === 'BR' ? 'BRL' : 'USD',
      successUrl: `${frontendUrl}/dashboard/subscription?addon=success&addon_kind=${normalizedKind}`,
      cancelUrl: `${frontendUrl}/dashboard/subscription?addon=cancel&addon_kind=${normalizedKind}`,
      businessId: businessId.toString(),
      subscriptionId: subscription.id.toString(),
      addOnKind: normalizedKind,
      packageId: selectedPackage.id,
      quantity: selectedPackage.quantity,
      unitPrice: selectedPackage.unitPrice,
      amount: selectedPackage.amount
    });

    res.json({
      success: true,
      provider: 'stripe',
      sessionUrl: session.url,
      sessionId: session.id
    });
  } catch (error) {
    console.error('Create add-on checkout error:', error);
    res.status(500).json({ error: error.message || 'Failed to create add-on checkout' });
  }
});

// Get payment provider for current business
router.get('/payment-provider', verifyBusinessAccess, async (req, res) => {
  try {
    const { businessId } = req.user;
    const provider = await paymentProvider.getProviderForBusiness(businessId);

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { country: true }
    });

    res.json({
      provider,
      country: business?.country || 'TR',
      isIyzico: provider === 'iyzico',
      isStripe: provider === 'stripe'
    });
  } catch (error) {
    console.error('Get payment provider error:', error);
    res.status(500).json({ error: 'Failed to get payment provider' });
  }
});

// Create checkout session - Automatically selects Stripe or iyzico based on country
router.post('/create-checkout', verifyBusinessAccess, async (req, res) => {
  try {
    const { businessId } = req.user;
    const { priceId, planId, forceProvider } = req.body;

    if (!priceId && !planId) {
      return res.status(400).json({ error: 'Price ID or Plan ID required' });
    }

    // Get business to determine provider
    const user = await prisma.user.findFirst({
      where: { businessId },
      include: { business: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Determine payment provider (can be forced or auto-detected)
    const provider = forceProvider || paymentProvider.getProviderForCountry(user.business.country);

    console.log(`💳 Creating checkout for business ${businessId} with provider: ${provider} (country: ${user.business.country})`);

    // ========== IYZICO CHECKOUT ==========
    if (provider === 'iyzico') {
      const finalPlanId = planId || resolvePlanFromStripePriceId(priceId);

      if (!finalPlanId || finalPlanId === 'FREE') {
        return res.status(400).json({ error: 'Invalid plan for iyzico' });
      }

      const result = await iyzicoSubscription.initializeCheckoutForm(businessId, finalPlanId);

      if (!result.success) {
        return res.status(400).json({
          error: 'Failed to initialize iyzico checkout',
          details: result.error
        });
      }

      return res.json({
        provider: 'iyzico',
        checkoutFormContent: result.checkoutFormContent,
        token: result.token,
        tokenExpireTime: result.tokenExpireTime
      });
    }

    // ========== STRIPE CHECKOUT ==========
    // Get price ID from plan ID if not provided
    let finalPriceId = priceId;
    if (!finalPriceId && planId) {
      finalPriceId = resolveStripePriceIdForPlan(
        planId,
        user.business.country,
        PLAN_CONFIG[planId]?.stripePriceId
      );
    }

    if (!finalPriceId) {
      return res.status(400).json({ error: 'Invalid plan or price ID' });
    }

    const stripeCustomerId = await ensureStripeCustomerForBusiness({
      businessId,
      ownerEmail: user.email,
      businessName: user.business.name,
      countryCode: user.business.country || 'TR'
    });

    // Create checkout session
    const frontendUrl = runtimeConfig.frontendUrl;
    const session = await getStripe().checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: finalPriceId,
          quantity: 1
        }
      ],
      success_url: `${frontendUrl}/dashboard/assistant?success=true&provider=stripe`,
      cancel_url: `${frontendUrl}/pricing?canceled=true`,
      metadata: {
        businessId: businessId.toString(),
        priceId: finalPriceId
      }
    });

    res.json({
      provider: 'stripe',
      sessionUrl: session.url,
      sessionId: session.id
    });
  } catch (error) {
    console.error('Create checkout error:', error);
    res.status(500).json({
      error: 'Failed to create checkout',
      details: error.message
    });
  }
});

// Cancel subscription - supports both Stripe and iyzico
router.post('/cancel', verifyBusinessAccess, async (req, res) => {
  try {
    const { businessId } = req.user;

    const subscription = await prisma.subscription.findUnique({
      where: { businessId }
    });

    if (!subscription) {
      return res.status(400).json({ error: 'No subscription found' });
    }

    // Handle based on payment provider
    if (subscription.paymentProvider === 'iyzico' && subscription.iyzicoSubscriptionId) {
      // Cancel iyzico subscription
      const result = await iyzicoSubscription.cancelSubscription(subscription.iyzicoSubscriptionId);

      if (!result.success) {
        return res.status(400).json({ error: result.error || 'Failed to cancel iyzico subscription' });
      }

      await prisma.subscription.update({
        where: { businessId },
        data: {
          cancelAtPeriodEnd: true
        }
      });

      return res.json({
        success: true,
        provider: 'iyzico',
        message: 'Aboneliğiniz iptal edildi'
      });
    }

    // Stripe cancellation
    if (!subscription.stripeSubscriptionId) {
      return res.status(400).json({ error: 'No active subscription' });
    }

    // Cancel at period end (don't cancel immediately)
    await getStripe().subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true
    });

    // Update database
    await prisma.subscription.update({
      where: { businessId },
      data: {
        cancelAtPeriodEnd: true
      }
    });

    res.json({
      success: true,
      provider: 'stripe',
      message: 'Subscription will be canceled at the end of the current period'
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// Reactivate canceled subscription
router.post('/reactivate', verifyBusinessAccess, async (req, res) => {
  try {
    const { businessId } = req.user;

    const subscription = await prisma.subscription.findUnique({
      where: { businessId }
    });

    if (!subscription) {
      return res.status(400).json({ error: 'No subscription found' });
    }

    // Handle based on payment provider
    if (subscription.paymentProvider === 'iyzico') {
      // iyzico doesn't support reactivation the same way
      // User needs to create a new subscription
      return res.status(400).json({
        error: 'iyzico subscriptions cannot be reactivated. Please create a new subscription.',
        needsNewSubscription: true
      });
    }

    // Stripe reactivation
    if (!subscription.stripeSubscriptionId) {
      return res.status(400).json({ error: 'No subscription found' });
    }

    // Remove cancel_at_period_end
    await getStripe().subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: false
    });

    await prisma.subscription.update({
      where: { businessId },
      data: {
        cancelAtPeriodEnd: false
      }
    });

    res.json({
      success: true,
      message: 'Subscription reactivated'
    });
  } catch (error) {
    console.error('Reactivate subscription error:', error);
    res.status(500).json({ error: 'Failed to reactivate subscription' });
  }
});

// Undo a scheduled downgrade / scheduled PAYG switch
router.post('/undo-scheduled-change', verifyBusinessAccess, async (req, res) => {
  try {
    const { businessId } = req.user;

    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      select: {
        id: true,
        businessId: true,
        plan: true,
        status: true,
        paymentProvider: true,
        stripeSubscriptionId: true,
        stripePriceId: true,
        pendingPlanId: true,
        cancelAtPeriodEnd: true
      }
    });

    if (!subscription) {
      return res.status(400).json({ error: 'No subscription found' });
    }

    if (!subscription.pendingPlanId) {
      return res.status(400).json({ error: 'No scheduled plan change found' });
    }

    if (subscription.paymentProvider === 'iyzico') {
      return res.status(400).json({
        error: 'Scheduled plan changes cannot be reverted for iyzico subscriptions.'
      });
    }

    const user = await prisma.user.findFirst({
      where: { businessId },
      include: { business: true }
    });

    const countryCode = user?.business?.country || 'TR';
    const currentPlanPriceId = subscription.stripePriceId
      || resolveStripePriceIdForPlan(
        subscription.plan,
        countryCode,
        PLAN_CONFIG[subscription.plan]?.stripePriceId
      );

    if (subscription.pendingPlanId === 'PAYG') {
      if (subscription.stripeSubscriptionId) {
        await getStripe().subscriptions.update(subscription.stripeSubscriptionId, {
          cancel_at_period_end: false,
          metadata: {
            pendingPlanId: ''
          }
        });
      }

      await prisma.subscription.update({
        where: { businessId },
        data: {
          pendingPlanId: null,
          cancelAtPeriodEnd: false
        }
      });

      return res.json({
        success: true,
        message: 'Scheduled plan change reverted'
      });
    }

    if (!subscription.stripeSubscriptionId) {
      await prisma.subscription.update({
        where: { businessId },
        data: {
          pendingPlanId: null
        }
      });

      return res.json({
        success: true,
        message: 'Scheduled plan change reverted'
      });
    }

    if (!currentPlanPriceId) {
      return res.status(400).json({ error: 'Current plan price could not be resolved' });
    }

    const stripeSubscription = await getStripeSubscriptionIfExists(subscription.stripeSubscriptionId);
    if (!stripeSubscription) {
      await prisma.subscription.update({
        where: { businessId },
        data: {
          stripeSubscriptionId: null,
          stripePriceId: null,
          pendingPlanId: null,
          cancelAtPeriodEnd: false
        }
      });

      return res.json({
        success: true,
        message: 'Scheduled plan change reverted'
      });
    }
    const subscriptionItem = stripeSubscription?.items?.data?.[0];

    if (!subscriptionItem?.id) {
      return res.status(400).json({ error: 'Subscription item not found' });
    }

    await getStripe().subscriptions.update(subscription.stripeSubscriptionId, {
      items: [{
        id: subscriptionItem.id,
        price: currentPlanPriceId
      }],
      proration_behavior: 'none',
      billing_cycle_anchor: 'unchanged',
      metadata: {
        planId: subscription.plan,
        pendingPlanId: ''
      }
    });

    await prisma.subscription.update({
      where: { businessId },
      data: {
        pendingPlanId: null,
        stripePriceId: currentPlanPriceId
      }
    });

    res.json({
      success: true,
      message: 'Scheduled plan change reverted'
    });
  } catch (error) {
    console.error('Undo scheduled change error:', error);
    res.status(500).json({ error: 'Failed to undo scheduled plan change' });
  }
});

// ============================================================================
// UPGRADE ENDPOINT - iyzico Subscription API with Plan References
// ============================================================================

router.post('/upgrade', verifyBusinessAccess, async (req, res) => {
  try {
    const { businessId } = req.user;
    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required' });
    }

    // Normalize planId to uppercase and map aliases
    let normalizedPlanId = planId.toUpperCase();

    // Map common aliases (BASIC is legacy alias for STARTER)
    const planAliases = {
      'BASIC': 'STARTER'
    };
    normalizedPlanId = planAliases[normalizedPlanId] || normalizedPlanId;

    if (!PLAN_CONFIG[normalizedPlanId] || normalizedPlanId === 'FREE') {
      return res.status(400).json({ error: 'Invalid plan ID' });
    }

    // Handle PAYG plan switch through the shared transition helper
    if (normalizedPlanId === 'PAYG') {
      const result = await switchBusinessToPayg({ businessId });
      if (result.immediate) {
        console.log(`✅ Switched to PAYG for business ${businessId}`);
        return res.json({
          success: true,
          message: 'Kullandıkça öde planına geçildi. Bakiye yükleyerek kullanmaya başlayabilirsiniz.',
          type: 'payg_switch'
        });
      }

      console.log(`⏰ Scheduled PAYG switch for business ${businessId} at ${result.periodEnd}`);
      return res.json({
        success: true,
        message: 'Mevcut dönem sonunda Kullandıkça Öde planına geçilecek.',
        type: 'downgrade',
        effectiveDate: result.periodEnd
      });
    }

    // Get user and business info
    const user = await prisma.user.findFirst({
      where: { businessId },
      include: { business: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Determine payment provider based on country
    const provider = paymentProvider.getProviderForCountry(user.business.country);

    console.log(`💳 Upgrade request for business ${businessId}, plan: ${normalizedPlanId}, provider: ${provider}`);

    // ========== IYZICO SUBSCRIPTION API ==========
    if (provider === 'iyzico') {
      // Use iyzicoSubscription service for checkout form initialization
      const result = await iyzicoSubscription.initializeCheckoutForm(businessId, normalizedPlanId);

      if (!result.success) {
        console.error('iyzico subscription error:', result.error);
        return res.status(500).json({ error: result.error || 'Abonelik başlatılamadı' });
      }

      // Save pending subscription info
      await prisma.subscription.upsert({
        where: { businessId },
        create: {
          businessId,
          paymentProvider: 'iyzico',
          plan: 'FREE',
          status: 'INCOMPLETE',
          pendingSubscriptionToken: result.token,
          pendingPlanId: normalizedPlanId
        },
        update: {
          pendingSubscriptionToken: result.token,
          pendingPlanId: normalizedPlanId
        }
      });

      return res.json({
        provider: 'iyzico',
        checkoutFormContent: result.checkoutFormContent,
        token: result.token,
        tokenExpireTime: result.tokenExpireTime
      });
    }

    // ========== STRIPE CHECKOUT ==========
    const planConfig = PLAN_CONFIG[normalizedPlanId];

    // Determine price ID based on country
    const priceId = resolveStripePriceIdForPlan(
      normalizedPlanId,
      user.business.country,
      planConfig.stripePriceId
    );

    if (!priceId) {
      return res.status(400).json({ error: 'Stripe price not configured for this plan' });
    }

    const stripeCustomerId = await ensureStripeCustomerForBusiness({
      businessId,
      ownerEmail: user.email,
      businessName: user.business.name,
      countryCode: user.business.country || 'TR'
    });

    // Check if user already has an active subscription
    const currentSubscription = await prisma.subscription.findUnique({
      where: { businessId }
    });

    const frontendUrl = runtimeConfig.frontendUrl;

    // If already has subscription, update it (upgrade/downgrade)
    if (currentSubscription?.stripeSubscriptionId) {
      const stripeSubscription = await getStripeSubscriptionIfExists(currentSubscription.stripeSubscriptionId);

      if (!stripeSubscription) {
        console.warn(
          `⚠️ Falling back to new checkout for business ${businessId}; ` +
          `stored Stripe subscription ${currentSubscription.stripeSubscriptionId} is missing.`
        );

        await prisma.subscription.update({
          where: { businessId },
          data: {
            stripeSubscriptionId: null,
            stripePriceId: null,
            pendingPlanId: null,
            cancelAtPeriodEnd: false
          }
        });
      }

      // CHECK: If subscription is canceled, reactivate it + change plan
      if (stripeSubscription?.cancel_at_period_end) {
        // Reactivate subscription + change to new plan
        await getStripe().subscriptions.update(stripeSubscription.id, {
          cancel_at_period_end: false, // Undo cancellation
          items: [{
            id: stripeSubscription.items.data[0].id,
            price: priceId
          }],
          proration_behavior: 'none', // No immediate charge, will charge at next period
          metadata: {
            planId: normalizedPlanId
          }
        });

        // Update database
        await prisma.subscription.update({
          where: { businessId },
          data: {
            plan: normalizedPlanId,
            cancelAtPeriodEnd: false,
            minutesLimit: planConfig.minutesLimit,
            callsLimit: planConfig.callsLimit,
            assistantsLimit: planConfig.assistantsLimit,
            phoneNumbersLimit: planConfig.phoneNumbersLimit
          }
        });

        console.log(`✅ Reactivated and changed plan for business ${businessId}: ${normalizedPlanId}`);

        return res.json({
          provider: 'stripe',
          success: true,
          message: 'Subscription reactivated with new plan',
          type: 'reactivate',
          effectiveDate: new Date(stripeSubscription.current_period_end * 1000)
        });
      }

      // Get current plan level
      if (stripeSubscription) {
        const planLevels = { STARTER: 1, PRO: 2, ENTERPRISE: 3 };
        const currentLevel = planLevels[currentSubscription.plan] || 0;
        const newLevel = planLevels[normalizedPlanId] || 0;

        // Determine if upgrade or downgrade
        const isUpgrade = newLevel > currentLevel;

        if (isUpgrade) {
          // UPGRADE: Immediate with proration
          await getStripe().subscriptions.update(stripeSubscription.id, {
            items: [{
              id: stripeSubscription.items.data[0].id,
              price: priceId
            }],
            proration_behavior: 'always_invoice', // Invoice and attempt to collect the upgrade difference now
            payment_behavior: 'error_if_incomplete',
            metadata: {
              planId: normalizedPlanId
            }
          });

          // Update database
          await prisma.subscription.update({
            where: { businessId },
            data: {
              plan: normalizedPlanId,
              minutesLimit: planConfig.minutesLimit,
              callsLimit: planConfig.callsLimit,
              assistantsLimit: planConfig.assistantsLimit,
              phoneNumbersLimit: planConfig.phoneNumbersLimit
            }
          });

          console.log(`✅ Upgraded subscription for business ${businessId}: ${currentSubscription.plan} → ${normalizedPlanId}`);

          return res.json({
            provider: 'stripe',
            success: true,
            message: 'Plan upgraded successfully',
            type: 'upgrade'
          });
        } else {
          // DOWNGRADE: Schedule for end of period
          await prisma.subscription.update({
            where: { businessId },
            data: {
              pendingPlanId: normalizedPlanId
            }
          });

          try {
            await getStripe().subscriptions.update(stripeSubscription.id, {
              items: [{
                id: stripeSubscription.items.data[0].id,
                price: priceId
              }],
              proration_behavior: 'none', // No charge now
              billing_cycle_anchor: 'unchanged', // Keep current billing cycle
              metadata: {
                pendingPlanId: normalizedPlanId
              }
            });
          } catch (stripeUpdateError) {
            await prisma.subscription.update({
              where: { businessId },
              data: {
                pendingPlanId: currentSubscription.pendingPlanId || null
              }
            });
            throw stripeUpdateError;
          }

          console.log(`⏰ Scheduled downgrade for business ${businessId}: ${currentSubscription.plan} → ${normalizedPlanId} (at period end)`);

          return res.json({
            provider: 'stripe',
            success: true,
            message: 'Plan will be downgraded at the end of current billing period',
            type: 'downgrade',
            effectiveDate: new Date(stripeSubscription.current_period_end * 1000)
          });
        }
      }
    }

    // NEW SUBSCRIPTION: Create checkout session
    const session = await getStripe().checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      success_url: `${frontendUrl}/dashboard/subscription?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/pricing?canceled=true`,
      metadata: {
        businessId: businessId.toString(),
        priceId: priceId,
        planId: normalizedPlanId
      }
    });

    return res.json({
      provider: 'stripe',
      sessionUrl: session.url,
      sessionId: session.id,
      type: 'new'
    });
  } catch (error) {
    console.error('Upgrade error:', error);
    res.status(500).json({
      error: 'Upgrade failed',
      details: error.message
    });
  }
});

// Verify Stripe checkout session and activate subscription
router.get('/verify-session', authenticateToken, async (req, res) => {
  try {
    const { session_id } = req.query;
    const { businessId } = req;

    if (!session_id) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    // Retrieve the session from Stripe
    const session = await getStripe().checkout.sessions.retrieve(session_id);

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    // Get subscription details
    const stripeSubscription = await getStripe().subscriptions.retrieve(session.subscription);
    const planId = session.metadata.planId;
    const planConfig = PLAN_CONFIG[planId];

    if (!planConfig) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    // Convert Unix timestamps to Date objects
    const periodStart = stripeSubscription.current_period_start
      ? new Date(stripeSubscription.current_period_start * 1000)
      : new Date();
    const periodEnd = stripeSubscription.current_period_end
      ? new Date(stripeSubscription.current_period_end * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    console.log('📅 Subscription dates:', { periodStart, periodEnd });

    // Activate subscription in database
    await prisma.subscription.upsert({
      where: { businessId },
      create: {
        businessId,
        plan: planId,
        status: 'ACTIVE',
        paymentProvider: 'stripe',
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        minutesLimit: planConfig.minutesLimit,
        callsLimit: planConfig.callsLimit,
        assistantsLimit: planConfig.assistantsLimit,
        phoneNumbersLimit: planConfig.phoneNumbersLimit
      },
      update: {
        plan: planId,
        status: 'ACTIVE',
        paymentProvider: 'stripe',
        stripeSubscriptionId: session.subscription,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        minutesLimit: planConfig.minutesLimit,
        callsLimit: planConfig.callsLimit,
        assistantsLimit: planConfig.assistantsLimit,
        phoneNumbersLimit: planConfig.phoneNumbersLimit
      }
    });

    console.log(`✅ Subscription activated for business ${businessId}, plan: ${planId}`);

    return res.json({
      success: true,
      plan: planId,
      status: 'ACTIVE'
    });
  } catch (error) {
    console.error('Verify session error:', error);
    return res.status(500).json({ error: 'Failed to verify session' });
  }
});

// Create portal session (for managing payment methods)
router.post('/create-portal-session', verifyBusinessAccess, async (req, res) => {
  try {
    const { businessId } = req.user;

    const subscription = await prisma.subscription.findUnique({
      where: { businessId }
    });

    if (!subscription?.stripeCustomerId) {
      return res.status(400).json({ error: 'No Stripe customer found' });
    }

    const frontendUrl = runtimeConfig.frontendUrl;
    const session = await getStripe().billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${frontendUrl}/dashboard/settings?tab=billing`
    });

    res.json({
      portalUrl: session.url
    });
  } catch (error) {
    console.error('Create portal session error:', error);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

// Cancel subscription (schedules cancellation at period end)
router.post('/cancel', authenticateToken, async (req, res) => {
  try {
    const { businessId } = req;

    const subscription = await prisma.subscription.findUnique({
      where: { businessId }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No subscription found' });
    }

    if (!subscription.stripeSubscriptionId) {
      return res.status(400).json({ error: 'No Stripe subscription found' });
    }

    // Cancel at period end (user keeps access until current period ends)
    const canceledSubscription = await getStripe().subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        cancel_at_period_end: true
      }
    );

    // Update database
    await prisma.subscription.update({
      where: { businessId },
      data: {
        cancelAtPeriodEnd: true
      }
    });

    console.log(`✅ Subscription canceled at period end for business ${businessId}`);

    return res.json({
      success: true,
      message: 'Subscription will be canceled at period end',
      cancelAt: new Date(canceledSubscription.current_period_end * 1000)
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    return res.status(500).json({
      error: 'Failed to cancel subscription',
      details: error.message
    });
  }
});

// GET /api/subscription/billing-history
router.get('/billing-history', authenticateToken, async (req, res) => {
  try {
    const { businessId } = req;

    const subscription = await findSubscriptionWithBillingFallback(businessId);

    if (!subscription) {
      return res.json({ history: [] });
    }

    // Mock billing history for now (Stripe webhook'tan gelecek)
    const pricedPlan = getPlanWithPricing(
      subscription.plan,
      subscription.business?.country || 'TR'
    );
    const enterprisePrice = Number.parseFloat(subscription.enterprisePrice);
    const amount = Number.isFinite(enterprisePrice)
      ? enterprisePrice
      : (pricedPlan?.price ?? 0);

    const history = [
      {
        id: 1,
        date: new Date().toISOString(),
        amount,
        currency: pricedPlan?.currency || 'TRY',
        status: 'paid',
        plan: subscription.plan,
        period: 'monthly'
      }
    ];

    res.json({ history });
  } catch (error) {
    console.error('Get billing history error:', error);
    res.status(500).json({ error: 'Failed to fetch billing history' });
  }
});

// ============================================================================
// NEW PRICING SYSTEM ENDPOINTS
// ============================================================================

// POST /api/subscription/start-trial - Start trial for new user
router.post('/start-trial', verifyBusinessAccess, async (req, res) => {
  try {
    const { businessId } = req.user;

    // Check if trial already used (check if trialMinutesUsed > 0 or trialChatExpiry passed)
    const existingSub = await prisma.subscription.findUnique({
      where: { businessId }
    });

    // Trial is "used" if minutes are exhausted or chat trial has expired
    if (existingSub?.trialMinutesUsed >= 15) {
      return res.status(400).json({ error: 'Trial already used' });
    }

    const now = new Date();
    const trialChatExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Create or update subscription to TRIAL
    const subscription = await prisma.subscription.upsert({
      where: { businessId },
      create: {
        businessId,
        plan: 'TRIAL',
        status: 'ACTIVE',
        trialMinutesUsed: 0,
        trialChatExpiry,
        currentPeriodStart: now,
        currentPeriodEnd: trialChatExpiry
      },
      update: {
        plan: 'TRIAL',
        status: 'ACTIVE',
        trialMinutesUsed: 0,
        trialChatExpiry,
        currentPeriodStart: now,
        currentPeriodEnd: trialChatExpiry
      }
    });

    console.log(`✅ Trial started for business ${businessId}`);

    res.json({
      success: true,
      subscription: {
        plan: 'TRIAL',
        trialMinutes: 15,
        trialChatExpiry,
        status: 'active'
      }
    });
  } catch (error) {
    console.error('Start trial error:', error);
    res.status(500).json({ error: 'Failed to start trial' });
  }
});

// POST /api/subscription/switch-to-payg - Switch to PAYG plan
// If user has active paid subscription, schedule downgrade at period end
router.post('/switch-to-payg', verifyBusinessAccess, async (req, res) => {
  try {
    const { businessId } = req.user;
    const { force } = req.body; // force=true for immediate switch (admin only or free plans)
    const result = await switchBusinessToPayg({ businessId, force: Boolean(force) });

    if (result.immediate) {
      console.log(`✅ Switched to PAYG for business ${businessId} (immediate)`);
      return res.json({
        success: true,
        subscription: {
          plan: 'PAYG',
          balance: result.subscription?.balance || 0,
          status: 'active'
        },
        message: 'Switched to PAYG. Please top up your balance to start using.',
        type: 'payg_switch'
      });
    }

    console.log(`⏰ Scheduled PAYG switch for business ${businessId}: at ${result.periodEnd}`);
    return res.json({
      success: true,
      scheduled: true,
      subscription: {
        plan: result.subscription?.plan,
        scheduledPlan: 'PAYG',
        periodEnd: result.periodEnd,
        status: 'active'
      },
      message: `Plan will be changed to PAYG at the end of current billing period (${new Date(result.periodEnd).toLocaleDateString('tr-TR')}). You can continue using your current plan until then.`,
      type: 'downgrade',
      effectiveDate: result.periodEnd
    });
  } catch (error) {
    console.error('Switch to PAYG error:', error);
    res.status(500).json({ error: 'Failed to switch to PAYG' });
  }
});

// GET /api/subscription/can-make-call - Check if user can make a call
router.get('/can-make-call', verifyBusinessAccess, async (req, res) => {
  try {
    const { businessId } = req.user;

    const subscription = await prisma.subscription.findUnique({
      where: { businessId }
    });

    if (!subscription) {
      return res.json({
        canMakeCall: false,
        reason: 'No subscription found'
      });
    }

    const plan = subscription.plan;

    // TRIAL plan check
    if (plan === 'TRIAL') {
      const minutesUsed = subscription.trialMinutesUsed || 0;
      if (minutesUsed >= 15) {
        return res.json({
          canMakeCall: false,
          reason: 'Trial minutes exhausted',
          trialExpired: true
        });
      }
      return res.json({
        canMakeCall: true,
        minutesRemaining: 15 - minutesUsed,
        chargeType: 'TRIAL'
      });
    }

    // PAYG plan check
    if (plan === 'PAYG') {
      const balance = subscription.balance || 0;
      const pricePerMinute = 23; // TL
      if (balance < pricePerMinute) {
        return res.json({
          canMakeCall: false,
          reason: 'Insufficient balance',
          balance,
          minRequired: pricePerMinute
        });
      }
      return res.json({
        canMakeCall: true,
        balance,
        minutesAvailable: Math.floor(balance / pricePerMinute),
        chargeType: 'BALANCE'
      });
    }

    // STARTER/PRO/ENTERPRISE - check included minutes and balance
    const includedUsed = subscription.includedMinutesUsed || 0;
    const includedLimit = plan === 'STARTER' ? 150 : plan === 'PRO' ? 500 : 1000;
    const balance = subscription.balance || 0;
    const overageRate = plan === 'STARTER' ? 19 : plan === 'PRO' ? 16 : 13;

    if (includedUsed < includedLimit) {
      return res.json({
        canMakeCall: true,
        minutesRemaining: includedLimit - includedUsed,
        chargeType: 'INCLUDED'
      });
    }

    // Included exhausted, check balance for overage
    if (balance >= overageRate) {
      return res.json({
        canMakeCall: true,
        balance,
        chargeType: 'OVERAGE',
        overageRate
      });
    }

    return res.json({
      canMakeCall: false,
      reason: 'Included minutes exhausted and insufficient balance for overage',
      includedUsed,
      includedLimit,
      balance,
      overageRate
    });
  } catch (error) {
    console.error('Can make call check error:', error);
    res.status(500).json({ error: 'Failed to check call eligibility' });
  }
});

export default router;
