/**
 * Payment Provider Selection Service
 * Determines which payment provider to use based on country
 *
 * Multi-Region Payment Support:
 * - TR (Turkey) -> iyzico (TRY)
 * - BR (Brazil) -> Stripe with Pix/Boleto (BRL)
 * - US, EU, etc. -> Stripe (USD/EUR)
 */

import prisma from '../prismaClient.js';

// Countries that should use iyzico (currently disabled, using Stripe globally)
const IYZICO_COUNTRIES = [];

// Countries that use Stripe with local payment methods
const STRIPE_LOCAL_COUNTRIES = {
  BR: {
    currency: 'brl',
    paymentMethods: ['card', 'pix', 'boleto'],
    locale: 'pt-BR'
  }
};

// Country to currency mapping
const COUNTRY_CURRENCY = {
  TR: 'TRY',
  BR: 'BRL',
  US: 'USD',
  GB: 'GBP',
  DE: 'EUR',
  FR: 'EUR',
  ES: 'EUR',
  NL: 'EUR',
  IT: 'EUR',
  AE: 'AED'
};

// Plan price mapping for all regions
export const PLAN_PRICES = {
  STARTER: {
    stripe: {
      priceId: process.env.STRIPE_STARTER_PRICE_ID,
      amount: 27,
      currency: 'USD'
    },
    stripe_brl: {
      priceId: process.env.STRIPE_STARTER_PRICE_ID_BRL,
      amount: 99,
      currency: 'BRL'
    },
    iyzico: {
      pricingPlanRef: process.env.IYZICO_STARTER_PLAN_REF,
      amount: 899,
      currency: 'TRY'
    }
  },
  BASIC: {
    stripe: {
      priceId: process.env.STRIPE_BASIC_PRICE_ID,
      amount: 99,
      currency: 'USD'
    },
    stripe_brl: {
      priceId: process.env.STRIPE_BASIC_PRICE_ID_BRL,
      amount: 299,
      currency: 'BRL'
    },
    iyzico: {
      pricingPlanRef: process.env.IYZICO_BASIC_PLAN_REF,
      amount: 999,
      currency: 'TRY'
    }
  },
  PRO: {
    stripe: {
      priceId: process.env.STRIPE_PRO_PRICE_ID,
      amount: 349,
      currency: 'USD'
    },
    stripe_brl: {
      priceId: process.env.STRIPE_PRO_PRICE_ID_BRL,
      amount: 999,
      currency: 'BRL'
    },
    iyzico: {
      pricingPlanRef: process.env.IYZICO_PRO_PLAN_REF,
      amount: 3499,
      currency: 'TRY'
    }
  },
  ENTERPRISE: {
    stripe: {
      priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
      amount: null, // Contact sales
      currency: 'USD'
    },
    stripe_brl: {
      priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID_BRL,
      amount: null, // Contact sales
      currency: 'BRL'
    },
    iyzico: {
      pricingPlanRef: process.env.IYZICO_ENTERPRISE_PLAN_REF,
      amount: null, // Contact sales
      currency: 'TRY'
    }
  }
};

class PaymentProviderService {
  /**
   * Determine payment provider based on business country
   * @param {number} businessId - Business ID
   * @returns {Promise<string>} Provider name: 'stripe' or 'iyzico'
   */
  async getProviderForBusiness(businessId) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { country: true }
    });

    if (!business) {
      return 'stripe'; // Default to Stripe
    }

    return this.getProviderForCountry(business.country);
  }

  /**
   * Determine payment provider based on country code
   * @param {string} country - Country code (e.g., 'TR', 'US', 'BR')
   * @returns {string} Provider name: 'stripe', 'stripe_brl', or 'iyzico'
   */
  getProviderForCountry(country) {
    const upperCountry = country?.toUpperCase();

    if (IYZICO_COUNTRIES.includes(upperCountry)) {
      return 'iyzico';
    }

    // Brazil uses Stripe with BRL pricing
    if (upperCountry === 'BR') {
      return 'stripe_brl';
    }

    return 'stripe';
  }

  /**
   * Get currency for a country
   * @param {string} country - Country code
   * @returns {string} Currency code
   */
  getCurrencyForCountry(country) {
    return COUNTRY_CURRENCY[country?.toUpperCase()] || 'USD';
  }

  /**
   * Get Stripe payment methods for a country
   * @param {string} country - Country code
   * @returns {Array} Payment method types
   */
  getPaymentMethodsForCountry(country) {
    const localConfig = STRIPE_LOCAL_COUNTRIES[country?.toUpperCase()];
    if (localConfig) {
      return localConfig.paymentMethods;
    }
    return ['card'];
  }

  /**
   * Check if country has local payment methods (Pix, Boleto, etc.)
   * @param {string} country - Country code
   * @returns {boolean}
   */
  hasLocalPaymentMethods(country) {
    return !!STRIPE_LOCAL_COUNTRIES[country?.toUpperCase()];
  }

  /**
   * Get plan pricing for a specific provider
   * @param {string} planId - Plan ID (STARTER, PRO, ENTERPRISE)
   * @param {string} provider - Provider name ('stripe' or 'iyzico')
   * @returns {Object} Price details
   */
  getPlanPricing(planId, provider) {
    const plan = PLAN_PRICES[planId];
    if (!plan) {
      return null;
    }
    return plan[provider] || null;
  }

  /**
   * Get all available plans with pricing for a provider
   * @param {string} provider - Provider name
   * @returns {Array} List of plans with pricing
   */
  getPlansForProvider(provider) {
    return Object.entries(PLAN_PRICES).map(([planId, prices]) => ({
      id: planId,
      ...prices[provider]
    }));
  }

  /**
   * Check if provider is available and configured
   * @param {string} provider - Provider name
   * @returns {boolean} True if configured
   */
  isProviderConfigured(provider) {
    if (provider === 'stripe') {
      return !!process.env.STRIPE_SECRET_KEY;
    }
    if (provider === 'iyzico') {
      return !!(process.env.IYZICO_API_KEY && process.env.IYZICO_SECRET_KEY);
    }
    return false;
  }

  /**
   * Get subscription info including provider details
   * @param {number} businessId - Business ID
   * @returns {Promise<Object>} Subscription with provider info
   */
  async getSubscriptionWithProvider(businessId) {
    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      include: {
        business: {
          select: { country: true }
        }
      }
    });

    if (!subscription) {
      return null;
    }

    const expectedProvider = this.getProviderForCountry(subscription.business.country);

    return {
      ...subscription,
      expectedProvider,
      currentProvider: subscription.paymentProvider || 'stripe',
      providerMismatch: expectedProvider !== (subscription.paymentProvider || 'stripe')
    };
  }
}

export default new PaymentProviderService();
