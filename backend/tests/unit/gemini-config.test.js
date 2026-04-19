import { afterEach, describe, expect, it } from '@jest/globals';
import {
  getGeminiApiKeyDiagnostics,
  hasGeminiApiKey,
  resolveGeminiApiKey
} from '../../src/config/gemini.js';

const ORIGINAL_GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ORIGINAL_GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;

function restoreEnv() {
  if (ORIGINAL_GEMINI_API_KEY === undefined) {
    delete process.env.GEMINI_API_KEY;
  } else {
    process.env.GEMINI_API_KEY = ORIGINAL_GEMINI_API_KEY;
  }

  if (ORIGINAL_GOOGLE_AI_API_KEY === undefined) {
    delete process.env.GOOGLE_AI_API_KEY;
  } else {
    process.env.GOOGLE_AI_API_KEY = ORIGINAL_GOOGLE_AI_API_KEY;
  }
}

afterEach(() => {
  restoreEnv();
});

describe('gemini config resolution', () => {
  it('prefers GEMINI_API_KEY when it has a valid-looking Google key shape', () => {
    process.env.GEMINI_API_KEY = 'AIzaSyGeminiPrimaryKey1234567890abcd';
    process.env.GOOGLE_AI_API_KEY = 'AIzaSyGeminiAliasKey9876543210wxyz';

    const resolved = resolveGeminiApiKey();

    expect(resolved.source).toBe('GEMINI_API_KEY');
    expect(resolved.apiKey).toBe(process.env.GEMINI_API_KEY);
  });

  it('falls back to GOOGLE_AI_API_KEY when primary key is missing', () => {
    delete process.env.GEMINI_API_KEY;
    process.env.GOOGLE_AI_API_KEY = 'AIzaSyGeminiAliasOnlyKey1234567890';

    const resolved = resolveGeminiApiKey();

    expect(resolved.source).toBe('GOOGLE_AI_API_KEY');
    expect(resolved.apiKey).toBe(process.env.GOOGLE_AI_API_KEY);
    expect(hasGeminiApiKey()).toBe(true);
  });

  it('uses GOOGLE_AI_API_KEY when GEMINI_API_KEY looks invalid but alias looks valid', () => {
    process.env.GEMINI_API_KEY = 'local-dev-gemini-key';
    process.env.GOOGLE_AI_API_KEY = 'AIzaSyGeminiAliasLooksValid123456789';

    const resolved = resolveGeminiApiKey();

    expect(resolved.source).toBe('GOOGLE_AI_API_KEY');
    expect(resolved.apiKey).toBe(process.env.GOOGLE_AI_API_KEY);
  });

  it('reports missing configuration when neither key is set', () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;

    const diagnostics = getGeminiApiKeyDiagnostics();

    expect(diagnostics.configured).toBe(false);
    expect(diagnostics.source).toBe(null);
    expect(hasGeminiApiKey()).toBe(false);
  });
});
