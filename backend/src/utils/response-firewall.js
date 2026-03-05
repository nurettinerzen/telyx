/**
 * Response Firewall
 *
 * SECURITY (P0 Fix): Prevents sensitive data leakage in LLM responses
 * - Blocks JSON dumps
 * - Blocks HTML/XML tags
 * - Blocks system prompt disclosure
 * - Blocks internal tool names/metadata
 * - Blocks unredacted PII
 *
 * Audit Report Issues #1, #2, #3
 */

import { containsUnredactedPII } from './pii-redaction.js';
import { getMessageVariant } from '../messages/messageCatalog.js';
import {
  PROMPT_DISCLOSURE_KEYWORDS_EN,
  PROMPT_DISCLOSURE_KEYWORDS_TR,
  PROMPT_DISCLOSURE_REGEX_PATTERNS,
  INTERNAL_METADATA_TERMS,
  INTERNAL_TOOL_INVOCATION_PATTERNS,
  INTERNAL_DATABASE_DISCLOSURE_PATTERNS
} from '../security/patterns/index.js';

// KB metadata disclosure patterns — catch responses that reveal internal KB structure
const KB_METADATA_DISCLOSURE_PATTERNS = Object.freeze([
  // "bilgi bankamızda X belge/dosya/kaynak var"
  /bilgi\s+banka\w*\s*[''`]?\s*\w*\s*\d+\s*(belge|dosya|kaynak|döküman|doküman|kayıt)/i,
  // "bilgi bankamızda şu belgeler var: ..."
  /bilgi\s+banka\w*\s*[''`]?\s*\w*\s*(şu|aşağıdaki|bulunan)\s*(belge|dosya|kaynak|döküman)/i,
  // Explicit KB doc name patterns: "X Knowledge Base", "X KB.docx", "X KB.pdf"
  /\w+\s+knowledge\s+base/i,
  /\w+\s+KB\.(docx?|pdf|xlsx?|txt|csv)/i,
  // "belgemiz/dokümanımız ... adında"
  /(belge|dosya|döküman|doküman)\w*\s+(adı|ismi|adında|isminde)\s/i,
  // "X ve Y adında iki belge"
  /adında\s+(iki|üç|dört|beş|\d+)\s*(ana\s+)?(belge|dosya|kaynak|döküman)/i,
  // Listing KB documents by name
  /bilgi\s+banka\w*.*?\*[^*]+\*.*?\*[^*]+\*/i,
]);

/**
 * Check if response contains dangerous JSON dumps
 * @param {string} text - Response text
 * @returns {boolean} True if JSON dump detected
 */
function containsJSONDump(text) {
  if (!text) return false;

  const str = String(text);

  // Check for JSON-like structures with multiple nested objects
  // Look for patterns like: {"field": "value", "another": {...}}
  const jsonPatternMatches = str.match(/\{[^{}]*"[^"]*":\s*[^{}]*\}/g) || [];

  // If more than 2 JSON-like objects, likely a dump
  if (jsonPatternMatches.length > 2) {
    return true;
  }

  // Check for array dumps: [{"item": ...}, {"item": ...}]
  if (/\[\s*\{.*?\}\s*,\s*\{.*?\}\s*\]/.test(str)) {
    return true;
  }

  // Check for code blocks with JSON
  if (/```(?:json)?\s*\{[\s\S]*?\}\s*```/.test(str)) {
    return true;
  }

  return false;
}

/**
 * Check if response contains HTML/XML tags
 * @param {string} text - Response text
 * @returns {boolean} True if HTML detected
 */
function containsHTMLDump(text) {
  if (!text) return false;

  const str = String(text);

  // Count HTML tags (opening and closing)
  const htmlTags = str.match(/<\/?[a-zA-Z][^>]*>/g) || [];

  // If more than 3 HTML tags, likely a dump
  if (htmlTags.length > 3) {
    return true;
  }

  // Check for common dump patterns
  if (/<html|<head|<body|<div|<table|<script/i.test(str)) {
    return true;
  }

  return false;
}

/**
 * Check if response contains system prompt disclosure
 * @param {string} text - Response text
 * @returns {boolean} True if prompt disclosure detected
 */
function containsPromptDisclosure(text) {
  if (!text) return false;

  const str = String(text);
  const strLower = str.toLowerCase();
  const strLowerTR = str.toLocaleLowerCase('tr-TR');

  // Check English keywords
  for (const keyword of PROMPT_DISCLOSURE_KEYWORDS_EN) {
    if (strLower.includes(keyword)) {
      return true;
    }
  }

  // Check Turkish keywords with proper locale
  for (const keyword of PROMPT_DISCLOSURE_KEYWORDS_TR) {
    if (strLowerTR.includes(keyword.toLocaleLowerCase('tr-TR'))) {
      return true;
    }
  }

  for (const pattern of PROMPT_DISCLOSURE_REGEX_PATTERNS) {
    if (pattern.test(str) || pattern.test(strLowerTR)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if response contains internal tool names/metadata
 * P1 Fix: Prevents tool name disclosure to end users
 * @param {string} text - Response text
 * @returns {boolean} True if internal metadata detected
 */
function containsInternalMetadata(text) {
  if (!text) return false;

  const raw = String(text);
  const str = raw.toLowerCase();

  for (const term of INTERNAL_METADATA_TERMS) {
    if (str.includes(term.toLowerCase())) {
      console.warn(`🚨 [Firewall] Internal term detected: ${term}`);
      return true;
    }
  }

  for (const pattern of INTERNAL_TOOL_INVOCATION_PATTERNS) {
    if (pattern.test(raw)) {
      console.warn(`🚨 [Firewall] Tool invocation pattern detected`);
      return true;
    }
  }

  for (const pattern of INTERNAL_DATABASE_DISCLOSURE_PATTERNS) {
    if (pattern.test(raw)) {
      console.warn('🚨 [Firewall] Database disclosure pattern detected');
      return true;
    }
  }

  // KB metadata disclosure: document names, file names, source counts
  if (KB_METADATA_DISCLOSURE_PATTERNS.some(p => p.test(raw))) {
    console.warn('🚨 [Firewall] KB metadata disclosure detected');
    return true;
  }

  return false;
}

/**
 * Sanitize response text
 * @param {string} text - Raw response
 * @param {string} language - User language
 * @returns {Object} { safe: boolean, sanitized: string, violations: string[] }
 */
export function sanitizeResponse(text, language = 'TR', options = {}) {
  const violations = [];

  // Check for violations
  if (containsJSONDump(text)) {
    violations.push('JSON_DUMP');
  }

  if (containsHTMLDump(text)) {
    violations.push('HTML_DUMP');
  }

  if (containsPromptDisclosure(text)) {
    violations.push('PROMPT_DISCLOSURE');
  }

  if (containsInternalMetadata(text)) {
    violations.push('INTERNAL_METADATA');
  }

  if (containsUnredactedPII(text)) {
    violations.push('UNREDACTED_PII');
  }

  // If violations found, return safe fallback
  if (violations.length > 0) {
    console.error('🚨 [FIREWALL] Response blocked:', violations);

    const fallbackVariant = getMessageVariant('FIREWALL_FALLBACK', {
      language,
      sessionId: options.sessionId,
      directiveType: 'FIREWALL',
      severity: 'warning',
      channel: options.channel,
      intent: options.intent,
      seedHint: violations.join(',')
    });

    return {
      safe: false,
      sanitized: fallbackVariant.text,
      violations,
      messageKey: fallbackVariant.messageKey,
      variantIndex: fallbackVariant.variantIndex,
      original: text // Keep for logging/debugging (not shown to user)
    };
  }

  // No violations - response is safe
  return {
    safe: true,
    sanitized: text,
    violations: []
  };
}

/**
 * Log firewall violation for monitoring
 * @param {Object} violation - Violation details
 * @param {Object} req - Express request object (optional)
 * @param {number} businessId - Business ID (optional)
 */
export async function logFirewallViolation(violation, req = null, businessId = null) {
  console.error('🚨 [FIREWALL] SECURITY VIOLATION:', {
    violations: violation.violations,
    timestamp: new Date().toISOString(),
    preview: violation.original?.substring(0, 200) // First 200 chars for debugging
  });

  // P0: Write SecurityEvent to database for Red Alert monitoring
  try {
    const { logFirewallBlock } = await import('../middleware/securityEventLogger.js');

    // Create a mock req object if not provided (for non-HTTP contexts)
    const reqObj = req || {
      ip: 'system',
      headers: { 'user-agent': 'internal' },
      path: '/chat',
      method: 'POST'
    };

    await logFirewallBlock(
      reqObj,
      violation.violations.join(', '),
      businessId
    );
  } catch (error) {
    console.error('Failed to log firewall violation to SecurityEvent:', error);
  }
}

export default {
  sanitizeResponse,
  logFirewallViolation,
  containsJSONDump,
  containsHTMLDump,
  containsPromptDisclosure,
  containsInternalMetadata
};
