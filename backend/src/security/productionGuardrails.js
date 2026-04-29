import { getActiveLlmProvider, hasConfiguredPrimaryLlm } from '../config/llm.js';

const REQUIRED_PRODUCTION_ENV = [
  {
    key: 'SECURITY_DATA_CLASSIFICATION_VERSION',
    validate: (value) => typeof value === 'string' && value.trim().length > 0,
    message: 'Security data classification version must be set.',
  },
  {
    key: 'PII_AT_REST_ENCRYPTION',
    validate: (value) => String(value || '').toLowerCase() === 'enabled',
    message: 'PII_AT_REST_ENCRYPTION must be "enabled".',
  },
  {
    key: 'KEY_PROVIDER',
    validate: (value) => ['vault', 'kms', 'env'].includes(String(value || '').toLowerCase()),
    message: 'KEY_PROVIDER must be "vault", "kms", or "env".',
  },
  {
    key: 'ENCRYPTION_MASTER_KEY',
    validate: () => {
      const masterKey = process.env.ENCRYPTION_MASTER_KEY;
      const legacyKey = process.env.ENCRYPTION_SECRET;
      return (
        (typeof masterKey === 'string' && masterKey.trim().length >= 16) ||
        (typeof legacyKey === 'string' && legacyKey.trim().length >= 16)
      );
    },
    message: 'ENCRYPTION_MASTER_KEY (or legacy ENCRYPTION_SECRET) must be set to at least 16 characters.',
  },
  {
    key: 'TLS_TRUST_POLICY',
    validate: (value) => String(value || '').toLowerCase() === 'strict',
    message: 'TLS_TRUST_POLICY must be "strict".',
  },
  {
    key: 'OCSP_STAPLING_ENABLED',
    validate: (value) => String(value || '').toLowerCase() === 'true',
    message: 'OCSP_STAPLING_ENABLED must be "true".',
  },
  {
    key: 'BACKUP_ENCRYPTION',
    validate: (value) => String(value || '').toLowerCase() === 'enabled',
    message: 'BACKUP_ENCRYPTION must be "enabled".',
  },
  {
    key: 'WHATSAPP_APP_SECRET',
    validate: () => {
      const whatsappAppSecret = process.env.WHATSAPP_APP_SECRET;
      const metaAppSecret = process.env.META_APP_SECRET;
      return (
        (typeof whatsappAppSecret === 'string' && whatsappAppSecret.trim().length > 0) ||
        (typeof metaAppSecret === 'string' && metaAppSecret.trim().length > 0)
      );
    },
    message: 'WHATSAPP_APP_SECRET (or META_APP_SECRET) must be set for webhook signature verification.',
  },
  {
    key: 'LLM_PROVIDER',
    validate: () => hasConfiguredPrimaryLlm(),
    message: 'Primary LLM credentials must be set for chat/email orchestration. Use OPENAI_API_KEY when LLM_PROVIDER=openai, or GEMINI_API_KEY/GOOGLE_AI_API_KEY when LLM_PROVIDER=gemini.',
  },
];

export function assertProductionSecurityPosture() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const failures = [];
  for (const requirement of REQUIRED_PRODUCTION_ENV) {
    const value = process.env[requirement.key];
    if (!requirement.validate(value)) {
      const suffix = requirement.key === 'LLM_PROVIDER'
        ? ` Active provider: ${getActiveLlmProvider()}.`
        : '';
      failures.push(`${requirement.key}: ${requirement.message}${suffix}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `SECURITY_POSTURE_ASSERTION_FAILED\n${failures.map((item) => `- ${item}`).join('\n')}`
    );
  }
}

export default {
  assertProductionSecurityPosture,
};
