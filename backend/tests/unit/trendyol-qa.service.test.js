import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const { default: TrendyolQaService } = await import('../../src/services/integrations/marketplace/trendyol-qa.service.js');

describe('TrendyolQaService', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fetchUnansweredQuestions paginates and normalizes question payloads', async () => {
    global.fetch
      .mockResolvedValueOnce(new Response(JSON.stringify({
        content: [{
          id: 101,
          text: 'Kargo ne zaman gelir?',
          productName: 'Deneme Urun',
          imageUrl: 'https://example.com/urun.jpg',
          webUrl: 'https://example.com/urun',
          showUserName: true,
          userName: 'Ayse',
          status: 'WAITING_FOR_ANSWER',
        }],
        totalPages: 2,
        totalElements: 2,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        content: [{
          id: 102,
          text: 'Beden kalibi nasil?',
          productName: 'Ikinci Urun',
          showUserName: false,
          status: 'WAITING_FOR_ANSWER',
        }],
        totalPages: 2,
        totalElements: 2,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const service = new TrendyolQaService({
      sellerId: '123456',
      apiKey: 'api-key',
      apiSecret: 'api-secret',
    });

    const questions = await service.fetchUnansweredQuestions(1, { size: 1 });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({
      platform: 'TRENDYOL',
      externalId: '101',
      productName: 'Deneme Urun',
      customerName: 'Ayse',
      questionText: 'Kargo ne zaman gelir?',
    });
    expect(questions[1]).toMatchObject({
      externalId: '102',
      customerName: null,
      questionText: 'Beden kalibi nasil?',
    });
  });

  it('postAnswer enforces Trendyol character constraints', async () => {
    const service = new TrendyolQaService({
      sellerId: '123456',
      apiKey: 'api-key',
      apiSecret: 'api-secret',
    });

    await expect(service.postAnswer(1, '101', 'kisa'))
      .rejects
      .toThrow('Trendyol cevabı 10 ile 2000 karakter arasında olmalıdır');
  });
});

