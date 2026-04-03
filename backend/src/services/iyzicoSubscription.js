/**
 * iyzico Subscription Service
 * Handles recurring payments for Turkish customers
 *
 * API Docs: https://docs.iyzico.com/
 * Subscription API: https://docs.iyzico.com/urunler/abonelik
 */

import prisma from '../prismaClient.js';
import crypto from 'crypto';
import axios from 'axios';

// iyzico API endpoints
const IYZICO_PRODUCTION_URL = 'https://api.iyzipay.com';
const IYZICO_SANDBOX_URL = 'https://sandbox-api.iyzipay.com';

// Get base URL based on environment
const getBaseUrl = () => {
  return process.env.IYZICO_ENVIRONMENT === 'production'
    ? IYZICO_PRODUCTION_URL
    : IYZICO_SANDBOX_URL;
};

// Plan configurations with iyzico pricing (in TRY)
const IYZICO_PLAN_CONFIG = {
  FREE: {
    name: 'FREE',
    priceTRY: 0,
    minutesLimit: 0,
    callsLimit: 0,
    assistantsLimit: 0,
    phoneNumbersLimit: 0
  },
  STARTER: {
    name: 'STARTER',
    priceTRY: 899, // ~$27 in TRY
    minutesLimit: 300,
    callsLimit: 50,
    assistantsLimit: 1,
    phoneNumbersLimit: 1
  },
  PRO: {
    name: 'PRO',
    priceTRY: 2599, // ~$77 in TRY
    minutesLimit: 1500,
    callsLimit: -1,
    assistantsLimit: 2,
    phoneNumbersLimit: 3
  },
  ENTERPRISE: {
    name: 'ENTERPRISE',
    priceTRY: 6799, // ~$199 in TRY
    minutesLimit: -1,
    callsLimit: -1,
    assistantsLimit: 5,
    phoneNumbersLimit: 10
  }
};

class IyzicoSubscriptionService {
  constructor() {
    this.apiKey = process.env.IYZICO_API_KEY;
    this.secretKey = process.env.IYZICO_SECRET_KEY;
    this.baseUrl = getBaseUrl();
  }

  /**
   * Generate PKI (Public Key Infrastructure) string for iyzico
   * @param {Object} data - Request data object
   * @returns {string} PKI formatted string
   */
  generatePkiString(data) {
    const formatValue = (val) => {
      if (val === null || val === undefined) return '';
      if (Array.isArray(val)) {
        return `[${val.map(item =>
          typeof item === 'object' ? this.generatePkiString(item) : item
        ).join(', ')}]`;
      }
      if (typeof val === 'object') {
        return this.generatePkiString(val);
      }
      return String(val);
    };

    const pairs = Object.entries(data)
      .filter(([, val]) => val !== null && val !== undefined && val !== '')
      .map(([key, val]) => `${key}=${formatValue(val)}`);

    return `[${pairs.join(',')}]`;
  }

  /**
   * Generate authorization string for V2 API
   * @param {Object} request - Request data
   * @returns {string} Authorization header value
   */
  generateAuthString(request) {
    const randomKey = crypto.randomBytes(8).toString('hex');
    const pkiString = this.generatePkiString(request);
    const dataToEncrypt = randomKey + pkiString;
    const shaHash = crypto.createHash('sha256').update(dataToEncrypt + this.secretKey, 'utf8').digest('hex');
    const authStr = this.apiKey + ':' + shaHash + ':' + randomKey;
    return {
      authorization: Buffer.from(authStr).toString('base64'),
      randomKey
    };
  }

  /**
   * Make authenticated API request to iyzico
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request data
   * @returns {Promise<Object>} API response
   */
  async apiRequest(endpoint, data = {}) {
    const { authorization, randomKey } = this.generateAuthString(data);

    try {
      const response = await axios.post(`${this.baseUrl}${endpoint}`, data, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `IYZWSv2 ${authorization}`,
          'x-iyzi-rnd': randomKey
        }
      });

      return response.data;
    } catch (error) {
      console.error('iyzico API error:', error.response?.data || error.message);
      throw error;
    }
  }

  // ============================================================================
  // SUBSCRIPTION PRODUCT & PLAN MANAGEMENT
  // ============================================================================

  /**
   * Create subscription product (one-time setup)
   * @returns {Promise<Object>} Product details
   */
  async createProduct() {
    const data = {
      locale: 'tr',
      conversationId: `PRODUCT-${Date.now()}`,
      name: 'Telyx AI Subscription',
      description: 'Telyx AI Voice Assistant monthly subscription'
    };

    const response = await this.apiRequest('/v2/subscription/products', data);

    if (response.status === 'success') {
      return {
        success: true,
        productReferenceCode: response.data.referenceCode
      };
    }

    return {
      success: false,
      error: response.errorMessage || 'Failed to create product'
    };
  }

  /**
   * Create pricing plan for a product
   * @param {string} productReferenceCode - Product reference code
   * @param {string} planName - Plan name (STARTER, PRO, ENTERPRISE)
   * @returns {Promise<Object>} Plan details
   */
  async createPricingPlan(productReferenceCode, planName) {
    const planConfig = IYZICO_PLAN_CONFIG[planName];
    if (!planConfig) {
      return { success: false, error: 'Invalid plan name' };
    }

    const data = {
      locale: 'tr',
      conversationId: `PLAN-${planName}-${Date.now()}`,
      productReferenceCode: productReferenceCode,
      name: `Telyx ${planConfig.name}`,
      price: planConfig.priceTRY.toFixed(2),
      currencyCode: 'TRY',
      paymentInterval: 'MONTHLY',
      paymentIntervalCount: 1,
      trialPeriodDays: 0,
      planPaymentType: 'RECURRING'
    };

    const response = await this.apiRequest('/v2/subscription/pricing-plans', data);

    if (response.status === 'success') {
      return {
        success: true,
        pricingPlanReferenceCode: response.data.referenceCode
      };
    }

    return {
      success: false,
      error: response.errorMessage || 'Failed to create pricing plan'
    };
  }

  // ============================================================================
  // CUSTOMER MANAGEMENT
  // ============================================================================

  /**
   * Create iyzico subscription customer
   * @param {Object} customerData - Customer details
   * @returns {Promise<Object>} Customer reference
   */
  async createCustomer(customerData) {
    const data = {
      locale: 'tr',
      conversationId: `CUSTOMER-${Date.now()}`,
      name: customerData.name,
      surname: customerData.surname || customerData.name,
      identityNumber: customerData.identityNumber || '11111111111', // TC Kimlik (required for TR)
      email: customerData.email,
      gsmNumber: customerData.phone || '+905000000000',
      billingAddress: {
        contactName: customerData.name,
        city: customerData.city || 'Istanbul',
        country: 'Turkey',
        address: customerData.address || 'Turkey',
        zipCode: customerData.zipCode || '34000'
      },
      shippingAddress: {
        contactName: customerData.name,
        city: customerData.city || 'Istanbul',
        country: 'Turkey',
        address: customerData.address || 'Turkey',
        zipCode: customerData.zipCode || '34000'
      }
    };

    const response = await this.apiRequest('/v2/subscription/customers', data);

    if (response.status === 'success') {
      return {
        success: true,
        customerReferenceCode: response.data.referenceCode
      };
    }

    return {
      success: false,
      error: response.errorMessage || 'Failed to create customer'
    };
  }

  // ============================================================================
  // CHECKOUT FORM (Subscription Initialization)
  // ============================================================================

  /**
   * Initialize checkout form for subscription
   * @param {number} businessId - Business ID
   * @param {string} planId - Plan ID (STARTER, PROFESSIONAL, ENTERPRISE)
   * @returns {Promise<Object>} Checkout form token and URL
   */
  async initializeCheckoutForm(businessId, planId) {
    try {
      const planConfig = IYZICO_PLAN_CONFIG[planId];
      if (!planConfig || planId === 'FREE') {
        return { success: false, error: 'Invalid plan' };
      }

      // Get business and user info
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        include: {
          users: {
            where: { role: 'OWNER' },
            take: 1
          }
        }
      });

      if (!business || !business.users[0]) {
        return { success: false, error: 'Business not found' };
      }

      const user = business.users[0];
      const frontendUrl = process.env.FRONTEND_URL;

      // Generate unique reference codes
      const conversationId = `SUB-${businessId}-${Date.now()}`;

      // Get or use environment pricing plan reference
      const pricingPlanRef = process.env[`IYZICO_${planId}_PLAN_REF`];
      if (!pricingPlanRef) {
        return { success: false, error: `Pricing plan not configured for ${planId}` };
      }

      const data = {
        locale: 'tr',
        conversationId: conversationId,
        pricingPlanReferenceCode: pricingPlanRef,
        subscriptionInitialStatus: 'ACTIVE',
        callbackUrl: `${process.env.BACKEND_URL}/api/subscription/iyzico-callback`,
        customer: {
          name: user.name?.split(' ')[0] || 'Customer',
          surname: user.name?.split(' ').slice(1).join(' ') || 'Customer',
          identityNumber: '11111111111',
          email: user.email,
          gsmNumber: business.ownerPhone || '+905000000000',
          billingAddress: {
            contactName: user.name || 'Customer',
            city: 'Istanbul',
            country: 'Turkey',
            address: 'Turkey',
            zipCode: '34000'
          },
          shippingAddress: {
            contactName: user.name || 'Customer',
            city: 'Istanbul',
            country: 'Turkey',
            address: 'Turkey',
            zipCode: '34000'
          }
        }
      };

      const response = await this.apiRequest('/v2/subscription/checkoutform/initialize', data);

      if (response.status === 'success') {
        // Store pending subscription info
        await prisma.subscription.upsert({
          where: { businessId },
          create: {
            businessId,
            paymentProvider: 'iyzico',
            iyzicoReferenceCode: conversationId,
            plan: 'FREE',
            status: 'INCOMPLETE'
          },
          update: {
            paymentProvider: 'iyzico',
            iyzicoReferenceCode: conversationId,
            status: 'INCOMPLETE'
          }
        });

        return {
          success: true,
          checkoutFormContent: response.checkoutFormContent,
          token: response.token,
          tokenExpireTime: response.tokenExpireTime
        };
      }

      return {
        success: false,
        error: response.errorMessage || 'Failed to initialize checkout form'
      };
    } catch (error) {
      console.error('Initialize checkout form error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Retrieve checkout form result after callback
   * @param {string} token - Checkout form token
   * @returns {Promise<Object>} Subscription details
   */
  async retrieveCheckoutFormResult(token) {
    const data = {
      locale: 'tr',
      conversationId: `RETRIEVE-${Date.now()}`,
      token: token
    };

    const response = await this.apiRequest('/v2/subscription/checkoutform', data);

    if (response.status === 'success') {
      return {
        success: true,
        subscriptionReferenceCode: response.data.referenceCode,
        customerReferenceCode: response.data.customerReferenceCode,
        pricingPlanReferenceCode: response.data.pricingPlanReferenceCode,
        subscriptionStatus: response.data.subscriptionStatus,
        startDate: response.data.startDate,
        endDate: response.data.endDate
      };
    }

    return {
      success: false,
      error: response.errorMessage || 'Failed to retrieve checkout result'
    };
  }

  // ============================================================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================================================

  /**
   * Get subscription details
   * @param {string} subscriptionReferenceCode - Subscription reference code
   * @returns {Promise<Object>} Subscription details
   */
  async getSubscription(subscriptionReferenceCode) {
    const data = {
      locale: 'tr',
      conversationId: `GET-${Date.now()}`,
      subscriptionReferenceCode: subscriptionReferenceCode
    };

    const response = await this.apiRequest('/v2/subscription/subscriptions/' + subscriptionReferenceCode, data);

    if (response.status === 'success') {
      return {
        success: true,
        subscription: response.data
      };
    }

    return {
      success: false,
      error: response.errorMessage || 'Subscription not found'
    };
  }

  /**
   * Cancel subscription
   * @param {string} subscriptionReferenceCode - Subscription reference code
   * @returns {Promise<Object>} Result
   */
  async cancelSubscription(subscriptionReferenceCode) {
    const data = {
      locale: 'tr',
      conversationId: `CANCEL-${Date.now()}`,
      subscriptionReferenceCode: subscriptionReferenceCode
    };

    const response = await this.apiRequest('/v2/subscription/subscriptions/' + subscriptionReferenceCode + '/cancel', data);

    if (response.status === 'success') {
      return {
        success: true,
        message: 'Subscription canceled'
      };
    }

    return {
      success: false,
      error: response.errorMessage || 'Failed to cancel subscription'
    };
  }

  /**
   * Upgrade/downgrade subscription
   * @param {string} subscriptionReferenceCode - Current subscription reference
   * @param {string} newPricingPlanRef - New pricing plan reference
   * @returns {Promise<Object>} Result
   */
  async upgradeSubscription(subscriptionReferenceCode, newPricingPlanRef) {
    const data = {
      locale: 'tr',
      conversationId: `UPGRADE-${Date.now()}`,
      subscriptionReferenceCode: subscriptionReferenceCode,
      newPricingPlanReferenceCode: newPricingPlanRef,
      upgradePeriod: 'NOW', // Immediately upgrade
      useTrial: false,
      resetRecurrenceCount: true
    };

    const response = await this.apiRequest('/v2/subscription/subscriptions/' + subscriptionReferenceCode + '/upgrade', data);

    if (response.status === 'success') {
      return {
        success: true,
        message: 'Subscription upgraded'
      };
    }

    return {
      success: false,
      error: response.errorMessage || 'Failed to upgrade subscription'
    };
  }

  /**
   * Retry failed payment
   * @param {string} subscriptionReferenceCode - Subscription reference code
   * @returns {Promise<Object>} Result
   */
  async retryPayment(subscriptionReferenceCode) {
    const data = {
      locale: 'tr',
      conversationId: `RETRY-${Date.now()}`,
      subscriptionReferenceCode: subscriptionReferenceCode
    };

    const response = await this.apiRequest('/v2/subscription/operation/retry', data);

    if (response.status === 'success') {
      return {
        success: true,
        message: 'Payment retry initiated'
      };
    }

    return {
      success: false,
      error: response.errorMessage || 'Failed to retry payment'
    };
  }

  // ============================================================================
  // WEBHOOK HANDLING
  // ============================================================================

  /**
   * Process iyzico webhook event
   * @param {Object} webhookData - Webhook payload
   * @returns {Promise<Object>} Processing result
   */
  async processWebhook(webhookData) {
    try {
      const { iyziEventType, subscriptionReferenceCode, orderReferenceCode } = webhookData;

      console.log('📥 iyzico webhook received:', iyziEventType, subscriptionReferenceCode);

      // Find subscription by reference code
      const subscription = await prisma.subscription.findFirst({
        where: {
          OR: [
            { iyzicoSubscriptionId: subscriptionReferenceCode },
            { iyzicoReferenceCode: subscriptionReferenceCode }
          ]
        },
        include: {
          business: {
            include: {
              users: {
                where: { role: 'OWNER' },
                take: 1
              }
            }
          }
        }
      });

      if (!subscription) {
        console.log('⚠️ Subscription not found for:', subscriptionReferenceCode);
        return { success: false, error: 'Subscription not found' };
      }

      switch (iyziEventType) {
        case 'subscription.order.success':
          // Payment successful - activate/renew subscription
          await this.handlePaymentSuccess(subscription, webhookData);
          break;

        case 'subscription.order.failure':
          // Payment failed
          await this.handlePaymentFailure(subscription, webhookData);
          break;

        case 'subscription.cancelled':
          // Subscription canceled
          await this.handleSubscriptionCanceled(subscription);
          break;

        case 'subscription.expired':
          // Subscription expired
          await this.handleSubscriptionExpired(subscription);
          break;

        case 'subscription.renewed':
          // Subscription renewed
          await this.handleSubscriptionRenewed(subscription, webhookData);
          break;

        case 'subscription.upgraded':
          // Plan upgraded
          await this.handleSubscriptionUpgraded(subscription, webhookData);
          break;

        default:
          console.log(`ℹ️ Unhandled iyzico event: ${iyziEventType}`);
      }

      return { success: true };
    } catch (error) {
      console.error('❌ iyzico webhook processing error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle successful payment
   */
  async handlePaymentSuccess(subscription, webhookData) {
    const { pricingPlanReferenceCode } = webhookData;

    // Determine plan from pricing plan reference
    let plan = 'STARTER';
    if (pricingPlanReferenceCode === process.env.IYZICO_PRO_PLAN_REF) {
      plan = 'PRO';
    } else if (pricingPlanReferenceCode === process.env.IYZICO_ENTERPRISE_PLAN_REF) {
      plan = 'ENTERPRISE';
    }

    const planConfig = IYZICO_PLAN_CONFIG[plan];

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        plan: plan,
        status: 'ACTIVE',
        iyzicoSubscriptionId: webhookData.subscriptionReferenceCode,
        iyzicoPricingPlanId: pricingPlanReferenceCode,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        minutesLimit: planConfig.minutesLimit,
        callsLimit: planConfig.callsLimit,
        assistantsLimit: planConfig.assistantsLimit,
        phoneNumbersLimit: planConfig.phoneNumbersLimit
      }
    });

    console.log('✅ iyzico subscription activated:', plan);
  }

  /**
   * Handle failed payment
   */
  async handlePaymentFailure(subscription, webhookData) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'PAST_DUE'
      }
    });

    console.log('❌ iyzico payment failed for subscription:', subscription.id);
  }

  /**
   * Handle subscription canceled
   */
  async handleSubscriptionCanceled(subscription) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        plan: 'FREE',
        status: 'CANCELED',
        iyzicoSubscriptionId: null,
        iyzicoPricingPlanId: null,
        minutesLimit: 0,
        callsLimit: 0,
        assistantsLimit: 0,
        phoneNumbersLimit: 0
      }
    });

    console.log('✅ iyzico subscription canceled');
  }

  /**
   * Handle subscription expired
   */
  async handleSubscriptionExpired(subscription) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'EXPIRED'
      }
    });

    console.log('⚠️ iyzico subscription expired');
  }

  /**
   * Handle subscription renewed
   */
  async handleSubscriptionRenewed(subscription, webhookData) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        // Reset monthly usage
        minutesUsed: 0,
        callsThisMonth: 0
      }
    });

    console.log('✅ iyzico subscription renewed');
  }

  /**
   * Handle subscription upgraded
   */
  async handleSubscriptionUpgraded(subscription, webhookData) {
    const { newPricingPlanReferenceCode } = webhookData;

    let plan = 'STARTER';
    if (newPricingPlanReferenceCode === process.env.IYZICO_PRO_PLAN_REF) {
      plan = 'PRO';
    } else if (newPricingPlanReferenceCode === process.env.IYZICO_ENTERPRISE_PLAN_REF) {
      plan = 'ENTERPRISE';
    }

    const planConfig = IYZICO_PLAN_CONFIG[plan];

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        plan: plan,
        iyzicoPricingPlanId: newPricingPlanReferenceCode,
        minutesLimit: planConfig.minutesLimit,
        callsLimit: planConfig.callsLimit,
        assistantsLimit: planConfig.assistantsLimit,
        phoneNumbersLimit: planConfig.phoneNumbersLimit
      }
    });

    console.log('✅ iyzico subscription upgraded to:', plan);
  }

  // ============================================================================
  // UTILITY
  // ============================================================================

  /**
   * Get plan config
   * @param {string} planId - Plan ID
   * @returns {Object} Plan configuration
   */
  getPlanConfig(planId) {
    return IYZICO_PLAN_CONFIG[planId] || IYZICO_PLAN_CONFIG.FREE;
  }

  /**
   * Test iyzico connection
   * @returns {Promise<Object>} Connection status
   */
  async testConnection() {
    try {
      if (!this.apiKey || !this.secretKey) {
        return {
          success: false,
          error: 'iyzico API keys not configured'
        };
      }

      // Try a simple API call
      const data = {
        locale: 'tr',
        conversationId: `TEST-${Date.now()}`
      };

      const response = await this.apiRequest('/payment/iyzipos/installment', data);

      return {
        success: true,
        environment: process.env.IYZICO_ENVIRONMENT || 'sandbox',
        message: 'Connection successful'
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.errorMessage || error.message
      };
    }
  }
}

export default new IyzicoSubscriptionService();
