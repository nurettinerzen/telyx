/**
 * UNIFIED CHARGE CALCULATOR - PAYG Balance as Active Wallet
 *
 * Payment Priority (P0-3 Implementation):
 * 1. PAYG Balance (if available) - PREPAID
 * 2. Included Minutes (STARTER/PRO/ENTERPRISE) - FREE
 * 3. Overage (POSTPAID) - Billed at month end
 *
 * Key Features:
 * - Split billing support (balance + included + overage in same call)
 * - Idempotency (callId-based)
 * - Transaction-safe
 * - PAYG balance works as wallet even in paid plans
 *
 * IMPORTANT:
 * - Balance is NOT an entitlement, it's a payment method
 * - Call authorization ≠ balance check (for paid plans)
 * - PAYG plan ONLY: balance < 1 minute blocks call
 * - STARTER/PRO/ENTERPRISE: balance is optional payment source
 */

import prisma from '../prismaClient.js';
import {
  getPricePerMinute,
  getIncludedMinutes,
  getFixedOveragePrice
} from '../config/plans.js';
import { getEffectivePlanConfig } from './planConfig.js';
import { getBillingPlanDefinition } from '../config/billingCatalog.js';

/**
 * Calculate charge with PAYG balance priority
 *
 * @param {object} subscription - Subscription object with balance
 * @param {number} durationMinutes - Call duration in minutes
 * @param {string} country - Country code (TR, US, BR)
 * @returns {object} Charge breakdown
 */
export async function calculateChargeWithBalance(subscription, durationMinutes, country = 'TR') {
  const plan = subscription.plan;

  // ===== TRIAL PLAN =====
  if (plan === 'TRIAL') {
    const trialLimit = 15;
    const used = subscription.trialMinutesUsed || 0;
    const remaining = trialLimit - used;

    if (remaining <= 0) {
      throw new Error('TRIAL_EXPIRED');
    }

    if (durationMinutes > remaining) {
      throw new Error('TRIAL_LIMIT_EXCEEDED');
    }

    return {
      chargeType: 'TRIAL',
      pricePerMinute: 0,
      totalCharge: 0,
      breakdown: {
        fromTrial: durationMinutes,
        trialRemaining: remaining - durationMinutes
      }
    };
  }

  const billingPlan = getBillingPlanDefinition(subscription, country);

  // ===== PAYG PLAN (voice add-on first, then wallet) =====
  if (plan === 'PAYG') {
    const pricePerMinute = getPricePerMinute(plan, country);
    const voiceAddOnBalance = Math.max(Number(subscription.voiceAddOnMinutesBalance || 0), 0);
    const fromAddOn = Math.min(durationMinutes, voiceAddOnBalance);
    const remainingAfterAddOn = Math.max(durationMinutes - fromAddOn, 0);
    const totalCharge = remainingAfterAddOn * pricePerMinute;

    if (subscription.balance < totalCharge) {
      throw new Error('INSUFFICIENT_BALANCE');
    }

    return {
      chargeType: fromAddOn > 0 && totalCharge > 0
        ? 'ADDON_BALANCE'
        : (fromAddOn > 0 ? 'ADDON' : 'BALANCE'),
      pricePerMinute,
      totalCharge,
      breakdown: {
        fromAddOn,
        fromBalance: remainingAfterAddOn,
        balanceCharge: totalCharge,
        fromIncluded: 0,
        overageMinutes: 0
      }
    };
  }

  // ===== PAID PLANS (STARTER/PRO/ENTERPRISE) =====
  // Payment priority: INCLUDED → ADDON → OVERAGE

  const pricePerMinute = getPricePerMinute(plan, country); // For balance calculation
  const includedMinutes = billingPlan.includedVoiceMinutes ?? getIncludedMinutes(plan, country);
  const usedIncluded = subscription.includedMinutesUsed || 0;
  const remainingIncluded = Math.max(0, includedMinutes - usedIncluded);
  const overageRate = getFixedOveragePrice(country); // Fixed 23 TL/min
  const voiceAddOnBalance = Math.max(Number(subscription.voiceAddOnMinutesBalance || 0), 0);

  let minutesLeft = durationMinutes;
  let fromIncluded = 0;
  let fromAddOn = 0;
  let overageMinutes = 0;
  let balanceCharge = 0;

  // STEP 1: Use included minutes
  if (remainingIncluded > 0 && minutesLeft > 0) {
    fromIncluded = Math.min(minutesLeft, remainingIncluded);
    minutesLeft -= fromIncluded;

    console.log(`📦 Using ${fromIncluded.toFixed(2)} min from included`);
  }

  // STEP 2: Use cycle-bounded voice add-on minutes
  if (voiceAddOnBalance > 0 && minutesLeft > 0) {
    fromAddOn = Math.min(minutesLeft, voiceAddOnBalance);
    minutesLeft -= fromAddOn;

    console.log(`🎁 Using ${fromAddOn.toFixed(2)} min from voice add-on`);
  }

  // STEP 3: Remaining goes to POSTPAID overage
  if (minutesLeft > 0) {
    overageMinutes = minutesLeft;
    console.log(`📊 ${overageMinutes.toFixed(2)} min will be billed as overage (${(overageMinutes * overageRate).toFixed(2)} TL)`);
  }

  // Determine charge type
  let chargeType = 'INCLUDED';
  if (fromIncluded > 0 && fromAddOn > 0 && overageMinutes > 0) {
    chargeType = 'INCLUDED_ADDON_OVERAGE';
  } else if (fromIncluded > 0 && fromAddOn > 0) {
    chargeType = 'INCLUDED_ADDON';
  } else if (fromAddOn > 0 && overageMinutes > 0) {
    chargeType = 'ADDON_OVERAGE';
  } else if (fromIncluded > 0 && overageMinutes > 0) {
    chargeType = 'INCLUDED_OVERAGE';
  } else if (fromAddOn > 0) {
    chargeType = 'ADDON';
  } else if (overageMinutes > 0) {
    chargeType = 'OVERAGE';
  }

  return {
    chargeType,
    pricePerMinute, // For balance deduction
    totalCharge: balanceCharge, // IMMEDIATE charge (balance only) - NOT full cost. Full breakdown in breakdown{}
    breakdown: {
      fromAddOn,
      fromBalance: 0,
      balanceCharge,
      fromIncluded,
      overageMinutes, // Deferred charge (billed at period end)
      overageRate,
      includedRemaining: remainingIncluded - fromIncluded,
      addOnRemaining: Math.max(voiceAddOnBalance - fromAddOn, 0),
      paymentModel: 'POSTPAID_ADDON'
    }
  };
}

/**
 * Apply charge to subscription (with transaction)
 *
 * @param {number} subscriptionId - Subscription ID
 * @param {object} chargeResult - Result from calculateChargeWithBalance
 * @param {string} usageRecordId - Usage record ID for idempotency
 * @returns {Promise<void>}
 */
export async function applyChargeWithBalance(subscriptionId, chargeResult, usageRecordId) {
  const { chargeType, totalCharge, breakdown } = chargeResult;

  try {
    // NOTE: Idempotency is handled at usageService layer (callId unique constraint)
    // This function assumes it's only called for new UsageRecords

    // Use transaction for atomic updates
    await prisma.$transaction(async (tx) => {
      // TRIAL: Update trial usage
      if (chargeType === 'TRIAL') {
        await tx.subscription.update({
          where: { id: subscriptionId },
          data: {
            trialMinutesUsed: { increment: breakdown.fromTrial }
          }
        });
        return;
      }

      // Prepare update data
      const updateData = {};

      // STEP 1: Deduct from balance (if used)
      if (breakdown.fromBalance > 0 && breakdown.balanceCharge > 0) {
        // Deduct balance
        const currentSub = await tx.subscription.findUnique({
          where: { id: subscriptionId },
          select: { balance: true }
        });

        if (currentSub.balance < breakdown.balanceCharge) {
          throw new Error('INSUFFICIENT_BALANCE');
        }

        updateData.balance = {
          decrement: breakdown.balanceCharge
        };

        // Create balance transaction record
        await tx.balanceTransaction.create({
          data: {
            subscriptionId,
            type: 'USAGE',
            amount: -breakdown.balanceCharge,
            balanceBefore: currentSub.balance,
            balanceAfter: currentSub.balance - breakdown.balanceCharge,
            usageRecordId,
            description: `Call charge: ${breakdown.fromBalance.toFixed(2)} min`
          }
        });

        console.log(`💸 Deducted ${breakdown.balanceCharge.toFixed(2)} TL from balance`);
      }

      if (breakdown.fromAddOn > 0) {
        updateData.voiceAddOnMinutesBalance = {
          decrement: breakdown.fromAddOn
        };
      }

      // STEP 2: Update included minutes (if used)
      if (breakdown.fromIncluded > 0) {
        updateData.includedMinutesUsed = {
          increment: breakdown.fromIncluded
        };

        console.log(`📦 Used ${breakdown.fromIncluded.toFixed(2)} min from included`);
      }

      // STEP 3: Track overage (if any) - will be billed at month end
      if (breakdown.overageMinutes > 0) {
        updateData.overageMinutes = {
          increment: breakdown.overageMinutes
        };

        console.log(`📊 Tracked ${breakdown.overageMinutes.toFixed(2)} min overage (postpaid)`);
      }

      // Apply all updates atomically
      if (Object.keys(updateData).length > 0) {
        await tx.subscription.update({
          where: { id: subscriptionId },
          data: updateData
        });
      }
    });

    console.log(`✅ Charge applied successfully: ${chargeType}`);
  } catch (error) {
    console.error('❌ Apply charge error:', error);
    throw error;
  }
}

/**
 * Check if can make call (authorization check, NOT balance check for paid plans)
 *
 * @param {number} businessId - Business ID
 * @returns {Promise<{canMakeCall: boolean, reason?: string}>}
 */
export async function canMakeCallWithBalance(businessId) {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { businessId }
    });

    if (!subscription) {
      return { canMakeCall: false, reason: 'NO_SUBSCRIPTION' };
    }

    // Subscription status check
    if (subscription.status !== 'ACTIVE' && subscription.status !== 'TRIAL') {
      return { canMakeCall: false, reason: 'SUBSCRIPTION_INACTIVE' };
    }

    // P0-A: Use unified plan config for concurrent limit
    const planConfig = getEffectivePlanConfig(subscription);

    if (subscription.activeCalls >= planConfig.concurrentLimit) {
      return {
        canMakeCall: false,
        reason: 'CONCURRENT_LIMIT_REACHED',
        activeCalls: subscription.activeCalls,
        limit: planConfig.concurrentLimit
      };
    }

    const plan = subscription.plan;

    // FREE plan
    if (plan === 'FREE') {
      return { canMakeCall: false, reason: 'FREE_PLAN' };
    }

    // TRIAL plan
    if (plan === 'TRIAL') {
      const remaining = 15 - (subscription.trialMinutesUsed || 0);
      if (remaining <= 0) {
        return { canMakeCall: false, reason: 'TRIAL_EXPIRED' };
      }
      return { canMakeCall: true, estimatedMinutesRemaining: remaining };
    }

    // PAYG plan: voice add-on counts first, otherwise wallet must cover at least 1 minute
    if (plan === 'PAYG') {
      if (Number(subscription.voiceAddOnMinutesBalance || 0) >= 1) {
        return {
          canMakeCall: true,
          estimatedMinutesRemaining: Number(subscription.voiceAddOnMinutesBalance || 0)
        };
      }

      const pricePerMinute = getPricePerMinute(plan, subscription.business?.country || 'TR');
      if (subscription.balance < pricePerMinute) {
        return { canMakeCall: false, reason: 'INSUFFICIENT_BALANCE' };
      }
      return {
        canMakeCall: true,
        estimatedMinutesRemaining: subscription.balance / pricePerMinute
      };
    }

    // PAID PLANS (STARTER/PRO/ENTERPRISE):
    // Authorization based on included + overage, NOT balance
    // Balance is optional payment method, not entitlement

    const billingPlan = getBillingPlanDefinition(subscription, subscription.business?.country || 'TR');
    const includedMinutes = billingPlan.includedVoiceMinutes ?? getIncludedMinutes(plan, subscription.business?.country || 'TR');
    const usedIncluded = subscription.includedMinutesUsed || 0;
    const remainingIncluded = Math.max(0, includedMinutes - usedIncluded);
    const addOnRemaining = Number(subscription.voiceAddOnMinutesBalance || 0);
    const overageUsed = subscription.overageMinutes || 0;
    const overageLimit = subscription.overageLimit || 200; // Default 200 min for STARTER

    // Has included minutes? → Allow
    if (remainingIncluded > 0) {
      return {
        canMakeCall: true,
        reason: 'INCLUDED_MINUTES_AVAILABLE',
        estimatedMinutesRemaining: remainingIncluded
      };
    }

    if (addOnRemaining > 0) {
      return {
        canMakeCall: true,
        reason: 'VOICE_ADDON_AVAILABLE',
        estimatedMinutesRemaining: addOnRemaining
      };
    }

    // Included exhausted, check overage capacity
    if (overageUsed >= overageLimit) {
      return {
        canMakeCall: false,
        reason: 'OVERAGE_LIMIT_REACHED'
      };
    }

    // Can use overage (POSTPAID)
    return {
      canMakeCall: true,
      reason: 'OVERAGE_POSTPAID',
      estimatedMinutesRemaining: overageLimit - overageUsed
    };
  } catch (error) {
    console.error('Can make call check error:', error);
    return { canMakeCall: false, reason: 'ERROR' };
  }
}

export default {
  calculateChargeWithBalance,
  applyChargeWithBalance,
  canMakeCallWithBalance
};
