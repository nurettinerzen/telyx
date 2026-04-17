import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const prismaMock = {
  subscription: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn()
  },
  balanceTransaction: {
    findFirst: jest.fn()
  },
  writtenUsageEvent: {
    count: jest.fn()
  },
  addOnPurchase: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  }
};

const stripeClientMock = {
  webhooks: {
    constructEvent: jest.fn()
  },
  subscriptions: {
    retrieve: jest.fn()
  },
  prices: {
    retrieve: jest.fn()
  }
};

const stripeServiceMock = {
  createWrittenOverageInvoice: jest.fn()
};

const emailServiceMock = {
  sendPaymentFailedEmail: jest.fn(),
  sendPaymentSuccessEmail: jest.fn()
};

const getEffectivePlanConfigMock = jest.fn();
const isPhoneInboundEnabledForBusinessRecordMock = jest.fn();
const buildPhoneEntitlementsMock = jest.fn();
const getAddOnCatalogMock = jest.fn();
const getBillingPlanDefinitionMock = jest.fn();
const getWrittenUsageSummaryMock = jest.fn();
const resolvePlanFromStripePriceIdMock = jest.fn();
const resolveStripePriceIdForPlanMock = jest.fn();

jest.unstable_mockModule('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prismaMock)
}));

jest.unstable_mockModule('stripe', () => ({
  default: jest.fn(() => stripeClientMock)
}));

jest.unstable_mockModule('../../src/middleware/auth.js', () => ({
  authenticateToken: (req, res, next) => next(),
  verifyBusinessAccess: (req, res, next) => next()
}));

jest.unstable_mockModule('../../src/services/emailService.js', () => ({
  default: emailServiceMock
}));

jest.unstable_mockModule('../../src/services/paymentProvider.js', () => ({
  default: {}
}));

jest.unstable_mockModule('../../src/services/balanceService.js', () => ({
  default: {
    topUp: jest.fn()
  }
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
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_mock';
  ({ default: router } = await import('../../src/routes/subscription.js'));
});

describe('Subscription webhook lifecycle', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();

    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_mock';

    app = express();
    app.use('/api/subscription', router);

    getEffectivePlanConfigMock.mockReturnValue({});
    isPhoneInboundEnabledForBusinessRecordMock.mockReturnValue(false);
    buildPhoneEntitlementsMock.mockReturnValue({});
    getAddOnCatalogMock.mockReturnValue({ written: [], voice: [] });
    getBillingPlanDefinitionMock.mockReturnValue({
      plan: 'PRO',
      billingModel: 'recurring',
      overageAllowed: { written: true }
    });
    getWrittenUsageSummaryMock.mockResolvedValue({
      used: 100,
      total: 500,
      overage: 0,
      channels: { webchat: 60, whatsapp: 20, email: 20 }
    });
    resolvePlanFromStripePriceIdMock.mockImplementation((priceId) => {
      if (priceId === 'price_pro_try') return 'PRO';
      if (priceId === 'price_starter_try') return 'STARTER';
      return null;
    });
    resolveStripePriceIdForPlanMock.mockReturnValue(null);
    prismaMock.subscription.updateMany.mockResolvedValue({});
    prismaMock.subscription.update.mockResolvedValue({});
    prismaMock.writtenUsageEvent.count.mockResolvedValue(0);
    stripeServiceMock.createWrittenOverageInvoice.mockResolvedValue({
      invoiceId: 'in_test_123'
    });
  });

  it('resets recurring add-on balances on renewal webhook', async () => {
    stripeClientMock.webhooks.constructEvent.mockReturnValue({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_test_123',
          status: 'active',
          cancel_at_period_end: false,
          current_period_start: 1770000000,
          current_period_end: 1772592000,
          items: {
            data: [{ price: { id: 'price_pro_try' } }]
          }
        }
      }
    });
    prismaMock.subscription.findFirst.mockResolvedValue({
      id: 33,
      businessId: 11,
      stripeSubscriptionId: 'sub_test_123',
      currentPeriodStart: new Date('2026-02-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
      stripeCustomerId: 'cus_test_123',
      business: {
        country: 'TR',
        name: 'Acme'
      }
    });

    const response = await request(app)
      .post('/api/subscription/webhook')
      .set('stripe-signature', 'sig_test')
      .set('content-type', 'application/json')
      .send('{}');

    expect(response.status).toBe(200);
    expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: 'sub_test_123' },
      data: expect.objectContaining({
        plan: 'PRO',
        status: 'ACTIVE',
        voiceAddOnMinutesBalance: 0,
        writtenInteractionAddOnBalance: 0,
        includedMinutesUsed: 0
      })
    });
  });

  it('marks subscriptions past due and emails the owner when invoice payment fails', async () => {
    stripeClientMock.webhooks.constructEvent.mockReturnValue({
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_test_123',
          customer: 'cus_test_123'
        }
      }
    });
    prismaMock.subscription.findFirst.mockResolvedValue({
      business: {
        name: 'Acme',
        users: [{ email: 'owner@example.com' }]
      }
    });

    const response = await request(app)
      .post('/api/subscription/webhook')
      .set('stripe-signature', 'sig_test')
      .set('content-type', 'application/json')
      .send('{}');

    expect(response.status).toBe(200);
    expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith({
      where: { stripeCustomerId: 'cus_test_123' },
      data: { status: 'PAST_DUE' }
    });
    expect(emailServiceMock.sendPaymentFailedEmail).toHaveBeenCalledWith(
      'owner@example.com',
      'Acme'
    );
  });

  it('activates enterprise entitlements when Stripe creates the enterprise subscription', async () => {
    stripeClientMock.webhooks.constructEvent.mockReturnValue({
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_ent_123',
          customer: 'cus_ent_123',
          current_period_start: 1770000000,
          current_period_end: 1772592000,
          items: {
            data: [{ price: { id: 'price_ent_123' } }]
          }
        }
      }
    });
    stripeClientMock.prices.retrieve.mockResolvedValue({
      metadata: {
        type: 'enterprise',
        subscriptionId: '77'
      }
    });
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: 77,
      pendingPlanId: 'ENTERPRISE',
      enterpriseMinutes: 900,
      enterpriseConcurrent: 3,
      enterpriseAssistants: 12
    });

    const response = await request(app)
      .post('/api/subscription/webhook')
      .set('stripe-signature', 'sig_test')
      .set('content-type', 'application/json')
      .send('{}');

    expect(response.status).toBe(200);
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: 77 },
      data: expect.objectContaining({
        plan: 'ENTERPRISE',
        pendingPlanId: null,
        enterprisePaymentStatus: 'paid',
        stripeSubscriptionId: 'sub_ent_123',
        stripeCustomerId: 'cus_ent_123',
        minutesLimit: 900,
        concurrentLimit: 3,
        assistantsLimit: 12
      })
    });
  });

  it('downgrades canceled Stripe subscriptions back to FREE', async () => {
    stripeClientMock.webhooks.constructEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_test_123'
        }
      }
    });

    const response = await request(app)
      .post('/api/subscription/webhook')
      .set('stripe-signature', 'sig_test')
      .set('content-type', 'application/json')
      .send('{}');

    expect(response.status).toBe(200);
    expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: 'sub_test_123' },
      data: expect.objectContaining({
        plan: 'FREE',
        status: 'CANCELED',
        stripeSubscriptionId: null,
        stripePriceId: null,
        voiceAddOnMinutesBalance: 0,
        writtenInteractionAddOnBalance: 0
      })
    });
  });
});
