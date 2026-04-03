import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission, requireOwner } from '../middleware/permissions.js';
import googleCalendarService from '../services/google-calendar.js';
import hubspotService from '../services/hubspot.js';
import whatsappService from '../services/whatsapp.js';
import { getFilteredIntegrations, getIntegrationPriority } from '../config/integrationMetadata.js';
import { generateOAuthState, validateOAuthState } from '../middleware/oauthState.js';
import { safeRedirect } from '../middleware/redirectWhitelist.js';
import { decryptTokenValue, decryptPossiblyEncryptedValue, encryptTokenValue, generateSecureToken } from '../utils/encryption.js';
import { encryptGoogleTokenCredentials, decryptGoogleTokenCredentials } from '../utils/google-oauth-tokens.js';
import { revokeGoogleOAuthToken } from '../utils/google-oauth-revoke.js';
import {
  DEFAULT_QA_SETTINGS,
  buildMarketplaceCredentials,
  encryptMarketplaceCredentials,
  maskCredentialValue,
  normalizeQaSettings,
  safeDecryptMarketplaceCredentials,
} from '../services/marketplace/qaShared.js';
import {
  DEFAULT_SIKAYETVAR_SETTINGS,
  buildSikayetvarCredentials,
  buildSikayetvarStatusResponse,
  encryptSikayetvarCredentials,
  normalizeSikayetvarSettings,
} from '../services/complaints/sikayetvarShared.js';
import {
  buildWhatsAppConnectionCredentials,
  buildWhatsAppRefreshFailureCredentials,
  buildWhatsAppStatusResponse,
  debugAccessToken,
  exchangeCodeForAccessToken,
  fetchWhatsAppBusinessAccount,
  fetchAccessibleWhatsAppAssets,
  fetchWhatsAppPhoneNumber,
  getMetaConnectionStatusFromError,
  getWhatsAppPartnerAccessToken,
  getWhatsAppEmbeddedSignupConfig,
  isEmbeddedSignupFinishEvent,
  normalizeEmbeddedSignupEventPayload,
  subscribeAppToWhatsAppBusinessAccount,
} from '../services/whatsapp-embedded-signup.js';
import axios from 'axios';

const router = express.Router();
const WHATSAPP_EMBEDDED_SIGNUP_SESSION_TTL_MS = 15 * 60 * 1000;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getWhatsAppManualFallbackEnabled() {
  return process.env.WHATSAPP_MANUAL_FALLBACK_ENABLED === 'true';
}

function getWebhookVerifyToken(existingVerifyToken = null) {
  return (
    existingVerifyToken ||
    process.env.WHATSAPP_VERIFY_TOKEN ||
    process.env.META_VERIFY_TOKEN ||
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
    generateSecureToken(24)
  );
}

function getWhatsAppWebhookUrl() {
  return `${process.env.BACKEND_URL}/api/whatsapp/webhook`;
}

function getWhatsAppEmbeddedSignupRedirectUri() {
  const frontendUrl = String(process.env.FRONTEND_URL || '').replace(/\/+$/, '');
  if (!frontendUrl) {
    return null;
  }

  return `${frontendUrl}/auth/meta/whatsapp-callback`;
}

function normalizeRedirectUri(redirectUri) {
  if (!redirectUri || typeof redirectUri !== 'string') {
    return null;
  }

  try {
    const parsed = new URL(redirectUri);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }

    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function getIntegrationCredentials(integration) {
  if (!integration || !isPlainObject(integration.credentials)) {
    return {};
  }

  return integration.credentials;
}

function buildWhatsAppTestSendState({
  existing = {},
  messageId = null,
  recipientPhone = null,
  connectedNumber = null,
  phoneNumberId = null,
  wabaId = null,
  deliveryMode = 'text',
  templateInfo = null,
}) {
  const nowIso = new Date().toISOString();

  return {
    ...(isPlainObject(existing) ? existing : {}),
    messageId,
    recipientPhone,
    connectedNumber,
    phoneNumberId,
    wabaId,
    deliveryMode,
    templateInfo,
    status: 'accepted',
    acceptedAt: nowIso,
    lastStatusAt: nowIso,
    lastError: null,
  };
}

function appendEmbeddedSignupTelemetry(sessionInfo, entry) {
  const normalizedInfo = isPlainObject(sessionInfo) ? sessionInfo : {};
  const existingTelemetry = Array.isArray(normalizedInfo.telemetry) ? normalizedInfo.telemetry : [];

  return {
    ...normalizedInfo,
    telemetry: [
      ...existingTelemetry.slice(-24),
      {
        at: new Date().toISOString(),
        ...entry,
      },
    ],
  };
}

router.use(authenticateToken);

function buildMarketplaceIntegrationPayload({
  existingCredentials = {},
  incomingCredentials = {},
  fallbackLanguage = 'tr',
  identifierField,
}) {
  const normalizedIncoming = buildMarketplaceCredentials(incomingCredentials, fallbackLanguage);
  const normalizedExisting = buildMarketplaceCredentials(existingCredentials, fallbackLanguage);
  const qaSettings = normalizeQaSettings(
    normalizedIncoming.qaSettings || normalizedExisting.qaSettings || DEFAULT_QA_SETTINGS,
    fallbackLanguage
  );

  return encryptMarketplaceCredentials({
    ...normalizedExisting,
    ...normalizedIncoming,
    [identifierField]: normalizedIncoming[identifierField] || normalizedExisting[identifierField],
    qaSettings,
  }, fallbackLanguage);
}

function buildMarketplaceStatusResponse(integration, identifierField) {
  const rawCredentials = getIntegrationCredentials(integration);
  const credentials = safeDecryptMarketplaceCredentials(rawCredentials);

  return {
    connected: Boolean(integration?.connected && integration?.isActive),
    [identifierField]: credentials?.[identifierField] || rawCredentials?.[identifierField] || null,
    qaSettings: credentials?.qaSettings || DEFAULT_QA_SETTINGS,
    lastSync: integration?.lastSync || null,
    maskedApiKey: maskCredentialValue(
      typeof credentials?.apiKey === 'string' ? credentials.apiKey : rawCredentials?.apiKey
    ),
    hasSecret: Boolean(credentials?.apiSecret || rawCredentials?.apiSecret),
  };
}

function buildSikayetvarIntegrationPayload({
  existingCredentials = {},
  incomingCredentials = {},
  fallbackLanguage = 'tr',
}) {
  const normalizedIncoming = buildSikayetvarCredentials(incomingCredentials, fallbackLanguage);
  const normalizedExisting = buildSikayetvarCredentials(existingCredentials, fallbackLanguage);
  const complaintSettings = normalizeSikayetvarSettings(
    normalizedIncoming.complaintSettings || normalizedExisting.complaintSettings || DEFAULT_SIKAYETVAR_SETTINGS,
    fallbackLanguage
  );

  return encryptSikayetvarCredentials({
    ...normalizedExisting,
    ...normalizedIncoming,
    complaintSettings,
  }, fallbackLanguage);
}

async function findIntegrationStatusRecord(prismaClient, businessId, type) {
  const records = await prismaClient.integration.findMany({
    where: { businessId },
    select: {
      type: true,
      connected: true,
      isActive: true,
      lastSync: true,
      credentials: true,
    },
  });

  return records.find((record) => String(record.type) === type) || null;
}

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
        whatsappPhoneNumberId: true,
        whatsappWebhookUrl: true
      }
    });

    const businessType = business?.businessType || 'OTHER';
    const country = business?.country || 'TR'; // Default to TR for existing businesses

    // Get filtered integrations based on business type AND country/region
    const availableIntegrations = getFilteredIntegrations(businessType, country);

    // Get connected integrations from database
    const connectedIntegrations = await prisma.integration.findMany({
      where: { businessId: req.businessId },
      select: { type: true, connected: true, isActive: true, credentials: true }
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
    const whatsappIntegration = connectedIntegrations.find((integration) => integration.type === 'WHATSAPP') || null;
    const whatsappStatus = buildWhatsAppStatusResponse({
      business,
      integration: whatsappIntegration,
      manualFallbackEnabled: getWhatsAppManualFallbackEnabled(),
    });
    connectedMap['WHATSAPP'] = {
      connected: whatsappStatus.connected,
      isActive: whatsappStatus.connected
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
   WHATSAPP BUSINESS INTEGRATION - MULTI-TENANT
============================================================ */

async function handleLegacyWhatsAppManualConnect(req, res) {
  try {
    const { accessToken, phoneNumberId, verifyToken } = req.body;
    let metaResponse = null;

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
      metaResponse = await axios.get(
        `https://graph.facebook.com/v18.0/${phoneNumberId}`,
        {
          params: {
            fields: 'id,display_phone_number',
          },
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

    const existingIntegration = await prisma.integration.findUnique({
      where: {
        businessId_type: {
          businessId: req.businessId,
          type: 'WHATSAPP'
        }
      }
    });

    const existingCredentials = getIntegrationCredentials(existingIntegration);
    const encryptedAccessToken = encryptTokenValue(accessToken);
    const webhookUrl = getWhatsAppWebhookUrl();
    const nowIso = new Date().toISOString();
    const manualCredentials = {
      ...existingCredentials,
      tenantId: req.businessId,
      phoneNumberId,
      displayPhoneNumber: metaResponse.data?.display_phone_number || existingCredentials.displayPhoneNumber || null,
      webhookUrl,
      connectionStatus: 'CONNECTED',
      onboardingMethod: 'MANUAL',
      tokenMetadata: {
        ...(isPlainObject(existingCredentials.tokenMetadata) ? existingCredentials.tokenMetadata : {}),
        lastValidatedAt: nowIso,
      },
      lastError: null,
      lastConnectedAt: nowIso,
      updatedAt: nowIso,
    };

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
        credentials: manualCredentials,
        connected: true,
        isActive: true
      },
      create: {
        businessId: req.businessId,
        type: 'WHATSAPP',
        credentials: manualCredentials,
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
}

router.post('/whatsapp/connect', requireOwner, async (req, res) => {
  if (!getWhatsAppManualFallbackEnabled()) {
    return res.status(404).json({ error: 'Manual WhatsApp connection is disabled.' });
  }

  return handleLegacyWhatsAppManualConnect(req, res);
});

router.post('/whatsapp/connect/manual', requireOwner, async (req, res) => {
  if (!getWhatsAppManualFallbackEnabled()) {
    return res.status(404).json({ error: 'Manual WhatsApp connection is disabled.' });
  }

  return handleLegacyWhatsAppManualConnect(req, res);
});

router.post('/whatsapp/embedded-signup/session', requireOwner, async (req, res) => {
  try {
    const { appId, configId, graphApiVersion } = getWhatsAppEmbeddedSignupConfig();
    const requestedRedirectUri = normalizeRedirectUri(req.body?.redirectUri);
    const redirectUri = requestedRedirectUri || getWhatsAppEmbeddedSignupRedirectUri();
    const expiresAt = new Date(Date.now() + WHATSAPP_EMBEDDED_SIGNUP_SESSION_TTL_MS);

    const session = await prisma.whatsappEmbeddedSignupSession.create({
      data: {
        businessId: req.businessId,
        userId: req.userId,
        configId,
        expiresAt,
        status: 'PENDING',
        sessionInfo: {
          source: 'dashboard-integrations',
          initiatedAt: new Date().toISOString(),
          initiatedByRole: req.userRole,
          redirectUri,
        },
      }
    });

    res.json({
      success: true,
      sessionId: session.id,
      configId,
      appId,
      graphApiVersion,
      redirectUri,
      expiresAt: session.expiresAt,
      manualFallbackEnabled: getWhatsAppManualFallbackEnabled(),
    });
  } catch (error) {
    console.error('WhatsApp Embedded Signup session error:', error);
    res.status(500).json({
      error: error.message || 'Failed to start WhatsApp Embedded Signup',
    });
  }
});

router.post('/whatsapp/embedded-signup/cancel', requireOwner, async (req, res) => {
  try {
    const { sessionId, reason, currentStep, eventPayload } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const session = await prisma.whatsappEmbeddedSignupSession.findFirst({
      where: {
        id: sessionId,
        businessId: req.businessId,
        userId: req.userId,
      }
    });

    if (!session) {
      return res.status(404).json({ error: 'Embedded Signup session not found' });
    }

    if (session.status !== 'PENDING' && session.status !== 'PROCESSING') {
      return res.json({ success: true, status: session.status });
    }

    await prisma.whatsappEmbeddedSignupSession.update({
      where: { id: session.id },
      data: {
        status: 'CANCELLED',
        errorCode: reason || 'USER_CANCELLED',
        errorMessage: currentStep ? `User cancelled at ${currentStep}` : 'User cancelled WhatsApp Embedded Signup',
        sessionInfo: {
          ...(isPlainObject(session.sessionInfo) ? session.sessionInfo : {}),
          cancelledAt: new Date().toISOString(),
          currentStep: currentStep || null,
          cancelPayload: eventPayload || null,
        },
      }
    });

    res.json({ success: true, status: 'CANCELLED' });
  } catch (error) {
    console.error('WhatsApp Embedded Signup cancel error:', error);
    res.status(500).json({ error: 'Failed to cancel WhatsApp Embedded Signup session' });
  }
});

router.post('/whatsapp/embedded-signup/telemetry', requireOwner, async (req, res) => {
  try {
    const { sessionId, stage, details } = req.body;

    if (!sessionId || !stage) {
      return res.status(400).json({ error: 'Session ID and telemetry stage are required' });
    }

    const session = await prisma.whatsappEmbeddedSignupSession.findFirst({
      where: {
        id: sessionId,
        businessId: req.businessId,
        userId: req.userId,
      }
    });

    if (!session) {
      return res.status(404).json({ error: 'Embedded Signup session not found' });
    }

    await prisma.whatsappEmbeddedSignupSession.update({
      where: { id: session.id },
      data: {
        sessionInfo: appendEmbeddedSignupTelemetry(session.sessionInfo, {
          stage: String(stage),
          details: isPlainObject(details) || Array.isArray(details) ? details : { value: details ?? null },
        }),
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('WhatsApp Embedded Signup telemetry error:', error);
    res.status(500).json({ error: 'Failed to record WhatsApp Embedded Signup telemetry' });
  }
});

router.post('/whatsapp/embedded-signup/complete', requireOwner, async (req, res) => {
  let session = null;

  try {
    const { sessionId, code, eventPayload } = req.body;

    if (!sessionId || (!code && !eventPayload)) {
      return res.status(400).json({
        error: 'Session ID and either authorization code or Embedded Signup payload are required'
      });
    }

    session = await prisma.whatsappEmbeddedSignupSession.findFirst({
      where: {
        id: sessionId,
        businessId: req.businessId,
        userId: req.userId,
      }
    });

    if (!session) {
      return res.status(404).json({ error: 'Embedded Signup session not found' });
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await prisma.whatsappEmbeddedSignupSession.update({
        where: { id: session.id },
        data: {
          status: 'EXPIRED',
          errorCode: 'SESSION_EXPIRED',
          errorMessage: 'Embedded Signup session expired before completion',
        }
      });

      return res.status(410).json({ error: 'Embedded Signup session expired. Please try again.' });
    }

    if (session.status === 'COMPLETED') {
      const [business, integration] = await Promise.all([
        prisma.business.findUnique({
          where: { id: req.businessId },
          select: {
            whatsappPhoneNumberId: true,
            whatsappWebhookUrl: true,
          }
        }),
        prisma.integration.findUnique({
          where: {
            businessId_type: {
              businessId: req.businessId,
              type: 'WHATSAPP'
            }
          }
        }),
      ]);

      return res.json({
        success: true,
        connection: buildWhatsAppStatusResponse({
          business,
          integration,
          manualFallbackEnabled: getWhatsAppManualFallbackEnabled(),
        }),
      });
    }

    if (session.status !== 'PENDING' && session.status !== 'PROCESSING') {
      return res.status(409).json({ error: `Embedded Signup session is ${session.status.toLowerCase()}` });
    }

    const normalizedEvent = normalizeEmbeddedSignupEventPayload(eventPayload);

    if (eventPayload && !isEmbeddedSignupFinishEvent(normalizedEvent.event)) {
      return res.status(400).json({ error: 'Embedded Signup did not complete successfully' });
    }

    await prisma.whatsappEmbeddedSignupSession.update({
      where: { id: session.id },
      data: {
        status: 'PROCESSING',
        errorCode: null,
        errorMessage: null,
        sessionInfo: {
          ...(isPlainObject(session.sessionInfo) ? session.sessionInfo : {}),
          processingAt: new Date().toISOString(),
          completionPayload: eventPayload,
        },
      }
    });

    const [business, existingIntegration] = await Promise.all([
      prisma.business.findUnique({
        where: { id: req.businessId },
        select: {
          whatsappVerifyToken: true,
        }
      }),
      prisma.integration.findUnique({
        where: {
          businessId_type: {
            businessId: req.businessId,
            type: 'WHATSAPP'
          }
        }
      }),
    ]);

    const redirectUri = (isPlainObject(session.sessionInfo) ? session.sessionInfo.redirectUri : null) || getWhatsAppEmbeddedSignupRedirectUri();
    let tokenExchange = null;
    let accessToken = null;
    let tokenSource = 'EMBEDDED_SIGNUP_CODE_EXCHANGE';

    if (code) {
      tokenExchange = await exchangeCodeForAccessToken(code, redirectUri);
      accessToken = tokenExchange?.access_token || null;
    }

    if (!accessToken) {
      accessToken = getWhatsAppPartnerAccessToken();
      tokenSource = 'PARTNER_SYSTEM_USER';
    }

    if (!accessToken) {
      throw new Error('Meta completed the signup flow, but no authorization code or partner system-user access token was available to finish the connection.');
    }

    let effectiveEvent = normalizedEvent;

    if (!effectiveEvent.wabaId || !effectiveEvent.phoneNumberId) {
      const accessibleAssets = await fetchAccessibleWhatsAppAssets(accessToken);
      const dedupedAssets = Array.from(
        new Map(
          accessibleAssets.map((asset) => [`${asset.metaBusinessId || 'unknown'}:${asset.wabaId}:${asset.phoneNumberId}`, asset])
        ).values()
      );

      let matchedAsset = null;

      if (effectiveEvent.metaBusinessId) {
        const businessMatches = dedupedAssets.filter((asset) => asset.metaBusinessId === effectiveEvent.metaBusinessId);
        if (businessMatches.length === 1) {
          matchedAsset = businessMatches[0];
        }
      }

      if (!matchedAsset && dedupedAssets.length === 1) {
        matchedAsset = dedupedAssets[0];
      }

      if (!matchedAsset) {
        throw new Error('Meta completed onboarding, but Telyx could not determine which WhatsApp assets were selected. Please try again.');
      }

      effectiveEvent = {
        ...effectiveEvent,
        event: effectiveEvent.event || 'FINISH',
        metaBusinessId: effectiveEvent.metaBusinessId || matchedAsset.metaBusinessId || null,
        wabaId: effectiveEvent.wabaId || matchedAsset.wabaId,
        phoneNumberId: effectiveEvent.phoneNumberId || matchedAsset.phoneNumberId,
        displayPhoneNumber: effectiveEvent.displayPhoneNumber || matchedAsset.displayPhoneNumber || null,
      };
    }

    if (!effectiveEvent.wabaId || !effectiveEvent.phoneNumberId) {
      throw new Error('Embedded Signup did not return the required WhatsApp asset IDs.');
    }

    const [tokenDebugData, phoneNumberData, wabaData] = await Promise.all([
      debugAccessToken(accessToken),
      fetchWhatsAppPhoneNumber(effectiveEvent.phoneNumberId, accessToken),
      fetchWhatsAppBusinessAccount(effectiveEvent.wabaId, accessToken),
    ]);
    const webhookSubscription = await subscribeAppToWhatsAppBusinessAccount(
      effectiveEvent.wabaId,
      accessToken
    );

    const webhookUrl = getWhatsAppWebhookUrl();
    const verifyToken = getWebhookVerifyToken(business?.whatsappVerifyToken);
    const connectionCredentialsBase = buildWhatsAppConnectionCredentials({
      businessId: req.businessId,
      configId: session.configId,
      webhookUrl,
      existingCredentials: getIntegrationCredentials(existingIntegration),
      normalizedEvent: effectiveEvent,
      tokenExchange: tokenExchange || {},
      tokenDebugData,
      phoneNumberData,
      wabaData,
      tokenSource,
    });
    const connectionCredentials = {
      ...connectionCredentialsBase,
      webhookSubscription: {
        status: webhookSubscription?.success ? 'SUBSCRIBED' : 'ERROR',
        alreadySubscribed: Boolean(webhookSubscription?.alreadySubscribed),
        lastSubscribedAt: new Date().toISOString(),
        lastError: webhookSubscription?.success
          ? null
          : {
            message: 'Failed to subscribe WhatsApp Business Account to Telyx webhooks.',
            updatedAt: new Date().toISOString(),
          },
      },
    };
    const encryptedAccessToken = tokenSource === 'PARTNER_SYSTEM_USER'
      ? null
      : encryptTokenValue(accessToken);
    const isConnected = connectionCredentials.connectionStatus === 'CONNECTED';

    await prisma.$transaction([
      prisma.business.update({
        where: { id: req.businessId },
        data: {
          whatsappPhoneNumberId: connectionCredentials.phoneNumberId,
          whatsappAccessToken: encryptedAccessToken,
          whatsappVerifyToken: verifyToken,
          whatsappWebhookUrl: webhookUrl,
        }
      }),
      prisma.integration.upsert({
        where: {
          businessId_type: {
            businessId: req.businessId,
            type: 'WHATSAPP'
          }
        },
        update: {
          credentials: connectionCredentials,
          connected: isConnected,
          isActive: isConnected,
        },
        create: {
          businessId: req.businessId,
          type: 'WHATSAPP',
          credentials: connectionCredentials,
          connected: isConnected,
          isActive: isConnected,
        }
      }),
      prisma.whatsappEmbeddedSignupSession.update({
        where: { id: session.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          errorCode: null,
          errorMessage: null,
          sessionInfo: {
            ...(isPlainObject(session.sessionInfo) ? session.sessionInfo : {}),
            completionPayload: eventPayload || null,
            completionResult: {
              wabaId: connectionCredentials.wabaId,
              phoneNumberId: connectionCredentials.phoneNumberId,
              metaBusinessId: connectionCredentials.metaBusinessId,
            },
            completedAt: new Date().toISOString(),
          },
        }
      }),
    ]);

    res.json({
      success: true,
      connection: buildWhatsAppStatusResponse({
        business: {
          whatsappPhoneNumberId: connectionCredentials.phoneNumberId,
          whatsappWebhookUrl: webhookUrl,
        },
        integration: {
          connected: isConnected,
          isActive: isConnected,
          credentials: connectionCredentials,
        },
        manualFallbackEnabled: getWhatsAppManualFallbackEnabled(),
      }),
    });
  } catch (error) {
    console.error('WhatsApp Embedded Signup completion error:', error.response?.data || error.message || error);

    if (session?.id) {
      await prisma.whatsappEmbeddedSignupSession.updateMany({
        where: { id: session.id },
        data: {
          status: 'ERROR',
          errorCode: String(error?.response?.data?.error?.code || 'EMBEDDED_SIGNUP_FAILED'),
          errorMessage: error?.response?.data?.error?.message || error.message || 'Failed to complete WhatsApp Embedded Signup',
          sessionInfo: {
            ...(isPlainObject(session.sessionInfo) ? session.sessionInfo : {}),
            failedAt: new Date().toISOString(),
          },
        }
      });
    }

    const mappedStatus = getMetaConnectionStatusFromError(error);
    const statusCode = error?.response?.status && error.response.status < 500 ? 400 : 500;

    return res.status(statusCode).json({
      error: mappedStatus === 'EXPIRED'
        ? 'WhatsApp authorization expired before the connection could be saved. Please reconnect.'
        : (error?.response?.data?.error?.message || error.message || 'Failed to complete WhatsApp Embedded Signup'),
    });
  }
});

router.post('/whatsapp/refresh', requireOwner, async (req, res) => {
  try {
    const [business, integration] = await Promise.all([
      prisma.business.findUnique({
        where: { id: req.businessId },
        select: {
          whatsappPhoneNumberId: true,
          whatsappAccessToken: true,
          whatsappWebhookUrl: true,
        }
      }),
      prisma.integration.findUnique({
        where: {
          businessId_type: {
            businessId: req.businessId,
            type: 'WHATSAPP'
          }
        }
      }),
    ]);

    if (!integration) {
      return res.status(404).json({ error: 'WhatsApp not connected' });
    }

    const existingCredentials = getIntegrationCredentials(integration);
    const phoneNumberId = existingCredentials.phoneNumberId || business?.whatsappPhoneNumberId || null;
    const accessToken = business?.whatsappAccessToken
      ? decryptPossiblyEncryptedValue(business.whatsappAccessToken, { allowPlaintext: true })
      : getWhatsAppPartnerAccessToken();

    if (!phoneNumberId || !accessToken) {
      return res.status(404).json({ error: 'WhatsApp not connected' });
    }

    try {
      const normalizedEvent = normalizeEmbeddedSignupEventPayload({
        event: 'FINISH',
        data: {
          business_id: existingCredentials.metaBusinessId,
          waba_id: existingCredentials.wabaId,
          phone_number_id: phoneNumberId,
          display_phone_number: existingCredentials.displayPhoneNumber,
        },
      });

      const [tokenDebugData, phoneNumberData, wabaData] = await Promise.all([
        debugAccessToken(accessToken),
        fetchWhatsAppPhoneNumber(normalizedEvent.phoneNumberId, accessToken),
        fetchWhatsAppBusinessAccount(normalizedEvent.wabaId, accessToken),
      ]);
      const webhookSubscription = await subscribeAppToWhatsAppBusinessAccount(
        normalizedEvent.wabaId,
        accessToken
      );

      const refreshedCredentialsBase = buildWhatsAppConnectionCredentials({
        businessId: req.businessId,
        configId: existingCredentials.configId || getWhatsAppEmbeddedSignupConfig().configId,
        webhookUrl: business.whatsappWebhookUrl || getWhatsAppWebhookUrl(),
        existingCredentials,
        normalizedEvent,
        tokenExchange: {},
        tokenDebugData,
        phoneNumberData,
        wabaData,
        tokenSource: business?.whatsappAccessToken ? 'EMBEDDED_SIGNUP_CODE_EXCHANGE' : 'PARTNER_SYSTEM_USER',
      });
      const refreshedCredentials = {
        ...refreshedCredentialsBase,
        webhookSubscription: {
          status: webhookSubscription?.success ? 'SUBSCRIBED' : 'ERROR',
          alreadySubscribed: Boolean(webhookSubscription?.alreadySubscribed),
          lastSubscribedAt: new Date().toISOString(),
          lastError: webhookSubscription?.success
            ? null
            : {
              message: 'Failed to subscribe WhatsApp Business Account to Telyx webhooks.',
              updatedAt: new Date().toISOString(),
            },
        },
      };
      const isConnected = refreshedCredentials.connectionStatus === 'CONNECTED';

      await prisma.integration.update({
        where: {
          businessId_type: {
            businessId: req.businessId,
            type: 'WHATSAPP'
          }
        },
        data: {
          credentials: refreshedCredentials,
          connected: isConnected,
          isActive: isConnected,
        }
      });

      return res.json({
        success: true,
        connection: buildWhatsAppStatusResponse({
          business: {
            whatsappPhoneNumberId: business.whatsappPhoneNumberId,
            whatsappWebhookUrl: business.whatsappWebhookUrl,
          },
          integration: {
            connected: isConnected,
            isActive: isConnected,
            credentials: refreshedCredentials,
          },
          manualFallbackEnabled: getWhatsAppManualFallbackEnabled(),
        }),
      });
    } catch (error) {
      const failedCredentials = buildWhatsAppRefreshFailureCredentials(
        existingCredentials,
        error,
        existingCredentials?.tokenMetadata?.expiresAt
      );

      await prisma.integration.update({
        where: {
          businessId_type: {
            businessId: req.businessId,
            type: 'WHATSAPP'
          }
        },
        data: {
          credentials: failedCredentials,
          connected: false,
          isActive: false,
        }
      });

      return res.json({
        success: false,
        error: failedCredentials?.lastError?.message || 'Failed to refresh WhatsApp connection',
        connection: buildWhatsAppStatusResponse({
          business: {
            whatsappPhoneNumberId: business.whatsappPhoneNumberId,
            whatsappWebhookUrl: business.whatsappWebhookUrl,
          },
          integration: {
            connected: false,
            isActive: false,
            credentials: failedCredentials,
          },
          manualFallbackEnabled: getWhatsAppManualFallbackEnabled(),
        }),
      });
    }
  } catch (error) {
    console.error('WhatsApp refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh WhatsApp connection' });
  }
});

router.post('/whatsapp/disconnect', requireOwner, async (req, res) => {
  try {
    const existingIntegration = await prisma.integration.findUnique({
      where: {
        businessId_type: {
          businessId: req.businessId,
          type: 'WHATSAPP'
        }
      }
    });
    const existingCredentials = getIntegrationCredentials(existingIntegration);

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

    if (existingIntegration) {
      await prisma.integration.update({
        where: {
          businessId_type: {
            businessId: req.businessId,
            type: 'WHATSAPP'
          }
        },
        data: {
          connected: false,
          isActive: false,
          credentials: {
            ...existingCredentials,
            connectionStatus: 'DISCONNECTED',
            lastError: null,
            disconnectedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        }
      });
    }

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
    const [business, integration] = await Promise.all([
      prisma.business.findUnique({
        where: { id: req.businessId },
        select: {
          whatsappPhoneNumberId: true,
          whatsappWebhookUrl: true
        }
      }),
      prisma.integration.findUnique({
        where: {
          businessId_type: {
            businessId: req.businessId,
            type: 'WHATSAPP'
          }
        }
      }),
    ]);

    res.json(buildWhatsAppStatusResponse({
      business,
      integration,
      manualFallbackEnabled: getWhatsAppManualFallbackEnabled(),
    }));
  } catch (error) {
    console.error('WhatsApp status error:', error);
    res.status(500).json({ error: 'Failed to get WhatsApp status' });
  }
});

router.post('/whatsapp/send', requireOwner, async (req, res) => {
  const requestId = `wa_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    const recipientPhone = String(req.body?.recipientPhone || '').trim();
    const message = String(req.body?.message || '').trim();

    if (!recipientPhone || !message) {
      return res.status(400).json({
        error: 'Recipient phone and message are required'
      });
    }

    if (message.length > 4096) {
      return res.status(400).json({
        error: 'Message is too long'
      });
    }

    const [business, integration] = await Promise.all([
      prisma.business.findUnique({
        where: { id: req.businessId },
        select: {
          whatsappPhoneNumberId: true,
          whatsappAccessToken: true
        }
      }),
      prisma.integration.findUnique({
        where: {
          businessId_type: {
            businessId: req.businessId,
            type: 'WHATSAPP'
          }
        },
        select: {
          id: true,
          credentials: true
        }
      })
    ]);

    if (!business?.whatsappPhoneNumberId) {
      return res.status(404).json({ error: 'WhatsApp not connected' });
    }

    const credentials = integration?.credentials && typeof integration.credentials === 'object'
      ? integration.credentials
      : {};

    const connectedNumber = credentials.displayPhoneNumber || null;
    const connectedWabaId = credentials.wabaId || null;

    // Prefer business-scoped token, fall back to partner/system-user token for embedded signup connections.
    const accessToken = business?.whatsappAccessToken
      ? decryptPossiblyEncryptedValue(business.whatsappAccessToken, { allowPlaintext: true })
      : getWhatsAppPartnerAccessToken();

    if (!accessToken) {
      return res.status(404).json({ error: 'WhatsApp access token not available' });
    }

    // The dashboard test endpoint must only attempt the exact text the user typed.
    // Silent template fallback makes the UI look successful while a different
    // payload is sent (or later fails delivery for template-specific reasons).
    console.log('[WhatsApp Test Send] Attempting send', {
      requestId,
      businessId: req.businessId,
      recipientPhone,
      phoneNumberId: business.whatsappPhoneNumberId,
      hasBusinessToken: Boolean(business?.whatsappAccessToken),
      usingPartnerToken: !business?.whatsappAccessToken,
    });

    const result = await whatsappService.sendMessage(
      accessToken,
      business.whatsappPhoneNumberId,
      recipientPhone,
      message,
      { timeoutMs: Number(process.env.WHATSAPP_TEST_SEND_TIMEOUT_MS || 15000) }
    );

    const deliveryMode = 'text';
    const templateInfo = null;

    const messageId = result?.messages?.[0]?.id || result?.messages?.[0]?.message_status || null;

    const nextTestSendState = buildWhatsAppTestSendState({
      existing: credentials.lastTestSend,
      messageId,
      recipientPhone,
      connectedNumber,
      phoneNumberId: business.whatsappPhoneNumberId,
      wabaId: connectedWabaId,
      deliveryMode,
      templateInfo,
    });

    if (integration?.id) {
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          credentials: {
            ...credentials,
            lastTestSend: nextTestSendState,
          },
          connected: true,
          isActive: true,
        }
      });
    }

    res.json({
      success: true,
      message: 'WhatsApp message accepted by Meta',
      requestId,
      result: {
        messageId,
        recipientPhone,
        connectedNumber,
        phoneNumberId: business.whatsappPhoneNumberId,
        wabaId: connectedWabaId,
        acceptedByMeta: true,
        deliveryMode,
        templateInfo,
        testMessageStatus: nextTestSendState,
        raw: result
      }
    });
  } catch (error) {
    const upstreamMessage = error?.response?.data?.error?.message || error?.message || 'Failed to send WhatsApp message';
    const isTimeout = error?.code === 'ECONNABORTED' || /timeout/i.test(String(error?.message || ''));
    const isNetworkError = ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN'].includes(String(error?.code || ''));
    const statusCode = isTimeout ? 504 : isNetworkError ? 502 : 500;

    console.error('[WhatsApp Test Send] Failed', {
      requestId,
      businessId: req.businessId,
      code: error?.code,
      status: error?.response?.status,
      message: upstreamMessage,
      response: error?.response?.data || null,
    });

    res.status(statusCode).json({
      error: upstreamMessage,
      requestId,
      category: isTimeout ? 'META_TIMEOUT' : isNetworkError ? 'META_NETWORK_ERROR' : 'META_SEND_ERROR',
    });
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

/* ============================================================
   MARKETPLACE Q&A INTEGRATIONS
============================================================ */

router.post('/trendyol/connect', checkPermission('integrations:connect'), async (req, res) => {
  try {
    const { sellerId, apiKey, apiSecret, qaSettings } = req.body;

    if (!sellerId || !apiKey || !apiSecret) {
      return res.status(400).json({
        error: 'sellerId, apiKey ve apiSecret gerekli'
      });
    }

    const business = await prisma.business.findUnique({
      where: { id: req.businessId },
      select: { language: true }
    });

    const TrendyolQaService = (await import('../services/integrations/marketplace/trendyol-qa.service.js')).default;
    const trendyolService = new TrendyolQaService();
    const testResult = await trendyolService.testConnection({ sellerId, apiKey, apiSecret, qaSettings });

    if (!testResult.success) {
      return res.status(400).json({
        error: testResult.message || 'Trendyol bağlantı testi başarısız'
      });
    }

    const existingIntegration = await prisma.integration.findUnique({
      where: {
        businessId_type: {
          businessId: req.businessId,
          type: 'TRENDYOL'
        }
      }
    });

    const credentials = buildMarketplaceIntegrationPayload({
      existingCredentials: existingIntegration?.credentials || {},
      incomingCredentials: { sellerId, apiKey, apiSecret, qaSettings },
      fallbackLanguage: business?.language || 'tr',
      identifierField: 'sellerId'
    });

    const integration = await prisma.integration.upsert({
      where: {
        businessId_type: {
          businessId: req.businessId,
          type: 'TRENDYOL'
        }
      },
      update: {
        credentials,
        connected: true,
        isActive: true,
        syncEnabled: true
      },
      create: {
        businessId: req.businessId,
        type: 'TRENDYOL',
        credentials,
        connected: true,
        isActive: true,
        syncEnabled: true
      }
    });

    res.json({
      success: true,
      message: 'Trendyol bağlantısı başarılı',
      status: buildMarketplaceStatusResponse(integration, 'sellerId')
    });
  } catch (error) {
    console.error('Trendyol connect error:', error);
    res.status(500).json({ error: error.message || 'Trendyol bağlantısı başarısız' });
  }
});

router.post('/trendyol/disconnect', checkPermission('integrations:connect'), async (req, res) => {
  try {
    await prisma.integration.updateMany({
      where: {
        businessId: req.businessId,
        type: 'TRENDYOL'
      },
      data: {
        connected: false,
        isActive: false
      }
    });

    res.json({
      success: true,
      message: 'Trendyol bağlantısı kesildi'
    });
  } catch (error) {
    console.error('Trendyol disconnect error:', error);
    res.status(500).json({ error: 'Trendyol bağlantısı kesilemedi' });
  }
});

router.get('/trendyol/status', async (req, res) => {
  try {
    const integration = await findIntegrationStatusRecord(prisma, req.businessId, 'TRENDYOL');

    res.json(buildMarketplaceStatusResponse(integration, 'sellerId'));
  } catch (error) {
    console.error('Trendyol status error:', error);
    res.json(buildMarketplaceStatusResponse(null, 'sellerId'));
  }
});

router.post('/trendyol/test', checkPermission('integrations:connect'), async (req, res) => {
  try {
    const TrendyolQaService = (await import('../services/integrations/marketplace/trendyol-qa.service.js')).default;
    const trendyolService = new TrendyolQaService();
    const credentials = await trendyolService.getCredentials(req.businessId);
    const testResult = await trendyolService.testConnection(credentials);

    if (!testResult.success) {
      return res.status(400).json({ success: false, error: testResult.message });
    }

    res.json({
      success: true,
      message: 'Trendyol bağlantısı aktif',
      details: testResult
    });
  } catch (error) {
    console.error('Trendyol test error:', error);
    res.status(500).json({ success: false, error: error.message || 'Trendyol test başarısız' });
  }
});

router.post('/hepsiburada/connect', checkPermission('integrations:connect'), async (req, res) => {
  try {
    const { merchantId, apiKey, apiSecret, qaSettings } = req.body;

    if (!merchantId || !apiSecret) {
      return res.status(400).json({
        error: 'merchantId ve apiSecret gerekli'
      });
    }

    const business = await prisma.business.findUnique({
      where: { id: req.businessId },
      select: { language: true }
    });

    const HepsiburadaQaService = (await import('../services/integrations/marketplace/hepsiburada-qa.service.js')).default;
    const hepsiburadaService = new HepsiburadaQaService();
    const testResult = await hepsiburadaService.testConnection({ merchantId, apiKey, apiSecret, qaSettings });

    if (!testResult.success) {
      return res.status(400).json({
        error: testResult.message || 'Hepsiburada bağlantı testi başarısız'
      });
    }

    const existingIntegration = await prisma.integration.findUnique({
      where: {
        businessId_type: {
          businessId: req.businessId,
          type: 'HEPSIBURADA'
        }
      }
    });

    const credentials = buildMarketplaceIntegrationPayload({
      existingCredentials: existingIntegration?.credentials || {},
      incomingCredentials: { merchantId, apiKey, apiSecret, qaSettings },
      fallbackLanguage: business?.language || 'tr',
      identifierField: 'merchantId'
    });

    const integration = await prisma.integration.upsert({
      where: {
        businessId_type: {
          businessId: req.businessId,
          type: 'HEPSIBURADA'
        }
      },
      update: {
        credentials,
        connected: true,
        isActive: true,
        syncEnabled: true
      },
      create: {
        businessId: req.businessId,
        type: 'HEPSIBURADA',
        credentials,
        connected: true,
        isActive: true,
        syncEnabled: true
      }
    });

    res.json({
      success: true,
      message: 'Hepsiburada bağlantısı başarılı',
      status: buildMarketplaceStatusResponse(integration, 'merchantId')
    });
  } catch (error) {
    console.error('Hepsiburada connect error:', error);
    res.status(500).json({ error: error.message || 'Hepsiburada bağlantısı başarısız' });
  }
});

router.post('/hepsiburada/disconnect', checkPermission('integrations:connect'), async (req, res) => {
  try {
    await prisma.integration.updateMany({
      where: {
        businessId: req.businessId,
        type: 'HEPSIBURADA'
      },
      data: {
        connected: false,
        isActive: false
      }
    });

    res.json({
      success: true,
      message: 'Hepsiburada bağlantısı kesildi'
    });
  } catch (error) {
    console.error('Hepsiburada disconnect error:', error);
    res.status(500).json({ error: 'Hepsiburada bağlantısı kesilemedi' });
  }
});

router.get('/hepsiburada/status', async (req, res) => {
  try {
    const integration = await findIntegrationStatusRecord(prisma, req.businessId, 'HEPSIBURADA');

    res.json(buildMarketplaceStatusResponse(integration, 'merchantId'));
  } catch (error) {
    console.error('Hepsiburada status error:', error);
    res.json(buildMarketplaceStatusResponse(null, 'merchantId'));
  }
});

router.post('/hepsiburada/test', checkPermission('integrations:connect'), async (req, res) => {
  try {
    const HepsiburadaQaService = (await import('../services/integrations/marketplace/hepsiburada-qa.service.js')).default;
    const hepsiburadaService = new HepsiburadaQaService();
    const credentials = await hepsiburadaService.getCredentials(req.businessId);
    const testResult = await hepsiburadaService.testConnection(credentials);

    if (!testResult.success) {
      return res.status(400).json({ success: false, error: testResult.message });
    }

    res.json({
      success: true,
      message: 'Hepsiburada bağlantısı aktif',
      details: testResult
    });
  } catch (error) {
    console.error('Hepsiburada test error:', error);
    res.status(500).json({ success: false, error: error.message || 'Hepsiburada test başarısız' });
  }
});

router.post('/sikayetvar/connect', checkPermission('integrations:connect'), async (req, res) => {
  try {
    const { apiKey, complaintSettings } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'Sikayetvar API token gerekli' });
    }

    const business = await prisma.business.findUnique({
      where: { id: req.businessId },
      select: { language: true },
    });

    const SikayetvarService = (await import('../services/integrations/complaints/sikayetvar.service.js')).default;
    const sikayetvarService = new SikayetvarService();
    const testResult = await sikayetvarService.testConnection({ apiKey, complaintSettings });

    if (!testResult.success) {
      return res.status(400).json({
        error: testResult.message || 'Sikayetvar bağlantı testi başarısız',
      });
    }

    const existingIntegration = await prisma.integration.findFirst({
      where: {
        businessId: req.businessId,
        type: 'SIKAYETVAR',
      },
    });

    const credentials = buildSikayetvarIntegrationPayload({
      existingCredentials: existingIntegration?.credentials || {},
      incomingCredentials: {
        apiKey,
        companyId: testResult.companyId,
        companyName: testResult.companyName,
        companyUrl: testResult.companyUrl,
        complaintSettings,
      },
      fallbackLanguage: business?.language || 'tr',
    });

    const integration = existingIntegration
      ? await prisma.integration.update({
          where: { id: existingIntegration.id },
          data: {
            credentials,
            connected: true,
            isActive: true,
            syncEnabled: true,
          },
        })
      : await prisma.integration.create({
          data: {
            businessId: req.businessId,
            type: 'SIKAYETVAR',
            credentials,
            connected: true,
            isActive: true,
            syncEnabled: true,
          },
        });

    res.json({
      success: true,
      message: 'Sikayetvar bağlantısı başarılı',
      status: buildSikayetvarStatusResponse(integration),
    });
  } catch (error) {
    console.error('Sikayetvar connect error:', error);
    res.status(500).json({ error: error.message || 'Sikayetvar bağlantısı başarısız' });
  }
});

router.post('/sikayetvar/disconnect', checkPermission('integrations:connect'), async (req, res) => {
  try {
    await prisma.integration.updateMany({
      where: {
        businessId: req.businessId,
        type: 'SIKAYETVAR',
      },
      data: {
        connected: false,
        isActive: false,
      },
    });

    res.json({
      success: true,
      message: 'Sikayetvar bağlantısı kesildi',
    });
  } catch (error) {
    console.error('Sikayetvar disconnect error:', error);
    res.status(500).json({ error: 'Sikayetvar bağlantısı kesilemedi' });
  }
});

router.get('/sikayetvar/status', async (req, res) => {
  try {
    const integration = await findIntegrationStatusRecord(prisma, req.businessId, 'SIKAYETVAR');
    res.json(buildSikayetvarStatusResponse(integration));
  } catch (error) {
    console.error('Sikayetvar status error:', error);
    res.json(buildSikayetvarStatusResponse(null));
  }
});

router.post('/sikayetvar/test', checkPermission('integrations:connect'), async (req, res) => {
  try {
    const SikayetvarService = (await import('../services/integrations/complaints/sikayetvar.service.js')).default;
    const sikayetvarService = new SikayetvarService();
    const credentials = await sikayetvarService.getCredentials(req.businessId);
    const testResult = await sikayetvarService.testConnection(credentials);

    if (!testResult.success) {
      return res.status(400).json({ success: false, error: testResult.message });
    }

    res.json({
      success: true,
      message: 'Sikayetvar bağlantısı aktif',
      details: testResult,
    });
  } catch (error) {
    console.error('Sikayetvar test error:', error);
    res.status(500).json({ success: false, error: error.message || 'Sikayetvar test başarısız' });
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
