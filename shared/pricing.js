// ============================================================================
// SHARED PRICING CONFIG — Single Source of Truth
// ============================================================================
// Used by BOTH backend (plans.js) and frontend (pricing page)
// Keep this file dependency-free (no Prisma, no Node-only imports)
// ============================================================================

// ============================================================================
// REGIONAL PRICING
// ============================================================================

export const SHARED_REGIONAL_PRICING = {
  TR: {
    currency: 'TRY',
    symbol: '₺',
    symbolPosition: 'after', // 2.499₺
    locale: 'tr-TR',
    plans: {
      TRIAL:      { price: 0,    minutes: 15,   writtenInteractions: 50,   overageRate: 0,  concurrentLimit: 1,  assistantsLimit: 1,  chatDays: 7, writtenUnitPrice: 2.5 },
      PAYG:       { price: 0,    minutes: 0,    writtenInteractions: 0,    overageRate: 0,  concurrentLimit: 1,  assistantsLimit: 5,  pricePerMinute: 23, minTopup: 4, writtenUnitPrice: 2.5 },
      STARTER:    { price: 2499, minutes: 0,    writtenInteractions: 500,  overageRate: 0,  concurrentLimit: 0,  assistantsLimit: 5, writtenUnitPrice: 2.5 },
      PRO:        { price: 7499, minutes: 500,  writtenInteractions: 2000, overageRate: 23, concurrentLimit: 2,  assistantsLimit: 10, writtenUnitPrice: 2.5 },
      ENTERPRISE: { price: null, minutes: null, writtenInteractions: null, overageRate: 23, concurrentLimit: 5,  assistantsLimit: 25, writtenUnitPrice: 2.5 },
    },
  },
  BR: {
    currency: 'BRL',
    symbol: 'R$',
    symbolPosition: 'before',
    locale: 'pt-BR',
    plans: {
      TRIAL:      { price: 0,    minutes: 15,    writtenInteractions: 50,   overageRate: 0,    concurrentLimit: 1, assistantsLimit: 1,  chatDays: 7, writtenUnitPrice: 0.5 },
      PAYG:       { price: 0,    minutes: 0,     writtenInteractions: 0,    overageRate: 0,    concurrentLimit: 1, assistantsLimit: 5,  pricePerMinute: 4.60, minTopup: 4, writtenUnitPrice: 0.5 },
      STARTER:    { price: 500,  minutes: 0,     writtenInteractions: 500,  overageRate: 0,    concurrentLimit: 0, assistantsLimit: 5, writtenUnitPrice: 0.5 },
      PRO:        { price: 1500, minutes: 500,   writtenInteractions: 2000, overageRate: 4.60, concurrentLimit: 2, assistantsLimit: 10, writtenUnitPrice: 0.5 },
      ENTERPRISE: { price: null, minutes: null,  writtenInteractions: null, overageRate: 4.60, concurrentLimit: 5, assistantsLimit: 25, writtenUnitPrice: 0.5 },
    },
  },
  US: {
    currency: 'USD',
    symbol: '$',
    symbolPosition: 'before',
    locale: 'en-US',
    plans: {
      TRIAL:      { price: 0,    minutes: 15,   writtenInteractions: 50,   overageRate: 0,    concurrentLimit: 1, assistantsLimit: 1,  chatDays: 7, writtenUnitPrice: 0.06 },
      PAYG:       { price: 0,    minutes: 0,    writtenInteractions: 0,    overageRate: 0,    concurrentLimit: 1, assistantsLimit: 5,  pricePerMinute: 0.51, minTopup: 4, writtenUnitPrice: 0.06 },
      STARTER:    { price: 55,   minutes: 0,    writtenInteractions: 500,  overageRate: 0,    concurrentLimit: 0, assistantsLimit: 5, writtenUnitPrice: 0.06 },
      PRO:        { price: 167,  minutes: 500,  writtenInteractions: 2000, overageRate: 0.51, concurrentLimit: 2, assistantsLimit: 10, writtenUnitPrice: 0.06 },
      ENTERPRISE: { price: null, minutes: null, writtenInteractions: null, overageRate: 0.51, concurrentLimit: 5, assistantsLimit: 25, writtenUnitPrice: 0.06 },
    },
  },
};

// ============================================================================
// PLAN METADATA (names, descriptions, features)
// ============================================================================

export const SHARED_PLAN_META = {
  TRIAL: {
    id: 'TRIAL',
    nameTR: 'Deneme', nameEN: 'Trial',
    descTR: '7 gün boyunca sınırlı yazılı kullanım ve telefon denemesi',
    descEN: '7-day limited written usage and phone trial',
    features: ['writtenInteractions', 'minutes', 'concurrent', 'assistants', 'phone', 'whatsapp', 'chatWidget', 'email', 'ecommerce', 'calendar', 'analytics', 'batchCalls'],
  },
  PAYG: {
    id: 'PAYG',
    nameTR: 'Kullandıkça Öde', nameEN: 'Pay As You Go',
    descTR: 'Aylık ücret yok; yazılı kullanım ve ses dakikaları bakiyeden düşer',
    descEN: 'No monthly fee; written usage and voice minutes are deducted from the wallet',
    features: ['walletBilling', 'concurrent', 'assistants', 'phone', 'whatsapp', 'chatWidget', 'email', 'ecommerce', 'calendar', 'analytics', 'batchCalls'],
  },
  STARTER: {
    id: 'STARTER',
    nameTR: 'Başlangıç', nameEN: 'Starter',
    descTR: 'Yalnızca yazılı kanallar için aylık başlangıç paketi',
    descEN: 'Monthly starter package for written channels only',
    features: ['writtenInteractions', 'assistants', 'whatsapp', 'chatWidget', 'email', 'ecommerce', 'calendar', 'analytics'],
  },
  PRO: {
    id: 'PRO',
    nameTR: 'Profesyonel', nameEN: 'Pro',
    descTR: 'Yazılı kullanım havuzu ve ses dakikalarını birlikte sunar',
    descEN: 'Combines a written usage pool with included voice minutes',
    features: ['writtenInteractions', 'minutes', 'concurrent', 'assistants', 'phone', 'whatsapp', 'chatWidget', 'email', 'ecommerce', 'calendar', 'analytics', 'batchCalls', 'customCrm', 'prioritySupport', 'apiAccess'],
  },
  ENTERPRISE: {
    id: 'ENTERPRISE',
    nameTR: 'Kurumsal', nameEN: 'Enterprise',
    descTR: 'Özel yazılı etkileşim, ses dakikası ve eşzamanlı çağrı limitleri',
    descEN: 'Enterprise package with custom written usage, voice minutes, and concurrency limits',
    features: ['writtenInteractions', 'minutes', 'concurrent', 'assistants', 'phone', 'whatsapp', 'chatWidget', 'email', 'ecommerce', 'calendar', 'analytics', 'batchCalls', 'customCrm', 'prioritySupport', 'apiAccess', 'dedicatedSupport', 'customIntegrations', 'slaGuarantee'],
  },
};

// ============================================================================
// FEATURE DISPLAY ORDER & LABELS
// ============================================================================

export const SHARED_FEATURE_ORDER = [
  'walletBilling',
  'writtenInteractions',
  'minutes',
  'concurrent',
  'assistants',
  'phone',
  'whatsapp',
  'chatWidget',
  'email',
  'ecommerce',
  'calendar',
  'analytics',
  'batchCalls',
  'customCrm',
  'prioritySupport',
  'apiAccess',
  'dedicatedSupport',
  'customIntegrations',
  'slaGuarantee',
];

export const SHARED_FEATURE_LABELS = {
  tr: {
    walletBilling: () => 'Yazılı kullanım ve ses dakikaları bakiyeden düşer',
    writtenInteractions: (plan) => {
      if (plan.id === 'ENTERPRISE') return 'Özel yazılı etkileşim limiti';
      if (plan.id === 'TRIAL') return `${plan.writtenInteractions} yazılı etkileşim`;
      return `${plan.writtenInteractions} yazılı etkileşim`;
    },
    minutes: (plan) => {
      if (plan.id === 'TRIAL') return '15 dk telefon görüşmesi';
      if (plan.id === 'PAYG') return 'Kullanıma göre ses dakikası';
      if (plan.id === 'ENTERPRISE') return 'Özel ses dakikası limiti';
      return `${plan.minutes} dk görüşme`;
    },
    concurrent: (plan) => plan.id === 'ENTERPRISE' ? '5+ eşzamanlı çağrı' : `${plan.concurrentLimit} eşzamanlı çağrı`,
    assistants: (plan) => plan.id === 'ENTERPRISE' ? 'Özel asistan limiti' : `${plan.assistantsLimit} asistan`,
    phone: 'Telefon',
    whatsapp: 'WhatsApp',
    chatWidget: 'Webchat',
    email: 'E-posta',
    ecommerce: 'E-ticaret entegrasyonu',
    calendar: 'Google Takvim',
    analytics: 'Analitik',
    batchCalls: 'Toplu arama',
    customCrm: 'Özel CRM webhook entegrasyonu',
    prioritySupport: 'Öncelikli destek',
    apiAccess: 'API erişimi',
    dedicatedSupport: 'Özel kurulum ve destek',
    customIntegrations: 'Özel entegrasyonlar',
    slaGuarantee: 'SLA garantisi',
  },
  en: {
    walletBilling: () => 'Written usage and voice minutes are deducted from the wallet',
    writtenInteractions: (plan) => {
      if (plan.id === 'ENTERPRISE') return 'Custom written interaction limit';
      if (plan.id === 'TRIAL') return `${plan.writtenInteractions} written interactions`;
      return `${plan.writtenInteractions} written interactions`;
    },
    minutes: (plan) => {
      if (plan.id === 'TRIAL') return '15 min phone calls';
      if (plan.id === 'PAYG') return 'Usage-based voice minutes';
      if (plan.id === 'ENTERPRISE') return 'Custom voice minute limit';
      return `${plan.minutes} min calls`;
    },
    concurrent: (plan) => plan.id === 'ENTERPRISE' ? '5+ concurrent calls' : `${plan.concurrentLimit} concurrent call${plan.concurrentLimit > 1 ? 's' : ''}`,
    assistants: (plan) => plan.id === 'ENTERPRISE' ? 'Custom assistant limit' : `${plan.assistantsLimit} assistant${plan.assistantsLimit > 1 ? 's' : ''}`,
    phone: 'Phone',
    whatsapp: 'WhatsApp',
    chatWidget: 'Webchat',
    email: 'Email',
    ecommerce: 'E-commerce integration',
    calendar: 'Google Calendar',
    analytics: 'Analytics',
    batchCalls: 'Batch calls',
    customCrm: 'Custom CRM webhook integration',
    prioritySupport: 'Priority support',
    apiAccess: 'API access',
    dedicatedSupport: 'Dedicated onboarding and support',
    customIntegrations: 'Custom integrations',
    slaGuarantee: 'SLA guarantee',
  },
};

// ============================================================================
// LOCALE → REGION MAPPING
// ============================================================================

export const LOCALE_TO_REGION = {
  tr: 'TR',
  pt: 'BR',
  pr: 'BR',
  en: 'US',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get regional pricing for a country code
 */
export function getSharedRegionalPricing(countryCode) {
  return SHARED_REGIONAL_PRICING[countryCode] || SHARED_REGIONAL_PRICING.US;
}

/**
 * Format price for display
 */
export function formatSharedPrice(price, countryCode = 'TR') {
  if (price === null || price === undefined) return null;
  const regional = getSharedRegionalPricing(countryCode);
  const formatted = price.toLocaleString(regional.locale);
  return regional.symbolPosition === 'before'
    ? `${regional.symbol}${formatted}`
    : `${formatted}${regional.symbol}`;
}

/**
 * Get feature label for display
 */
export function getFeatureLabel(featureKey, locale, plan) {
  const labels = SHARED_FEATURE_LABELS[locale] || SHARED_FEATURE_LABELS.en;
  const label = labels[featureKey];
  if (typeof label === 'function') return label(plan);
  return label || featureKey;
}
