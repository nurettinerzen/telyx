import { decryptPossiblyEncryptedValue, encryptTokenValue } from '../../utils/encryption.js';
import { maskCredentialValue } from '../marketplace/qaShared.js';

export const COMPLAINT_PLATFORM = {
  SIKAYETVAR: 'SIKAYETVAR',
};

export const COMPLAINT_THREAD_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  POSTED: 'POSTED',
  REJECTED: 'REJECTED',
  CLOSED: 'CLOSED',
  ERROR: 'ERROR',
};

export const COMPLAINT_APPROVAL_MODE = {
  MANUAL: 'MANUAL',
};

export const DEFAULT_SIKAYETVAR_SETTINGS = Object.freeze({
  language: 'tr',
  toneInstructions: '',
  signature: '',
  autoGenerate: true,
  approvalMode: COMPLAINT_APPROVAL_MODE.MANUAL,
});

export function normalizeComplaintLanguage(value, fallback = 'tr') {
  const normalized = String(value || fallback || 'tr').trim().toLowerCase();
  return normalized || 'tr';
}

export function normalizeSikayetvarSettings(input = {}, fallbackLanguage = 'tr') {
  return {
    language: normalizeComplaintLanguage(input?.language, fallbackLanguage),
    toneInstructions: String(input?.toneInstructions || '').trim().slice(0, 1500),
    signature: String(input?.signature || '').trim().slice(0, 500),
    autoGenerate: input?.autoGenerate !== false,
    approvalMode: COMPLAINT_APPROVAL_MODE.MANUAL,
  };
}

export function buildSikayetvarCredentials(rawCredentials = {}, fallbackLanguage = 'tr') {
  const normalized = rawCredentials && typeof rawCredentials === 'object' && !Array.isArray(rawCredentials)
    ? rawCredentials
    : {};

  return {
    ...normalized,
    complaintSettings: normalizeSikayetvarSettings(normalized.complaintSettings, fallbackLanguage),
  };
}

export function encryptSikayetvarCredentials(rawCredentials = {}, fallbackLanguage = 'tr') {
  const credentials = buildSikayetvarCredentials(rawCredentials, fallbackLanguage);

  return {
    ...credentials,
    apiKey: credentials.apiKey ? encryptTokenValue(credentials.apiKey) : credentials.apiKey,
  };
}

export function decryptSikayetvarCredentials(rawCredentials = {}, fallbackLanguage = 'tr') {
  const credentials = buildSikayetvarCredentials(rawCredentials, fallbackLanguage);

  return {
    ...credentials,
    apiKey: credentials.apiKey
      ? decryptPossiblyEncryptedValue(credentials.apiKey, { allowPlaintext: true })
      : credentials.apiKey,
  };
}

export function safeDecryptSikayetvarCredentials(rawCredentials = {}, fallbackLanguage = 'tr') {
  const normalized = rawCredentials && typeof rawCredentials === 'object' && !Array.isArray(rawCredentials)
    ? rawCredentials
    : {};

  try {
    return decryptSikayetvarCredentials(normalized, fallbackLanguage);
  } catch (error) {
    console.warn('Sikayetvar credential decrypt fallback:', error.message);
    return buildSikayetvarCredentials(normalized, fallbackLanguage);
  }
}

export function buildSikayetvarStatusResponse(integration) {
  const rawCredentials = integration?.credentials && typeof integration.credentials === 'object'
    ? integration.credentials
    : {};
  const credentials = safeDecryptSikayetvarCredentials(rawCredentials);

  return {
    connected: Boolean(integration?.connected && integration?.isActive),
    companyId: credentials?.companyId || rawCredentials?.companyId || null,
    companyName: credentials?.companyName || rawCredentials?.companyName || null,
    companyUrl: credentials?.companyUrl || rawCredentials?.companyUrl || null,
    complaintSettings: credentials?.complaintSettings || DEFAULT_SIKAYETVAR_SETTINGS,
    lastSync: integration?.lastSync || null,
    maskedApiKey: maskCredentialValue(
      typeof credentials?.apiKey === 'string' ? credentials.apiKey : rawCredentials?.apiKey
    ),
    hasApiKey: Boolean(credentials?.apiKey || rawCredentials?.apiKey),
  };
}

export function coerceComplaintDate(value) {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function truncateComplaintReply(text, maxLength = 5000) {
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
