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

const verifyIdTokenMock = jest.fn();

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

jest.unstable_mockModule('google-auth-library', () => ({
  OAuth2Client: jest.fn(() => ({
    verifyIdToken: verifyIdTokenMock
  }))
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
  process.env.GOOGLE_CLIENT_ID = 'google-client-id';
  ({ default: router } = await import('../../src/routes/auth.js'));
});

describe('Auth Google signup notifications', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/auth', router);

    prismaMock.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 17,
      email: 'google-owner@example.com',
      name: 'Google Owner',
      role: 'OWNER',
      businessId: 71,
      emailVerified: true,
      business: {
        id: 71,
        name: 'Google Co',
        country: 'TR',
        subscription: {
          plan: 'TRIAL'
        }
      }
    });
    prismaMock.emailVerificationToken.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.emailVerificationToken.create.mockResolvedValue({ id: 'verify_google' });
    prismaMock.$transaction.mockImplementation(async (callback) => callback({
      business: {
        create: jest.fn().mockResolvedValue({
          id: 71,
          name: 'Google Co',
          users: [{
            id: 17,
            email: 'google-owner@example.com',
            name: 'Google Owner',
            role: 'OWNER',
            businessId: 71,
            emailVerified: true
          }]
        })
      },
      subscription: {
        create: jest.fn().mockResolvedValue({
          id: 81,
          plan: 'TRIAL'
        })
      }
    }));

    verifyIdTokenMock.mockResolvedValue({
      getPayload: () => ({
        email: 'google-owner@example.com',
        name: 'Google Owner',
        picture: 'https://example.com/avatar.png',
        email_verified: true
      })
    });

    emailServiceMock.sendVerificationEmail.mockResolvedValue({ sent: true });
    emailServiceMock.sendNewSignupNotificationEmail.mockResolvedValue({ sent: true });
  });

  it('sends internal notification when a new owner account is created via Google OAuth', async () => {
    const response = await request(app)
      .post('/api/auth/google')
      .send({
        credential: 'google_credential_token'
      });

    expect(response.status).toBe(200);
    expect(response.body.isNewUser).toBe(true);
    expect(emailServiceMock.sendNewSignupNotificationEmail).toHaveBeenCalledWith(expect.objectContaining({
      email: 'google-owner@example.com',
      businessName: 'Google Co',
      userName: 'Google Owner',
      country: 'TR',
      plan: 'TRIAL',
      source: 'google_oauth'
    }));
  });
});
