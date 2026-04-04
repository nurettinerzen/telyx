import Stripe from 'stripe';
import dotenv from 'dotenv';
import { getRegionalPricing, getPlanWithPricing } from '../config/plans.js';
import { getCountry } from '../config/countries.js';

dotenv.config();

function createMissingStripeProxy(path = ['stripe']) {
  return new Proxy(() => {}, {
    get(_, prop) {
      if (prop === 'then') return undefined;
      return createMissingStripeProxy([...path, String(prop)]);
    },
    apply() {
      throw new Error(
        `Stripe is not configured. Missing STRIPE_SECRET_KEY while calling ${path.join('.')}. ` +
        'Add a Stripe key to enable billing flows.'
      );
    }
  });
}

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : createMissingStripeProxy();

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('⚠️ STRIPE_SECRET_KEY not set. Stripe billing routes are disabled until a key is configured.');
}

/**
 * Stripe Service with Multi-Currency Support
 *
 * Supports:
 * - Multiple currencies (TRY, BRL, USD, EUR, GBP, AED)
 * - Region-specific payment methods (Pix, Boleto for Brazil)
 * - Dynamic pricing based on country
 */
class StripeService {
  getStripeClient() {
    return stripe;
  }

  normalizeMetadata(metadata = {}) {
    return Object.fromEntries(
      Object.entries(metadata)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)])
    );
  }

  toMinorUnitAmount(amount) {
    return Math.round(Number(amount || 0) * 100);
  }

  async rememberCustomerPaymentMethod({ customerId, paymentIntentId }) {
    if (!customerId || !paymentIntentId) {
      return null;
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['payment_method']
    });

    const paymentMethod = paymentIntent?.payment_method;
    const paymentMethodId = typeof paymentMethod === 'string'
      ? paymentMethod
      : paymentMethod?.id;

    if (!paymentMethodId) {
      return null;
    }

    const attachedCustomerId = typeof paymentMethod === 'object'
      ? paymentMethod.customer
      : null;

    if (!attachedCustomerId) {
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    } else if (String(attachedCustomerId) !== String(customerId)) {
      throw new Error(`Payment method ${paymentMethodId} belongs to a different Stripe customer`);
    }

    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method']
    });
    const currentDefault = customer?.invoice_settings?.default_payment_method;
    const currentDefaultId = typeof currentDefault === 'string'
      ? currentDefault
      : currentDefault?.id;

    if (currentDefaultId !== paymentMethodId) {
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });
    }

    return paymentMethodId;
  }

  async getReusablePaymentMethod(customerId) {
    if (!customerId) {
      return null;
    }

    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method']
    });

    const defaultPaymentMethod = customer?.invoice_settings?.default_payment_method;
    let paymentMethodId = typeof defaultPaymentMethod === 'string'
      ? defaultPaymentMethod
      : defaultPaymentMethod?.id;

    if (!paymentMethodId) {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
        limit: 1
      });
      paymentMethodId = paymentMethods.data[0]?.id || null;

      if (paymentMethodId) {
        await stripe.customers.update(customerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId
          }
        });
      }
    }

    return paymentMethodId;
  }

  async chargeCustomer({
    customerId,
    amount,
    currency = 'TRY',
    description,
    metadata = {},
    idempotencyKey
  }) {
    const paymentMethodId = await this.getReusablePaymentMethod(customerId);

    if (!paymentMethodId) {
      throw new Error('No reusable payment method saved for this customer');
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: this.toMinorUnitAmount(amount),
      currency: String(currency || 'TRY').toLowerCase(),
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
      off_session: true,
      description,
      metadata: this.normalizeMetadata(metadata)
    }, idempotencyKey ? { idempotencyKey } : undefined);

    return {
      success: paymentIntent.status === 'succeeded',
      paymentIntentId: paymentIntent.id,
      paymentMethodId,
      status: paymentIntent.status
    };
  }

  /**
   * Create a customer with regional metadata
   * @param {string} email - Customer email
   * @param {string} name - Customer name
   * @param {string} countryCode - Country code (TR, BR, US, etc.)
   */
  async createCustomer(email, name, countryCode = 'TR', metadata = {}) {
    try {
      const country = getCountry(countryCode);

      return await stripe.customers.create({
        email,
        name,
        metadata: {
          country: countryCode,
          currency: country.currency,
          timezone: country.timezone,
          ...this.normalizeMetadata(metadata)
        }
      });
    } catch (error) {
      console.error('Create customer error:', error);
      throw error;
    }
  }

  /**
   * Return an existing Stripe customer if it still exists, otherwise create a new one.
   * Useful when local records still carry customer IDs from an older Stripe account.
   */
  async ensureCustomer({
    stripeCustomerId,
    email,
    name,
    countryCode = 'TR',
    metadata = {}
  }) {
    if (stripeCustomerId) {
      try {
        const customer = await stripe.customers.retrieve(stripeCustomerId);
        if (customer && !customer.deleted) {
          return { customer, recreated: false };
        }
      } catch (error) {
        const message = String(error?.message || '');
        const code = String(error?.code || error?.raw?.code || '');
        const isMissingCustomer = code === 'resource_missing' || message.includes('No such customer');

        if (!isMissingCustomer) {
          throw error;
        }

        console.warn(`⚠️ Stripe customer ${stripeCustomerId} was not found. Recreating customer in current Stripe account.`);
      }
    }

    const customer = await this.createCustomer(email, name, countryCode, metadata);
    return { customer, recreated: Boolean(stripeCustomerId) };
  }

  /**
   * Get payment methods available for a country
   * @param {string} countryCode - Country code
   * @returns {string[]} Array of payment method types
   */
  getPaymentMethodsForCountry(countryCode) {
    const methodsByCountry = {
      BR: ['card', 'boleto', 'pix'],
      TR: ['card'],
      US: ['card'],
      GB: ['card'],
      DE: ['card', 'sepa_debit'],
      FR: ['card', 'sepa_debit'],
      ES: ['card', 'sepa_debit'],
      NL: ['card', 'sepa_debit', 'ideal'],
      AE: ['card']
    };

    return methodsByCountry[countryCode] || ['card'];
  }

  resolveCheckoutLocale(preferredLocale, countryCode) {
    const normalized = String(preferredLocale || '').toLowerCase();

    if (normalized.startsWith('tr')) return 'tr';
    if (normalized.startsWith('pt')) return 'pt-BR';
    if (normalized.startsWith('en')) {
      return countryCode === 'GB' ? 'en-GB' : 'en';
    }
    if (normalized.startsWith('de')) return 'de';
    if (normalized.startsWith('fr')) return 'fr';
    if (normalized.startsWith('es')) return 'es';
    if (normalized.startsWith('nl')) return 'nl';

    return this.getStripeLocale(countryCode);
  }

  /**
   * Create a checkout session with multi-currency support
   * @param {object} options - Checkout options
   * @param {string} options.stripeCustomerId - Stripe customer ID
   * @param {string} options.planId - Plan ID (STARTER, BASIC, PRO)
   * @param {string} options.countryCode - Country code for pricing
   * @param {string} options.successUrl - Success redirect URL
   * @param {string} options.cancelUrl - Cancel redirect URL
   * @param {string} options.businessId - Business ID for metadata
   */
  async createCheckoutSession({
    stripeCustomerId,
    planId,
    countryCode = 'TR',
    successUrl,
    cancelUrl,
    businessId,
    checkoutLocale
  }) {
    try {
      const plan = getPlanWithPricing(planId, countryCode);
      const regional = getRegionalPricing(countryCode);

      if (!plan.price) {
        throw new Error(`Plan ${planId} does not have a price for ${countryCode}`);
      }

      // Get available payment methods for this country
      const paymentMethods = this.getPaymentMethodsForCountry(countryCode);

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: stripeCustomerId,
        payment_method_types: paymentMethods,
        line_items: [{
          price_data: {
            currency: regional.currency.toLowerCase(),
            product_data: {
              name: `TELYX.AI ${plan.name}`,
              description: `${plan.minutesLimit} ${countryCode === 'TR' ? 'dakika' : countryCode === 'BR' ? 'minutos' : 'minutes'} / ${countryCode === 'TR' ? 'ay' : countryCode === 'BR' ? 'mês' : 'month'}`,
              metadata: {
                planId,
                minutesLimit: plan.minutesLimit?.toString() || '0',
                assistantsLimit: plan.assistantsLimit?.toString() || '1'
              }
            },
            unit_amount: Math.round(plan.price * 100), // Stripe uses smallest currency unit
            recurring: { interval: 'month' }
          },
          quantity: 1
        }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          businessId,
          planId,
          country: countryCode,
          currency: regional.currency
        },
        // Automatic tax calculation (if enabled in Stripe dashboard)
        automatic_tax: { enabled: false },
        // Allow promo codes
        allow_promotion_codes: true,
        // Customer can update billing info
        billing_address_collection: 'auto',
        // Localization
        locale: this.resolveCheckoutLocale(checkoutLocale, countryCode)
      });

      return session;
    } catch (error) {
      console.error('Create checkout session error:', error);
      throw error;
    }
  }

  /**
   * Create a one-time payment session for credit purchase
   * @param {object} options - Payment options
   */
  async createCreditPurchaseSession({
    stripeCustomerId,
    minutes,
    amount,
    currency,
    countryCode = 'TR',
    successUrl,
    cancelUrl,
    businessId,
    checkoutLocale
  }) {
    try {
      const paymentMethods = this.getPaymentMethodsForCountry(countryCode);
      const sessionMetadata = {
        businessId,
        type: 'credit_purchase',
        minutes: minutes.toString(),
        country: countryCode
      };
      const paymentIntentData = paymentMethods.includes('card')
        ? {
          setup_future_usage: 'off_session',
          metadata: this.normalizeMetadata(sessionMetadata)
        }
        : undefined;

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: stripeCustomerId,
        payment_method_types: paymentMethods,
        line_items: [{
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `TELYX.AI ${countryCode === 'TR' ? 'Kredi' : countryCode === 'BR' ? 'Créditos' : 'Credits'}`,
              description: `${minutes} ${countryCode === 'TR' ? 'dakika konuşma kredisi' : countryCode === 'BR' ? 'minutos de crédito' : 'minutes of credit'}`
            },
            unit_amount: this.toMinorUnitAmount(amount)
          },
          quantity: 1
        }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: sessionMetadata,
        payment_intent_data: paymentIntentData,
        locale: this.resolveCheckoutLocale(checkoutLocale, countryCode)
      });

      return session;
    } catch (error) {
      console.error('Create credit purchase session error:', error);
      throw error;
    }
  }

  /**
   * Create a one-time checkout session for add-on purchases
   * @param {object} options - Checkout options
   */
  async createAddonCheckoutSession({
    stripeCustomerId,
    countryCode = 'TR',
    currency = 'TRY',
    successUrl,
    cancelUrl,
    businessId,
    subscriptionId,
    addOnKind,
    packageId,
    quantity,
    unitPrice,
    amount,
    checkoutLocale
  }) {
    try {
      const paymentMethods = this.getPaymentMethodsForCountry(countryCode);
      const noun = addOnKind === 'VOICE'
        ? (countryCode === 'TR' ? 'Ses dakikası add-on' : 'Voice minute add-on')
        : (countryCode === 'TR' ? 'Yazılı etkileşim add-on' : 'Written interaction add-on');

      const unitLabel = addOnKind === 'VOICE'
        ? (countryCode === 'TR' ? 'dakika' : 'minutes')
        : (countryCode === 'TR' ? 'etkileşim' : 'interactions');
      const sessionMetadata = {
        type: 'addon_purchase',
        addonKind: addOnKind,
        packageId,
        quantity: String(quantity),
        unitPrice: String(unitPrice),
        businessId: String(businessId),
        subscriptionId: String(subscriptionId),
        country: countryCode
      };
      const paymentIntentData = paymentMethods.includes('card')
        ? {
          setup_future_usage: 'off_session',
          metadata: this.normalizeMetadata(sessionMetadata)
        }
        : undefined;

      return await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: stripeCustomerId,
        payment_method_types: paymentMethods,
        line_items: [{
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `TELYX.AI ${noun}`,
              description: `${quantity} ${unitLabel} - mevcut fatura donemi icin`
            },
            unit_amount: this.toMinorUnitAmount(amount)
          },
          quantity: 1
        }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: sessionMetadata,
        payment_intent_data: paymentIntentData,
        locale: this.resolveCheckoutLocale(checkoutLocale, countryCode)
      });
    } catch (error) {
      console.error('Create addon checkout session error:', error);
      throw error;
    }
  }

  /**
   * Get Stripe locale for a country
   * @param {string} countryCode - Country code
   * @returns {string} Stripe locale code
   */
  getStripeLocale(countryCode) {
    const locales = {
      TR: 'tr',
      BR: 'pt-BR',
      US: 'en',
      GB: 'en-GB',
      DE: 'de',
      FR: 'fr',
      ES: 'es',
      NL: 'nl',
      AE: 'en'
    };
    return locales[countryCode] || 'auto';
  }

  /**
   * Update subscription plan
   * @param {string} subscriptionId - Stripe subscription ID
   * @param {string} newPlanId - New plan ID
   * @param {string} countryCode - Country code for pricing
   */
  async updateSubscription(subscriptionId, newPlanId, countryCode = 'TR') {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const plan = getPlanWithPricing(newPlanId, countryCode);
      const regional = getRegionalPricing(countryCode);

      // Create a new price for the plan
      const priceData = {
        currency: regional.currency.toLowerCase(),
        product_data: {
          name: `TELYX.AI ${plan.name}`
        },
        unit_amount: Math.round(plan.price * 100),
        recurring: { interval: 'month' }
      };

      // Update the subscription
      return await stripe.subscriptions.update(subscriptionId, {
        items: [{
          id: subscription.items.data[0].id,
          price_data: priceData
        }],
        metadata: {
          planId: newPlanId,
          country: countryCode
        },
        proration_behavior: 'create_prorations'
      });
    } catch (error) {
      console.error('Update subscription error:', error);
      throw error;
    }
  }

  /**
   * Cancel a subscription
   * @param {string} subscriptionId - Stripe subscription ID
   * @param {boolean} immediately - Cancel immediately or at period end
   */
  async cancelSubscription(subscriptionId, immediately = false) {
    try {
      if (immediately) {
        return await stripe.subscriptions.cancel(subscriptionId);
      } else {
        return await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true
        });
      }
    } catch (error) {
      console.error('Cancel subscription error:', error);
      throw error;
    }
  }

  /**
   * Get subscription details
   * @param {string} subscriptionId - Stripe subscription ID
   */
  async getSubscription(subscriptionId) {
    try {
      return await stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      console.error('Get subscription error:', error);
      throw error;
    }
  }

  /**
   * Get customer's billing history
   * @param {string} customerId - Stripe customer ID
   * @param {number} limit - Number of invoices to fetch
   */
  async getBillingHistory(customerId, limit = 10) {
    try {
      const invoices = await stripe.invoices.list({
        customer: customerId,
        limit
      });
      return invoices.data;
    } catch (error) {
      console.error('Get billing history error:', error);
      throw error;
    }
  }

  /**
   * Create a billing portal session
   * @param {string} customerId - Stripe customer ID
   * @param {string} returnUrl - URL to return to after portal
   */
  async createBillingPortalSession(customerId, returnUrl) {
    try {
      return await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl
      });
    } catch (error) {
      console.error('Create billing portal session error:', error);
      throw error;
    }
  }

  /**
   * Verify webhook signature
   * @param {string} payload - Request body
   * @param {string} signature - Stripe signature header
   * @returns {object} Verified event
   */
  verifyWebhookSignature(payload, signature) {
    try {
      return stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      throw error;
    }
  }

  /**
   * Create an overage invoice for postpaid billing
   * Used at the end of billing period for STARTER/PRO/ENTERPRISE plans
   * @param {object} options - Invoice options
   * @param {string} options.customerId - Stripe customer ID
   * @param {number} options.overageMinutes - Number of overage minutes
   * @param {number} options.overageRate - Rate per minute
   * @param {number} options.totalAmount - Total amount to charge
   * @param {string} options.currency - Currency code (TRY, BRL, USD)
   * @param {string} options.countryCode - Country code for localization
   * @param {string} options.businessName - Business name for description
   * @param {Date} options.periodStart - Billing period start
   * @param {Date} options.periodEnd - Billing period end
   */
  async createOverageInvoice({
    customerId,
    overageMinutes,
    overageRate,
    totalAmount,
    currency = 'TRY',
    countryCode = 'TR',
    businessName,
    periodStart,
    periodEnd
  }) {
    try {
      // Format dates for description
      const formatDate = (date) => {
        const d = new Date(date);
        return d.toLocaleDateString(countryCode === 'TR' ? 'tr-TR' : countryCode === 'BR' ? 'pt-BR' : 'en-US');
      };

      const periodStr = `${formatDate(periodStart)} - ${formatDate(periodEnd)}`;

      // Localized descriptions
      const descriptions = {
        TR: `Aşım kullanımı: ${overageMinutes} dakika × ${overageRate} ₺/dk (${periodStr})`,
        BR: `Uso excedente: ${overageMinutes} minutos × R$ ${overageRate}/min (${periodStr})`,
        US: `Overage usage: ${overageMinutes} minutes × $${overageRate}/min (${periodStr})`
      };

      const productNames = {
        TR: 'TELYX.AI Aşım Kullanımı',
        BR: 'TELYX.AI Uso Excedente',
        US: 'TELYX.AI Overage Usage'
      };

      // Create an invoice item (this will be added to the next invoice or a new one)
      const invoiceItem = await stripe.invoiceItems.create({
        customer: customerId,
        amount: Math.round(totalAmount * 100), // Stripe uses smallest currency unit
        currency: currency.toLowerCase(),
        description: descriptions[countryCode] || descriptions.US,
        metadata: {
          type: 'overage_charge',
          overageMinutes: overageMinutes.toString(),
          overageRate: overageRate.toString(),
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString()
        }
      });

      console.log(`💳 Created invoice item for ${businessName}: ${totalAmount} ${currency}`);

      // Create and finalize the invoice immediately
      const invoice = await stripe.invoices.create({
        customer: customerId,
        auto_advance: true, // Automatically finalize and attempt payment
        collection_method: 'charge_automatically',
        description: productNames[countryCode] || productNames.US,
        metadata: {
          type: 'overage_invoice',
          businessName,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString()
        }
      });

      // Finalize the invoice (this triggers payment attempt)
      const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

      console.log(`💳 Finalized overage invoice ${finalizedInvoice.id} for ${businessName}`);

      return {
        success: true,
        invoiceId: finalizedInvoice.id,
        invoiceItemId: invoiceItem.id,
        amount: totalAmount,
        currency,
        status: finalizedInvoice.status,
        hostedInvoiceUrl: finalizedInvoice.hosted_invoice_url,
        pdfUrl: finalizedInvoice.invoice_pdf
      };

    } catch (error) {
      console.error('Create overage invoice error:', error);
      throw error;
    }
  }

  /**
   * Create an invoice for written interaction overage
   * @param {object} options - Invoice options
   */
  async createWrittenOverageInvoice({
    customerId,
    interactionCount,
    unitPrice,
    totalAmount,
    currency = 'TRY',
    countryCode = 'TR',
    businessName,
    periodStart,
    periodEnd
  }) {
    try {
      const formatDate = (date) => {
        const d = new Date(date);
        return d.toLocaleDateString(countryCode === 'TR' ? 'tr-TR' : countryCode === 'BR' ? 'pt-BR' : 'en-US');
      };

      const periodStr = `${formatDate(periodStart)} - ${formatDate(periodEnd)}`;
      const descriptions = {
        TR: `Yazili destek asimi: ${interactionCount} etkileşim × ${unitPrice} ₺ (${periodStr})`,
        BR: `Excedente de suporte escrito: ${interactionCount} interacoes × R$ ${unitPrice} (${periodStr})`,
        US: `Written support overage: ${interactionCount} interactions × $${unitPrice} (${periodStr})`
      };
      const productNames = {
        TR: 'TELYX.AI Yazili Destek Asimi',
        BR: 'TELYX.AI Excedente de Suporte Escrito',
        US: 'TELYX.AI Written Support Overage'
      };

      const invoiceItem = await stripe.invoiceItems.create({
        customer: customerId,
        amount: Math.round(totalAmount * 100),
        currency: currency.toLowerCase(),
        description: descriptions[countryCode] || descriptions.US,
        metadata: {
          type: 'written_overage_charge',
          interactionCount: String(interactionCount),
          unitPrice: String(unitPrice),
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString()
        }
      });

      const invoice = await stripe.invoices.create({
        customer: customerId,
        auto_advance: true,
        collection_method: 'charge_automatically',
        description: productNames[countryCode] || productNames.US,
        metadata: {
          type: 'written_overage_invoice',
          businessName,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString()
        }
      });

      const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

      return {
        success: true,
        invoiceId: finalizedInvoice.id,
        invoiceItemId: invoiceItem.id,
        amount: totalAmount,
        currency,
        status: finalizedInvoice.status,
        hostedInvoiceUrl: finalizedInvoice.hosted_invoice_url,
        pdfUrl: finalizedInvoice.invoice_pdf
      };
    } catch (error) {
      console.error('Create written overage invoice error:', error);
      throw error;
    }
  }

  /**
   * Get invoice by ID
   * @param {string} invoiceId - Stripe invoice ID
   */
  async getInvoice(invoiceId) {
    try {
      return await stripe.invoices.retrieve(invoiceId);
    } catch (error) {
      console.error('Get invoice error:', error);
      throw error;
    }
  }
}

export default new StripeService();
