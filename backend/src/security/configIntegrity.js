import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const SECURITY_ENV_KEYS = [
  'NODE_ENV',
  'ALLOWED_ORIGINS',
  'PUBLIC_CORS_ORIGINS',
  'SSRF_ALLOWED_PROTOCOLS',
  'SSRF_ALLOWED_PORTS',
  'SSRF_DOMAIN_ALLOWLIST',
  'SSRF_PATH_ALLOWLIST_REGEX',
  'MALWARE_SCAN_MODE',
  'ADMIN_MFA_MAX_AGE_MINUTES',
  'ADMIN_BOOTSTRAP_EMAILS',
  'CRON_SECRET',
  'JWT_SECRET',
  'ENCRYPTION_MASTER_KEY',
  'ENCRYPTION_SECRET',
  'PII_AT_REST_ENCRYPTION',
  'KEY_PROVIDER',
  'TLS_TRUST_POLICY',
  'OCSP_STAPLING_ENABLED',
  'STRIPE_WEBHOOK_SECRET',
  'ELEVENLABS_WEBHOOK_SECRET',
  'SECURITY_CONFIG_BASELINE_SHA256',
];

const SECURITY_FILE_PATHS = [
  'backend/src/server.js',
  'backend/src/middleware/auth.js',
  'backend/src/middleware/adminAuth.js',
  'backend/src/middleware/routeEnforcement.js',
  'backend/src/middleware/parameterPollution.js',
  'backend/src/middleware/cronAuth.js',
  'backend/src/security/passwordPolicy.js',
  'backend/src/security/productionGuardrails.js',
  'backend/src/security/sessionToken.js',
  'backend/src/security/uploadSecurity.js',
  'backend/src/utils/encryption.js',
  'backend/src/utils/ssrf-protection.js',
];

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function hashFile(absolutePath) {
  const file = await fs.readFile(absolutePath);
  return sha256Hex(file);
}

export async function buildSecurityConfigDigest({ cwd = process.cwd() } = {}) {
  const envHashes = {};
  for (const key of SECURITY_ENV_KEYS) {
    const value = process.env[key];
    envHashes[key] = value ? sha256Hex(String(value)) : 'UNSET';
  }

  const fileHashes = {};
  for (const relativePath of SECURITY_FILE_PATHS) {
    const absolutePath = path.resolve(cwd, relativePath);
    try {
      fileHashes[relativePath] = await hashFile(absolutePath);
    } catch (error) {
      fileHashes[relativePath] = `MISSING:${error.code || 'ERR'}`;
    }
  }

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    envHashes,
    fileHashes,
  };

  const digest = sha256Hex(JSON.stringify(payload));
  return {
    digest,
    payload,
    envKeys: [...SECURITY_ENV_KEYS],
    filePaths: [...SECURITY_FILE_PATHS],
  };
}

export function compareBaselineDigest(currentDigest, baselineDigest) {
  const normalizedCurrent = String(currentDigest || '').trim();
  const normalizedBaseline = String(baselineDigest || '').trim();
  if (!normalizedBaseline) {
    return { matches: false, reason: 'BASELINE_MISSING' };
  }
  return {
    matches: normalizedCurrent === normalizedBaseline,
    reason: normalizedCurrent === normalizedBaseline ? 'MATCH' : 'MISMATCH',
  };
}

export default {
  buildSecurityConfigDigest,
  compareBaselineDigest,
};
