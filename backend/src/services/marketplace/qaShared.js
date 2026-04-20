import { decryptPossiblyEncryptedValue, encryptTokenValue } from '../../utils/encryption.js';

export const MARKETPLACE_PLATFORM = {
  TRENDYOL: 'TRENDYOL',
  HEPSIBURADA: 'HEPSIBURADA',
  AMAZON: 'AMAZON',
};

export const MARKETPLACE_QUESTION_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  POSTED: 'POSTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  ERROR: 'ERROR',
};

export const MARKETPLACE_ANSWER_MODE = {
  AUTO: 'AUTO',
  MANUAL: 'MANUAL',
};

export const DEFAULT_QA_SETTINGS = Object.freeze({
  answerMode: MARKETPLACE_ANSWER_MODE.MANUAL,
  language: 'tr',
  toneInstructions: '',
});

export function normalizeLanguage(value, fallback = 'tr') {
  const normalized = String(value || fallback || 'tr').trim().toLowerCase();
  return normalized || 'tr';
}

export function normalizeQaSettings(input = {}, fallbackLanguage = 'tr') {
  const answerMode = String(input?.answerMode || DEFAULT_QA_SETTINGS.answerMode).trim().toUpperCase();

  return {
    answerMode: answerMode === MARKETPLACE_ANSWER_MODE.AUTO
      ? MARKETPLACE_ANSWER_MODE.AUTO
      : MARKETPLACE_ANSWER_MODE.MANUAL,
    language: normalizeLanguage(input?.language, fallbackLanguage),
    toneInstructions: String(input?.toneInstructions || '').trim().slice(0, 1000),
  };
}

export function buildMarketplaceCredentials(rawCredentials = {}, fallbackLanguage = 'tr') {
  return {
    ...rawCredentials,
    qaSettings: normalizeQaSettings(rawCredentials?.qaSettings, fallbackLanguage),
  };
}

export function encryptMarketplaceCredentials(rawCredentials = {}, fallbackLanguage = 'tr') {
  const credentials = buildMarketplaceCredentials(rawCredentials, fallbackLanguage);

  return {
    ...credentials,
    apiKey: credentials.apiKey ? encryptTokenValue(credentials.apiKey) : credentials.apiKey,
    apiSecret: credentials.apiSecret ? encryptTokenValue(credentials.apiSecret) : credentials.apiSecret,
  };
}

export function decryptMarketplaceCredentials(rawCredentials = {}, fallbackLanguage = 'tr') {
  const credentials = buildMarketplaceCredentials(rawCredentials, fallbackLanguage);

  return {
    ...credentials,
    apiKey: credentials.apiKey
      ? decryptPossiblyEncryptedValue(credentials.apiKey, { allowPlaintext: true })
      : credentials.apiKey,
    apiSecret: credentials.apiSecret
      ? decryptPossiblyEncryptedValue(credentials.apiSecret, { allowPlaintext: true })
      : credentials.apiSecret,
  };
}

export function safeDecryptMarketplaceCredentials(rawCredentials = {}, fallbackLanguage = 'tr') {
  const normalizedCredentials = rawCredentials && typeof rawCredentials === 'object' && !Array.isArray(rawCredentials)
    ? rawCredentials
    : {};

  try {
    return decryptMarketplaceCredentials(normalizedCredentials, fallbackLanguage);
  } catch (error) {
    console.warn('Marketplace credential decrypt fallback:', error.message);
    return buildMarketplaceCredentials(normalizedCredentials, fallbackLanguage);
  }
}

export function maskCredentialValue(value, { keepStart = 3, keepEnd = 2 } = {}) {
  if (!value || typeof value !== 'string') return null;
  if (value.length <= keepStart + keepEnd) return '*'.repeat(value.length);
  return `${value.slice(0, keepStart)}${'*'.repeat(Math.max(4, value.length - keepStart - keepEnd))}${value.slice(-keepEnd)}`;
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function coerceDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isExpired(value) {
  const date = coerceDate(value);
  if (!date) return false;
  return date.getTime() <= Date.now();
}

export function truncateMarketplaceAnswer(text, maxLength = 2000) {
  const normalized = String(text || '')
    .replace(/\r/g, '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!normalized) {
    return '';
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

export function getMarketplaceQaAutomationEnabled() {
  return process.env.MARKETPLACE_QA_ALLOW_AUTOMATIC_POST === 'true';
}
