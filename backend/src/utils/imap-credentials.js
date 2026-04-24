import { decryptPossiblyEncryptedValue, encryptTokenValue, isEncryptedValue } from './encryption.js';

const IMAP_SECRET_FIELDS = ['password'];

function normalizeCredentials(credentials) {
  if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) {
    return {};
  }

  return { ...credentials };
}

export function encryptImapCredentials(credentials) {
  const normalized = normalizeCredentials(credentials);

  for (const field of IMAP_SECRET_FIELDS) {
    const value = normalized[field];
    if (typeof value === 'string' && value.length > 0) {
      normalized[field] = encryptTokenValue(value);
    }
  }

  return normalized;
}

export function decryptImapCredentials(credentials) {
  const normalized = normalizeCredentials(credentials);
  let needsMigration = false;

  for (const field of IMAP_SECRET_FIELDS) {
    const value = normalized[field];
    if (typeof value !== 'string' || value.length === 0) {
      continue;
    }

    if (isEncryptedValue(value)) {
      normalized[field] = decryptPossiblyEncryptedValue(value, { allowPlaintext: false });
      continue;
    }

    needsMigration = true;
    normalized[field] = value;
  }

  return { credentials: normalized, needsMigration };
}

export default {
  encryptImapCredentials,
  decryptImapCredentials,
};
