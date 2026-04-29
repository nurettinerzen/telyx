import { describe, expect, it } from '@jest/globals';
import { isGeminiGenerationFailure } from '../../src/services/gemini-utils.js';

describe('isGeminiGenerationFailure', () => {
  it('detects invalid api key provider failures', () => {
    expect(isGeminiGenerationFailure(new Error(
      '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: [400 Bad Request] API key not valid. Please pass a valid API key.'
    ))).toBe(true);
  });

  it('ignores unrelated internal errors', () => {
    expect(isGeminiGenerationFailure(new Error('Knowledge base query failed'))).toBe(false);
  });

  it('detects OpenAI provider credential failures when OpenAI is active behind the shared adapter', () => {
    const error = new Error('Incorrect API key provided. You can find your API key at https://platform.openai.com/account/api-keys.');
    error.code = 'invalid_api_key';

    expect(isGeminiGenerationFailure(error)).toBe(true);
  });
});
