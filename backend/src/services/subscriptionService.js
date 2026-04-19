// ============================================================================
// SUBSCRIPTION SERVICE - Abonelik Yönetimi
// ============================================================================
// FILE: backend/src/services/subscriptionService.js
//
// Abonelik yönetimi:
// - startTrial: Deneme başlat
// - switchToPayg: PAYG'ye geç
// - upgradePlan: Plan yükselt
// - canMakeCall: Arama yapılabilir mi
// - getSubscriptionDetails: Abonelik detayları
// ============================================================================

import prisma from '../prismaClient.js';
import {
  getPlanConfig,
  getIncludedMinutes,
  getConcurrentLimit,
  getAssistantsLimit,
  getPricePerMinute
} from '../config/plans.js';
import { getEffectivePlanConfig } from './planConfig.js';

/**
 * Deneme başlat
 * @param {number} businessId - Business ID
 * @returns {object} Subscription
 */
export async function startTrial(businessId) {
  try {
    console.log(`🎯 Starting trial for business ${businessId}`);

    const now = new Date();
    const trialChatExpiry = new Date(now);
    trialChatExpiry.setDate(trialChatExpiry.getDate() + 7); // 7 gün chat

    // Check if subscription exists
    const existing = await prisma.subscription.findUnique({
      where: { businessId }
    });

    if (existing) {
      // Update to trial
      const updated = await prisma.subscription.update({
        where: { businessId },
        data: {
          plan: 'TRIAL',
          status: 'TRIAL',
          trialStartDate: now,
          trialChatExpiry,
          trialMinutesUsed: 0,
          includedMinutesUsed: 0,
          concurrentLimit: 1,
          assistantsCreated: 0
        }
      });

      console.log(`✅ Trial started (updated) for business ${businessId}`);
      return updated;
    }

    // Create new subscription
    const subscription = await prisma.subscription.create({
      data: {
        businessId,
        plan: 'TRIAL',
        status: 'TRIAL',
        trialStartDate: now,
        trialChatExpiry,
        trialMinutesUsed: 0,
        minutesLimit: 15,
        concurrentLimit: 1,
        assistantsLimit: 1,
        phoneNumbersLimit: 1
      }
    });

    console.log(`✅ Trial started (created) for business ${businessId}`);
    return subscription;
  } catch (error) {
    console.error('❌ Start trial error:', error);
    throw error;
  }
}

/**
 * PAYG'ye geç
 * @param {number} businessId - Business ID
 * @returns {object} Subscription
 */
export async function switchToPayg(businessId) {
  try {
    console.log(`💳 Switching to PAYG for business ${businessId}`);

    const subscription = await prisma.subscription.findUnique({
      where: { businessId }
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const updated = await prisma.subscription.update({
      where: { businessId },
      data: {
        plan: 'PAYG',
        status: 'ACTIVE',
        // Reset trial data
        trialMinutesUsed: 0,
        trialChatExpiry: null,
        trialStartDate: null,
        // Set PAYG limits
        minutesLimit: 0,
        concurrentLimit: 1,
        assistantsLimit: 1,
        phoneNumbersLimit: 1,
        // Reset included minutes
        includedMinutesUsed: 0,
        includedMinutesResetAt: null
      }
    });

    console.log(`✅ Switched to PAYG for business ${businessId}`);
    return updated;
  } catch (error) {
    console.error('❌ Switch to PAYG error:', error);
    throw error;
  }
}

/**
 * Plan yükselt
 * @param {number} businessId - Business ID
 * @param {string} newPlan - Yeni plan (STARTER, PRO, ENTERPRISE)
 * @param {string} countryCode - Ülke kodu
 * @returns {object} Subscription
 */
export async function upgradePlan(businessId, newPlan, countryCode = 'TR') {
  try {
    console.log(`⬆️ Upgrading to ${newPlan} for business ${businessId}`);

    const subscription = await prisma.subscription.findUnique({
      where: { businessId }
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const now = new Date();
    const resetAt = new Date(now);
    resetAt.setDate(resetAt.getDate() + 30); // 30 gün sonra reset

    const planConfig = getPlanConfig(newPlan);
    const includedMinutes = getIncludedMinutes(newPlan, countryCode);
    const concurrentLimit = getConcurrentLimit(newPlan, countryCode);
    const assistantsLimit = getAssistantsLimit(newPlan, countryCode);

    const updated = await prisma.subscription.update({
      where: { businessId },
      data: {
        plan: newPlan,
        status: 'ACTIVE',
        // Set plan limits
        minutesLimit: includedMinutes,
        concurrentLimit,
        assistantsLimit,
        phoneNumbersLimit: planConfig.phoneNumbersLimit,
        // Reset included minutes
        includedMinutesUsed: 0,
        includedMinutesResetAt: resetAt,
        // Reset warnings
        packageWarningAt80: false,
        creditWarningAt80: false,
        overageLimitReached: false,
        // Clear trial data
        trialMinutesUsed: 0,
        trialChatExpiry: null,
        trialStartDate: null
      }
    });

    console.log(`✅ Upgraded to ${newPlan} for business ${businessId}`);
    return updated;
  } catch (error) {
    console.error('❌ Upgrade plan error:', error);
    throw error;
  }
}

/**
 * Arama yapılabilir mi kontrol et (P0-3: Balance as Wallet)
 * @param {number} businessId - Business ID
 * @returns {object} { canMakeCall, reason, details }
 */
export async function canMakeCall(businessId) {
  // Use new balance-aware authorization (P0-3)
  const chargeCalculator = (await import('./chargeCalculator.js')).default;
  return await chargeCalculator.canMakeCallWithBalance(businessId);
}

/**
 * DEPRECATED: Old canMakeCall logic (kept for reference)
 * @deprecated Use chargeCalculator.canMakeCallWithBalance instead
 */
export async function canMakeCall_OLD(businessId) {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      include: {
        business: {
          select: { country: true }
        }
      }
    });

    if (!subscription) {
      return { canMakeCall: false, reason: 'NO_SUBSCRIPTION' };
    }

    const country = subscription.business?.country || 'TR';
    const plan = subscription.plan;
    const effectivePlanConfig = getEffectivePlanConfig(subscription);
    const effectiveConcurrentLimit = effectivePlanConfig.concurrentLimit;

    // Check subscription status
    if (subscription.status !== 'ACTIVE' && subscription.status !== 'TRIAL') {
      return {
        canMakeCall: false,
        reason: 'SUBSCRIPTION_INACTIVE',
        status: subscription.status
      };
    }

    // Check concurrent call limit
    if (subscription.activeCalls >= effectiveConcurrentLimit) {
      return {
        canMakeCall: false,
        reason: 'CONCURRENT_LIMIT_REACHED',
        activeCalls: subscription.activeCalls,
        limit: effectiveConcurrentLimit
      };
    }

    // FREE plan - no calls allowed
    if (plan === 'FREE') {
      return { canMakeCall: false, reason: 'FREE_PLAN' };
    }

    // TRIAL plan
    if (plan === 'TRIAL') {
      const trialLimit = 15;
      const remaining = trialLimit - (subscription.trialMinutesUsed || 0);

      if (remaining <= 0) {
        return {
          canMakeCall: false,
          reason: 'TRIAL_EXPIRED',
          trialMinutesUsed: subscription.trialMinutesUsed
        };
      }

      return {
        canMakeCall: true,
        reason: 'TRIAL_ACTIVE',
        details: {
          trialMinutesRemaining: remaining,
          trialMinutesUsed: subscription.trialMinutesUsed
        }
      };
    }

    // PAYG plan
    if (plan === 'PAYG') {
      const pricePerMinute = getPricePerMinute('PAYG', country);

      if (subscription.balance < pricePerMinute) {
        return {
          canMakeCall: false,
          reason: 'INSUFFICIENT_BALANCE',
          balance: subscription.balance,
          required: pricePerMinute
        };
      }

      const balanceMinutes = Math.floor(subscription.balance / pricePerMinute);
      return {
        canMakeCall: true,
        reason: 'BALANCE_AVAILABLE',
        details: {
          balance: subscription.balance,
          balanceMinutes,
          pricePerMinute
        }
      };
    }

    // ENTERPRISE plan - özel kontroller
    if (plan === 'ENTERPRISE') {
      // Ödeme durumu kontrolü
      if (subscription.enterprisePaymentStatus !== 'paid') {
        return {
          canMakeCall: false,
          reason: 'ENTERPRISE_PAYMENT_PENDING',
          paymentStatus: subscription.enterprisePaymentStatus
        };
      }

      // Süre kontrolü
      if (subscription.enterpriseEndDate && new Date() > new Date(subscription.enterpriseEndDate)) {
        return {
          canMakeCall: false,
          reason: 'ENTERPRISE_EXPIRED',
          endDate: subscription.enterpriseEndDate
        };
      }

      // P0-A: Use unified plan config for enterprise minutes
      const enterpriseMinutes = effectivePlanConfig.includedMinutes;
      const remainingMinutes = enterpriseMinutes - (subscription.includedMinutesUsed || 0);

      if (remainingMinutes <= 0) {
        return {
          canMakeCall: false,
          reason: 'ENTERPRISE_MINUTES_EXHAUSTED',
          minutesUsed: subscription.includedMinutesUsed,
          minutesLimit: enterpriseMinutes
        };
      }

      return {
        canMakeCall: true,
        reason: 'ENTERPRISE_ACTIVE',
        details: {
          minutesRemaining: remainingMinutes,
          minutesUsed: subscription.includedMinutesUsed || 0,
          minutesLimit: enterpriseMinutes
        }
      };
    }

    // STARTER, PRO
    const includedMinutes = getIncludedMinutes(plan, country);
    const remainingIncluded = includedMinutes - (subscription.includedMinutesUsed || 0);

    // Check if has included minutes
    if (remainingIncluded > 0) {
      return {
        canMakeCall: true,
        reason: 'INCLUDED_MINUTES_AVAILABLE',
        details: {
          includedMinutesRemaining: remainingIncluded,
          includedMinutesUsed: subscription.includedMinutesUsed,
          includedMinutesTotal: includedMinutes
        }
      };
    }

    // Check if has balance for overage
    const overageRate = subscription.overageRate || 19; // Default to STARTER rate
    if (subscription.balance >= overageRate) {
      const overageMinutes = Math.floor(subscription.balance / overageRate);
      return {
        canMakeCall: true,
        reason: 'OVERAGE_AVAILABLE',
        details: {
          balance: subscription.balance,
          overageMinutes,
          overageRate
        }
      };
    }

    return {
      canMakeCall: false,
      reason: 'INSUFFICIENT_BALANCE',
      balance: subscription.balance,
      includedMinutesRemaining: 0
    };

  } catch (error) {
    console.error('❌ Can make call check error:', error);
    throw error;
  }
}

/**
 * Abonelik detayları
 * @param {number} businessId - Business ID
 * @returns {object} Subscription details
 */
export async function getSubscriptionDetails(businessId) {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      include: {
        business: {
          select: {
            name: true,
            country: true,
            currency: true
          }
        }
      }
    });

    if (!subscription) {
      return null;
    }

    const country = subscription.business?.country || 'TR';
    const plan = subscription.plan;
    const includedMinutes = getIncludedMinutes(plan, country);
    const pricePerMinute = getPricePerMinute(plan, country);
    const effectivePlanConfig = getEffectivePlanConfig(subscription);

    // Calculate balance in minutes
    const balanceMinutes = pricePerMinute > 0
      ? Math.floor(subscription.balance / pricePerMinute)
      : 0;

    // Calculate remaining included minutes
    const includedMinutesRemaining = Math.max(0, includedMinutes - (subscription.includedMinutesUsed || 0));

    // Trial remaining
    let trialMinutesRemaining = 0;
    let trialChatDaysRemaining = 0;
    if (plan === 'TRIAL') {
      trialMinutesRemaining = Math.max(0, 15 - (subscription.trialMinutesUsed || 0));
      if (subscription.trialChatExpiry) {
        const now = new Date();
        const diffTime = new Date(subscription.trialChatExpiry) - now;
        trialChatDaysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      }
    }

    return {
      id: subscription.id,
      businessId: subscription.businessId,
      plan: subscription.plan,
      status: subscription.status,
      // Billing info
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      // Balance
      balance: subscription.balance,
      balanceMinutes,
      pricePerMinute,
      // Included minutes
      includedMinutes,
      includedMinutesUsed: subscription.includedMinutesUsed || 0,
      includedMinutesRemaining,
      includedMinutesResetAt: subscription.includedMinutesResetAt,
      // Trial info
      trialMinutesUsed: subscription.trialMinutesUsed || 0,
      trialMinutesRemaining,
      trialChatExpiry: subscription.trialChatExpiry,
      trialChatDaysRemaining,
      // Limits
      concurrentLimit: effectivePlanConfig.concurrentLimit,
      activeCalls: subscription.activeCalls,
      assistantsLimit: subscription.assistantsLimit,
      assistantsCreated: subscription.assistantsCreated,
      phoneNumbersLimit: subscription.phoneNumbersLimit,
      phoneNumbersUsed: subscription.phoneNumbersUsed,
      // Overage
      overageRate: subscription.overageRate,
      overageMinutes: subscription.overageMinutes,
      overageLimit: subscription.overageLimit,
      // Auto reload
      autoReloadEnabled: subscription.autoReloadEnabled,
      autoReloadThreshold: subscription.autoReloadThreshold,
      autoReloadAmount: subscription.autoReloadAmount,
      // Warnings
      packageWarningAt80: subscription.packageWarningAt80,
      lowBalanceWarningAt: subscription.lowBalanceWarningAt,
      // Business info
      business: subscription.business
    };
  } catch (error) {
    console.error('❌ Get subscription details error:', error);
    throw error;
  }
}

/**
 * Eş zamanlı çağrı sayısını artır
 * @param {number} businessId - Business ID
 * @returns {object} { success, activeCalls, limit }
 */
export async function incrementActiveCalls(businessId) {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { businessId }
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const effectiveConcurrentLimit = getEffectivePlanConfig(subscription).concurrentLimit;

    if (subscription.activeCalls >= effectiveConcurrentLimit) {
      return {
        success: false,
        reason: 'CONCURRENT_LIMIT_REACHED',
        activeCalls: subscription.activeCalls,
        limit: effectiveConcurrentLimit
      };
    }

    const updated = await prisma.subscription.update({
      where: { businessId },
      data: {
        activeCalls: { increment: 1 }
      }
    });

    return {
      success: true,
      activeCalls: updated.activeCalls,
      limit: effectiveConcurrentLimit
    };
  } catch (error) {
    console.error('❌ Increment active calls error:', error);
    throw error;
  }
}

/**
 * Eş zamanlı çağrı sayısını azalt
 * @param {number} businessId - Business ID
 * @returns {object} { success, activeCalls }
 */
export async function decrementActiveCalls(businessId) {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { businessId }
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const updated = await prisma.subscription.update({
      where: { businessId },
      data: {
        activeCalls: Math.max(0, subscription.activeCalls - 1)
      }
    });

    return {
      success: true,
      activeCalls: updated.activeCalls
    };
  } catch (error) {
    console.error('❌ Decrement active calls error:', error);
    throw error;
  }
}

/**
 * Deneme chat süresi kontrolü
 * @param {number} businessId - Business ID
 * @returns {object} { canUseChat, reason, daysRemaining }
 */
export async function canUseTrialChat(businessId) {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { businessId }
    });

    if (!subscription) {
      return { canUseChat: false, reason: 'NO_SUBSCRIPTION' };
    }

    // Use chat rate limiter service for all limit checks
    const chatRateLimiter = (await import('./chatRateLimiter.js')).default;
    const result = await chatRateLimiter.canSendChatMessage(businessId);

    if (!result.canSend) {
      return {
        canUseChat: false,
        reason: result.reason,
        limit: result.limit,
        used: result.used
      };
    }

    // For TRIAL, also check expiry (backward compatibility)
    if (subscription.plan === 'TRIAL' && subscription.trialChatExpiry) {
      const now = new Date();
      const expiry = new Date(subscription.trialChatExpiry);

      if (now > expiry) {
        return { canUseChat: false, reason: 'TRIAL_CHAT_EXPIRED' };
      }

      const diffTime = expiry - now;
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return {
        canUseChat: true,
        reason: 'TRIAL_CHAT_ACTIVE',
        daysRemaining,
        dailyRemaining: result.dailyRemaining,
        tokenRemaining: result.tokenRemaining
      };
    }

    return {
      canUseChat: true,
      reason: 'PAID_PLAN',
      dailyRemaining: result.dailyRemaining,
      tokenRemaining: result.tokenRemaining
    };
  } catch (error) {
    console.error('❌ Can use trial chat check error:', error);
    throw error;
  }
}

export default {
  startTrial,
  switchToPayg,
  upgradePlan,
  canMakeCall,
  getSubscriptionDetails,
  incrementActiveCalls,
  decrementActiveCalls,
  canUseTrialChat
};
