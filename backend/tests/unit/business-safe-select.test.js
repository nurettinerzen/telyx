import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const prismaMock = {
  business: {
    findUnique: jest.fn(),
    update: jest.fn()
  },
  assistant: {
    findFirst: jest.fn()
  }
};

jest.unstable_mockModule('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prismaMock)
}));

jest.unstable_mockModule('../../src/middleware/auth.js', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: 7, businessId: 21, role: 'OWNER' };
    req.userId = 7;
    req.businessId = 21;
    req.userRole = 'OWNER';
    next();
  },
  verifyBusinessAccess: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next()
}));

jest.unstable_mockModule('../../src/services/phoneInboundGate.js', () => ({
  isPhoneInboundEnabledForBusinessRecord: jest.fn(() => false)
}));

jest.unstable_mockModule('../../src/services/assistantChannels.js', () => ({
  ASSISTANT_CHANNEL_CAPABILITIES: { CHAT: 'chat' },
  assistantHasCapability: jest.fn(() => true)
}));

let router;

beforeAll(async () => {
  ({ default: router } = await import('../../src/routes/business.js'));
});

describe('Business route schema-safe reads', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/business', router);

    prismaMock.business.findUnique.mockResolvedValue({
      id: 21,
      name: 'Acme',
      aliases: ['Acme AI'],
      identitySummary: 'Test business',
      businessType: 'SERVICE',
      language: 'TR',
      country: 'TR',
      timezone: 'Europe/Istanbul',
      phoneInboundEnabled: false,
      chatEmbedKey: 'embed_123',
      chatWidgetEnabled: true,
      chatAssistantId: 'assistant_1',
      subscription: {
        id: 45,
        businessId: 21,
        plan: 'ENTERPRISE',
        status: 'ACTIVE'
      },
      users: [
        {
          id: 7,
          email: 'owner@example.com',
          role: 'OWNER',
          createdAt: new Date('2026-03-01T00:00:00.000Z')
        }
      ],
      assistants: [
        {
          id: 'assistant_1',
          name: 'Sales',
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          isActive: true,
          assistantType: 'phone'
        }
      ]
    });
  });

  it('returns business details without selecting billing v2-only subscription columns', async () => {
    const response = await request(app).get('/api/business/21');

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Acme');
    expect(response.body.subscription.plan).toBe('ENTERPRISE');

    const select = prismaMock.business.findUnique.mock.calls[0][0].select;
    expect(select.subscription.select.plan).toBe(true);
    expect(select.subscription.select.enterpriseSupportInteractions).toBe(true);
    expect(select.subscription.select.voiceAddOnMinutesBalance).toBeUndefined();
    expect(select.subscription.select.writtenInteractionAddOnBalance).toBeUndefined();
  });
});
