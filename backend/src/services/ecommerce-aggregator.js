/**
 * E-Commerce Aggregator Service
 *
 * Provides unified interface for e-commerce operations across platforms:
 * - Shopify
 * - WooCommerce
 * - ikas (Turkish e-commerce)
 * - Ideasoft (Turkish e-commerce)
 * - Ticimax (Turkish e-commerce)
 *
 * Each business can have ONE e-commerce platform connected.
 * This aggregator automatically routes requests to the correct platform.
 */

import prisma from '../prismaClient.js';
import shopifyService from './shopify.js';
import woocommerceService from './woocommerce.js';
import IkasService from './integrations/ecommerce/ikas.service.js';
import IdeasoftService from './integrations/ecommerce/ideasoft.service.js';
import TicimaxService from './integrations/ecommerce/ticimax.service.js';

// Supported platforms
const PLATFORMS = {
  SHOPIFY: 'SHOPIFY',
  WOOCOMMERCE: 'WOOCOMMERCE',
  IKAS: 'IKAS',
  IDEASOFT: 'IDEASOFT',
  TICIMAX: 'TICIMAX'
};

/**
 * Get the active e-commerce platform for a business
 * @param {number} businessId - Business ID
 * @returns {Promise<{platform: string, integration: Object}|null>}
 */
async function getActivePlatform(businessId) {
  const integrations = await prisma.integration.findMany({
    where: {
      businessId,
      type: { in: [PLATFORMS.SHOPIFY, PLATFORMS.WOOCOMMERCE, PLATFORMS.IKAS, PLATFORMS.IDEASOFT, PLATFORMS.TICIMAX] },
      isActive: true,
      connected: true
    }
  });

  if (integrations.length === 0) {
    return null;
  }

  // Return the first connected platform (business should only have one)
  const integration = integrations[0];
  return {
    platform: integration.type,
    integration
  };
}

/**
 * Get the appropriate service for a platform
 */
function getService(platform) {
  switch (platform) {
    case PLATFORMS.SHOPIFY:
      return shopifyService;
    case PLATFORMS.WOOCOMMERCE:
      return woocommerceService;
    case PLATFORMS.IKAS:
      return new IkasService();
    case PLATFORMS.IDEASOFT:
      return new IdeasoftService();
    case PLATFORMS.TICIMAX:
      return new TicimaxService();
    default:
      return null;
  }
}

// ============================================================================
// ORDER FUNCTIONS
// ============================================================================

/**
 * Get order by order number
 * @param {number} businessId - Business ID
 * @param {string} orderNumber - Order number (e.g., "1001" or "#1001")
 * @returns {Promise<Object>} Normalized order result
 */
export async function getOrderByNumber(businessId, orderNumber) {
  const platformInfo = await getActivePlatform(businessId);

  if (!platformInfo) {
    return {
      success: false,
      error: 'E-ticaret platformu bağlı değil',
      code: 'NO_PLATFORM'
    };
  }

  const service = getService(platformInfo.platform);
  console.log(`🔍 Aggregator: Routing order lookup to ${platformInfo.platform}`);

  const result = await service.getOrderByNumber(businessId, orderNumber);

  // Add platform info to result
  if (result.success && result.order) {
    result.order.platform = platformInfo.platform;
  }

  return result;
}

/**
 * Get order by customer phone
 * @param {number} businessId - Business ID
 * @param {string} phone - Customer phone number
 * @returns {Promise<Object>} Normalized order result
 */
export async function getOrderByPhone(businessId, phone) {
  const platformInfo = await getActivePlatform(businessId);

  if (!platformInfo) {
    return {
      success: false,
      error: 'E-ticaret platformu bağlı değil',
      code: 'NO_PLATFORM'
    };
  }

  const service = getService(platformInfo.platform);
  console.log(`🔍 Aggregator: Routing phone lookup to ${platformInfo.platform}`);

  // Turkish e-commerce platforms use different method names
  let result;
  if (platformInfo.platform === PLATFORMS.IKAS ||
      platformInfo.platform === PLATFORMS.IDEASOFT ||
      platformInfo.platform === PLATFORMS.TICIMAX) {
    result = await service.getOrdersByPhone(businessId, phone);
  } else {
    result = await service.getOrderByPhone(businessId, phone);
  }

  if (result.success && result.order) {
    result.order.platform = platformInfo.platform;
  }

  return result;
}

/**
 * Get order by customer email
 * @param {number} businessId - Business ID
 * @param {string} email - Customer email
 * @returns {Promise<Object>} Normalized order result
 */
export async function getOrderByEmail(businessId, email) {
  const platformInfo = await getActivePlatform(businessId);

  if (!platformInfo) {
    return {
      success: false,
      error: 'E-ticaret platformu bağlı değil',
      code: 'NO_PLATFORM'
    };
  }

  const service = getService(platformInfo.platform);
  console.log(`🔍 Aggregator: Routing email lookup to ${platformInfo.platform}`);

  // Turkish e-commerce platforms use different method names
  let result;
  if (platformInfo.platform === PLATFORMS.IKAS ||
      platformInfo.platform === PLATFORMS.IDEASOFT ||
      platformInfo.platform === PLATFORMS.TICIMAX) {
    result = await service.getOrdersByEmail(businessId, email);
  } else {
    result = await service.getOrderByEmail(businessId, email);
  }

  if (result.success && result.order) {
    result.order.platform = platformInfo.platform;
  }

  return result;
}

/**
 * Search orders by any criteria with PRIORITY SYSTEM
 *
 * DATA SOURCE PRIORITY:
 * 1. App Integrations (Shopify, WooCommerce, etc.) - Real-time, most accurate
 * 2. CustomerData (Excel/CSV) - Handled by customer_data_lookup tool separately
 * 3. Google Sheets - Future integration
 *
 * @param {number} businessId - Business ID
 * @param {Object} criteria - Search criteria
 * @param {string} [criteria.orderNumber] - Order number
 * @param {string} [criteria.phone] - Customer phone
 * @param {string} [criteria.email] - Customer email
 * @returns {Promise<Object>} Normalized order result
 */
export async function searchOrder(businessId, criteria) {
  const { orderNumber, phone, email } = criteria;

  console.log('🔍 Aggregator: Searching order in App Integrations...');

  // Try order number first (most precise)
  if (orderNumber) {
    const result = await getOrderByNumber(businessId, orderNumber);
    if (result.success) {
      console.log('✅ Aggregator: Found by order number in App Integration');
      return result;
    }
  }

  // Try phone
  if (phone) {
    const result = await getOrderByPhone(businessId, phone);
    if (result.success) {
      console.log('✅ Aggregator: Found by phone in App Integration');
      return result;
    }
  }

  // Try email
  if (email) {
    const result = await getOrderByEmail(businessId, email);
    if (result.success) {
      console.log('✅ Aggregator: Found by email in App Integration');
      return result;
    }
  }

  // Not found in App Integrations
  // The customer_data_lookup tool will handle CustomerData (Excel/CSV) separately
  console.log('⚠️ Aggregator: Not found in App Integrations');
  return {
    success: false,
    error: 'Sipariş bulunamadı. Lütfen sipariş numaranızı veya telefon numaranızı kontrol edin.',
    code: 'NOT_FOUND'
  };
}

// ============================================================================
// PRODUCT FUNCTIONS
// ============================================================================

/**
 * Search product by name
 * @param {number} businessId - Business ID
 * @param {string} productName - Product name to search
 * @returns {Promise<Object>} Normalized product result
 */
export async function getProductByName(businessId, productName) {
  const platformInfo = await getActivePlatform(businessId);

  if (!platformInfo) {
    return {
      success: false,
      error: 'E-ticaret platformu bağlı değil',
      code: 'NO_PLATFORM'
    };
  }

  const service = getService(platformInfo.platform);
  console.log(`🔍 Aggregator: Routing product search to ${platformInfo.platform}`);

  let result;

  if (platformInfo.platform === PLATFORMS.SHOPIFY) {
    result = await service.getProductByTitle(businessId, productName);
  } else if (platformInfo.platform === PLATFORMS.IKAS ||
             platformInfo.platform === PLATFORMS.IDEASOFT ||
             platformInfo.platform === PLATFORMS.TICIMAX) {
    // Turkish e-commerce platforms use getProductStock
    result = await service.getProductStock(businessId, productName);
  } else {
    result = await service.getProductByName(businessId, productName);
  }

  if (result.success && result.product) {
    result.product.platform = platformInfo.platform;
  }

  return result;
}

/**
 * Get product stock by product ID
 * @param {number} businessId - Business ID
 * @param {string} productId - Product ID
 * @returns {Promise<Object>} Stock result
 */
export async function getProductStock(businessId, productId) {
  const platformInfo = await getActivePlatform(businessId);

  if (!platformInfo) {
    return {
      success: false,
      error: 'E-ticaret platformu bağlı değil',
      code: 'NO_PLATFORM'
    };
  }

  const service = getService(platformInfo.platform);
  console.log(`🔍 Aggregator: Routing stock check to ${platformInfo.platform}`);

  const result = await service.getProductStock(businessId, productId);

  if (result.success && result.product) {
    result.product.platform = platformInfo.platform;
  }

  return result;
}

/**
 * Search product and get stock in one call
 * Convenience method for the AI tool
 * @param {number} businessId - Business ID
 * @param {string} productName - Product name to search
 * @returns {Promise<Object>} Product with stock info
 */
export async function searchProductStock(businessId, productName) {
  // First find the product
  const searchResult = await getProductByName(businessId, productName);

  if (!searchResult.success) {
    return searchResult;
  }

  // Product already includes stock info from normalized response
  return searchResult;
}

// ============================================================================
// TRACKING FUNCTIONS
// ============================================================================

/**
 * Get tracking info for an order
 * @param {number} businessId - Business ID
 * @param {string} orderNumber - Order number
 * @returns {Promise<Object>} Tracking result
 */
export async function getOrderTracking(businessId, orderNumber) {
  // First get the order
  const orderResult = await getOrderByNumber(businessId, orderNumber);

  if (!orderResult.success) {
    return orderResult;
  }

  const order = orderResult.order;

  // Check if order has tracking info
  if (order.tracking) {
    return {
      success: true,
      hasTracking: true,
      orderNumber: order.orderNumber,
      status: order.statusText,
      tracking: order.tracking,
      platform: order.platform
    };
  }

  // Order found but no tracking yet
  return {
    success: true,
    hasTracking: false,
    orderNumber: order.orderNumber,
    status: order.statusText,
    fulfillmentStatus: order.fulfillmentStatusText,
    message: 'Sipariş henüz kargoya verilmedi',
    platform: order.platform
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if business has any e-commerce platform connected
 * @param {number} businessId - Business ID
 * @returns {Promise<boolean>}
 */
export async function hasEcommercePlatform(businessId) {
  const platformInfo = await getActivePlatform(businessId);
  return platformInfo !== null;
}

/**
 * Get connected platform info
 * @param {number} businessId - Business ID
 * @returns {Promise<Object|null>}
 */
export async function getPlatformInfo(businessId) {
  const platformInfo = await getActivePlatform(businessId);

  if (!platformInfo) {
    return null;
  }

  return {
    platform: platformInfo.platform,
    connectedAt: platformInfo.integration.createdAt
  };
}

/**
 * Test platform connection
 * @param {string} platform - Platform type (SHOPIFY or WOOCOMMERCE)
 * @param {Object} credentials - Platform credentials
 * @returns {Promise<Object>} Test result
 */
export async function testConnection(platform, credentials) {
  const service = getService(platform);

  if (!service) {
    return {
      success: false,
      error: `Desteklenmeyen platform: ${platform}`
    };
  }

  return await service.testConnection(credentials);
}

// ============================================================================
// MESSAGE FORMATTING
// ============================================================================

/**
 * Format order status for AI response
 * @param {Object} order - Normalized order object
 * @param {string} language - Language code (TR/EN)
 * @returns {string} Formatted message
 */
export function formatOrderStatus(order, language = 'TR') {
  if (language === 'TR') {
    let message = `Sipariş ${order.orderNumber}: ${order.statusText}. `;

    // Add items summary
    if (order.items?.length > 0) {
      const itemList = order.items.map(i => `${i.quantity}x ${i.title}`).join(', ');
      message += `Ürünler: ${itemList}. `;
    }

    // Add tracking if available
    if (order.tracking) {
      message += `Kargo: ${order.tracking.company}. `;
      if (order.tracking.number) {
        message += `Takip numarası: ${order.tracking.number}. `;
      }
    } else if (order.fulfillmentStatus === 'unfulfilled') {
      message += `Siparişiniz hazırlanıyor. `;
    }

    // Add total
    message += `Toplam: ${order.totalPrice} ${order.currency}.`;

    return message;
  }

  // English
  let message = `Order ${order.orderNumber}: ${order.statusText}. `;

  if (order.items?.length > 0) {
    const itemList = order.items.map(i => `${i.quantity}x ${i.title}`).join(', ');
    message += `Items: ${itemList}. `;
  }

  if (order.tracking) {
    message += `Carrier: ${order.tracking.company}. `;
    if (order.tracking.number) {
      message += `Tracking: ${order.tracking.number}. `;
    }
  } else if (order.fulfillmentStatus === 'unfulfilled') {
    message += `Your order is being prepared. `;
  }

  message += `Total: ${order.totalPrice} ${order.currency}.`;

  return message;
}

/**
 * Format product stock for AI response
 * @param {Object} product - Normalized product object
 * @param {string} language - Language code (TR/EN)
 * @returns {string} Formatted message
 */
export function formatProductStock(product, language = 'TR') {
  // STOCK DISCLOSURE POLICY: Never reveal raw stock quantities.
  // Only show availability status (in stock / limited / out of stock)
  // and available variant options (without counts).

  if (language === 'TR') {
    if (product.available) {
      let message = `${product.title} stokta mevcut.`;

      if (product.variants?.length > 1) {
        const availableVariants = product.variants.filter(v => v.available);
        if (availableVariants.length > 0) {
          message += ` Mevcut seçenekler: ${availableVariants.map(v => v.title).join(', ')}.`;
        }
      }

      return message;
    }

    return `Üzgünüm, ${product.title} şu anda stokta yok.`;
  }

  // English
  if (product.available) {
    let message = `${product.title} is in stock.`;

    if (product.variants?.length > 1) {
      const availableVariants = product.variants.filter(v => v.available);
      if (availableVariants.length > 0) {
        message += ` Available options: ${availableVariants.map(v => v.title).join(', ')}.`;
      }
    }

    return message;
  }

  return `Sorry, ${product.title} is currently out of stock.`;
}

export default {
  // Order functions
  getOrderByNumber,
  getOrderByPhone,
  getOrderByEmail,
  searchOrder,

  // Product functions
  getProductByName,
  getProductStock,
  searchProductStock,

  // Tracking functions
  getOrderTracking,

  // Utility functions
  hasEcommercePlatform,
  getPlatformInfo,
  testConnection,

  // Formatting
  formatOrderStatus,
  formatProductStock,

  // Constants
  PLATFORMS
};
