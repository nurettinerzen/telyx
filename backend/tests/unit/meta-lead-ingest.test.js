import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const createLeadMock = jest.fn();

await jest.unstable_mockModule('../../src/prismaClient.js', () => ({
  default: {}
}));

await jest.unstable_mockModule('../../src/middleware/auth.js', () => ({
  authenticateToken: (_req, _res, next) => next()
}));

await jest.unstable_mockModule('../../src/middleware/adminAuth.js', () => ({
  isAdmin: (_req, _res, next) => next(),
  requireAdminMfa: (_req, _res, next) => next()
}));

await jest.unstable_mockModule('../../src/services/leadService.js', () => ({
  createLead: createLeadMock,
  getLeadByResponseToken: jest.fn(),
  handleLeadCtaResponse: jest.fn(),
  getLeadConstants: () => ({
    LEAD_SOURCE: {
      META_INSTANT_FORM: 'META_INSTANT_FORM'
    },
    LEAD_STATUS: {
      NEW: 'NEW'
    },
    LEAD_TEMPERATURE: {
      COLD: 'COLD'
    }
  })
}));

await jest.unstable_mockModule('../../src/services/leadPreviewService.js', () => ({
  createLeadPreviewSession: jest.fn(),
  finishLeadPreviewSession: jest.fn(),
  registerLeadPreviewConversation: jest.fn(),
  LEAD_PREVIEW_MAX_DURATION_SECONDS: 600,
  LeadPreviewError: class LeadPreviewError extends Error {
    constructor(message, statusCode = 400, code = 'lead_preview_error') {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  }
}));

await jest.unstable_mockModule('../../src/config/runtime.js', () => ({
  buildSiteUrl: (path = '/') => `https://telyx.ai${path}`
}));

await jest.unstable_mockModule('../../src/services/businessPhoneRouting.js', () => ({
  getPublicContactProfile: jest.fn()
}));

let router;

beforeAll(async () => {
  process.env.LEAD_INGEST_SECRET = 'test-lead-secret';
  ({ default: router } = await import('../../src/routes/leads.js'));
});

describe('meta lead ingest', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    createLeadMock.mockResolvedValue({
      lead: { id: 'lead_1', status: 'EMAILED' },
      isDuplicate: false
    });

    app = express();
    app.use(express.json());
    app.use('/api/leads', router);
  });

  it('accepts human-labeled sheet payloads', async () => {
    const response = await request(app)
      .post('/api/leads/ingest/meta')
      .set('x-lead-ingest-secret', 'test-lead-secret')
      .send({
        'Lead ID': '1480029593494649',
        'Created Time': '2026-04-27T08:03:40-05:00',
        'Campaign Name': 'New Leads Campaign - Copy',
        'Adset Name': 'New Leads Ad Set',
        'Ad Name': 'New Leads Ad',
        'Form Name': 'Untitled form 4/24/26, 2:04 AM',
        'E-posta': 'bcapar742@gmail.com',
        'Ad Soyad': 'Bekir Çapar',
        'Telefon': ''
      });

    expect(response.status).toBe(201);
    expect(createLeadMock).toHaveBeenCalledWith(expect.objectContaining({
      source: 'META_INSTANT_FORM',
      externalSourceId: '1480029593494649',
      campaignName: 'New Leads Campaign - Copy',
      adsetName: 'New Leads Ad Set',
      adName: 'New Leads Ad',
      formName: 'Untitled form 4/24/26, 2:04 AM',
      email: 'bcapar742@gmail.com',
      name: 'Bekir Çapar',
      phone: null
    }));
  });

  it('normalizes field_data labels with spaces and Turkish characters', async () => {
    const response = await request(app)
      .post('/api/leads/ingest/meta')
      .set('x-lead-ingest-secret', 'test-lead-secret')
      .send({
        leadgen_id: '1480029593494649',
        created_time: '2026-04-27T08:03:40-05:00',
        field_data: [
          { name: 'Ad Soyad', values: ['Bekir Çapar'] },
          { name: 'E-posta', values: ['bcapar742@gmail.com'] },
          { name: 'Telefon Numarası', values: ['05321234567'] }
        ]
      });

    expect(response.status).toBe(201);
    expect(createLeadMock).toHaveBeenCalledWith(expect.objectContaining({
      externalSourceId: '1480029593494649',
      email: 'bcapar742@gmail.com',
      name: 'Bekir Çapar',
      phone: '05321234567'
    }));
  });
});
