/**
 * PII Validation
 *
 * Validates potential PII matches to reduce false positives.
 * - Turkish TC Kimlik validation algorithm
 * - Luhn algorithm for credit cards
 * - Context-aware filtering
 */

/**
 * Validate Turkish TC Kimlik number
 * TC Kimlik has specific algorithm for 10th and 11th digits
 *
 * @param {string} tc - 11 digit TC number
 * @returns {boolean} True if valid TC Kimlik
 */
export function isValidTCKimlik(tc) {
  // Must be 11 digits
  if (!/^\d{11}$/.test(tc)) {
    return false;
  }

  // First digit cannot be 0
  if (tc[0] === '0') {
    return false;
  }

  const digits = tc.split('').map(Number);

  // 10th digit validation
  // Sum of odd positions (1,3,5,7,9) * 7 - Sum of even positions (2,4,6,8)
  // Result mod 10 should equal 10th digit
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7];
  const digit10 = (oddSum * 7 - evenSum) % 10;

  if (digit10 < 0) {
    return false; // Invalid
  }

  if (digits[9] !== digit10) {
    return false;
  }

  // 11th digit validation
  // Sum of first 10 digits mod 10 should equal 11th digit
  const sumFirst10 = digits.slice(0, 10).reduce((a, b) => a + b, 0);
  const digit11 = sumFirst10 % 10;

  if (digits[10] !== digit11) {
    return false;
  }

  return true;
}

/**
 * Luhn algorithm for credit card validation
 *
 * @param {string} number - Card number (digits only)
 * @returns {boolean} True if valid by Luhn algorithm
 */
export function isValidCreditCard(number) {
  // Remove spaces and dashes
  const cleaned = number.replace(/[\s-]/g, '');

  // Must be 13-19 digits
  if (!/^\d{13,19}$/.test(cleaned)) {
    return false;
  }

  let sum = 0;
  let isEven = false;

  // Loop from right to left
  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = parseInt(cleaned[i], 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

/**
 * Context allowlist - if these words appear near the number, it's NOT PII
 */
const SAFE_CONTEXTS = {
  TC_KIMLIK: [
    'sipariş', 'siparis', 'order', 'sp', 'tracking', 'takip', 'kargo',
    'fatura', 'invoice', 'ref', 'referans', 'reference', 'kod', 'code',
    'numara', 'no', 'id', 'musteri', 'customer'
  ],

  CREDIT_CARD: [
    'sipariş', 'siparis', 'order', 'tracking', 'takip', 'kargo',
    'ref', 'referans', 'fatura'
  ],

  IBAN: [
    // IBAN is already specific (starts with TR), low false positive risk
  ]
};

/**
 * Check if number appears in safe context
 *
 * @param {string} fullText - Full text content
 * @param {string} match - Matched number
 * @param {string} piiType - PII type (TC_KIMLIK, CREDIT_CARD, etc.)
 * @returns {boolean} True if in safe context (NOT PII)
 */
export function isInSafeContext(fullText, match, piiType) {
  const allowlist = SAFE_CONTEXTS[piiType];
  if (!allowlist || allowlist.length === 0) {
    return false;
  }

  // Extract context (100 chars before and after match)
  const matchIndex = fullText.indexOf(match);
  if (matchIndex === -1) {
    return false;
  }

  const contextStart = Math.max(0, matchIndex - 100);
  const contextEnd = Math.min(fullText.length, matchIndex + match.length + 100);
  const context = fullText.substring(contextStart, contextEnd).toLowerCase();

  // Check if any allowlisted word appears in context
  return allowlist.some(word => context.includes(word.toLowerCase()));
}

/**
 * Validate potential PII match
 *
 * @param {string} fullText - Full text content
 * @param {string} match - Matched string
 * @param {string} piiType - PII type
 * @returns {boolean} True if this is ACTUALLY PII (not false positive)
 */
export function validatePII(fullText, match, piiType) {
  // Step 1: Check safe context first (fastest check)
  if (isInSafeContext(fullText, match, piiType)) {
    console.log(`[PII Validation] ${piiType} match "${match}" in safe context - ALLOWED`);
    return false; // Not PII
  }

  // Step 2: Algorithm-based validation
  switch (piiType) {
    case 'TC_KIMLIK': {
      // Extract just digits
      const digits = match.replace(/\D/g, '');
      if (digits.length !== 11) {
        return false;
      }

      const isValid = isValidTCKimlik(digits);
      if (!isValid) {
        console.log(`[PII Validation] ${piiType} match "${match}" failed TC validation - ALLOWED`);
        return false; // Not valid TC, probably order number
      }

      console.warn(`[PII Validation] ${piiType} match "${match}" is VALID TC - BLOCKED`);
      return true; // Valid TC Kimlik
    }

    case 'CREDIT_CARD': {
      const isValid = isValidCreditCard(match);
      if (!isValid) {
        console.log(`[PII Validation] ${piiType} match "${match}" failed Luhn check - ALLOWED`);
        return false; // Not valid card, probably tracking number
      }

      console.warn(`[PII Validation] ${piiType} match "${match}" is VALID card - BLOCKED`);
      return true; // Valid credit card
    }

    case 'IBAN': {
      // IBAN already has "TR" prefix, low false positive
      // Could add IBAN validation algorithm here if needed
      return true;
    }

    case 'CVV':
    case 'PASSWORD':
    case 'API_KEY':
    case 'INTERNAL_EMAIL': {
      // These have low false positive risk
      return true;
    }

    default:
      return true; // Unknown type, be conservative
  }
}

export default {
  isValidTCKimlik,
  isValidCreditCard,
  isInSafeContext,
  validatePII
};
