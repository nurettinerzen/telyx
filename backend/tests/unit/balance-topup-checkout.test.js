import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const prismaMock = {
  subscription: {
    findUnique: jest.fn(),
    update: jest.fn()
  },
  chatLog: {
    findMany: jest.fn()
  }
};

const stripeServiceMock = {
  ensureCustomer: jest.fn(),
  createCreditPurchaseSession: jest.fn()
};

const getWrittenUsageSummaryMock = jest.fn();
const getBillingPlanDefinitionMock = jest.fn();

jest.unstable_mockModule('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prismaMock)
}));

jest.unstable_mockModule('../../src/middleware/auth.js', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: 8, businessId: 11, email: 'owner@example.com' };
    req.userId = 8;
    req.businessId = 11;
    next();
  }
}));

jest.unstable_mockModule('../../src/services/balanceService.js', () => ({
  default: {
    getTransactions: jest.fn(),
    updateAutoReloadSettings: jest.fn()
  }
}));

jest.unstable_mockModule('../../src/services/stripe.js', () => ({
  default: stripeServiceMock
}));

jest.unstable_mockModule('../../src/services/writtenUsageService.js', () => ({
  getWrittenUsageSummary: getWrittenUsageSummaryMock
}));

jest.unstable_mockModule('../../src/config/billingCatalog.js', () => ({
  getBillingPlanDefinition: getBillingPlanDefinitionMock
}));

jest.unstable_mockModule('../../src/config/plans.js', () => ({
  getPricePerMinute: jest.fn(() => 25),
  getMinTopupMinutes: jest.fn(() => 4),
  calculateTLToMinutes: jest.fn((amount) => Math.floor(Number(amount || 0) / 25)),
  getIncludedMinutes: jest.fn(() => 500),
  isPrepaidPlan: jest.fn(() => true),
  isPostpaidPlan: jest.fn(() => false),
  getPaymentModel: jest.fn(() => 'PREPAID'),
  getFixedOveragePrice: jest.fn(() => 23),
  getTokenPricePerK: jest.fn(() => ({ input: 0, output: 0 }))
}));

let router;

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
  process.env.FRONTEND_URL = 'https://telyx.ai';
  ({ default: router } = await import('../../src/routes/balance.js'));
});

describe('Balance top-up checkout', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();

    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    process.env.FRONTEND_URL = 'https://telyx.ai';

    app = express();
    app.use(express.json());
    app.use('/api/balance', router);

    prismaMock.chatLog.findMany.mockResolvedValue([]);
    prismaMock.subscription.update.mockResolvedValue({});
    getWrittenUsageSummaryMock.mockResolvedValue(null);
    getBillingPlanDefinitionMock.mockReturnValue({
      writtenInteractionUnitPrice: 2.5
    });
    stripeServiceMock.ensureCustomer.mockResolvedValue({
      customer: { id: 'cus_payg_123' },
      recreated: true
    });
    stripeServiceMock.createCreditPurchaseSession.mockResolvedValue({
      id: 'cs_payg_123',
      url: 'https://checkout.stripe.test/payg-topup'
    });
  });

  it('creates a Stripe checkout session for PAYG wallet top-up and repairs stale customers', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: 33,
      businessId: 11,
      plan: 'PAYG',
      paymentProvider: 'stripe',
      stripeCustomerId: 'cus_stale',
      balance: 0,
      business: {
        country: 'TR',
        name: 'Acme',
        users: [{ email: 'owner@example.com' }]
      }
    });

    const response = await request(app)
      .post('/api/balance/topup')
      .send({ amount: 250 });

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
        stripeCustomerId: 'cus_payg_123',
        paymentProvider: 'stripe'
      }
    });
    expect(stripeServiceMock.createCreditPurchaseSession).toHaveBeenCalledWith({
      stripeCustomerId: 'cus_payg_123',
      minutes: 10,
      amount: 250,
      currency: 'TRY',
      countryCode: 'TR',
      successUrl: 'https://telyx.ai/dashboard/subscription?wallet_topup=success&session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://telyx.ai/dashboard/subscription?wallet_topup=cancel',
      businessId: '11',
      checkoutLocale: undefined
    });
    expect(response.body.sessionUrl).toBe('https://checkout.stripe.test/payg-topup');
  });

  it('blocks top-up checkout for recurring plans', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: 33,
      businessId: 11,
      plan: 'PRO',
      paymentProvider: 'stripe',
      stripeCustomerId: 'cus_live',
      balance: 0,
      business: {
        country: 'TR',
        name: 'Acme',
        users: [{ email: 'owner@example.com' }]
      }
    });

    const response = await request(app)
      .post('/api/balance/topup')
      .send({ amount: 250 });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Bakiye yükleme sadece Kullandıkça Öde planında kullanılabilir/i);
    expect(stripeServiceMock.createCreditPurchaseSession).not.toHaveBeenCalled();
  });
});
