import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const {
  MARKETPLACE_ANSWER_MODE,
  safeDecryptMarketplaceCredentials,
} = await import('../../src/services/marketplace/qaShared.js');

describe('safeDecryptMarketplaceCredentials', () => {
  const originalMasterKey = process.env.ENCRYPTION_MASTER_KEY;

  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-for-marketplace-qa-1234';
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalMasterKey === undefined) {
      delete process.env.ENCRYPTION_MASTER_KEY;
    } else {
      process.env.ENCRYPTION_MASTER_KEY = originalMasterKey;
    }

    jest.restoreAllMocks();
  });

  it('preserves plaintext marketplace credentials', () => {
    const result = safeDecryptMarketplaceCredentials({
      merchantId: 'merchant-123',
      apiKey: 'plain-api-key',
      apiSecret: 'plain-api-secret',
      qaSettings: {
        answerMode: MARKETPLACE_ANSWER_MODE.AUTO,
        language: 'en',
        toneInstructions: 'Friendly and concise',
      },
    });

    expect(result).toMatchObject({
      merchantId: 'merchant-123',
      apiKey: 'plain-api-key',
      apiSecret: 'plain-api-secret',
      qaSettings: {
        answerMode: MARKETPLACE_ANSWER_MODE.AUTO,
        language: 'en',
        toneInstructions: 'Friendly and concise',
      },
    });
  });

  it('falls back instead of throwing for malformed encrypted-looking values', () => {
    const result = safeDecryptMarketplaceCredentials({
      merchantId: 'merchant-456',
      apiKey: 'AAAA:BBBB:CCCC:DDDD',
      apiSecret: 'EEEE:FFFF:GGGG:HHHH',
      qaSettings: {
        answerMode: MARKETPLACE_ANSWER_MODE.AUTO,
        language: 'tr',
        toneInstructions: 'Nazik ol',
      },
    });

    expect(result).toMatchObject({
      merchantId: 'merchant-456',
      apiKey: 'AAAA:BBBB:CCCC:DDDD',
      apiSecret: 'EEEE:FFFF:GGGG:HHHH',
      qaSettings: {
        answerMode: MARKETPLACE_ANSWER_MODE.AUTO,
        language: 'tr',
        toneInstructions: 'Nazik ol',
      },
    });

    expect(console.warn).toHaveBeenCalled();
  });
});
