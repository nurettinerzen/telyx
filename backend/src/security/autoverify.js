/**
 * Channel Identity Proof Autoverify (Shared Helper)
 *
 * Extracted from core/orchestrator/steps/06_toolLoop.js so both
 * chat/WA and email pipelines can use the same logic.
 *
 * SECURITY INVARIANTS:
 *   1. Autoverify when proof.matchedCustomerId === anchor.customerId (CustomerData path).
 *   2. CrmOrder fallback: if BOTH customerIds are null, allow autoverify when
 *      proof.matchedOrderId === anchorId AND proof.strength === STRONG.
 *   3. FINANCIAL distinction removed — STRONG proof is sufficient for all query types.
 *   4. Any error → autoverify denied (fail-closed).
 *
 * @module security/autoverify
 */

import { isChannelProofEnabled } from '../config/feature-flags.js';
import {
  deriveIdentityProof,
  shouldRequireAdditionalVerification
} from './identityProof.js';
import { getFullResult } from '../services/verification-service.js';
import { ToolOutcome, normalizeOutcome } from '../tools/toolResult.js';
import { OutcomeEventType } from './outcomePolicy.js';
import prisma from '../config/database.js';

/**
 * Attempt channel-proof autoverify on a VERIFICATION_REQUIRED tool result.
 *
 * @param {Object} params
 * @param {Object} params.toolResult          - The tool result (must have outcome VERIFICATION_REQUIRED)
 * @param {string} params.toolName            - Tool name (e.g. 'customer_data_lookup')
 * @param {Object} params.business            - Business object (needs .id)
 * @param {Object} params.state               - Orchestrator state
 * @param {string} params.language            - 'TR' | 'EN'
 * @param {Object} [params.metrics]           - Optional metrics object to write telemetry into
 * @returns {Promise<Object>} { applied, toolResult, telemetry }
 *   - applied: boolean — true if autoverify succeeded and toolResult was overridden
 *   - toolResult: the (possibly overridden) tool result
 *   - telemetry: proof/decision info for logging
 */
export async function tryAutoverify({ toolResult, toolName, business, state, language, metrics }) {
  const normalizedOutcome = normalizeOutcome(toolResult.outcome);

  // Pre-conditions: only act on VERIFICATION_REQUIRED with identity context
  if (normalizedOutcome !== ToolOutcome.VERIFICATION_REQUIRED) {
    return { applied: false, toolResult, telemetry: null };
  }

  const idCtx = toolResult._identityContext;
  if (!idCtx) {
    return { applied: false, toolResult, telemetry: null };
  }

  if (!isChannelProofEnabled({ businessId: business.id })) {
    const skippedTelemetry = {
      autoverifyAttempted: false,
      autoverifyApplied: false,
      autoverifySkipReason: 'FEATURE_DISABLED',
      channel: idCtx.channel,
      durationMs: 0
    };
    if (metrics) metrics.identityProof = skippedTelemetry;
    return { applied: false, toolResult, telemetry: skippedTelemetry };
  }

  const proofStartTime = Date.now();

  try {
    // 1. Derive channel identity proof (DB lookup: phone/email → customer match)
    const proof = await deriveIdentityProof(
      {
        channel: idCtx.channel,
        channelUserId: idCtx.channelUserId,
        fromEmail: idCtx.fromEmail,
        businessId: idCtx.businessId
      },
      { queryType: idCtx.queryType },
      state
    );

    // 2. Central verification decision (FINANCIAL branch removed — see identityProof.js)
    const verificationDecision = shouldRequireAdditionalVerification(proof, state.intent);

    const proofDurationMs = Date.now() - proofStartTime;

    // Base telemetry — always populated
    const telemetry = {
      autoverifyAttempted: true,
      autoverifyApplied: false,
      autoverifySkipReason: null,
      strength: proof.strength,
      channel: idCtx.channel,
      matchedCustomerId: proof.matchedCustomerId || null,
      anchorCustomerId: idCtx.anchorCustomerId || null,
      anchorId: idCtx.anchorId || null,
      anchorSourceTable: idCtx.anchorSourceTable || null,
      queryType: idCtx.queryType || null,
      secondFactorRequired: verificationDecision.required,
      reason: verificationDecision.reason,
      proofReasons: proof.reasons || [],
      durationMs: proofDurationMs
    };

    console.log('🔑 [Autoverify] Channel proof result:', telemetry);

    // 3. If proof NOT sufficient → bail out with specific skip reason
    if (verificationDecision.required) {
      telemetry.autoverifySkipReason = 'PROOF_WEAK';
      if (metrics) metrics.identityProof = { ...telemetry };
      return { applied: false, toolResult, telemetry };
    }

    // 4. Anchor-proof match: three paths
    //    A) CustomerData path: proof.matchedCustomerId === anchor.customerId
    //    B) CrmOrder direct path: both customerIds null, match by orderId
    //    C) CrmTicket direct path: both customerIds null, match by ticketId
    const anchorId = idCtx.anchorId;
    const anchorCustomerId = idCtx.anchorCustomerId;
    const anchorSourceTable = idCtx.anchorSourceTable || 'CustomerData';
    let matchMethod = 'customer_id'; // 'customer_id' | 'order_direct' | 'ticket_direct'

    if (anchorCustomerId != null && proof.matchedCustomerId != null) {
      // Path A: Both have customerIds — must match
      if (proof.matchedCustomerId !== anchorCustomerId) {
        telemetry.autoverifySkipReason = 'CUSTOMERID_MISMATCH';
        console.warn('⚠️ [Autoverify] Proof mismatch: proof.matchedCustomerId ≠ anchor.customerId', {
          proofCustomerId: proof.matchedCustomerId,
          anchorCustomerId,
          anchorId
        });
        if (metrics) metrics.identityProof = { ...telemetry };
        return { applied: false, toolResult, telemetry };
      }
      // customerIds match → proceed
    } else if (
      anchorCustomerId == null &&
      anchorSourceTable === 'CrmOrder' &&
      proof.matchedOrderId != null &&
      proof.matchedOrderId === anchorId &&
      proof.strength === 'STRONG'
    ) {
      // Path B: CrmOrder direct match — no CustomerData exists for this customer.
      // proof.matchedOrderId confirms WP phone matched exactly 1 CrmOrder,
      // and that CrmOrder IS the anchor we're looking up.
      matchMethod = 'order_direct';
      console.log('✅ [Autoverify] CrmOrder direct match — orderId confirmed via channel proof', {
        matchedOrderId: proof.matchedOrderId,
        anchorId,
        proofStrength: proof.strength
      });
    } else if (
      anchorCustomerId == null &&
      anchorSourceTable === 'CrmTicket' &&
      proof.matchedTicketId != null &&
      proof.matchedTicketId === anchorId &&
      proof.strength === 'STRONG'
    ) {
      // Path C: CrmTicket direct match — no CustomerData exists for this customer.
      // proof.matchedTicketId confirms WP phone matched exactly 1 CrmTicket,
      // and that CrmTicket IS the anchor we're looking up.
      matchMethod = 'ticket_direct';
      console.log('✅ [Autoverify] CrmTicket direct match — ticketId confirmed via channel proof', {
        matchedTicketId: proof.matchedTicketId,
        anchorId,
        proofStrength: proof.strength
      });
    } else {
      // No path matched — fail-closed
      const skipReason = anchorCustomerId == null
        ? 'NO_ANCHOR_CUSTOMERID'
        : 'NO_MATCHED_CUSTOMERID';
      telemetry.autoverifySkipReason = skipReason;
      console.warn(`⚠️ [Autoverify] ${skipReason} — autoverify blocked (fail-closed)`, {
        anchorId,
        anchorCustomerId,
        anchorSourceTable,
        proofMatchedCustomerId: proof.matchedCustomerId,
        proofMatchedOrderId: proof.matchedOrderId,
        proofMatchedTicketId: proof.matchedTicketId
      });
      if (metrics) metrics.identityProof = { ...telemetry };
      return { applied: false, toolResult, telemetry };
    }

    // 5. Re-fetch full record from DB
    console.log(`✅ [Autoverify] Channel proof AUTOVERIFY (${matchMethod}) — skipping second factor`);

    let fullRecord;
    if (anchorSourceTable === 'CrmOrder') {
      fullRecord = await prisma.crmOrder.findUnique({ where: { id: anchorId } });
    } else if (anchorSourceTable === 'CrmTicket') {
      fullRecord = await prisma.crmTicket.findUnique({ where: { id: anchorId } });
    } else {
      fullRecord = await prisma.customerData.findUnique({ where: { id: anchorId } });
    }

    if (!fullRecord) {
      telemetry.autoverifySkipReason = 'RECORD_NOT_FOUND';
      console.error('❌ [Autoverify] Record not found for anchor', anchorId);
      if (metrics) metrics.identityProof = { ...telemetry };
      return { applied: false, toolResult, telemetry };
    }

    // 6. Build full result and override toolResult
    const fullResultData = getFullResult(fullRecord, idCtx.queryType, language);

    toolResult.outcome = ToolOutcome.OK;
    toolResult.success = true;
    toolResult.data = fullResultData.data;
    toolResult.message = fullResultData.message;
    toolResult.verificationRequired = false;

    // Replace stateEvents with VERIFICATION_PASSED (channel_proof method)
    // Include anchor phone for cross-anchor reuse (verifiedCustomerPhone)
    const anchorPhone = fullRecord?.customerPhone || fullRecord?.phone || null;
    const anchorName = fullRecord?.customerName || fullRecord?.contactName || null;
    toolResult.stateEvents = [
      {
        type: OutcomeEventType.VERIFICATION_PASSED,
        anchor: anchorId ? {
          id: anchorId,
          customerId: anchorCustomerId,
          sourceTable: anchorSourceTable,
          phone: anchorPhone,
          name: anchorName,
          type: 'channel_proof'
        } : null,
        reason: 'channel_proof',
        matchMethod,
        proofStrength: proof.strength,
        attempts: 0
      }
    ];

    telemetry.autoverifyApplied = true;
    telemetry.autoverifySkipReason = null;
    telemetry.matchMethod = matchMethod;
    if (metrics) metrics.identityProof = { ...telemetry };

    console.log('🔓 [Autoverify] Override complete — outcome now OK');

    return { applied: true, toolResult, telemetry };

  } catch (proofError) {
    // FAIL-CLOSED: error → normal verification flow continues
    console.error('❌ [Autoverify] Error (fail-closed):', proofError.message);

    const errorTelemetry = {
      autoverifyAttempted: true,
      autoverifyApplied: false,
      autoverifySkipReason: 'PROOF_DERIVATION_ERROR',
      strength: 'ERROR',
      channel: idCtx.channel,
      matchedCustomerId: null,
      anchorCustomerId: idCtx.anchorCustomerId || null,
      secondFactorRequired: true,
      reason: 'proof_derivation_error',
      error: proofError.message,
      durationMs: Date.now() - proofStartTime
    };

    if (metrics) metrics.identityProof = errorTelemetry;

    return { applied: false, toolResult, telemetry: errorTelemetry };
  }
}

export default { tryAutoverify };
