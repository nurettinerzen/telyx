import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const prismaMock = {
  $transaction: jest.fn(async (fn) => fn(prismaMock)),
  business: { findUnique: jest.fn() },
  subscription: { findUnique: jest.fn(), update: jest.fn() },
  emailThread: { findFirst: jest.fn(), update: jest.fn() },
  emailMessage: { findFirst: jest.fn(), upsert: jest.fn() },
  emailDraft: { update: jest.fn() },
  outboundMessage: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  writtenUsageEvent: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), groupBy: jest.fn() },
  balanceTransaction: { create: jest.fn() }
};

const emailAggregatorMock = {
  getIntegration: jest.fn(),
  sendMessage: jest.fn(),
  getMessage: jest.fn()
};

const onEmailSentMock = jest.fn(() => Promise.resolve());

jest.unstable_mockModule('@prisma/client', () => ({
  Prisma: {
    TransactionIsolationLevel: {
      Serializable: 'Serializable'
    }
  },
  PrismaClient: jest.fn(() => prismaMock)
}));

jest.unstable_mockModule('../../src/middleware/auth.js', () => ({
  authenticateToken: (req, res, next) => {
    req.businessId = 1;
    req.userId = 99;
    req.user = { business: { language: 'TR' } };
    next();
  }
}));

jest.unstable_mockModule('../../src/middleware/planGating.js', () => ({
  hasEmailInboxAccess: jest.fn(() => true),
  requireEmailInboxAccess: (req, res, next) => next()
}));

jest.unstable_mockModule('../../src/services/gmail.js', () => ({
  default: {}
}));

jest.unstable_mockModule('../../src/services/outlook.js', () => ({
  default: {}
}));

jest.unstable_mockModule('../../src/services/email-aggregator.js', () => ({
  default: emailAggregatorMock
}));

jest.unstable_mockModule('../../src/services/email-ai.js', () => ({
  default: {
    getDraft: jest.fn()
  }
}));

jest.unstable_mockModule('../../src/core/email/index.js', () => ({
  handleEmailTurn: jest.fn()
}));

jest.unstable_mockModule('../../src/core/email/rag/indexingHooks.js', () => ({
  onEmailSent: onEmailSentMock
}));

jest.unstable_mockModule('../../src/services/email-pair-builder.js', () => ({
  buildEmailPairs: jest.fn(),
  getPairStatistics: jest.fn()
}));

jest.unstable_mockModule('../../src/middleware/oauthState.js', () => ({
  generateOAuthState: jest.fn(),
  validateOAuthState: jest.fn()
}));

jest.unstable_mockModule('../../src/middleware/redirectWhitelist.js', () => ({
  safeRedirect: jest.fn()
}));

jest.unstable_mockModule('../../src/services/trace/responseTraceLogger.js', () => ({
  queueUnifiedResponseTrace: jest.fn()
}));

jest.unstable_mockModule('../../src/services/email-style-analyzer.js', () => ({
  analyzeWritingStyle: jest.fn(),
  getStyleProfile: jest.fn(),
  reanalyzeWritingStyle: jest.fn()
}));

jest.unstable_mockModule('../../src/services/email-classifier.js', () => ({
  classifyEmailSender: jest.fn(),
  overrideClassification: jest.fn(),
  getClassificationStats: jest.fn()
}));

let router;

beforeAll(async () => {
  ({ default: router } = await import('../../src/routes/email.js'));
});

describe('Email send idempotency', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/email', router);

    prismaMock.emailThread.findFirst.mockResolvedValue({
      id: 'thread_1',
      businessId: 1,
      threadId: 'provider-thread-1',
      subject: 'Test Subject',
      customerEmail: 'customer@example.com'
    });
    prismaMock.emailMessage.findFirst.mockResolvedValue({
      id: 'msg_1',
      messageId: 'provider-inbound-1',
      direction: 'INBOUND'
    });
    prismaMock.business.findUnique.mockResolvedValue({
      id: 1,
      name: 'Telyx'
    });
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: 123,
      businessId: 1,
      plan: 'STARTER',
      status: 'ACTIVE',
      balance: 0,
      writtenInteractionAddOnBalance: 0,
      currentPeriodStart: new Date('2026-03-01T00:00:00.000Z'),
      business: { country: 'TR' }
    });
    prismaMock.subscription.update.mockResolvedValue({});
    prismaMock.emailThread.update.mockResolvedValue({});
    prismaMock.emailMessage.upsert.mockResolvedValue({});
    prismaMock.emailDraft.update.mockResolvedValue({});
    prismaMock.outboundMessage.create.mockResolvedValue({
      id: 'lease_1',
      sent: false
    });
    prismaMock.outboundMessage.update.mockResolvedValue({});
    prismaMock.outboundMessage.delete.mockResolvedValue({});
    prismaMock.writtenUsageEvent.findUnique.mockResolvedValue(null);
    prismaMock.writtenUsageEvent.groupBy.mockResolvedValue([]);
    prismaMock.writtenUsageEvent.create.mockResolvedValue({
      id: 'written_evt_1',
      status: 'RESERVED'
    });
    prismaMock.writtenUsageEvent.update.mockResolvedValue({
      id: 'written_evt_1',
      status: 'COMMITTED'
    });
    prismaMock.balanceTransaction.create.mockResolvedValue({});

    emailAggregatorMock.getIntegration.mockResolvedValue({
      email: 'support@telyx.ai'
    });
    emailAggregatorMock.getMessage.mockResolvedValue(null);
    emailAggregatorMock.sendMessage.mockResolvedValue({
      messageId: 'sent-msg-1'
    });
  });

  it('returns 409 when the same quick reply is already being sent', async () => {
    prismaMock.outboundMessage.findUnique.mockResolvedValue({
      id: 'lease_existing',
      sent: false,
      expiresAt: new Date(Date.now() + 60_000)
    });

    const response = await request(app)
      .post('/api/email/threads/thread_1/quick-reply')
      .send({ content: 'Merhaba, hemen donuyorum.' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('EMAIL_SEND_IN_PROGRESS');
    expect(emailAggregatorMock.sendMessage).not.toHaveBeenCalled();
  });

  it('returns success with stateSyncPending when provider send succeeds but local write fails', async () => {
    prismaMock.outboundMessage.findUnique.mockResolvedValue(null);
    prismaMock.emailMessage.upsert.mockRejectedValue(new Error('db sync failed'));

    const response = await request(app)
      .post('/api/email/threads/thread_1/quick-reply')
      .send({ content: 'Merhaba, yardimci olayim.' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.stateSyncPending).toBe(true);
    expect(response.body.messageId).toBe('sent-msg-1');
    expect(emailAggregatorMock.sendMessage).toHaveBeenCalledTimes(1);
    expect(prismaMock.outboundMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lease_1' },
        data: expect.objectContaining({
          sent: true,
          externalId: 'sent-msg-1'
        })
      })
    );
  });
});
