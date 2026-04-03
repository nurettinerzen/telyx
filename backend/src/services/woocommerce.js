// ============================================================================
// WOOCOMMERCE INTEGRATION SERVICE
// ============================================================================
// FILE: backend/src/services/woocommerce.js
//
// Comprehensive WooCommerce REST API integration for e-commerce operations
// Supports order tracking, inventory management, and customer data
// ============================================================================

import axios from 'axios';
import prisma from '../prismaClient.js';

// WooCommerce API version
const API_VERSION = 'wc/v3';

/**
 * Get WooCommerce credentials from database
 */
async function getCredentials(businessId) {
  const integration = await prisma.integration.findFirst({
    where: {
      businessId,
      type: 'WOOCOMMERCE',
      isActive: true
    }
  });

  if (!integration) {
    throw new Error('WooCommerce integration not configured');
  }

  const { siteUrl, consumerKey, consumerSecret } = integration.credentials;

  if (!siteUrl || !consumerKey || !consumerSecret) {
    throw new Error('Invalid WooCommerce credentials');
  }

  return { siteUrl, consumerKey, consumerSecret };
}

/**
 * Build WooCommerce API URL
 */
function buildApiUrl(siteUrl, endpoint) {
  // Clean the site URL
  let cleanUrl = siteUrl.replace(/\/+$/, ''); // Remove trailing slashes
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = 'https://' + cleanUrl;
  }
  return `${cleanUrl}/wp-json/${API_VERSION}/${endpoint}`;
}

/**
 * Create Basic Auth header
 */
function createAuthHeader(consumerKey, consumerSecret) {
  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  return `Basic ${credentials}`;
}

/**
 * Make authenticated request to WooCommerce API
 */
async function makeRequest(businessId, endpoint, method = 'GET', data = null, params = null) {
  const { siteUrl, consumerKey, consumerSecret } = await getCredentials(businessId);

  const config = {
    method,
    url: buildApiUrl(siteUrl, endpoint),
    headers: {
      'Authorization': createAuthHeader(consumerKey, consumerSecret),
      'Content-Type': 'application/json'
    }
  };

  if (params) config.params = params;
  if (data) config.data = data;

  try {
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error('❌ WooCommerce API error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Check if business has active WooCommerce integration
 */
export async function hasIntegration(businessId) {
  try {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId,
        type: 'WOOCOMMERCE',
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
 * Test connection to WooCommerce API
 */
export async function testConnection(credentials) {
  try {
    const { siteUrl, consumerKey, consumerSecret } = credentials;

    if (!siteUrl || !consumerKey || !consumerSecret) {
      throw new Error('Site URL, Consumer Key, and Consumer Secret are required');
    }

    const url = buildApiUrl(siteUrl, 'system_status');

    const response = await axios.get(url, {
      headers: {
        'Authorization': createAuthHeader(consumerKey, consumerSecret),
        'Content-Type': 'application/json'
      }
    });

    // Get store info
    const settingsUrl = buildApiUrl(siteUrl, 'settings/general');
    let storeName = 'WooCommerce Store';

    try {
      const settingsResponse = await axios.get(settingsUrl, {
        headers: {
          'Authorization': createAuthHeader(consumerKey, consumerSecret),
          'Content-Type': 'application/json'
        }
      });

      const storeNameSetting = settingsResponse.data.find(s => s.id === 'woocommerce_store_address');
      if (storeNameSetting) {
        storeName = storeNameSetting.value || storeName;
      }
    } catch (e) {
      // Settings might require higher permissions, use system status
      storeName = response.data?.environment?.site_url || siteUrl;
    }

    return {
      success: true,
      store: {
        name: storeName,
        url: siteUrl,
        version: response.data?.environment?.version || 'Unknown',
        wcVersion: response.data?.environment?.wc_version || 'Unknown'
      },
      message: `Successfully connected to ${storeName}`
    };
  } catch (error) {
    console.error('❌ WooCommerce test connection error:', error.response?.data || error.message);

    if (error.response?.status === 401) {
      throw new Error('Invalid Consumer Key or Consumer Secret');
    } else if (error.response?.status === 404) {
      throw new Error('WooCommerce REST API not found. Make sure the site has WooCommerce installed.');
    } else {
      throw new Error('Connection failed: ' + (error.response?.data?.message || error.message));
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
      per_page: filters.limit || 50,
      status: filters.status || 'any',
      orderby: 'date',
      order: 'desc',
      ...filters
    };

    const data = await makeRequest(businessId, 'orders', 'GET', null, params);

    return {
      success: true,
      orders: (data || []).map(normalizeOrder),
      count: data?.length || 0
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
 * Get order by ID
 */
export async function getOrderById(businessId, orderId) {
  try {
    console.log(`🔍 WooCommerce: Fetching order by ID: ${orderId}`);

    const data = await makeRequest(businessId, `orders/${orderId}`);

    if (!data) {
      return {
        success: false,
        message: `Sipariş #${orderId} bulunamadı`
      };
    }

    console.log(`✅ WooCommerce: Order found: #${data.id}`);

    return {
      success: true,
      order: normalizeOrder(data)
    };
  } catch (error) {
    if (error.response?.status === 404) {
      return {
        success: false,
        message: `Sipariş #${orderId} bulunamadı`
      };
    }
    console.error('❌ WooCommerce getOrderById error:', error);
    return {
      success: false,
      error: error.message,
      message: 'Sipariş bilgisi alınamadı'
    };
  }
}

/**
 * Get order by order number
 * WooCommerce uses ID as order number by default
 */
export async function getOrderByNumber(businessId, orderNumber) {
  try {
    // Clean order number - remove # if present
    const cleanNumber = orderNumber.replace('#', '').trim();

    console.log(`🔍 WooCommerce: Fetching order by number: ${cleanNumber}`);

    // Try direct ID lookup first
    try {
      const directResult = await getOrderById(businessId, cleanNumber);
      if (directResult.success) {
        return directResult;
      }
    } catch (e) {
      // Continue with search
    }

    // Search orders
    const data = await makeRequest(businessId, 'orders', 'GET', null, {
      search: cleanNumber,
      per_page: 10
    });

    const orders = data || [];

    // Find exact match
    const exactMatch = orders.find(o =>
      o.id.toString() === cleanNumber ||
      o.number === cleanNumber ||
      (o.meta_data?.find(m => m.key === '_order_number')?.value === cleanNumber)
    );

    if (exactMatch) {
      return {
        success: true,
        order: normalizeOrder(exactMatch)
      };
    }

    if (orders.length > 0) {
      return {
        success: true,
        order: normalizeOrder(orders[0])
      };
    }

    return {
      success: false,
      message: `Sipariş #${cleanNumber} bulunamadı`
    };
  } catch (error) {
    console.error('❌ WooCommerce getOrderByNumber error:', error);
    return {
      success: false,
      error: error.message,
      message: 'Sipariş bilgisi alınamadı'
    };
  }
}

/**
 * Search orders by email, name, or phone
 */
export async function searchOrders(businessId, query) {
  try {
    console.log(`🔍 WooCommerce: Searching orders: ${query}`);

    const data = await makeRequest(businessId, 'orders', 'GET', null, {
      search: query,
      per_page: 10
    });

    const orders = data || [];

    if (orders.length === 0) {
      return {
        success: false,
        message: 'Sipariş bulunamadı'
      };
    }

    return {
      success: true,
      orders: orders.map(normalizeOrder),
      count: orders.length
    };
  } catch (error) {
    console.error('❌ WooCommerce searchOrders error:', error);
    return {
      success: false,
      error: error.message
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

    console.log(`🔍 WooCommerce: Searching orders by phone: ${cleanPhone}`);

    // WooCommerce doesn't have direct phone search, get recent orders and filter
    const data = await makeRequest(businessId, 'orders', 'GET', null, {
      per_page: 50,
      orderby: 'date',
      order: 'desc'
    });

    const orders = data || [];

    // Filter orders by phone
    const matchingOrders = orders.filter(order => {
      const billingPhone = (order.billing?.phone || '').replace(/\D/g, '');
      const shippingPhone = (order.shipping?.phone || '').replace(/\D/g, '');

      return billingPhone.includes(cleanPhone) ||
             shippingPhone.includes(cleanPhone) ||
             cleanPhone.includes(billingPhone) ||
             cleanPhone.includes(shippingPhone);
    });

    if (matchingOrders.length === 0) {
      return {
        success: false,
        message: 'Bu telefon numarasına ait sipariş bulunamadı'
      };
    }

    // Return the most recent order
    return {
      success: true,
      order: normalizeOrder(matchingOrders[0]),
      totalOrders: matchingOrders.length
    };
  } catch (error) {
    console.error('❌ WooCommerce getOrderByPhone error:', error);
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
    console.log(`🔍 WooCommerce: Searching orders by email: ${email}`);

    // Search by email
    const data = await makeRequest(businessId, 'orders', 'GET', null, {
      search: email.toLowerCase().trim(),
      per_page: 10
    });

    const orders = data || [];

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
    console.error('❌ WooCommerce getOrderByEmail error:', error);
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
      per_page: filters.limit || 50,
      ...filters
    };

    const data = await makeRequest(businessId, 'products', 'GET', null, params);

    return {
      success: true,
      products: (data || []).map(normalizeProduct),
      count: data?.length || 0
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
 * Get product by name (search)
 */
export async function getProductByName(businessId, name) {
  try {
    console.log(`🔍 WooCommerce: Searching product by name: ${name}`);

    const data = await makeRequest(businessId, 'products', 'GET', null, {
      search: name,
      per_page: 10
    });

    const products = data || [];

    if (products.length === 0) {
      return {
        success: false,
        message: `"${name}" adlı ürün bulunamadı`
      };
    }

    return {
      success: true,
      product: normalizeProduct(products[0]),
      totalMatches: products.length
    };
  } catch (error) {
    console.error('❌ WooCommerce getProductByName error:', error);
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
    console.log(`🔍 WooCommerce: Checking stock for product: ${productId}`);

    const data = await makeRequest(businessId, `products/${productId}`);

    if (!data) {
      return {
        success: false,
        message: 'Ürün bulunamadı'
      };
    }

    const product = normalizeProduct(data);

    return {
      success: true,
      product,
      message: product.available
        ? `${product.title} stokta mevcut (${product.totalStock} adet)`
        : `${product.title} şu anda stokta yok`
    };
  } catch (error) {
    console.error('❌ WooCommerce getProductStock error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get product variations
 */
export async function getProductVariations(businessId, productId) {
  try {
    console.log(`🔍 WooCommerce: Getting variations for product: ${productId}`);

    const data = await makeRequest(businessId, `products/${productId}/variations`, 'GET', null, {
      per_page: 100
    });

    const variations = data || [];

    return {
      success: true,
      variations: variations.map(v => ({
        id: v.id.toString(),
        sku: v.sku,
        price: v.price,
        stock: v.stock_quantity || 0,
        available: v.stock_status === 'instock',
        attributes: v.attributes?.map(a => `${a.name}: ${a.option}`).join(', ')
      })),
      count: variations.length
    };
  } catch (error) {
    console.error('❌ WooCommerce getProductVariations error:', error);
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
  // Map WooCommerce status to Turkish
  const statusMap = {
    'pending': 'Ödeme Bekleniyor',
    'processing': 'İşleniyor',
    'on-hold': 'Beklemede',
    'completed': 'Tamamlandı',
    'cancelled': 'İptal Edildi',
    'refunded': 'İade Edildi',
    'failed': 'Başarısız'
  };

  // Get tracking from meta data (commonly used by shipping plugins)
  let tracking = null;
  const trackingNumber = order.meta_data?.find(m =>
    m.key === '_tracking_number' ||
    m.key === 'tracking_number' ||
    m.key === '_wc_shipment_tracking_items'
  );

  if (trackingNumber?.value) {
    const trackingData = typeof trackingNumber.value === 'string'
      ? trackingNumber.value
      : trackingNumber.value[0];

    if (typeof trackingData === 'object') {
      tracking = {
        company: trackingData.tracking_provider || 'Kargo',
        number: trackingData.tracking_number,
        url: trackingData.tracking_link
      };
    } else {
      tracking = {
        company: 'Kargo',
        number: trackingData,
        url: null
      };
    }
  }

  const customerName = order.billing?.first_name
    ? `${order.billing.first_name} ${order.billing.last_name}`.trim()
    : 'Bilinmiyor';

  return {
    id: order.id.toString(),
    orderNumber: `#${order.number || order.id}`,
    customerName,
    customerEmail: order.billing?.email,
    customerPhone: order.billing?.phone || order.shipping?.phone,
    status: order.status,
    statusText: statusMap[order.status] || order.status,
    fulfillmentStatus: order.status === 'completed' ? 'fulfilled' : 'unfulfilled',
    fulfillmentStatusText: order.status === 'completed' ? 'Teslim Edildi' : 'Hazırlanıyor',
    totalPrice: order.total,
    currency: order.currency || 'TRY',
    createdAt: order.date_created,
    updatedAt: order.date_modified,
    items: (order.line_items || []).map(item => ({
      title: item.name,
      variantTitle: item.variation_id ? `#${item.variation_id}` : null,
      quantity: item.quantity,
      price: item.price
    })),
    shippingAddress: order.shipping ? {
      address: `${order.shipping.address_1 || ''} ${order.shipping.address_2 || ''}`.trim(),
      city: order.shipping.city,
      province: order.shipping.state,
      country: order.shipping.country,
      zip: order.shipping.postcode
    } : null,
    tracking,
    source: 'woocommerce'
  };
}

/**
 * Normalize product to standard format
 */
function normalizeProduct(product) {
  const totalStock = product.stock_quantity || 0;
  const isAvailable = product.stock_status === 'instock';

  return {
    id: product.id.toString(),
    title: product.name,
    description: product.short_description?.replace(/<[^>]*>/g, '') || product.description?.replace(/<[^>]*>/g, '') || '',
    sku: product.sku,
    price: product.price,
    regularPrice: product.regular_price,
    salePrice: product.sale_price,
    totalStock,
    available: isAvailable,
    stockStatus: product.stock_status,
    variants: (product.variations || []).length > 0
      ? []  // Variations need separate API call
      : [{
          id: product.id.toString(),
          title: 'Default',
          sku: product.sku,
          stock: totalStock,
          available: isAvailable,
          price: product.price
        }],
    images: (product.images || []).map(img => img.src),
    categories: (product.categories || []).map(c => c.name),
    createdAt: product.date_created,
    source: 'woocommerce'
  };
}

export default {
  hasIntegration,
  testConnection,
  getOrders,
  getOrderById,
  getOrderByNumber,
  searchOrders,
  getOrderByPhone,
  getOrderByEmail,
  getProducts,
  getProductByName,
  getProductStock,
  getProductVariations
};
