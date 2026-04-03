/**
 * ikas E-Commerce Integration Service
 *
 * API: GraphQL
 * Auth: OAuth 2.0 client_credentials flow
 * Token Endpoint: https://{storeName}.myikas.com/api/admin/oauth/token
 * API Endpoint: https://api.myikas.com/api/v1/admin/graphql
 * Token expires in: 14400 seconds (4 hours)
 *
 * Docs: https://ikas.dev/
 */

import prisma from '../../../prismaClient.js';

const GRAPHQL_ENDPOINT = 'https://api.myikas.com/api/v1/admin/graphql';

class IkasService {
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
        type: 'IKAS',
        isActive: true
      }
    });

    if (!integration) {
      throw new Error('ikas integration not configured');
    }

    this.credentials = integration.credentials;
    return this.credentials;
  }

  /**
   * Get OAuth access token using client_credentials flow
   * Token endpoint: https://{storeName}.myikas.com/api/admin/oauth/token
   */
  async getAccessToken(credentials) {
    const { storeName, clientId, clientSecret, accessToken, tokenExpiresAt } = credentials;

    // Check if current token is still valid (with 5 min buffer)
    if (accessToken && tokenExpiresAt) {
      const expiryTime = new Date(tokenExpiresAt).getTime();
      const now = Date.now();
      if (expiryTime - now > 5 * 60 * 1000) {
        return accessToken;
      }
    }

    console.log(`🔑 ikas: Fetching new access token for store: ${storeName}`);

    const tokenUrl = `https://${storeName}.myikas.com/api/admin/oauth/token`;

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
      console.error('❌ ikas token error:', response.status, errorText);
      throw new Error(`ikas token error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Calculate expiry time
    const expiresIn = data.expires_in || 14400; // Default 4 hours
    const tokenExpiresAtNew = new Date(Date.now() + expiresIn * 1000);

    console.log(`✅ ikas: Got access token, expires in ${expiresIn}s`);

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
        type: 'IKAS'
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
   * Make GraphQL request to ikas API
   */
  async graphqlQuery(businessId, query, variables = {}) {
    const credentials = await this.getCredentials(businessId);
    let tokenData = await this.getAccessToken(credentials);

    // If we got new token data (object), update stored credentials
    if (typeof tokenData === 'object' && tokenData.accessToken) {
      await this.updateStoredToken(businessId, tokenData);
      tokenData = tokenData.accessToken;
    }

    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ ikas GraphQL error:', response.status, errorText);
      throw new Error(`ikas API error: ${response.status}`);
    }

    const result = await response.json();

    if (result.errors) {
      console.error('❌ ikas GraphQL errors:', result.errors);
      throw new Error(result.errors[0]?.message || 'GraphQL query failed');
    }

    return result.data;
  }

  /**
   * Test connection with ikas API
   */
  async testConnection(credentials) {
    try {
      const { storeName, clientId, clientSecret } = credentials;

      if (!storeName || !clientId || !clientSecret) {
        return {
          success: false,
          message: 'Store name, Client ID and Client Secret are required'
        };
      }

      // Try to get an access token
      const tokenData = await this.getAccessToken(credentials);

      if (tokenData.accessToken) {
        console.log('✅ ikas: Connection test successful');
        return {
          success: true,
          message: 'ikas bağlantısı başarılı',
          storeName
        };
      }

      return {
        success: false,
        message: 'Token alınamadı'
      };
    } catch (error) {
      console.error('❌ ikas testConnection error:', error);
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
      console.log(`🔍 ikas: Searching order by number: ${orderNumber}`);



      // Note: ikas Order type doesn't have "shipments" field directly
      // Kargo bilgisi "orderPackages" field'ından alınır
      const query = `
        query listOrder($orderNumber: StringFilterInput) {
          listOrder(orderNumber: $orderNumber, pagination: { page: 1, limit: 10 }) {
            data {
              id
              orderNumber
              status
              totalPrice
              currencyCode
              createdAt
              updatedAt
              customer {
                id
                firstName
                lastName
                email
                phone
              }
              shippingAddress {
                firstName
                lastName
                phone
                addressLine1
                addressLine2
                postalCode
              }
              orderPackages {
                id
                trackingInfo {
                    cargoCompany
                  trackingNumber
                  trackingLink
                }
              }
              orderLineItems {
                id
                quantity
                finalPrice
                variant {
                  name
                }
              }
            }
            count
          }
        }
      `;

      const data = await this.graphqlQuery(businessId, query, { 
        orderNumber: { eq: orderNumber } 
      });
      const orders = data.listOrder?.data || [];

      if (orders.length === 0) {
        return {
          success: false,
          message: `Sipariş #${orderNumber} bulunamadı`
        };
      }

      const order = orders[0];
      console.log(`✅ ikas: Found order ${order.orderNumber}`);

      return {
        success: true,
        order: this.normalizeOrder(order)
      };
    } catch (error) {
      console.error('❌ ikas getOrderByNumber error:', error);
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
      console.log(`🔍 ikas: Searching orders by phone: ${phone}`);

      // Clean phone number
      const cleanPhone = phone.replace(/\D/g, '');

      // First get customer by phone
      const customerQuery = `
        query listCustomer($phone: String) {
          listCustomer(phone: $phone, pagination: { page: 1, limit: 5 }) {
            data {
              id
              firstName
              lastName
              email
              phone
            }
          }
        }
      `;

      const customerData = await this.graphqlQuery(businessId, customerQuery, { phone: cleanPhone });
      const customers = customerData.listCustomer?.data || [];

      if (customers.length === 0) {
        // Try partial match by getting recent orders and filtering
        const ordersQuery = `
          query listOrder {
            listOrder(pagination: { page: 1, limit: 50 }) {
              data {
                id
                orderNumber
                status
                totalPrice
                currencyCode
                createdAt
                customer {
                  firstName
                  lastName
                  phone
                }
                shippingAddress {
                  phone
                }
                orderLineItems {
                  productName
                  quantity
                  finalPrice
                }
                orderPackages {
                  id
                  trackingInfo {
                    cargoCompany
                  trackingNumber
                  trackingLink
                }
                }
              }
            }
          }
        `;

        const ordersData = await this.graphqlQuery(businessId, ordersQuery);
        const allOrders = ordersData.listOrder?.data || [];

        // Filter by phone
        const matchingOrders = allOrders.filter(order => {
          const customerPhone = (order.customer?.phone || '').replace(/\D/g, '');
          const shippingPhone = (order.shippingAddress?.phone || '').replace(/\D/g, '');
          return customerPhone.includes(cleanPhone) || shippingPhone.includes(cleanPhone) ||
                 cleanPhone.includes(customerPhone) || cleanPhone.includes(shippingPhone);
        });

        if (matchingOrders.length === 0) {
          return {
            success: false,
            message: 'Bu telefon numarasına ait sipariş bulunamadı'
          };
        }

        return {
          success: true,
          order: this.normalizeOrder(matchingOrders[0]),
          totalOrders: matchingOrders.length
        };
      }

      // Get orders for the customer
      const customerId = customers[0].id;
      const ordersQuery = `
        query listOrder($customerId: ID) {
          listOrder(customerId: $customerId, pagination: { page: 1, limit: 10 }) {
            data {
              id
              orderNumber
              status
              totalPrice
              currencyCode
              createdAt
              customer {
                firstName
                lastName
                phone
                email
              }
              orderLineItems {
                productName
                quantity
                finalPrice
              }
              orderPackages {
                id
                trackingInfo {
                    cargoCompany
                  trackingNumber
                  trackingLink
                }
              }
            }
          }
        }
      `;

      const ordersData = await this.graphqlQuery(businessId, ordersQuery, { customerId });
      const orders = ordersData.listOrder?.data || [];

      if (orders.length === 0) {
        return {
          success: false,
          message: 'Bu müşteriye ait sipariş bulunamadı'
        };
      }

      return {
        success: true,
        order: this.normalizeOrder(orders[0]),
        totalOrders: orders.length
      };
    } catch (error) {
      console.error('❌ ikas getOrdersByPhone error:', error);
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
      console.log(`🔍 ikas: Searching orders by email: ${email}`);

      const customerQuery = `
        query listCustomer($email: String) {
          listCustomer(email: $email, pagination: { page: 1, limit: 5 }) {
            data {
              id
              firstName
              lastName
              email
              phone
            }
          }
        }
      `;

      const customerData = await this.graphqlQuery(businessId, customerQuery, { email: email.toLowerCase() });
      const customers = customerData.listCustomer?.data || [];

      if (customers.length === 0) {
        return {
          success: false,
          message: 'Bu email adresine ait müşteri bulunamadı'
        };
      }

      const customerId = customers[0].id;
      const ordersQuery = `
        query listOrder($customerId: ID) {
          listOrder(customerId: $customerId, pagination: { page: 1, limit: 10 }) {
            data {
              id
              orderNumber
              status
              totalPrice
              currencyCode
              createdAt
              customer {
                firstName
                lastName
                phone
                email
              }
              orderLineItems {
                productName
                quantity
                finalPrice
              }
              orderPackages {
                id
                trackingInfo {
                    cargoCompany
                  trackingNumber
                  trackingLink
                }
              }
            }
          }
        }
      `;

      const ordersData = await this.graphqlQuery(businessId, ordersQuery, { customerId });
      const orders = ordersData.listOrder?.data || [];

      if (orders.length === 0) {
        return {
          success: false,
          message: 'Bu müşteriye ait sipariş bulunamadı'
        };
      }

      return {
        success: true,
        order: this.normalizeOrder(orders[0]),
        totalOrders: orders.length
      };
    } catch (error) {
      console.error('❌ ikas getOrdersByEmail error:', error);
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
      console.log(`🔍 ikas: Searching product: ${productName}`);

      const query = `
        query listProduct($search: String) {
          listProduct(search: $search, pagination: { page: 1, limit: 10 }) {
            data {
              id
              name
              description
              productVariantList {
                id
                name
                sku
                barcode
                price {
                  sellPrice
                  currency
                }
                stock {
                  stockCount
                }
                isActive
              }
            }
            count
          }
        }
      `;

      const data = await this.graphqlQuery(businessId, query, { search: productName });
      const products = data.listProduct?.data || [];

      if (products.length === 0) {
        return {
          success: false,
          message: `"${productName}" adlı ürün bulunamadı`
        };
      }

      const product = products[0];
      const variants = product.productVariantList || [];
      const totalStock = variants.reduce((sum, v) => sum + (v.stock?.stockCount || 0), 0);

      console.log(`✅ ikas: Found product ${product.name} with stock ${totalStock}`);

      return {
        success: true,
        product: {
          id: product.id,
          title: product.name,
          description: product.description,
          totalStock,
          available: totalStock > 0,
          variants: variants.map(v => ({
            id: v.id,
            title: v.name,
            sku: v.sku,
            barcode: v.barcode,
            stock: v.stock?.stockCount || 0,
            available: (v.stock?.stockCount || 0) > 0,
            price: v.price?.sellPrice,
            currency: v.price?.currency || 'TRY'
          })),
          source: 'ikas'
        },
        message: totalStock > 0
          ? `${product.name} stokta mevcut (${totalStock} adet)`
          : `${product.name} şu anda stokta yok`
      };
    } catch (error) {
      console.error('❌ ikas getProductStock error:', error);
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

      const query = `
        query listCustomer($phone: String) {
          listCustomer(phone: $phone, pagination: { page: 1, limit: 5 }) {
            data {
              id
              firstName
              lastName
              email
              phone
              createdAt
            }
          }
        }
      `;

      const data = await this.graphqlQuery(businessId, query, { phone: cleanPhone });
      const customers = data.listCustomer?.data || [];

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
          name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
          email: customer.email,
          phone: customer.phone,
          createdAt: customer.createdAt
        }
      };
    } catch (error) {
      console.error('❌ ikas getCustomerByPhone error:', error);
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
      const query = `
        query listCustomer($email: String) {
          listCustomer(email: $email, pagination: { page: 1, limit: 5 }) {
            data {
              id
              firstName
              lastName
              email
              phone
              createdAt
            }
          }
        }
      `;

      const data = await this.graphqlQuery(businessId, query, { email: email.toLowerCase() });
      const customers = data.listCustomer?.data || [];

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
          name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
          email: customer.email,
          phone: customer.phone,
          createdAt: customer.createdAt
        }
      };
    } catch (error) {
      console.error('❌ ikas getCustomerByEmail error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

normalizeOrder(order) {
    // Order status mapping
    const orderStatusMap = {
      'WAITING_PAYMENT': 'Ödeme Bekleniyor',
      'WAITING_APPROVAL': 'Onay Bekleniyor',
      'APPROVED': 'Onaylandı',
      'PREPARING': 'Hazırlanıyor',
      'SHIPPED': 'Kargoya Verildi',
      'DELIVERED': 'Teslim Edildi',
      'CANCELLED': 'İptal Edildi',
      'REFUNDED': 'İade Edildi',
      'CREATED': 'Oluşturuldu'
    };

    const customerName = order.customer
      ? `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim()
      : (order.shippingAddress
        ? `${order.shippingAddress.firstName || ''} ${order.shippingAddress.lastName || ''}`.trim()
        : 'Bilinmiyor');

    // Get package info - ikas uses "orderPackages" with "trackingInfo" field
    const orderPackage = order.orderPackages?.[0];

    // trackingInfo is a string field containing tracking number/info
    const trackingInfo = orderPackage?.trackingInfo;

    // Debug log for troubleshooting
    console.log(`📦 ikas normalizeOrder: order.status=${order.status}, trackingInfo=${JSON.stringify(trackingInfo)}`);

    // Use order.status for effective status (orderPackages doesn't have status field)
    const effectiveStatus = order.status;
    const effectiveStatusText = orderStatusMap[order.status] || order.status;

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerName,
      customerEmail: order.customer?.email,
      customerPhone: order.customer?.phone || order.shippingAddress?.phone,
      status: effectiveStatus,
      statusText: effectiveStatusText,
      totalPrice: order.totalPrice,
      currency: order.currencyCode || 'TRY',
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: (order.orderLineItems || []).map(item => ({
        title: item.variant?.name || item.productName || 'Ürün',
        quantity: item.quantity,
        price: item.finalPrice
      })),
      shippingAddress: order.shippingAddress ? {
        address: `${order.shippingAddress.addressLine1 || ''} ${order.shippingAddress.addressLine2 || ''}`.trim(),
        postalCode: order.shippingAddress.postalCode
      } : null,
      tracking: trackingInfo ? {
        number: trackingInfo?.trackingNumber || trackingInfo,
        company: trackingInfo?.cargoCompany || 'Kargo'
      } : null,
      fulfillmentStatus: order.status === 'SHIPPED' || order.status === 'DELIVERED' ? order.status.toLowerCase() : 'unfulfilled',
      source: 'ikas'
    };
  }

  /**
   * Check if business has active ikas integration
   */
  static async hasIntegration(businessId) {
    try {
      const integration = await prisma.integration.findFirst({
        where: {
          businessId,
          type: 'IKAS',
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

export default IkasService;
