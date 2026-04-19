import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const prismaMock = {
  subscription: {
    findUnique: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn()
  },
  billingTrialClaim: {
    findUnique: jest.fn(),
    upsert: jest.fn()
  },
  user: {
    findFirst: jest.fn()
  },
  chatLog: {
    count: jest.fn()
  },
  emailMessage: {
    count: jest.fn()
  }
};

const stripeClientMock = {
  checkout: {
    sessions: {
      create: jest.fn()
    }
  },
  subscriptions: {
    retrieve: jest.fn(),
    update: jest.fn()
  },
  billingPortal: {
    sessions: {
      create: jest.fn()
    }
  },
  prices: {
    retrieve: jest.fn()
  },
  webhooks: {
    constructEvent: jest.fn()
  }
};

const stripeServiceMock = {
  ensureCustomer: jest.fn(),
  createWrittenOverageInvoice: jest.fn(),
  resolveCheckoutLocale: jest.fn(() => 'tr')
};

const paymentProviderMock = {
  getProviderForCountry: jest.fn()
};

const getEffectivePlanConfigMock = jest.fn();
const isPhoneInboundEnabledForBusinessRecordMock = jest.fn();
const buildPhoneEntitlementsMock = jest.fn();
const getAddOnCatalogMock = jest.fn();
const getBillingPlanDefinitionMock = jest.fn();
const getWrittenUsageSummaryMock = jest.fn();
const resolvePlanFromStripePriceIdMock = jest.fn();
const resolveStripePriceIdForPlanMock = jest.fn();
const logAuditEventMock = jest.fn();

jest.unstable_mockModule('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prismaMock)
}));

jest.unstable_mockModule('stripe', () => ({
  default: jest.fn(() => stripeClientMock)
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
    req.userId = 8;
    req.businessId = 11;
    next();
  }
}));

jest.unstable_mockModule('../../src/services/emailService.js', () => ({
  default: {}
}));

jest.unstable_mockModule('../../src/services/paymentProvider.js', () => ({
  default: paymentProviderMock
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

jest.unstable_mockModule('../../src/utils/auditLogger.js', () => ({
  logAuditEvent: logAuditEventMock
}));

let router;

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
  process.env.FRONTEND_URL = 'https://telyx.ai';
  ({ default: router } = await import('../../src/routes/subscription.js'));
});

describe('Subscription lifecycle routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();

    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    process.env.FRONTEND_URL = 'https://telyx.ai';

    app = express();
    app.use(express.json());
    app.use('/api/subscription', router);

    paymentProviderMock.getProviderForCountry.mockReturnValue('stripe');
    stripeServiceMock.ensureCustomer.mockResolvedValue({
      customer: { id: 'cus_test_123' },
      recreated: false
    });
    logAuditEventMock.mockResolvedValue(undefined);

    prismaMock.user.findFirst.mockResolvedValue({
      id: 8,
      email: 'owner@example.com',
      business: {
        id: 11,
        name: 'Acme',
        country: 'TR'
      }
    });
    prismaMock.subscription.upsert.mockResolvedValue({});
    prismaMock.subscription.update.mockResolvedValue({});
    prismaMock.billingTrialClaim.findUnique.mockResolvedValue(null);
    prismaMock.billingTrialClaim.upsert.mockResolvedValue({});
    prismaMock.chatLog.count.mockResolvedValue(0);
    prismaMock.emailMessage.count.mockResolvedValue(0);

    getEffectivePlanConfigMock.mockReturnValue({});
    isPhoneInboundEnabledForBusinessRecordMock.mockReturnValue(false);
    buildPhoneEntitlementsMock.mockReturnValue({});
    getAddOnCatalogMock.mockReturnValue({ written: [], voice: [] });
    getBillingPlanDefinitionMock.mockReturnValue({
      plan: 'PRO',
      billingModel: 'recurring',
      channels: { webchat: true, whatsapp: true, email: true, phone: true },
      concurrentCallLimit: 2,
      assistantLimit: 10,
      writtenInteractionUnitPrice: 2.5,
      voiceMinuteUnitPrice: 23
    });
    getWrittenUsageSummaryMock.mockResolvedValue({
      used: 0,
      total: 0,
      overage: 0,
      channels: { webchat: 0, whatsapp: 0, email: 0 }
    });
    resolvePlanFromStripePriceIdMock.mockReturnValue(null);
    resolveStripePriceIdForPlanMock.mockImplementation((planId, countryCode, fallbackPriceId) => {
      if (countryCode !== 'TR') {
        return fallbackPriceId || null;
      }
      if (planId === 'STARTER') return 'price_starter_try';
      if (planId === 'PRO') return 'price_pro_try';
      if (planId === 'ENTERPRISE') return 'price_enterprise_try';
      return fallbackPriceId || null;
    });
    stripeClientMock.checkout.sessions.create.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.test/session'
    });
    stripeClientMock.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_test_123',
      cancel_at_period_end: false,
      current_period_end: 1770000000,
      items: {
        data: [{ id: 'si_test_123', price: { id: 'price_starter_try' } }]
      }
    });
    stripeClientMock.subscriptions.update.mockResolvedValue({
      id: 'sub_test_123',
      current_period_end: 1770000000
    });
    stripeClientMock.billingPortal.sessions.create.mockResolvedValue({
      url: 'https://billing.stripe.test/session'
    });
  });

  it('creates a Stripe checkout session for a new paid plan subscription', async () => {
    prismaMock.subscription.findUnique
      .mockResolvedValueOnce({
        id: 33,
        businessId: 11,
        plan: 'FREE',
        status: 'ACTIVE',
        stripeCustomerId: null,
        paymentProvider: null
      })
      .mockResolvedValueOnce({
        id: 33,
        businessId: 11,
        plan: 'FREE',
        status: 'ACTIVE',
        stripeSubscriptionId: null
      });

    const response = await request(app)
      .post('/api/subscription/upgrade')
      .send({ planId: 'starter' });

    expect(response.status).toBe(200);
    expect(response.body.type).toBe('new');
    expect(stripeClientMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_test_123',
        mode: 'subscription',
        line_items: [{ price: 'price_starter_try', quantity: 1 }],
        metadata: expect.objectContaining({
          businessId: '11',
          priceId: 'price_starter_try',
          planId: 'STARTER'
        })
      })
    );
  });

  it('applies Stripe proration immediately for upgrades', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: 33,
      businessId: 11,
      plan: 'STARTER',
      status: 'ACTIVE',
      stripeCustomerId: 'cus_test_123',
      stripeSubscriptionId: 'sub_test_123',
      paymentProvider: 'stripe'
    });

    const response = await request(app)
      .post('/api/subscription/upgrade')
      .send({ planId: 'PRO' });

    expect(response.status).toBe(200);
    expect(response.body.type).toBe('upgrade');
    expect(stripeClientMock.subscriptions.update).toHaveBeenCalledWith('sub_test_123', {
      items: [{ id: 'si_test_123', price: 'price_pro_try' }],
      proration_behavior: 'always_invoice',
      payment_behavior: 'error_if_incomplete',
      metadata: { planId: 'PRO' }
    });
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { businessId: 11 },
      data: expect.objectContaining({
        plan: 'PRO',
        minutesLimit: 500,
        assistantsLimit: 10
      })
    });
  });

  it('schedules downgrades for the next billing period', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: 33,
      businessId: 11,
      plan: 'PRO',
      status: 'ACTIVE',
      stripeCustomerId: 'cus_test_123',
      stripeSubscriptionId: 'sub_test_123',
      paymentProvider: 'stripe'
    });
    stripeClientMock.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_test_123',
      cancel_at_period_end: false,
      current_period_end: 1770000000,
      items: {
        data: [{ id: 'si_test_123', price: { id: 'price_pro_try' } }]
      }
    });

    const response = await request(app)
      .post('/api/subscription/upgrade')
      .send({ planId: 'STARTER' });

    expect(response.status).toBe(200);
    expect(response.body.type).toBe('downgrade');
    expect(stripeClientMock.subscriptions.update).toHaveBeenCalledWith('sub_test_123', {
      items: [{ id: 'si_test_123', price: 'price_starter_try' }],
      proration_behavior: 'none',
      billing_cycle_anchor: 'unchanged',
      metadata: { pendingPlanId: 'STARTER' }
    });
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { businessId: 11 },
      data: { pendingPlanId: 'STARTER' }
    });
  });

  it('cancels active Stripe subscriptions at period end', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: 33,
      businessId: 11,
      plan: 'PRO',
      status: 'ACTIVE',
      paymentProvider: 'stripe',
      stripeSubscriptionId: 'sub_test_123'
    });
    stripeClientMock.subscriptions.update.mockResolvedValue({
      current_period_end: 1770000000
    });

    const response = await request(app).post('/api/subscription/cancel').send({});

    expect(response.status).toBe(200);
    expect(stripeClientMock.subscriptions.update).toHaveBeenCalledWith('sub_test_123', {
      cancel_at_period_end: true
    });
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { businessId: 11 },
      data: { cancelAtPeriodEnd: true }
    });
    expect(logAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'subscription_cancel_requested',
      actorUserId: 8,
      businessId: 11,
      metadata: expect.objectContaining({
        subscriptionId: 33,
        plan: 'PRO',
        stripeSubscriptionId: 'sub_test_123',
        reasonCode: 'UNSPECIFIED',
        reasonDetail: null,
        source: 'dashboard_subscription'
      })
    }));
  });

  it('saves post-cancel feedback separately', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: 33,
      businessId: 11,
      plan: 'PRO',
      status: 'ACTIVE',
      paymentProvider: 'stripe',
      stripeSubscriptionId: 'sub_test_123'
    });
    const response = await request(app)
      .post('/api/subscription/cancellation-feedback')
      .send({
        reasonCode: 'LOW_QUALITY',
        reasonDetail: 'Canli chat cevaplari bekledigim kadar iyi degil.'
      });

    expect(response.status).toBe(200);
    expect(logAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'subscription_cancellation_feedback_submitted',
      metadata: expect.objectContaining({
        reasonCode: 'LOW_QUALITY',
        reasonDetail: 'Canli chat cevaplari bekledigim kadar iyi degil.',
        source: 'dashboard_subscription_post_cancel'
      })
    }));
  });

  it('reactivates Stripe subscriptions by clearing period-end cancellation', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: 33,
      businessId: 11,
      plan: 'PRO',
      status: 'ACTIVE',
      paymentProvider: 'stripe',
      stripeSubscriptionId: 'sub_test_123'
    });

    const response = await request(app).post('/api/subscription/reactivate').send({});

    expect(response.status).toBe(200);
    expect(stripeClientMock.subscriptions.update).toHaveBeenCalledWith('sub_test_123', {
      cancel_at_period_end: false
    });
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { businessId: 11 },
      data: { cancelAtPeriodEnd: false }
    });
  });

  it('reverts a scheduled downgrade by restoring the current plan price in Stripe', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: 33,
      businessId: 11,
      plan: 'PRO',
      status: 'ACTIVE',
      paymentProvider: 'stripe',
      stripeSubscriptionId: 'sub_test_123',
      stripePriceId: null,
      pendingPlanId: 'STARTER',
      cancelAtPeriodEnd: false
    });

    const response = await request(app).post('/api/subscription/undo-scheduled-change').send({});

    expect(response.status).toBe(200);
    expect(stripeClientMock.subscriptions.update).toHaveBeenCalledWith('sub_test_123', {
      items: [{ id: 'si_test_123', price: 'price_pro_try' }],
      proration_behavior: 'none',
      billing_cycle_anchor: 'unchanged',
      metadata: {
        planId: 'PRO',
        pendingPlanId: ''
      }
    });
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { businessId: 11 },
      data: {
        pendingPlanId: null,
        stripePriceId: 'price_pro_try'
      }
    });
  });

  it('reverts a scheduled PAYG switch by clearing period-end cancellation', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: 33,
      businessId: 11,
      plan: 'PRO',
      status: 'ACTIVE',
      paymentProvider: 'stripe',
      stripeSubscriptionId: 'sub_test_123',
      stripePriceId: 'price_pro_try',
      pendingPlanId: 'PAYG',
      cancelAtPeriodEnd: true
    });

    const response = await request(app).post('/api/subscription/undo-scheduled-change').send({});

    expect(response.status).toBe(200);
    expect(stripeClientMock.subscriptions.update).toHaveBeenCalledWith('sub_test_123', {
      cancel_at_period_end: false,
      metadata: {
        pendingPlanId: ''
      }
    });
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { businessId: 11 },
      data: {
        pendingPlanId: null,
        cancelAtPeriodEnd: false
      }
    });
  });

  it('starts a trial exactly once per business until trial usage is exhausted', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    prismaMock.subscription.upsert.mockResolvedValue({
      id: 44,
      businessId: 11,
      plan: 'TRIAL',
      status: 'ACTIVE'
    });

    const response = await request(app).post('/api/subscription/start-trial').send({});

    expect(response.status).toBe(200);
    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId: 11 },
        create: expect.objectContaining({
          plan: 'TRIAL',
          status: 'ACTIVE'
        }),
        update: expect.objectContaining({
          plan: 'TRIAL',
          status: 'ACTIVE'
        })
      })
    );
    expect(response.body.subscription.plan).toBe('TRIAL');
    expect(response.body.subscription.trialMinutes).toBe(15);
  });

  it('blocks repeated trial claims for owner emails already used in another business', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: 44,
      businessId: 11,
      plan: 'FREE',
      status: 'ACTIVE',
      trialMinutesUsed: 0
    });
    prismaMock.billingTrialClaim.findUnique.mockResolvedValue({
      id: 'trial_claim_1',
      normalizedEmail: 'owner@example.com',
      firstBusinessId: 99
    });

    const response = await request(app).post('/api/subscription/start-trial').send({});

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('TRIAL_ALREADY_CLAIMED');
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
  });

  it('switches free or trial users to PAYG immediately', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: 33,
      businessId: 11,
      plan: 'TRIAL',
      status: 'ACTIVE',
      balance: 0
    });
    prismaMock.subscription.upsert.mockResolvedValue({
      id: 33,
      businessId: 11,
      plan: 'PAYG',
      balance: 0
    });

    const response = await request(app)
      .post('/api/subscription/switch-to-payg')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.subscription.plan).toBe('PAYG');
    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId: 11 },
        update: expect.objectContaining({
          plan: 'PAYG',
          status: 'ACTIVE',
          pendingPlanId: null,
          stripeSubscriptionId: null,
          stripePriceId: null
        })
      })
    );
  });

  it('schedules PAYG transition at period end for active paid subscriptions', async () => {
    const periodEnd = new Date('2026-04-30T00:00:00.000Z');
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: 33,
      businessId: 11,
      plan: 'PRO',
      status: 'ACTIVE',
      stripeSubscriptionId: 'sub_test_123',
      currentPeriodEnd: periodEnd
    });

    const response = await request(app)
      .post('/api/subscription/switch-to-payg')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.scheduled).toBe(true);
    expect(stripeClientMock.subscriptions.update).toHaveBeenCalledWith('sub_test_123', {
      cancel_at_period_end: true
    });
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { businessId: 11 },
      data: {
        cancelAtPeriodEnd: true,
        pendingPlanId: 'PAYG'
      }
    });
  });

  it('creates a Stripe billing portal session for subscription management', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: 33,
      businessId: 11,
      stripeCustomerId: 'cus_test_123'
    });

    const response = await request(app)
      .post('/api/subscription/create-portal-session')
      .send({});

    expect(response.status).toBe(200);
    expect(stripeClientMock.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_test_123',
      return_url: 'https://telyx.ai/dashboard/settings?tab=billing'
    });
    expect(response.body.portalUrl).toBe('https://billing.stripe.test/session');
  });
});
