/**
 * PII Redaction Utility
 *
 * SECURITY: Masks personally identifiable information before returning to LLM.
 * Critical for preventing PII leakage in chat responses.
 *
 * P0 Security Fix: Audit Report Issue #2 - PII Leakage
 */

import { isLikelyTrPhone, isValidTckn, isValidVkn } from './pii-validators/tr.js';

const EMAIL_PATTERN = /\b[a-zA-Z0-9._%+-]{3,}@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
const PHONE_PATTERNS = Object.freeze([
  /\+90[\s.-]?5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}\b/g,
  /\b0?5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}\b/g,
  /\b5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}\b/g
]);
const TCKN_CANDIDATE_PATTERN = /\b(?:\d[\s-]?){10}\d\b/g;
const VKN_CANDIDATE_PATTERN = /\b(?:\d[\s-]?){9}\d\b/g;
const DEFAULT_PII_TYPES = Object.freeze(['EMAIL', 'PHONE', 'TCKN', 'VKN']);

function normalizeEmailAddress(value) {
  return String(value || '').trim().toLowerCase();
}

function buildAllowedEmailSet(options = {}) {
  const input = Array.isArray(options.allowedEmails)
    ? options.allowedEmails
    : typeof options.allowedEmails === 'string'
      ? [options.allowedEmails]
      : [];

  return new Set(
    input
      .map(normalizeEmailAddress)
      .filter(Boolean)
  );
}

function buildEnabledTypeSet(options = {}) {
  const input = Array.isArray(options.enabledTypes) && options.enabledTypes.length > 0
    ? options.enabledTypes
    : DEFAULT_PII_TYPES;

  return new Set(
    input
      .map(type => String(type || '').trim().toUpperCase())
      .filter(Boolean)
  );
}

function summarizeSensitiveValue(value) {
  const str = String(value || '');
  if (!str) return '';
  if (str.length <= 6) return '*'.repeat(Math.max(str.length, 4));
  return `${str.slice(0, 2)}***${str.slice(-2)}`;
}

function maskAllDigitsPreservingFormat(value) {
  return String(value || '').replace(/\d/g, '*');
}

function applyTextRedaction(currentText, regex, type, resolveReplacement, redactions) {
  regex.lastIndex = 0;

  return currentText.replace(regex, (...args) => {
    const match = args[0];
    const offset = args[args.length - 2];
    const replacement = resolveReplacement(match);

    if (typeof replacement !== 'string' || replacement === match) {
      return match;
    }

    redactions.push({
      type,
      start: Number(offset) || 0,
      end: (Number(offset) || 0) + match.length,
      matchPreview: summarizeSensitiveValue(match),
      replacementPreview: summarizeSensitiveValue(replacement)
    });

    return replacement;
  });
}

/**
 * Mask phone number
 * @param {string} phone - Full phone number
 * @returns {string} Masked phone number (e.g., "+90******1234")
 */
export function maskPhone(phone) {
  if (!phone) return null;

  const cleaned = String(phone).replace(/[^\d+]/g, '');

  if (cleaned.length < 4) {
    return '****'; // Too short to mask safely
  }

  // Show first 3 chars (country code) and last 4 digits
  // Examples:
  // +905551234567 (13 chars) → +90******4567 (3 + 6 + 4)
  // 05551234567 (11 chars) → 055******4567 (3 + 6 + 4)
  const prefix = cleaned.slice(0, 3);
  const suffix = cleaned.slice(-4);
  const maskLength = cleaned.length - 7; // total - prefix(3) - suffix(4)

  // Minimum 6 stars for consistency
  return `${prefix}${'*'.repeat(Math.max(maskLength, 6))}${suffix}`;
}

/**
 * Mask email address
 * @param {string} email - Full email address
 * @returns {string} Masked email (e.g., "a***@example.com")
 */
export function maskEmail(email) {
  if (!email) return null;

  const [local, domain] = String(email).split('@');

  if (!domain) {
    return '****'; // Invalid email
  }

  if (local.length <= 2) {
    return `**@${domain}`;
  }

  // Show first char, mask rest of local part
  return `${local[0]}***@${domain}`;
}

/**
 * Mask TC (Turkish ID number)
 * @param {string} tc - Turkish ID number
 * @returns {string} Masked TC (e.g., "***********")
 */
export function maskTC(tc) {
  if (!tc) return null;

  // TC is 11 digits - mask completely for maximum security
  const cleaned = String(tc).replace(/\D/g, '');

  if (cleaned.length === 11) {
    return '***********'; // All masked
  }

  return '****'; // Invalid TC
}

/**
 * Mask VKN (Turkish Tax ID)
 * @param {string} vkn - Turkish Tax ID
 * @returns {string} Masked VKN (e.g., "**********")
 */
export function maskVKN(vkn) {
  if (!vkn) return null;

  // VKN is 10 digits - mask completely
  const cleaned = String(vkn).replace(/\D/g, '');

  if (cleaned.length === 10) {
    return '**********';
  }

  return '****'; // Invalid VKN
}

/**
 * Mask full address
 * @param {string} address - Full address
 * @returns {string} Partial address (city/district only)
 */
export function maskAddress(address) {
  if (!address) return null;

  // Extract only city/district level information
  // Example: "Atatürk Mah. 123 Sok No:5 Kadıköy/İstanbul" → "Kadıköy/İstanbul"

  const addressStr = String(address);

  // Try to find city/district pattern (word/word at end)
  const districtCityMatch = addressStr.match(/([A-ZÇĞİÖŞÜa-zçğıöşü\s]+)\/([A-ZÇĞİÖŞÜa-zçğıöşü\s]+)$/);
  if (districtCityMatch) {
    return districtCityMatch[0].trim();
  }

  // Otherwise just return city if recognizable
  const turkishCities = [
    'İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Adana', 'Konya',
    'Gaziantep', 'Mersin', 'Kayseri', 'Eskişehir', 'Diyarbakır', 'Samsun',
    'Denizli', 'Şanlıurfa', 'Adapazarı', 'Malatya', 'Kahramanmaraş', 'Erzurum',
    'Van', 'Batman', 'Elazığ', 'İzmit', 'Manisa', 'Sivas', 'Gebze', 'Balıkesir',
    'Tarsus', 'Kütahya', 'Trabzon', 'Çorum', 'Çorlu', 'Adıyaman', 'Osmaniye',
    'Kırıkkale', 'Antakya', 'Aydın', 'İskenderun', 'Uşak', 'Aksaray'
  ];

  for (const city of turkishCities) {
    if (addressStr.includes(city)) {
      return city;
    }
  }

  // If no pattern found, return generic
  return 'Adres kayıtlı';
}

/**
 * Redact all PII from an object
 * @param {Object} data - Data object potentially containing PII
 * @returns {Object} Redacted copy of data
 */
export function redactPII(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const redacted = { ...data };

  // Redact common PII fields
  if (redacted.phone) redacted.phone = maskPhone(redacted.phone);
  if (redacted.customerPhone) redacted.customerPhone = maskPhone(redacted.customerPhone);
  if (redacted.email) redacted.email = maskEmail(redacted.email);
  if (redacted.customerEmail) redacted.customerEmail = maskEmail(redacted.customerEmail);
  if (redacted.tcNo) redacted.tcNo = maskTC(redacted.tcNo);
  if (redacted.vkn) redacted.vkn = maskVKN(redacted.vkn);
  if (redacted.address) redacted.address = maskAddress(redacted.address);
  if (redacted.fullAddress) redacted.fullAddress = maskAddress(redacted.fullAddress);

  return redacted;
}

/**
 * Span-level sanitizer for recoverable PII.
 * Keeps the rest of the LLM response intact instead of forcing a full fallback.
 *
 * @param {string} text
 * @param {Object} options
 * @returns {{ sanitized: string, modified: boolean, redactions: Array }}
 */
export function sanitizeDetectedPII(text, options = {}) {
  if (!text) {
    return {
      sanitized: text,
      modified: false,
      redactions: []
    };
  }

  const enabledTypes = buildEnabledTypeSet(options);
  const allowedEmails = buildAllowedEmailSet(options);
  const redactions = [];
  let sanitized = String(text);

  if (enabledTypes.has('EMAIL')) {
    sanitized = applyTextRedaction(
      sanitized,
      EMAIL_PATTERN,
      'EMAIL',
      (match) => {
        if (allowedEmails.has(normalizeEmailAddress(match))) {
          return match;
        }
        return maskEmail(match);
      },
      redactions
    );
  }

  if (enabledTypes.has('PHONE')) {
    for (const pattern of PHONE_PATTERNS) {
      sanitized = applyTextRedaction(
        sanitized,
        pattern,
        'PHONE',
        (match) => (isLikelyTrPhone(match) ? maskPhone(match) : match),
        redactions
      );
    }
  }

  if (enabledTypes.has('TCKN')) {
    sanitized = applyTextRedaction(
      sanitized,
      TCKN_CANDIDATE_PATTERN,
      'TCKN',
      (match) => {
        const digits = match.replace(/\D/g, '');
        return isValidTckn(digits) ? maskAllDigitsPreservingFormat(match) : match;
      },
      redactions
    );
  }

  if (enabledTypes.has('VKN')) {
    sanitized = applyTextRedaction(
      sanitized,
      VKN_CANDIDATE_PATTERN,
      'VKN',
      (match) => {
        const digits = match.replace(/\D/g, '');
        return isValidVkn(digits) ? maskAllDigitsPreservingFormat(match) : match;
      },
      redactions
    );
  }

  return {
    sanitized,
    modified: redactions.length > 0,
    redactions
  };
}

/**
 * Check if a string contains unredacted PII
 * P0-B CRITICAL: This is the last line of defense for PII leakage
 *
 * Uses checksum-validated detection for TC/VKN instead of blind digit-count regex.
 * This prevents false positives on order numbers, tracking numbers, and invalid IDs.
 *
 * @param {string} text - Text to check
 * @returns {boolean} True if potential PII found
 */
export function containsUnredactedPII(text, options = {}) {
  if (!text) return false;

  const result = sanitizeDetectedPII(text, options);
  if (result.modified) {
    const detectedTypes = [...new Set(result.redactions.map(item => item.type))];
    console.warn('🚨 [PII-Redaction] Recoverable unmasked PII detected', detectedTypes);
  }

  return result.modified;
}

export default {
  maskPhone,
  maskEmail,
  maskTC,
  maskVKN,
  maskAddress,
  redactPII,
  containsUnredactedPII,
  sanitizeDetectedPII
};
