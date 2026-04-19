import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const prismaMock = {
  subscription: {
    findUnique: jest.fn()
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

jest.unstable_mockModule('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prismaMock)
}));

jest.unstable_mockModule('../../src/middleware/auth.js', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: 8, businessId: 11 };
    req.userId = 8;
    req.businessId = 11;
    next();
  },
  verifyBusinessAccess: (req, res, next) => next()
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
  default: {}
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

describe('Subscription routes billing schema fallback', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/subscription', router);

    getEffectivePlanConfigMock.mockReturnValue({
      includedMinutes: 0,
      assistantsLimit: 5,
      phoneNumbersLimit: 2,
      concurrentLimit: 0,
      overageRate: 2.5
    });
    isPhoneInboundEnabledForBusinessRecordMock.mockReturnValue(false);
    buildPhoneEntitlementsMock.mockReturnValue({
      outbound: {
        testCall: { enabled: false },
        campaigns: { enabled: false, requiredPlan: 'PRO' }
      }
    });
    getAddOnCatalogMock.mockReturnValue({ written: [], voice: [] });
    getBillingPlanDefinitionMock.mockReturnValue({
      plan: 'STARTER',
      billingModel: 'recurring',
      includedWrittenInteractions: 500,
      includedVoiceMinutes: 0,
      concurrentCallLimit: 0,
      assistantLimit: 5,
      channels: { webchat: true, whatsapp: true, email: true, phone: false },
      writtenInteractionUnitPrice: 2.5,
      voiceMinuteUnitPrice: 0
    });
    getWrittenUsageSummaryMock.mockResolvedValue({
      used: 0,
      total: 500,
      overage: 0,
      channels: { webchat: 0, whatsapp: 0, email: 0 }
    });
    prismaMock.chatLog.count.mockResolvedValue(0);
    prismaMock.emailMessage.count.mockResolvedValue(0);
    resolvePlanFromStripePriceIdMock.mockReturnValue(null);
    resolveStripePriceIdForPlanMock.mockReturnValue(null);
  });

  it('returns current subscription when new billing columns are missing', async () => {
    const missingColumnError = new Error('The column `voiceAddOnMinutesBalance` does not exist');
    missingColumnError.code = 'P2022';

    prismaMock.subscription.findUnique
      .mockRejectedValueOnce(missingColumnError)
      .mockResolvedValueOnce({
        id: 33,
        businessId: 11,
        plan: 'STARTER',
        status: 'ACTIVE',
        balance: 0,
        minutesLimit: 0,
        assistantsLimit: 5,
        phoneNumbersLimit: 2,
        currentPeriodStart: new Date('2026-03-01T00:00:00.000Z'),
        currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
        includedMinutesUsed: 0,
        overageMinutes: 0,
        business: {
          id: 11,
          country: 'TR',
          name: 'Acme',
          phoneInboundEnabled: false,
          phoneNumbers: 0
        }
      });

    const response = await request(app).get('/api/subscription/current');

    expect(response.status).toBe(200);
    expect(prismaMock.subscription.findUnique).toHaveBeenCalledTimes(2);
    expect(response.body.plan).toBe('STARTER');
    expect(response.body.business.country).toBe('TR');
    expect(response.body.billingSnapshot.wallet.balance).toBe(0);
    expect(response.body.writtenAddOnRemaining).toBe(0);
  });

  it('returns billing history when new billing columns are missing', async () => {
    const missingColumnError = new Error('The column `writtenInteractionAddOnBalance` does not exist');
    missingColumnError.code = 'P2022';

    prismaMock.subscription.findUnique
      .mockRejectedValueOnce(missingColumnError)
      .mockResolvedValueOnce({
        id: 33,
        businessId: 11,
        plan: 'STARTER',
        status: 'ACTIVE',
        enterprisePrice: null,
        business: {
          id: 11,
          country: 'TR',
          name: 'Acme',
          phoneInboundEnabled: false,
          phoneNumbers: 0
        }
      });

    const response = await request(app).get('/api/subscription/billing-history');

    expect(response.status).toBe(200);
    expect(response.body.history).toEqual([]);
  });

  it('includes usage alerts when written usage approaches the configured limit', async () => {
    prismaMock.subscription.findUnique.mockResolvedValueOnce({
      id: 33,
      businessId: 11,
      plan: 'STARTER',
      status: 'ACTIVE',
      balance: 0,
      minutesLimit: 0,
      assistantsLimit: 5,
      phoneNumbersLimit: 2,
      currentPeriodStart: new Date('2026-03-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
      includedMinutesUsed: 0,
      overageMinutes: 0,
      overageLimit: 200,
      business: {
        id: 11,
        country: 'TR',
        name: 'Acme',
        phoneInboundEnabled: false,
        phoneNumbers: 0
      }
    });
    getWrittenUsageSummaryMock.mockResolvedValueOnce({
      used: 420,
      total: 500,
      overage: 0,
      configured: true,
      channels: { webchat: 300, whatsapp: 100, email: 20 }
    });

    const response = await request(app).get('/api/subscription/current');

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
    expect(response.body.billingSnapshot.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'WRITTEN_INCLUDED_80'
        })
      ])
    );
  });
});
