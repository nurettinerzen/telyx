/**
 * Verification Service
 *
 * Centralized verification logic for ALL tools.
 * Implements anchor-first verification pattern:
 * 1. Tool finds record (anchor)
 * 2. Service checks if verification needed
 * 3. If needed, requests verification with anchor
 * 4. User provides verification input
 * 5. Service verifies against anchor
 * 6. Returns full or minimal data based on verification status
 *
 * SECURITY (P0 Fix): All PII is redacted before returning to LLM
 */

import { compareTurkishNames, comparePhones } from '../utils/text.js';
import { redactPII } from '../utils/pii-redaction.js';
import { getMessageVariant } from '../messages/messageCatalog.js';

const VERIFICATION_REQUIRED_QUERY_TYPES = new Set([
  'siparis',
  'order',
  'tracking',
  'kargo',
  'cargo',
  'debt',
  'borc',
  'muhasebe',
  'accounting',
  'billing',
  'payment',
  'odeme',
  'invoice',
  'fatura',
  'refund',
  'iade',
  'return'
]);

const VERIFICATION_EXEMPT_QUERY_TYPES = new Set([
  'genel',
  'general',
  'stock',
  'stok',
  'product',
  'urun',
  'support',
  'service',
  'servis',
  'ariza',
  'ticket',
  'randevu',
  'appointment'
]);

function normalizeQueryType(queryType) {
  return String(queryType || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/**
 * Check if a query type requires verification.
 *
 * Intent-aware policy:
 * - Transactional/account-specific flows require verification.
 * - General/support/service/stock flows do NOT trigger verification prompts.
 */
export function requiresVerification(queryType) {
  const normalizedQueryType = normalizeQueryType(queryType);

  if (!normalizedQueryType) {
    return false;
  }

  if (VERIFICATION_EXEMPT_QUERY_TYPES.has(normalizedQueryType)) {
    return false;
  }

  if (VERIFICATION_REQUIRED_QUERY_TYPES.has(normalizedQueryType)) {
    return true;
  }

  return /(siparis|order|tracking|kargo|cargo|debt|borc|muhasebe|billing|payment|odeme|invoice|fatura|refund|iade|return)/i
    .test(normalizedQueryType);
}

/**
 * Create verification anchor from found record
 * @param {Object} record - The found database record (order, customer, ticket, etc.)
 * @param {string} anchorType - Type of anchor: 'order', 'ticket', 'vkn', 'tc'
 * @param {string} anchorValue - The identifying value (order number, ticket number, etc.)
 * @param {string} sourceTable - DB table the record came from: 'CrmOrder' | 'CustomerData'
 * @returns {Object} Anchor object with verification data
 */
export function createAnchor(record, anchorType, anchorValue, sourceTable = 'CustomerData') {
  // customerId: For CustomerData records, customerId === id.
  // For CrmOrder records, customerId is null here; the tool handler resolves it
  // via resolveCustomerIdForOrder() before attaching _identityContext.
  // This enables the autoverify chain: anchor.customerId must match proof.matchedCustomerId.
  const customerId = sourceTable === 'CustomerData' ? record.id : null;

  return {
    id: record.id,
    customerId,
    name: record.customerName || record.contactName || record.companyName,
    phone: record.customerPhone || record.phone,
    email: record.customerEmail || record.email,
    anchorType,
    anchorValue,
    sourceTable
  };
}

/**
 * Check if verification is needed and return appropriate response
 * @param {Object} anchor - The verification anchor
 * @param {string} verificationInput - User's verification input (name, phone, etc.)
 * @param {string} queryType - Type of query
 * @param {string} language - User's language (TR/EN)
 * @returns {Object} Verification check result
 */
export function checkVerification(anchor, verificationInput, queryType, language = 'TR') {
  const needsVerify = requiresVerification(queryType);

  if (!needsVerify) {
    return {
      verified: true,
      action: 'PROCEED',
      reason: 'no_verification_needed'
    };
  }

  // No verification input provided yet
  if (!verificationInput) {
    // P0-UX FIX: Ask for phone last 4 digits (simpler for user)
    // Name verification is a fallback if phone is not available
    const askFor = anchor.phone ? 'phone_last4' : 'name';
    const messageVariant = anchor.phone
      ? getMessageVariant('VERIFICATION_REQUEST_PHONE_LAST4', {
        language,
        directiveType: 'ASK_VERIFICATION',
        severity: 'info',
        seedHint: `${anchor.anchorType}|${anchor.anchorValue}|phone_last4`
      })
      : getMessageVariant('VERIFICATION_REQUEST_NAME', {
        language,
        directiveType: 'ASK_VERIFICATION',
        severity: 'info',
        seedHint: `${anchor.anchorType}|${anchor.anchorValue}|name`
      });
    const message = messageVariant.text;

    return {
      verified: false,
      action: 'REQUEST_VERIFICATION',
      askFor,
      message,
      anchor: {
        id: anchor.id,
        type: anchor.anchorType,
        value: anchor.anchorValue,
        name: anchor.name,
        phone: anchor.phone,
        email: anchor.email,
        sourceTable: anchor.sourceTable
      }
    };
  }

  // Verify the input against anchor
  const verifyResult = verifyAgainstAnchor(anchor, verificationInput);

  if (verifyResult.matches) {
    return {
      verified: true,
      action: 'PROCEED',
      reason: 'verification_passed'
    };
  } else {
    return {
      verified: false,
      action: 'VERIFICATION_FAILED',
      message: getMessageVariant('VERIFICATION_FAILED', {
        language,
        directiveType: 'REFUSE',
        severity: 'warning',
        seedHint: `${anchor.anchorType}|${anchor.anchorValue}|verification_failed`
      }).text
    };
  }
}

/**
 * Verify user input against anchor
 * @param {Object} anchor - Verification anchor
 * @param {string} input - User's verification input
 * @returns {Object} Match result
 */
export function verifyAgainstAnchor(anchor, input) {
  if (!input || !anchor) {
    return { matches: false, reason: 'missing_data' };
  }

  // Normalize input
  const cleanInput = input.toString().trim();
  const digitsOnly = cleanInput.replace(/[^\d]/g, '');

  // P0-UX FIX: Check for phone last 4 digits FIRST
  // If input is exactly 4 digits, check against phone last 4
  if (digitsOnly.length === 4 && anchor.phone) {
    const anchorPhoneDigits = anchor.phone.replace(/[^\d]/g, '');
    const anchorLast4 = anchorPhoneDigits.slice(-4);

    console.log('🔐 [Verification] Checking phone last 4 digits:', {
      input: digitsOnly,
      anchorLast4: anchorLast4,
      matches: digitsOnly === anchorLast4
    });

    if (digitsOnly === anchorLast4) {
      return { matches: true, field: 'phone_last4' };
    }
    // 4 digits that don't match = verification failed
    return { matches: false, reason: 'phone_last4_mismatch' };
  }

  // Try name match
  if (anchor.name) {
    const nameMatches = compareTurkishNames(cleanInput, anchor.name);
    if (nameMatches) {
      return { matches: true, field: 'name' };
    }
  }

  // Try full phone match (if input looks like a full phone number - 10+ digits)
  if (anchor.phone && digitsOnly.length >= 10) {
    const phoneMatches = comparePhones(cleanInput, anchor.phone);
    if (phoneMatches) {
      return { matches: true, field: 'phone' };
    }
  }

  return { matches: false, reason: 'no_match' };
}

/**
 * Get minimal result (for unverified users)
 * Only returns non-sensitive status information
 * @param {Object} record - Database record
 * @param {string} queryType - Type of query
 * @param {string} language - User's language
 * @returns {Object} Minimal safe data
 */
export function getMinimalResult(record, queryType, language = 'TR') {
  const minimal = {
    success: true,
    verified: false,
    data: {}
  };

  // Only include non-sensitive status information
  if (queryType === 'siparis' || queryType === 'order') {
    minimal.data = {
      status: record.status || record.customFields?.['Durum'],
      statusOnly: true
    };
    minimal.message = language === 'TR'
      ? `Sipariş durumu: ${minimal.data.status}`
      : `Order status: ${minimal.data.status}`;
  } else if (queryType === 'ariza' || queryType === 'ticket') {
    minimal.data = {
      status: record.status || record.customFields?.['Durum'],
      statusOnly: true
    };
    minimal.message = language === 'TR'
      ? `Servis durumu: ${minimal.data.status}`
      : `Service status: ${minimal.data.status}`;
  } else {
    minimal.message = language === 'TR'
      ? 'Kayıt bulundu ancak detaylar için kimlik doğrulaması gerekiyor.'
      : 'Record found but verification required for details.';
  }

  return minimal;
}

/**
 * Get full result (for verified users)
 * Returns data with PII REDACTED
 *
 * SECURITY (P0 Fix): Even after verification, we NEVER return raw PII to LLM.
 * - Phone numbers are masked: +90******1234
 * - Emails are masked: a***@example.com
 * - TC/VKN completely hidden
 * - Addresses show only city/district
 *
 * @param {Object} record - Database record
 * @param {string} queryType - Type of query
 * @param {string} language - User's language
 * @returns {Object} Full data with PII redacted
 */
export function getFullResult(record, queryType, language = 'TR') {
  const customFields = record.customFields || {};

  // CRITICAL P0 FIX: Redact PII before returning to LLM
  const redactedRecord = redactPII(record);
  const redactedCustomFields = redactPII(customFields);

  const result = {
    outcome: 'OK', // S6-FIX: Add outcome for Tool Result Contract compliance
    success: true,
    verified: true,
    data: {
      customerName: record.customerName || record.companyName, // Name is OK (used for verification)
      phone: redactedRecord.customerPhone || redactedRecord.phone, // MASKED
      email: redactedRecord.customerEmail || redactedRecord.email, // MASKED
      ...redactedCustomFields // All PII fields masked
    }
  };

  // Generate detailed message based on query type AND add structured data
  // NOTE: Use original (non-redacted) data for messages, as they are shown to user
  // But use redacted data in result.data that goes to LLM
  //
  // CRITICAL: Also detect order records by checking for orderNumber field.
  // When classification fallback sends query_type='genel' but the record came
  // from CrmOrder table, we must still return order data (status, tracking, etc.)
  // Otherwise LLM sees only customerName/phone and can't answer order queries.
  const normalizedQueryType = String(queryType || '').toLowerCase();
  const isOrderRecord = !!(record.orderNumber || (record.status && !record.ticketNumber));
  const isDebtQuery = [
    'borc',
    'debt',
    'muhasebe',
    'sgk_borcu',
    'vergi_borcu',
    'odeme',
    'payment',
    'fatura',
    'invoice'
  ].includes(normalizedQueryType);

  if (normalizedQueryType === 'siparis' || normalizedQueryType === 'order' || isOrderRecord) {
    const orderNo = customFields['Sipariş No'] || record.orderNumber;
    const status = customFields['Durum'] || record.status;
    const tracking = customFields['Kargo Takip No'] || record.trackingNumber;
    const carrier = customFields['Kargo Firması'] || record.carrier;
    const delivery = customFields['Tahmini Teslimat'] || record.estimatedDelivery;
    const items = record.items;
    const totalAmount = record.totalAmount;

    // Add order fields to data so LLM has structured access
    // Non-PII fields can be included as-is
    result.data.order = {
      orderNumber: orderNo,
      status: status,
      trackingNumber: tracking || null,
      carrier: carrier || null,
      estimatedDelivery: delivery ? formatDate(delivery, language) : null,
      items: items || null,
      totalAmount: totalAmount || null
    };

    result.message = language === 'TR'
      ? `${orderNo} numaralı siparişiniz "${status}" durumunda.${tracking ? ` Kargo takip no: ${tracking}` : ''}${carrier ? ` (${carrier})` : ''}${delivery ? ` Tahmini teslimat: ${formatDate(delivery, language)}` : ''}`
      : `Your order ${orderNo} is "${status}".${tracking ? ` Tracking: ${tracking}` : ''}${carrier ? ` (${carrier})` : ''}`;

  } else if (isDebtQuery) {
    const sgk = customFields['SGK Borcu'] || customFields.sgkDebt;
    const tax = customFields['Vergi Borcu'] || customFields.taxDebt;
    const sgkOnly = normalizedQueryType === 'sgk_borcu';
    const taxOnly = normalizedQueryType === 'vergi_borcu';

    // Add debt fields to data
    result.data.debt = {
      sgk: sgk || null,
      tax: tax || null
    };

    if (sgkOnly) {
      result.message = language === 'TR'
        ? (sgk ? `SGK borcunuz: ${sgk} TL` : 'Kayıtlarda SGK borcu görünmüyor.')
        : (sgk ? `Your SSI debt is ${sgk} TL.` : 'No SSI debt is visible in records.');
    } else if (taxOnly) {
      result.message = language === 'TR'
        ? (tax ? `Vergi borcunuz: ${tax} TL` : 'Kayıtlarda vergi borcu görünmüyor.')
        : (tax ? `Your tax debt is ${tax} TL.` : 'No tax debt is visible in records.');
    } else {
      result.message = language === 'TR'
        ? `Borç bilgileriniz:${sgk ? ` SGK: ${sgk} TL` : ''}${tax ? `, Vergi: ${tax} TL` : ''}${!sgk && !tax ? ' Kayıtlarda açık borç görünmüyor.' : ''}`
        : `Your debt information:${sgk ? ` SSI: ${sgk} TL` : ''}${tax ? `, Tax: ${tax} TL` : ''}${!sgk && !tax ? ' No outstanding debt is visible in records.' : ''}`;
    }

    if (sgkOnly) {
      result.data.debt.tax = null;
    }
    if (taxOnly) {
      result.data.debt.sgk = null;
    }
  } else if (normalizedQueryType === 'ariza' || normalizedQueryType === 'ticket') {
    const ticketNo = customFields['Servis No'] || record.ticketNumber;
    const status = customFields['Durum'] || record.status;
    const issue = customFields['Arıza'] || record.issue;
    const notes = record.notes;
    const estimatedCompletion = record.estimatedCompletion;
    const cost = record.cost;

    // Add ticket fields to data
    result.data.ticket = {
      ticketNumber: ticketNo,
      status: status,
      issue: issue || null,
      notes: notes || null,
      estimatedCompletion: estimatedCompletion ? formatDate(estimatedCompletion, language) : null,
      cost: cost || null
    };

    result.message = language === 'TR'
      ? `${ticketNo} numaralı servis talebiniz "${status}" durumunda.${issue ? ` Arıza: ${issue}` : ''}`
      : `Your service ticket ${ticketNo} is "${status}".${issue ? ` Issue: ${issue}` : ''}`;

  } else {
    result.message = language === 'TR'
      ? 'Kayıt bilgileriniz başarıyla getirildi.'
      : 'Your record information retrieved successfully.';
  }

  return result;
}

/**
 * Format date for display
 * Uses UTC date components to avoid timezone shift
 */
function formatDate(date, language) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);

  // Use UTC date components to avoid timezone conversion issues
  // e.g., "2026-01-22T00:00:00.000Z" should display as "22 Ocak 2026", not "21 Ocak 2026"
  const day = d.getUTCDate();
  const month = d.getUTCMonth();
  const year = d.getUTCFullYear();

  const monthNamesTR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
                        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const monthNamesEN = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];

  if (language === 'TR') {
    return `${day} ${monthNamesTR[month]} ${year}`;
  } else {
    return `${monthNamesEN[month]} ${day}, ${year}`;
  }
}

export default {
  requiresVerification,
  createAnchor,
  checkVerification,
  getMinimalResult,
  getFullResult
};
