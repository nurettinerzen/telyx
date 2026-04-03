import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const { default: HepsiburadaQaService } = await import('../../src/services/integrations/marketplace/hepsiburada-qa.service.js');

describe('HepsiburadaQaService', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fetchUnansweredQuestions retries with legacy auth and normalizes list payloads', async () => {
    global.fetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{
          issueNumber: 501,
          lastContent: 'Urunde garanti var mi?',
          status: 'WaitingforAnswer',
          expireDate: '2026-04-04T10:00:00.000Z',
          customerName: 'Mehmet',
          product: {
            name: 'Bluetooth Hoparlor',
            sku: 'SKU-1',
            imageUrl: 'https://example.com/hb.jpg',
          },
        }],
        totalPages: 1,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const service = new HepsiburadaQaService({
      merchantId: 'merchant-guid',
      apiKey: 'legacy-user',
      apiSecret: 'service-secret',
    });

    const questions = await service.fetchUnansweredQuestions(1, { includeDetails: false });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      platform: 'HEPSIBURADA',
      externalId: '501',
      productName: 'Bluetooth Hoparlor',
      productBarcode: 'SKU-1',
      customerName: 'Mehmet',
      questionText: 'Urunde garanti var mi?',
      platformStatus: 'WaitingforAnswer',
    });
  });

  it('postAnswer validates Hepsiburada answer length', async () => {
    const service = new HepsiburadaQaService({
      merchantId: 'merchant-guid',
      apiSecret: 'service-secret',
    });

    await expect(service.postAnswer(1, '501', 'kisa'))
      .rejects
      .toThrow('Hepsiburada cevabı 10 ile 2000 karakter arasında olmalıdır');
  });
});

