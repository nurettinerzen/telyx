import prisma from '../../../prismaClient.js';
import {
  decryptPossiblyEncryptedValue,
  encryptTokenValue,
} from '../../../utils/encryption.js';

export const AMAZON_INTEGRATION_TYPE = 'AMAZON';

const AMAZON_LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const AMAZON_TOKEN_FIELDS = ['refreshToken'];
const AMAZON_DEFAULT_MARKETPLACE_ID = process.env.AMAZON_SP_API_DEFAULT_MARKETPLACE_ID || 'A33AVAJ2PDY3EV';
const AMAZON_DEFAULT_SELLER_CENTRAL_URL = process.env.AMAZON_SP_API_SELLER_CENTRAL_URL || 'https://sellercentral.amazon.com.tr';
const AMAZON_DEFAULT_USER_AGENT = process.env.AMAZON_SP_API_USER_AGENT || 'TelyxAmazonSPAPI/0.1 (Language=JavaScript/Node.js)';
const AMAZON_MARKETPLACE_CONFIG = {
  A33AVAJ2PDY3EV: {
    marketplaceId: 'A33AVAJ2PDY3EV',
    countryCode: 'TR',
    sellingRegion: 'eu',
    sellerCentralUrl: 'https://sellercentral.amazon.com.tr',
    endpoint: 'https://sellingpartnerapi-eu.amazon.com',
    sandboxEndpoint: 'https://sandbox.sellingpartnerapi-eu.amazon.com',
  },
};

function normalizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return { ...value };
}

function resolveMarketplaceConfig(marketplaceId) {
  return AMAZON_MARKETPLACE_CONFIG[marketplaceId] || AMAZON_MARKETPLACE_CONFIG[AMAZON_DEFAULT_MARKETPLACE_ID];
}

function formatAmazonDate(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

async function safeReadResponse(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildSpApiError(response, payload, fallbackMessage) {
  const message = typeof payload === 'string'
    ? payload
    : payload?.errors?.[0]?.message
      || payload?.error_description
      || payload?.message
      || payload?.error
      || fallbackMessage;

  const error = new Error(message);
  error.status = response.status;
  error.payload = payload;
  return error;
}

function normalizeParticipations(payload) {
  const items = Array.isArray(payload?.payload)
    ? payload.payload
    : Array.isArray(payload?.marketplaceParticipations)
      ? payload.marketplaceParticipations
      : [];

  return items.map((item = {}) => ({
    marketplaceId: item.marketplace?.id || null,
    marketplaceName: item.marketplace?.name || null,
    defaultLanguageCode: item.marketplace?.defaultLanguageCode || null,
    defaultCurrencyCode: item.marketplace?.defaultCurrencyCode || null,
    domainName: item.marketplace?.domainName || null,
    storeName: item.storeName || null,
    isParticipating: item.participation?.isParticipating ?? null,
    hasSuspendedListings: item.participation?.hasSuspendedListings ?? null,
  }));
}

export function getAmazonEnvConfig() {
  const backendUrl = String(process.env.BACKEND_URL || '').replace(/\/+$/, '');

  return {
    applicationId: String(process.env.AMAZON_SP_API_APP_ID || '').trim(),
    clientId: String(process.env.AMAZON_SP_API_CLIENT_ID || '').trim(),
    clientSecret: String(process.env.AMAZON_SP_API_CLIENT_SECRET || '').trim(),
    backendUrl,
    useDraftAuth: process.env.AMAZON_SP_API_USE_DRAFT_AUTH === 'true',
    defaultUseSandbox: process.env.AMAZON_SP_API_USE_SANDBOX === 'true',
  };
}

export function getAmazonCallbackUri() {
  const { backendUrl } = getAmazonEnvConfig();

  if (!backendUrl) {
    throw new Error('BACKEND_URL tanimli olmadan Amazon redirect URI olusturulamaz');
  }

  return `${backendUrl}/api/integrations/amazon/callback`;
}

export function getAmazonLoginUri() {
  const { backendUrl } = getAmazonEnvConfig();

  if (!backendUrl) {
    throw new Error('BACKEND_URL tanimli olmadan Amazon login URI olusturulamaz');
  }

  return `${backendUrl}/api/integrations/amazon/login`;
}

export function buildAmazonCredentials(rawCredentials = {}) {
  const normalized = normalizeObject(rawCredentials);
  const marketplaceId = String(
    normalized.marketplaceId
    || normalized.defaultMarketplaceId
    || AMAZON_DEFAULT_MARKETPLACE_ID
  ).trim() || AMAZON_DEFAULT_MARKETPLACE_ID;
  const marketplaceConfig = resolveMarketplaceConfig(marketplaceId);

  return {
    ...normalized,
    marketplaceId,
    sellerCentralUrl: String(
      normalized.sellerCentralUrl
      || marketplaceConfig?.sellerCentralUrl
      || AMAZON_DEFAULT_SELLER_CENTRAL_URL
    ).trim() || AMAZON_DEFAULT_SELLER_CENTRAL_URL,
    sellingRegion: String(
      normalized.sellingRegion
      || marketplaceConfig?.sellingRegion
      || 'eu'
    ).trim().toLowerCase(),
    useSandbox: normalized.useSandbox === true || normalized.useSandbox === 'true' || getAmazonEnvConfig().defaultUseSandbox,
    capabilities: {
      buyerMessaging: true,
      productQa: false,
      ...(normalizeObject(normalized.capabilities)),
    },
    authorizedMarketplaces: Array.isArray(normalized.authorizedMarketplaces)
      ? normalized.authorizedMarketplaces
      : [],
  };
}

export function encryptAmazonCredentials(rawCredentials = {}) {
  const credentials = buildAmazonCredentials(rawCredentials);

  for (const field of AMAZON_TOKEN_FIELDS) {
    const value = credentials[field];
    if (typeof value === 'string' && value.length > 0) {
      credentials[field] = encryptTokenValue(value);
    }
  }

  return credentials;
}

export function decryptAmazonCredentials(rawCredentials = {}) {
  const credentials = buildAmazonCredentials(rawCredentials);

  for (const field of AMAZON_TOKEN_FIELDS) {
    const value = credentials[field];
    if (typeof value === 'string' && value.length > 0) {
      credentials[field] = decryptPossiblyEncryptedValue(value, { allowPlaintext: true });
    }
  }

  return credentials;
}

export function safeDecryptAmazonCredentials(rawCredentials = {}) {
  const normalized = normalizeObject(rawCredentials);

  try {
    return decryptAmazonCredentials(normalized);
  } catch (error) {
    console.warn('Amazon credential decrypt fallback:', error.message);
    return buildAmazonCredentials(normalized);
  }
}

export function getAmazonAuthUrl({
  state,
  marketplaceId = AMAZON_DEFAULT_MARKETPLACE_ID,
  sellerCentralUrl = null,
  useDraftAuth = null,
}) {
  const { applicationId, useDraftAuth: envUseDraftAuth } = getAmazonEnvConfig();

  if (!applicationId) {
    throw new Error('AMAZON_SP_API_APP_ID tanimli olmadan Amazon yetkilendirme akisi baslatilamaz');
  }

  const marketplaceConfig = resolveMarketplaceConfig(marketplaceId);
  const baseUrl = sellerCentralUrl || marketplaceConfig?.sellerCentralUrl || AMAZON_DEFAULT_SELLER_CENTRAL_URL;
  const url = new URL('/apps/authorize/consent', baseUrl);

  url.searchParams.set('application_id', applicationId);
  url.searchParams.set('state', String(state || '').trim());

  if (useDraftAuth ?? envUseDraftAuth) {
    url.searchParams.set('version', 'beta');
  }

  return url.toString();
}

class AmazonSpApiService {
  constructor(credentials = null) {
    this.credentials = credentials ? buildAmazonCredentials(credentials) : null;
  }

  static async hasIntegration(businessId) {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId,
        type: AMAZON_INTEGRATION_TYPE,
        connected: true,
        isActive: true,
      },
      select: { id: true },
    });

    return Boolean(integration);
  }

  validateEnvConfig() {
    const envConfig = getAmazonEnvConfig();

    if (!envConfig.clientId || !envConfig.clientSecret) {
      throw new Error('AMAZON_SP_API_CLIENT_ID ve AMAZON_SP_API_CLIENT_SECRET tanimli olmali');
    }

    return envConfig;
  }

  validateCredentials(credentials) {
    if (!credentials?.refreshToken) {
      throw new Error('Amazon refresh token gerekli');
    }
  }

  async getCredentials(businessId) {
    if (this.credentials) {
      return this.credentials;
    }

    const integration = await prisma.integration.findFirst({
      where: {
        businessId,
        type: AMAZON_INTEGRATION_TYPE,
        isActive: true,
      },
    });

    if (!integration) {
      throw new Error('Amazon entegrasyonu yapılandırılmamış');
    }

    this.credentials = safeDecryptAmazonCredentials(integration.credentials);
    return this.credentials;
  }

  async exchangeAuthorizationCode(code) {
    const { clientId, clientSecret } = this.validateEnvConfig();
    const redirectUri = getAmazonCallbackUri();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code || '').trim(),
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const response = await fetch(AMAZON_LWA_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: body.toString(),
    });

    const payload = await safeReadResponse(response);

    if (!response.ok) {
      throw buildSpApiError(response, payload, 'Amazon authorization code exchange basarisiz');
    }

    if (!payload?.refresh_token) {
      throw new Error('Amazon OAuth yanitinda refresh_token bulunamadi');
    }

    return payload;
  }

  async exchangeRefreshToken(refreshToken) {
    const { clientId, clientSecret } = this.validateEnvConfig();
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: String(refreshToken || '').trim(),
      client_id: clientId,
      client_secret: clientSecret,
    });

    const response = await fetch(AMAZON_LWA_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: body.toString(),
    });

    const payload = await safeReadResponse(response);

    if (!response.ok) {
      throw buildSpApiError(response, payload, 'Amazon access token yenilenemedi');
    }

    return payload;
  }

  getBaseUrl(credentials) {
    const marketplaceConfig = resolveMarketplaceConfig(credentials.marketplaceId);
    return credentials.useSandbox
      ? marketplaceConfig?.sandboxEndpoint
      : marketplaceConfig?.endpoint;
  }

  async request(credentialsInput, path, options = {}) {
    const credentials = buildAmazonCredentials(credentialsInput);
    this.validateCredentials(credentials);

    const tokenPayload = await this.exchangeRefreshToken(credentials.refreshToken);
    const accessToken = tokenPayload?.access_token;

    if (!accessToken) {
      throw new Error('Amazon access token alınamadı');
    }

    const url = new URL(path, this.getBaseUrl(credentials));

    if (options.query && typeof options.query === 'object') {
      for (const [key, value] of Object.entries(options.query)) {
        if (value === undefined || value === null || value === '') {
          continue;
        }
        url.searchParams.append(key, String(value));
      }
    }

    const response = await fetch(url.toString(), {
      method: options.method || 'GET',
      headers: {
        accept: 'application/json',
        'x-amz-access-token': accessToken,
        'x-amz-date': formatAmazonDate(),
        'user-agent': AMAZON_DEFAULT_USER_AGENT,
        ...(options.headers || {}),
      },
      body: options.body,
    });

    const payload = await safeReadResponse(response);

    if (!response.ok) {
      throw buildSpApiError(response, payload, `Amazon SP-API istegi basarisiz (${response.status})`);
    }

    return payload;
  }

  async getMarketplaceParticipations(credentialsInput) {
    const credentials = buildAmazonCredentials(credentialsInput);
    const payload = await this.request(credentials, '/sellers/v1/marketplaceParticipations');
    return normalizeParticipations(payload);
  }

  async testConnection(credentialsInput) {
    const credentials = buildAmazonCredentials(credentialsInput);
    this.validateCredentials(credentials);

    const tokenPayload = await this.exchangeRefreshToken(credentials.refreshToken);
    let authorizedMarketplaces = [];
    let validationWarning = null;

    try {
      authorizedMarketplaces = await this.getMarketplaceParticipations(credentials);
    } catch (error) {
      validationWarning = error.message || 'Marketplace doğrulaması yapılamadı';
    }

    return {
      success: true,
      message: validationWarning
        ? 'Amazon OAuth bağlantısı hazır, ek rol/doğrulama ihtiyacı olabilir'
        : 'Amazon bağlantısı başarılı',
      sellingPartnerId: credentials.sellingPartnerId || null,
      marketplaceId: credentials.marketplaceId,
      sellingRegion: credentials.sellingRegion,
      useSandbox: credentials.useSandbox,
      authorizedMarketplaces,
      validationWarning,
      expiresIn: tokenPayload?.expires_in || null,
    };
  }
}

export default AmazonSpApiService;
