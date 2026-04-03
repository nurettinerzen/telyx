// ============================================================================
// SHOPIFY INTEGRATION ROUTES
// ============================================================================
// FILE: backend/src/routes/shopify.js
//
// Handles Shopify integration connect/disconnect and API endpoints
// ============================================================================

import express from 'express';
import crypto from 'crypto';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';
import shopifyService from '../services/shopify.js';

const router = express.Router();

// Shopify OAuth Configuration
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SHOPIFY_SCOPES = 'read_orders,read_products,read_inventory';
const FRONTEND_URL = process.env.FRONTEND_URL;
const BACKEND_URL = process.env.BACKEND_URL;

// ============================================================================
// OAUTH FLOW (No auth required for callback)
// ============================================================================

/**
 * GET /api/shopify/auth
 * Start Shopify OAuth flow - redirect to Shopify authorization page
 * Query: shop (required) - e.g., "mystore.myshopify.com"
 */
router.get('/auth', authenticateToken, async (req, res) => {
  try {
    const { shop } = req.query;

    if (!shop) {
      return res.status(400).json({
        error: 'Shop URL is required',
        example: '/api/shopify/auth?shop=mystore.myshopify.com'
      });
    }

    // Validate shop URL format
    const shopDomain = shop.replace('https://', '').replace('http://', '').replace(/\/$/, '');
    if (!shopDomain.includes('.myshopify.com')) {
      return res.status(400).json({
        error: 'Invalid shop URL. Must be in format: mystore.myshopify.com'
      });
    }

    if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET) {
      return res.status(500).json({
        error: 'Shopify OAuth not configured. Use manual token method instead.',
        useManualMethod: true
      });
    }

    // Generate state for CSRF protection (includes businessId)
    const state = Buffer.from(JSON.stringify({
      businessId: req.businessId,
      nonce: crypto.randomBytes(16).toString('hex'),
      timestamp: Date.now()
    })).toString('base64');

    // Store state temporarily (expires in 10 minutes)
    await prisma.integration.upsert({
      where: {
        businessId_type: {
          businessId: req.businessId,
          type: 'SHOPIFY'
        }
      },
      update: {
        credentials: {
          oauthState: state,
          shopDomain,
          stateExpiry: Date.now() + 600000 // 10 minutes
        }
      },
      create: {
        businessId: req.businessId,
        type: 'SHOPIFY',
        credentials: {
          oauthState: state,
          shopDomain,
          stateExpiry: Date.now() + 600000
        },
        connected: false,
        isActive: false
      }
    });

    // Build authorization URL
    const redirectUri = `${BACKEND_URL}/api/shopify/callback`;
    const authUrl = `https://${shopDomain}/admin/oauth/authorize?` +
      `client_id=${SHOPIFY_API_KEY}` +
      `&scope=${SHOPIFY_SCOPES}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}`;

    console.log(`🔗 Shopify OAuth started for business ${req.businessId}, shop: ${shopDomain}`);

    res.json({ authUrl });

  } catch (error) {
    console.error('❌ Shopify OAuth start error:', error);
    res.status(500).json({
      error: 'Failed to start OAuth flow',
      message: error.message
    });
  }
});

/**
 * GET /api/shopify/callback
 * Shopify OAuth callback - exchange code for access token
 * This is called by Shopify after user authorizes
 */
router.get('/callback', async (req, res) => {
  console.log('🔔 Shopify callback received', {
    shop: typeof req.query.shop === 'string' ? req.query.shop : null,
    hasCode: Boolean(req.query.code),
    hasState: Boolean(req.query.state),
    hasHmac: Boolean(req.query.hmac)
  });
  try {
    const { code, shop, state, hmac } = req.query;

    if (!code || !shop || !state) {
      console.error('❌ Shopify callback missing params:', { code: !!code, shop: !!shop, state: !!state });
      return res.redirect(`${FRONTEND_URL}/dashboard/integrations?error=shopify&message=Missing+parameters`);
    }

    // Decode state to get businessId
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch (e) {
      console.error('❌ Invalid state:', e);
      return res.redirect(`${FRONTEND_URL}/dashboard/integrations?error=shopify&message=Invalid+state`);
    }

    const { businessId } = stateData;

    // Verify state matches what we stored
    const integration = await prisma.integration.findFirst({
      where: {
        businessId,
        type: 'SHOPIFY'
      }
    });

    if (!integration || integration.credentials?.oauthState !== state) {
      console.error('❌ State mismatch');
      return res.redirect(`${FRONTEND_URL}/dashboard/integrations?error=shopify&message=Invalid+state`);
    }

    // Check state expiry
    if (Date.now() > integration.credentials?.stateExpiry) {
      console.error('❌ State expired');
      return res.redirect(`${FRONTEND_URL}/dashboard/integrations?error=shopify&message=Session+expired`);
    }

    // Verify HMAC if provided (Shopify security)
    if (hmac && SHOPIFY_API_SECRET) {
      const queryParams = { ...req.query };
      delete queryParams.hmac;
      const message = Object.keys(queryParams)
        .sort()
        .map(key => `${key}=${queryParams[key]}`)
        .join('&');
      const generatedHmac = crypto
        .createHmac('sha256', SHOPIFY_API_SECRET)
        .update(message)
        .digest('hex');

      if (generatedHmac !== hmac) {
        console.error('❌ HMAC verification failed');
        return res.redirect(`${FRONTEND_URL}/dashboard/integrations?error=shopify&message=Security+verification+failed`);
      }
    }

    // Exchange code for access token
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code
      })
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('❌ Token exchange failed:', error);
      return res.redirect(`${FRONTEND_URL}/dashboard/integrations?error=shopify&message=Token+exchange+failed`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Get shop info
    const shopInfoResponse = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken }
    });

    let shopInfo = { name: shop, domain: shop };
    if (shopInfoResponse.ok) {
      const shopData = await shopInfoResponse.json();
      shopInfo = {
        name: shopData.shop.name,
        domain: shopData.shop.domain,
        email: shopData.shop.email,
        currency: shopData.shop.currency
      };
    }

    // Save integration
    await prisma.integration.update({
      where: {
        businessId_type: {
          businessId,
          type: 'SHOPIFY'
        }
      },
      data: {
        credentials: {
          shopUrl: shop,
          accessToken,
          shopName: shopInfo.name,
          shopDomain: shopInfo.domain,
          shopEmail: shopInfo.email,
          currency: shopInfo.currency,
          connectedVia: 'oauth'
        },
        connected: true,
        isActive: true,
        lastSync: new Date()
      }
    });

    console.log(`✅ Shopify OAuth completed for business ${businessId}: ${shopInfo.name}`);

    res.redirect(`${FRONTEND_URL}/dashboard/integrations?success=shopify`);

  } catch (error) {
    console.error('❌ Shopify callback error:', error);
    res.redirect(`${FRONTEND_URL}/dashboard/integrations?error=shopify&message=${encodeURIComponent(error.message)}`);
  }
});

// ============================================================================
// PROTECTED ROUTES (require authentication)
// ============================================================================
router.use(authenticateToken);

// ============================================================================
// CONNECTION MANAGEMENT
// ============================================================================

/**
 * POST /api/shopify/connect
 * Connect Shopify store
 */
router.post('/connect', async (req, res) => {
  try {
    const { shopUrl, accessToken } = req.body;

    // Validate required fields
    if (!shopUrl || !accessToken) {
      return res.status(400).json({
        error: 'Shop URL and Access Token are required'
      });
    }

    // Test connection first
    const testResult = await shopifyService.testConnection({ shopUrl, accessToken });

    if (!testResult.success) {
      return res.status(400).json({
        error: 'Failed to connect to Shopify',
        details: testResult.message
      });
    }

    // Save integration
    await prisma.integration.upsert({
      where: {
        businessId_type: {
          businessId: req.businessId,
          type: 'SHOPIFY'
        }
      },
      update: {
        credentials: {
          shopUrl,
          accessToken,
          shopName: testResult.shop.name,
          shopDomain: testResult.shop.domain
        },
        connected: true,
        isActive: true,
        lastSync: new Date()
      },
      create: {
        businessId: req.businessId,
        type: 'SHOPIFY',
        credentials: {
          shopUrl,
          accessToken,
          shopName: testResult.shop.name,
          shopDomain: testResult.shop.domain
        },
        connected: true,
        isActive: true
      }
    });

    console.log(`✅ Shopify connected for business ${req.businessId}: ${testResult.shop.name}`);

    res.json({
      success: true,
      message: 'Shopify connected successfully',
      shop: testResult.shop
    });

  } catch (error) {
    console.error('❌ Shopify connect error:', error);
    res.status(500).json({
      error: 'Failed to connect Shopify',
      message: error.message
    });
  }
});

/**
 * POST /api/shopify/disconnect
 * Disconnect Shopify store
 */
router.post('/disconnect', async (req, res) => {
  try {
    await prisma.integration.updateMany({
      where: {
        businessId: req.businessId,
        type: 'SHOPIFY'
      },
      data: {
        connected: false,
        isActive: false
      }
    });

    console.log(`✅ Shopify disconnected for business ${req.businessId}`);

    res.json({
      success: true,
      message: 'Shopify disconnected successfully'
    });

  } catch (error) {
    console.error('❌ Shopify disconnect error:', error);
    res.status(500).json({
      error: 'Failed to disconnect Shopify'
    });
  }
});

/**
 * POST /api/shopify/test
 * Test Shopify connection
 */
router.post('/test', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId: req.businessId,
        type: 'SHOPIFY'
      }
    });

    if (!integration) {
      return res.status(404).json({
        error: 'Shopify not connected'
      });
    }

    const testResult = await shopifyService.testConnection(integration.credentials);

    res.json({
      success: true,
      message: 'Connection successful',
      shop: testResult.shop
    });

  } catch (error) {
    console.error('❌ Shopify test error:', error);
    res.status(500).json({
      success: false,
      error: 'Connection test failed',
      message: error.message
    });
  }
});

/**
 * GET /api/shopify/status
 * Get Shopify connection status
 */
router.get('/status', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId: req.businessId,
        type: 'SHOPIFY'
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
      shopName: integration.credentials?.shopName,
      shopDomain: integration.credentials?.shopDomain,
      lastSync: integration.lastSync
    });

  } catch (error) {
    console.error('❌ Shopify status error:', error);
    res.status(500).json({
      error: 'Failed to get status'
    });
  }
});

// ============================================================================
// ORDER ENDPOINTS
// ============================================================================

/**
 * GET /api/shopify/orders
 * Get recent orders
 */
router.get('/orders', async (req, res) => {
  try {
    const { limit, status } = req.query;

    const result = await shopifyService.getOrders(req.businessId, {
      limit: parseInt(limit) || 50,
      status: status || 'any'
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json(result);

  } catch (error) {
    console.error('❌ Shopify get orders error:', error);
    res.status(500).json({
      error: 'Failed to get orders'
    });
  }
});

/**
 * GET /api/shopify/orders/:orderNumber
 * Get order by order number
 */
router.get('/orders/:orderNumber', async (req, res) => {
  try {
    const { orderNumber } = req.params;

    const result = await shopifyService.getOrderByNumber(req.businessId, orderNumber);

    if (!result.success) {
      return res.status(404).json({
        error: result.message || 'Order not found'
      });
    }

    res.json(result);

  } catch (error) {
    console.error('❌ Shopify get order error:', error);
    res.status(500).json({
      error: 'Failed to get order'
    });
  }
});

/**
 * GET /api/shopify/orders/search/phone/:phone
 * Search order by phone number
 */
router.get('/orders/search/phone/:phone', async (req, res) => {
  try {
    const { phone } = req.params;

    const result = await shopifyService.getOrderByPhone(req.businessId, phone);

    if (!result.success) {
      return res.status(404).json({
        error: result.message || 'Order not found'
      });
    }

    res.json(result);

  } catch (error) {
    console.error('❌ Shopify search order error:', error);
    res.status(500).json({
      error: 'Failed to search order'
    });
  }
});

/**
 * GET /api/shopify/orders/search/email/:email
 * Search order by email
 */
router.get('/orders/search/email/:email', async (req, res) => {
  try {
    const { email } = req.params;

    const result = await shopifyService.getOrderByEmail(req.businessId, email);

    if (!result.success) {
      return res.status(404).json({
        error: result.message || 'Order not found'
      });
    }

    res.json(result);

  } catch (error) {
    console.error('❌ Shopify search order error:', error);
    res.status(500).json({
      error: 'Failed to search order'
    });
  }
});

// ============================================================================
// PRODUCT ENDPOINTS
// ============================================================================

/**
 * GET /api/shopify/products
 * Get products
 */
router.get('/products', async (req, res) => {
  try {
    const { limit, title } = req.query;

    if (title) {
      const result = await shopifyService.getProductByTitle(req.businessId, title);
      return res.json(result);
    }

    const result = await shopifyService.getProducts(req.businessId, {
      limit: parseInt(limit) || 50
    });

    res.json(result);

  } catch (error) {
    console.error('❌ Shopify get products error:', error);
    res.status(500).json({
      error: 'Failed to get products'
    });
  }
});

/**
 * GET /api/shopify/products/:productId/stock
 * Get product stock
 */
router.get('/products/:productId/stock', async (req, res) => {
  try {
    const { productId } = req.params;

    const result = await shopifyService.getProductStock(req.businessId, productId);

    if (!result.success) {
      return res.status(404).json({
        error: result.message || 'Product not found'
      });
    }

    res.json(result);

  } catch (error) {
    console.error('❌ Shopify get stock error:', error);
    res.status(500).json({
      error: 'Failed to get stock'
    });
  }
});

export default router;
