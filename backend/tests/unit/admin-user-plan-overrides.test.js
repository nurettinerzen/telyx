import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const prismaMock = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn()
  },
  business: {
    update: jest.fn()
  },
  subscription: {
    update: jest.fn(),
    create: jest.fn()
  }
};

const logAuditActionMock = jest.fn();
const sanitizeResponseMock = jest.fn((value) => value);
const isPhoneInboundEnabledForBusinessRecordMock = jest.fn(() => false);

jest.unstable_mockModule('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prismaMock)
}));

jest.unstable_mockModule('stripe', () => ({
  default: jest.fn(() => ({}))
}));

jest.unstable_mockModule('../../src/middleware/auth.js', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 1, businessId: 11, email: 'admin@telyx.ai' };
    next();
  }
}));

jest.unstable_mockModule('../../src/middleware/adminAuth.js', () => ({
  isAdmin: (req, _res, next) => {
    req.admin = { id: 99, role: 'SUPER_ADMIN', email: 'admin@telyx.ai' };
    next();
  },
  requireAdminMfa: (_req, _res, next) => next(),
  logAuditAction: logAuditActionMock,
  sanitizeResponse: sanitizeResponseMock,
  buildChangesObject: jest.fn(),
  validateBusinessAccess: jest.fn(),
  canAccessBusiness: jest.fn(() => true)
}));

jest.unstable_mockModule('../../src/middleware/auditLog.js', () => ({
  createAdminAuditLog: jest.fn(),
  calculateChanges: jest.fn(),
  auditContext: jest.fn()
}));

jest.unstable_mockModule('../../src/services/stripeEnterpriseService.js', () => ({
  updateEnterpriseStripePrice: jest.fn(),
  hasActiveStripeSubscription: jest.fn()
}));

jest.unstable_mockModule('../../src/services/phoneInboundGate.js', () => ({
  isPhoneInboundEnabledForBusinessRecord: isPhoneInboundEnabledForBusinessRecordMock,
  isPhoneInboundForceDisabled: jest.fn(() => false)
}));

jest.unstable_mockModule('../../src/security/configIntegrity.js', () => ({
  buildSecurityConfigDigest: jest.fn(),
  compareBaselineDigest: jest.fn()
}));

let router;

function buildUserWithSubscription(overrides = {}) {
  const subscription = {
    id: 77,
    plan: 'TRIAL',
    status: 'TRIAL',
    minutesUsed: 0,
    balance: 0,
    minutesLimit: 15,
    concurrentLimit: 1,
    assistantsLimit: 1,
    pendingPlanId: 'ENTERPRISE',
    enterprisePaymentStatus: 'pending',
    enterpriseMinutes: null,
    enterpriseConcurrent: null,
    enterpriseAssistants: null,
    enterpriseSupportInteractions: null,
    enterprisePrice: null,
    ...overrides
  };

  return {
    id: 42,
    email: 'owner@example.com',
    businessId: 11,
    business: {
      id: 11,
      country: 'TR',
      phoneInboundEnabled: false,
      subscription
    }
  };
}

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
  ({ default: router } = await import('../../src/routes/admin.js'));
});

describe('Admin user plan overrides', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/admin', router);

    prismaMock.user.update.mockResolvedValue({});
    prismaMock.business.update.mockResolvedValue({});
    prismaMock.subscription.update.mockResolvedValue({});
    prismaMock.subscription.create.mockResolvedValue({});
    logAuditActionMock.mockResolvedValue({});
  });

  it('activates enterprise directly from the admin user edit flow and clears pending state', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(buildUserWithSubscription({
        plan: 'PRO',
        status: 'ACTIVE',
        minutesLimit: 500,
        concurrentLimit: 2,
        assistantsLimit: 10
      }))
      .mockResolvedValueOnce(buildUserWithSubscription({
        plan: 'ENTERPRISE',
        status: 'ACTIVE',
        minutesLimit: 900,
        concurrentLimit: 3,
        assistantsLimit: 12,
        pendingPlanId: null,
        enterprisePaymentStatus: 'paid',
        enterpriseMinutes: 900,
        enterpriseConcurrent: 3,
        enterpriseAssistants: 12,
        enterpriseSupportInteractions: 5000,
        enterprisePrice: 2500
      }));

    const response = await request(app)
      .patch('/api/admin/users/42')
      .send({
        plan: 'ENTERPRISE',
        minutesLimit: 900,
        enterpriseSupportInteractions: 5000,
        concurrentLimit: 3,
        assistantsLimit: 12,
        enterprisePrice: 2500
      });

    expect(response.status).toBe(200);
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: 77 },
      data: expect.objectContaining({
        plan: 'ENTERPRISE',
        status: 'ACTIVE',
        minutesLimit: 900,
        enterpriseSupportInteractions: 5000,
        concurrentLimit: 3,
        assistantsLimit: 12,
        pendingPlanId: null,
        enterprisePaymentStatus: 'paid',
        enterpriseMinutes: 900,
        enterpriseConcurrent: 3,
        enterpriseAssistants: 12,
        enterprisePrice: 2500
      })
    });
    expect(sanitizeResponseMock).toHaveBeenCalled();
  });

  it('keeps non-enterprise manual overrides and removes stale enterprise payment waiting state', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(buildUserWithSubscription())
      .mockResolvedValueOnce(buildUserWithSubscription({
        plan: 'PRO',
        status: 'ACTIVE',
        minutesLimit: 740,
        concurrentLimit: 4,
        assistantsLimit: 12,
        pendingPlanId: null,
        enterprisePaymentStatus: null,
        enterpriseSupportInteractions: 3100
      }));

    const response = await request(app)
      .patch('/api/admin/users/42')
      .send({
        plan: 'PRO',
        minutesLimit: 740,
        enterpriseSupportInteractions: 3100,
        concurrentLimit: 4,
        assistantsLimit: 12
      });

    expect(response.status).toBe(200);
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: 77 },
      data: expect.objectContaining({
        plan: 'PRO',
        status: 'ACTIVE',
        minutesLimit: 740,
        enterpriseSupportInteractions: 3100,
        concurrentLimit: 4,
        assistantsLimit: 12,
        pendingPlanId: null,
        enterprisePaymentStatus: null,
        trialStartDate: null,
        trialChatExpiry: null
      })
    });
    expect(prismaMock.subscription.update.mock.calls[0][0].data.enterpriseMinutes).toBeUndefined();
    expect(prismaMock.subscription.update.mock.calls[0][0].data.enterpriseConcurrent).toBeUndefined();
    expect(prismaMock.subscription.update.mock.calls[0][0].data.enterpriseAssistants).toBeUndefined();
  });
});
