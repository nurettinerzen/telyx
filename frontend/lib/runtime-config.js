function normalizeAppEnv(value) {
  const normalized = String(value || '').trim().toLowerCase();

  if (['production', 'prod', 'live'].includes(normalized)) return 'production';
  if (['beta', 'staging', 'stage', 'preview', 'preprod'].includes(normalized)) return 'beta';
  if (normalized === 'test') return 'test';

  return 'development';
}

function normalizeUrl(value, fallback) {
  const candidate = String(value || fallback || '').trim();
  if (!candidate) return '';

  try {
    const url = new URL(candidate);
    return url.toString().replace(/\/$/, '');
  } catch (_) {
    return String(fallback || '').trim().replace(/\/$/, '');
  }
}

function inferAppEnvFromUrl(value) {
  const candidate = String(value || '').trim().toLowerCase();
  if (!candidate) return '';

  try {
    const { hostname } = new URL(candidate);
    if (/(^|\.)(beta|staging|stage|preview|preprod)(\.|$)/.test(hostname)) return 'beta';
  } catch (_) {
    // Ignore invalid URL hints and fall back to explicit env values.
  }

  return '';
}

const nodeEnvFallback = process.env.NODE_ENV === 'development'
  ? 'development'
  : process.env.NODE_ENV === 'test'
    ? 'test'
    : 'production';

const inferredUrlEnv = inferAppEnvFromUrl(process.env.NEXT_PUBLIC_SITE_URL)
  || inferAppEnvFromUrl(process.env.NEXT_PUBLIC_API_URL);

const appEnv = normalizeAppEnv(process.env.NEXT_PUBLIC_APP_ENV || inferredUrlEnv || nodeEnvFallback);
const isProductionApp = appEnv === 'production';
const isBetaApp = appEnv === 'beta';

const defaultSiteUrl = isProductionApp ? 'https://telyx.ai' : 'http://localhost:3000';
const defaultApiUrl = isProductionApp ? 'https://api.telyx.ai' : 'http://localhost:3001';

const siteUrl = normalizeUrl(process.env.NEXT_PUBLIC_SITE_URL, defaultSiteUrl);
const apiUrl = normalizeUrl(process.env.NEXT_PUBLIC_API_URL, defaultApiUrl);

export const runtimeConfig = Object.freeze({
  appEnv,
  isProductionApp,
  isBetaApp,
  isDevelopmentApp: appEnv === 'development',
  siteUrl,
  apiUrl,
  landingChatEmbedKey: process.env.NEXT_PUBLIC_LANDING_CHAT_EMBED_KEY
    || (isProductionApp ? 'emb_0f875ba550dde1c4836193e02231b7f6' : ''),
});

export function buildSiteUrl(path = '/') {
  const normalizedPath = String(path || '/').trim();
  if (!normalizedPath || normalizedPath === '/') return runtimeConfig.siteUrl;
  return `${runtimeConfig.siteUrl}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`;
}

export function buildApiUrl(path = '/') {
  const normalizedPath = String(path || '/').trim();
  if (!normalizedPath || normalizedPath === '/') return runtimeConfig.apiUrl;
  return `${runtimeConfig.apiUrl}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`;
}

export default runtimeConfig;
