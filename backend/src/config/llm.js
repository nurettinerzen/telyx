import { getGeminiApiKeyDiagnostics, hasGeminiApiKey } from './gemini.js';
import { getOpenAiApiKeyDiagnostics, hasOpenAiApiKey } from './openai.js';

const LLM_PROVIDERS = Object.freeze({
  GEMINI: 'gemini',
  OPENAI: 'openai',
  AUTO: 'auto'
});

function normalizeProvider(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === LLM_PROVIDERS.OPENAI) return LLM_PROVIDERS.OPENAI;
  if (normalized === LLM_PROVIDERS.GEMINI) return LLM_PROVIDERS.GEMINI;
  if (normalized === LLM_PROVIDERS.AUTO) return LLM_PROVIDERS.AUTO;
  return LLM_PROVIDERS.AUTO;
}

export function getRequestedLlmProvider() {
  return normalizeProvider(process.env.LLM_PROVIDER || process.env.AI_PROVIDER || LLM_PROVIDERS.AUTO);
}

export function getActiveLlmProvider() {
  const requested = getRequestedLlmProvider();

  if (requested === LLM_PROVIDERS.AUTO) {
    return hasOpenAiApiKey() ? LLM_PROVIDERS.OPENAI : LLM_PROVIDERS.GEMINI;
  }

  return requested;
}

export function hasConfiguredPrimaryLlm() {
  const active = getActiveLlmProvider();
  if (active === LLM_PROVIDERS.OPENAI) {
    return hasOpenAiApiKey();
  }
  return hasGeminiApiKey();
}

export function getLlmDiagnostics() {
  const requestedProvider = getRequestedLlmProvider();
  const activeProvider = getActiveLlmProvider();
  const gemini = getGeminiApiKeyDiagnostics();
  const openai = getOpenAiApiKeyDiagnostics();

  return {
    requestedProvider,
    activeProvider,
    configured: hasConfiguredPrimaryLlm(),
    gemini,
    openai
  };
}

export default {
  LLM_PROVIDERS,
  getActiveLlmProvider,
  getLlmDiagnostics,
  getRequestedLlmProvider,
  hasConfiguredPrimaryLlm
};
