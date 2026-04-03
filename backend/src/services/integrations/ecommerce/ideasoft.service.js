/**
 * Ideasoft E-Commerce Integration Service
 *
 * API: REST
 * Auth: OAuth 2.0 (client_credentials) or API Key
 * API Docs: https://apidoc.ideasoft.dev/
 * Base URL: https://{storeDomain}/api/
 */

import prisma from '../../../prismaClient.js';

class IdeasoftService {
  constructor(credentials = null) {
    this.credentials = credentials;
  }

  /**
   * Get credentials from database for a business
   */
  async getCredentials(businessId) {
    if (this.credentials) return this.credentials;

    const integration = await prisma.integration.findFirst({
      where: {
        businessId,
        type: 'IDEASOFT',
        isActive: true
      }
    });

    if (!integration) {
      throw new Error('Ideasoft integration not configured');
    }

    this.credentials = integration.credentials;
    return this.credentials;
  }

  /**
   * Get OAuth access token
   */
  async getAccessToken(credentials) {
    const { storeDomain, clientId, clientSecret, accessToken, tokenExpiresAt } = credentials;

    // Check if current token is still valid (with 5 min buffer)
    if (accessToken && tokenExpiresAt) {
      const expiryTime = new Date(tokenExpiresAt).getTime();
      const now = Date.now();
      if (expiryTime - now > 5 * 60 * 1000) {
        return accessToken;
      }
    }

    console.log(`🔑 Ideasoft: Fetching new access token for: ${storeDomain}`);

    // Clean domain
    let cleanDomain = storeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');

    const tokenUrl = `https://${cleanDomain}/oauth/v2/token`;

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Ideasoft token error:', response.status, errorText);
      throw new Error(`Ideasoft token error: ${response.status}`);
    }

    const data = await response.json();

    const expiresIn = data.expires_in || 3600;
    const tokenExpiresAtNew = new Date(Date.now() + expiresIn * 1000);

    console.log(`✅ Ideasoft: Got access token, expires in ${expiresIn}s`);

    return {
      accessToken: data.access_token,
      tokenType: data.token_type || 'Bearer',
      expiresIn,
      tokenExpiresAt: tokenExpiresAtNew
    };
  }

  /**
   * Update stored credentials with new token
   */
  async updateStoredToken(businessId, tokenData) {
    await prisma.integration.updateMany({
      where: {
        businessId,
        type: 'IDEASOFT'
      },
      data: {
        credentials: {
          ...this.credentials,
          accessToken: tokenData.accessToken,
          tokenExpiresAt: tokenData.tokenExpiresAt.toISOString()
        }
      }
    });
  }

  /**
   * Make authenticated API request
   */
  async apiRequest(businessId, endpoint, method = 'GET', data = null, params = {}) {
    const credentials = await this.getCredentials(businessId);
    let tokenData = await this.getAccessToken(credentials);

    // If we got new token data, update stored credentials
    if (typeof tokenData === 'object' && tokenData.accessToken) {
      await this.updateStoredToken(businessId, tokenData);
      tokenData = tokenData.accessToken;
    }

    // Clean domain
    let cleanDomain = credentials.storeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const baseUrl = `https://${cleanDomain}/api`;

    // Build query string
    const queryParams = new URLSearchParams(params);
    const queryString = queryParams.toString();
    const url = `${baseUrl}${endpoint}${queryString ? '?' + queryString : ''}`;

    console.log(`📦 Ideasoft API: ${method} ${url}`);

    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${tokenData}`,
        'Content-Type': 'application/json'
      }
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Ideasoft API error:', response.status, errorText);
      throw new Error(`Ideasoft API error: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Test connection
   */
  async testConnection(credentials) {
    try {
      const { storeDomain, clientId, clientSecret } = credentials;

      if (!storeDomain || !clientId || !clientSecret) {
        return {
          success: false,
          message: 'Store domain, Client ID and Client Secret are required'
        };
      }

      // Try to get an access token
      const tokenData = await this.getAccessToken(credentials);

      if (tokenData.accessToken) {
        console.log('✅ Ideasoft: Connection test successful');
        return {
          success: true,
          message: 'Ideasoft bağlantısı başarılı',
          storeDomain
        };
      }

      return {
        success: false,
        message: 'Token alınamadı'
      };
    } catch (error) {
      console.error('❌ Ideasoft testConnection error:', error);
      return {
        success: false,
        message: `Bağlantı hatası: ${error.message}`
      };
    }
  }

  // ============================================================================
  // ORDER FUNCTIONS
  // ============================================================================

  /**
   * Get order by order number
   */
  async getOrderByNumber(businessId, orderNumber) {
    try {
      console.log(`🔍 Ideasoft: Searching order by number: ${orderNumber}`);

      // Clean order number
      const cleanNumber = orderNumber.replace('#', '').trim();

      const data = await this.apiRequest(businessId, '/orders', 'GET', null, {
        'orderNumber[eq]': cleanNumber,
        limit: 10
      });

      const orders = Array.isArray(data) ? data : (data.data || []);

      if (orders.length === 0) {
        return {
          success: false,
          message: `Sipariş #${cleanNumber} bulunamadı`
        };
      }

      const order = orders[0];
      console.log(`✅ Ideasoft: Found order ${order.orderNumber || order.id}`);

      return {
        success: true,
        order: this.normalizeOrder(order)
      };
    } catch (error) {
      console.error('❌ Ideasoft getOrderByNumber error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Sipariş bilgisi alınamadı'
      };
    }
  }

  /**
   * Get orders by customer phone
   */
  async getOrdersByPhone(businessId, phone) {
    try {
      console.log(`🔍 Ideasoft: Searching orders by phone: ${phone}`);

      const cleanPhone = phone.replace(/\D/g, '');

      // Try to find orders by phone
      const data = await this.apiRequest(businessId, '/orders', 'GET', null, {
        'phone[contains]': cleanPhone,
        sort: '-createdAt',
        limit: 20
      });

      let orders = Array.isArray(data) ? data : (data.data || []);

      // If no results, try customer lookup
      if (orders.length === 0) {
        // Get customers by phone
        const customersData = await this.apiRequest(businessId, '/customers', 'GET', null, {
          'phone[contains]': cleanPhone,
          limit: 5
        });

        const customers = Array.isArray(customersData) ? customersData : (customersData.data || []);

        if (customers.length > 0) {
          // Get orders for first customer
          const customerId = customers[0].id;
          const orderData = await this.apiRequest(businessId, '/orders', 'GET', null, {
            'customerId[eq]': customerId,
            sort: '-createdAt',
            limit: 10
          });

          orders = Array.isArray(orderData) ? orderData : (orderData.data || []);
        }
      }

      if (orders.length === 0) {
        return {
          success: false,
          message: 'Bu telefon numarasına ait sipariş bulunamadı'
        };
      }

      return {
        success: true,
        order: this.normalizeOrder(orders[0]),
        totalOrders: orders.length
      };
    } catch (error) {
      console.error('❌ Ideasoft getOrdersByPhone error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get orders by customer email
   */
  async getOrdersByEmail(businessId, email) {
    try {
      console.log(`🔍 Ideasoft: Searching orders by email: ${email}`);

      const data = await this.apiRequest(businessId, '/orders', 'GET', null, {
        'email[eq]': email.toLowerCase(),
        sort: '-createdAt',
        limit: 10
      });

      const orders = Array.isArray(data) ? data : (data.data || []);

      if (orders.length === 0) {
        return {
          success: false,
          message: 'Bu email adresine ait sipariş bulunamadı'
        };
      }

      return {
        success: true,
        order: this.normalizeOrder(orders[0]),
        totalOrders: orders.length
      };
    } catch (error) {
      console.error('❌ Ideasoft getOrdersByEmail error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ============================================================================
  // PRODUCT FUNCTIONS
  // ============================================================================

  /**
   * Get product stock by name
   */
  async getProductStock(businessId, productName) {
    try {
      console.log(`🔍 Ideasoft: Searching product: ${productName}`);

      const data = await this.apiRequest(businessId, '/products', 'GET', null, {
        'name[contains]': productName,
        limit: 10
      });

      const products = Array.isArray(data) ? data : (data.data || []);

      if (products.length === 0) {
        return {
          success: false,
          message: `"${productName}" adlı ürün bulunamadı`
        };
      }

      const product = products[0];

      // Get stock info (may need separate API call depending on setup)
      let totalStock = product.stock || product.quantity || 0;

      // If product has variants, sum them
      if (product.variants && product.variants.length > 0) {
        totalStock = product.variants.reduce((sum, v) => sum + (v.stock || v.quantity || 0), 0);
      }

      console.log(`✅ Ideasoft: Found product ${product.name} with stock ${totalStock}`);

      return {
        success: true,
        product: {
          id: product.id?.toString(),
          title: product.name,
          description: product.shortDescription || product.description,
          totalStock,
          available: totalStock > 0,
          price: product.price || product.price1,
          currency: product.currency || 'TRY',
          sku: product.stockCode || product.sku,
          variants: (product.variants || []).map(v => ({
            id: v.id?.toString(),
            title: v.name || v.optionName,
            sku: v.stockCode || v.sku,
            stock: v.stock || v.quantity || 0,
            available: (v.stock || v.quantity || 0) > 0,
            price: v.price || v.price1
          })),
          source: 'ideasoft'
        },
        message: totalStock > 0
          ? `${product.name} stokta mevcut (${totalStock} adet)`
          : `${product.name} şu anda stokta yok`
      };
    } catch (error) {
      console.error('❌ Ideasoft getProductStock error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ============================================================================
  // CUSTOMER FUNCTIONS
  // ============================================================================

  /**
   * Get customer by phone
   */
  async getCustomerByPhone(businessId, phone) {
    try {
      const cleanPhone = phone.replace(/\D/g, '');

      const data = await this.apiRequest(businessId, '/customers', 'GET', null, {
        'phone[contains]': cleanPhone,
        limit: 5
      });

      const customers = Array.isArray(data) ? data : (data.data || []);

      if (customers.length === 0) {
        return {
          success: false,
          message: 'Müşteri bulunamadı'
        };
      }

      const customer = customers[0];

      return {
        success: true,
        customer: {
          id: customer.id,
          name: customer.name || `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
          email: customer.email,
          phone: customer.phone,
          createdAt: customer.createdAt
        }
      };
    } catch (error) {
      console.error('❌ Ideasoft getCustomerByPhone error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get customer by email
   */
  async getCustomerByEmail(businessId, email) {
    try {
      const data = await this.apiRequest(businessId, '/customers', 'GET', null, {
        'email[eq]': email.toLowerCase(),
        limit: 5
      });

      const customers = Array.isArray(data) ? data : (data.data || []);

      if (customers.length === 0) {
        return {
          success: false,
          message: 'Müşteri bulunamadı'
        };
      }

      const customer = customers[0];

      return {
        success: true,
        customer: {
          id: customer.id,
          name: customer.name || `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
          email: customer.email,
          phone: customer.phone,
          createdAt: customer.createdAt
        }
      };
    } catch (error) {
      console.error('❌ Ideasoft getCustomerByEmail error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  /**
   * Normalize order to standard format
   */
  normalizeOrder(order) {
    const statusMap = {
      '0': 'Beklemede',
      '1': 'Onaylandı',
      '2': 'Hazırlanıyor',
      '3': 'Kargoya Verildi',
      '4': 'Teslim Edildi',
      '5': 'İptal Edildi',
      '6': 'İade Edildi',
      'pending': 'Beklemede',
      'confirmed': 'Onaylandı',
      'preparing': 'Hazırlanıyor',
      'shipped': 'Kargoya Verildi',
      'delivered': 'Teslim Edildi',
      'cancelled': 'İptal Edildi',
      'refunded': 'İade Edildi'
    };

    const customerName = order.customerName ||
      `${order.firstName || ''} ${order.lastName || ''}`.trim() ||
      order.shippingAddress?.name ||
      'Bilinmiyor';

    // Extract tracking info
    const shipmentInfo = order.shipment || order.cargo || {};

    return {
      id: order.id?.toString(),
      orderNumber: order.orderNumber || order.id?.toString(),
      customerName,
      customerEmail: order.email || order.customerEmail,
      customerPhone: order.phone || order.customerPhone || order.shippingAddress?.phone,
      status: order.status || order.orderStatus,
      statusText: statusMap[order.status] || statusMap[order.orderStatus] || order.statusText || 'Bilinmiyor',
      totalPrice: order.totalPrice || order.total || order.grandTotal,
      currency: order.currency || 'TRY',
      createdAt: order.createdAt || order.orderDate,
      updatedAt: order.updatedAt,
      items: (order.items || order.orderProducts || order.products || []).map(item => ({
        title: item.name || item.productName,
        variantTitle: item.variantName || item.optionName,
        quantity: item.quantity,
        price: item.price || item.total
      })),
      shippingAddress: order.shippingAddress ? {
        address: order.shippingAddress.address || order.shippingAddress.addressLine1,
        city: order.shippingAddress.city,
        district: order.shippingAddress.district || order.shippingAddress.state,
        postalCode: order.shippingAddress.postalCode || order.shippingAddress.zipCode,
        country: order.shippingAddress.country
      } : null,
      tracking: (shipmentInfo.trackingNumber || order.trackingNumber) ? {
        company: shipmentInfo.cargoCompany || order.cargoCompany || 'Kargo',
        number: shipmentInfo.trackingNumber || order.trackingNumber,
        url: shipmentInfo.trackingUrl || order.trackingUrl
      } : null,
      source: 'ideasoft'
    };
  }

  /**
   * Check if business has active Ideasoft integration
   */
  static async hasIntegration(businessId) {
    try {
      const integration = await prisma.integration.findFirst({
        where: {
          businessId,
          type: 'IDEASOFT',
          isActive: true,
          connected: true
        }
      });
      return !!integration;
    } catch (error) {
      return false;
    }
  }
}

export default IdeasoftService;
