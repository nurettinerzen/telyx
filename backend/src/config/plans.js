// ============================================================================
// PLAN CONFIGURATIONS - MULTI-REGION SUPPORT
// ============================================================================
// FILE: backend/src/config/plans.js
//
// Central configuration for subscription plans with pricing, limits, and features
// Supports multiple currencies and regions
//
// NOTE: Public-facing pricing values are also defined in shared/pricing.js
// which is the single source of truth for the frontend pricing page.
// When updating prices, update BOTH this file and shared/pricing.js.
//
// YENİ FİYATLANDIRMA (Ocak 2026):
// - TRIAL: 15 dk telefon, 7 gün chat/whatsapp, 1 asistan
// - PAYG: 23 TL/dk, PREPAID (bakiye yükleme), min 4 dk yükleme
// - STARTER: 2.499 TL/ay, 150 dk dahil, POSTPAID aşım
// - PRO: 7.499 TL/ay, 500 dk dahil, POSTPAID aşım
// - ENTERPRISE: Özel, POSTPAID aşım
//
// AŞIM FİYATI: Tüm planlar için SABİT 23 TL/dk (ay sonu fatura - postpaid)
// BAKİYE: Sadece PAYG için, prepaid model
// ============================================================================

import { getCountry, getCurrency, formatCurrency } from './countries.js';

// ============================================================================
// SABİT DOLAR KURU (Manuel güncelleme gerektirir)
// ============================================================================
export const USD_TO_TRY = 45; // 1 USD = 45 TL (hardcoded)

// ============================================================================
// SABİT AŞIM FİYATI - Tüm planlar için aynı
// ============================================================================
export const OVERAGE_PRICE = {
  TR: 23,       // 23 TL/dk
  BR: 4.60,     // R$ 4.60/dk
  US: 0.51      // $0.51/dk
};

// ============================================================================
// CHAT/WHATSAPP TOKEN FİYATLANDIRMASI
// ============================================================================
// Gemini 2.0 Flash maliyetleri (1 USD = 45 TL):
// - Input: $0.10/1M token = 0.0045 TL/1K token
// - Output: $0.40/1M token = 0.018 TL/1K token
//
// Kar marjı: ~2.5x
// WhatsApp service messages (24 saatlik pencere): Meta ücreti YOK
// ============================================================================
export const TOKEN_PRICING = {
  TR: {
    currency: 'TRY',
    symbol: '₺',
    // Fiyatlar 1K token başına TL cinsinden
    plans: {
      FREE: { inputPer1K: 0, outputPer1K: 0 },
      TRIAL: { inputPer1K: 0, outputPer1K: 0 },           // Deneme ücretsiz
      PAYG: { inputPer1K: 0.012, outputPer1K: 0.045 },    // En yüksek fiyat
      STARTER: { inputPer1K: 0.010, outputPer1K: 0.040 }, // Orta fiyat
      PRO: { inputPer1K: 0.009, outputPer1K: 0.036 },     // Düşük fiyat
      ENTERPRISE: { inputPer1K: 0.008, outputPer1K: 0.032 }, // En düşük fiyat
      // Legacy
      BASIC: { inputPer1K: 0.010, outputPer1K: 0.040 }
    }
  },
  BR: {
    currency: 'BRL',
    symbol: 'R$',
    plans: {
      FREE: { inputPer1K: 0, outputPer1K: 0 },
      TRIAL: { inputPer1K: 0, outputPer1K: 0 },
      PAYG: { inputPer1K: 0.0024, outputPer1K: 0.009 },
      STARTER: { inputPer1K: 0.002, outputPer1K: 0.008 },
      PRO: { inputPer1K: 0.0018, outputPer1K: 0.0072 },
      ENTERPRISE: { inputPer1K: 0.0016, outputPer1K: 0.0064 },
      BASIC: { inputPer1K: 0.002, outputPer1K: 0.008 }
    }
  },
  US: {
    currency: 'USD',
    symbol: '$',
    plans: {
      FREE: { inputPer1K: 0, outputPer1K: 0 },
      TRIAL: { inputPer1K: 0, outputPer1K: 0 },
      PAYG: { inputPer1K: 0.00027, outputPer1K: 0.001 },
      STARTER: { inputPer1K: 0.00022, outputPer1K: 0.00089 },
      PRO: { inputPer1K: 0.0002, outputPer1K: 0.0008 },
      ENTERPRISE: { inputPer1K: 0.00018, outputPer1K: 0.00071 },
      BASIC: { inputPer1K: 0.00022, outputPer1K: 0.00089 }
    }
  }
};

// ============================================================================
// ÖDEME MODELİ
// ============================================================================
export const PAYMENT_MODELS = {
  PAYG: 'PREPAID',        // Bakiye yükle, kullan
  STARTER: 'POSTPAID',    // Ay sonu aşım faturası
  PRO: 'POSTPAID',
  ENTERPRISE: 'POSTPAID',
  BASIC: 'POSTPAID'       // Legacy
};

// ============================================================================
// REGION-BASED PRICING - YENİ FİYATLANDIRMA SİSTEMİ
// ============================================================================

/**
 * Pricing per region with local currency values
 * Prices are set based on local purchasing power, not currency conversion
 */
export const REGIONAL_PRICING = {
  TR: {
    currency: 'TRY',
    symbol: '₺',
    plans: {
      FREE: { price: 0, minutes: 0, overageRate: 0, concurrentLimit: 0, pricePerMinute: 0, assistantsLimit: 0, phoneNumbersLimit: 0, paymentModel: null },

      // DENEME: 15 dk telefon, 7 gün chat/whatsapp
      TRIAL: { price: 0, minutes: 15, overageRate: 0, concurrentLimit: 1, pricePerMinute: 0, assistantsLimit: 1, phoneNumbersLimit: 1, chatDays: 7, paymentModel: null },

      // PAYG: Kullandıkça öde - PREPAID (bakiye yükle, kullan)
      PAYG: { price: 0, minutes: 0, overageRate: 0, concurrentLimit: 1, pricePerMinute: 23, assistantsLimit: 5, minTopup: 4, paymentModel: 'PREPAID' },

      // YENİ FİYATLANDIRMA - Ocak 2026 - SABİT 23 TL AŞIM (POSTPAID)
      // Note: phoneNumbersLimit removed - platform limit is 1 (hard-coded in route)
      STARTER: { price: 2499, minutes: 0, overageRate: 23, concurrentLimit: 0, pricePerMinute: 0, assistantsLimit: 5, paymentModel: 'POSTPAID' },
      PRO: { price: 7499, minutes: 500, overageRate: 23, concurrentLimit: 2, pricePerMinute: 15, assistantsLimit: 10, paymentModel: 'POSTPAID' },
      ENTERPRISE: { price: null, minutes: null, overageRate: 23, concurrentLimit: 5, pricePerMinute: 12, assistantsLimit: 25, paymentModel: 'POSTPAID' }, // Configurable per enterprise client

      // Legacy plan aliases - SABİT 23 TL AŞIM
      BASIC: { price: 2499, minutes: 0, overageRate: 23, concurrentLimit: 0, pricePerMinute: 0, assistantsLimit: 5, paymentModel: 'POSTPAID' }
    },
    // PAYG dakika fiyatı: 23 TL/dk (PREPAID)
    creditTiers: [
      { minMinutes: 1, unitPrice: 23.00 }
    ],
    // Minimum PAYG yükleme: 4 dk (~100 TL)
    minTopupMinutes: 4
  },
  // Türkiye odaklı yapı - diğer bölgeler için USD kuru ile hesaplama
  BR: {
    currency: 'BRL',
    symbol: 'R$',
    plans: {
      FREE: { price: 0, minutes: 0, overageRate: 0, concurrentLimit: 0, paymentModel: null },
      TRIAL: { price: 0, minutes: 15, overageRate: 0, concurrentLimit: 1, chatDays: 7, paymentModel: null },
      PAYG: { price: 0, minutes: 0, overageRate: 0, concurrentLimit: 1, pricePerMinute: 4.60, assistantsLimit: 5, minTopup: 4, paymentModel: 'PREPAID' },
      // SABİT 4.60 R$ AŞIM (POSTPAID)
      STARTER: { price: 500, minutes: 0, overageRate: 4.60, concurrentLimit: 0, pricePerMinute: 0, assistantsLimit: 5, paymentModel: 'POSTPAID' },
      PRO: { price: 1500, minutes: 500, overageRate: 4.60, concurrentLimit: 2, pricePerMinute: 3.00, assistantsLimit: 10, paymentModel: 'POSTPAID' },
      ENTERPRISE: { price: null, minutes: null, overageRate: 4.60, concurrentLimit: 5, pricePerMinute: 2.40, assistantsLimit: 25, paymentModel: 'POSTPAID' },
      BASIC: { price: 500, minutes: 0, overageRate: 4.60, concurrentLimit: 0, assistantsLimit: 5, paymentModel: 'POSTPAID' }
    },
    creditTiers: [
      { minMinutes: 1, unitPrice: 4.60 }
    ],
    minTopupMinutes: 4
  },
  US: {
    currency: 'USD',
    symbol: '$',
    plans: {
      FREE: { price: 0, minutes: 0, overageRate: 0, concurrentLimit: 0, paymentModel: null },
      TRIAL: { price: 0, minutes: 15, overageRate: 0, concurrentLimit: 1, chatDays: 7, paymentModel: null },
      PAYG: { price: 0, minutes: 0, overageRate: 0, concurrentLimit: 1, pricePerMinute: 0.51, assistantsLimit: 5, minTopup: 4, paymentModel: 'PREPAID' },
      // SABİT $0.51 AŞIM (POSTPAID)
      STARTER: { price: 55, minutes: 0, overageRate: 0.51, concurrentLimit: 0, pricePerMinute: 0.0, assistantsLimit: 5, paymentModel: 'POSTPAID' },
      PRO: { price: 167, minutes: 500, overageRate: 0.51, concurrentLimit: 2, pricePerMinute: 0.33, assistantsLimit: 10, paymentModel: 'POSTPAID' },
      ENTERPRISE: { price: null, minutes: null, overageRate: 0.51, concurrentLimit: 5, pricePerMinute: 0.27, assistantsLimit: 25, paymentModel: 'POSTPAID' },
      BASIC: { price: 55, minutes: 0, overageRate: 0.51, concurrentLimit: 0, paymentModel: 'POSTPAID' }
    },
    creditTiers: [
      { minMinutes: 1, unitPrice: 0.51 }
    ],
    minTopupMinutes: 4
  },
  // European countries use EUR
  DE: { currency: 'EUR', symbol: '€', useUSDPricing: true, multiplier: 0.92 },
  FR: { currency: 'EUR', symbol: '€', useUSDPricing: true, multiplier: 0.92 },
  ES: { currency: 'EUR', symbol: '€', useUSDPricing: true, multiplier: 0.92 },
  NL: { currency: 'EUR', symbol: '€', useUSDPricing: true, multiplier: 0.92 },
  GB: { currency: 'GBP', symbol: '£', useUSDPricing: true, multiplier: 0.79 },
  AE: { currency: 'AED', symbol: 'د.إ', useUSDPricing: true, multiplier: 3.67 }
};

// ============================================================================
// BASE PLAN DEFINITIONS (limits and features)
// ============================================================================

export const PLANS = {
  FREE: {
    id: 'FREE',
    name: 'Free',
    nameTR: 'Ücretsiz',
    nameEN: 'Free',
    namePR: 'Grátis',
    minutesLimit: 0,
    callsLimit: 0,
    assistantsLimit: 0,
    phoneNumbersLimit: 0,
    overageLimit: 0,
    concurrentLimit: 0,
    features: {
      phone: false,
      whatsappCalling: false,
      whatsappMessaging: false,
      chatWidget: false,
      email: false,
      ecommerce: false,
      calendar: false,
      googleSheets: false,
      batchCalls: false,
      prioritySupport: false,
      analytics: false,
      apiAccess: false
    },
    channels: []
  },

  // ============================================================================
  // YENİ: DENEME PLANI
  // ============================================================================
  TRIAL: {
    id: 'TRIAL',
    name: 'Trial',
    nameTR: 'Deneme',
    nameEN: 'Trial',
    namePR: 'Teste',
    minutesLimit: 15,         // 15 dk telefon
    callsLimit: -1,
    assistantsLimit: 1,       // 1 asistan
    phoneNumbersLimit: 1,
    overageLimit: 0,          // Aşım yok
    concurrentLimit: 1,       // 1 eşzamanlı çağrı
    chatDays: 7,              // 7 gün chat/whatsapp
    features: {
      phone: true,
      whatsappCalling: true,
      whatsappMessaging: true,
      chatWidget: true,
      email: true,
      ecommerce: true,
      calendar: true,
      googleSheets: true,
      batchCalls: true,
      prioritySupport: false,
      analytics: true,
      apiAccess: false
    },
    channels: ['phone', 'whatsapp', 'chat_widget', 'email'],
    analyticsLevel: 'basic',
    supportLevel: 'email'
  },

  // ============================================================================
  // YENİ: PAYG (Kullandıkça Öde)
  // ============================================================================
  PAYG: {
    id: 'PAYG',
    name: 'Pay As You Go',
    nameTR: 'Kullandıkça Öde',
    nameEN: 'Pay As You Go',
    namePR: 'Pague Conforme Usa',
    minutesLimit: 0,          // Dahil dakika yok
    callsLimit: -1,
    assistantsLimit: 1,       // 1 asistan
    phoneNumbersLimit: 1,
    overageLimit: 0,          // Aşım kavramı yok, direkt bakiyeden
    concurrentLimit: 1,       // 1 eşzamanlı çağrı
    minTopupMinutes: 4,       // Minimum 4 dk (~100 TL) yükleme
    features: {
      phone: true,
      whatsappCalling: true,
      whatsappMessaging: true,
      chatWidget: true,
      email: true,
      ecommerce: true,
      calendar: true,
      googleSheets: true,
      batchCalls: true,
      prioritySupport: false,
      analytics: true,
      apiAccess: false
    },
    channels: ['phone', 'whatsapp', 'chat_widget', 'email'],
    analyticsLevel: 'basic',
    supportLevel: 'email'
  },

  // ============================================================================
  // YENİ FİYATLANDIRMA - Ocak 2026
  // ============================================================================
  STARTER: {
    id: 'STARTER',
    name: 'Starter',
    nameTR: 'Başlangıç',
    nameEN: 'Starter',
    namePR: 'Inicial',
    minutesLimit: 0,          // Telefon dahil değil
    callsLimit: 0,
    assistantsLimit: 5,
    phoneNumbersLimit: 0,
    overageLimit: 0,          // Telefon aşımı yok
    concurrentLimit: 0,       // Telefon erişimi yok
    features: {
      phone: false,
      whatsappCalling: false,
      whatsappMessaging: true,
      chatWidget: true,
      email: true,            // Tüm planlarda açık
      ecommerce: true,
      calendar: true,
      googleSheets: true,     // Tüm planlarda açık
      batchCalls: false,
      prioritySupport: false, // Pro'da açık
      analytics: true,        // Basic analytics
      advancedAnalytics: false,
      apiAccess: false
    },
    channels: ['whatsapp', 'chat_widget', 'email'],
    analyticsLevel: 'basic',
    supportLevel: 'email'
  },
  PRO: {
    id: 'PRO',
    name: 'Pro',
    nameTR: 'Profesyonel',
    nameEN: 'Pro',
    namePR: 'Pro',
    minutesLimit: 500,        // 500 dk dahil
    callsLimit: -1,           // Sınırsız çağrı
    assistantsLimit: 10,      // 10 asistan
    phoneNumbersLimit: -1,    // Sınırsız numara
    overageLimit: 500,        // Max 500 dk aşım
    concurrentLimit: 2,       // 2 eşzamanlı çağrı
    features: {
      phone: true,
      whatsappCalling: true,
      whatsappMessaging: true,
      chatWidget: true,
      email: true,
      ecommerce: true,
      calendar: true,
      googleSheets: true,
      batchCalls: true,
      prioritySupport: true,
      analytics: true,
      advancedAnalytics: true,
      apiAccess: true
    },
    channels: ['phone', 'whatsapp', 'chat_widget', 'email'],
    analyticsLevel: 'advanced',
    supportLevel: 'priority'
  },
  ENTERPRISE: {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    nameTR: 'Kurumsal',
    nameEN: 'Enterprise',
    namePR: 'Empresarial',
    minutesLimit: -1,         // Sınırsız (özel)
    callsLimit: -1,
    assistantsLimit: -1,      // Sınırsız
    phoneNumbersLimit: -1,    // Sınırsız
    overageLimit: -1,         // Sınırsız (özel)
    concurrentLimit: 5,       // 5+ eşzamanlı çağrı (custom olabilir)
    features: {
      phone: true,
      whatsappCalling: true,
      whatsappMessaging: true,
      chatWidget: true,
      email: true,
      ecommerce: true,
      calendar: true,
      googleSheets: true,
      batchCalls: true,
      prioritySupport: true,
      analytics: true,
      advancedAnalytics: true,
      apiAccess: true,
      customVoice: true,
      whiteLabel: true,
      dedicatedSupport: true,
      slaGuarantee: true,
      customIntegrations: true
    },
    channels: ['phone', 'whatsapp', 'chat_widget', 'email'],
    analyticsLevel: 'advanced',
    supportLevel: 'dedicated'
  },

  // ============================================================================
  // DEPRECATED - geriye dönük uyumluluk için (STARTER ve PRO değerlerini kullan)
  // ============================================================================
  BASIC: {
    id: 'BASIC',
    name: 'Basic',
    nameTR: 'Temel',
    nameEN: 'Basic',
    namePR: 'Básico',
    deprecated: true,
    minutesLimit: 0,
    callsLimit: 0,
    assistantsLimit: 5,
    phoneNumbersLimit: 0,
    overageLimit: 0,
    concurrentLimit: 0,
    features: {
      phone: false,
      whatsappCalling: false,
      whatsappMessaging: true,
      chatWidget: true,
      email: true,
      ecommerce: true,
      calendar: true,
      googleSheets: true,
      batchCalls: true,
      prioritySupport: false,
      analytics: true,
      apiAccess: false
    },
    channels: ['whatsapp', 'chat_widget', 'email']
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get regional pricing configuration
 * @param {string} countryCode - Country code (TR, BR, US, etc.)
 * @returns {object} Regional pricing configuration
 */
export function getRegionalPricing(countryCode) {
  const regional = REGIONAL_PRICING[countryCode];

  if (!regional) {
    // Default to US pricing
    return REGIONAL_PRICING.US;
  }

  // If this region uses USD pricing with a multiplier
  if (regional.useUSDPricing) {
    const usPricing = REGIONAL_PRICING.US;
    const multiplier = regional.multiplier || 1;

    return {
      currency: regional.currency,
      symbol: regional.symbol,
      plans: Object.fromEntries(
        Object.entries(usPricing.plans).map(([planId, plan]) => [
          planId,
          {
            price: plan.price ? Math.round(plan.price * multiplier) : null,
            minutes: plan.minutes,
            overageRate: plan.overageRate ? +(plan.overageRate * multiplier).toFixed(2) : null
          }
        ])
      ),
      creditTiers: usPricing.creditTiers.map(tier => ({
        minMinutes: tier.minMinutes,
        unitPrice: +(tier.unitPrice * multiplier).toFixed(2)
      }))
    };
  }

  return regional;
}

/**
 * Get plan configuration by plan name
 * @param {string} planName - Plan name (FREE, STARTER, BASIC, PROFESSIONAL, ENTERPRISE)
 * @returns {object} Plan configuration
 */
export function getPlanConfig(planName) {
  return PLANS[planName] || PLANS.FREE;
}

/**
 * Get plan with regional pricing
 * @param {string} planName - Plan name
 * @param {string} countryCode - Country code
 * @returns {object} Plan configuration with regional pricing
 */
export function getPlanWithPricing(planName, countryCode = 'TR') {
  const plan = getPlanConfig(planName);
  const regional = getRegionalPricing(countryCode);
  const planPricing = regional.plans[planName] || regional.plans.FREE;

  return {
    ...plan,
    price: planPricing.price,
    minutesLimit: planPricing.minutes ?? plan.minutesLimit,
    overageRate: planPricing.overageRate,
    currency: regional.currency,
    currencySymbol: regional.symbol
  };
}

/**
 * Get all plans with regional pricing
 * @param {string} countryCode - Country code
 * @returns {object} All plans with regional pricing
 */
export function getAllPlansWithPricing(countryCode = 'TR') {
  const result = {};
  for (const planName of Object.keys(PLANS)) {
    result[planName] = getPlanWithPricing(planName, countryCode);
  }
  return result;
}

/**
 * Get credit unit price based on quantity and region
 * @param {number} minutes - Number of minutes to purchase
 * @param {string} countryCode - Country code
 * @returns {number} Unit price in local currency
 */
export function getCreditUnitPrice(minutes, countryCode = 'TR') {
  const regional = getRegionalPricing(countryCode);
  const tiers = regional.creditTiers;

  for (const tier of tiers) {
    if (minutes >= tier.minMinutes) {
      return tier.unitPrice;
    }
  }
  return tiers[tiers.length - 1].unitPrice;
}

/**
 * Calculate total credit price
 * @param {number} minutes - Number of minutes to purchase
 * @param {string} countryCode - Country code
 * @returns {object} { minutes, unitPrice, totalAmount, currency }
 */
export function calculateCreditPrice(minutes, countryCode = 'TR') {
  const regional = getRegionalPricing(countryCode);
  const unitPrice = getCreditUnitPrice(minutes, countryCode);

  return {
    minutes,
    unitPrice,
    totalAmount: +(minutes * unitPrice).toFixed(2),
    currency: regional.currency,
    currencySymbol: regional.symbol
  };
}

/**
 * Check if a feature is available for a plan
 * @param {string} planName - Plan name
 * @param {string} featureName - Feature name
 * @returns {boolean}
 */
export function hasFeature(planName, featureName) {
  const plan = getPlanConfig(planName);
  return plan.features?.[featureName] || false;
}

/**
 * Get overage rate for a plan in a specific region
 * @param {string} planName - Plan name
 * @param {string} countryCode - Country code
 * @returns {number} Overage rate in local currency per minute
 */
export function getOverageRate(planName, countryCode = 'TR') {
  const regional = getRegionalPricing(countryCode);
  return regional.plans[planName]?.overageRate || 0;
}

/**
 * Get overage limit for a plan
 * @param {string} planName - Plan name
 * @returns {number} Overage limit in minutes
 */
export function getOverageLimit(planName) {
  const plan = getPlanConfig(planName);
  return plan.overageLimit || 0;
}

/**
 * Get concurrent call limit for a plan
 * @param {string} planName - Plan name
 * @param {string} countryCode - Country code
 * @returns {number} Concurrent call limit
 */
export function getConcurrentLimit(planName, countryCode = 'TR') {
  const regional = getRegionalPricing(countryCode);
  const planPricing = regional.plans[planName];
  if (planPricing?.concurrentLimit !== undefined) {
    return planPricing.concurrentLimit;
  }
  const plan = getPlanConfig(planName);
  return plan.concurrentLimit || 1;
}

/**
 * Check if a channel is available for a plan
 * @param {string} planName - Plan name
 * @param {string} channel - Channel name (phone, whatsapp, chat_widget, email)
 * @returns {boolean}
 */
export function hasChannel(planName, channel) {
  const plan = getPlanConfig(planName);
  return plan.channels?.includes(channel) || false;
}

/**
 * Get all available channels for a plan
 * @param {string} planName - Plan name
 * @returns {string[]} Array of channel names
 */
export function getChannels(planName) {
  const plan = getPlanConfig(planName);
  return plan.channels || [];
}

/**
 * Get plan name in specific language
 * @param {string} planName - Plan name
 * @param {string} languageCode - Language code (TR, EN, PR, etc.)
 * @returns {string} Localized plan name
 */
export function getPlanName(planName, languageCode = 'EN') {
  const plan = getPlanConfig(planName);
  const key = `name${languageCode}`;
  return plan[key] || plan.nameEN || plan.name;
}

/**
 * Format price for display
 * @param {number} price - Price value
 * @param {string} countryCode - Country code
 * @returns {string} Formatted price string
 */
export function formatPrice(price, countryCode = 'TR') {
  if (price === null || price === undefined) {
    return null;
  }

  const regional = getRegionalPricing(countryCode);
  const currency = getCurrency(regional.currency);

  const formattedNumber = price
    .toFixed(currency.decimalPlaces)
    .replace('.', currency.decimalSeparator)
    .replace(/\B(?=(\d{3})+(?!\d))/g, currency.thousandSeparator);

  if (currency.position === 'before') {
    return `${currency.symbol}${formattedNumber}`;
  } else {
    return `${formattedNumber}${currency.symbol}`;
  }
}

// ============================================================================
// YENİ HELPER FONKSİYONLAR - Fiyatlandırma sistemi için
// ============================================================================

/**
 * Get price per minute for a plan
 * @param {string} planName - Plan name
 * @param {string} countryCode - Country code
 * @returns {number} Price per minute in local currency
 */
export function getPricePerMinute(planName, countryCode = 'TR') {
  const regional = getRegionalPricing(countryCode);
  return regional.plans[planName]?.pricePerMinute || 0;
}

/**
 * Get included minutes for a plan
 * @param {string} planName - Plan name
 * @param {string} countryCode - Country code
 * @returns {number} Included minutes
 */
export function getIncludedMinutes(planName, countryCode = 'TR') {
  const regional = getRegionalPricing(countryCode);
  return regional.plans[planName]?.minutes || 0;
}

/**
 * Get minimum topup minutes for PAYG
 * @param {string} countryCode - Country code
 * @returns {number} Minimum topup minutes
 */
export function getMinTopupMinutes(countryCode = 'TR') {
  const regional = getRegionalPricing(countryCode);
  return regional.minTopupMinutes || 4;
}

/**
 * Calculate TL from minutes for a plan
 * @param {number} minutes - Number of minutes
 * @param {string} planName - Plan name
 * @param {string} countryCode - Country code
 * @returns {number} Amount in local currency
 */
export function calculateMinutesToTL(minutes, planName, countryCode = 'TR') {
  const pricePerMinute = getPricePerMinute(planName, countryCode);
  return +(minutes * pricePerMinute).toFixed(2);
}

/**
 * Calculate minutes from TL for a plan
 * @param {number} amount - Amount in local currency
 * @param {string} planName - Plan name
 * @param {string} countryCode - Country code
 * @returns {number} Number of minutes
 */
export function calculateTLToMinutes(amount, planName, countryCode = 'TR') {
  const pricePerMinute = getPricePerMinute(planName, countryCode);
  if (pricePerMinute === 0) return 0;
  return Math.floor(amount / pricePerMinute);
}

/**
 * Get assistants limit for a plan
 * @param {string} planName - Plan name
 * @param {string} countryCode - Country code
 * @returns {number} Assistants limit (-1 for unlimited)
 */
export function getAssistantsLimit(planName, countryCode = 'TR') {
  const regional = getRegionalPricing(countryCode);
  const planPricing = regional.plans[planName];
  if (planPricing?.assistantsLimit !== undefined) {
    return planPricing.assistantsLimit;
  }
  const plan = getPlanConfig(planName);
  return plan.assistantsLimit || 0;
}

/**
 * Check if a plan is a paid plan (requires subscription)
 * @param {string} planName - Plan name
 * @returns {boolean}
 */
export function isPaidPlan(planName) {
  return ['STARTER', 'PRO', 'ENTERPRISE', 'BASIC'].includes(planName);
}

/**
 * Check if a plan requires balance (ONLY PAYG - prepaid)
 * @param {string} planName - Plan name
 * @returns {boolean}
 */
export function requiresBalance(planName) {
  return planName === 'PAYG';
}

/**
 * Get payment model for a plan
 * @param {string} planName - Plan name
 * @returns {'PREPAID' | 'POSTPAID' | null}
 */
export function getPaymentModel(planName) {
  return PAYMENT_MODELS[planName] || null;
}

/**
 * Check if a plan uses prepaid model (balance topup)
 * @param {string} planName - Plan name
 * @returns {boolean}
 */
export function isPrepaidPlan(planName) {
  return PAYMENT_MODELS[planName] === 'PREPAID';
}

/**
 * Check if a plan uses postpaid model (monthly overage invoice)
 * @param {string} planName - Plan name
 * @returns {boolean}
 */
export function isPostpaidPlan(planName) {
  return PAYMENT_MODELS[planName] === 'POSTPAID';
}

/**
 * Get fixed overage price for a region
 * @param {string} countryCode - Country code
 * @returns {number} Fixed overage price per minute
 */
export function getFixedOveragePrice(countryCode = 'TR') {
  return OVERAGE_PRICE[countryCode] || OVERAGE_PRICE.US;
}

// ============================================================================
// CHAT/WHATSAPP TOKEN FİYATLANDIRMA FONKSİYONLARI
// ============================================================================

/**
 * Get token pricing configuration for a region
 * @param {string} countryCode - Country code (TR, BR, US)
 * @returns {object} Token pricing configuration
 */
export function getTokenPricing(countryCode = 'TR') {
  return TOKEN_PRICING[countryCode] || TOKEN_PRICING.US;
}

/**
 * Get token price per 1K tokens for a plan
 * @param {string} planName - Plan name
 * @param {string} countryCode - Country code
 * @returns {{ inputPer1K: number, outputPer1K: number }}
 */
export function getTokenPricePerK(planName, countryCode = 'TR') {
  const pricing = getTokenPricing(countryCode);
  return pricing.plans[planName] || pricing.plans.FREE;
}

/**
 * Calculate token cost for input and output tokens
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @param {string} planName - Plan name
 * @param {string} countryCode - Country code
 * @returns {{ inputCost: number, outputCost: number, totalCost: number }}
 */
export function calculateTokenCost(inputTokens, outputTokens, planName, countryCode = 'TR') {
  const pricing = getTokenPricePerK(planName, countryCode);

  // 1K token başına fiyat ile hesapla
  const inputCost = (inputTokens / 1000) * pricing.inputPer1K;
  const outputCost = (outputTokens / 1000) * pricing.outputPer1K;
  const totalCost = inputCost + outputCost;

  return {
    inputCost: +inputCost.toFixed(6),
    outputCost: +outputCost.toFixed(6),
    totalCost: +totalCost.toFixed(6)
  };
}

/**
 * Check if a plan has free chat/whatsapp
 * @param {string} planName - Plan name
 * @returns {boolean}
 */
export function hasFreeChat(planName) {
  return ['FREE', 'TRIAL'].includes(planName);
}

/**
 * Normalize plan name to canonical form
 * Maps deprecated plan names to current ones:
 * - BASIC -> STARTER (optional)
 * @param {string} planName - Plan name
 * @returns {string} Normalized plan name
 */
export function normalizePlanName(planName) {
  const planMap = {
    // 'BASIC': 'STARTER',  // Uncomment if you want to migrate BASIC users too
  };
  return planMap[planName] || planName;
}

/**
 * Check if plan is PRO tier
 * @param {string} planName - Plan name
 * @returns {boolean}
 */
export function isProTier(planName) {
  return planName === 'PRO';
}

/**
 * Check if plan has PRO features (PRO or ENTERPRISE)
 * @param {string} planName - Plan name
 * @returns {boolean}
 */
export function hasProFeatures(planName) {
  return ['PRO', 'ENTERPRISE'].includes(planName);
}

// ============================================================================
// LEGACY EXPORTS (for backward compatibility)
// ============================================================================

// Legacy credit pricing - defaults to TR
export const CREDIT_PRICING = {
  tiers: REGIONAL_PRICING.TR.creditTiers
};

export default {
  PLANS,
  REGIONAL_PRICING,
  CREDIT_PRICING,
  USD_TO_TRY,
  OVERAGE_PRICE,
  PAYMENT_MODELS,
  TOKEN_PRICING,
  getRegionalPricing,
  getPlanConfig,
  getPlanWithPricing,
  getAllPlansWithPricing,
  getCreditUnitPrice,
  calculateCreditPrice,
  hasFeature,
  hasChannel,
  getChannels,
  getOverageRate,
  getOverageLimit,
  getConcurrentLimit,
  getPlanName,
  formatPrice,
  // Yeni fonksiyonlar
  getPricePerMinute,
  getIncludedMinutes,
  getMinTopupMinutes,
  calculateMinutesToTL,
  calculateTLToMinutes,
  getAssistantsLimit,
  isPaidPlan,
  requiresBalance,
  // Yeni prepaid/postpaid fonksiyonlar
  getPaymentModel,
  isPrepaidPlan,
  isPostpaidPlan,
  getFixedOveragePrice,
  // Token fiyatlandırma fonksiyonları
  getTokenPricing,
  getTokenPricePerK,
  calculateTokenCost,
  hasFreeChat,
  // Plan normalization helpers
  normalizePlanName,
  isProTier,
  hasProFeatures
};
