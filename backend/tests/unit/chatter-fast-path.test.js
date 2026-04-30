import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const generateContentMock = jest.fn();

jest.unstable_mockModule('../../src/config/feature-flags.js', () => ({
  isFeatureEnabled: jest.fn((featureName) => featureName === 'SEMANTIC_CHATTER_FAST_PATH')
}));

jest.unstable_mockModule('../../src/config/llm.js', () => ({
  getActiveLlmProvider: jest.fn(() => 'openai')
}));

jest.unstable_mockModule('../../src/services/gemini-utils.js', () => ({
  getGeminiClient: jest.fn(() => ({
    getGenerativeModel: jest.fn(() => ({
      generateContent: generateContentMock
    }))
  }))
}));

let trySemanticChatterFastPath;
let isSemanticChatterFastPathEligible;

beforeAll(async () => {
  const mod = await import('../../src/services/chatter-fast-path.js');
  trySemanticChatterFastPath = mod.trySemanticChatterFastPath;
  isSemanticChatterFastPathEligible = mod.isSemanticChatterFastPathEligible;
});

beforeEach(() => {
  jest.clearAllMocks();
});

function mockJsonResponse(payload, usage = { promptTokenCount: 42, candidatesTokenCount: 9 }) {
  generateContentMock.mockResolvedValueOnce({
    response: {
      text: () => JSON.stringify(payload),
      usageMetadata: usage
    }
  });
}

describe('semantic chatter fast path', () => {
  it('handles pure chatter with a short semantic reply', async () => {
    mockJsonResponse({
      pure_chatter: true,
      confidence: 0.94,
      reply: 'Selam, buyurun.',
      reason: 'clear greeting'
    });

    const result = await trySemanticChatterFastPath({
      channel: 'CHAT',
      userMessage: 'selaam',
      language: 'TR',
      state: {},
      business: { name: 'Telyx' },
      assistant: { name: 'Berat' }
    });

    expect(result.handled).toBe(true);
    expect(result.reply).toBe('Selam, buyurun.');
    expect(result.confidence).toBe(0.94);
    expect(result.inputTokens).toBe(42);
    expect(result.outputTokens).toBe(9);
  });

  it('accepts semantic chatter when the model returns textual confidence', async () => {
    mockJsonResponse({
      pure_chatter: true,
      confidence: 'high',
      reply: 'İyiyim, teşekkür ederim. Size nasıl yardımcı olabilirim?',
      reason: 'how are you'
    });

    const result = await trySemanticChatterFastPath({
      channel: 'CHAT',
      userMessage: 'nasılsın',
      language: 'TR',
      state: {}
    });

    expect(result.handled).toBe(true);
    expect(result.confidence).toBe(0.95);
  });

  it('falls through when the semantic gate sees an operational request', async () => {
    mockJsonResponse({
      pure_chatter: false,
      confidence: 0.98,
      reply: '',
      reason: 'asks about order status'
    });

    const result = await trySemanticChatterFastPath({
      channel: 'CHAT',
      userMessage: 'merhaba siparişim nerede',
      language: 'TR',
      state: {}
    });

    expect(result.handled).toBe(false);
    expect(result.reason).toBe('not_chatter');
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it('does not run the fast path during an active operational context', () => {
    const result = isSemanticChatterFastPathEligible({
      channel: 'CHAT',
      userMessage: 'hey',
      state: { activeFlow: 'ORDER_STATUS' }
    });

    expect(result).toEqual({
      eligible: false,
      reason: 'active_operational_context'
    });
    expect(generateContentMock).not.toHaveBeenCalled();
  });
});
