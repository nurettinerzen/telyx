import { PrismaClient } from '@prisma/client';
import { logAuthFailure, logCrossTenantAttempt } from './securityEventLogger.js';
import { isPhoneInboundEnabledForBusinessRecord } from '../services/phoneInboundGate.js';
import { extractSessionToken, verifySessionToken } from '../security/sessionToken.js';
import { safeCompareStrings } from '../security/constantTime.js';

const prisma = new PrismaClient();

export const authenticateToken = async (req, res, next) => {
  try {
    const token = extractSessionToken(req);

    if (!token) {
      // Log auth failure
      await logAuthFailure(req, 'missing_token', 401);
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = verifySessionToken(token);

    // Fetch user with business details
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        business: true
      }
    });

    if (!user) {
      // Log auth failure
      await logAuthFailure(req, 'user_not_found', 401);
      return res.status(401).json({ error: 'User not found' });
    }

    const tokenVersion = Number.isInteger(user.tokenVersion) ? user.tokenVersion : 0;
    const decodedTokenVersion = Number.isInteger(decoded.tv) ? decoded.tv : 0;

    if (!safeCompareStrings(String(tokenVersion), String(decodedTokenVersion))) {
      await logAuthFailure(req, 'token_revoked', 401);
      return res.status(401).json({ error: 'Session has been revoked. Please sign in again.' });
    }

    if (user.business) {
      user.business.phoneInboundEnabled = isPhoneInboundEnabledForBusinessRecord(user.business);
    }

    req.user = user;
    req.userId = user.id;
    req.businessId = user.businessId;
    req.userRole = user.role;
    req.auth = {
      tokenVersion: decodedTokenVersion,
      reauthAt: decoded.reauthAt || null,
      adminMfaAt: decoded.adminMfaAt || null,
      amr: Array.isArray(decoded.amr) ? decoded.amr : [],
      issuedAt: decoded.iat || null,
    };

    next();
  } catch (error) {
    console.error('Auth error:', error.message);

    // Log auth failure with reason
    const reason = error.name === 'TokenExpiredError' ? 'token_expired' :
                   error.name === 'JsonWebTokenError' ? 'invalid_token' :
                   'verification_failed';
    await logAuthFailure(req, reason, 403);

    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Middleware to verify user belongs to the business they're trying to access
export const verifyBusinessAccess = async (req, res, next) => {
  const requestedBusinessId = parseInt(req.params.businessId || req.body.businessId || req.query.businessId);

  if (requestedBusinessId && requestedBusinessId !== req.businessId) {
    // Log cross-tenant attempt
    await logCrossTenantAttempt(req, req.businessId, requestedBusinessId, req.userId);

    return res.status(403).json({
      error: 'Access denied: You can only access your own business data'
    });
  }

  next();
};

// Role-based access control
export const requireRole = (roles = []) => {
  return (req, res, next) => {
    if (!roles.includes(req.userRole)) {
      return res.status(403).json({ 
        error: 'Access denied: Insufficient permissions' 
      });
    }
    next();
  };
};

export default { authenticateToken, verifyBusinessAccess, requireRole };
