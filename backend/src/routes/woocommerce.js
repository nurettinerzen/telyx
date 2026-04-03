// ============================================================================
// WOOCOMMERCE INTEGRATION ROUTES
// ============================================================================
// FILE: backend/src/routes/woocommerce.js
//
// Handles WooCommerce integration connect/disconnect and API endpoints
// ============================================================================

import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';
import woocommerceService from '../services/woocommerce.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// ============================================================================
// CONNECTION MANAGEMENT
// ============================================================================

/**
 * POST /api/woocommerce/connect
 * Connect WooCommerce store
 */
router.post('/connect', async (req, res) => {
  try {
    const { siteUrl, consumerKey, consumerSecret } = req.body;

    // Validate required fields
    if (!siteUrl || !consumerKey || !consumerSecret) {
      return res.status(400).json({
        error: 'Site URL, Consumer Key, and Consumer Secret are required'
      });
    }

    // Test connection first
    const testResult = await woocommerceService.testConnection({ siteUrl, consumerKey, consumerSecret });

    if (!testResult.success) {
      return res.status(400).json({
        error: 'Failed to connect to WooCommerce',
        details: testResult.message
      });
    }

    // Save integration
    await prisma.integration.upsert({
      where: {
        businessId_type: {
          businessId: req.businessId,
          type: 'WOOCOMMERCE'
        }
      },
      update: {
        credentials: {
          siteUrl,
          consumerKey,
          consumerSecret,
          storeName: testResult.store.name,
          wcVersion: testResult.store.wcVersion
        },
        connected: true,
        isActive: true,
        lastSync: new Date()
      },
      create: {
        businessId: req.businessId,
        type: 'WOOCOMMERCE',
        credentials: {
          siteUrl,
          consumerKey,
          consumerSecret,
          storeName: testResult.store.name,
          wcVersion: testResult.store.wcVersion
        },
        connected: true,
        isActive: true
      }
    });

    console.log(`✅ WooCommerce connected for business ${req.businessId}: ${testResult.store.name}`);

    res.json({
      success: true,
      message: 'WooCommerce connected successfully',
      store: testResult.store
    });

  } catch (error) {
    console.error('❌ WooCommerce connect error:', error);
    res.status(500).json({
      error: 'Failed to connect WooCommerce',
      message: error.message
    });
  }
});

/**
 * POST /api/woocommerce/disconnect
 * Disconnect WooCommerce store
 */
router.post('/disconnect', async (req, res) => {
  try {
    await prisma.integration.updateMany({
      where: {
        businessId: req.businessId,
        type: 'WOOCOMMERCE'
      },
      data: {
        connected: false,
        isActive: false
      }
    });

    console.log(`✅ WooCommerce disconnected for business ${req.businessId}`);

    res.json({
      success: true,
      message: 'WooCommerce disconnected successfully'
    });

  } catch (error) {
    console.error('❌ WooCommerce disconnect error:', error);
    res.status(500).json({
      error: 'Failed to disconnect WooCommerce'
    });
  }
});

/**
 * POST /api/woocommerce/test
 * Test WooCommerce connection
 */
router.post('/test', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId: req.businessId,
        type: 'WOOCOMMERCE'
      }
    });

    if (!integration) {
      return res.status(404).json({
        error: 'WooCommerce not connected'
      });
    }

    const testResult = await woocommerceService.testConnection(integration.credentials);

    res.json({
      success: true,
      message: 'Connection successful',
      store: testResult.store
    });

  } catch (error) {
    console.error('❌ WooCommerce test error:', error);
    res.status(500).json({
      success: false,
      error: 'Connection test failed',
      message: error.message
    });
  }
});

/**
 * GET /api/woocommerce/status
 * Get WooCommerce connection status
 */
router.get('/status', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId: req.businessId,
        type: 'WOOCOMMERCE'
      }
    });

    if (!integration || !integration.connected) {
      return res.json({
        connected: false
      });
    }

    res.json({
      connected: true,
      isActive: integration.isActive,
      storeName: integration.credentials?.storeName,
      siteUrl: integration.credentials?.siteUrl,
      wcVersion: integration.credentials?.wcVersion,
      lastSync: integration.lastSync
    });

  } catch (error) {
    console.error('❌ WooCommerce status error:', error);
    res.status(500).json({
      error: 'Failed to get status'
    });
  }
});

// ============================================================================
// ORDER ENDPOINTS
// ============================================================================

/**
 * GET /api/woocommerce/orders
 * Get recent orders
 */
router.get('/orders', async (req, res) => {
  try {
    const { limit, status } = req.query;

    const result = await woocommerceService.getOrders(req.businessId, {
      limit: parseInt(limit) || 50,
      status: status || 'any'
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json(result);

  } catch (error) {
    console.error('❌ WooCommerce get orders error:', error);
    res.status(500).json({
      error: 'Failed to get orders'
    });
  }
});

/**
 * GET /api/woocommerce/orders/:id
 * Get order by ID
 */
router.get('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await woocommerceService.getOrderByNumber(req.businessId, id);

    if (!result.success) {
      return res.status(404).json({
        error: result.message || 'Order not found'
      });
    }

    res.json(result);

  } catch (error) {
    console.error('❌ WooCommerce get order error:', error);
    res.status(500).json({
      error: 'Failed to get order'
    });
  }
});

/**
 * GET /api/woocommerce/orders/search/:query
 * Search orders
 */
router.get('/orders/search/:query', async (req, res) => {
  try {
    const { query } = req.params;

    const result = await woocommerceService.searchOrders(req.businessId, query);

    if (!result.success) {
      return res.status(404).json({
        error: result.message || 'Order not found'
      });
    }

    res.json(result);

  } catch (error) {
    console.error('❌ WooCommerce search order error:', error);
    res.status(500).json({
      error: 'Failed to search order'
    });
  }
});

// ============================================================================
// PRODUCT ENDPOINTS
// ============================================================================

/**
 * GET /api/woocommerce/products
 * Get products
 */
router.get('/products', async (req, res) => {
  try {
    const { limit, search } = req.query;

    if (search) {
      const result = await woocommerceService.getProductByName(req.businessId, search);
      return res.json(result);
    }

    const result = await woocommerceService.getProducts(req.businessId, {
      limit: parseInt(limit) || 50
    });

    res.json(result);

  } catch (error) {
    console.error('❌ WooCommerce get products error:', error);
    res.status(500).json({
      error: 'Failed to get products'
    });
  }
});

/**
 * GET /api/woocommerce/products/:productId/stock
 * Get product stock
 */
router.get('/products/:productId/stock', async (req, res) => {
  try {
    const { productId } = req.params;

    const result = await woocommerceService.getProductStock(req.businessId, productId);

    if (!result.success) {
      return res.status(404).json({
        error: result.message || 'Product not found'
      });
    }

    res.json(result);

  } catch (error) {
    console.error('❌ WooCommerce get stock error:', error);
    res.status(500).json({
      error: 'Failed to get stock'
    });
  }
});

/**
 * GET /api/woocommerce/products/:productId/variations
 * Get product variations
 */
router.get('/products/:productId/variations', async (req, res) => {
  try {
    const { productId } = req.params;

    const result = await woocommerceService.getProductVariations(req.businessId, productId);

    if (!result.success) {
      return res.status(404).json({
        error: result.message || 'Product not found'
      });
    }

    res.json(result);

  } catch (error) {
    console.error('❌ WooCommerce get variations error:', error);
    res.status(500).json({
      error: 'Failed to get variations'
    });
  }
});

export default router;
