// ============================================================================
// SHOPIFY INTEGRATION SERVICE
// ============================================================================
// FILE: backend/src/services/shopifyService.js
//
// Handles e-commerce order tracking via Shopify API
// ============================================================================

import axios from 'axios';
import prisma from '../prismaClient.js';

/**
 * Check if business has Shopify integration
 */
export const hasIntegration = async (businessId) => {
  try {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId,
        type: 'SHOPIFY',
        isActive: true
      }
    });
    return !!integration;
  } catch (error) {
    return false;
  }
};

/**
 * Get Shopify credentials
 */
const getCredentials = async (businessId) => {
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

  return integration.credentials;
};

/**
 * Build Shopify API URL
 */
const getShopifyUrl = (storeUrl, endpoint) => {
  const cleanUrl = storeUrl.replace('https://', '').replace('http://', '');
  return `https://${cleanUrl}/admin/api/2024-01/${endpoint}`;
};

/**
 * Get order by order number
 */
export const getOrder = async (businessId, orderNumber) => {
  try {
    const credentials = await getCredentials(businessId);
    const { storeUrl, apiKey, apiSecret } = credentials;

    console.log(`🔍 Fetching Shopify order: ${orderNumber}`);

    const response = await axios.get(
      getShopifyUrl(storeUrl, `orders.json`),
      {
        params: {
          name: orderNumber,
          status: 'any'
        },
        auth: {
          username: apiKey,
          password: apiSecret
        }
      }
    );

    const orders = response.data.orders || [];
    
    if (orders.length === 0) {
      return {
        found: false,
        message: `Order ${orderNumber} not found`
      };
    }

    const order = orders[0];

    console.log(`✅ Shopify order found: ${order.id}`);

    return {
      found: true,
      order: {
        id: order.id,
        orderNumber: order.name,
        status: order.financial_status,
        fulfillmentStatus: order.fulfillment_status,
        totalPrice: order.total_price,
        currency: order.currency,
        createdAt: order.created_at,
        customer: {
          name: `${order.customer?.first_name} ${order.customer?.last_name}`,
          email: order.customer?.email
        },
        items: order.line_items?.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price
        })) || [],
        shippingAddress: order.shipping_address,
        trackingNumber: order.fulfillments?.[0]?.tracking_number || null,
        trackingUrl: order.fulfillments?.[0]?.tracking_url || null,
        trackingCompany: order.fulfillments?.[0]?.tracking_company || null
      }
    };
  } catch (error) {
    console.error('❌ Shopify order fetch error:', error.response?.data || error.message);
    
    return {
      found: false,
      error: true,
      message: 'Unable to retrieve order information'
    };
  }
};

/**
 * Get tracking information for an order
 */
export const getTracking = async (businessId, orderNumber) => {
  try {
    const orderData = await getOrder(businessId, orderNumber);
    
    if (!orderData.found) {
      return orderData;
    }

    const order = orderData.order;

    if (!order.trackingNumber) {
      return {
        hasTracking: false,
        message: `Order ${orderNumber} has been received but hasn't shipped yet`
      };
    }

    // Estimate delivery based on fulfillment status
    let estimatedDelivery = 'Calculating...';
    if (order.fulfillmentStatus === 'fulfilled') {
      estimatedDelivery = 'Delivered';
    } else if (order.fulfillmentStatus === 'partial') {
      estimatedDelivery = '2-5 business days';
    }

    return {
      hasTracking: true,
      tracking: {
        trackingNumber: order.trackingNumber,
        carrier: order.trackingCompany || 'Standard Shipping',
        trackingUrl: order.trackingUrl,
        status: order.fulfillmentStatus === 'fulfilled' ? 'Delivered' : 'In Transit',
        estimatedDelivery
      },
      message: `Your order is ${order.fulfillmentStatus === 'fulfilled' ? 'delivered' : 'on the way'}. Tracking number: ${order.trackingNumber}`
    };
  } catch (error) {
    console.error('❌ Shopify tracking error:', error);
    
    return {
      hasTracking: false,
      error: true,
      message: 'Unable to retrieve tracking information'
    };
  }
};

/**
 * Check product availability/stock
 */
export const checkProductStock = async (businessId, productId) => {
  try {
    const credentials = await getCredentials(businessId);
    const { storeUrl, apiKey, apiSecret } = credentials;

    console.log(`🔍 Checking Shopify product stock: ${productId}`);

    const response = await axios.get(
      getShopifyUrl(storeUrl, `products/${productId}.json`),
      {
        auth: {
          username: apiKey,
          password: apiSecret
        }
      }
    );

    const product = response.data.product;
    const totalInventory = product.variants?.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0) || 0;

    return {
      available: totalInventory > 0,
      product: {
        id: product.id,
        title: product.title,
        price: product.variants?.[0]?.price || '0',
        inStock: totalInventory,
        variants: product.variants?.map(v => ({
          id: v.id,
          title: v.title,
          price: v.price,
          available: v.inventory_quantity > 0,
          quantity: v.inventory_quantity
        })) || []
      },
      message: totalInventory > 0 
        ? `${product.title} is in stock` 
        : `${product.title} is currently out of stock`
    };
  } catch (error) {
    console.error('❌ Shopify product check error:', error.response?.data || error.message);
    
    return {
      available: false,
      error: true,
      message: 'Unable to check product availability'
    };
  }
};

/**
 * Create a return/refund request
 */
export const createReturn = async (businessId, orderNumber, reason) => {
  try {
    const credentials = await getCredentials(businessId);
    const { storeUrl, apiKey, apiSecret } = credentials;

    // First get the order
    const orderData = await getOrder(businessId, orderNumber);
    
    if (!orderData.found) {
      return orderData;
    }

    console.log(`🔄 Creating return for order: ${orderNumber}`);

    // Create a note on the order for return request
    await axios.post(
      getShopifyUrl(storeUrl, `orders/${orderData.order.id}/notes.json`),
      {
        note: {
          body: `Return requested: ${reason}`,
          author: 'AI Assistant'
        }
      },
      {
        auth: {
          username: apiKey,
          password: apiSecret
        }
      }
    );

    console.log(`✅ Return request created`);

    return {
      success: true,
      message: 'Return request submitted successfully. Our team will contact you within 24 hours.'
    };
  } catch (error) {
    console.error('❌ Shopify return error:', error.response?.data || error.message);
    
    return {
      success: false,
      error: true,
      message: 'Unable to process return request. Please contact customer support.'
    };
  }
};

/**
 * Get recent orders for a customer (by email or phone)
 */
export const getCustomerOrders = async (businessId, customerEmail) => {
  try {
    const credentials = await getCredentials(businessId);
    const { storeUrl, apiKey, apiSecret } = credentials;

    console.log(`🔍 Fetching customer orders for: ${customerEmail}`);

    // Search for customer
    const customerRes = await axios.get(
      getShopifyUrl(storeUrl, `customers/search.json`),
      {
        params: {
          query: `email:${customerEmail}`
        },
        auth: {
          username: apiKey,
          password: apiSecret
        }
      }
    );

    const customers = customerRes.data.customers || [];
    
    if (customers.length === 0) {
      return {
        found: false,
        message: 'No orders found for this email'
      };
    }

    const customer = customers[0];

    // Get customer's orders
    const ordersRes = await axios.get(
      getShopifyUrl(storeUrl, `customers/${customer.id}/orders.json`),
      {
        auth: {
          username: apiKey,
          password: apiSecret
        }
      }
    );

    const orders = ordersRes.data.orders || [];

    return {
      found: true,
      orders: orders.slice(0, 5).map(order => ({
        orderNumber: order.name,
        status: order.financial_status,
        fulfillmentStatus: order.fulfillment_status,
        totalPrice: order.total_price,
        createdAt: order.created_at
      })),
      message: `Found ${orders.length} order(s) for this email`
    };
  } catch (error) {
    console.error('❌ Shopify customer orders error:', error.response?.data || error.message);
    
    return {
      found: false,
      error: true,
      message: 'Unable to retrieve customer orders'
    };
  }
};

/**
 * Test Shopify API connection
 */
export const testConnection = async (credentials) => {
  try {
    const { storeUrl, apiKey, apiSecret } = credentials;

    if (!storeUrl || !apiKey || !apiSecret) {
      throw new Error('Store URL, API Key, and API Secret are required');
    }

    // Test by getting shop info
    const response = await axios.get(
      getShopifyUrl(storeUrl, 'shop.json'),
      {
        auth: {
          username: apiKey,
          password: apiSecret
        }
      }
    );

    return {
      success: true,
      shop: response.data.shop,
      message: `Successfully connected to ${response.data.shop.name}`
    };
  } catch (error) {
    console.error('❌ Shopify test connection error:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      throw new Error('Invalid API credentials');
    } else if (error.response?.status === 404) {
      throw new Error('Store not found. Check your store URL.');
    } else {
      throw new Error('Connection failed: ' + (error.message || 'Unknown error'));
    }
  }
};

export default {
  hasIntegration,
  getOrder,
  getTracking,
  checkProductStock,
  createReturn,
  getCustomerOrders,
  testConnection
};
