import jwt from 'jsonwebtoken';
import runtimeConfig from '../config/runtime.js';

const SESSION_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PROD_SHARED_SESSION_COOKIE_NAME = '__Secure-telyx_session';
const BETA_SHARED_SESSION_COOKIE_NAME = '__Secure-telyx_beta_session';
const LEGACY_PROD_SESSION_COOKIE_NAME = '__Host-telyx_session';
const DEV_SESSION_COOKIE_NAME = 'telyx_session';

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
}

function isProductionLikeCookieEnv() {
  return process.env.NODE_ENV === 'production';
}

function getDerivedCookieDomain() {
  const explicitDomain = String(process.env.SESSION_COOKIE_DOMAIN || '').trim().replace(/^\./, '');
  if (explicitDomain) {
    return explicitDomain;
  }

  const candidateUrls = [
    runtimeConfig.frontendUrl,
    runtimeConfig.siteUrl,
    runtimeConfig.backendUrl,
  ].filter(Boolean);

  for (const candidate of candidateUrls) {
    try {
      const hostname = new URL(candidate).hostname.toLowerCase();
      if (!hostname || hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
        continue;
      }

      const parts = hostname.split('.').filter(Boolean);
      if (parts.length >= 2) {
        return parts.slice(-2).join('.');
      }
    } catch {
      // Ignore invalid URL candidates and fall through.
    }
  }

  return null;
}

function getSharedCookieDomain() {
  if (!isProductionLikeCookieEnv()) {
    return null;
  }

  return getDerivedCookieDomain();
}

function getSharedSessionCookieName() {
  if (!getSharedCookieDomain()) {
    return null;
  }

  if (runtimeConfig.isBetaApp) {
    return BETA_SHARED_SESSION_COOKIE_NAME;
  }

  return PROD_SHARED_SESSION_COOKIE_NAME;
}

function getSessionCookieName() {
  if (!isProductionLikeCookieEnv()) {
    return DEV_SESSION_COOKIE_NAME;
  }

  return getSharedSessionCookieName() || LEGACY_PROD_SESSION_COOKIE_NAME;
}

function getAllKnownCookieNames() {
  const cookieNames = [
    getSessionCookieName(),
    LEGACY_PROD_SESSION_COOKIE_NAME,
  ];

  if (!isProductionLikeCookieEnv()) {
    cookieNames.push(DEV_SESSION_COOKIE_NAME);
  }

  return Array.from(new Set([
    ...cookieNames,
  ].filter(Boolean)));
}

function normalizeCookieHeader(cookieHeader = '') {
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return {};
  }

  return cookieHeader.split(';').reduce((acc, part) => {
    const [rawKey, ...rawValueParts] = part.trim().split('=');
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rawValueParts.join('=') || '');
    return acc;
  }, {});
}

export function extractSessionToken(req) {
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  const cookieMap = normalizeCookieHeader(req.headers?.cookie || '');

  for (const cookieName of getAllKnownCookieNames()) {
    if (cookieMap[cookieName]) {
      return cookieMap[cookieName];
    }
  }

  return null;
}

export function buildSessionPayload(user, extra = {}) {
  const amr = Array.isArray(extra.amr) && extra.amr.length > 0 ? extra.amr : ['pwd'];
  return {
    userId: user.id,
    email: user.email,
    businessId: user.businessId,
    role: user.role,
    tv: Number.isInteger(user.tokenVersion) ? user.tokenVersion : 0,
    reauthAt: Date.now(),
    amr,
    ...extra,
  };
}

export function signSessionToken(payload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: SESSION_EXPIRES_IN });
}

export function verifySessionToken(token) {
  return jwt.verify(token, getJwtSecret());
}

export function setSessionCookie(res, token) {
  const isProduction = isProductionLikeCookieEnv();
  const sharedDomain = getSharedCookieDomain();
  const primaryCookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
    ...(sharedDomain ? { domain: sharedDomain } : {}),
  };

  res.cookie(getSessionCookieName(), token, primaryCookieOptions);

  if (isProduction && sharedDomain) {
    res.cookie(LEGACY_PROD_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: SESSION_MAX_AGE_MS,
    });
  }
}

export function clearSessionCookie(res) {
  const isProduction = isProductionLikeCookieEnv();
  const sharedDomain = getSharedCookieDomain();
  const baseCookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
  };
  const sharedCookieOptions = sharedDomain
    ? { ...baseCookieOptions, domain: sharedDomain }
    : null;

  for (const cookieName of getAllKnownCookieNames()) {
    if (!cookieName) continue;

    if (sharedCookieOptions) {
      res.clearCookie(cookieName, sharedCookieOptions);
    }

    res.clearCookie(cookieName, baseCookieOptions);
  }

  if (!isProduction) {
    res.clearCookie(LEGACY_PROD_SESSION_COOKIE_NAME, {
      secure: false,
      ...baseCookieOptions,
    });
  }
}

export function issueSession(res, user, extraClaims = {}) {
  const token = signSessionToken(buildSessionPayload(user, extraClaims));
  setSessionCookie(res, token);
  return token;
}

export default {
  SESSION_COOKIE_NAME: getSessionCookieName(),
  extractSessionToken,
  buildSessionPayload,
  signSessionToken,
  verifySessionToken,
  setSessionCookie,
  clearSessionCookie,
  issueSession,
};
