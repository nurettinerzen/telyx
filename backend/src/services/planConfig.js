/**
 * Plan Configuration Service - Single Source of Truth
 *
 * P0-A CRITICAL FIX: Unified plan config resolution
 *
 * Problem: Enterprise overrides scattered across codebase
 * - assistant.js checks enterpriseAssistants manually
 * - chargeCalculator.js checks enterpriseConcurrent manually
 * - subscriptionService.js checks enterpriseMinutes manually
 * Result: Easy to miss, inconsistent behavior, bugs
 *
 * Solution: ONE function that resolves effective config
 * - Enterprise DB overrides take priority
 * - Falls back to plan defaults from plans.js
 * - All gating/limits use this function ONLY
 */

import { getRegionalPricing, getIncludedMinutes } from '../config/plans.js';
import { getBillingPlanDefinition } from '../config/billingCatalog.js';

/**
 * Get effective plan configuration for a subscription
 * This is the ONLY function that should be used for limit checks
 *
 * @param {Object} subscription - Subscription object with enterprise fields
 * @param {string} subscription.plan - Plan name (PAYG, STARTER, PRO, ENTERPRISE)
 * @param {number} subscription.enterpriseMinutes - Custom minutes override
 * @param {number} subscription.enterpriseAssistants - Custom assistants override
 * @param {number} subscription.enterpriseConcurrent - Custom concurrent override
 * @param {Object} subscription.business - Business with country
 * @returns {Object} Effective configuration
 */
export function getEffectivePlanConfig(subscription) {
  if (!subscription) {
    throw new Error('Subscription is required');
  }

  const plan = subscription.plan;
  const country = subscription.business?.country || 'TR';
  const regional = getRegionalPricing(country);
  const planDefaults = regional.plans[plan] || {};
  const billingPlan = getBillingPlanDefinition(subscription, country);

  // PRIORITY ORDER:
  // 1. Enterprise DB overrides (highest priority)
  // 2. Plan defaults from plans.js
  // 3. Hardcoded fallbacks

  const config = {
    // Plan identity
    plan: plan,
    country: country,

    // Minutes & pricing
    includedMinutes: billingPlan.includedVoiceMinutes ?? getIncludedMinutes(plan, country),
    pricePerMinute: billingPlan.voiceMinuteUnitPrice ?? planDefaults.pricePerMinute ?? 0,
    overageRate: planDefaults.overageRate ?? 23,
    overageLimit: subscription.overageLimit ?? 200,

    // Limits
    assistantsLimit: billingPlan.assistantLimit ?? planDefaults.assistantsLimit ?? 1,
    concurrentLimit: billingPlan.concurrentCallLimit ?? planDefaults.concurrentLimit ?? 1,
    phoneNumbersLimit: 1, // Platform constraint (not plan-based)

    // Features (from plan defaults)
    features: {
      phone: billingPlan.channels.phone,
      whatsapp: billingPlan.channels.whatsapp,
      chat: billingPlan.channels.webchat,
      email: billingPlan.channels.email,
      integrations: ['PRO', 'ENTERPRISE'].includes(plan),
      batchCalls: plan !== 'FREE',
      analytics: plan !== 'FREE',
      apiAccess: plan === 'ENTERPRISE'
    },

    // Enterprise metadata
    isEnterprise: plan === 'ENTERPRISE',
    hasCustomConfig: !!(
      subscription.minutesLimit !== null && subscription.minutesLimit !== undefined
      || subscription.assistantsLimit !== null && subscription.assistantsLimit !== undefined
      || subscription.concurrentLimit !== null && subscription.concurrentLimit !== undefined
      || subscription.enterpriseSupportInteractions !== null && subscription.enterpriseSupportInteractions !== undefined
      || subscription.enterpriseMinutes
      || subscription.enterpriseAssistants
      || subscription.enterpriseConcurrent
      || subscription.enterprisePrice
    ),
    enterprisePrice: subscription.enterprisePrice,
    enterpriseStartDate: subscription.enterpriseStartDate,
    enterpriseEndDate: subscription.enterpriseEndDate,
    enterprisePaymentStatus: subscription.enterprisePaymentStatus
  };

  return config;
}

/**
 * Check if a specific limit is reached
 *
 * @param {Object} subscription - Subscription with usage counts
 * @param {string} limitType - 'assistants' | 'concurrent' | 'minutes'
 * @returns {Object} { reached: boolean, current: number, limit: number, remaining: number }
 */
export function checkLimit(subscription, limitType) {
  const config = getEffectivePlanConfig(subscription);

  const limitChecks = {
    assistants: {
      current: subscription.assistantsCreated || 0, // Use actual count from caller
      limit: config.assistantsLimit,
      unlimited: config.assistantsLimit === null || config.assistantsLimit === -1
    },
    concurrent: {
      current: subscription.activeCalls || 0,
      limit: config.concurrentLimit,
      unlimited: false
    },
    minutes: {
      current: subscription.includedMinutesUsed || 0,
      limit: config.includedMinutes,
      unlimited: config.includedMinutes === null || config.includedMinutes === 0
    }
  };

  const check = limitChecks[limitType];
  if (!check) {
    throw new Error(`Unknown limit type: ${limitType}`);
  }

  if (check.unlimited) {
    return {
      reached: false,
      current: check.current,
      limit: null,
      remaining: null,
      unlimited: true
    };
  }

  return {
    reached: check.current >= check.limit,
    current: check.current,
    limit: check.limit,
    remaining: Math.max(0, check.limit - check.current),
    unlimited: false
  };
}

/**
 * Get human-readable limit status message
 *
 * @param {Object} subscription - Subscription
 * @param {string} limitType - 'assistants' | 'concurrent' | 'minutes'
 * @param {string} lang - 'en' | 'tr'
 * @returns {string} Status message
 */
export function getLimitStatusMessage(subscription, limitType, lang = 'en') {
  const status = checkLimit(subscription, limitType);

  if (status.unlimited) {
    return lang === 'tr' ? 'Sınırsız' : 'Unlimited';
  }

  if (status.reached) {
    const messages = {
      assistants: {
        en: `Assistant limit reached (${status.current}/${status.limit}). Upgrade to create more.`,
        tr: `Asistan limitine ulaşıldı (${status.current}/${status.limit}). Daha fazla oluşturmak için planınızı yükseltin.`
      },
      concurrent: {
        en: `Concurrent call limit reached (${status.current}/${status.limit}). Wait for calls to complete.`,
        tr: `Eşzamanlı arama limiti doldu (${status.current}/${status.limit}). Aramaların bitmesini bekleyin.`
      },
      minutes: {
        en: `Included minutes used (${status.current}/${status.limit}). Additional usage will be billed as overage.`,
        tr: `Dahil dakikalar kullanıldı (${status.current}/${status.limit}). Ek kullanım aşım olarak faturalanacak.`
      }
    };

    return messages[limitType]?.[lang] || 'Limit reached';
  }

  return lang === 'tr'
    ? `${status.remaining} kalan (${status.current}/${status.limit})`
    : `${status.remaining} remaining (${status.current}/${status.limit})`;
}

/**
 * Validate enterprise config before saving
 *
 * @param {Object} config - Enterprise config to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateEnterpriseConfig(config) {
  const errors = [];

  // Minutes validation
  if (config.minutes !== undefined && config.minutes !== null) {
    if (config.minutes < 0) {
      errors.push('enterpriseMinutes must be >= 0');
    }
    if (config.minutes > 1000000) {
      errors.push('enterpriseMinutes too large (max 1,000,000)');
    }
  }

  // Price validation
  if (config.price !== undefined && config.price !== null) {
    if (config.price < 500) {
      errors.push('enterprisePrice must be >= 500 TRY (Stripe minimum)');
    }
    if (config.price > 10000000) {
      errors.push('enterprisePrice too large (max 10M TRY)');
    }
  }

  // Assistants validation
  if (config.assistants !== undefined && config.assistants !== null) {
    if (config.assistants < -1) {
      errors.push('enterpriseAssistants must be >= -1 (null or -1 = unlimited)');
    }
    if (config.assistants > 10000) {
      errors.push('enterpriseAssistants too large (max 10,000)');
    }
  }

  // Concurrent validation
  if (config.concurrent !== undefined && config.concurrent !== null) {
    if (config.concurrent < 1) {
      errors.push('enterpriseConcurrent must be >= 1');
    }
    if (config.concurrent > 1000) {
      errors.push('enterpriseConcurrent too large (max 1,000)');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export default {
  getEffectivePlanConfig,
  checkLimit,
  getLimitStatusMessage,
  validateEnterpriseConfig
};
