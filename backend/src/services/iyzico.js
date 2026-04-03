/**
 * iyzico Payment API Service
 * API Key + Secret Key authentication
 *
 * API Docs: https://dev.iyzipay.com/
 * Base URL Production: https://api.iyzipay.com/
 * Base URL Sandbox: https://sandbox-api.iyzipay.com/
 */

import prisma from '../prismaClient.js';
import crypto from 'crypto';
import axios from 'axios';

// iyzico API endpoints
const IYZICO_PRODUCTION_URL = 'https://api.iyzipay.com';
const IYZICO_SANDBOX_URL = 'https://sandbox-api.iyzipay.com';

class IyzicoService {
  /**
   * Get credentials from database
   * @param {number} businessId - Business ID
   * @returns {Promise<Object>} Credentials { apiKey, secretKey, baseUrl, environment }
   */
  async getCredentials(businessId) {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId,
        type: 'IYZICO',
        isActive: true
      }
    });

    if (!integration) {
      throw new Error('iyzico integration not found');
    }

    const { apiKey, secretKey, environment } = integration.credentials;

    if (!apiKey || !secretKey) {
      throw new Error('iyzico credentials not configured');
    }

    const baseUrl = environment === 'production'
      ? IYZICO_PRODUCTION_URL
      : IYZICO_SANDBOX_URL;

    return {
      apiKey,
      secretKey,
      baseUrl,
      environment
    };
  }

  /**
   * Generate iyzico authorization header
   * @param {string} apiKey - API Key
   * @param {string} secretKey - Secret Key
   * @param {string} randomString - Random string
   * @param {Object} payload - Request payload
   * @returns {string} Authorization header value
   */
  generateAuthorizationHeader(apiKey, secretKey, randomString, payload = {}) {
    // iyzico uses a specific hash generation algorithm
    const payloadString = JSON.stringify(payload);
    const hashString = apiKey + randomString + secretKey + payloadString;
    const hash = crypto.createHash('sha1').update(hashString).digest('base64');

    return `IYZWS ${apiKey}:${hash}`;
  }

  /**
   * Generate PKI (Public Key Infrastructure) string for iyzico
   * @param {Object} data - Request data object
   * @returns {string} PKI formatted string
   */
  generatePkiString(data) {
    // Convert object to iyzico's PKI format: [key=value,key=value]
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
   * @param {string} apiKey
   * @param {string} secretKey
   * @param {string} randomKey
   * @param {Object} request
   * @returns {string}
   */
  generateAuthString(apiKey, secretKey, randomKey, request) {
    const pkiString = this.generatePkiString(request);
    const dataToEncrypt = randomKey + pkiString;
    const shaHash = crypto.createHash('sha256').update(dataToEncrypt + secretKey, 'utf8').digest('hex');
    const authStr = apiKey + ':' + shaHash + ':' + randomKey;
    return Buffer.from(authStr).toString('base64');
  }

  /**
   * Make authenticated API request to iyzico
   * @param {number} businessId - Business ID
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request data
   * @returns {Promise<Object>} API response
   */
  async apiRequest(businessId, endpoint, data = {}) {
    const { apiKey, secretKey, baseUrl } = await this.getCredentials(businessId);

    const randomKey = crypto.randomBytes(8).toString('hex');
    const authorization = this.generateAuthString(apiKey, secretKey, randomKey, data);

    const url = `${baseUrl}${endpoint}`;

    try {
      const response = await axios.post(url, data, {
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
  // PAYMENT FUNCTIONS
  // ============================================================================

  /**
   * Get payment detail by payment ID
   * @param {number} businessId - Business ID
   * @param {string} paymentId - iyzico payment ID
   * @returns {Promise<Object>} Payment details
   */
  async getPaymentDetail(businessId, paymentId) {
    try {
      const data = {
        locale: 'tr',
        paymentId: paymentId
      };

      const response = await this.apiRequest(businessId, '/payment/detail', data);

      if (response.status === 'success') {
        return {
          success: true,
          payment: this.formatPayment(response)
        };
      } else {
        return {
          success: false,
          error: response.errorMessage || 'Payment not found',
          errorCode: response.errorCode
        };
      }
    } catch (error) {
      console.error('Get payment detail error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get payment by conversation ID (order number)
   * @param {number} businessId - Business ID
   * @param {string} conversationId - Conversation/Order ID
   * @returns {Promise<Object>} Payment details
   */
  async getPaymentByConversationId(businessId, conversationId) {
    try {
      const data = {
        locale: 'tr',
        conversationId: conversationId
      };

      const response = await this.apiRequest(businessId, '/payment/detail', data);

      if (response.status === 'success') {
        return {
          success: true,
          payment: this.formatPayment(response)
        };
      } else {
        return {
          success: false,
          error: response.errorMessage || 'Payment not found',
          errorCode: response.errorCode
        };
      }
    } catch (error) {
      console.error('Get payment by conversation ID error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Format payment data to standard format
   * @param {Object} payment - Raw payment from iyzico
   * @returns {Object} Formatted payment
   */
  formatPayment(payment) {
    // Map status to Turkish
    const statusMap = {
      SUCCESS: { status: 'SUCCESS', text: 'Odeme basarili' },
      FAILURE: { status: 'FAILURE', text: 'Odeme basarisiz' },
      INIT_THREEDS: { status: 'INIT_THREEDS', text: '3D Secure dogrulama bekliyor' },
      CALLBACK_THREEDS: { status: 'CALLBACK_THREEDS', text: '3D Secure dogrulandi' }
    };

    const statusInfo = statusMap[payment.paymentStatus] || {
      status: payment.paymentStatus,
      text: payment.paymentStatus
    };

    // Extract last 4 digits of card (masked)
    const cardLastFour = payment.lastFourDigits || payment.cardLastFourDigits || '****';

    return {
      paymentId: payment.paymentId,
      conversationId: payment.conversationId,
      paidPrice: parseFloat(payment.paidPrice) || 0,
      currency: payment.currency || 'TRY',
      status: statusInfo.status,
      statusText: statusInfo.text,
      paymentDate: payment.createdDate,
      cardLastFour: cardLastFour,
      cardType: payment.cardType || 'CREDIT_CARD',
      cardAssociation: payment.cardAssociation,
      installment: payment.installment
    };
  }

  // ============================================================================
  // REFUND FUNCTIONS
  // ============================================================================

  /**
   * Get refund status for a payment
   * @param {number} businessId - Business ID
   * @param {string} paymentId - Payment ID
   * @returns {Promise<Object>} Refund status
   */
  async getRefundStatus(businessId, paymentId) {
    try {
      // First get the payment to check for refund status
      const paymentResult = await this.getPaymentDetail(businessId, paymentId);

      if (!paymentResult.success) {
        return paymentResult;
      }

      // Check if there's refund info in the payment
      const payment = paymentResult.payment;

      // iyzico returns refund info in payment detail
      // For detailed refund status, we need to check transaction items
      const data = {
        locale: 'tr',
        paymentId: paymentId
      };

      const response = await this.apiRequest(businessId, '/payment/detail', data);

      // Check item transactions for refunds
      let totalRefunded = 0;
      let refundStatus = 'NO_REFUND';
      let refundDate = null;

      if (response.itemTransactions) {
        for (const item of response.itemTransactions) {
          if (item.transactionStatus === 2 || item.transactionStatus === -1) {
            // 2 = refunded, -1 = cancelled
            totalRefunded += parseFloat(item.paidPrice) || 0;
            refundStatus = 'REFUNDED';
            refundDate = item.convertedPayout?.blockageResolveDate;
          }
        }
      }

      if (refundStatus === 'NO_REFUND') {
        return {
          success: true,
          hasRefund: false,
          message: 'Bu odeme icin iade talebi bulunmuyor.'
        };
      }

      return {
        success: true,
        hasRefund: true,
        refund: {
          paymentId: paymentId,
          refundStatus: refundStatus,
          refundStatusText: 'Iade tamamlandi',
          refundAmount: totalRefunded,
          refundDate: refundDate,
          originalAmount: payment.paidPrice
        }
      };
    } catch (error) {
      console.error('Get refund status error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Initiate refund for a payment (optional feature)
   * @param {number} businessId - Business ID
   * @param {string} paymentTransactionId - Payment transaction ID
   * @param {number} amount - Refund amount
   * @param {string} reason - Refund reason
   * @returns {Promise<Object>} Refund result
   */
  async initiateRefund(businessId, paymentTransactionId, amount, reason = '') {
    try {
      const data = {
        locale: 'tr',
        conversationId: `REFUND-${Date.now()}`,
        paymentTransactionId: paymentTransactionId,
        price: amount.toString(),
        currency: 'TRY',
        reason: reason
      };

      const response = await this.apiRequest(businessId, '/payment/refund', data);

      if (response.status === 'success') {
        return {
          success: true,
          refund: {
            refundId: response.paymentId,
            status: 'SUCCESS',
            statusText: 'Iade baslatildi',
            amount: parseFloat(response.price) || amount
          }
        };
      } else {
        return {
          success: false,
          error: response.errorMessage || 'Refund failed',
          errorCode: response.errorCode
        };
      }
    } catch (error) {
      console.error('Initiate refund error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ============================================================================
  // CONNECTION MANAGEMENT
  // ============================================================================

  /**
   * Connect iyzico with API credentials
   * @param {number} businessId - Business ID
   * @param {string} apiKey - iyzico API Key
   * @param {string} secretKey - iyzico Secret Key
   * @param {string} environment - 'sandbox' or 'production'
   * @returns {Promise<Object>} Connection result
   */
  async connect(businessId, apiKey, secretKey, environment = 'sandbox') {
    try {
      // Validate credentials by making a test request
      const testResult = await this.testConnection(apiKey, secretKey, environment);

      if (!testResult.success) {
        return {
          success: false,
          error: testResult.error || 'Invalid credentials'
        };
      }

      // Save credentials to database
      await prisma.integration.upsert({
        where: {
          businessId_type: {
            businessId,
            type: 'IYZICO'
          }
        },
        update: {
          credentials: {
            apiKey,
            secretKey,
            environment
          },
          connected: true,
          isActive: true,
          lastSync: new Date()
        },
        create: {
          businessId,
          type: 'IYZICO',
          credentials: {
            apiKey,
            secretKey,
            environment
          },
          connected: true,
          isActive: true
        }
      });

      return {
        success: true,
        environment
      };
    } catch (error) {
      console.error('iyzico connect error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Test connection with provided credentials
   * @param {string} apiKey - API Key
   * @param {string} secretKey - Secret Key
   * @param {string} environment - Environment
   * @returns {Promise<Object>} Test result
   */
  async testConnection(apiKey, secretKey, environment = 'sandbox') {
    try {
      const baseUrl = environment === 'production'
        ? IYZICO_PRODUCTION_URL
        : IYZICO_SANDBOX_URL;

      const data = {
        locale: 'tr',
        conversationId: `TEST-${Date.now()}`
      };

      const randomKey = crypto.randomBytes(8).toString('hex');
      const pkiString = this.generatePkiString(data);
      const dataToEncrypt = randomKey + pkiString;
      const shaHash = crypto.createHash('sha256').update(dataToEncrypt + secretKey, 'utf8').digest('hex');
      const authStr = apiKey + ':' + shaHash + ':' + randomKey;
      const authorization = Buffer.from(authStr).toString('base64');

      // Use installment info endpoint as a simple test
      const response = await axios.post(`${baseUrl}/payment/iyzipos/installment`, data, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `IYZWSv2 ${authorization}`,
          'x-iyzi-rnd': randomKey
        }
      });

      // If we get here without error, connection works
      // Even error responses from iyzico indicate working auth
      return {
        success: true,
        message: 'Connection successful'
      };
    } catch (error) {
      // Check if it's an auth error
      if (error.response?.status === 401 || error.response?.status === 403) {
        return {
          success: false,
          error: 'Gecersiz API Key veya Secret Key'
        };
      }

      // Other errors might still mean auth works
      if (error.response?.data?.status === 'failure') {
        // API responded, auth works, but request failed
        // This is actually OK for connection test
        return {
          success: true,
          message: 'Connection successful'
        };
      }

      return {
        success: false,
        error: error.message || 'Connection failed'
      };
    }
  }

  /**
   * Disconnect iyzico integration
   * @param {number} businessId - Business ID
   * @returns {Promise<Object>} Result
   */
  async disconnect(businessId) {
    try {
      await prisma.integration.updateMany({
        where: {
          businessId,
          type: 'IYZICO'
        },
        data: {
          connected: false,
          isActive: false,
          credentials: {}
        }
      });

      return { success: true };
    } catch (error) {
      console.error('iyzico disconnect error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get connection status
   * @param {number} businessId - Business ID
   * @returns {Promise<Object>} Status
   */
  async getStatus(businessId) {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId,
        type: 'IYZICO'
      }
    });

    if (!integration) {
      return {
        connected: false,
        environment: null
      };
    }

    return {
      connected: integration.connected && integration.isActive,
      environment: integration.credentials?.environment || 'sandbox',
      lastSync: integration.lastSync
    };
  }

  /**
   * Format money amount
   * @param {number} amount - Amount
   * @returns {string} Formatted amount
   */
  formatMoney(amount) {
    return new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }
}

export default new IyzicoService();
