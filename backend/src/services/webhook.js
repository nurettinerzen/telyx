// ============================================================================
// WEBHOOK INTEGRATION SERVICE
// ============================================================================
// FILE: backend/src/services/webhook.js
//
// Handles incoming webhooks from Zapier, Make.com, and custom integrations
// Processes orders, inventory updates, and shipment notifications
// ============================================================================

import crypto from 'crypto';
import prisma from '../prismaClient.js';
import { safeCompareStrings } from '../security/constantTime.js';

/**
 * Generate a unique webhook secret
 */
export function generateWebhookSecret() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create or get webhook configuration for a business
 */
export async function createWebhookConfig(businessId) {
  try {
    // Check if config already exists
    let config = await prisma.webhookConfig.findUnique({
      where: { businessId }
    });

    if (config) {
      // If inactive, reactivate it
      if (!config.isActive) {
        config = await prisma.webhookConfig.update({
          where: { businessId },
          data: { isActive: true }
        });
      }
      return config;
    }

    // Create new config with auto-generated secret
    config = await prisma.webhookConfig.create({
      data: {
        businessId,
        isActive: true
      }
    });

    console.log(`✅ Webhook config created for business ${businessId}`);

    return config;
  } catch (error) {
    console.error('❌ Create webhook config error:', error);
    throw error;
  }
}

/**
 * Get webhook URL for a business
 */
export async function getWebhookUrl(businessId) {
  const config = await prisma.webhookConfig.findUnique({
    where: { businessId }
  });

  if (!config) {
    return null;
  }

  const baseUrl = process.env.BACKEND_URL;
  return `${baseUrl}/api/webhook/incoming/${businessId}`;
}

/**
 * Regenerate webhook secret
 */
export async function regenerateSecret(businessId) {
  const newSecret = generateWebhookSecret();

  const config = await prisma.webhookConfig.update({
    where: { businessId },
    data: {
      webhookSecret: newSecret,
      updatedAt: new Date()
    }
  });

  return config;
}

/**
 * Validate incoming webhook request
 */
export async function validateWebhookRequest(businessId, providedSecret) {
  try {
    const config = await prisma.webhookConfig.findUnique({
      where: { businessId: parseInt(businessId) }
    });

    if (!config) {
      return { valid: false, error: 'Webhook not configured' };
    }

    if (!config.isActive) {
      return { valid: false, error: 'Webhook is disabled' };
    }

    if (!providedSecret || !safeCompareStrings(config.webhookSecret, String(providedSecret))) {
      return { valid: false, error: 'Invalid webhook secret' };
    }

    return { valid: true, config };
  } catch (error) {
    console.error('❌ Validate webhook error:', error);
    return { valid: false, error: 'Validation failed' };
  }
}

/**
 * Process incoming webhook data
 */
export async function processWebhook(businessId, payload) {
  try {
    const type = payload.type || 'custom';
    const action = payload.action || 'sync';

    console.log(`📥 Processing webhook for business ${businessId}: ${type}/${action}`);

    // Log the webhook
    const log = await prisma.webhookLog.create({
      data: {
        businessId,
        type,
        action,
        payload,
        status: 'received'
      }
    });

    let result;

    // Process based on type
    switch (type) {
      case 'order':
        result = await processOrderWebhook(businessId, payload.order || payload, action);
        break;

      case 'inventory':
        result = await processInventoryWebhook(businessId, payload.product || payload, action);
        break;

      case 'shipment':
        result = await processShipmentWebhook(businessId, payload.shipment || payload, action);
        break;

      case 'custom':
      default:
        result = await processCustomWebhook(businessId, payload);
        break;
    }

    // Update log status
    await prisma.webhookLog.update({
      where: { id: log.id },
      data: {
        status: result.success ? 'processed' : 'failed',
        errorMessage: result.error,
        processedAt: new Date()
      }
    });

    return result;
  } catch (error) {
    console.error('❌ Process webhook error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Process order webhook
 */
export async function processOrderWebhook(businessId, orderData, action = 'created') {
  try {
    const externalId = orderData.id || orderData.order_id || orderData.externalId;

    if (!externalId) {
      return {
        success: false,
        error: 'Order ID is required'
      };
    }

    // Normalize order data
    const orderRecord = {
      businessId,
      externalId: externalId.toString(),
      customerName: orderData.customer_name || orderData.customerName,
      customerPhone: orderData.customer_phone || orderData.customerPhone,
      customerEmail: orderData.customer_email || orderData.customerEmail,
      status: orderData.status || 'pending',
      statusText: orderData.status_text || orderData.statusText || getStatusText(orderData.status),
      totalAmount: parseFloat(orderData.total || orderData.total_amount || orderData.totalAmount || 0),
      currency: orderData.currency || 'TRY',
      items: orderData.items || null,
      trackingNumber: orderData.tracking_number || orderData.trackingNumber,
      trackingCarrier: orderData.tracking_carrier || orderData.trackingCarrier || orderData.carrier,
      trackingUrl: orderData.tracking_url || orderData.trackingUrl,
      source: orderData.source || 'zapier',
      rawPayload: orderData
    };

    if (action === 'deleted' || action === 'cancelled') {
      // Soft delete - update status
      await prisma.webhookOrder.updateMany({
        where: {
          businessId,
          externalId: externalId.toString()
        },
        data: {
          status: 'cancelled',
          statusText: 'İptal Edildi',
          updatedAt: new Date()
        }
      });

      return {
        success: true,
        action: 'cancelled',
        orderId: externalId
      };
    }

    // Upsert order
    const order = await prisma.webhookOrder.upsert({
      where: {
        businessId_externalId: {
          businessId,
          externalId: externalId.toString()
        }
      },
      update: {
        ...orderRecord,
        updatedAt: new Date()
      },
      create: orderRecord
    });

    console.log(`✅ Order ${action}: ${externalId}`);

    return {
      success: true,
      action,
      order: {
        id: order.id,
        externalId: order.externalId,
        status: order.status
      }
    };
  } catch (error) {
    console.error('❌ Process order webhook error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Process inventory webhook
 */
export async function processInventoryWebhook(businessId, productData, action = 'updated') {
  try {
    const sku = productData.sku || productData.product_id || productData.id;
    const productName = productData.name || productData.product_name || productData.title;

    if (!sku && !productName) {
      return {
        success: false,
        error: 'Product SKU or name is required'
      };
    }

    const inventoryRecord = {
      businessId,
      externalId: productData.id?.toString() || null,
      productName: productName || sku,
      sku: sku?.toString(),
      stock: parseInt(productData.stock || productData.stock_quantity || productData.quantity || 0),
      source: productData.source || 'zapier'
    };

    // Upsert inventory
    const inventory = await prisma.webhookInventory.upsert({
      where: {
        businessId_sku: {
          businessId,
          sku: sku?.toString() || productName
        }
      },
      update: {
        ...inventoryRecord,
        updatedAt: new Date()
      },
      create: {
        ...inventoryRecord,
        sku: sku?.toString() || productName
      }
    });

    console.log(`✅ Inventory ${action}: ${sku || productName} = ${inventory.stock}`);

    return {
      success: true,
      action,
      inventory: {
        id: inventory.id,
        sku: inventory.sku,
        stock: inventory.stock
      }
    };
  } catch (error) {
    console.error('❌ Process inventory webhook error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Process shipment webhook
 */
export async function processShipmentWebhook(businessId, shipmentData, action = 'updated') {
  try {
    const orderId = shipmentData.order_id || shipmentData.orderId || shipmentData.externalOrderId;

    if (!orderId) {
      return {
        success: false,
        error: 'Order ID is required for shipment updates'
      };
    }

    // Find the order
    const order = await prisma.webhookOrder.findFirst({
      where: {
        businessId,
        externalId: orderId.toString()
      }
    });

    if (!order) {
      // Create order entry with shipment data
      await prisma.webhookOrder.create({
        data: {
          businessId,
          externalId: orderId.toString(),
          status: shipmentData.status || 'shipped',
          statusText: shipmentData.status_text || getShipmentStatusText(shipmentData.status),
          trackingNumber: shipmentData.tracking_number || shipmentData.trackingNumber,
          trackingCarrier: shipmentData.carrier || shipmentData.tracking_carrier,
          trackingUrl: shipmentData.tracking_url || shipmentData.trackingUrl,
          source: shipmentData.source || 'zapier'
        }
      });
    } else {
      // Update existing order
      await prisma.webhookOrder.update({
        where: { id: order.id },
        data: {
          status: shipmentData.status || order.status,
          statusText: shipmentData.status_text || getShipmentStatusText(shipmentData.status) || order.statusText,
          trackingNumber: shipmentData.tracking_number || shipmentData.trackingNumber || order.trackingNumber,
          trackingCarrier: shipmentData.carrier || shipmentData.tracking_carrier || order.trackingCarrier,
          trackingUrl: shipmentData.tracking_url || shipmentData.trackingUrl || order.trackingUrl,
          updatedAt: new Date()
        }
      });
    }

    console.log(`✅ Shipment ${action} for order: ${orderId}`);

    return {
      success: true,
      action,
      orderId
    };
  } catch (error) {
    console.error('❌ Process shipment webhook error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Process custom webhook (generic data)
 */
async function processCustomWebhook(businessId, payload) {
  // Just log custom webhooks for now
  console.log(`📦 Custom webhook received for business ${businessId}`);

  return {
    success: true,
    action: 'logged',
    message: 'Custom webhook data received and logged'
  };
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get order by external ID
 */
export async function getOrderByExternalId(businessId, externalId) {
  try {
    const order = await prisma.webhookOrder.findFirst({
      where: {
        businessId,
        externalId: externalId.toString()
      }
    });

    if (!order) {
      return {
        success: false,
        message: 'Sipariş bulunamadı'
      };
    }

    return {
      success: true,
      order: normalizeWebhookOrder(order)
    };
  } catch (error) {
    console.error('❌ Get order by external ID error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get order by phone number
 */
export async function getOrderByPhone(businessId, phone) {
  try {
    const cleanPhone = phone.replace(/\D/g, '');

    const orders = await prisma.webhookOrder.findMany({
      where: {
        businessId,
        customerPhone: {
          contains: cleanPhone.slice(-10) // Last 10 digits
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 5
    });

    if (orders.length === 0) {
      return {
        success: false,
        message: 'Bu telefon numarasına ait sipariş bulunamadı'
      };
    }

    return {
      success: true,
      order: normalizeWebhookOrder(orders[0]),
      totalOrders: orders.length
    };
  } catch (error) {
    console.error('❌ Get order by phone error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get order by email
 */
export async function getOrderByEmail(businessId, email) {
  try {
    const orders = await prisma.webhookOrder.findMany({
      where: {
        businessId,
        customerEmail: email.toLowerCase().trim()
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 5
    });

    if (orders.length === 0) {
      return {
        success: false,
        message: 'Bu email adresine ait sipariş bulunamadı'
      };
    }

    return {
      success: true,
      order: normalizeWebhookOrder(orders[0]),
      totalOrders: orders.length
    };
  } catch (error) {
    console.error('❌ Get order by email error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get product stock from webhook inventory
 */
export async function getProductStock(businessId, sku) {
  try {
    const inventory = await prisma.webhookInventory.findFirst({
      where: {
        businessId,
        OR: [
          { sku: sku },
          { productName: { contains: sku, mode: 'insensitive' } }
        ]
      }
    });

    if (!inventory) {
      return {
        success: false,
        message: 'Ürün bulunamadı'
      };
    }

    return {
      success: true,
      product: {
        id: inventory.id.toString(),
        title: inventory.productName,
        sku: inventory.sku,
        totalStock: inventory.stock,
        available: inventory.stock > 0,
        source: 'webhook'
      },
      message: inventory.stock > 0
        ? `${inventory.productName} stokta mevcut (${inventory.stock} adet)`
        : `${inventory.productName} şu anda stokta yok`
    };
  } catch (error) {
    console.error('❌ Get product stock error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get recent webhook logs
 */
export async function getWebhookLogs(businessId, limit = 20) {
  try {
    const logs = await prisma.webhookLog.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        type: true,
        action: true,
        status: true,
        createdAt: true,
        processedAt: true,
        errorMessage: true
      }
    });

    return {
      success: true,
      logs
    };
  } catch (error) {
    console.error('❌ Get webhook logs error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check if webhook is configured for a business
 */
export async function hasWebhookConfig(businessId) {
  try {
    const config = await prisma.webhookConfig.findUnique({
      where: { businessId }
    });
    return config && config.isActive;
  } catch (error) {
    return false;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get status text in Turkish
 */
function getStatusText(status) {
  const statusMap = {
    'pending': 'Beklemede',
    'processing': 'İşleniyor',
    'shipped': 'Kargoya Verildi',
    'delivered': 'Teslim Edildi',
    'completed': 'Tamamlandı',
    'cancelled': 'İptal Edildi',
    'refunded': 'İade Edildi'
  };
  return statusMap[status?.toLowerCase()] || status || 'Bilinmiyor';
}

/**
 * Get shipment status text in Turkish
 */
function getShipmentStatusText(status) {
  const statusMap = {
    'pending': 'Hazırlanıyor',
    'shipped': 'Kargoya Verildi',
    'in_transit': 'Yolda',
    'out_for_delivery': 'Dağıtıma Çıktı',
    'delivered': 'Teslim Edildi',
    'returned': 'İade Edildi',
    'failed': 'Teslim Edilemedi'
  };
  return statusMap[status?.toLowerCase()] || status || 'Bilinmiyor';
}

/**
 * Normalize webhook order to standard format
 */
function normalizeWebhookOrder(order) {
  return {
    id: order.id.toString(),
    orderNumber: `#${order.externalId}`,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    status: order.status,
    statusText: order.statusText || getStatusText(order.status),
    fulfillmentStatus: order.trackingNumber ? 'fulfilled' : 'unfulfilled',
    fulfillmentStatusText: order.trackingNumber ? 'Kargoya Verildi' : 'Hazırlanıyor',
    totalPrice: order.totalAmount?.toString() || '0',
    currency: order.currency || 'TRY',
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: order.items || [],
    tracking: order.trackingNumber ? {
      company: order.trackingCarrier || 'Kargo',
      number: order.trackingNumber,
      url: order.trackingUrl
    } : null,
    source: order.source || 'webhook'
  };
}

export default {
  generateWebhookSecret,
  createWebhookConfig,
  getWebhookUrl,
  regenerateSecret,
  validateWebhookRequest,
  processWebhook,
  processOrderWebhook,
  processInventoryWebhook,
  processShipmentWebhook,
  getOrderByExternalId,
  getOrderByPhone,
  getOrderByEmail,
  getProductStock,
  getWebhookLogs,
  hasWebhookConfig
};
