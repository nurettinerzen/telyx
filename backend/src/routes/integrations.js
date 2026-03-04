import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission, requireOwner } from '../middleware/permissions.js';
import googleCalendarService from '../services/google-calendar.js';
import hubspotService from '../services/hubspot.js';
import googleSheetsService from '../services/google-sheets.js';
import whatsappService from '../services/whatsapp.js';
import { getFilteredIntegrations, getIntegrationPriority } from '../config/integrationMetadata.js';
import { generateOAuthState, validateOAuthState } from '../middleware/oauthState.js';
import { safeRedirect } from '../middleware/redirectWhitelist.js';
import { decryptTokenValue } from '../utils/encryption.js';
import { encryptGoogleTokenCredentials, decryptGoogleTokenCredentials } from '../utils/google-oauth-tokens.js';
import { revokeGoogleOAuthToken } from '../utils/google-oauth-revoke.js';
import axios from 'axios';

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticateToken);

/* ============================================================
   GET ALL INTEGRATIONS
============================================================ */
router.get('/', async (req, res) => {
  try {
    const business = await prisma.business.findUnique({
      where: { id: req.businessId },
      include: {
        erpIntegration: true,
        reservationIntegration: true,
        bookingIntegration: true
      }
    });

    res.json({
      erp: business.erpIntegration,
      reservation: business.reservationIntegration,
      booking: business.bookingIntegration
    });

  } catch (error) {
    console.error('Get integrations error:', error);
    res.status(500).json({ error: 'Failed to fetch integrations' });
  }
});

/* ============================================================
   GET AVAILABLE INTEGRATIONS (FILTERED BY BUSINESS TYPE)
============================================================ */
router.get('/available', async (req, res) => {
  try {
    // Get business type and country
    const business = await prisma.business.findUnique({
      where: { id: req.businessId },
      select: {
        businessType: true,
        country: true,
        whatsappPhoneNumberId: true
      }
    });

    const businessType = business?.businessType || 'OTHER';
    const country = business?.country || 'TR'; // Default to TR for existing businesses

    // Get filtered integrations based on business type AND country/region
    const availableIntegrations = getFilteredIntegrations(businessType, country);

    // Get connected integrations from database
    const connectedIntegrations = await prisma.integration.findMany({
      where: { businessId: req.businessId },
      select: { type: true, connected: true, isActive: true }
    });

    // Create a map of connected integrations
    const connectedMap = {};
    connectedIntegrations.forEach(integration => {
      connectedMap[integration.type] = {
        connected: integration.connected,
        isActive: integration.isActive
      };
    });

    // Special handling for WhatsApp (stored directly in Business model)
    const whatsappConnected = !!business?.whatsappPhoneNumberId;
    connectedMap['WHATSAPP'] = {
      connected: whatsappConnected,
      isActive: whatsappConnected
    };

    // Merge available integrations with connection status
    const integrationsWithStatus = availableIntegrations.map(integration => ({
      ...integration,
      connected: connectedMap[integration.type]?.connected || false,
      isActive: connectedMap[integration.type]?.isActive || false
    }));

    res.json({
      businessType,
      integrations: integrationsWithStatus
    });

  } catch (error) {
    console.error('Get available integrations error:', error);
    res.status(500).json({ error: 'Failed to fetch available integrations' });
  }
});



/* ============================================================
   ERP INTEGRATION
============================================================ */

// Connect ERP (Owner only)
router.post('/erp/connect', requireOwner, async (req, res) => {
  try {
    const { type, apiEndpoint, apiKey, username, password, companyCode, realtimeMode } = req.body;

    if (!type) return res.status(400).json({ error: 'ERP type is required' });

    const integration = await prisma.erpIntegration.upsert({
      where: { businessId: req.businessId },
      update: {
        type,
        apiEndpoint,
        apiKey,
        username,
        password,
        companyCode,
        realtimeMode: realtimeMode || false,
        isActive: true
      },
      create: {
        businessId: req.businessId,
        type,
        apiEndpoint,
        apiKey,
        username,
        password,
        companyCode,
        realtimeMode: realtimeMode || false,
        isActive: true
      }
    });

    res.json({
      success: true,
      message: 'ERP integration connected successfully',
      integration
    });

  } catch (error) {
    console.error('Connect ERP error:', error);
    res.status(500).json({ error: 'Failed to connect ERP' });
  }
});

// Disconnect ERP (Owner only)
router.post('/erp/disconnect', requireOwner, async (req, res) => {
  try {
    await prisma.erpIntegration.update({
      where: { businessId: req.businessId },
      data: { isActive: false }
    });

    res.json({ success: true, message: 'ERP disconnected' });

  } catch (error) {
    console.error('Disconnect ERP error:', error);
    res.status(500).json({ error: 'Failed to disconnect ERP' });
  }
});

// Sync ERP
router.post('/erp/sync', async (req, res) => {
  try {
    const integration = await prisma.erpIntegration.findUnique({
      where: { businessId: req.businessId }
    });

    if (!integration || !integration.isActive)
      return res.status(400).json({ error: 'No active ERP integration' });

    // TODO: Implement actual sync logic
    await prisma.erpIntegration.update({
      where: { businessId: req.businessId },
      data: { lastSync: new Date() }
    });

    res.json({
      success: true,
      message: 'Sync completed',
      lastSync: new Date()
    });

  } catch (error) {
    console.error('Sync ERP error:', error);
    res.status(500).json({ error: 'Failed to sync' });
  }
});



/* ============================================================
   RESERVATION INTEGRATION (OpenTable)
============================================================ */

// Connect reservation platform
router.post('/reservation/connect', async (req, res) => {
  try {
    const { platform, apiKey, apiSecret, restaurantId } = req.body;

    if (!platform)
      return res.status(400).json({ error: 'Platform is required' });

    const integration = await prisma.reservationIntegration.upsert({
      where: { businessId: req.businessId },
      update: {
        platform,
        apiKey,
        apiSecret,
        restaurantId,
        isActive: true
      },
      create: {
        businessId: req.businessId,
        platform,
        apiKey,
        apiSecret,
        restaurantId,
        isActive: true
      }
    });

    res.json({
      success: true,
      message: 'Reservation platform connected',
      integration
    });

  } catch (error) {
    console.error('Connect reservation error:', error);
    res.status(500).json({ error: 'Failed to connect reservation platform' });
  }
});

/* ============================================================
   GOOGLE CALENDAR INTEGRATION (OAuth)
============================================================ */

router.get('/google-calendar/auth', async (req, res) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${process.env.BACKEND_URL}/api/integrations/google-calendar/callback`;

    // SECURITY: Generate cryptographically secure state token with PKCE (CSRF + code injection protection)
    const { state, pkce } = await generateOAuthState(req.businessId, 'google-calendar', {}, true);

    const oauth2Client = googleCalendarService.createOAuth2Client(clientId, clientSecret, redirectUri);
    const authUrl = googleCalendarService.getAuthUrl(oauth2Client, pkce.challenge);

    res.json({ authUrl: authUrl + `&state=${state}` });
  } catch (error) {
    console.error('Google Calendar auth error:', error);
    res.status(500).json({ error: 'Failed to start Google Calendar OAuth' });
  }
});

router.get('/google-calendar/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      console.error('Google Calendar callback: missing code or state');
      return safeRedirect(res, '/dashboard/integrations?error=google-calendar-invalid');
    }

    // SECURITY: Validate state token (CSRF protection)
    const validation = await validateOAuthState(state, null, 'google-calendar');

    if (!validation.valid) {
      console.error('❌ Google Calendar callback: Invalid state:', validation.error);
      return safeRedirect(res, '/dashboard/integrations?error=google-calendar-csrf');
    }

    const businessId = validation.businessId;
    const codeVerifier = validation.metadata?.codeVerifier;

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${process.env.BACKEND_URL}/api/integrations/google-calendar/callback`;

    const oauth2Client = googleCalendarService.createOAuth2Client(clientId, clientSecret, redirectUri);
    // SECURITY: Use PKCE verifier to exchange code for tokens
    const tokens = await googleCalendarService.getTokens(oauth2Client, code, codeVerifier);
    let mergedTokens = { ...tokens };

    if (!mergedTokens.refresh_token) {
      try {
        const existingIntegration = await prisma.integration.findUnique({
          where: {
            businessId_type: {
              businessId,
              type: 'GOOGLE_CALENDAR'
            }
          }
        });
        if (existingIntegration?.credentials) {
          const { credentials: existingCredentials } = decryptGoogleTokenCredentials(existingIntegration.credentials);
          if (existingCredentials.refresh_token) {
            mergedTokens = {
              ...mergedTokens,
              refresh_token: existingCredentials.refresh_token
            };
          }
        }
      } catch (mergeError) {
        console.warn(`Google Calendar refresh token merge skipped for business ${businessId}:`, mergeError.message);
      }
    }

    const encryptedTokens = encryptGoogleTokenCredentials(mergedTokens);

    await prisma.integration.upsert({
      where: {
        businessId_type: {
          businessId,
          type: 'GOOGLE_CALENDAR'
        }
      },
      update: {
        credentials: encryptedTokens,
        connected: true
      },
      create: {
        businessId,
        type: 'GOOGLE_CALENDAR',
        credentials: encryptedTokens,
        connected: true
      }
    });

    console.log(`✅ Google Calendar connected for business ${businessId}`);
    safeRedirect(res, '/dashboard/integrations?success=google-calendar');
  } catch (error) {
    console.error('❌ Google Calendar callback error:', error);
    safeRedirect(res, '/dashboard/integrations?error=google-calendar');
  }
});

/* ============================================================
   GOOGLE CALENDAR - TEST & DISCONNECT
============================================================ */

router.post('/google-calendar/test', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId: req.businessId,
        type: 'GOOGLE_CALENDAR'
      }
    });

    if (!integration || !integration.connected) {
      return res.status(404).json({ success: false, error: 'Google Calendar not connected' });
    }

    // Test by listing calendars
    const {
      credentials,
      needsMigration
    } = decryptGoogleTokenCredentials(integration.credentials);

    if (needsMigration) {
      await prisma.integration.update({
        where: {
          id: integration.id,
          businessId: req.businessId // Tenant isolation - defense in depth
        },
        data: {
          credentials: encryptGoogleTokenCredentials(credentials)
        }
      });
    }

    const calendars = await googleCalendarService.listCalendars(
      credentials.access_token,
      credentials.refresh_token,
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    res.json({ 
      success: true, 
      message: 'Google Calendar bağlantısı aktif',
      calendarsCount: calendars?.length || 0
    });
  } catch (error) {
    console.error('Google Calendar test error:', error);
    res.status(500).json({ success: false, error: 'Test failed - token may be expired' });
  }
});

router.post('/google-calendar/disconnect', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId: req.businessId,
        type: 'GOOGLE_CALENDAR'
      }
    });

    if (integration) {
      try {
        const { credentials } = decryptGoogleTokenCredentials(integration.credentials);
        const revokeToken = credentials.refresh_token || credentials.access_token;
        await revokeGoogleOAuthToken(revokeToken);
      } catch (revokeError) {
        console.warn(`Google Calendar revoke skipped for business ${req.businessId}:`, revokeError.message);
      }
    }

    await prisma.integration.updateMany({
      where: {
        businessId: req.businessId,
        type: 'GOOGLE_CALENDAR'
      },
      data: {
        connected: false,
        isActive: false,
        credentials: {}
      }
    });

    res.json({ success: true, message: 'Google Calendar disconnected' });
  } catch (error) {
    console.error('Google Calendar disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

/* ============================================================
   GOOGLE SHEETS - TEST & DISCONNECT
============================================================ */

router.post('/google-sheets/test', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId: req.businessId,
        type: 'GOOGLE_SHEETS'
      }
    });

    if (!integration || !integration.connected) {
      return res.status(404).json({ success: false, error: 'Google Sheets not connected' });
    }

    // Test by checking token validity
    const credentials = integration.credentials;
    
    // Simple test - if we have tokens, connection is valid
    if (credentials.access_token) {
      res.json({ 
        success: true, 
        message: 'Google Sheets bağlantısı aktif'
      });
    } else {
      res.status(400).json({ success: false, error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Google Sheets test error:', error);
    res.status(500).json({ success: false, error: 'Test failed' });
  }
});

router.post('/google-sheets/disconnect', async (req, res) => {
  try {
    const business = await prisma.business.findUnique({
      where: { id: req.businessId },
      select: {
        googleSheetsAccessToken: true,
        googleSheetsRefreshToken: true
      }
    });

    try {
      const refreshToken = decryptTokenValue(business?.googleSheetsRefreshToken, { allowPlaintext: true });
      const accessToken = decryptTokenValue(business?.googleSheetsAccessToken, { allowPlaintext: true });
      await revokeGoogleOAuthToken(refreshToken || accessToken);
    } catch (revokeError) {
      console.warn(`Google Sheets revoke skipped for business ${req.businessId}:`, revokeError.message);
    }

    await prisma.business.update({
      where: { id: req.businessId },
      data: {
        googleSheetsAccessToken: null,
        googleSheetsRefreshToken: null,
        googleSheetsTokenExpiry: null,
        googleSheetsConnected: false,
        googleSheetId: null,
        googleSheetName: null,
        googleSheetLastSync: null
      }
    });

    await prisma.integration.updateMany({
      where: {
        businessId: req.businessId,
        type: 'GOOGLE_SHEETS'
      },
      data: {
        connected: false,
        isActive: false,
        credentials: {}
      }
    });

    res.json({ success: true, message: 'Google Sheets disconnected' });
  } catch (error) {
    console.error('Google Sheets disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

/* ============================================================
   HUBSPOT INTEGRATION (OAuth)
============================================================ */

router.get('/hubspot/auth', async (req, res) => {
  try {
    const clientId = process.env.HUBSPOT_CLIENT_ID;
    const redirectUri = `${process.env.BACKEND_URL}/api/integrations/hubspot/callback`;
    const scopes = ['crm.objects.contacts.write', 'crm.objects.deals.write'];

    // SECURITY: Generate cryptographically secure state token with PKCE (CSRF + code injection protection)
    const { state, pkce } = await generateOAuthState(req.businessId, 'hubspot', {}, true);

    const authUrl = hubspotService.getAuthUrl(clientId, redirectUri, scopes, state, pkce.challenge);
    res.json({ authUrl });
  } catch (error) {
    console.error('HubSpot auth error:', error);
    res.status(500).json({ error: 'Failed to start HubSpot OAuth' });
  }
});

router.get('/hubspot/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      console.error('HubSpot callback: missing code or state');
      return safeRedirect(res, '/dashboard/integrations?error=hubspot-invalid');
    }

    // SECURITY: Validate state token (CSRF protection)
    const validation = await validateOAuthState(state, null, 'hubspot');

    if (!validation.valid) {
      console.error('❌ HubSpot callback: Invalid state:', validation.error);
      return safeRedirect(res, '/dashboard/integrations?error=hubspot-csrf');
    }

    const businessId = validation.businessId;
    const codeVerifier = validation.metadata?.codeVerifier;

    const clientId = process.env.HUBSPOT_CLIENT_ID;
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
    const redirectUri = `${process.env.BACKEND_URL}/api/integrations/hubspot/callback`;

    // SECURITY: Use PKCE verifier to exchange code for tokens
    const tokens = await hubspotService.getAccessToken(code, clientId, clientSecret, redirectUri, codeVerifier);

    await prisma.integration.upsert({
      where: {
        businessId_type: {
          businessId,
          type: 'HUBSPOT'
        }
      },
      update: {
        credentials: tokens,
        connected: true
      },
      create: {
        businessId,
        type: 'HUBSPOT',
        credentials: tokens,
        connected: true
      }
    });

    console.log(`✅ HubSpot connected for business ${businessId}`);
    safeRedirect(res, '/dashboard/integrations?success=hubspot');
  } catch (error) {
    console.error('❌ HubSpot callback error:', error);
    safeRedirect(res, '/dashboard/integrations?error=hubspot');
  }
});

/* ============================================================
   GOOGLE SHEETS INTEGRATION (OAuth)
============================================================ */

router.get('/google-sheets/auth', async (req, res) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${process.env.BACKEND_URL}/api/integrations/google-sheets/callback`;

    // SECURITY: Generate cryptographically secure state token (CSRF protection)
    const state = await generateOAuthState(req.businessId, 'google-sheets');

    const oauth2Client = googleSheetsService.createOAuth2Client(clientId, clientSecret, redirectUri);
    const authUrl = googleSheetsService.getAuthUrl(oauth2Client);

    res.json({ authUrl: authUrl + `&state=${state}` });
  } catch (error) {
    console.error('Google Sheets auth error:', error);
    res.status(500).json({ error: 'Failed to start Google Sheets OAuth' });
  }
});

router.get('/google-sheets/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      console.error('Google Sheets callback: missing code or state');
      return safeRedirect(res, '/dashboard/integrations?error=google-sheets-invalid');
    }

    // SECURITY: Validate state token (CSRF protection)
    const validation = await validateOAuthState(state, null, 'google-sheets');

    if (!validation.valid) {
      console.error('❌ Google Sheets callback: Invalid state:', validation.error);
      return safeRedirect(res, '/dashboard/integrations?error=google-sheets-csrf');
    }

    const businessId = validation.businessId;

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${process.env.BACKEND_URL}/api/integrations/google-sheets/callback`;

    const oauth2Client = googleSheetsService.createOAuth2Client(clientId, clientSecret, redirectUri);
    const tokens = await googleSheetsService.getTokens(oauth2Client, code);

    await prisma.integration.upsert({
      where: {
        businessId_type: {
          businessId,
          type: 'GOOGLE_SHEETS'
        }
      },
      update: {
        credentials: tokens,
        connected: true
      },
      create: {
        businessId,
        type: 'GOOGLE_SHEETS',
        credentials: tokens,
        connected: true
      }
    });

    console.log(`✅ Google Sheets connected for business ${businessId}`);
    safeRedirect(res, '/dashboard/integrations?success=google-sheets');
  } catch (error) {
    console.error('❌ Google Sheets callback error:', error);
    safeRedirect(res, '/dashboard/integrations?error=google-sheets');
  }
});

/* ============================================================
   WHATSAPP BUSINESS INTEGRATION - MULTI-TENANT
============================================================ */

router.post('/whatsapp/connect', requireOwner, async (req, res) => {
  try {
    const { accessToken, phoneNumberId, verifyToken } = req.body;

    // Validate required fields
    if (!accessToken || !phoneNumberId || !verifyToken) {
      return res.status(400).json({
        error: 'Access token, phone number ID, and verify token are required'
      });
    }

    console.log('Validating with Meta:', {
      phoneNumberId,
      tokenLength: accessToken?.length,
      hasVerifyToken: Boolean(verifyToken),
    });

    // Validate access token with Meta API
    try {
      const metaResponse = await axios.get(
        `https://graph.facebook.com/v18.0/${phoneNumberId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (!metaResponse.data || !metaResponse.data.id) {
        return res.status(401).json({
          error: 'Invalid access token or phone number ID'
        });
      }
    } catch (metaError) {
      console.error('Meta API validation error:', metaError.response?.data || metaError.message || metaError);
      return res.status(400).json({
        error: 'Failed to validate credentials with Meta. Please check your access token and phone number ID.',
        details: metaError.response?.data?.error?.message
      });
    }

    // Encrypt the access token before storage
    const { encrypt } = await import('../utils/encryption.js');
    const encryptedAccessToken = encrypt(accessToken);

    // Generate webhook URL for this business
    const webhookUrl = `${process.env.BACKEND_URL}/api/whatsapp/webhook`;

    // Store in Business model for direct access
    await prisma.business.update({
      where: { id: req.businessId },
      data: {
        whatsappPhoneNumberId: phoneNumberId,
        whatsappAccessToken: encryptedAccessToken,
        whatsappVerifyToken: verifyToken,
        whatsappWebhookUrl: webhookUrl
      }
    });

    // Also store in Integration model for consistency
    await prisma.integration.upsert({
      where: {
        businessId_type: {
          businessId: req.businessId,
          type: 'WHATSAPP'
        }
      },
      update: {
        credentials: {
          phoneNumberId,
          verifyToken,
          webhookUrl
        },
        connected: true,
        isActive: true
      },
      create: {
        businessId: req.businessId,
        type: 'WHATSAPP',
        credentials: {
          phoneNumberId,
          verifyToken,
          webhookUrl
        },
        connected: true,
        isActive: true
      }
    });

    res.json({
      success: true,
      message: 'WhatsApp connected successfully',
      webhookUrl,
      phoneNumberId
    });
  } catch (error) {
    console.error('WhatsApp connect error:', error);
    res.status(500).json({ error: 'Failed to connect WhatsApp' });
  }
});

router.post('/whatsapp/disconnect', requireOwner, async (req, res) => {
  try {
    // Remove from Business model
    await prisma.business.update({
      where: { id: req.businessId },
      data: {
        whatsappPhoneNumberId: null,
        whatsappAccessToken: null,
        whatsappVerifyToken: null,
        whatsappWebhookUrl: null
      }
    });

    // Mark as disconnected in Integration model
    await prisma.integration.updateMany({
      where: {
        businessId: req.businessId,
        type: 'WHATSAPP'
      },
      data: {
        connected: false,
        isActive: false
      }
    });

    res.json({
      success: true,
      message: 'WhatsApp disconnected successfully'
    });
  } catch (error) {
    console.error('WhatsApp disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect WhatsApp' });
  }
});

router.get('/whatsapp/status', async (req, res) => {
  try {
    const business = await prisma.business.findUnique({
      where: { id: req.businessId },
      select: {
        whatsappPhoneNumberId: true,
        whatsappWebhookUrl: true
      }
    });

    const isConnected = !!business?.whatsappPhoneNumberId;

    res.json({
      connected: isConnected,
      phoneNumberId: business?.whatsappPhoneNumberId || null,
      webhookUrl: business?.whatsappWebhookUrl || null
    });
  } catch (error) {
    console.error('WhatsApp status error:', error);
    res.status(500).json({ error: 'Failed to get WhatsApp status' });
  }
});

router.post('/whatsapp/send', async (req, res) => {
  try {
    const { recipientPhone, message } = req.body;

    if (!recipientPhone || !message) {
      return res.status(400).json({
        error: 'Recipient phone and message are required'
      });
    }

    const business = await prisma.business.findUnique({
      where: { id: req.businessId },
      select: {
        whatsappPhoneNumberId: true,
        whatsappAccessToken: true
      }
    });

    if (!business?.whatsappPhoneNumberId || !business?.whatsappAccessToken) {
      return res.status(404).json({ error: 'WhatsApp not connected' });
    }

    // Decrypt access token
    const { decrypt } = await import('../utils/encryption.js');
    const accessToken = decrypt(business.whatsappAccessToken);

    // Send message via WhatsApp service
    const result = await whatsappService.sendMessage(
      accessToken,
      business.whatsappPhoneNumberId,
      recipientPhone,
      message
    );

    res.json({ success: true, result });
  } catch (error) {
    console.error('WhatsApp send error:', error);
    res.status(500).json({ error: 'Failed to send WhatsApp message' });
  }
});

/* ============================================================
   SHOPIFY INTEGRATION
============================================================ */

router.post('/shopify/connect', requireOwner, async (req, res) => {
  try {
    const { shopUrl, accessToken } = req.body;

    if (!shopUrl || !accessToken) {
      return res.status(400).json({
        error: 'Shop URL and Access Token are required'
      });
    }

    // Import and test connection
    const shopifyService = (await import('../services/shopify.js')).default;

    try {
      const testResult = await shopifyService.testConnection({ shopUrl, accessToken });

      if (!testResult.success) {
        return res.status(400).json({
          error: testResult.error || 'Connection test failed'
        });
      }

      // Save to Integration model
      await prisma.integration.upsert({
        where: {
          businessId_type: {
            businessId: req.businessId,
            type: 'SHOPIFY'
          }
        },
        update: {
          credentials: { shopUrl, accessToken },
          connected: true,
          isActive: true
        },
        create: {
          businessId: req.businessId,
          type: 'SHOPIFY',
          credentials: { shopUrl, accessToken },
          connected: true,
          isActive: true
        }
      });

      res.json({
        success: true,
        message: 'Shopify connected successfully',
        shop: testResult.shop
      });
    } catch (testError) {
      console.error('Shopify test error:', testError);
      return res.status(400).json({
        error: testError.message || 'Failed to connect to Shopify'
      });
    }
  } catch (error) {
    console.error('Shopify connect error:', error);
    res.status(500).json({ error: 'Failed to connect Shopify' });
  }
});

router.post('/shopify/disconnect', requireOwner, async (req, res) => {
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

    res.json({
      success: true,
      message: 'Shopify disconnected successfully'
    });
  } catch (error) {
    console.error('Shopify disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect Shopify' });
  }
});

router.get('/shopify/status', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId: req.businessId,
        type: 'SHOPIFY'
      },
      select: {
        connected: true,
        isActive: true,
        lastSync: true,
        credentials: true
      }
    });

    res.json({
      connected: integration?.connected && integration?.isActive || false,
      shopUrl: integration?.credentials?.shopUrl || null,
      lastSync: integration?.lastSync || null
    });
  } catch (error) {
    console.error('Shopify status error:', error);
    res.status(500).json({ error: 'Failed to get Shopify status' });
  }
});

/* ============================================================
   WOOCOMMERCE INTEGRATION
============================================================ */

router.post('/woocommerce/connect', requireOwner, async (req, res) => {
  try {
    const { siteUrl, consumerKey, consumerSecret } = req.body;

    if (!siteUrl || !consumerKey || !consumerSecret) {
      return res.status(400).json({
        error: 'Site URL, Consumer Key, and Consumer Secret are required'
      });
    }

    // Import and test connection
    const woocommerceService = (await import('../services/woocommerce.js')).default;

    try {
      const testResult = await woocommerceService.testConnection({ siteUrl, consumerKey, consumerSecret });

      if (!testResult.success) {
        return res.status(400).json({
          error: testResult.error || 'Connection test failed'
        });
      }

      // Save to Integration model
      await prisma.integration.upsert({
        where: {
          businessId_type: {
            businessId: req.businessId,
            type: 'WOOCOMMERCE'
          }
        },
        update: {
          credentials: { siteUrl, consumerKey, consumerSecret },
          connected: true,
          isActive: true
        },
        create: {
          businessId: req.businessId,
          type: 'WOOCOMMERCE',
          credentials: { siteUrl, consumerKey, consumerSecret },
          connected: true,
          isActive: true
        }
      });

      res.json({
        success: true,
        message: 'WooCommerce connected successfully',
        store: testResult.store
      });
    } catch (testError) {
      console.error('WooCommerce test error:', testError);
      return res.status(400).json({
        error: testError.message || 'Failed to connect to WooCommerce'
      });
    }
  } catch (error) {
    console.error('WooCommerce connect error:', error);
    res.status(500).json({ error: 'Failed to connect WooCommerce' });
  }
});

router.post('/woocommerce/disconnect', requireOwner, async (req, res) => {
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

    res.json({
      success: true,
      message: 'WooCommerce disconnected successfully'
    });
  } catch (error) {
    console.error('WooCommerce disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect WooCommerce' });
  }
});

router.get('/woocommerce/status', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId: req.businessId,
        type: 'WOOCOMMERCE'
      },
      select: {
        connected: true,
        isActive: true,
        lastSync: true,
        credentials: true
      }
    });

    res.json({
      connected: integration?.connected && integration?.isActive || false,
      siteUrl: integration?.credentials?.siteUrl || null,
      lastSync: integration?.lastSync || null
    });
  } catch (error) {
    console.error('WooCommerce status error:', error);
    res.status(500).json({ error: 'Failed to get WooCommerce status' });
  }
});

/* ============================================================
   GENERIC INTEGRATION STATUS
============================================================ */

router.get('/status', async (req, res) => {
  try {
    const integrations = await prisma.integration.findMany({
      where: { businessId: req.businessId },
      select: {
        type: true,
        connected: true,
        isActive: true,
        lastSync: true
      }
    });

    // Also check WhatsApp from Business model
    const business = await prisma.business.findUnique({
      where: { id: req.businessId },
      select: { whatsappPhoneNumberId: true }
    });

    const statusMap = {};
    integrations.forEach(i => {
      statusMap[i.type] = {
        connected: i.connected && i.isActive,
        lastSync: i.lastSync
      };
    });

    // Add WhatsApp status
    statusMap['WHATSAPP'] = {
      connected: !!business?.whatsappPhoneNumberId,
      lastSync: null
    };

    res.json({
      integrations: statusMap,
      ecommerce: {
        hasShopify: statusMap['SHOPIFY']?.connected || false,
        hasWooCommerce: statusMap['WOOCOMMERCE']?.connected || false,
        hasPlatform: (statusMap['SHOPIFY']?.connected || statusMap['WOOCOMMERCE']?.connected) || false
      }
    });
  } catch (error) {
    console.error('Integration status error:', error);
    res.status(500).json({ error: 'Failed to get integration status' });
  }
});

/* ============================================================
   ZAPIER WEBHOOK CONFIGURATION
============================================================ */

router.post('/zapier/connect', async (req, res) => {
  try {
    const { webhookUrl } = req.body;

    if (!webhookUrl) {
      return res.status(400).json({ error: 'Webhook URL is required' });
    }

    await prisma.integration.upsert({
      where: {
        businessId_type: {
          businessId: req.businessId,
          type: 'ZAPIER'
        }
      },
      update: {
        credentials: { webhookUrl },
        connected: true
      },
      create: {
        businessId: req.businessId,
        type: 'ZAPIER',
        credentials: { webhookUrl },
        connected: true
      }
    });

    res.json({ success: true, message: 'Zapier webhook configured' });
  } catch (error) {
    console.error('Zapier connect error:', error);
    res.status(500).json({ error: 'Failed to configure Zapier' });
  }
});

/* ============================================================
   NETGSM SMS INTEGRATION (API Key)
============================================================ */

router.post('/netgsm/connect', requireOwner, async (req, res) => {
  try {
    const { username, password, header } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: 'Kullanıcı adı ve şifre gerekli'
      });
    }

    // Test connection with NetGSM credit check
    try {
      const testResponse = await axios.get(
        `https://api.netgsm.com.tr/balance/list/get?usercode=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
      );

      // NetGSM returns error codes as text
      const responseText = testResponse.data.toString();
      if (responseText.startsWith('30') || responseText.startsWith('40') || responseText.startsWith('70')) {
        return res.status(400).json({
          error: 'Geçersiz NetGSM bilgileri',
          code: responseText
        });
      }
    } catch (testError) {
      return res.status(400).json({
        error: 'NetGSM bağlantı testi başarısız'
      });
    }

    // Save credentials
    await prisma.integration.upsert({
      where: {
        businessId_type: { businessId: req.businessId, type: 'NETGSM_SMS' }
      },
      update: {
        credentials: { username, password, header: header || '' },
        connected: true,
        isActive: true
      },
      create: {
        businessId: req.businessId,
        type: 'NETGSM_SMS',
        credentials: { username, password, header: header || '' },
        connected: true,
        isActive: true
      }
    });

    console.log(`✅ NetGSM connected for business ${req.businessId}`);
    res.json({ success: true, message: 'NetGSM bağlandı' });
  } catch (error) {
    console.error('NetGSM connect error:', error);
    res.status(500).json({ error: 'NetGSM bağlantısı başarısız' });
  }
});

router.post('/netgsm/disconnect', requireOwner, async (req, res) => {
  try {
    await prisma.integration.updateMany({
      where: {
        businessId: req.businessId,
        type: 'NETGSM_SMS'
      },
      data: {
        connected: false,
        isActive: false
      }
    });

    res.json({ success: true, message: 'NetGSM bağlantısı kesildi' });
  } catch (error) {
    console.error('NetGSM disconnect error:', error);
    res.status(500).json({ error: 'Bağlantı kesilemedi' });
  }
});

router.get('/netgsm/status', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId: req.businessId,
        type: 'NETGSM_SMS'
      }
    });

    if (!integration) {
      return res.json({ connected: false });
    }

    res.json({
      connected: integration.connected,
      isActive: integration.isActive,
      header: integration.credentials?.header || null
    });
  } catch (error) {
    console.error('NetGSM status error:', error);
    res.status(500).json({ error: 'Durum alınamadı' });
  }
});

router.post('/netgsm/send', async (req, res) => {
  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ error: 'Telefon ve mesaj gerekli' });
    }

    const integration = await prisma.integration.findFirst({
      where: {
        businessId: req.businessId,
        type: 'NETGSM_SMS',
        isActive: true
      }
    });

    if (!integration) {
      return res.status(404).json({ error: 'NetGSM bağlantısı bulunamadı' });
    }

    const { username, password, header } = integration.credentials;

    // Send SMS via NetGSM
    const response = await axios.get(
      `https://api.netgsm.com.tr/sms/send/get?usercode=${encodeURIComponent(username)}` +
      `&password=${encodeURIComponent(password)}` +
      `&gsmno=${encodeURIComponent(phone)}` +
      `&message=${encodeURIComponent(message)}` +
      `&msgheader=${encodeURIComponent(header || 'TELYX')}`
    );

    const responseText = response.data.toString();

    // Check for success (00 or 01 prefix means success)
    if (responseText.startsWith('00') || responseText.startsWith('01')) {
      res.json({ success: true, messageId: responseText });
    } else {
      res.status(400).json({
        success: false,
        error: 'SMS gönderilemedi',
        code: responseText
      });
    }
  } catch (error) {
    console.error('NetGSM send error:', error);
    res.status(500).json({ error: 'SMS gönderme hatası' });
  }
});

/* ============================================================
   IKAS E-COMMERCE INTEGRATION
============================================================ */

router.post('/ikas/connect', checkPermission('integrations:connect'), async (req, res) => {
  try {
    const { storeName, clientId, clientSecret } = req.body;

    if (!storeName || !clientId || !clientSecret) {
      return res.status(400).json({
        error: 'Store Name, Client ID ve Client Secret gerekli'
      });
    }

    // Import and test connection
    const IkasService = (await import('../services/integrations/ecommerce/ikas.service.js')).default;
    const ikasService = new IkasService();

    try {
      const testResult = await ikasService.testConnection({ storeName, clientId, clientSecret });

      if (!testResult.success) {
        return res.status(400).json({
          error: testResult.message || 'Bağlantı testi başarısız'
        });
      }

      // Save to Integration model
      await prisma.integration.upsert({
        where: {
          businessId_type: {
            businessId: req.businessId,
            type: 'IKAS'
          }
        },
        update: {
          credentials: { storeName, clientId, clientSecret },
          connected: true,
          isActive: true
        },
        create: {
          businessId: req.businessId,
          type: 'IKAS',
          credentials: { storeName, clientId, clientSecret },
          connected: true,
          isActive: true
        }
      });

      console.log(`✅ ikas connected for business ${req.businessId}`);
      res.json({
        success: true,
        message: 'ikas bağlantısı başarılı',
        storeName
      });
    } catch (testError) {
      console.error('ikas test error:', testError);
      return res.status(400).json({
        error: testError.message || 'ikas bağlantısı başarısız'
      });
    }
  } catch (error) {
    console.error('ikas connect error:', error);
    res.status(500).json({ error: 'ikas bağlantısı başarısız' });
  }
});

router.post('/ikas/disconnect', checkPermission('integrations:connect'), async (req, res) => {
  try {
    await prisma.integration.updateMany({
      where: {
        businessId: req.businessId,
        type: 'IKAS'
      },
      data: {
        connected: false,
        isActive: false
      }
    });

    res.json({
      success: true,
      message: 'ikas bağlantısı kesildi'
    });
  } catch (error) {
    console.error('ikas disconnect error:', error);
    res.status(500).json({ error: 'Bağlantı kesilemedi' });
  }
});

router.get('/ikas/status', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId: req.businessId,
        type: 'IKAS'
      },
      select: {
        connected: true,
        isActive: true,
        lastSync: true,
        credentials: true
      }
    });

    res.json({
      connected: integration?.connected && integration?.isActive || false,
      storeName: integration?.credentials?.storeName || null,
      lastSync: integration?.lastSync || null
    });
  } catch (error) {
    console.error('ikas status error:', error);
    res.status(500).json({ error: 'Durum alınamadı' });
  }
});

router.post('/ikas/test', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId: req.businessId,
        type: 'IKAS'
      }
    });

    if (!integration || !integration.connected) {
      return res.status(404).json({ success: false, error: 'ikas bağlı değil' });
    }

    const IkasService = (await import('../services/integrations/ecommerce/ikas.service.js')).default;
    const ikasService = new IkasService(integration.credentials);
    const testResult = await ikasService.testConnection(integration.credentials);

    if (testResult.success) {
      res.json({ success: true, message: 'ikas bağlantısı aktif' });
    } else {
      res.status(400).json({ success: false, error: testResult.message });
    }
  } catch (error) {
    console.error('ikas test error:', error);
    res.status(500).json({ success: false, error: 'Test başarısız' });
  }
});

// =============================================
// İDEASOFT OAuth FLOW (Yeni - Minimal UX için)
// =============================================

// Adım 1: OAuth başlat - kullanıcıyı İdeasoft'a yönlendir
router.post('/ideasoft/auth', authenticateToken, async (req, res) => {
  try {
    const { storeUrl, clientId, clientSecret } = req.body;
    
    if (!storeUrl || !clientId || !clientSecret) {
      return res.status(400).json({ error: 'Store URL, Client ID and Client Secret required' });
    }
    
    // Store URL'i normalize et
    let normalizedUrl = storeUrl.trim();
    if (!normalizedUrl.startsWith('http')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    normalizedUrl = normalizedUrl.replace(/\/$/, '');
    
    // State token oluştur (CSRF koruması)
    const state = require('crypto').randomBytes(32).toString('hex');
    
    // Geçici olarak credentials'ı sakla (5 dakika TTL)
    global.ideasoftPendingAuth = global.ideasoftPendingAuth || {};
    global.ideasoftPendingAuth[state] = {
      businessId: req.businessId,
      storeUrl: normalizedUrl,
      clientId,
      clientSecret,
      createdAt: Date.now()
    };
    
    // 5 dakika sonra temizle
    setTimeout(() => {
      if (global.ideasoftPendingAuth) {
        delete global.ideasoftPendingAuth[state];
      }
    }, 5 * 60 * 1000);
    
    // Callback URL
    const redirectUri = process.env.BACKEND_URL + '/api/integrations/ideasoft/callback';

    // İdeasoft authorization URL
    const authUrl = `${normalizedUrl}/oauth/authorize?` + new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state: state
    }).toString();
    
    console.log('🔗 İdeasoft OAuth URL generated:', authUrl);
    res.json({ authUrl });
    
  } catch (error) {
    console.error('İdeasoft auth error:', error);
    res.status(500).json({ error: 'Failed to initiate İdeasoft auth' });
  }
});

// Adım 2: OAuth callback - İdeasoft'tan code al, token'a çevir
router.get('/ideasoft/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;
    
    const frontendUrl = process.env.FRONTEND_URL;
    
    if (oauthError) {
      console.error('İdeasoft OAuth denied:', oauthError);
      return res.redirect(`${frontendUrl}/dashboard/integrations?error=ideasoft_denied`);
    }
    
    if (!code || !state) {
      return res.redirect(`${frontendUrl}/dashboard/integrations?error=ideasoft_invalid`);
    }
    
    // State'i doğrula
    const pending = global.ideasoftPendingAuth?.[state];
    if (!pending) {
      return res.redirect(`${frontendUrl}/dashboard/integrations?error=ideasoft_expired`);
    }
    
    const { businessId, storeUrl, clientId, clientSecret } = pending;
    delete global.ideasoftPendingAuth[state];
    
    // Code'u token'a çevir
    const redirectUri = process.env.BACKEND_URL + '/api/integrations/ideasoft/callback';
    
    console.log('🔄 Exchanging code for token...');
    
    const tokenResponse = await axios.post(`${storeUrl}/oauth/token`, 
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );
    
    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    
    console.log('✅ İdeasoft token received');
    
    // Integration kaydet
    const credentials = {
      storeDomain: storeUrl,
      clientId,
      clientSecret,
      accessToken: access_token,
      refreshToken: refresh_token || null,
      tokenExpiresAt: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null
    };
    
    await prisma.integration.upsert({
      where: {
        businessId_type: {
          businessId: businessId,
          type: 'IDEASOFT'
        }
      },
      update: {
        credentials: credentials,
        connected: true,
        isActive: true,
        updatedAt: new Date()
      },
      create: {
        businessId: businessId,
        type: 'IDEASOFT',
        credentials: credentials,
        connected: true,
        isActive: true
      }
    });
    
    console.log(`✅ İdeasoft connected for business ${businessId}`);
    res.redirect(`${frontendUrl}/dashboard/integrations?success=ideasoft`);
    
  } catch (error) {
    console.error('İdeasoft callback error:', error.response?.data || error.message);
    const frontendUrl = process.env.FRONTEND_URL;
    res.redirect(`${frontendUrl}/dashboard/integrations?error=ideasoft_token_failed`);
  }
});

/* ============================================================
   IDEASOFT E-COMMERCE INTEGRATION
============================================================ */

router.post('/ideasoft/connect', checkPermission('integrations:connect'), async (req, res) => {
  try {
    const { storeDomain, clientId, clientSecret } = req.body;

    if (!storeDomain || !clientId || !clientSecret) {
      return res.status(400).json({
        error: 'Store Domain, Client ID ve Client Secret gerekli'
      });
    }

    // Import and test connection
    const IdeasoftService = (await import('../services/integrations/ecommerce/ideasoft.service.js')).default;
    const ideasoftService = new IdeasoftService();

    try {
      const testResult = await ideasoftService.testConnection({ storeDomain, clientId, clientSecret });

      if (!testResult.success) {
        return res.status(400).json({
          error: testResult.message || 'Bağlantı testi başarısız'
        });
      }

      // Save to Integration model
      await prisma.integration.upsert({
        where: {
          businessId_type: {
            businessId: req.businessId,
            type: 'IDEASOFT'
          }
        },
        update: {
          credentials: { storeDomain, clientId, clientSecret },
          connected: true,
          isActive: true
        },
        create: {
          businessId: req.businessId,
          type: 'IDEASOFT',
          credentials: { storeDomain, clientId, clientSecret },
          connected: true,
          isActive: true
        }
      });

      console.log(`✅ Ideasoft connected for business ${req.businessId}`);
      res.json({
        success: true,
        message: 'Ideasoft bağlantısı başarılı',
        storeDomain
      });
    } catch (testError) {
      console.error('Ideasoft test error:', testError);
      return res.status(400).json({
        error: testError.message || 'Ideasoft bağlantısı başarısız'
      });
    }
  } catch (error) {
    console.error('Ideasoft connect error:', error);
    res.status(500).json({ error: 'Ideasoft bağlantısı başarısız' });
  }
});

router.post('/ideasoft/disconnect', checkPermission('integrations:connect'), async (req, res) => {
  try {
    await prisma.integration.updateMany({
      where: {
        businessId: req.businessId,
        type: 'IDEASOFT'
      },
      data: {
        connected: false,
        isActive: false
      }
    });

    res.json({
      success: true,
      message: 'Ideasoft bağlantısı kesildi'
    });
  } catch (error) {
    console.error('Ideasoft disconnect error:', error);
    res.status(500).json({ error: 'Bağlantı kesilemedi' });
  }
});

router.get('/ideasoft/status', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId: req.businessId,
        type: 'IDEASOFT'
      },
      select: {
        connected: true,
        isActive: true,
        lastSync: true,
        credentials: true
      }
    });

    res.json({
      connected: integration?.connected && integration?.isActive || false,
      storeDomain: integration?.credentials?.storeDomain || null,
      lastSync: integration?.lastSync || null
    });
  } catch (error) {
    console.error('Ideasoft status error:', error);
    res.status(500).json({ error: 'Durum alınamadı' });
  }
});

router.post('/ideasoft/test', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId: req.businessId,
        type: 'IDEASOFT'
      }
    });

    if (!integration || !integration.connected) {
      return res.status(404).json({ success: false, error: 'Ideasoft bağlı değil' });
    }

    const IdeasoftService = (await import('../services/integrations/ecommerce/ideasoft.service.js')).default;
    const ideasoftService = new IdeasoftService(integration.credentials);
    const testResult = await ideasoftService.testConnection(integration.credentials);

    if (testResult.success) {
      res.json({ success: true, message: 'Ideasoft bağlantısı aktif' });
    } else {
      res.status(400).json({ success: false, error: testResult.message });
    }
  } catch (error) {
    console.error('Ideasoft test error:', error);
    res.status(500).json({ success: false, error: 'Test başarısız' });
  }
});

/* ============================================================
   TICIMAX E-COMMERCE INTEGRATION
============================================================ */

router.post('/ticimax/connect', checkPermission('integrations:connect'), async (req, res) => {
  try {
    const { siteUrl, uyeKodu } = req.body;

    if (!siteUrl || !uyeKodu) {
      return res.status(400).json({
        error: 'Site URL ve Yetki Kodu (API Key) gerekli'
      });
    }

    // Import and test connection
    const TicimaxService = (await import('../services/integrations/ecommerce/ticimax.service.js')).default;
    const ticimaxService = new TicimaxService();

    try {
      const testResult = await ticimaxService.testConnection({ siteUrl, uyeKodu });

      if (!testResult.success) {
        return res.status(400).json({
          error: testResult.message || 'Bağlantı testi başarısız'
        });
      }

      // Save to Integration model
      await prisma.integration.upsert({
        where: {
          businessId_type: {
            businessId: req.businessId,
            type: 'TICIMAX'
          }
        },
        update: {
          credentials: { siteUrl, uyeKodu },
          connected: true,
          isActive: true
        },
        create: {
          businessId: req.businessId,
          type: 'TICIMAX',
          credentials: { siteUrl, uyeKodu },
          connected: true,
          isActive: true
        }
      });

      console.log(`✅ Ticimax connected for business ${req.businessId}`);
      res.json({
        success: true,
        message: 'Ticimax bağlantısı başarılı',
        siteUrl
      });
    } catch (testError) {
      console.error('Ticimax test error:', testError);
      return res.status(400).json({
        error: testError.message || 'Ticimax bağlantısı başarısız'
      });
    }
  } catch (error) {
    console.error('Ticimax connect error:', error);
    res.status(500).json({ error: 'Ticimax bağlantısı başarısız' });
  }
});

router.post('/ticimax/disconnect', checkPermission('integrations:connect'), async (req, res) => {
  try {
    await prisma.integration.updateMany({
      where: {
        businessId: req.businessId,
        type: 'TICIMAX'
      },
      data: {
        connected: false,
        isActive: false
      }
    });

    res.json({
      success: true,
      message: 'Ticimax bağlantısı kesildi'
    });
  } catch (error) {
    console.error('Ticimax disconnect error:', error);
    res.status(500).json({ error: 'Bağlantı kesilemedi' });
  }
});

router.get('/ticimax/status', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId: req.businessId,
        type: 'TICIMAX'
      },
      select: {
        connected: true,
        isActive: true,
        lastSync: true,
        credentials: true
      }
    });

    res.json({
      connected: integration?.connected && integration?.isActive || false,
      siteUrl: integration?.credentials?.siteUrl || null,
      lastSync: integration?.lastSync || null
    });
  } catch (error) {
    console.error('Ticimax status error:', error);
    res.status(500).json({ error: 'Durum alınamadı' });
  }
});

router.post('/ticimax/test', async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId: req.businessId,
        type: 'TICIMAX'
      }
    });

    if (!integration || !integration.connected) {
      return res.status(404).json({ success: false, error: 'Ticimax bağlı değil' });
    }

    const TicimaxService = (await import('../services/integrations/ecommerce/ticimax.service.js')).default;
    const ticimaxService = new TicimaxService(integration.credentials);
    const testResult = await ticimaxService.testConnection(integration.credentials);

    if (testResult.success) {
      res.json({ success: true, message: 'Ticimax bağlantısı aktif' });
    } else {
      res.status(400).json({ success: false, error: testResult.message });
    }
  } catch (error) {
    console.error('Ticimax test error:', error);
    res.status(500).json({ success: false, error: 'Test başarısız' });
  }
});

export default router;
