import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const prismaMock = {
  subscription: {
    findUnique: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn()
  },
  chatLog: {
    count: jest.fn()
  },
  emailMessage: {
    count: jest.fn()
  }
};

const getEffectivePlanConfigMock = jest.fn();
const isPhoneInboundEnabledForBusinessRecordMock = jest.fn();
const buildPhoneEntitlementsMock = jest.fn();
const getAddOnCatalogMock = jest.fn();
const getBillingPlanDefinitionMock = jest.fn();
const getWrittenUsageSummaryMock = jest.fn();
const resolvePlanFromStripePriceIdMock = jest.fn();
const resolveStripePriceIdForPlanMock = jest.fn();
const stripeServiceMock = {
  ensureCustomer: jest.fn(),
  createAddonCheckoutSession: jest.fn(),
  resolveCheckoutLocale: jest.fn(() => 'tr')
};

jest.unstable_mockModule('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prismaMock)
}));

jest.unstable_mockModule('../../src/middleware/auth.js', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: 8, businessId: 11, email: 'owner@example.com' };
    req.userId = 8;
    req.businessId = 11;
    next();
  },
  verifyBusinessAccess: (req, res, next) => {
    req.user = { id: 8, businessId: 11, email: 'owner@example.com' };
    next();
  }
}));

jest.unstable_mockModule('../../src/services/emailService.js', () => ({
  default: {}
}));

jest.unstable_mockModule('../../src/services/paymentProvider.js', () => ({
  default: {}
}));

jest.unstable_mockModule('../../src/services/balanceService.js', () => ({
  default: {}
}));

jest.unstable_mockModule('../../src/services/planConfig.js', () => ({
  getEffectivePlanConfig: getEffectivePlanConfigMock
}));

jest.unstable_mockModule('../../src/services/phoneInboundGate.js', () => ({
  isPhoneInboundEnabledForBusinessRecord: isPhoneInboundEnabledForBusinessRecordMock
}));

jest.unstable_mockModule('../../src/services/phonePlanEntitlements.js', () => ({
  buildPhoneEntitlements: buildPhoneEntitlementsMock
}));

jest.unstable_mockModule('../../src/services/stripe.js', () => ({
  default: stripeServiceMock
}));

jest.unstable_mockModule('../../src/config/billingCatalog.js', () => ({
  getAddOnCatalog: getAddOnCatalogMock,
  getBillingPlanDefinition: getBillingPlanDefinitionMock
}));

jest.unstable_mockModule('../../src/services/writtenUsageService.js', () => ({
  getWrittenUsageSummary: getWrittenUsageSummaryMock
}));

jest.unstable_mockModule('../../src/services/stripePlanCatalog.js', () => ({
  resolvePlanFromStripePriceId: resolvePlanFromStripePriceIdMock,
  resolveStripePriceIdForPlan: resolveStripePriceIdForPlanMock
}));

let router;

beforeAll(async () => {
  ({ default: router } = await import('../../src/routes/subscription.js'));
});

describe('Subscription add-on checkout customer recovery', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    process.env.FRONTEND_URL = 'https://telyx.ai';

    app = express();
    app.use(express.json());
    app.use('/api/subscription', router);

    prismaMock.subscription.findUnique.mockResolvedValue({
      id: 33,
      businessId: 11,
      plan: 'PRO',
      paymentProvider: 'stripe',
      stripeCustomerId: 'cus_stale',
      business: {
        country: 'TR',
        name: 'Acme',
        users: [{ email: 'owner@example.com' }]
      }
    });
    prismaMock.subscription.update.mockResolvedValue({});
    prismaMock.chatLog.count.mockResolvedValue(0);
    prismaMock.emailMessage.count.mockResolvedValue(0);

    getEffectivePlanConfigMock.mockReturnValue({});
    isPhoneInboundEnabledForBusinessRecordMock.mockReturnValue(false);
    buildPhoneEntitlementsMock.mockReturnValue({});
    getBillingPlanDefinitionMock.mockReturnValue({ plan: 'PRO' });
    getWrittenUsageSummaryMock.mockResolvedValue(null);
    resolvePlanFromStripePriceIdMock.mockReturnValue(null);
    resolveStripePriceIdForPlanMock.mockReturnValue(null);
    getAddOnCatalogMock.mockReturnValue({
      written: [
        { id: 'written-500', quantity: 500, unitPrice: 2.5, amount: 1250 }
      ],
      voice: []
    });
    stripeServiceMock.ensureCustomer.mockResolvedValue({
      customer: { id: 'cus_fresh' },
      recreated: true
    });
    stripeServiceMock.createAddonCheckoutSession.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.test/session'
    });
  });

  it('recreates stale stripe customer ids before opening add-on checkout', async () => {
    const response = await request(app)
      .post('/api/subscription/addons/checkout')
      .send({ kind: 'WRITTEN', packageId: 'written-500' });

    expect(response.status).toBe(200);
    expect(stripeServiceMock.ensureCustomer).toHaveBeenCalledWith({
      stripeCustomerId: 'cus_stale',
      email: 'owner@example.com',
      name: 'Acme',
      countryCode: 'TR',
      metadata: { businessId: 11 }
    });
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: 33 },
      data: {
        stripeCustomerId: 'cus_fresh',
        paymentProvider: 'stripe'
      }
    });
    expect(stripeServiceMock.createAddonCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeCustomerId: 'cus_fresh',
        addOnKind: 'WRITTEN',
        packageId: 'written-500'
      })
    );
    expect(response.body.sessionUrl).toBe('https://checkout.stripe.test/session');
  });
});
