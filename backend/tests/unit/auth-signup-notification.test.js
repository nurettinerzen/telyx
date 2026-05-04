import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const prismaMock = {
  user: {
    findUnique: jest.fn()
  },
  emailVerificationToken: {
    deleteMany: jest.fn(),
    create: jest.fn()
  },
  $transaction: jest.fn(),
};

const bcryptMock = {
  hash: jest.fn(async () => 'hashed-password')
};

const emailServiceMock = {
  sendVerificationEmail: jest.fn(),
  sendEmailChangeVerification: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  sendPasswordChangedEmail: jest.fn(),
  sendAdminMfaCodeEmail: jest.fn(),
  sendNewSignupNotificationEmail: jest.fn()
};

const issueSessionMock = jest.fn(() => 'session_token');

jest.unstable_mockModule('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prismaMock)
}));

jest.unstable_mockModule('bcrypt', () => ({
  default: bcryptMock
}));

jest.unstable_mockModule('../../src/middleware/auth.js', () => ({
  authenticateToken: (req, res, next) => next()
}));

jest.unstable_mockModule('../../src/middleware/reauth.js', () => ({
  requireRecentAuth: () => (req, res, next) => next()
}));

jest.unstable_mockModule('../../src/services/emailService.js', () => emailServiceMock);

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
  issueSession: issueSessionMock
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
  process.env.FRONTEND_URL = 'https://app.telyx.ai';
  ({ default: router } = await import('../../src/routes/auth.js'));
});

describe('Auth signup notifications', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/auth', router);

    prismaMock.emailVerificationToken.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.emailVerificationToken.create.mockResolvedValue({ id: 'verify_1' });
    emailServiceMock.sendVerificationEmail.mockResolvedValue({ sent: true });
    emailServiceMock.sendNewSignupNotificationEmail.mockResolvedValue({ sent: true });
  });

  it('sends internal signup notification for register flow with plan details', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (callback) => callback({
      business: {
        create: jest.fn().mockResolvedValue({
          id: 21,
          name: 'Acme',
          businessType: 'OTHER',
          country: 'TR',
          users: [{
            id: 7,
            email: 'owner@example.com',
            name: null,
            role: 'OWNER',
            businessId: 21
          }]
        })
      },
      subscription: {
        create: jest.fn().mockResolvedValue({
          id: 45,
          plan: 'TRIAL'
        })
      }
    }));

    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'owner@example.com',
        password: 'StrongPass123!',
        businessName: 'Acme',
        country: 'TR',
        businessType: 'OTHER'
      });

    expect(response.status).toBe(201);
    expect(issueSessionMock).toHaveBeenCalled();
    expect(emailServiceMock.sendNewSignupNotificationEmail).toHaveBeenCalledWith(expect.objectContaining({
      email: 'owner@example.com',
      businessName: 'Acme',
      country: 'TR',
      businessType: 'OTHER',
      plan: 'TRIAL',
      source: 'register'
    }));
  });

  it('sends internal signup notification for signup flow without invite gating', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (callback) => callback({
      business: {
        create: jest.fn().mockResolvedValue({
          id: 51,
          name: 'Beta Co',
          businessType: 'OTHER',
          country: 'TR'
        })
      },
      user: {
        create: jest.fn().mockResolvedValue({
          id: 9,
          email: 'founder@example.com',
          name: 'Beta Founder',
          role: 'OWNER',
          businessId: 51
        })
      },
      subscription: {
        create: jest.fn().mockResolvedValue({
          id: 61,
          plan: 'TRIAL'
        })
      }
    }));

    const response = await request(app)
      .post('/api/auth/signup')
      .send({
        email: 'founder@example.com',
        password: 'StrongPass123!',
        fullName: 'Beta Founder',
        businessName: 'Beta Co'
      });

    expect(response.status).toBe(201);
    expect(emailServiceMock.sendNewSignupNotificationEmail).toHaveBeenCalledWith(expect.objectContaining({
      email: 'founder@example.com',
      businessName: 'Beta Co',
      userName: 'Beta Founder',
      country: 'TR',
      plan: 'TRIAL',
      source: 'signup'
    }));
  });
});
