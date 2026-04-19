import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const prismaMock = {
  subscription: {
    findUnique: jest.fn()
  },
  chatLog: {
    findMany: jest.fn()
  }
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
  default: {
    createCustomer: jest.fn(),
    createCreditPurchaseSession: jest.fn()
  }
}));

jest.unstable_mockModule('../../src/services/writtenUsageService.js', () => ({
  getWrittenUsageSummary: getWrittenUsageSummaryMock
}));

jest.unstable_mockModule('../../src/config/billingCatalog.js', () => ({
  getBillingPlanDefinition: getBillingPlanDefinitionMock
}));

jest.unstable_mockModule('../../src/config/plans.js', () => ({
  getPricePerMinute: jest.fn(() => 23),
  getMinTopupMinutes: jest.fn(() => 4),
  calculateTLToMinutes: jest.fn((amount) => Math.floor(Number(amount || 0) / 23)),
  getIncludedMinutes: jest.fn(() => 500),
  isPrepaidPlan: jest.fn(() => false),
  isPostpaidPlan: jest.fn(() => true),
  getPaymentModel: jest.fn(() => 'POSTPAID'),
  getFixedOveragePrice: jest.fn(() => 23),
  getTokenPricePerK: jest.fn(() => ({ input: 0, output: 0 }))
}));

let router;

beforeAll(async () => {
  ({ default: router } = await import('../../src/routes/balance.js'));
});

describe('Balance route schema-safe reads', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/balance', router);

    prismaMock.chatLog.findMany.mockResolvedValue([]);
    getWrittenUsageSummaryMock.mockResolvedValue({
      used: 12,
      total: 500,
      remaining: 488,
      addOnRemaining: 0,
      overage: 0,
      unitPrice: 2.5
    });
    getBillingPlanDefinitionMock.mockReturnValue({
      writtenInteractionUnitPrice: 2.5
    });
  });

  it('returns balance data without selecting billing v2-only subscription columns', async () => {
    const missingColumnError = new Error('The column `voiceAddOnMinutesBalance` does not exist');
    missingColumnError.code = 'P2022';

    prismaMock.subscription.findUnique
      .mockRejectedValueOnce(missingColumnError)
      .mockResolvedValueOnce({
        id: 33,
        businessId: 11,
        plan: 'ENTERPRISE',
        balance: 0,
        minutesLimit: 0,
        minutesUsed: 0,
        trialMinutesUsed: 0,
        trialChatExpiry: null,
        includedMinutesUsed: 0,
        overageMinutes: 0,
        overageRate: 23,
        overageLimit: 0,
        overageLimitReached: false,
        creditMinutes: 0,
        creditMinutesUsed: 0,
        packageWarningAt80: false,
        creditWarningAt80: false,
        autoReloadEnabled: false,
        autoReloadThreshold: 2,
        autoReloadAmount: 5,
        enterpriseMinutes: 750,
        enterpriseSupportInteractions: 500,
        enterprisePrice: 19999,
        enterpriseConcurrent: 3,
        enterpriseStartDate: new Date('2026-03-01T00:00:00.000Z'),
        enterpriseEndDate: new Date('2026-04-01T00:00:00.000Z'),
        enterprisePaymentStatus: 'paid',
        currentPeriodStart: new Date('2026-03-01T00:00:00.000Z'),
        currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
        business: {
          country: 'TR',
          name: 'Acme',
          users: [{ email: 'owner@example.com' }]
        }
      });

    const response = await request(app).get('/api/balance');

    expect(response.status).toBe(200);
    expect(response.body.plan).toBe('ENTERPRISE');
    expect(response.body.writtenInteractions).toEqual(
      expect.objectContaining({
        used: 12,
        limit: 500
      })
    );

    expect(prismaMock.subscription.findUnique).toHaveBeenCalledTimes(2);
    const firstSelect = prismaMock.subscription.findUnique.mock.calls[0][0].select;
    const select = prismaMock.subscription.findUnique.mock.calls[1][0].select;
    expect(firstSelect.voiceAddOnMinutesBalance).toBe(true);
    expect(select.plan).toBe(true);
    expect(select.business).toBeDefined();
    expect(select.voiceAddOnMinutesBalance).toBeUndefined();
    expect(select.writtenInteractionAddOnBalance).toBeUndefined();
  });

  it('includes usage alerts when written usage is approaching the limit', async () => {
    prismaMock.subscription.findUnique.mockResolvedValueOnce({
      id: 33,
      businessId: 11,
      plan: 'ENTERPRISE',
      balance: 0,
      minutesLimit: 0,
      minutesUsed: 0,
      trialMinutesUsed: 0,
      trialChatExpiry: null,
      includedMinutesUsed: 0,
      overageMinutes: 0,
      overageRate: 23,
      overageLimit: 200,
      overageLimitReached: false,
      creditMinutes: 0,
      creditMinutesUsed: 0,
      packageWarningAt80: false,
      creditWarningAt80: false,
      autoReloadEnabled: false,
      autoReloadThreshold: 2,
      autoReloadAmount: 5,
      enterpriseMinutes: 750,
      enterpriseSupportInteractions: 500,
      enterprisePrice: 19999,
      enterpriseConcurrent: 3,
      enterpriseStartDate: new Date('2026-03-01T00:00:00.000Z'),
      enterpriseEndDate: new Date('2026-04-01T00:00:00.000Z'),
      enterprisePaymentStatus: 'paid',
      currentPeriodStart: new Date('2026-03-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
      business: {
        country: 'TR',
        name: 'Acme',
        users: [{ email: 'owner@example.com' }]
      }
    });
    getWrittenUsageSummaryMock.mockResolvedValueOnce({
      used: 450,
      total: 500,
      remaining: 50,
      addOnRemaining: 0,
      overage: 0,
      unitPrice: 2.5,
      configured: true
    });
    getBillingPlanDefinitionMock.mockReturnValueOnce({
      writtenInteractionUnitPrice: 2.5,
      voiceMinuteUnitPrice: 23,
      overageAllowed: { written: false }
    });

    const response = await request(app).get('/api/balance');

    expect(response.status).toBe(200);
    expect(response.body.usageAlerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'WRITTEN_INCLUDED_80',
          scope: 'written',
          severity: 'warning'
        })
      ])
    );
  });
});
