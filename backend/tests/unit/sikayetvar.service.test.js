import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const { default: SikayetvarService } = await import('../../src/services/integrations/complaints/sikayetvar.service.js');

describe('SikayetvarService', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fetchOpenComplaints normalizes complaint list and complaint messages', async () => {
    global.fetch
      .mockResolvedValueOnce(new Response(JSON.stringify([
        {
          id: 25482426,
          content: {
            title: 'Gönderi ulaşmadı',
            body: 'Siparişim hâlâ elime ulaşmadı.',
          },
          member: {
            id: 762751,
            name: 'Sefa Soyadı',
            city: { name: 'İzmir' },
            identities: [
              { identityType: 'email', identityValue: 'sefa@example.com' },
              { identityType: 'phone', identityValue: '+905551112233' },
            ],
          },
          company: {
            id: 214533,
            name: 'Marka A',
            url: 'marka-a',
          },
          complainTime: '2023-02-16 15:28:09.000+0300',
          complaintUrl: 'marka-a/gonderi-ulasmadi',
          answered: false,
          closed: false,
          hidden: false,
          resolveStatus: 'OPEN',
        },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        {
          id: 29556213,
          message: 'Merhaba, kontrol ediyoruz.',
          from: 'brand',
          complaint: {
            id: 25482426,
            title: 'Gönderi ulaşmadı',
          },
        },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const service = new SikayetvarService({
      apiKey: 'test-token',
    });

    const complaints = await service.fetchOpenComplaints(1, { size: 50, maxPages: 1 });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(complaints).toHaveLength(1);
    expect(complaints[0]).toMatchObject({
      platform: 'SIKAYETVAR',
      externalId: '25482426',
      title: 'Gönderi ulaşmadı',
      complaintText: 'Siparişim hâlâ elime ulaşmadı.',
      customerName: 'Sefa Soyadı',
      customerEmail: 'sefa@example.com',
      customerPhone: '+905551112233',
      customerCity: 'İzmir',
      complaintUrl: 'https://www.sikayetvar.com/marka-a/gonderi-ulasmadi',
      platformStatus: 'OPEN',
    });
    expect(complaints[0].messages).toHaveLength(1);
  });

  it('postAnswer validates empty replies', async () => {
    const service = new SikayetvarService({
      apiKey: 'test-token',
    });

    await expect(service.postAnswer(1, '25482426', '   '))
      .rejects
      .toThrow('Sikayetvar cevabı boş olamaz');
  });
});
