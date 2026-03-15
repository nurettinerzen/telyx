/**
 * Customer Data Lookup Handler V2
 * Uses centralized VerificationService and Tool Result Contract
 *
 * Flow:
 * 1. Find record (anchor)
 * 2. Check verification status
 * 3. Return minimal or full data based on verification
 *
 * SECURITY (P0 Fix): Order number normalization to prevent lookup failures
 */

import prisma from '../../prismaClient.js';
import { normalizePhone, phoneSearchVariants, compareTurkishNames } from '../../utils/text.js';
import {
  isLikelyValidOrderNumber,
  normalizeOrderLookupInput,
  normalizeOrderNumber
} from '../../utils/order-number.js';
import { isValidTckn, isValidVkn } from '../../utils/pii-validators/tr.js';

function looksLikePhoneIdentifier(value) {
  if (!value) return false;
  const raw = String(value).trim();
  if (!raw) return false;

  // If there are letters, treat it as an order/reference code, not phone.
  if (/[a-zA-Z\u00C0-\u024F]/.test(raw)) return false;

  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11;
}

async function findRecordByPhone({ businessId, phone, queryType }) {
  const variants = phoneSearchVariants(phone);
  const normalizedPhone = normalizePhone(phone) || String(phone || '');
  const normalizedQueryType = String(queryType || '').toLowerCase();

  // First try CustomerData table
  let record = await prisma.customerData.findFirst({
    where: {
      businessId,
      OR: variants.map(v => ({ phone: v }))
    }
  });
  let sourceTable = 'CustomerData';

  // If CustomerData found AND query is order-related, fetch latest CrmOrder.
  if (record && (normalizedQueryType === 'siparis' || normalizedQueryType === 'order')) {
    const relatedOrder = await prisma.crmOrder.findFirst({
      where: {
        businessId,
        OR: variants.map(v => ({ customerPhone: v }))
      },
      orderBy: { createdAt: 'desc' } // Most recent order
    });

    if (relatedOrder) {
      record = relatedOrder;
      sourceTable = 'CrmOrder';
    }
  }

  // If not found in CustomerData, try CrmOrder table
  if (!record) {
    const crmOrder = await prisma.crmOrder.findFirst({
      where: {
        businessId,
        OR: variants.map(v => ({ customerPhone: v }))
      }
    });

    if (crmOrder) {
      record = crmOrder;
      sourceTable = 'CrmOrder';
    }
  }

  // Service/ticket lookups can also live in CrmTicket.
  if (!record && SERVICE_QUERY_TYPES.has(normalizedQueryType) && prisma.crmTicket?.findFirst) {
    const crmTicket = await prisma.crmTicket.findFirst({
      where: {
        businessId,
        OR: variants.map(v => ({ customerPhone: v }))
      },
      orderBy: { updatedAt: 'desc' }
    });

    if (crmTicket) {
      record = crmTicket;
      sourceTable = 'CrmTicket';
    }
  }

  return {
    record,
    sourceTable,
    normalizedPhone,
    variantsCount: variants.length
  };
}
import {
  createAnchor,
  checkVerification,
  getMinimalResult,
  getFullResult,
  verifyAgainstAnchor,
  isHighRiskAction
} from '../../services/verification-service.js';
import {
  ok,
  notFound,
  validationError,
  verificationRequired,
  systemError,
  ToolOutcome,
  GENERIC_ERROR_MESSAGES
} from '../toolResult.js';
import { OutcomeEventType } from '../../security/outcomePolicy.js';

function toStateAnchor(anchor) {
  if (!anchor) return null;
  return {
    id: anchor.id,
    customerId: anchor.customerId || null,
    type: anchor.anchorType,
    value: anchor.anchorValue,
    name: anchor.name,
    phone: anchor.phone,
    email: anchor.email,
    sourceTable: anchor.sourceTable
  };
}

function isSameVerificationScope(previousAnchor, nextAnchor) {
  if (!previousAnchor || !nextAnchor) return false;

  if (
    previousAnchor.id &&
    nextAnchor.id &&
    String(previousAnchor.id) === String(nextAnchor.id)
  ) {
    return true;
  }

  if (
    previousAnchor.customerId &&
    nextAnchor.customerId &&
    String(previousAnchor.customerId) === String(nextAnchor.customerId)
  ) {
    return true;
  }

  return false;
}

// Verification TTL: how long a verification stays valid (default 15 minutes)
const VERIFICATION_TTL_MS = (parseInt(process.env.VERIFICATION_TTL_MINUTES, 10) || 15) * 60 * 1000;

/**
 * Check if verification is still within TTL.
 * Returns false (expired) when verifiedAt is missing or older than TTL.
 */
function isVerificationTTLValid(verifiedAt) {
  if (!verifiedAt) return false;
  return (Date.now() - verifiedAt) < VERIFICATION_TTL_MS;
}

/**
 * Cross-anchor customer match: checks phone + name (dual signal) between
 * a new anchor and the previously verified identity.
 *
 * Per security requirement: phone match alone is not sufficient —
 * we require an additional customer signal (name match) when available.
 */
function isCrossAnchorCustomerMatch(anchor, verificationState) {
  const verifiedPhone = verificationState?.verifiedCustomerPhone;
  if (!verifiedPhone || !anchor.phone) return false;

  // Phone match via normalized variants
  const anchorVariants = new Set(phoneSearchVariants(anchor.phone));
  const verifiedVariants = phoneSearchVariants(verifiedPhone);
  const phoneMatches = verifiedVariants.some(v => anchorVariants.has(v));

  if (!phoneMatches) return false;

  // Additional signal: name match (when both available)
  const verifiedName = verificationState?.verifiedCustomerName;
  const anchorName = anchor.name;
  if (verifiedName && anchorName) {
    // If both names exist, they must match (Turkish-aware comparison)
    const nameMatches = compareTurkishNames(verifiedName, anchorName);
    if (!nameMatches) {
      console.log('⚠️ [CrossAnchor] Phone matches but name mismatch — denying reuse', {
        verifiedName,
        anchorName
      });
      return false;
    }
  }

  // Phone matches + name matches (or name unavailable) → customer match
  return true;
}

const ORDER_CUSTOM_FIELD_NAMES = Object.freeze([
  'Sipariş No',
  'Siparis No',
  'SİPARİŞ NO',
  'Sipariş Numarası',
  'order_number',
  'orderNumber',
  'Order Number',
  'Order No'
]);

function buildOrderLookupCandidates(orderNumber) {
  const normalizedLookup = normalizeOrderLookupInput(orderNumber);
  const compactNormalized = normalizeOrderNumber(orderNumber);
  const compactLookup = normalizedLookup.replace(/\s+/g, '');

  return {
    normalizedLookup,
    compactNormalized,
    exactCandidates: Array.from(new Set([
      normalizedLookup,
      compactLookup,
      compactNormalized
    ].filter(Boolean)))
  };
}

function normalizedOrderMatch(value, normalizedOrder) {
  if (!value || !normalizedOrder) return false;
  return normalizeOrderNumber(String(value)) === normalizedOrder;
}

function buildOrderAmbiguityResponse(language = 'TR') {
  return {
    outcome: ToolOutcome.NEED_MORE_INFO,
    success: true,
    data: null,
    message: language === 'TR'
      ? 'Bu sipariş numarası birden fazla kayıtla eşleşti. Lütfen sipariş numarasını tek bir formatla tekrar paylaşır mısın?'
      : 'This order number matches multiple records. Please share the order number again in a single exact format.',
    field: 'order_number',
    ambiguity: true
  };
}

const ACCOUNTING_QUERY_TYPES = new Set([
  'muhasebe',
  'sgk_borcu',
  'vergi_borcu',
  'borc',
  'debt',
  'odeme',
  'payment',
  'fatura',
  'invoice'
]);

const SERVICE_QUERY_TYPES = new Set([
  'ariza',
  'ticket',
  'servis',
  'service'
]);

function normalizeQueryTypeAlias(queryType) {
  const normalized = String(queryType || '').trim().toLowerCase();
  if (normalized === 'order') return 'siparis';
  if (normalized === 'service') return 'servis';
  return normalized;
}

function isAccountingQueryType(queryType) {
  return ACCOUNTING_QUERY_TYPES.has(String(queryType || '').toLowerCase());
}

function resolveVerificationQueryType({
  queryType,
  anchor = null,
  record = null,
  sourceTable = null,
  isAccountingQuery = false
} = {}) {
  const normalized = normalizeQueryTypeAlias(queryType);
  if (isAccountingQuery) return 'muhasebe';

  const anchorType = String(anchor?.anchorType || anchor?.type || '').toLowerCase();
  const source = String(sourceTable || anchor?.sourceTable || '').toLowerCase();
  const isTicketSource = source === 'crmticket' || anchorType === 'ticket' || Boolean(record?.ticketNumber);
  if (isTicketSource) return 'servis';

  const isOrderSource =
    source === 'crmorder' ||
    anchorType === 'order' ||
    Boolean(record?.orderNumber) ||
    Boolean(record?.status && !record?.ticketNumber && source !== 'crmticket');
  if (isOrderSource) return 'siparis';

  return normalized || 'genel';
}

function normalizeVerificationCandidate(
  verificationInput,
  customerName,
  { allowNameFallback = true, requireNumericNameFallback = false } = {}
) {
  if (verificationInput !== undefined && verificationInput !== null && String(verificationInput).trim()) {
    return String(verificationInput).trim();
  }
  if (!allowNameFallback) {
    return null;
  }
  if (customerName === undefined || customerName === null) {
    return null;
  }

  const candidate = String(customerName).trim();
  if (!candidate) return null;
  if (requireNumericNameFallback) {
    const digitsOnly = candidate.replace(/\D/g, '');
    if (digitsOnly.length === 4 || digitsOnly.length >= 10) {
      // LLM sometimes places verification digits under customer_name.
      return candidate;
    }
    return null;
  }
  return candidate;
}

function requestExpectedVerificationInput({ language, anchor, askFor }) {
  const isPhoneLast4 = askFor === 'phone_last4' && Boolean(anchor?.phone);
  const message = isPhoneLast4
    ? (language === 'TR'
      ? 'Güvenlik doğrulaması için kayıtlı telefon numaranızın son 4 hanesini paylaşır mısınız?'
      : 'For security verification, could you share the last 4 digits of your registered phone number?')
    : (language === 'TR'
      ? 'Güvenlik doğrulaması için adınızı ve soyadınızı paylaşır mısınız?'
      : 'For security verification, could you share your full name?');

  return {
    ...verificationRequired(message, {
      askFor,
      anchor: toStateAnchor(anchor)
    }),
    stateEvents: [
      {
        type: OutcomeEventType.VERIFICATION_REQUIRED,
        askFor,
        anchor: toStateAnchor(anchor)
      }
    ]
  };
}

async function findRecordByTicketNumber({ businessId, ticketNumber }) {
  if (!prisma.crmTicket?.findFirst) {
    return null;
  }

  const normalizedTicket = String(ticketNumber || '').trim();
  if (!normalizedTicket) {
    return null;
  }

  // Start with exact match, then fall back to contains for format variants.
  const exactMatch = await prisma.crmTicket.findFirst({
    where: {
      businessId,
      ticketNumber: normalizedTicket
    }
  });

  if (exactMatch) {
    return exactMatch;
  }

  return prisma.crmTicket.findFirst({
    where: {
      businessId,
      ticketNumber: { contains: normalizedTicket }
    },
    orderBy: { updatedAt: 'desc' }
  });
}

function buildAccountingMissingIdentityResponse(language = 'TR') {
  const isEnglish = String(language || '').toUpperCase() === 'EN';
  const message = isEnglish
    ? 'To check your debt details, could you share your tax ID, Turkish ID number, or registered phone number?'
    : 'Borç detayınızı kontrol edebilmem için VKN, TC Kimlik numarası veya kayıtlı telefon numaranızı paylaşır mısınız?';

  const askFor = ['vkn_or_tc_or_phone'];

  return {
    outcome: ToolOutcome.NEED_MORE_INFO,
    success: true,
    data: { askFor },
    askFor,
    field: 'vkn_or_tc_or_phone',
    message
  };
}

/**
 * Execute customer data lookup
 */
export async function execute(args, business, context = {}) {
  try {
    const {
      query_type,
      phone,
      order_number,
      ticket_number,
      customer_name,
      vkn,
      tc,
      verification_input
    } = args;
    const sessionId = context.sessionId || context.conversationId;
    const language = business.language || 'TR';

    const state = context.state || {};
    const verificationState = state.verification?.status || state.verificationStatus || state.verification?.state || 'none';
    const isSessionVerified = verificationState === 'verified';

    // P0-C SECURITY FIX: verification_input ONLY accepted when state is pending/failed
    // Prevents LLM single-shot bypass (sending all params in one call)
    const isVerificationPending = verificationState === 'pending' || verificationState === 'failed';
    const verificationAnchor = state.verification?.anchor || state.verificationAnchor || null;
    const pendingAskForRaw =
      state.verification?.pendingField ||
      state.verification?.askFor ||
      state.pendingVerificationField ||
      null;
    const pendingAskFor = Array.isArray(pendingAskForRaw) ? pendingAskForRaw[0] : pendingAskForRaw;
    const inferredAskFor = pendingAskFor || (verificationAnchor?.phone ? 'phone_last4' : null);
    const expectsPhoneLast4 = isVerificationPending &&
      inferredAskFor === 'phone_last4' &&
      Boolean(verificationAnchor?.phone);
    // SECURITY: Reject verification_input that equals the phone arg or anchor phone.
    // LLM can copy the full phone from state/anchor into verification_input,
    // bypassing verification by matching against itself.
    let sanitizedVerificationInput = verification_input;
    if (sanitizedVerificationInput && phone) {
      const cleanVI = String(sanitizedVerificationInput).replace(/\D/g, '');
      const cleanPhone = String(phone).replace(/\D/g, '');
      if (cleanVI === cleanPhone) {
        console.warn('🚨 [CDL-SECURITY] verification_input matches phone arg — rejecting copy-paste bypass');
        sanitizedVerificationInput = null;
      }
    }
    if (sanitizedVerificationInput && verificationAnchor?.phone) {
      const cleanVI = String(sanitizedVerificationInput).replace(/\D/g, '');
      const cleanAnchor = String(verificationAnchor.phone).replace(/\D/g, '');
      if (cleanVI === cleanAnchor) {
        console.warn('🚨 [CDL-SECURITY] verification_input matches anchor phone — rejecting copy-paste bypass');
        sanitizedVerificationInput = null;
      }
    }
    const normalizedVerificationCandidate = normalizeVerificationCandidate(
      sanitizedVerificationInput,
      customer_name,
      {
        allowNameFallback: true,
        requireNumericNameFallback: expectsPhoneLast4
      }
    );
    const effectiveVerificationInput = isVerificationPending
      ? normalizedVerificationCandidate
      : null; // Ignore verification_input when not in verification flow

    const normalizedQueryType = normalizeQueryTypeAlias(query_type);
    const isOrderQuery = normalizedQueryType === 'siparis' || normalizedQueryType === 'order';
    const isTicketQuery = SERVICE_QUERY_TYPES.has(normalizedQueryType);
    const isAccountingQuery = isAccountingQueryType(normalizedQueryType);
    const hasLookupIdentifier = Boolean(order_number || ticket_number || phone || vkn || tc);
    const orderLookup = order_number ? buildOrderLookupCandidates(order_number) : null;

    // Minimal validation only: reject empty/too-short values.
    // Do not apply format/prefix regex gates before DB lookup.
    if (isOrderQuery && order_number !== undefined && order_number !== null && !isLikelyValidOrderNumber(order_number)) {
      return validationError(
        language === 'TR'
          ? 'Sipariş numarası çok kısa görünüyor. En az 3 karakter olacak şekilde tekrar paylaşır mısın?'
          : 'The order number looks too short. Please share it again with at least 3 characters.',
        'order_number'
      );
    }

    // SECURITY: Don't log PII (phone, vkn, tc, names)
    console.log('🔍 [CustomerDataLookup-V2] Query:', {
      query_type,
      has_phone: !!phone,
      has_order: !!order_number,
      has_ticket: !!ticket_number,
      has_name: !!customer_name,
      has_vkn: !!vkn,
      has_tc: !!tc,
      businessId: business.id,
      sessionId,
      verificationStatus: verificationState
    });

    // ============================================================================
    // P0: VERIFICATION HANDLER - Process pending verification
    // ============================================================================

    console.log('🔐 [Debug] Verification check:', {
      hasState: !!state,
      hasVerification: !!state.verification,
      status: verificationState,
      hasAnchor: !!verificationAnchor,
      pendingAskFor,
      hasVerificationInput: !!effectiveVerificationInput,
      verificationInput: effectiveVerificationInput
    });

    const verificationInputDigits = String(effectiveVerificationInput || '').replace(/\D/g, '');
    const looksLikePhoneVerification = verificationInputDigits.length === 4 || verificationInputDigits.length >= 10;

    if (
      isVerificationPending &&
      verificationAnchor &&
      expectsPhoneLast4 &&
      effectiveVerificationInput &&
      !looksLikePhoneVerification
    ) {
      // Strict mode: when system asks for phone last4, do not accept pure name responses.
      return requestExpectedVerificationInput({
        language,
        anchor: verificationAnchor,
        askFor: 'phone_last4'
      });
    }

    // P0-UX FIX: Process verification with ANY verification input (name OR phone_last4)
    // RECOVERY: Also handle 'failed' status — if user provides correct input, forgive past mistakes
    // Note: isVerificationPending already computed above (P0-C fix)
    if (isVerificationPending && verificationAnchor && effectiveVerificationInput) {
      console.log('🔐 [Verification] Processing verification (status:', verificationState, ')');
      console.log('🔐 [Verification] Input:', effectiveVerificationInput, '| Anchor phone:', verificationAnchor.phone);

      const anchor = verificationAnchor;
      const pendingVerificationQueryType = resolveVerificationQueryType({
        queryType: normalizedQueryType,
        anchor,
        sourceTable: anchor?.sourceTable,
        isAccountingQuery
      });
      const verifyResult = checkVerification(anchor, effectiveVerificationInput, pendingVerificationQueryType, language);

      if (verifyResult.action === 'PROCEED') {
        // Fetch the full record using anchor ID from the CORRECT table
        const table = anchor.sourceTable || 'CustomerData';
        console.log('🔍 [Verification] Fetching verified record from:', table, 'id:', anchor.id);

        let verifiedRecord;
        if (table === 'CrmOrder') {
          verifiedRecord = await prisma.crmOrder.findUnique({ where: { id: anchor.id } });
        } else if (table === 'CrmTicket' && prisma.crmTicket?.findUnique) {
          verifiedRecord = await prisma.crmTicket.findUnique({ where: { id: anchor.id } });
        } else {
          verifiedRecord = await prisma.customerData.findUnique({ where: { id: anchor.id } });
        }

        if (verifiedRecord) {
          const fullResult = getFullResult(verifiedRecord, normalizedQueryType, language);
          return {
            ...fullResult,
            _identityContext: {
              anchorCustomerId: anchor.customerId || null,
              anchorId: anchor.id || null,
              anchorSourceTable: anchor.sourceTable || null,
              queryType: pendingVerificationQueryType
            },
            stateEvents: [
              {
                type: OutcomeEventType.VERIFICATION_PASSED,
                anchor: toStateAnchor(anchor),
                attempts: 0
              }
            ]
          };
        }

        return systemError(
          language === 'TR'
            ? 'Kayıt bulunamadı.'
            : 'Record not found.'
        );
      }

      // Tool remains pure: compute attempt outcome, orchestrator mutates state.
      const nextAttempts = (state.verification?.attempts || 0) + 1;
      console.log(`❌ [Verification] Failed - attempt ${nextAttempts}`);

      // Loop breaker: After 2 failed attempts, return validation outcome directly.
      if (nextAttempts >= 2) {
        console.log('🔄 [Verification] Max attempts reached - returning validation error');
        return {
          outcome: ToolOutcome.VALIDATION_ERROR,
          success: true,
          message: language === 'TR'
            ? 'Bilgiler doğrulanamadı. Sipariş numaranızı kontrol edebilir misiniz? Farklı bir sipariş sorgulamak isterseniz sipariş numarasını söyleyin.'
            : 'Could not verify the information. Can you check your order number? If you want to query a different order, please provide the order number.',
          stateEvents: [
            {
              type: OutcomeEventType.VERIFICATION_FAILED,
              attempts: nextAttempts
            }
          ]
        };
      }

      // First failure: generic not_found response (security) + verification.failed event
      return {
        ...notFound(GENERIC_ERROR_MESSAGES[language] || GENERIC_ERROR_MESSAGES.TR),
        stateEvents: [
          {
            type: OutcomeEventType.VERIFICATION_FAILED,
            attempts: nextAttempts
          }
        ]
      };
    }

    // If verification is pending but the user did not provide verification input
    // and also did not provide a new lookup identifier, keep requesting verification.
    if (isVerificationPending && verificationAnchor && !effectiveVerificationInput && !hasLookupIdentifier) {
      const reminderVerificationQueryType = resolveVerificationQueryType({
        queryType: normalizedQueryType,
        anchor: verificationAnchor,
        sourceTable: verificationAnchor?.sourceTable,
        isAccountingQuery
      });
      const verificationReminder = checkVerification(
        verificationAnchor,
        null,
        reminderVerificationQueryType,
        language
      );
      return {
        ...verificationRequired(verificationReminder.message, {
          askFor: verificationReminder.askFor,
          anchor: verificationReminder.anchor
        }),
        stateEvents: [
          {
            type: OutcomeEventType.VERIFICATION_REQUIRED,
            askFor: verificationReminder.askFor,
            anchor: verificationReminder.anchor
          }
        ]
      };
    }

    // Debt/accounting lookups must request an identifier first.
    // Returning NEED_MORE_INFO avoids false NOT_FOUND -> TOOL_NOT_FOUND blocks.
    if (isAccountingQuery && !hasLookupIdentifier) {
      return buildAccountingMissingIdentityResponse(language);
    }

    // ============================================================================
    // STEP 1: FIND RECORD (ANCHOR)
    // ============================================================================

    let record = null;
    let anchorType = null;
    let anchorValue = null;
    let sourceTable = 'CustomerData'; // Track which DB table the record came from

    // Strategy 1: Order number
    if (order_number) {
      const {
        normalizedLookup,
        compactNormalized,
        exactCandidates
      } = orderLookup;

      console.log('🔍 [Lookup] Searching by order_number:', {
        original: order_number,
        normalizedLookup,
        compactNormalized,
        exactCandidates
      });

      const crmOrderCandidates = await prisma.crmOrder.findMany({
        where: {
          businessId: business.id,
          orderNumber: { in: exactCandidates }
        }
      });

      const normalizedCrmOrders = crmOrderCandidates.filter(
        (candidate) => normalizedOrderMatch(candidate.orderNumber, compactNormalized)
      );

      if (normalizedCrmOrders.length > 1) {
        console.warn('⚠️ [Lookup] Ambiguous CrmOrder matches for normalized order number:', {
          businessId: business.id,
          order_number: normalizedLookup,
          normalized: compactNormalized,
          matchCount: normalizedCrmOrders.length
        });
        return buildOrderAmbiguityResponse(language);
      }

      const crmOrder = normalizedCrmOrders[0];

      if (crmOrder) {
        console.log('✅ [Lookup] Found CRM order:', crmOrder.orderNumber);
        record = crmOrder;
        anchorType = 'order';
        anchorValue = crmOrder.orderNumber;
        sourceTable = 'CrmOrder';
      } else {
        console.log('🔍 [Lookup] Not in CrmOrder, searching CustomerData with DB filters...');

        const customerOrderNoCandidates = await prisma.customerData.findMany({
          where: {
            businessId: business.id,
            orderNo: { in: exactCandidates }
          }
        });

        const normalizedCustomerOrderNoMatches = customerOrderNoCandidates.filter(
          (candidate) => normalizedOrderMatch(candidate.orderNo, compactNormalized)
        );

        const customFieldWhereClauses = [];
        for (const fieldName of ORDER_CUSTOM_FIELD_NAMES) {
          for (const candidate of exactCandidates) {
            customFieldWhereClauses.push({
              customFields: {
                path: [fieldName],
                equals: candidate
              }
            });
          }
        }

        let normalizedCustomerCustomFieldMatches = [];
        if (customFieldWhereClauses.length > 0) {
          const customerCustomFieldCandidates = await prisma.customerData.findMany({
            where: {
              businessId: business.id,
              OR: customFieldWhereClauses
            }
          });

          normalizedCustomerCustomFieldMatches = customerCustomFieldCandidates.filter((candidate) => {
            if (!candidate.customFields || typeof candidate.customFields !== 'object') {
              return false;
            }

            return ORDER_CUSTOM_FIELD_NAMES.some((fieldName) => {
              const fieldValue = candidate.customFields[fieldName];
              return normalizedOrderMatch(fieldValue, compactNormalized);
            });
          });
        }

        const normalizedCustomerMatchesMap = new Map();
        for (const match of normalizedCustomerOrderNoMatches) {
          normalizedCustomerMatchesMap.set(match.id, match);
        }
        for (const match of normalizedCustomerCustomFieldMatches) {
          normalizedCustomerMatchesMap.set(match.id, match);
        }
        const normalizedCustomerMatches = Array.from(normalizedCustomerMatchesMap.values());

        if (normalizedCustomerMatches.length > 1) {
          console.warn('⚠️ [Lookup] Ambiguous CustomerData matches for normalized order number:', {
            businessId: business.id,
            order_number: normalizedLookup,
            normalized: compactNormalized,
            matchCount: normalizedCustomerMatches.length
          });
          return buildOrderAmbiguityResponse(language);
        }

        if (normalizedCustomerMatches.length === 1) {
          const matchedCustomer = normalizedCustomerMatches[0];
          console.log('✅ [Lookup] Found in CustomerData by exact DB-level match');
          record = matchedCustomer;
          anchorType = 'order';
          anchorValue = matchedCustomer.orderNo || normalizedLookup;
        }

        if (!record) {
          if (looksLikePhoneIdentifier(order_number)) {
            // Deterministic recovery: if order-like lookup fails but identifier is numeric 10-11,
            // retry as phone to avoid false NOT_FOUND due LLM arg mismatch.
            console.log('🔁 [Lookup] Order not found, retrying same identifier as phone');
            const phoneLookup = await findRecordByPhone({
              businessId: business.id,
              phone: order_number,
              queryType: normalizedQueryType
            });

            if (phoneLookup.record) {
              console.log('✅ [Lookup] Recovered via phone fallback');
              record = phoneLookup.record;
              sourceTable = phoneLookup.sourceTable;
              if (phoneLookup.sourceTable === 'CrmTicket') {
                anchorType = 'ticket';
                anchorValue = phoneLookup.record.ticketNumber || phoneLookup.normalizedPhone.replace(/^\+/, '');
              } else {
                anchorType = 'phone';
                anchorValue = phoneLookup.normalizedPhone.replace(/^\+/, '');
              }
            }
          }

          if (!record) {
            // P0-1 FIX: Use generic message to prevent enumeration attacks
            // SECURITY: Do NOT reveal that this specific order number doesn't exist
            console.log('📭 [Lookup] Order not found in both CrmOrder and CustomerData');
            return notFound(GENERIC_ERROR_MESSAGES[language] || GENERIC_ERROR_MESSAGES.TR);
          }
        }
      }
    }

    // Strategy 2: Ticket number (service/repair flows)
    else if (ticket_number || isTicketQuery) {
      if (ticket_number) {
        console.log('🔍 [Lookup] Searching by ticket_number');
        const crmTicket = await findRecordByTicketNumber({
          businessId: business.id,
          ticketNumber: ticket_number
        });

        if (crmTicket) {
          record = crmTicket;
          sourceTable = 'CrmTicket';
          anchorType = 'ticket';
          anchorValue = crmTicket.ticketNumber;
        }
      }

      // If ticket lookup failed but phone exists, try phone fallback.
      if (!record && phone) {
        const phoneLookup = await findRecordByPhone({
          businessId: business.id,
          phone,
          queryType: normalizedQueryType
        });

        if (phoneLookup.record) {
          record = phoneLookup.record;
          sourceTable = phoneLookup.sourceTable;
          if (phoneLookup.sourceTable === 'CrmTicket') {
            anchorType = 'ticket';
            anchorValue = phoneLookup.record.ticketNumber || phoneLookup.normalizedPhone.replace(/^\+/, '');
          } else {
            anchorType = 'phone';
            anchorValue = phoneLookup.normalizedPhone.replace(/^\+/, '');
          }
        }
      }

      if (!record && ticket_number) {
        return notFound(GENERIC_ERROR_MESSAGES[language] || GENERIC_ERROR_MESSAGES.TR);
      }
    }

    // Strategy 3: VKN/TC
    else if (vkn || tc) {
      // Validate TC/VKN checksum before DB query — reject invalid early
      if (tc && !isValidTckn(tc)) {
        console.log('❌ [Lookup] Invalid TCKN checksum:', { tc: '***' });
        return validationError(
          language === 'TR'
            ? 'Geçersiz TC Kimlik numarası. Lütfen 11 haneli TC Kimlik numaranızı kontrol edip tekrar paylaşır mısınız?'
            : 'Invalid Turkish ID number. Please check your 11-digit ID number and try again.',
          'tc'
        );
      }
      if (vkn && !isValidVkn(vkn)) {
        console.log('❌ [Lookup] Invalid VKN checksum:', { vkn: '***' });
        return validationError(
          language === 'TR'
            ? 'Geçersiz VKN (Vergi Kimlik Numarası). Lütfen 10 haneli VKN\'nizi kontrol edip tekrar paylaşır mısınız?'
            : 'Invalid tax ID number. Please check your 10-digit tax ID and try again.',
          'vkn'
        );
      }

      console.log('🔍 [Lookup] Searching by VKN/TC');

      const whereClause = { businessId: business.id };
      if (vkn) whereClause.vkn = vkn;
      else if (tc) whereClause.tcNo = tc;

      record = await prisma.customerData.findFirst({ where: whereClause });

      if (record) {
        anchorType = vkn ? 'vkn' : 'tc';
        anchorValue = vkn || tc;
      } else {
        // P0-1 FIX: Use generic message to prevent enumeration attacks
        return notFound(GENERIC_ERROR_MESSAGES[language] || GENERIC_ERROR_MESSAGES.TR);
      }
    }

    // Strategy 4: Phone
    // SECURITY NOTE: Phone lookup may still require verification (usually phone_last4),
    // enforced by checkVerification below.
    else if (phone) {
      const phoneLookup = await findRecordByPhone({
        businessId: business.id,
        phone,
        queryType: normalizedQueryType
      });

      console.log('🔍 [Lookup] Searching by phone:', {
        original: phone,
        normalized: phoneLookup.normalizedPhone,
        variants: phoneLookup.variantsCount
      });

      if (phoneLookup.record) {
        record = phoneLookup.record;
        sourceTable = phoneLookup.sourceTable;
        if (phoneLookup.sourceTable === 'CrmTicket') {
          anchorType = 'ticket';
          anchorValue = phoneLookup.record.ticketNumber || phoneLookup.normalizedPhone.replace(/^\+/, '');
        } else {
          anchorType = 'phone';
          anchorValue = phoneLookup.normalizedPhone.replace(/^\+/, '');
        }
      }
    }

    // No record found
    if (!record) {
      // P0-1 FIX: Use generic message to prevent enumeration attacks
      console.log('📭 [Lookup] No record found');
      return notFound(GENERIC_ERROR_MESSAGES[language] || GENERIC_ERROR_MESSAGES.TR);
    }

    // ============================================================================
    // STEP 2: CHECK VERIFICATION
    // ============================================================================

    const anchor = createAnchor(record, anchorType, anchorValue, sourceTable);
    const effectiveVerificationQueryType = resolveVerificationQueryType({
      queryType: normalizedQueryType,
      anchor,
      record,
      sourceTable,
      isAccountingQuery
    });

    // Resolve customerId for CRM records without FK (CrmOrder/CrmTicket).
    // Look up CustomerData by phone to establish the customer identity chain.
    // If no match or multiple matches → customerId stays null → autoverify blocked (fail-closed).
    if ((sourceTable === 'CrmOrder' || sourceTable === 'CrmTicket') && !anchor.customerId && anchor.phone) {
      try {
        // Use phoneSearchVariants for international-aware matching
        const resolveVariants = phoneSearchVariants(anchor.phone);

        const customerMatches = await prisma.customerData.findMany({
          where: {
            businessId: business.id,
            OR: resolveVariants.map(p => ({ phone: p }))
          },
          select: { id: true },
          take: 2 // We only need to know if it's exactly 1
        });

        if (customerMatches.length === 1) {
          anchor.customerId = customerMatches[0].id;
          console.log(`🔗 [Anchor] Resolved ${sourceTable} → CustomerData customerId:`, anchor.customerId);
        } else {
          console.log(`🔗 [Anchor] ${sourceTable} customerId unresolvable (matches:`, customerMatches.length, ')');
        }
      } catch (resolveErr) {
        console.error('⚠️ [Anchor] customerId resolution error (fail-closed):', resolveErr.message);
        // anchor.customerId stays null → autoverify will not apply
      }
    }

    console.log('🔐 [Anchor] Created:', { type: anchor.anchorType, value: anchor.anchorValue, name: anchor.name, customerId: anchor.customerId, sourceTable: anchor.sourceTable });

    // Attach identity context for central autoverify decision in 06_toolLoop.
    // Tool handler does NOT make the autoverify decision — it only provides context.
    const _identityContext = {
      channel: context.channel || null,
      channelUserId: context.channelUserId || null,
      fromEmail: context.fromEmail || null,
      businessId: business.id,
      anchorId: anchor.id,
      anchorCustomerId: anchor.customerId,  // P0: customerId chain for autoverify
      anchorSourceTable: anchor.sourceTable,
      queryType: normalizedQueryType
    };

    const previousVerificationAnchor = state.verification?.anchor || state.verificationAnchor || null;
    const sameVerificationScope = isSameVerificationScope(previousVerificationAnchor, anchor);
    const hasPreviousVerificationAnchor = Boolean(previousVerificationAnchor?.id);
    console.log('🔐 [Debug] Identity switch check:', {
      hasStateAnchor: hasPreviousVerificationAnchor,
      stateAnchorId: previousVerificationAnchor?.id,
      stateAnchorCustomerId: previousVerificationAnchor?.customerId || null,
      newAnchorId: anchor.id,
      newAnchorCustomerId: anchor.customerId || null,
      sameVerificationScope
    });
    // SESSION-LEVEL VERIFIED BYPASS (with TTL):
    // Path A: Same scope — anchor matches previously verified anchor
    // Path B: Cross-anchor — different anchor but same customer (phone + name)
    const ttlValid = isVerificationTTLValid(state.verification?.verifiedAt);

    // Identity switch detection: only for truly DIFFERENT customers.
    // Cross-anchor match (same customer, different record) is NOT an identity switch.
    const crossAnchorMatch = hasPreviousVerificationAnchor && !sameVerificationScope
      ? isCrossAnchorCustomerMatch(anchor, state.verification)
      : false;
    const identitySwitch = hasPreviousVerificationAnchor && !sameVerificationScope && !crossAnchorMatch;

    if (identitySwitch) {
      console.log('🚨 [SECURITY] Identity switch detected — different customer!', {
        previousAnchor: previousVerificationAnchor?.id,
        previousCustomerId: previousVerificationAnchor?.customerId || null,
        newAnchor: anchor.id,
        newCustomerId: anchor.customerId || null
      });

      console.log('🔐 [SECURITY] Forcing new verification for identity switch');
      const askFor = anchor.phone ? 'phone_last4' : 'name';
      return requestExpectedVerificationInput({
        language,
        anchor,
        askFor
      });
    }

    if (isSessionVerified && sameVerificationScope && ttlValid) {
      console.log('✅ [Verification] Same scope + TTL valid — bypassing checkVerification');
      const fullResult = getFullResult(record, normalizedQueryType, language);
      return {
        ...ok(fullResult.data, fullResult.message),
        _identityContext,
        stateEvents: [
          {
            type: OutcomeEventType.VERIFICATION_PASSED,
            anchor: toStateAnchor(anchor),
            attempts: 0
          }
        ]
      };
    }

    if (isSessionVerified && sameVerificationScope && !ttlValid) {
      console.log('⏰ [Verification] Same scope but TTL expired — re-verification required');
    }

    // Cross-anchor reuse: verified for different record but SAME customer
    // Requires: phone match + name match (dual signal) + TTL valid + not high-risk
    if (isSessionVerified && !sameVerificationScope && ttlValid && crossAnchorMatch) {
      const highRisk = isHighRiskAction(normalizedQueryType);

      if (!highRisk) {
        console.log('✅ [Verification] Cross-anchor reuse — same customer, different record', {
          verifiedAnchorId: state.verification?.anchor?.id,
          newAnchorId: anchor.id,
          queryType: normalizedQueryType
        });
        const fullResult = getFullResult(record, normalizedQueryType, language);
        return {
          ...ok(fullResult.data, fullResult.message),
          _identityContext,
          stateEvents: [
            {
              type: OutcomeEventType.VERIFICATION_PASSED,
              anchor: toStateAnchor(anchor),
              reason: 'cross_anchor_reuse',
              attempts: 0
            }
          ]
        };
      }

      if (highRisk) {
        console.log('🔐 [Verification] Cross-anchor match BUT high-risk action — fresh verification required', {
          queryType: normalizedQueryType
        });
      }
    }

    if (isSessionVerified && !sameVerificationScope && !ttlValid) {
      console.log('⏰ [Verification] Different scope + TTL expired — fresh verification required');
    }

    // P0 SECURITY: Enforce two-step verification AND detect mismatches
    // Strategy:
    // 1. If customer_name provided AND not in pending state → check for mismatch
    // 2. If mismatch detected → return explicit error
    // 3. If match detected → still require verification (prevent single-shot bypass)
    //
    // PENDING STATE EXCEPTION:
    // When state.verification.status === 'pending', allow verification_input
    // (which can be name OR full phone number) to pass through for verification.
    // This enables email pipeline (stateless, synthesizes pending) to complete
    // verification in a single pass without multi-turn back-and-forth.
    // verifyAgainstAnchor() accepts: name, phone_last4, or full phone (10+ digits).
    let verificationInput = customer_name;
    // Reuse isVerificationPending from P0-C fix above
    if (isVerificationPending) {
      verificationInput = effectiveVerificationInput;
    }
    if (customer_name && !isVerificationPending) {
      console.log('🔐 [SECURITY] customer_name provided but not in pending verification flow');
      console.log('🔐 [SECURITY] Checking for mismatch...');

      // Check if provided name matches anchor
      const matchResult = verifyAgainstAnchor(anchor, customer_name);

      if (!matchResult.matches) {
        // P0-1 FIX: Use SAME generic message as NOT_FOUND to prevent enumeration
        // SECURITY: "İsim eşleşmiyor" reveals that record EXISTS - information leak!
        console.log('🔐 [SECURITY] Mismatch detected - returning generic error (same as NOT_FOUND)');
        return {
          ...notFound(GENERIC_ERROR_MESSAGES[language] || GENERIC_ERROR_MESSAGES.TR),
          stateEvents: [
            {
              type: OutcomeEventType.VERIFICATION_FAILED,
              attempts: (state.verification?.attempts || 0) + 1
            }
          ]
        };
      }

      // Name matches BUT still require two-step verification (prevent single-shot bypass)
      console.log('🔐 [SECURITY] Name matches but enforcing two-step verification');
      verificationInput = null; // Force verification request
    }

    const verificationCheck = checkVerification(anchor, verificationInput, effectiveVerificationQueryType, language);
    console.log('🔐 [Verification] Check result:', verificationCheck.action);

    // Handle verification result
    if (verificationCheck.action === 'REQUEST_VERIFICATION') {
      return {
        ...verificationRequired(verificationCheck.message, {
          askFor: verificationCheck.askFor,
          anchor: verificationCheck.anchor
        }),
        _identityContext,  // For central autoverify decision in 06_toolLoop
        stateEvents: [
          {
            type: OutcomeEventType.VERIFICATION_REQUIRED,
            askFor: verificationCheck.askFor,
            anchor: verificationCheck.anchor
          }
        ]
      };
    }

    if (verificationCheck.action === 'VERIFICATION_FAILED') {
      // P0-1 FIX: Use SAME generic message as NOT_FOUND to prevent enumeration
      // SECURITY: Specific verification failure messages reveal record existence
      console.log('🔐 [Verification] Check failed - returning generic error');
      return {
        ...notFound(GENERIC_ERROR_MESSAGES[language] || GENERIC_ERROR_MESSAGES.TR),
        stateEvents: [
          {
            type: OutcomeEventType.VERIFICATION_FAILED,
            attempts: (state.verification?.attempts || 0) + 1
          }
        ]
      };
    }

    // ============================================================================
    // STEP 3: RETURN DATA (minimal or full)
    // ============================================================================

    if (verificationCheck.verified) {
      console.log('✅ [Result] Returning full data');
      const result = getFullResult(record, normalizedQueryType, language);
      return {
        ...ok(result.data, result.message),
        _identityContext,
        stateEvents: [
          {
            type: OutcomeEventType.VERIFICATION_PASSED,
            anchor: toStateAnchor(anchor),
            attempts: 0
          }
        ]
      };
    } else {
      console.log('⚠️ [Result] Returning minimal data (unverified)');
      const result = getMinimalResult(record, normalizedQueryType, language);
      return ok(result.data, result.message);
    }

  } catch (error) {
    console.error('❌ [CustomerDataLookup-V2] Error:', error);
    return systemError(
      business.language === 'TR'
        ? 'Sistem hatası oluştu. Lütfen daha sonra tekrar deneyin.'
        : 'A system error occurred. Please try again later.',
      error
    );
  }
}

export default { execute };
