/**
 * Identity Proof Module (SSOT)
 *
 * Derives channel-based identity proof strength and determines
 * whether additional verification (second factor) is required.
 *
 * TERMINOLOGY:
 *   "Channel possession signal" — NOT "verified identity".
 *   WhatsApp `from` means the sender possesses that phone number right now.
 *   It does NOT prove they are the account holder (SIM swap, family phone, etc.).
 *
 * Proof Strength Levels:
 *   STRONG  - Channel signal matches exactly ONE customer record in DB
 *   WEAK    - Channel signal exists but match is ambiguous (0 or 2+ records)
 *   NONE    - Channel provides no usable identity signal (e.g., anonymous chat)
 *
 * Decision Matrix (FINANCIAL distinction REMOVED):
 *   STRONG  -> skip second factor (autoverify)
 *   WEAK    -> require second factor
 *   NONE    -> require second factor
 *
 * SECURITY INVARIANTS:
 *   1. This module NEVER mutates state. Returns a decision only.
 *   2. FAIL-CLOSED: Any error -> strength=NONE, required=true.
 *   3. Autoverify is gated by anchor.customerId === proof.matchedCustomerId (in autoverify.js).
 *   4. Email order-level: CrmOrder has no customerEmail, but customerId chain
 *      (phone-based CrmOrder→CustomerData resolution) provides the security gate.
 *      deriveEmailProof returns STRONG if email matches exactly 1 CustomerData.
 *      autoverify.js then checks anchor.customerId === proof.matchedCustomerId.
 */

import prisma from '../config/database.js';
import { normalizePhone, phoneSearchVariants } from '../utils/text.js';

// ─── Constants ───────────────────────────────────────────────────────

export const ProofStrength = Object.freeze({
  STRONG: 'STRONG',
  WEAK: 'WEAK',
  NONE: 'NONE'
});

// NOTE: ORDER_LEVEL_QUERY_TYPES MVP restriction REMOVED.
// CrmOrder has no customerEmail, but the customerId chain (phone-based
// CrmOrder→CustomerData resolution in customer-data-lookup handler) now
// provides the security gate. autoverify.js checks:
//   anchor.customerId != null && proof.matchedCustomerId != null
//   && proof.matchedCustomerId === anchor.customerId
// If CrmOrder can't resolve to a CustomerData (0 or 2+ phone matches),
// anchor.customerId stays null → autoverify is blocked (fail-closed).

// ─── Core Functions ──────────────────────────────────────────────────

/**
 * Derive identity proof from channel context
 *
 * @param {Object} channelContext
 * @param {string} channelContext.channel - 'WHATSAPP' | 'EMAIL' | 'CHAT' | 'PHONE'
 * @param {string} channelContext.channelUserId - Phone number (WhatsApp)
 * @param {string} channelContext.fromEmail - Email address (Email channel)
 * @param {number} channelContext.businessId - Business ID
 * @param {Object} toolRequest - { queryType, intent } (optional)
 * @param {Object} state - Current orchestrator state (optional)
 * @returns {Promise<Object>} IdentityProof
 */
export async function deriveIdentityProof(channelContext, toolRequest = {}, state = {}) {
  const startTime = Date.now();
  const { channel, channelUserId, fromEmail, businessId } = channelContext;

  const noProof = {
    strength: ProofStrength.NONE,
    matchedCustomerId: null,
    matchedOrderId: null,
    reasons: ['no_channel_identity'],
    evidence: {},
    durationMs: 0
  };

  try {
    // Chat/Phone: no usable identity signal
    if (channel === 'CHAT' || channel === 'PHONE' || (!channelUserId && !fromEmail)) {
      return { ...noProof, durationMs: Date.now() - startTime };
    }

    if (channel === 'WHATSAPP' && channelUserId) {
      return await deriveWhatsAppProof(channelUserId, businessId, startTime);
    }

    if (channel === 'EMAIL' && fromEmail) {
      return await deriveEmailProof(fromEmail, businessId, toolRequest, startTime);
    }

    return { ...noProof, reasons: ['unknown_channel'], durationMs: Date.now() - startTime };

  } catch (error) {
    // FAIL-CLOSED: error -> no proof
    console.error('❌ [IdentityProof] Error deriving proof:', error.message);
    return {
      strength: ProofStrength.NONE,
      matchedCustomerId: null,
      matchedOrderId: null,
      reasons: ['derivation_error', error.message],
      evidence: {},
      durationMs: Date.now() - startTime
    };
  }
}

/**
 * Derive proof for WhatsApp channel.
 * WhatsApp `from` is a channel possession signal — the sender controls this number now.
 *
 * @param {string} waPhone - Raw phone number from WhatsApp webhook
 * @param {number} businessId
 * @param {number} startTime - For duration tracking
 * @returns {Promise<Object>} IdentityProof
 */
async function deriveWhatsAppProof(waPhone, businessId, startTime) {
  // Generate all plausible phone format variants for flexible DB matching
  // Supports Turkish (+90), US (+1), and other international formats
  const variants = phoneSearchVariants(waPhone);
  const phoneOrConditions = variants.map(v => ({ phone: v }));
  const customerPhoneOrConditions = variants.map(v => ({ customerPhone: v }));

  // Search CustomerData by phone (uses [businessId, phone] index)
  const customerMatches = await prisma.customerData.findMany({
    where: {
      businessId,
      OR: phoneOrConditions
    },
    select: { id: true, phone: true, companyName: true },
    take: 3 // We only need to know if it's 0, 1, or 2+
  });

  // Also check CrmOrder by customerPhone
  const orderMatches = await prisma.crmOrder.findMany({
    where: {
      businessId,
      OR: customerPhoneOrConditions
    },
    select: { id: true, customerPhone: true, orderNumber: true },
    take: 3
  });

  // Also check CrmTicket by customerPhone
  const ticketMatches = await prisma.crmTicket.findMany({
    where: {
      businessId,
      OR: customerPhoneOrConditions
    },
    select: { id: true, customerPhone: true, ticketNumber: true },
    take: 3
  });

  // Deduplicate customer IDs (same customer can have multiple records)
  const uniqueCustomerIds = [...new Set(customerMatches.map(c => c.id))];

  // STRONG: exactly one unique customer
  if (uniqueCustomerIds.length === 1) {
    return {
      strength: ProofStrength.STRONG,
      matchedCustomerId: uniqueCustomerIds[0],
      matchedOrderId: orderMatches.length === 1 ? orderMatches[0].id : null,
      matchedTicketId: ticketMatches.length === 1 ? ticketMatches[0].id : null,
      reasons: ['whatsapp_phone_single_customer_match'],
      evidence: {
        channel: 'WHATSAPP',
        matchType: 'phone',
        customerMatchCount: uniqueCustomerIds.length,
        orderMatchCount: orderMatches.length,
        ticketMatchCount: ticketMatches.length
      },
      durationMs: Date.now() - startTime
    };
  }

  // No CustomerData match — check CrmOrder or CrmTicket
  if (uniqueCustomerIds.length === 0) {
    // Check CrmOrder first
    if (orderMatches.length > 0) {
      const uniqueOrderCustomers = [...new Set(orderMatches.map(o => o.customerPhone))];
      if (uniqueOrderCustomers.length === 1) {
        return {
          strength: ProofStrength.STRONG,
          matchedCustomerId: null,
          matchedOrderId: orderMatches[0].id,
          matchedTicketId: ticketMatches.length === 1 ? ticketMatches[0].id : null,
          reasons: ['whatsapp_phone_single_order_match'],
          evidence: {
            channel: 'WHATSAPP',
            matchType: 'phone_order',
            customerMatchCount: 0,
            orderMatchCount: orderMatches.length,
            ticketMatchCount: ticketMatches.length
          },
          durationMs: Date.now() - startTime
        };
      }
    }

    // No CrmOrder match — check CrmTicket
    if (orderMatches.length === 0 && ticketMatches.length > 0) {
      const uniqueTicketCustomers = [...new Set(ticketMatches.map(t => t.customerPhone))];
      if (uniqueTicketCustomers.length === 1) {
        return {
          strength: ProofStrength.STRONG,
          matchedCustomerId: null,
          matchedOrderId: null,
          matchedTicketId: ticketMatches[0].id,
          reasons: ['whatsapp_phone_single_ticket_match'],
          evidence: {
            channel: 'WHATSAPP',
            matchType: 'phone_ticket',
            customerMatchCount: 0,
            orderMatchCount: 0,
            ticketMatchCount: ticketMatches.length
          },
          durationMs: Date.now() - startTime
        };
      }
    }
  }

  // WEAK: 0 or 2+ matches
  const totalMatches = uniqueCustomerIds.length + (uniqueCustomerIds.length === 0 ? orderMatches.length : 0) + (uniqueCustomerIds.length === 0 && orderMatches.length === 0 ? ticketMatches.length : 0);
  return {
    strength: ProofStrength.WEAK,
    matchedCustomerId: null,
    matchedOrderId: null,
    matchedTicketId: null,
    reasons: [totalMatches === 0 ? 'whatsapp_phone_no_match' : 'whatsapp_phone_multiple_matches'],
    evidence: {
      channel: 'WHATSAPP',
      matchType: 'phone',
      customerMatchCount: uniqueCustomerIds.length,
      orderMatchCount: orderMatches.length,
      ticketMatchCount: ticketMatches.length
    },
    durationMs: Date.now() - startTime
  };
}

/**
 * Derive proof for Email channel.
 * Email `from` is DKIM/SPF verified by the email provider, but
 * forwards, aliases, and shared mailboxes are risks.
 *
 * CrmOrder has no customerEmail field, but the customerId chain
 * (phone-based CrmOrder→CustomerData resolution) provides security:
 *   - deriveEmailProof returns STRONG if email matches exactly 1 CustomerData
 *   - autoverify.js checks anchor.customerId === proof.matchedCustomerId
 *   - If CrmOrder can't resolve → anchor.customerId is null → autoverify blocked
 *
 * @param {string} emailAddress - From email
 * @param {number} businessId
 * @param {Object} toolRequest - { queryType } (kept for API compat, no longer gates proof)
 * @param {number} startTime
 * @returns {Promise<Object>} IdentityProof
 */
async function deriveEmailProof(emailAddress, businessId, toolRequest, startTime) {
  const normalizedEmail = emailAddress.toLowerCase().trim();

  // Search CustomerData by email
  const customerMatches = await prisma.customerData.findMany({
    where: {
      businessId,
      email: { equals: normalizedEmail, mode: 'insensitive' }
    },
    select: { id: true, email: true, companyName: true },
    take: 3
  });

  const uniqueCustomerIds = [...new Set(customerMatches.map(c => c.id))];

  if (uniqueCustomerIds.length === 1) {
    return {
      strength: ProofStrength.STRONG,
      matchedCustomerId: uniqueCustomerIds[0],
      matchedOrderId: null,
      reasons: ['email_single_customer_match'],
      evidence: {
        channel: 'EMAIL',
        matchType: 'email',
        customerMatchCount: 1
      },
      durationMs: Date.now() - startTime
    };
  }

  return {
    strength: ProofStrength.WEAK,
    matchedCustomerId: null,
    matchedOrderId: null,
    reasons: [uniqueCustomerIds.length === 0 ? 'email_no_match' : 'email_multiple_matches'],
    evidence: {
      channel: 'EMAIL',
      matchType: 'email',
      customerMatchCount: uniqueCustomerIds.length
    },
    durationMs: Date.now() - startTime
  };
}

// ─── Verification Decision ──────────────────────────────────────────

/**
 * Determine if additional verification (second factor) is required.
 *
 * FINANCIAL distinction REMOVED: STRONG proof is sufficient for ALL query types.
 * Security is maintained by the anchor.customerId === proof.matchedCustomerId check
 * in security/autoverify.js — this ensures the channel truly owns the record.
 *
 * @param {Object} proof - Result of deriveIdentityProof()
 * @param {string} intent - Router intent (unused, kept for API compat)
 * @returns {Object} { required: boolean, reason: string, requiredSlots: string[] }
 */
export function shouldRequireAdditionalVerification(proof, intent) {
  // FAIL-CLOSED: no proof -> always require
  if (!proof || !proof.strength) {
    return {
      required: true,
      reason: 'no_proof_available',
      requiredSlots: ['phone_last4']
    };
  }

  // STRONG proof: skip second factor (autoverify)
  if (proof.strength === ProofStrength.STRONG) {
    return {
      required: false,
      reason: 'channel_proof_sufficient',
      requiredSlots: []
    };
  }

  // WEAK: require second factor
  if (proof.strength === ProofStrength.WEAK) {
    return {
      required: true,
      reason: 'weak_proof_' + (proof.reasons?.[0] || 'unknown'),
      requiredSlots: ['phone_last4']
    };
  }

  // NONE or unknown: require second factor
  return {
    required: true,
    reason: 'no_channel_identity',
    requiredSlots: ['phone_last4']
  };
}

export default {
  ProofStrength,
  deriveIdentityProof,
  shouldRequireAdditionalVerification
};
