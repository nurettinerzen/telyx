// ============================================================================
// SAFE CALL INITIATOR SERVICE
// ============================================================================
// FILE: backend/src/services/safeCallInitiator.js
//
// P0.2: 11Labs 429 handler
// Wraps call initiation with:
// - Concurrent call slot acquisition
// - 11Labs 429 error handling
// - Automatic slot release on failure
// - Retry-After header calculation
// ============================================================================

import elevenLabsService from './elevenlabs.js';
import concurrentCallManager from './concurrentCallManager.js';
import metricsService from './metricsService.js';
import prisma from '../prismaClient.js';
import { isDoNotCall, normalizePhoneE164 } from '../phone-outbound-v1/outcomeWriter.js';

/**
 * Error class for capacity limits
 */
class CapacityError extends Error {
  constructor(message, code, retryAfter = null, details = {}) {
    super(message);
    this.name = 'CapacityError';
    this.code = code;
    this.retryAfter = retryAfter;
    this.details = details;
  }
}

/**
 * Safely initiate an outbound call with capacity management
 * @param {Object} config - Call configuration
 * @param {string} config.agentId - 11Labs Agent ID
 * @param {string} config.phoneNumberId - 11Labs Phone Number ID
 * @param {string} config.toNumber - Destination phone number
 * @param {number} config.businessId - Business ID
 * @param {Object} config.clientData - Optional client data
 * @returns {Promise<{success: boolean, call?: Object, error?: string}>}
 */
export async function initiateOutboundCallSafe(config) {
  const { businessId, agentId, phoneNumberId, toNumber, clientData } = config;

  let callId = null;
  let slotAcquired = false;

  try {
    const normalizedToNumber = normalizePhoneE164(toNumber);
    if (!normalizedToNumber) {
      throw new CapacityError(
        'Invalid destination phone number',
        'INVALID_DESTINATION_PHONE',
        null,
        { toNumber }
      );
    }

    // Fail-closed DNC precheck before any outbound trigger
    if (!prisma.doNotCall || typeof prisma.doNotCall.findUnique !== 'function') {
      throw new CapacityError(
        'Do-Not-Call precheck is unavailable',
        'DNC_PRECHECK_UNAVAILABLE',
        null,
        { businessId, toNumber: normalizedToNumber }
      );
    }

    const blockedByDnc = await isDoNotCall({
      businessId,
      phoneE164: normalizedToNumber
    });

    if (blockedByDnc) {
      throw new CapacityError(
        'Destination phone is in do-not-call list',
        'DO_NOT_CALL_BLOCKED',
        null,
        { businessId, toNumber: normalizedToNumber }
      );
    }

    // Step 1: Acquire concurrent call slot (business + global)
    console.log(`📞 Attempting to acquire call slot for business ${businessId}...`);

    const slotResult = await concurrentCallManager.acquireSlot(
      businessId,
      null, // callId will be set after 11Labs response
      'outbound',
      { agentId, toNumber: normalizedToNumber }
    );

    if (!slotResult.success) {
      const retryAfter = calculateRetryAfter(slotResult);

      // P0.5: Increment rejection metric
      metricsService.incrementCounter('concurrent_rejected_total', {
        reason: slotResult.error,
        plan: 'unknown' // Will be enriched if we have subscription data
      });

      throw new CapacityError(
        slotResult.message || 'Capacity limit reached',
        slotResult.error,
        retryAfter,
        {
          currentActive: slotResult.currentActive,
          limit: slotResult.limit,
          globalCurrent: slotResult.globalCurrent,
          globalLimit: slotResult.globalLimit
        }
      );
    }

    slotAcquired = true;
    callId = slotResult.callId; // Temporary callId from concurrentCallManager

    console.log(`✅ Slot acquired: ${callId} (${slotResult.currentActive}/${slotResult.limit})`);

    // Step 2: Initiate call with 11Labs
    console.log(`📞 Initiating 11Labs call: ${toNumber}`);

    const call = await elevenLabsService.initiateOutboundCall({
      agentId,
      phoneNumberId,
      toNumber: normalizedToNumber,
      clientData: {
        ...clientData,
        businessId,
        toNumber: normalizedToNumber,
        internalCallId: callId
      }
    });

    // Update callId with 11Labs conversation_id
    const elevenLabsCallId = call.conversation_id || call.call_sid;

    if (elevenLabsCallId && elevenLabsCallId !== callId) {
      // Update ActiveCallSession with real 11Labs ID
      try {
        await prisma.activeCallSession.updateMany({
          where: { callId: callId },
          data: { callId: elevenLabsCallId }
        });

        // Update Redis with real ID
        const globalCapacityManager = (await import('./globalCapacityManager.js')).default;
        await globalCapacityManager.releaseGlobalSlot(callId); // Release temp ID
        await globalCapacityManager.acquireGlobalSlot(elevenLabsCallId, slotResult.metadata?.plan || 'PRO', businessId); // Acquire with real ID

        callId = elevenLabsCallId;
      } catch (updateError) {
        console.error('⚠️ Failed to update callId:', updateError);
      }
    }

    console.log(`✅ Call initiated successfully: ${callId}`);

    return {
      success: true,
      call: {
        ...call,
        internalCallId: callId
      },
      slotInfo: {
        currentActive: slotResult.currentActive,
        limit: slotResult.limit
      }
    };

  } catch (error) {
    // Step 3: Handle errors and release slot if acquired
    console.error(`❌ Call initiation failed:`, error);

    // Release slot if it was acquired
    if (slotAcquired && callId) {
      console.log(`🔄 Releasing slot due to error: ${callId}`);
      await concurrentCallManager.releaseSlot(businessId, callId);
    }

    // Check if 429 error from 11Labs
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'] || 60;

      // P0.5: Increment 429 metric
      metricsService.incrementCounter('elevenlabs_429_total');

      throw new CapacityError(
        '11Labs rate limit exceeded',
        'ELEVENLABS_429_RATE_LIMIT',
        parseInt(retryAfter),
        {
          provider: 'elevenlabs',
          originalError: error.response?.data
        }
      );
    }

    // Re-throw capacity errors as-is
    if (error instanceof CapacityError) {
      throw error;
    }

    // Wrap other errors
    throw new CapacityError(
      error.message || 'Call initiation failed',
      'CALL_INITIATION_FAILED',
      null,
      { originalError: error.message }
    );
  }
}

/**
 * Calculate Retry-After value based on slot availability
 * @param {Object} slotResult - Result from acquireSlot
 * @returns {number} Seconds until retry recommended
 */
function calculateRetryAfter(slotResult) {
  // If global capacity exceeded, suggest longer wait
  if (slotResult.error === 'GLOBAL_CAPACITY_EXCEEDED') {
    return 60; // 1 minute
  }

  // If business limit exceeded, suggest shorter wait
  if (slotResult.error === 'BUSINESS_CONCURRENT_LIMIT_EXCEEDED') {
    return 30; // 30 seconds
  }

  // Default
  return 45;
}

/**
 * Handle call completion (webhook or polling)
 * Releases slots when call ends
 * @param {string} callId - 11Labs conversation ID
 * @param {number} businessId - Business ID
 */
export async function handleCallCompletion(callId, businessId) {
  try {
    console.log(`📞 Call completed: ${callId} (business: ${businessId})`);

    await concurrentCallManager.releaseSlot(businessId, callId);

    console.log(`✅ Slot released for completed call: ${callId}`);

    return { success: true };

  } catch (error) {
    console.error(`❌ Error handling call completion:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Express middleware to handle CapacityError and return proper HTTP response
 */
export function capacityErrorHandler(error, req, res, next) {
  if (error instanceof CapacityError) {
    const statusCode = error.code === 'ELEVENLABS_429_RATE_LIMIT' ? 429 : 503;

    const response = {
      error: error.code,
      message: error.message,
      ...error.details
    };

    if (error.retryAfter) {
      res.set('Retry-After', error.retryAfter);
      response.retryAfter = error.retryAfter;
    }

    return res.status(statusCode).json(response);
  }

  next(error);
}

export { CapacityError };
