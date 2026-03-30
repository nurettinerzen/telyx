/**
 * Centralized Plan Configuration
 * Single source of truth for all plan-related data
 *
 * IMPORTANT: All plan names, features, and pricing should be accessed from this file.
 * Do NOT hardcode plan names elsewhere.
 */

// Plan identifiers (internal use)
export const PLAN_IDS = {
  FREE: 'FREE',
  TRIAL: 'TRIAL',
  PAYG: 'PAYG',
  STARTER: 'STARTER',
  BASIC: 'BASIC',      // Legacy - maps to STARTER
  PRO: 'PRO',
  ENTERPRISE: 'ENTERPRISE',
};

// Plan display names by language
export const PLAN_NAMES = {
  FREE: { tr: 'Ücretsiz', en: 'Free' },
  TRIAL: { tr: 'Deneme', en: 'Trial' },
  PAYG: { tr: 'Kullandıkça Öde', en: 'Pay As You Go' },
  STARTER: { tr: 'Başlangıç', en: 'Starter' },
  BASIC: { tr: 'Başlangıç', en: 'Starter' },  // Legacy - same as STARTER
  PRO: { tr: 'Pro', en: 'Pro' },
  ENTERPRISE: { tr: 'Kurumsal', en: 'Enterprise' },
};

// Plan hierarchy for comparison (higher = better plan)
export const PLAN_HIERARCHY = {
  FREE: 0,
  TRIAL: 0,
  PAYG: 1,
  STARTER: 2,
  BASIC: 2,  // Legacy - same as STARTER
  PRO: 3,
  ENTERPRISE: 4,
};

// Legacy plan mapping
export const LEGACY_PLAN_MAP = {
  BASIC: 'STARTER',
};

// Plan features configuration
export const PLAN_FEATURES = {
  FREE: {
    whatsapp: true,
    chatWidget: true,
    email: true,
    googleCalendar: true,
    googleSheets: true,
    ecommerce: true,
    customCrm: false,
    maxMinutes: 15,
    maxAssistants: 1,
    maxConcurrentCalls: 1,
    trialDays: 7,
  },
  TRIAL: {
    batchCalls: true,
    whatsapp: true,
    chatWidget: true,
    email: true,
    googleCalendar: true,
    googleSheets: true,
    ecommerce: true,
    customCrm: false,
    maxMinutes: 15,
    maxAssistants: 1,
    maxConcurrentCalls: 1,
    trialDays: 7,
  },
  PAYG: {
    whatsapp: true,
    chatWidget: true,
    email: true,
    googleCalendar: true,
    googleSheets: true,
    ecommerce: true,
    customCrm: false, // Can connect, usage PRO+
    batchCalls: true,
    apiAccess: false,
    maxMinutes: null,  // Balance-based
    maxAssistants: 5,
    maxConcurrentCalls: 1,
    maxPhoneNumbers: 1,
    dailyMessages: 1000,
    monthlyTokens: 1000000,
  },
  STARTER: {
    whatsapp: true,
    chatWidget: true,
    email: true,
    googleCalendar: true,
    googleSheets: true,
    ecommerce: true,
    customCrm: false, // Can connect, usage PRO+
    batchCalls: false,
    apiAccess: false,
    maxMinutes: 0,
    maxAssistants: 5,
    maxConcurrentCalls: 0,
    maxPhoneNumbers: 0,
    dailyMessages: 2000,
    monthlyTokens: 2000000,
  },
  PRO: {
    whatsapp: true,
    chatWidget: true,
    email: true,
    googleCalendar: true,
    googleSheets: true,
    ecommerce: true,
    customCrm: true, // Full usage
    batchCalls: true,
    apiAccess: true,
    prioritySupport: true,
    maxMinutes: 500,
    maxAssistants: 10,
    maxConcurrentCalls: 2,
    maxPhoneNumbers: 1,
    dailyMessages: 5000,
    monthlyTokens: 5000000,
  },
  ENTERPRISE: {
    whatsapp: true,
    chatWidget: true,
    email: true,
    googleCalendar: true,
    googleSheets: true,
    ecommerce: true,
    customCrm: true,
    batchCalls: true,
    apiAccess: true,
    prioritySupport: true,
    slaGuarantee: true,
    maxMinutes: null, // Custom (500+)
    maxAssistants: 25, // Default, can be overridden in DB
    maxConcurrentCalls: null, // Custom (5+), limited by global cap
    maxPhoneNumbers: 1,
    dailyMessages: 10000,
    monthlyTokens: 10000000,
  },
};

// Add BASIC as alias for STARTER
PLAN_FEATURES.BASIC = PLAN_FEATURES.STARTER;

// Regional pricing configuration
export const REGIONAL_PRICING = {
  TR: {
    currency: '₺',
    currencyPosition: 'after',
    locale: 'tr-TR',
    plans: {
      TRIAL: { price: 0, minutes: 15, concurrent: 1, assistants: 5, pricePerMinute: 0, chatDays: 7, paymentModel: null },
      PAYG: { price: 0, minutes: 0, concurrent: 1, assistants: 5, pricePerMinute: 23, minTopup: 4, paymentModel: 'PREPAID' },
      STARTER: { price: 2499, minutes: 0, concurrent: 0, assistants: 5, pricePerMinute: 0, overageRate: 0, paymentModel: 'POSTPAID' },
      PRO: { price: 7499, minutes: 500, concurrent: 2, assistants: 10, pricePerMinute: 15, overageRate: 23, paymentModel: 'POSTPAID' },
      ENTERPRISE: { price: null, minutes: null, concurrent: 5, pricePerMinute: 12, overageRate: 23, paymentModel: 'POSTPAID' },
      BASIC: { price: 2499, minutes: 0, concurrent: 0, pricePerMinute: 0, overageRate: 0, paymentModel: 'POSTPAID' },
    },
  },
  BR: {
    currency: 'R$',
    currencyPosition: 'before',
    locale: 'pt-BR',
    plans: {
      TRIAL: { price: 0, minutes: 15, concurrent: 1, pricePerMinute: 0, chatDays: 7, paymentModel: null },
      PAYG: { price: 0, minutes: 0, concurrent: 1, pricePerMinute: 4.60, minTopup: 4, paymentModel: 'PREPAID' },
      STARTER: { price: 500, minutes: 0, concurrent: 0, pricePerMinute: 0, overageRate: 0, paymentModel: 'POSTPAID' },
      PRO: { price: 1500, minutes: 500, concurrent: 2, pricePerMinute: 3.00, overageRate: 4.60, paymentModel: 'POSTPAID' },
      ENTERPRISE: { price: null, minutes: null, concurrent: 5, pricePerMinute: 2.40, overageRate: 4.60, paymentModel: 'POSTPAID' },
      BASIC: { price: 500, minutes: 0, concurrent: 0, pricePerMinute: 0, overageRate: 0, paymentModel: 'POSTPAID' },
    },
  },
  US: {
    currency: '$',
    currencyPosition: 'before',
    locale: 'en-US',
    plans: {
      TRIAL: { price: 0, minutes: 15, concurrent: 1, pricePerMinute: 0, chatDays: 7, paymentModel: null },
      PAYG: { price: 0, minutes: 0, concurrent: 1, pricePerMinute: 0.51, minTopup: 4, paymentModel: 'PREPAID' },
      STARTER: { price: 55, minutes: 0, concurrent: 0, pricePerMinute: 0, overageRate: 0, paymentModel: 'POSTPAID' },
      PRO: { price: 167, minutes: 500, concurrent: 2, pricePerMinute: 0.33, overageRate: 0.51, paymentModel: 'POSTPAID' },
      ENTERPRISE: { price: null, minutes: null, concurrent: 5, pricePerMinute: 0.27, overageRate: 0.51, paymentModel: 'POSTPAID' },
      BASIC: { price: 55, minutes: 0, concurrent: 0, pricePerMinute: 0, overageRate: 0, paymentModel: 'POSTPAID' },
    },
  },
};

// Badge colors for admin panels
export const PLAN_COLORS = {
  FREE: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  TRIAL: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  PAYG: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  STARTER: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  BASIC: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  PRO: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  ENTERPRISE: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
};

// =====================
// Helper Functions
// =====================

/**
 * Get plan display name
 * @param {string} plan - Plan ID (e.g., 'PRO', 'STARTER')
 * @param {string} locale - 'tr' or 'en'
 * @returns {string} Display name
 */
export function getPlanDisplayName(plan, locale = 'tr') {
  const normalizedPlan = plan?.toUpperCase() || 'FREE';
  const lang = locale?.toLowerCase() === 'tr' ? 'tr' : 'en';
  return PLAN_NAMES[normalizedPlan]?.[lang] || plan || (lang === 'tr' ? 'Ücretsiz' : 'Free');
}

/**
 * Normalize plan ID (handle legacy plans)
 * @param {string} plan - Plan ID
 * @returns {string} Normalized plan ID
 */
export function normalizePlan(plan) {
  const normalizedPlan = plan?.toUpperCase() || 'FREE';
  return LEGACY_PLAN_MAP[normalizedPlan] || normalizedPlan;
}

/**
 * Check if a plan has access to a specific feature
 * @param {string} plan - User's current plan
 * @param {string} feature - Feature name
 * @returns {boolean}
 */
export function canAccessFeature(plan, feature) {
  const normalizedPlan = plan?.toUpperCase() || 'FREE';
  return PLAN_FEATURES[normalizedPlan]?.[feature] ?? false;
}

/**
 * Get plan limits
 * @param {string} plan - User's current plan
 * @returns {object} Plan limits
 */
export function getPlanLimits(plan) {
  const normalizedPlan = plan?.toUpperCase() || 'FREE';
  return PLAN_FEATURES[normalizedPlan] || PLAN_FEATURES.FREE;
}

/**
 * Get required plan for a feature
 * @param {string} feature - Feature name
 * @returns {string} Required plan name
 */
export function getRequiredPlanForFeature(feature) {
  const plans = ['FREE', 'TRIAL', 'PAYG', 'STARTER', 'PRO', 'ENTERPRISE'];
  for (const plan of plans) {
    if (PLAN_FEATURES[plan]?.[feature]) {
      return plan;
    }
  }
  return 'ENTERPRISE';
}

/**
 * Check if free trial has expired
 * @param {Date|string} createdAt - User's account creation date
 * @returns {boolean}
 */
export function isTrialExpired(createdAt) {
  if (!createdAt) return false;
  const created = new Date(createdAt);
  const now = new Date();
  const daysSinceCreation = (now - created) / (1000 * 60 * 60 * 24);
  return daysSinceCreation > PLAN_FEATURES.FREE.trialDays;
}

/**
 * Get remaining trial days
 * @param {Date|string} createdAt - User's account creation date
 * @returns {number} Remaining days
 */
export function getTrialDaysRemaining(createdAt) {
  if (!createdAt) return PLAN_FEATURES.FREE.trialDays;
  const created = new Date(createdAt);
  const now = new Date();
  const daysSinceCreation = (now - created) / (1000 * 60 * 60 * 24);
  return Math.ceil(PLAN_FEATURES.FREE.trialDays - daysSinceCreation);
}

/**
 * Compare two plans
 * @param {string} plan1 - First plan
 * @param {string} plan2 - Second plan
 * @returns {number} -1 if plan1 < plan2, 0 if equal, 1 if plan1 > plan2
 */
export function comparePlans(plan1, plan2) {
  const level1 = PLAN_HIERARCHY[plan1?.toUpperCase()] ?? 0;
  const level2 = PLAN_HIERARCHY[plan2?.toUpperCase()] ?? 0;
  if (level1 < level2) return -1;
  if (level1 > level2) return 1;
  return 0;
}

/**
 * Check if plan1 is higher than or equal to plan2
 * @param {string} userPlan - User's plan
 * @param {string} requiredPlan - Required plan
 * @returns {boolean}
 */
export function hasPlanAccess(userPlan, requiredPlan) {
  return comparePlans(userPlan, requiredPlan) >= 0;
}

/**
 * Get pricing for a specific region
 * @param {string} region - 'TR', 'BR', or 'US'
 * @returns {object} Regional config
 */
export function getRegionalConfig(region) {
  return REGIONAL_PRICING[region] || REGIONAL_PRICING.US;
}

/**
 * Format price based on region
 * @param {number} amount - Price amount
 * @param {string} region - 'TR', 'BR', or 'US'
 * @returns {string} Formatted price
 */
export function formatPrice(amount, region = 'TR') {
  if (amount === null || amount === undefined) return null;
  const config = getRegionalConfig(region);
  const formatted = amount.toLocaleString(config.locale);
  return config.currencyPosition === 'after'
    ? `${formatted}${config.currency}`
    : `${config.currency}${formatted}`;
}

export default {
  PLAN_IDS,
  PLAN_NAMES,
  PLAN_HIERARCHY,
  LEGACY_PLAN_MAP,
  PLAN_FEATURES,
  REGIONAL_PRICING,
  PLAN_COLORS,
  getPlanDisplayName,
  normalizePlan,
  canAccessFeature,
  getPlanLimits,
  getRequiredPlanForFeature,
  isTrialExpired,
  getTrialDaysRemaining,
  comparePlans,
  hasPlanAccess,
  getRegionalConfig,
  formatPrice,
};
