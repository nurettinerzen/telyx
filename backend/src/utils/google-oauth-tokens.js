import { decryptTokenValue, encryptTokenValue, isEncryptedValue } from './encryption.js';

const GOOGLE_OAUTH_TOKEN_FIELDS = ['access_token', 'refresh_token', 'id_token'];

function normalizeCredentials(credentials) {
  if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) {
    return {};
  }
  return { ...credentials };
}

/**
 * Encrypt Google OAuth token fields while preserving non-token metadata as plaintext.
 */
export function encryptGoogleTokenCredentials(credentials) {
  const normalized = normalizeCredentials(credentials);

  for (const field of GOOGLE_OAUTH_TOKEN_FIELDS) {
    const value = normalized[field];
    if (typeof value === 'string' && value.length > 0) {
      normalized[field] = encryptTokenValue(value);
    }
  }

  return normalized;
}

/**
 * Decrypt Google OAuth token fields for runtime usage.
 * Returns migration hint when legacy plaintext token values are found.
 */
export function decryptGoogleTokenCredentials(credentials) {
  const normalized = normalizeCredentials(credentials);
  let needsMigration = false;

  for (const field of GOOGLE_OAUTH_TOKEN_FIELDS) {
    const value = normalized[field];
    if (typeof value !== 'string' || value.length === 0) {
      continue;
    }

    if (isEncryptedValue(value)) {
      normalized[field] = decryptTokenValue(value, { allowPlaintext: false });
      continue;
    }

    needsMigration = true;
    normalized[field] = value;
  }

  return { credentials: normalized, needsMigration };
}

export function isPlaintextGoogleTokenValue(value) {
  return typeof value === 'string' && value.length > 0 && !isEncryptedValue(value);
}

export default {
  encryptGoogleTokenCredentials,
  decryptGoogleTokenCredentials,
  isPlaintextGoogleTokenValue,
};
