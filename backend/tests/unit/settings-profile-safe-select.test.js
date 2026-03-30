import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const prismaMock = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn()
  },
  business: {
    findUnique: jest.fn(),
    update: jest.fn()
  },
  subscription: {
    findUnique: jest.fn()
  }
};

jest.unstable_mockModule('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prismaMock)
}));

jest.unstable_mockModule('../../src/middleware/auth.js', () => ({
  authenticateToken: (req, res, next) => {
    req.userId = 7;
    req.businessId = 11;
    req.user = { id: 7, businessId: 11 };
    next();
  }
}));

jest.unstable_mockModule('../../src/middleware/reauth.js', () => ({
  requireRecentAuth: () => (req, res, next) => next()
}));

jest.unstable_mockModule('../../src/security/passwordPolicy.js', () => ({
  validatePasswordPolicy: jest.fn(() => ({ valid: true })),
  passwordPolicyMessage: jest.fn(() => 'ok')
}));

jest.unstable_mockModule('../../src/security/sessionToken.js', () => ({
  issueSession: jest.fn()
}));

let router;

beforeAll(async () => {
  ({ default: router } = await import('../../src/routes/settings.js'));
});

describe('Settings profile route', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/settings', router);

    prismaMock.user.findUnique.mockResolvedValue({
      id: 7,
      email: 'owner@example.com',
      name: 'Owner',
      role: 'OWNER'
    });
    prismaMock.business.findUnique.mockResolvedValue({
      id: 11,
      name: 'Acme',
      country: 'TR',
      language: 'TR',
      timezone: 'Europe/Istanbul'
    });
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: 22,
      businessId: 11,
      plan: 'STARTER',
      status: 'ACTIVE',
      balance: 0
    });
  });

  it('loads profile without selecting new billing v2 columns', async () => {
    const response = await request(app).get('/api/settings/profile');

    expect(response.status).toBe(200);
    expect(response.body.business.country).toBe('TR');
    expect(prismaMock.subscription.findUnique).toHaveBeenCalledWith({
      where: { businessId: 11 },
      select: expect.any(Object)
    });

    const select = prismaMock.subscription.findUnique.mock.calls[0][0].select;
    expect(select.plan).toBe(true);
    expect(select.balance).toBe(true);
    expect(select.writtenInteractionAddOnBalance).toBeUndefined();
    expect(select.voiceAddOnMinutesBalance).toBeUndefined();
    expect(select.writtenOverageBilledAt).toBeUndefined();
  });
});
