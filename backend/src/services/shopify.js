// ============================================================================
// SHOPIFY INTEGRATION SERVICE
// ============================================================================
// FILE: backend/src/services/shopify.js
//
// Comprehensive Shopify API integration for e-commerce operations
// Supports order tracking, inventory management, and customer data
// ============================================================================

import axios from 'axios';
import prisma from '../prismaClient.js';

// Shopify API version
const API_VERSION = '2024-01';

/**
 * Get Shopify credentials from database
 */
async function getCredentials(businessId) {
  const integration = await prisma.integration.findFirst({
    where: {
      businessId,
      type: 'SHOPIFY',
      isActive: true
    }
  });

  if (!integration) {
    throw new Error('Shopify integration not configured');
  }

  const { shopUrl, accessToken } = integration.credentials;

  if (!shopUrl || !accessToken) {
    throw new Error('Invalid Shopify credentials');
  }

  return { shopUrl, accessToken };
}

/**
 * Build Shopify API URL
 */
function buildApiUrl(shopUrl, endpoint) {
  // Clean the shop URL
  let cleanUrl = shopUrl.replace('https://', '').replace('http://', '');
  cleanUrl = cleanUrl.replace('.myshopify.com', '').replace(/\/$/, '');
  return `https://${cleanUrl}.myshopify.com/admin/api/${API_VERSION}/${endpoint}`;
}

/**
 * Make authenticated request to Shopify API
 */
async function makeRequest(businessId, endpoint, method = 'GET', data = null, params = null) {
  const { shopUrl, accessToken } = await getCredentials(businessId);

  const config = {
    method,
    url: buildApiUrl(shopUrl, endpoint),
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    }
  };

  if (params) config.params = params;
  if (data) config.data = data;

  try {
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error('❌ Shopify API error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Check if business has active Shopify integration
 */
export async function hasIntegration(businessId) {
  try {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId,
        type: 'SHOPIFY',
        isActive: true,
        connected: true
      }
    });
    return !!integration;
  } catch (error) {
    return false;
  }
}

/**
 * Test connection to Shopify API
 */
export async function testConnection(credentials) {
  try {
    const { shopUrl, accessToken } = credentials;

    if (!shopUrl || !accessToken) {
      throw new Error('Shop URL and Access Token are required');
    }

    // Clean shop URL
    let cleanUrl = shopUrl.replace('https://', '').replace('http://', '');
    cleanUrl = cleanUrl.replace('.myshopify.com', '').replace(/\/$/, '');

    const url = `https://${cleanUrl}.myshopify.com/admin/api/${API_VERSION}/shop.json`;

    const response = await axios.get(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    return {
      success: true,
      shop: {
        name: response.data.shop.name,
        domain: response.data.shop.domain,
        email: response.data.shop.email,
        currency: response.data.shop.currency
      },
      message: `Successfully connected to ${response.data.shop.name}`
    };
  } catch (error) {
    console.error('❌ Shopify test connection error:', error.response?.data || error.message);

    if (error.response?.status === 401) {
      throw new Error('Invalid Access Token. Please check your credentials.');
    } else if (error.response?.status === 404) {
      throw new Error('Store not found. Please check your Shop URL.');
    } else {
      throw new Error('Connection failed: ' + (error.response?.data?.errors || error.message));
    }
  }
}

// ============================================================================
// ORDER FUNCTIONS
// ============================================================================

/**
 * Get orders with optional filters
 */
export async function getOrders(businessId, filters = {}) {
  try {
    const params = {
      status: 'any',
      limit: filters.limit || 50,
      ...filters
    };

    const data = await makeRequest(businessId, 'orders.json', 'GET', null, params);

    return {
      success: true,
      orders: (data.orders || []).map(normalizeOrder),
      count: data.orders?.length || 0
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      orders: []
    };
  }
}

/**
 * Get order by order number (e.g., #1001)
 */
export async function getOrderByNumber(businessId, orderNumber) {
  try {
    // Clean order number - remove # if present
    const cleanNumber = orderNumber.replace('#', '').trim();

    console.log(`🔍 Shopify: Fetching order by number: ${cleanNumber}`);

    const data = await makeRequest(businessId, 'orders.json', 'GET', null, {
      name: cleanNumber,
      status: 'any'
    });

    const orders = data.orders || [];

    if (orders.length === 0) {
      // Try with # prefix
      const dataWithHash = await makeRequest(businessId, 'orders.json', 'GET', null, {
        name: `#${cleanNumber}`,
        status: 'any'
      });

      if (dataWithHash.orders?.length > 0) {
        return {
          success: true,
          order: normalizeOrder(dataWithHash.orders[0])
        };
      }

      return {
        success: false,
        message: `Sipariş #${cleanNumber} bulunamadı`
      };
    }

    console.log(`✅ Shopify: Order found: ${orders[0].name}`);

    return {
      success: true,
      order: normalizeOrder(orders[0])
    };
  } catch (error) {
    console.error('❌ Shopify getOrderByNumber error:', error);
    return {
      success: false,
      error: error.message,
      message: 'Sipariş bilgisi alınamadı'
    };
  }
}

/**
 * Get order by customer phone
 */
export async function getOrderByPhone(businessId, phone) {
  try {
    // Clean phone number
    const cleanPhone = phone.replace(/\D/g, '');

    console.log(`🔍 Shopify: Searching orders by phone: ${cleanPhone}`);

    // Search in shipping address phone and billing address phone
    const data = await makeRequest(businessId, 'orders.json', 'GET', null, {
      status: 'any',
      limit: 10
    });

    const orders = data.orders || [];

    // Filter orders by phone (Shopify doesn't have direct phone search)
    const matchingOrders = orders.filter(order => {
      const shippingPhone = (order.shipping_address?.phone || '').replace(/\D/g, '');
      const billingPhone = (order.billing_address?.phone || '').replace(/\D/g, '');
      const customerPhone = (order.customer?.phone || '').replace(/\D/g, '');

      return shippingPhone.includes(cleanPhone) ||
             billingPhone.includes(cleanPhone) ||
             customerPhone.includes(cleanPhone) ||
             cleanPhone.includes(shippingPhone) ||
             cleanPhone.includes(billingPhone) ||
             cleanPhone.includes(customerPhone);
    });

    if (matchingOrders.length === 0) {
      return {
        success: false,
        message: 'Bu telefon numarasına ait sipariş bulunamadı'
      };
    }

    // Return the most recent order
    const latestOrder = matchingOrders[0];

    return {
      success: true,
      order: normalizeOrder(latestOrder),
      totalOrders: matchingOrders.length
    };
  } catch (error) {
    console.error('❌ Shopify getOrderByPhone error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get order by customer email
 */
export async function getOrderByEmail(businessId, email) {
  try {
    console.log(`🔍 Shopify: Searching orders by email: ${email}`);

    const data = await makeRequest(businessId, 'orders.json', 'GET', null, {
      email: email.toLowerCase().trim(),
      status: 'any',
      limit: 10
    });

    const orders = data.orders || [];

    if (orders.length === 0) {
      return {
        success: false,
        message: 'Bu email adresine ait sipariş bulunamadı'
      };
    }

    return {
      success: true,
      order: normalizeOrder(orders[0]),
      totalOrders: orders.length
    };
  } catch (error) {
    console.error('❌ Shopify getOrderByEmail error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get fulfillment/shipping information for an order
 */
export async function getOrderFulfillment(businessId, orderId) {
  try {
    const data = await makeRequest(businessId, `orders/${orderId}/fulfillments.json`);

    const fulfillments = data.fulfillments || [];

    if (fulfillments.length === 0) {
      return {
        success: true,
        hasFulfillment: false,
        message: 'Sipariş henüz kargoya verilmedi'
      };
    }

    const latestFulfillment = fulfillments[fulfillments.length - 1];

    return {
      success: true,
      hasFulfillment: true,
      fulfillment: {
        id: latestFulfillment.id,
        status: latestFulfillment.status,
        trackingCompany: latestFulfillment.tracking_company,
        trackingNumber: latestFulfillment.tracking_number,
        trackingUrl: latestFulfillment.tracking_url,
        createdAt: latestFulfillment.created_at
      }
    };
  } catch (error) {
    console.error('❌ Shopify getOrderFulfillment error:', error);
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
 * Get products with optional filters
 */
export async function getProducts(businessId, filters = {}) {
  try {
    const params = {
      limit: filters.limit || 50,
      ...filters
    };

    const data = await makeRequest(businessId, 'products.json', 'GET', null, params);

    return {
      success: true,
      products: (data.products || []).map(normalizeProduct),
      count: data.products?.length || 0
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      products: []
    };
  }
}

/**
 * Get product by title (search)
 */
export async function getProductByTitle(businessId, title) {
  try {
    console.log(`🔍 Shopify: Searching product by title: ${title}`);

    const data = await makeRequest(businessId, 'products.json', 'GET', null, {
      title: title
    });

    let products = data.products || [];

    // If exact match not found, try partial match
    if (products.length === 0) {
      const allProducts = await makeRequest(businessId, 'products.json', 'GET', null, {
        limit: 100
      });

      const searchTerm = title.toLowerCase();
      products = (allProducts.products || []).filter(p =>
        p.title.toLowerCase().includes(searchTerm)
      );
    }

    if (products.length === 0) {
      return {
        success: false,
        message: `"${title}" adlı ürün bulunamadı`
      };
    }

    return {
      success: true,
      product: normalizeProduct(products[0]),
      totalMatches: products.length
    };
  } catch (error) {
    console.error('❌ Shopify getProductByTitle error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get product stock by product ID
 */
export async function getProductStock(businessId, productId) {
  try {
    console.log(`🔍 Shopify: Checking stock for product: ${productId}`);

    const data = await makeRequest(businessId, `products/${productId}.json`);
    const product = data.product;

    if (!product) {
      return {
        success: false,
        message: 'Ürün bulunamadı'
      };
    }

    const variants = product.variants || [];
    const totalStock = variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0);

    return {
      success: true,
      product: {
        id: product.id,
        title: product.title,
        totalStock,
        available: totalStock > 0,
        variants: variants.map(v => ({
          id: v.id,
          title: v.title,
          sku: v.sku,
          stock: v.inventory_quantity || 0,
          available: (v.inventory_quantity || 0) > 0,
          price: v.price
        }))
      },
      message: totalStock > 0
        ? `${product.title} stokta mevcut (${totalStock} adet)`
        : `${product.title} şu anda stokta yok`
    };
  } catch (error) {
    console.error('❌ Shopify getProductStock error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get inventory levels for a specific location
 */
export async function getInventoryLevel(businessId, inventoryItemId, locationId = null) {
  try {
    let endpoint = 'inventory_levels.json';
    const params = { inventory_item_ids: inventoryItemId };

    if (locationId) {
      params.location_ids = locationId;
    }

    const data = await makeRequest(businessId, endpoint, 'GET', null, params);

    return {
      success: true,
      inventoryLevels: data.inventory_levels || []
    };
  } catch (error) {
    console.error('❌ Shopify getInventoryLevel error:', error);
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
function normalizeOrder(order) {
  // Map Shopify status to Turkish
  const statusMap = {
    'pending': 'Beklemede',
    'authorized': 'Ödeme Onaylandı',
    'paid': 'Ödendi',
    'partially_paid': 'Kısmi Ödeme',
    'refunded': 'İade Edildi',
    'voided': 'İptal Edildi',
    'partially_refunded': 'Kısmi İade'
  };

  const fulfillmentStatusMap = {
    'fulfilled': 'Kargoya Verildi',
    'partial': 'Kısmen Gönderildi',
    'unfulfilled': 'Hazırlanıyor',
    'restocked': 'İade Edildi',
    null: 'Hazırlanıyor'
  };

  const customerName = order.customer
    ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim()
    : (order.shipping_address
      ? `${order.shipping_address.first_name || ''} ${order.shipping_address.last_name || ''}`.trim()
      : 'Bilinmiyor');

  const tracking = order.fulfillments?.[0] || {};

  return {
    id: order.id.toString(),
    orderNumber: order.name,
    customerName,
    customerEmail: order.email || order.customer?.email,
    customerPhone: order.shipping_address?.phone || order.billing_address?.phone || order.customer?.phone,
    status: order.financial_status,
    statusText: statusMap[order.financial_status] || order.financial_status,
    fulfillmentStatus: order.fulfillment_status,
    fulfillmentStatusText: fulfillmentStatusMap[order.fulfillment_status] || 'Bilinmiyor',
    totalPrice: order.total_price,
    currency: order.currency || 'TRY',
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: (order.line_items || []).map(item => ({
      title: item.title,
      variantTitle: item.variant_title,
      quantity: item.quantity,
      price: item.price
    })),
    shippingAddress: order.shipping_address ? {
      address: `${order.shipping_address.address1 || ''} ${order.shipping_address.address2 || ''}`.trim(),
      city: order.shipping_address.city,
      province: order.shipping_address.province,
      country: order.shipping_address.country,
      zip: order.shipping_address.zip
    } : null,
    tracking: tracking.tracking_number ? {
      company: tracking.tracking_company || 'Kargo',
      number: tracking.tracking_number,
      url: tracking.tracking_url
    } : null,
    source: 'shopify'
  };
}

/**
 * Normalize product to standard format
 */
function normalizeProduct(product) {
  const variants = product.variants || [];
  const totalStock = variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0);

  return {
    id: product.id.toString(),
    title: product.title,
    description: product.body_html?.replace(/<[^>]*>/g, '') || '',
    vendor: product.vendor,
    productType: product.product_type,
    totalStock,
    available: totalStock > 0,
    variants: variants.map(v => ({
      id: v.id.toString(),
      title: v.title,
      sku: v.sku,
      stock: v.inventory_quantity || 0,
      available: (v.inventory_quantity || 0) > 0,
      price: v.price
    })),
    images: (product.images || []).map(img => img.src),
    createdAt: product.created_at,
    source: 'shopify'
  };
}

export default {
  hasIntegration,
  testConnection,
  getOrders,
  getOrderByNumber,
  getOrderByPhone,
  getOrderByEmail,
  getOrderFulfillment,
  getProducts,
  getProductByTitle,
  getProductStock,
  getInventoryLevel
};
