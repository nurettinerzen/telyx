import axios from 'axios';

const DEFAULT_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v22.0';
const DEFAULT_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID = process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID || '1592026702081670';
const FINISH_EVENTS = new Set([
  'FINISH',
  'FINISH_ONLY_WABA',
  'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
]);

function getMetaAppId() {
  return (
    process.env.META_APP_ID ||
    process.env.FACEBOOK_APP_ID ||
    process.env.WHATSAPP_APP_ID ||
    null
  );
}

function getMetaAppSecret() {
  return (
    process.env.META_APP_SECRET ||
    process.env.FACEBOOK_APP_SECRET ||
    process.env.WHATSAPP_APP_SECRET ||
    null
  );
}

export function getWhatsAppPartnerAccessToken() {
  return (
    process.env.META_SYSTEM_USER_ACCESS_TOKEN ||
    process.env.WHATSAPP_SYSTEM_USER_ACCESS_TOKEN ||
    process.env.WHATSAPP_PARTNER_ACCESS_TOKEN ||
    process.env.WHATSAPP_ACCESS_TOKEN ||
    null
  );
}

function getGraphUrl(path, graphApiVersion = DEFAULT_GRAPH_API_VERSION) {
  const normalizedPath = String(path || '').replace(/^\/+/, '');
  return `https://graph.facebook.com/${graphApiVersion}/${normalizedPath}`;
}

function buildBearerHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

function toIsoDate(value) {
  if (!value && value !== 0) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value === 'number') {
    const timestamp = value > 1_000_000_000_000 ? value : value * 1000;
    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function isTokenExpired(expiresAt) {
  const isoValue = toIsoDate(expiresAt);
  if (!isoValue) return false;
  return new Date(isoValue).getTime() <= Date.now();
}

function extractGrantedScopes(tokenDebugData) {
  if (!tokenDebugData || typeof tokenDebugData !== 'object') {
    return [];
  }

  if (Array.isArray(tokenDebugData.scopes)) {
    return tokenDebugData.scopes.filter(Boolean);
  }

  if (Array.isArray(tokenDebugData.granular_scopes)) {
    return tokenDebugData.granular_scopes
      .map((scopeEntry) => scopeEntry?.scope)
      .filter(Boolean);
  }

  return [];
}

function extractRawErrorMessage(error) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    'Unknown Meta error'
  );
}

function isNonExpiringSystemUserToken(tokenDebugData, tokenSource) {
  const tokenType = String(tokenDebugData?.type || '').toUpperCase();
  const expiresAt = tokenDebugData?.expires_at;

  return (
    tokenSource === 'PARTNER_SYSTEM_USER' ||
    tokenType === 'SYSTEM_USER' ||
    expiresAt === 0 ||
    expiresAt === '0'
  );
}

export function getWhatsAppEmbeddedSignupConfig() {
  const appId = getMetaAppId();
  const appSecret = getMetaAppSecret();

  if (!appId || !appSecret) {
    throw new Error('META_APP_ID and META_APP_SECRET must be configured for WhatsApp Embedded Signup.');
  }

  return {
    appId,
    appSecret,
    configId: DEFAULT_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID,
    graphApiVersion: DEFAULT_GRAPH_API_VERSION,
  };
}

export function normalizeEmbeddedSignupEventPayload(payload = {}) {
  const eventPayload = payload && typeof payload === 'object' ? payload : {};
  const rawData = eventPayload.data && typeof eventPayload.data === 'object'
    ? eventPayload.data
    : eventPayload;

  return {
    type: eventPayload.type || null,
    event: eventPayload.event || null,
    version: eventPayload.version || null,
    wabaId: rawData.waba_id || rawData.wabaId || null,
    phoneNumberId: rawData.phone_number_id || rawData.phoneNumberId || null,
    metaBusinessId: rawData.business_id || rawData.businessId || rawData.meta_business_id || rawData.metaBusinessId || null,
    displayPhoneNumber: rawData.display_phone_number || rawData.displayPhoneNumber || rawData.phone_number || rawData.phoneNumber || null,
    currentStep: rawData.current_step || rawData.currentStep || null,
    rawData,
  };
}

export function isEmbeddedSignupFinishEvent(eventName) {
  return FINISH_EVENTS.has(String(eventName || '').toUpperCase());
}

export function isMetaTokenExpiredError(error) {
  const errorCode = error?.response?.data?.error?.code;
  const subcode = error?.response?.data?.error?.error_subcode;
  const message = String(error?.response?.data?.error?.message || '').toLowerCase();

  return (
    errorCode === 190 ||
    subcode === 463 ||
    message.includes('expired') ||
    message.includes('session has expired')
  );
}

export function getMetaConnectionStatusFromError(error, expiresAt = null) {
  if (isTokenExpired(expiresAt) || isMetaTokenExpiredError(error)) {
    return 'EXPIRED';
  }

  return 'ERROR';
}

export async function exchangeCodeForAccessToken(code, redirectUri = null) {
  const { appId, appSecret, graphApiVersion } = getWhatsAppEmbeddedSignupConfig();

  const response = await axios.get(getGraphUrl('oauth/access_token', graphApiVersion), {
    params: {
      client_id: appId,
      client_secret: appSecret,
      code,
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    },
  });

  return response.data;
}

export async function debugAccessToken(accessToken) {
  const { appId, appSecret, graphApiVersion } = getWhatsAppEmbeddedSignupConfig();

  const response = await axios.get(getGraphUrl('debug_token', graphApiVersion), {
    params: {
      input_token: accessToken,
      access_token: `${appId}|${appSecret}`,
    },
  });

  return response.data?.data || null;
}

export async function fetchWhatsAppPhoneNumber(phoneNumberId, accessToken) {
  if (!phoneNumberId) return null;

  const response = await axios.get(getGraphUrl(phoneNumberId), {
    params: {
      fields: 'id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status',
    },
    headers: buildBearerHeaders(accessToken),
  });

  return response.data || null;
}

export async function fetchWhatsAppBusinessAccount(wabaId, accessToken) {
  if (!wabaId) return null;

  const response = await axios.get(getGraphUrl(wabaId), {
    params: {
      fields: 'id,name,currency,timezone_id',
    },
    headers: buildBearerHeaders(accessToken),
  });

  return response.data || null;
}

function normalizeGraphDataList(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && Array.isArray(value.data)) {
    return value.data;
  }

  return [];
}

export async function fetchAccessibleWhatsAppAssets(accessToken) {
  const response = await axios.get(getGraphUrl('me/businesses'), {
    params: {
      fields: [
        'id',
        'name',
        'owned_whatsapp_business_accounts{id,name,timezone_id,phone_numbers{id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status}}',
        'client_whatsapp_business_accounts{id,name,timezone_id,phone_numbers{id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status}}',
      ].join(','),
    },
    headers: buildBearerHeaders(accessToken),
  });

  const businesses = normalizeGraphDataList(response.data?.data ?? response.data);
  const candidates = [];

  for (const business of businesses) {
    for (const relationKey of ['owned_whatsapp_business_accounts', 'client_whatsapp_business_accounts']) {
      const wabas = normalizeGraphDataList(business?.[relationKey]);

      for (const waba of wabas) {
        const phoneNumbers = normalizeGraphDataList(waba?.phone_numbers);

        for (const phoneNumber of phoneNumbers) {
          if (!waba?.id || !phoneNumber?.id) {
            continue;
          }

          candidates.push({
            metaBusinessId: business?.id || null,
            metaBusinessName: business?.name || null,
            wabaId: waba.id,
            wabaName: waba?.name || null,
            phoneNumberId: phoneNumber.id,
            displayPhoneNumber: phoneNumber?.display_phone_number || null,
            verifiedName: phoneNumber?.verified_name || null,
          });
        }
      }
    }
  }

  return candidates;
}

export function buildWhatsAppConnectionCredentials({
  businessId,
  configId,
  webhookUrl,
  existingCredentials = {},
  normalizedEvent,
  tokenExchange,
  tokenDebugData,
  phoneNumberData,
  wabaData,
  tokenSource = 'EMBEDDED_SIGNUP_CODE_EXCHANGE',
}) {
  const nowIso = new Date().toISOString();
  const existingTokenMetadata = existingCredentials?.tokenMetadata && typeof existingCredentials.tokenMetadata === 'object'
    ? existingCredentials.tokenMetadata
    : {};
  const tokenExpiresAt = isNonExpiringSystemUserToken(tokenDebugData, tokenSource)
    ? null
    : (
      toIsoDate(tokenDebugData?.expires_at) || (
        Number.isFinite(tokenExchange?.expires_in)
          ? new Date(Date.now() + (tokenExchange.expires_in * 1000)).toISOString()
          : toIsoDate(existingTokenMetadata.expiresAt)
      )
    );

  const connectionStatus = isTokenExpired(tokenExpiresAt) ? 'EXPIRED' : 'CONNECTED';
  const grantedScopes = extractGrantedScopes(tokenDebugData);

  return {
    ...existingCredentials,
    tenantId: businessId,
    metaBusinessId: normalizedEvent.metaBusinessId || existingCredentials.metaBusinessId || null,
    wabaId: normalizedEvent.wabaId || existingCredentials.wabaId || null,
    wabaName: wabaData?.name || existingCredentials.wabaName || null,
    phoneNumberId: normalizedEvent.phoneNumberId || existingCredentials.phoneNumberId || null,
    displayPhoneNumber: normalizedEvent.displayPhoneNumber || phoneNumberData?.display_phone_number || existingCredentials.displayPhoneNumber || null,
    verifiedName: phoneNumberData?.verified_name || existingCredentials.verifiedName || null,
    connectionStatus,
    grantedScopes: grantedScopes.length > 0 ? grantedScopes : (Array.isArray(existingCredentials.grantedScopes) ? existingCredentials.grantedScopes : []),
    configId,
    webhookUrl,
    onboardingMethod: 'EMBEDDED_SIGNUP',
    tokenSource,
    tokenMetadata: {
      type: tokenExchange?.token_type || tokenDebugData?.type || existingTokenMetadata.type || null,
      expiresAt: tokenExpiresAt,
      issuedAt: existingTokenMetadata.issuedAt || nowIso,
      lastValidatedAt: nowIso,
      granularScopes: Array.isArray(tokenDebugData?.granular_scopes)
        ? tokenDebugData.granular_scopes
        : (Array.isArray(existingTokenMetadata.granularScopes) ? existingTokenMetadata.granularScopes : []),
    },
    lastError: null,
    lastConnectedAt: existingCredentials.lastConnectedAt || nowIso,
    updatedAt: nowIso,
  };
}

export function buildWhatsAppStatusResponse({ business, integration, manualFallbackEnabled = false }) {
  const rawCredentials = integration?.credentials;
  const credentials = rawCredentials && typeof rawCredentials === 'object' && !Array.isArray(rawCredentials)
    ? rawCredentials
    : {};
  const hasPersistedIntegrationState = Boolean(
    integration ||
    credentials.phoneNumberId ||
    credentials.displayPhoneNumber ||
    credentials.wabaId ||
    credentials.metaBusinessId
  );

  const tokenExpiresAt = toIsoDate(credentials?.tokenMetadata?.expiresAt);
  const tokenExpired = isTokenExpired(tokenExpiresAt);
  const tokenExpiresSoon = tokenExpiresAt
    ? new Date(tokenExpiresAt).getTime() <= (Date.now() + (7 * 24 * 60 * 60 * 1000))
    : false;

  let connectionStatus = credentials.connectionStatus || 'DISCONNECTED';

  if (!hasPersistedIntegrationState) {
    connectionStatus = 'DISCONNECTED';
  } else if (tokenExpired) {
    connectionStatus = 'EXPIRED';
  } else if (integration?.connected && connectionStatus === 'DISCONNECTED') {
    connectionStatus = 'CONNECTED';
  }

  const connected = connectionStatus === 'CONNECTED';
  const needsReconnect = ['EXPIRED', 'ERROR', 'RECONNECT_REQUIRED'].includes(connectionStatus);
  const shouldExposeConnectionDetails = connected || needsReconnect;

  return {
    connected,
    phoneNumberId: shouldExposeConnectionDetails ? (credentials.phoneNumberId || business?.whatsappPhoneNumberId || null) : null,
    displayPhoneNumber: shouldExposeConnectionDetails ? (credentials.displayPhoneNumber || null) : null,
    wabaId: shouldExposeConnectionDetails ? (credentials.wabaId || null) : null,
    metaBusinessId: shouldExposeConnectionDetails ? (credentials.metaBusinessId || null) : null,
    webhookUrl: credentials.webhookUrl || business?.whatsappWebhookUrl || null,
    connectionStatus,
    needsReconnect,
    grantedScopes: Array.isArray(credentials.grantedScopes) ? credentials.grantedScopes : [],
    tokenExpiresAt,
    tokenExpired,
    tokenExpiresSoon,
    configId: credentials.configId || DEFAULT_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID,
    manualFallbackEnabled,
    lastError: credentials.lastError || null,
    lastConnectedAt: credentials.lastConnectedAt || null,
    lastValidatedAt: credentials?.tokenMetadata?.lastValidatedAt || null,
    hasPersistedIntegrationState,
  };
}

export function buildWhatsAppRefreshFailureCredentials(existingCredentials = {}, error, expiresAt = null) {
  const connectionStatus = getMetaConnectionStatusFromError(error, expiresAt);
  const existingTokenMetadata = existingCredentials?.tokenMetadata && typeof existingCredentials.tokenMetadata === 'object'
    ? existingCredentials.tokenMetadata
    : {};

  return {
    ...existingCredentials,
    connectionStatus,
    lastError: {
      message: extractRawErrorMessage(error),
      code: error?.response?.data?.error?.code || null,
      subcode: error?.response?.data?.error?.error_subcode || null,
      updatedAt: new Date().toISOString(),
    },
    tokenMetadata: {
      ...existingTokenMetadata,
      expiresAt: toIsoDate(expiresAt),
      lastValidatedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  };
}
