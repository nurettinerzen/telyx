import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const prismaMock = {
  business: {
    findUnique: jest.fn()
  },
  crmWebhook: {
    findUnique: jest.fn(),
    create: jest.fn()
  },
  crmOrder: {
    count: jest.fn(),
    findFirst: jest.fn()
  },
  crmStock: {
    count: jest.fn(),
    findFirst: jest.fn()
  },
  crmTicket: {
    count: jest.fn(),
    findFirst: jest.fn()
  }
};

jest.unstable_mockModule('../../src/prismaClient.js', () => ({
  default: prismaMock
}));

jest.unstable_mockModule('../../src/middleware/auth.js', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: 7, businessId: 21 };
    req.userId = 7;
    req.businessId = 21;
    next();
  }
}));

let router;

beforeAll(async () => {
  ({ default: router } = await import('../../src/routes/crm.js'));
});

describe('CRM plan access safe select', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/crm', router);

    prismaMock.business.findUnique.mockResolvedValue({
      id: 21,
      subscription: {
        id: 45,
        businessId: 21,
        plan: 'ENTERPRISE',
        status: 'ACTIVE'
      }
    });
    prismaMock.crmWebhook.findUnique.mockResolvedValue({
      businessId: 21,
      webhookSecret: 'secret',
      isActive: true,
      lastDataAt: null
    });
    prismaMock.crmOrder.count.mockResolvedValue(0);
    prismaMock.crmStock.count.mockResolvedValue(0);
    prismaMock.crmTicket.count.mockResolvedValue(0);
    prismaMock.crmOrder.findFirst.mockResolvedValue(null);
    prismaMock.crmStock.findFirst.mockResolvedValue(null);
    prismaMock.crmTicket.findFirst.mockResolvedValue(null);
  });

  it('allows enterprise access without selecting billing v2-only subscription columns', async () => {
    const response = await request(app).get('/api/crm/webhook');

    expect(response.status).toBe(200);
    const select = prismaMock.business.findUnique.mock.calls[0][0].select;
    expect(select.subscription.select.plan).toBe(true);
    expect(select.subscription.select.voiceAddOnMinutesBalance).toBeUndefined();
    expect(select.subscription.select.writtenInteractionAddOnBalance).toBeUndefined();
  });
});
