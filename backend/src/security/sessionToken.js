import jwt from 'jsonwebtoken';

const SESSION_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PROD_SESSION_COOKIE_NAME = '__Host-telyx_session';
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

function getSessionCookieName() {
  return isProductionLikeCookieEnv() ? PROD_SESSION_COOKIE_NAME : DEV_SESSION_COOKIE_NAME;
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
  return cookieMap[getSessionCookieName()] || cookieMap[PROD_SESSION_COOKIE_NAME] || cookieMap[DEV_SESSION_COOKIE_NAME] || null;
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
  res.cookie(getSessionCookieName(), token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  });
}

export function clearSessionCookie(res) {
  const isProduction = isProductionLikeCookieEnv();
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
  };

  res.clearCookie(getSessionCookieName(), cookieOptions);

  if (!isProduction) {
    res.clearCookie(PROD_SESSION_COOKIE_NAME, {
      ...cookieOptions,
      secure: false,
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
