const GEMINI_API_KEY_ENV_KEYS = Object.freeze(['GEMINI_API_KEY', 'GOOGLE_AI_API_KEY']);
const GOOGLE_API_KEY_PATTERN = /^AIza[0-9A-Za-z_-]{16,}$/;

function normalizeSecret(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function looksLikeGoogleAiApiKey(value) {
  return GOOGLE_API_KEY_PATTERN.test(String(value || '').trim());
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
    looksValidShape: looksLikeGoogleAiApiKey(value),
    masked: maskSecret(value)
  };
}

function getCandidates() {
  return GEMINI_API_KEY_ENV_KEYS.map(readCandidate);
}

function selectCandidate(candidates = []) {
  const primary = candidates.find(candidate => candidate.envKey === 'GEMINI_API_KEY');
  const alias = candidates.find(candidate => candidate.envKey === 'GOOGLE_AI_API_KEY');

  if (primary?.present && primary.looksValidShape) {
    return primary;
  }

  if (alias?.present && alias.looksValidShape) {
    return alias;
  }

  if (primary?.present) {
    return primary;
  }

  if (alias?.present) {
    return alias;
  }

  return null;
}

function summarizeCandidates(candidates = []) {
  return candidates.map(({ envKey, present, looksValidShape, masked }) => ({
    envKey,
    present,
    looksValidShape,
    masked
  }));
}

export function resolveGeminiApiKey() {
  const candidates = getCandidates();
  const selected = selectCandidate(candidates);

  return {
    apiKey: selected?.value || null,
    source: selected?.envKey || null,
    candidates: summarizeCandidates(candidates)
  };
}

export function resolveGeminiApiKeyBySource(source) {
  const normalizedSource = String(source || '').trim();
  const candidates = getCandidates();
  const selected = candidates.find(candidate => candidate.envKey === normalizedSource && candidate.present);

  return {
    apiKey: selected?.value || null,
    source: selected?.envKey || null,
    candidates: summarizeCandidates(candidates)
  };
}

export function getGeminiApiKeyDiagnostics() {
  const resolved = resolveGeminiApiKey();
  return {
    configured: Boolean(resolved.apiKey),
    source: resolved.source,
    candidates: resolved.candidates
  };
}

export function hasGeminiApiKey() {
  return Boolean(resolveGeminiApiKey().apiKey);
}

export default {
  GEMINI_API_KEY_ENV_KEYS,
  getGeminiApiKeyDiagnostics,
  hasGeminiApiKey,
  looksLikeGoogleAiApiKey,
  maskSecret,
  resolveGeminiApiKey,
  resolveGeminiApiKeyBySource
};
