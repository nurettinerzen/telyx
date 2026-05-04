import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const prismaMock = {
  user: {
    findUnique: jest.fn()
  },
  adminUser: {
    findUnique: jest.fn()
  }
};

jest.unstable_mockModule('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prismaMock)
}));

jest.unstable_mockModule('../../src/middleware/auth.js', () => ({
  authenticateToken: (req, res, next) => {
    req.userId = 7;
    req.businessId = 21;
    req.user = { id: 7, businessId: 21, email: 'owner@example.com' };
    next();
  }
}));

jest.unstable_mockModule('../../src/middleware/reauth.js', () => ({
  requireRecentAuth: () => (req, res, next) => next()
}));

jest.unstable_mockModule('../../src/services/emailService.js', () => ({
  sendVerificationEmail: jest.fn(),
  sendEmailChangeVerification: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  sendPasswordChangedEmail: jest.fn(),
  sendAdminMfaCodeEmail: jest.fn(),
  sendNewSignupNotificationEmail: jest.fn()
}));

jest.unstable_mockModule('../../src/middleware/oauthState.js', () => ({
  generateOAuthState: jest.fn(),
  validateOAuthState: jest.fn()
}));

jest.unstable_mockModule('../../src/middleware/redirectWhitelist.js', () => ({
  safeRedirect: jest.fn()
}));

jest.unstable_mockModule('../../src/services/phoneInboundGate.js', () => ({
  isPhoneInboundEnabledForBusinessRecord: jest.fn(() => false)
}));

jest.unstable_mockModule('../../src/security/passwordPolicy.js', () => ({
  validatePasswordPolicy: jest.fn(() => ({ valid: true })),
  passwordPolicyMessage: jest.fn(() => 'ok')
}));

jest.unstable_mockModule('../../src/security/sessionToken.js', () => ({
  clearSessionCookie: jest.fn(),
  issueSession: jest.fn()
}));

jest.unstable_mockModule('../../src/middleware/adminAuth.js', () => ({
  ADMIN_BOOTSTRAP_EMAILS: [],
  isAdmin: (req, res, next) => next(),
  requireAdminMfa: (req, res, next) => next()
}));

jest.unstable_mockModule('../../src/security/constantTime.js', () => ({
  safeCompareStrings: jest.fn(() => true)
}));

jest.unstable_mockModule('../../src/middleware/rateLimiter.js', () => ({
  authRateLimiter: { middleware: () => (req, res, next) => next() },
  apiRateLimiter: { middleware: () => (req, res, next) => next() }
}));

let router;

beforeAll(async () => {
  ({ default: router } = await import('../../src/routes/auth.js'));
});

describe('Auth me subscription shape', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/auth', router);

    prismaMock.user.findUnique.mockResolvedValue({
      id: 7,
      email: 'owner@example.com',
      name: 'Owner',
      role: 'OWNER',
      businessId: 21,
      tokenVersion: 0,
      onboardingCompleted: true,
      emailVerified: true,
      emailVerifiedAt: null,
      acceptedAt: null,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      business: {
        id: 21,
        name: 'Acme',
        country: 'TR',
        phoneInboundEnabled: false,
        subscription: {
          id: 45,
          businessId: 21,
          plan: 'ENTERPRISE',
          status: 'ACTIVE'
        }
      }
    });
    prismaMock.adminUser.findUnique.mockResolvedValue(null);
  });

  it('returns subscription, plan, and explicit non-admin flags in auth/me payload', async () => {
    const response = await request(app).get('/api/auth/me');

    expect(response.status).toBe(200);
    expect(response.body.plan).toBe('ENTERPRISE');
    expect(response.body.isAdmin).toBe(false);
    expect(response.body.adminRole).toBeNull();
    expect(response.body.subscription).toEqual(
      expect.objectContaining({
        plan: 'ENTERPRISE',
        status: 'ACTIVE'
      })
    );

    const select = prismaMock.user.findUnique.mock.calls[0][0].select;
    expect(select.business.select.subscription.select.plan).toBe(true);
    expect(select.business.select.subscription.select.voiceAddOnMinutesBalance).toBeUndefined();
    expect(select.business.select.subscription.select.writtenInteractionAddOnBalance).toBeUndefined();
  });

  it('returns admin flags when the current user is an active admin', async () => {
    prismaMock.adminUser.findUnique.mockResolvedValue({
      role: 'SUPER_ADMIN',
      isActive: true,
    });

    const response = await request(app).get('/api/auth/me');

    expect(response.status).toBe(200);
    expect(response.body.isAdmin).toBe(true);
    expect(response.body.adminRole).toBe('SUPER_ADMIN');
  });

  it('returns 204 for the admin route state endpoint when auth, admin, and MFA checks pass', async () => {
    const response = await request(app).get('/api/auth/admin-route-state');

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
  });
});
