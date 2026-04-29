const OPENAI_API_KEY_ENV_KEYS = Object.freeze(['OPENAI_API_KEY']);
const DEFAULT_OPENAI_CHAT_MODEL = 'gpt-4o-mini';

function normalizeSecret(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function looksLikeOpenAiApiKey(value) {
  const normalized = normalizeSecret(value);
  return Boolean(normalized && /^sk-[A-Za-z0-9_-]{16,}$/.test(normalized));
}

export function maskSecret(value) {
  const normalized = normalizeSecret(value);
  if (!normalized) return 'missing';
  if (normalized.length <= 8) return `${normalized.slice(0, 2)}***`;
  return `${normalized.slice(0, 4)}***${normalized.slice(-4)}`;
}

function readCandidate(envKey) {
  const value = normalizeSecret(process.env[envKey]);
  return {
    envKey,
    value,
    present: Boolean(value),
    looksValidShape: looksLikeOpenAiApiKey(value),
    masked: maskSecret(value)
  };
}

function getCandidates() {
  return OPENAI_API_KEY_ENV_KEYS.map(readCandidate);
}

export function resolveOpenAiApiKey() {
  const candidates = getCandidates();
  const selected = candidates.find(candidate => candidate.present);

  return {
    apiKey: selected?.value || null,
    source: selected?.envKey || null,
    candidates: candidates.map(({ envKey, present, looksValidShape, masked }) => ({
      envKey,
      present,
      looksValidShape,
      masked
    }))
  };
}

export function getOpenAiChatModel() {
  return String(process.env.OPENAI_CHAT_MODEL || DEFAULT_OPENAI_CHAT_MODEL).trim() || DEFAULT_OPENAI_CHAT_MODEL;
}

export function getOpenAiClassifierModel() {
  return String(process.env.OPENAI_CLASSIFIER_MODEL || process.env.OPENAI_CHAT_MODEL || DEFAULT_OPENAI_CHAT_MODEL).trim()
    || DEFAULT_OPENAI_CHAT_MODEL;
}

export function getOpenAiApiKeyDiagnostics() {
  const resolved = resolveOpenAiApiKey();
  return {
    configured: Boolean(resolved.apiKey),
    source: resolved.source,
    chatModel: getOpenAiChatModel(),
    classifierModel: getOpenAiClassifierModel(),
    candidates: resolved.candidates
  };
}

export function hasOpenAiApiKey() {
  return Boolean(resolveOpenAiApiKey().apiKey);
}

export default {
  DEFAULT_OPENAI_CHAT_MODEL,
  OPENAI_API_KEY_ENV_KEYS,
  getOpenAiApiKeyDiagnostics,
  getOpenAiChatModel,
  getOpenAiClassifierModel,
  hasOpenAiApiKey,
  looksLikeOpenAiApiKey,
  maskSecret,
  resolveOpenAiApiKey
};
