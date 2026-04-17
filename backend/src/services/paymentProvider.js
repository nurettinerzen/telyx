/**
 * Payment provider selection service.
 *
 * Stripe is the only active processor. We still keep a lightweight
 * pricing-profile distinction for Brazil so BRL price IDs and local
 * payment methods continue to work without branching into another provider.
 */

import prisma from '../prismaClient.js';

const STRIPE_LOCAL_COUNTRIES = {
  BR: {
    provider: 'stripe_brl',
    currency: 'BRL',
    paymentMethods: ['card', 'pix', 'boleto'],
    locale: 'pt-BR'
  }
};

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
    }
  },
  ENTERPRISE: {
    stripe: {
      priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
      amount: null,
      currency: 'USD'
    },
    stripe_brl: {
      priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID_BRL,
      amount: null,
      currency: 'BRL'
    }
  }
};

class PaymentProviderService {
  async getProviderForBusiness(businessId) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { country: true }
    });

    return this.getProviderForCountry(business?.country);
  }

  getProviderForCountry(country) {
    const upperCountry = String(country || '').toUpperCase();
    return STRIPE_LOCAL_COUNTRIES[upperCountry]?.provider || 'stripe';
  }

  getCurrencyForCountry(country) {
    return COUNTRY_CURRENCY[String(country || '').toUpperCase()] || 'USD';
  }

  getPaymentMethodsForCountry(country) {
    const localConfig = STRIPE_LOCAL_COUNTRIES[String(country || '').toUpperCase()];
    return localConfig?.paymentMethods || ['card'];
  }

  hasLocalPaymentMethods(country) {
    return Boolean(STRIPE_LOCAL_COUNTRIES[String(country || '').toUpperCase()]);
  }

  getPlanPricing(planId, provider) {
    const plan = PLAN_PRICES[planId];
    if (!plan) {
      return null;
    }
    return plan[provider] || plan.stripe || null;
  }

  getPlansForProvider(provider) {
    return Object.entries(PLAN_PRICES).map(([planId, prices]) => ({
      id: planId,
      ...(prices[provider] || prices.stripe || {})
    }));
  }

  isProviderConfigured(provider) {
    return (provider === 'stripe' || provider === 'stripe_brl') && Boolean(process.env.STRIPE_SECRET_KEY);
  }
}

export default new PaymentProviderService();
