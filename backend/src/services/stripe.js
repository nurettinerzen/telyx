import Stripe from 'stripe';
import dotenv from 'dotenv';
import { getRegionalPricing, getPlanWithPricing } from '../config/plans.js';
import { getCountry } from '../config/countries.js';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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

  /**
   * Create a customer with regional metadata
   * @param {string} email - Customer email
   * @param {string} name - Customer name
   * @param {string} countryCode - Country code (TR, BR, US, etc.)
   */
  async createCustomer(email, name, countryCode = 'TR') {
    try {
      const country = getCountry(countryCode);

      return await stripe.customers.create({
        email,
        name,
        metadata: {
          country: countryCode,
          currency: country.currency,
          timezone: country.timezone
        }
      });
    } catch (error) {
      console.error('Create customer error:', error);
      throw error;
    }
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
    businessId
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
        locale: this.getStripeLocale(countryCode)
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
    businessId
  }) {
    try {
      const paymentMethods = this.getPaymentMethodsForCountry(countryCode);

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
            unit_amount: Math.round(amount * 100)
          },
          quantity: 1
        }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          businessId,
          type: 'credit_purchase',
          minutes: minutes.toString(),
          country: countryCode
        },
        locale: this.getStripeLocale(countryCode)
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
    amount
  }) {
    try {
      const paymentMethods = this.getPaymentMethodsForCountry(countryCode);
      const noun = addOnKind === 'VOICE'
        ? (countryCode === 'TR' ? 'Ses dakikası add-on' : 'Voice minute add-on')
        : (countryCode === 'TR' ? 'Yazılı etkileşim add-on' : 'Written interaction add-on');

      const unitLabel = addOnKind === 'VOICE'
        ? (countryCode === 'TR' ? 'dakika' : 'minutes')
        : (countryCode === 'TR' ? 'etkileşim' : 'interactions');

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
            unit_amount: Math.round(amount * 100)
          },
          quantity: 1
        }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          type: 'addon_purchase',
          addonKind: addOnKind,
          packageId,
          quantity: String(quantity),
          unitPrice: String(unitPrice),
          businessId: String(businessId),
          subscriptionId: String(subscriptionId),
          country: countryCode
        },
        locale: this.getStripeLocale(countryCode)
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
