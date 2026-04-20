import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const {
  default: AmazonSpApiService,
  getAmazonAuthUrl,
} = await import('../../src/services/integrations/marketplace/amazon-sp-api.service.js');

describe('AmazonSpApiService', () => {
  const originalEnv = {
    AMAZON_SP_API_APP_ID: process.env.AMAZON_SP_API_APP_ID,
    AMAZON_SP_API_CLIENT_ID: process.env.AMAZON_SP_API_CLIENT_ID,
    AMAZON_SP_API_CLIENT_SECRET: process.env.AMAZON_SP_API_CLIENT_SECRET,
    AMAZON_SP_API_USE_DRAFT_AUTH: process.env.AMAZON_SP_API_USE_DRAFT_AUTH,
    BACKEND_URL: process.env.BACKEND_URL,
  };

  beforeEach(() => {
    process.env.AMAZON_SP_API_APP_ID = 'amzn1.sellerapps.app.test-app-id';
    process.env.AMAZON_SP_API_CLIENT_ID = 'amazon-client-id';
    process.env.AMAZON_SP_API_CLIENT_SECRET = 'amazon-client-secret';
    process.env.AMAZON_SP_API_USE_DRAFT_AUTH = 'true';
    process.env.BACKEND_URL = 'https://api.example.com';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    jest.restoreAllMocks();
  });

  it('builds Turkey website authorization URL with beta flag', () => {
    const authUrl = getAmazonAuthUrl({ state: 'state-123' });

    expect(authUrl).toContain('https://sellercentral.amazon.com.tr/apps/authorize/consent');
    expect(authUrl).toContain('application_id=amzn1.sellerapps.app.test-app-id');
    expect(authUrl).toContain('state=state-123');
    expect(authUrl).toContain('version=beta');
  });

  it('testConnection refreshes tokens and normalizes marketplace participations', async () => {
    global.fetch
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'access-token-1',
        token_type: 'bearer',
        expires_in: 3600,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'access-token-2',
        token_type: 'bearer',
        expires_in: 3600,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        payload: [
          {
            marketplace: {
              id: 'A33AVAJ2PDY3EV',
              name: 'Amazon.com.tr',
              defaultLanguageCode: 'tr_TR',
              defaultCurrencyCode: 'TRY',
              domainName: 'www.amazon.com.tr',
            },
            participation: {
              isParticipating: true,
              hasSuspendedListings: false,
            },
            storeName: 'Demo Store',
          },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const service = new AmazonSpApiService({
      refreshToken: 'refresh-token',
      sellingPartnerId: 'A_TEST_SELLER',
      marketplaceId: 'A33AVAJ2PDY3EV',
    });

    const result = await service.testConnection({
      refreshToken: 'refresh-token',
      sellingPartnerId: 'A_TEST_SELLER',
      marketplaceId: 'A33AVAJ2PDY3EV',
    });

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      success: true,
      sellingPartnerId: 'A_TEST_SELLER',
      marketplaceId: 'A33AVAJ2PDY3EV',
      validationWarning: null,
    });
    expect(result.authorizedMarketplaces[0]).toMatchObject({
      marketplaceId: 'A33AVAJ2PDY3EV',
      marketplaceName: 'Amazon.com.tr',
      storeName: 'Demo Store',
      isParticipating: true,
      hasSuspendedListings: false,
    });
    expect(global.fetch.mock.calls[2][0]).toContain('sellingpartnerapi-eu.amazon.com/sellers/v1/marketplaceParticipations');
  });
});
