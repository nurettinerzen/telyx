/**
 * PII Leak Prevention Policy
 *
 * Prevents sensitive personal information from leaking in email drafts.
 *
 * Types of PII:
 * - Turkish TC Kimlik (11 digits starting with non-zero)
 * - Credit card numbers
 * - Bank account numbers (IBAN)
 * - Full phone numbers (when repeated unnecessarily)
 * - Passwords/tokens
 * - Internal system IDs
 */

import { sanitizeDetectedPII } from '../../../utils/pii-redaction.js';
import { validatePII } from './piiValidation.js';

/**
 * PII detection patterns
 */
export const PIIPatterns = {
  // Turkish TC Kimlik No (11 digits, doesn't start with 0)
  TC_KIMLIK: {
    pattern: /\b[1-9]\d{10}\b/g,
    name: 'TC Kimlik No',
    severity: 'HIGH',
    action: 'SANITIZE',
    replacement: '[TC Kimlik No gizlendi]',
    detector: 'STRUCTURED'
  },

  VKN: {
    pattern: /\b\d{10}\b/g,
    name: 'Vergi Kimlik No',
    severity: 'HIGH',
    action: 'SANITIZE',
    replacement: '[VKN gizlendi]',
    detector: 'STRUCTURED'
  },

  // Credit card numbers (16 digits, possibly with spaces/dashes)
  CREDIT_CARD: {
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    name: 'Credit Card',
    severity: 'CRITICAL',
    action: 'BLOCK',
    replacement: '[Kart numarası gizlendi]'
  },

  // IBAN (Turkish format: TR + 24 digits)
  IBAN: {
    pattern: /\bTR\s?\d{2}\s?(?:\d{4}\s?){5}\d{2}\b/gi,
    name: 'IBAN',
    severity: 'CRITICAL',
    action: 'BLOCK',
    replacement: '[IBAN gizlendi]'
  },

  // CVV (3-4 digits, usually after card context)
  CVV: {
    pattern: /\b(?:cvv|cvc|güvenlik kodu|security code)\s*:?\s*(\d{3,4})\b/gi,
    name: 'CVV',
    severity: 'CRITICAL',
    action: 'BLOCK',
    replacement: '[Güvenlik kodu gizlendi]'
  },

  // Passwords
  PASSWORD: {
    pattern: /(?:password|[şŞ]ifre|sifre|parola)\s*:?\s*["']?([^\s"']+)["']?/giu,
    name: 'Password',
    severity: 'CRITICAL',
    action: 'BLOCK',
    replacement: '[Şifre gizlendi]'
  },

  // API keys / tokens
  API_KEY: {
    pattern: /\b(?:api[_-]?key|token|secret|bearer)\s*:?\s*["']?([a-zA-Z0-9_-]{20,})["']?/gi,
    name: 'API Key/Token',
    severity: 'CRITICAL',
    action: 'BLOCK',
    replacement: '[Token gizlendi]'
  },

  // Internal database IDs (patterns like id: 12345 or _id: abc123)
  INTERNAL_ID: {
    pattern: /\b(?:_id|internal_id|db_id|user_id)\s*:?\s*["']?([a-zA-Z0-9_-]+)["']?/gi,
    name: 'Internal ID',
    severity: 'HIGH',
    action: 'WARN',
    replacement: null // Don't replace, just warn
  },

  // Email addresses (only flag if multiple or looks like internal)
  INTERNAL_EMAIL: {
    pattern: /\b[a-zA-Z0-9._%+-]+@(?:internal|admin|system|localhost)\.[a-zA-Z]{2,}\b/gi,
    name: 'Internal Email',
    severity: 'HIGH',
    action: 'BLOCK',
    replacement: '[Email gizlendi]'
  },

  // Turkish phone with full format repeated (P0-B fix)
  // Patterns: +905551234567, 05551234567, 5551234567
  REPEATED_PHONE: {
    pattern: /(\+90\s?\d{3}\s?\d{3}\s?\d{2}\s?\d{2})/g,
    name: 'Phone Number',
    severity: 'MEDIUM',
    action: 'LIMIT', // Allow first occurrence, mask rest
    replacement: '[Telefon]',
    maxOccurrences: 1,
    detector: 'DISABLED'
  },

  // P0-B CRITICAL: Any full phone number (10-11 digits starting with 0 or 5)
  // This catches: 05551234567, 5551234567, etc.
  FULL_PHONE: {
    pattern: /\b0?5[0-9]{2}[0-9]{3}[0-9]{4}\b/g,
    name: 'Telefon Numarası',
    severity: 'HIGH',
    action: 'SANITIZE',
    replacement: '[Telefon gizlendi - son 4 hane: ****]',
    detector: 'STRUCTURED'
  }
};

const STRUCTURED_FINDING_MAP = Object.freeze({
  TCKN: {
    type: 'TC_KIMLIK',
    name: PIIPatterns.TC_KIMLIK.name,
    severity: PIIPatterns.TC_KIMLIK.severity,
    action: PIIPatterns.TC_KIMLIK.action
  },
  VKN: {
    type: 'VKN',
    name: PIIPatterns.VKN.name,
    severity: PIIPatterns.VKN.severity,
    action: PIIPatterns.VKN.action
  },
  PHONE: {
    type: 'FULL_PHONE',
    name: PIIPatterns.FULL_PHONE.name,
    severity: PIIPatterns.FULL_PHONE.severity,
    action: PIIPatterns.FULL_PHONE.action
  }
});

function buildStructuredFindings(content, options = {}) {
  const structured = sanitizeDetectedPII(content, {
    enabledTypes: ['PHONE', 'TCKN', 'VKN'],
    allowedEmails: options.allowedEmails || []
  });

  if (!structured.modified) {
    return {
      modified: false,
      sanitizedContent: content,
      findings: []
    };
  }

  const grouped = new Map();

  for (const redaction of structured.redactions) {
    const mapped = STRUCTURED_FINDING_MAP[redaction.type];
    if (!mapped) continue;

    const current = grouped.get(mapped.type) || {
      ...mapped,
      count: 0,
      matches: []
    };

    current.count += 1;
    if (current.matches.length < 3) {
      current.matches.push(redaction.matchPreview);
    }

    grouped.set(mapped.type, current);
  }

  return {
    modified: structured.modified,
    sanitizedContent: structured.sanitized,
    findings: [...grouped.values()]
  };
}

/**
 * Scan content for PII and return findings
 *
 * @param {string} content - Draft content to scan
 * @returns {Object} { findings: Array, hasCritical: boolean, hasHigh: boolean, hasBlocking: boolean, sanitizedContent: string }
 */
export function scanForPII(content, options = {}) {
  if (!content) {
    return {
      findings: [],
      hasCritical: false,
      hasHigh: false,
      hasBlocking: false,
      sanitizedContent: content
    };
  }

  const findings = [];
  const structured = buildStructuredFindings(content, options);
  findings.push(...structured.findings);

  for (const [piiType, config] of Object.entries(PIIPatterns)) {
    if (config.detector === 'STRUCTURED' || config.detector === 'DISABLED') {
      continue;
    }

    const matches = content.match(config.pattern);

    if (matches && matches.length > 0) {
      // Filter out false positives using validation
      let validatedMatches = matches;

      if (piiType === 'CREDIT_CARD') {
        validatedMatches = matches.filter(match =>
          validatePII(content, match, piiType)
        );

        if (validatedMatches.length < matches.length) {
          console.log(`[PII] ${piiType}: ${matches.length} regex matches, ${validatedMatches.length} validated matches`);
        }
      }

      // Only flag if validated matches exist
      if (validatedMatches.length > 0) {
        // For LIMIT action, only flag if exceeds max occurrences
        if (config.action === 'LIMIT') {
          if (validatedMatches.length > (config.maxOccurrences || 1)) {
            findings.push({
              type: piiType,
              name: config.name,
              severity: config.severity,
              action: config.action,
              count: validatedMatches.length,
              maxAllowed: config.maxOccurrences || 1,
              matches: validatedMatches.slice(0, 3) // Only show first 3 for logging
            });
          }
        } else {
          findings.push({
            type: piiType,
            name: config.name,
            severity: config.severity,
            action: config.action,
            count: validatedMatches.length,
            matches: validatedMatches.slice(0, 3)
          });
        }
      }
    }
  }

  return {
    findings,
    hasCritical: findings.some(f => f.action === 'BLOCK'),
    hasHigh: findings.some(f => f.severity === 'HIGH'),
    hasBlocking: findings.some(f => f.action === 'BLOCK'),
    sanitizedContent: structured.sanitizedContent
  };
}

/**
 * Apply PII prevention to draft content
 *
 * @param {string} content - Draft content
 * @param {Object} options - { strict: boolean, language: string }
 * @returns {Object} { content, blocked, modified, findings }
 */
export function preventPIILeak(content, options = {}) {
  const { strict = true, language = 'TR' } = options;

  if (!content) {
    return {
      content,
      blocked: false,
      modified: false,
      findings: []
    };
  }

  const scan = scanForPII(content, options);
  let modifiedContent = scan.sanitizedContent || content;
  let blocked = false;
  const modifications = [];

  for (const finding of scan.findings.filter(item => item.action === 'SANITIZE')) {
    modifications.push({
      type: finding.type,
      action: 'SANITIZED',
      count: finding.count
    });
  }

  for (const finding of scan.findings) {
    const config = PIIPatterns[finding.type];

    if (!config) continue;

    switch (config.action) {
      case 'BLOCK':
        if (strict) {
          // In strict mode, block the entire draft
          blocked = true;
          console.error(`🚫 [PII] BLOCKED: ${finding.name} detected (${finding.count} occurrences)`);
        } else {
          // In non-strict mode, replace the PII
          modifiedContent = modifiedContent.replace(config.pattern, config.replacement);
          modifications.push({
            type: finding.type,
            action: 'REPLACED',
            count: finding.count
          });
        }
        break;

      case 'LIMIT':
        // Replace occurrences beyond the limit
        let count = 0;
        modifiedContent = modifiedContent.replace(config.pattern, (match) => {
          count++;
          return count > config.maxOccurrences ? config.replacement : match;
        });

        if (count > config.maxOccurrences) {
          modifications.push({
            type: finding.type,
            action: 'LIMITED',
            kept: config.maxOccurrences,
            replaced: count - config.maxOccurrences
          });
        }
        break;

      case 'WARN':
        // Just log warning, don't modify
        console.warn(`⚠️ [PII] WARNING: ${finding.name} detected (${finding.count} occurrences)`);
        break;

      case 'SANITIZE':
        break;
    }
  }

  // If blocked, return error content
  if (blocked) {
    const errorMessage = language === 'TR'
      ? 'Bu taslak hassas bilgi içerdiği için oluşturulamadı. Lütfen sistem yöneticisiyle iletişime geçin.'
      : 'This draft could not be generated as it contains sensitive information. Please contact system administrator.';

    return {
      content: null,
      blocked: true,
      modified: false,
      findings: scan.findings,
      errorMessage
    };
  }

  return {
    content: modifiedContent,
    blocked: false,
    modified: modifications.length > 0,
    modifications,
    findings: scan.findings
  };
}

/**
 * Check if content is safe (no critical PII)
 */
export function isContentSafe(content) {
  const scan = scanForPII(content);
  return !scan.hasBlocking && !scan.hasHigh;
}

/**
 * Get PII summary for logging/metrics
 */
export function getPIISummary(content) {
  const scan = scanForPII(content);

  return {
    safe: !scan.hasBlocking && !scan.hasHigh,
    criticalCount: scan.findings.filter(f => f.action === 'BLOCK').length,
    highCount: scan.findings.filter(f => f.severity === 'HIGH').length,
    types: scan.findings.map(f => f.type)
  };
}

export default {
  PIIPatterns,
  scanForPII,
  preventPIILeak,
  isContentSafe,
  getPIISummary
};
