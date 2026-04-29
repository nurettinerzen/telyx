import { afterEach, describe, expect, it } from '@jest/globals';
import {
  getActiveLlmProvider,
  getLlmDiagnostics,
  hasConfiguredPrimaryLlm
} from '../../src/config/llm.js';

const ORIGINAL_ENV = {
  LLM_PROVIDER: process.env.LLM_PROVIDER,
  AI_PROVIDER: process.env.AI_PROVIDER,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

afterEach(() => {
  restoreEnv();
});

describe('LLM provider config', () => {
  it('defaults to auto and prefers OpenAI when OPENAI_API_KEY exists', () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.AI_PROVIDER;
    process.env.OPENAI_API_KEY = 'sk-test_12345678901234567890';
    process.env.GEMINI_API_KEY = 'AIzaSyGeminiPrimaryKey1234567890abcd';

    expect(getActiveLlmProvider()).toBe('openai');
    expect(hasConfiguredPrimaryLlm()).toBe(true);
  });

  it('uses OpenAI when explicitly requested and OPENAI_API_KEY is present', () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test_12345678901234567890';
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;

    expect(getActiveLlmProvider()).toBe('openai');
    expect(hasConfiguredPrimaryLlm()).toBe(true);
  });

  it('fails configured check when OpenAI is requested without OPENAI_API_KEY', () => {
    process.env.LLM_PROVIDER = 'openai';
    delete process.env.OPENAI_API_KEY;
    process.env.GEMINI_API_KEY = 'AIzaSyGeminiPrimaryKey1234567890abcd';

    expect(getActiveLlmProvider()).toBe('openai');
    expect(hasConfiguredPrimaryLlm()).toBe(false);
  });

  it('auto mode prefers OpenAI when both providers are available', () => {
    process.env.LLM_PROVIDER = 'auto';
    process.env.OPENAI_API_KEY = 'sk-test_12345678901234567890';
    process.env.GEMINI_API_KEY = 'AIzaSyGeminiPrimaryKey1234567890abcd';

    const diagnostics = getLlmDiagnostics();

    expect(diagnostics.activeProvider).toBe('openai');
    expect(diagnostics.configured).toBe(true);
  });
});
