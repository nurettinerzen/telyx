// ============================================================================
// WEBHOOK ROUTES - 11Labs Integration
// ============================================================================
// Handles webhooks from external services (11Labs, Stripe, etc.)
// ============================================================================

import express from 'express';
import crypto from 'crypto';
import prisma from '../prismaClient.js';
import OpenAI from 'openai';
import concurrentCallManager from '../services/concurrentCallManager.js';
import usageService from '../services/usageService.js';
import { getInboundDisabledMessage } from '../phone-outbound-v1/index.js';
import metricsService from '../services/metricsService.js';
import { isPhoneInboundEnabledForBusinessId } from '../services/phoneInboundGate.js';
import { safeCompareHex } from '../security/constantTime.js';
import {
  cleanTranscriptText,
  normalizeTranscriptBundle
} from '../utils/transcript.js';

// OpenAI client for summary translation
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const router = express.Router();

// ============================================================================
// WEBHOOK SIGNATURE VERIFICATION
// ============================================================================

/**
 * Verify 11Labs webhook signature
 * @param {Object} req - Express request
 * @returns {boolean} - Whether signature is valid
 */
function verifyElevenLabsSignature(req) {
  const webhookSecret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!webhookSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[SECURITY] ELEVENLABS_WEBHOOK_SECRET not configured in production — REJECTING (fail-closed)');
      return false;
    }
    console.warn('⚠️ ELEVENLABS_WEBHOOK_SECRET not configured - skipping signature verification (non-prod)');
    return true;
  }

  const signature = req.headers['elevenlabs-signature'];
  if (!signature) {
    console.warn('⚠️ No elevenlabs-signature header found');
    return false;
  }

  try {
    // Parse signature: "t=timestamp,v0=hash"
    const parts = signature.split(',');
    const timestampPart = parts.find(p => p.startsWith('t='));
    const hashPart = parts.find(p => p.startsWith('v0='));

    if (!timestampPart || !hashPart) {
      console.warn('⚠️ Invalid signature format');
      return false;
    }

    const timestamp = timestampPart.split('=')[1];
    const receivedHash = hashPart.split('=')[1];

    // Verify timestamp (5 minute tolerance window)
    const now = Math.floor(Date.now() / 1000);
    const timestampAge = now - parseInt(timestamp);
    if (timestampAge > 300 || timestampAge < -300) {
      console.error('❌ 11Labs webhook timestamp too old or in future:', timestampAge, 'seconds');
      return false;
    }

    // Create signed payload
    const payload = `${timestamp}.${JSON.stringify(req.body)}`;
    const expectedHash = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    return safeCompareHex(receivedHash, expectedHash);
  } catch (error) {
    console.error('❌ Signature verification error:', error);
    return false;
  }
}

// ============================================================================
// 11LABS CALL-STARTED WEBHOOK (Conversation Initiation)
// This webhook is called when a call starts - for inbound calls, we need to
// verify that an inbound assistant is configured for this phone number
// SECURITY: Requires HMAC-SHA256 signature verification
// ============================================================================
router.post('/elevenlabs/call-started', async (req, res) => {
  console.warn('[LEGACY_WEBHOOK_HIT] /api/webhooks/elevenlabs/call-started — consider migrating to /api/elevenlabs/webhook');
  // SECURITY: Verify signature first
  if (!verifyElevenLabsSignature(req)) {
    console.error('❌ 11Labs call-started signature verification failed');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  try {
    console.log('📥 11Labs call-started event', {
      type: req.body?.type || null,
      conversationId: req.body?.data?.conversation_id || req.body?.conversation_id || null,
      agentId: req.body?.data?.agent_id || req.body?.agent_id || null,
    });

    // 11Labs webhook structure: { type, data: { ... } }
    const { type, data } = req.body;

    // Extract fields from data (if wrapped) or directly from body
    const callData = data || req.body;
    const {
      conversation_id,
      agent_id,
      metadata
    } = callData;

    // Extract phone call info
    const phoneCallInfo = callData.phone_call || metadata?.phone_call || {};
    const callDirection = phoneCallInfo.direction; // 'inbound' or 'outbound'
    const agentPhoneId = phoneCallInfo.agent_phone_number_id; // 11Labs phone ID
    const externalNumber = phoneCallInfo.external_number; // Caller's number (for inbound)

    const callId = conversation_id || callData.call_id;
    const agentId = agent_id;

    console.log('📞 11Labs Call Started:', {
      callId,
      direction: callDirection,
      agentPhoneId,
      externalNumber
    });

    // =========================================================================
    // INBOUND CALL CHECK - Verify inbound assistant is configured
    // =========================================================================
    if (callDirection === 'inbound') {
      console.log('📞 Inbound call detected, checking for inbound assistant...');

      // Find the phone number by 11Labs phone ID
      const phoneNumber = await prisma.phoneNumber.findFirst({
        where: { elevenLabsPhoneId: agentPhoneId },
        include: {
          assistant: {
            select: { id: true, name: true, isActive: true, elevenLabsAgentId: true }
          }
        }
      });

      if (!phoneNumber) {
        console.warn('⚠️ Phone number not found for 11Labs phone ID:', agentPhoneId);
        // Let the call proceed - may be configured differently
      } else if (!phoneNumber.assistant) {
        // No inbound assistant configured - reject the call
        console.warn('❌ No inbound assistant configured for phone:', phoneNumber.phoneNumber);
        return res.status(403).json({
          success: false,
          error: 'NO_INBOUND_ASSISTANT',
          message: 'Bu numara için gelen arama asistanı yapılandırılmamış. / No inbound assistant configured for this number.',
          action: 'reject_call'
        });
      } else if (!phoneNumber.assistant.isActive) {
        // Inbound assistant is not active - reject the call
        console.warn('❌ Inbound assistant is not active for phone:', phoneNumber.phoneNumber);
        return res.status(403).json({
          success: false,
          error: 'INBOUND_ASSISTANT_INACTIVE',
          message: 'Gelen arama asistanı aktif değil. / Inbound assistant is not active.',
          action: 'reject_call'
        });
      } else {
        console.log(`✅ Inbound assistant found: ${phoneNumber.assistant.name} (${phoneNumber.assistant.id})`);
      }

      const bestEffortBusinessId = await extractBusinessIdFromAgent(agentId) ||
        (agentPhoneId ? (await prisma.phoneNumber.findFirst({ where: { elevenLabsPhoneId: agentPhoneId }, select: { businessId: true } }))?.businessId : null);
      const inboundEnabled = await isPhoneInboundEnabledForBusinessId(bestEffortBusinessId);

      // V1 INBOUND GATE: Block inbound calls when business toggle is disabled (fail-closed)
      if (!inboundEnabled) {
        const disabledMessage = getInboundDisabledMessage();
        console.log(`[INBOUND_BLOCKED] ${JSON.stringify({ callId, source: 'legacy', reason: 'business.phoneInboundEnabled=false', externalNumber, businessId: bestEffortBusinessId })}`);
        metricsService.incrementCounter('phone_inbound_blocked_total', { source: 'legacy' });

        if (bestEffortBusinessId && callId) {
          try {
            await prisma.callLog.upsert({
              where: { callId },
              update: {
                businessId: bestEffortBusinessId,
                callerId: externalNumber || 'Unknown',
                direction: 'inbound',
                status: 'inbound_disabled_v1',
                summary: disabledMessage,
                updatedAt: new Date()
              },
              create: {
                businessId: bestEffortBusinessId,
                callId,
                callerId: externalNumber || 'Unknown',
                direction: 'inbound',
                status: 'inbound_disabled_v1',
                summary: disabledMessage,
                createdAt: new Date()
              }
            });
          } catch (logErr) {
            console.error('[INBOUND_BLOCKED] CallLog persist failed:', logErr.message);
          }
        }

        return res.status(403).json({
          success: false,
          error: 'PHONE_INBOUND_DISABLED',
          message: disabledMessage,
          action: 'reject_call'
        });
      }
    }

    // =========================================================================
    // Extract business ID
    // =========================================================================
    let businessId = metadata?.business_id;

    // Try to parse as integer if it's a string
    if (businessId && typeof businessId === 'string') {
      businessId = parseInt(businessId, 10);
    }

    // Fallback: find from agent
    if (!businessId) {
      businessId = await extractBusinessIdFromAgent(agentId);
    }

    // Fallback: find from phone number
    if (!businessId && agentPhoneId) {
      const phoneNumber = await prisma.phoneNumber.findFirst({
        where: { elevenLabsPhoneId: agentPhoneId },
        select: { businessId: true }
      });
      businessId = phoneNumber?.businessId;
    }

    if (!businessId) {
      console.warn('⚠️ No businessId found for call:', callId);
      return res.json({ success: true, warning: 'business_id not found' });
    }

    // =========================================================================
    // Acquire concurrent call slot
    // =========================================================================
    const slotResult = await concurrentCallManager.acquireSlot(
      businessId,
      callId || null,
      callDirection || 'outbound',
      { agentId, externalNumber, source: 'legacy' }
    );

    if (!slotResult.success) {
      console.log(`⚠️ Concurrent limit exceeded for business ${businessId}`);
      // Return 429 to indicate limit exceeded
      return res.status(429).json({
        success: false,
        error: slotResult.error,
        message: slotResult.message,
        currentActive: slotResult.currentActive,
        limit: slotResult.limit
      });
    }

    // Update BatchCall recipient if this is a batch call (outbound only)
    if (callDirection === 'outbound' && metadata?.recipient_id) {
      try {
        await updateBatchCallRecipientStatus(metadata.batch_call_id, metadata.recipient_id, 'in_progress', {
          elevenLabsCallId: callId,
          startedAt: new Date()
        });
      } catch (err) {
        console.error('Failed to update batch call recipient:', err);
      }
    }

    // Log the call start
    console.log(`✅ Call slot acquired: ${slotResult.currentActive}/${slotResult.limit} (${callDirection || 'unknown'} call)`);

    res.json({
      success: true,
      direction: callDirection,
      activeCalls: slotResult.currentActive,
      limit: slotResult.limit
    });

  } catch (error) {
    console.error('❌ 11Labs call-started webhook error:', error);
    res.json({ success: false, error: error.message });
  }
});

// ============================================================================
// 11LABS CALL-ENDED / POST-CALL WEBHOOK
// ============================================================================
router.post('/elevenlabs/call-ended', async (req, res) => {
  console.warn('[LEGACY_WEBHOOK_HIT] /api/webhooks/elevenlabs/call-ended — consider migrating to /api/elevenlabs/webhook');
  // SECURITY: Verify signature - ALWAYS required
  if (!verifyElevenLabsSignature(req)) {
    console.error('❌ 11Labs call-ended signature verification failed');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  try {
    console.log('📥 11Labs call-ended event', {
      type: req.body?.type || null,
      conversationId: req.body?.data?.conversation_id || req.body?.conversation_id || null,
      agentId: req.body?.data?.agent_id || req.body?.agent_id || null,
      status: req.body?.data?.status || req.body?.status || null,
    });

    // 11Labs post-call webhook structure:
    // { type: "post_call_transcription", data: { conversation_id, agent_id, status, metadata: { call_duration_secs, ... } } }
    const { type, data } = req.body;

    // Extract fields from data wrapper
    const callData = data || req.body;
    const {
      conversation_id,
      agent_id,
      status,
      transcript,
      analysis,
      recording_url,
      audio_url
    } = callData;

    // Duration is inside metadata, not at root level
    const callMetadata = callData.metadata || {};
    const durationSeconds = callMetadata.call_duration_secs || callData.call_duration_secs || 0;

    // Phone call info from 11Labs metadata
    const phoneCallInfo = callMetadata.phone_call || {};
    const externalNumber = phoneCallInfo.external_number; // The external party's number
    const agentPhoneNumber = phoneCallInfo.agent_phone_number; // Our phone number
    const agentPhoneId = phoneCallInfo.agent_phone_number_id; // 11Labs phone ID
    const callDirection = phoneCallInfo.direction; // 'inbound' or 'outbound'

    // Batch call info from 11Labs metadata
    const batchCallInfo = callMetadata.batch_call || {};
    const elevenLabsBatchId = batchCallInfo.batch_call_id;
    const elevenLabsRecipientId = batchCallInfo.batch_call_recipient_id;

    // Our custom metadata (sent via conversation_initiation_client_data)
    // 11Labs may return it in different locations depending on webhook type
    const conversationInitData = callMetadata.conversation_initiation_client_data || {};
    const customMetadata = conversationInitData.metadata || callMetadata.custom || callMetadata;

    // DEBUG: Log all metadata locations to find where our batch_call_id is
    console.log('🔍 DEBUG metadata locations:', {
      'callMetadata.batch_call': callMetadata.batch_call,
      'callMetadata.custom': callMetadata.custom,
      'callMetadata.conversation_initiation_client_data': callMetadata.conversation_initiation_client_data,
      'customMetadata.batch_call_id': customMetadata?.batch_call_id,
      'customMetadata.recipient_id': customMetadata?.recipient_id,
      'customMetadata.business_id': customMetadata?.business_id
    });

    const callId = conversation_id || callData.call_id;
    const agentId = agent_id;

    console.log('📊 11Labs Call Ended:', {
      callId,
      duration: durationSeconds + 's',
      status,
      direction: callDirection,
      externalNumber,
      agentPhoneNumber,
      elevenLabsBatchId,
      elevenLabsRecipientId
    });

    // Extract business ID - try multiple methods
    let businessId = customMetadata?.business_id;

    // Try to parse as integer if it's a string
    if (businessId && typeof businessId === 'string') {
      businessId = parseInt(businessId, 10);
    }

    // Fallback: find from agent
    if (!businessId && agentId) {
      businessId = await extractBusinessIdFromAgent(agentId);
    }

    if (!businessId) {
      console.warn('⚠️ No businessId found for call:', callId);
      return res.json({ success: true, warning: 'business_id not found' });
    }

    console.log('📊 Processing call for business:', businessId);

    // 1. Release concurrent call slot
    await concurrentCallManager.releaseSlot(businessId, callId || null);
    console.log('✅ Call slot released for business:', businessId);

    // 2. Track minute usage
    let usageResult = null;
    if (durationSeconds > 0) {
      try {
        usageResult = await usageService.recordPhoneUsageForBusiness({
          businessId,
          durationSeconds,
          callId,
          metadata: {
            channel: customMetadata?.channel || 'phone',
            source: 'legacy_webhook'
          }
        });

        console.log('📊 Usage tracked via billing v2:', {
          durationMinutes: Math.ceil(durationSeconds / 60),
          chargeType: usageResult?.chargeResult?.chargeType || null,
          breakdown: usageResult?.chargeResult?.breakdown || null
        });
      } catch (usageError) {
        console.error('❌ Billing v2 usage tracking failed on legacy webhook:', usageError);
      }
    } else {
      console.log('⚠️ Duration is 0, skipping usage tracking');
    }

    // 3. Create call log FIRST (so we have callLogId for batch recipient)
    // Generate 11Labs recording URL from conversation_id
    const recordingUrl = callId
      ? `https://api.elevenlabs.io/v1/convai/conversations/${callId}/audio`
      : recording_url || audio_url || null;

    const callLog = await createCallLog(businessId, {
      callId: callId,
      agentId: agentId,
      duration: durationSeconds,
      transcript,
      analysis,
      recordingUrl,
      // Phone info for caller display - use external number as it's the customer
      callerNumber: externalNumber,
      calledNumber: agentPhoneNumber,
      direction: callDirection || 'unknown',
      metadata: { ...callMetadata, ...customMetadata }
    });

    // 4. Update BatchCall recipient with ALL data including callLogId
    const normalizedLifecycleStatus = String(status || '').toLowerCase();
    const callStatus = ['done', 'completed', 'success'].includes(normalizedLifecycleStatus)
      ? 'completed'
      : 'failed';

    // Method A: Use our custom metadata (batch_call_id, recipient_id)
    if (customMetadata?.batch_call_id) {
      console.log(`🔍 Using Method A: batch_call_id=${customMetadata.batch_call_id}, recipient_id=${customMetadata.recipient_id}`);
      try {
        await updateBatchCallRecipientStatus(
          customMetadata.batch_call_id,
          customMetadata.recipient_id,
          callStatus,
          {
            duration: durationSeconds,
            completedAt: new Date(),
            elevenLabsConversationId: callId,
            transcript: transcript,
            analysis: analysis,
            // Include callLogId for "Listen" button navigation
            callLogId: callLog?.id || null
          }
        );
        await updateBatchCallProgress(customMetadata.batch_call_id);
        console.log(`✅ Batch call recipient updated with callLogId: ${callLog?.id}`);
      } catch (err) {
        console.error('Failed to update batch call recipient (method A):', err);
      }
    }
    // Method B: Find by phone number (fallback)
    else if (externalNumber) {
      console.log(`🔍 Using Method B (fallback): phone=${externalNumber}`);
      try {
        await updateBatchCallRecipientByPhone(externalNumber, callStatus, {
          duration: durationSeconds,
          completedAt: new Date(),
          elevenLabsConversationId: callId,
          transcript: transcript,
          callLogId: callLog?.id || null
        });
      } catch (err) {
        console.error('Failed to update batch call recipient (method B):', err);
      }
    }

    res.json({
      success: true,
      usage: {
        durationMinutes: Math.ceil(durationSeconds / 60),
        source: usageResult?.fromOverage > 0 ? 'overage' :
                usageResult?.fromCredit > 0 ? 'credit' : 'package',
        overageCharge: usageResult?.fromOverage > 0 ?
                       usageResult.fromOverage * (usageResult.subscription?.overageRate || 0) : 0
      }
    });

  } catch (error) {
    console.error('❌ 11Labs call-ended webhook error:', error);
    res.json({ success: false, error: error.message });
  }
});

// ============================================================================
// 11LABS POST-CALL WEBHOOK (Alternative endpoint)
// SECURITY: Requires HMAC-SHA256 signature verification
// ============================================================================
router.post('/elevenlabs/post-call', async (req, res) => {
  console.warn('[LEGACY_WEBHOOK_HIT] /api/webhooks/elevenlabs/post-call — consider migrating to /api/elevenlabs/webhook');
  // SECURITY: Verify signature first
  if (!verifyElevenLabsSignature(req)) {
    console.error('❌ 11Labs post-call signature verification failed');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Forward to call-ended handler
  console.log('📥 11Labs post-call webhook - forwarding to call-ended handler');
  req.url = '/elevenlabs/call-ended';
  return router.handle(req, res, () => {
    // Call the call-ended handler directly
    return res.json({ success: true, note: 'Forwarded to call-ended handler' });
  });
});

// ============================================================================
// HELPER: Update BatchCall recipient status
// ============================================================================
async function updateBatchCallRecipientStatus(batchCallId, recipientId, status, additionalData = {}) {
  if (!batchCallId) return;

  try {
    // Get current batch call
    const batchCall = await prisma.batchCall.findUnique({
      where: { id: batchCallId }
    });

    if (!batchCall) {
      console.warn('BatchCall not found:', batchCallId);
      return;
    }

    // Parse recipients JSON
    let recipients = [];
    try {
      recipients = JSON.parse(batchCall.recipients || '[]');
    } catch (e) {
      console.error('Failed to parse recipients JSON:', e);
      return;
    }

    // Find and update the recipient
    const recipientIndex = recipients.findIndex(r =>
      r.id === recipientId ||
      r.elevenLabsCallId === additionalData.elevenLabsCallId
    );

    if (recipientIndex >= 0) {
      recipients[recipientIndex] = {
        ...recipients[recipientIndex],
        status,
        ...additionalData
      };

      // Update batch call with new recipients JSON
      await prisma.batchCall.update({
        where: { id: batchCallId },
        data: {
          recipients: JSON.stringify(recipients)
        }
      });

      console.log(`✅ BatchCall recipient updated: ${recipientId} -> ${status}`);
    }
  } catch (error) {
    console.error('Error updating batch call recipient:', error);
  }
}

// ============================================================================
// HELPER: Update BatchCall progress
// ============================================================================
async function updateBatchCallProgress(batchCallId) {
  if (!batchCallId) return;

  try {
    const batchCall = await prisma.batchCall.findUnique({
      where: { id: batchCallId }
    });

    if (!batchCall) return;

    // Parse recipients and count statuses
    let recipients = [];
    try {
      recipients = JSON.parse(batchCall.recipients || '[]');
    } catch (e) {
      return;
    }

    const completedCount = recipients.filter(r => r.status === 'completed').length;
    const failedCount = recipients.filter(r => r.status === 'failed').length;
    const successfulCount = recipients.filter(r => r.status === 'completed' && r.duration > 0).length;

    // Determine batch status
    const totalProcessed = completedCount + failedCount;
    let batchStatus = batchCall.status;

    if (totalProcessed >= recipients.length) {
      batchStatus = failedCount === recipients.length ? 'FAILED' : 'COMPLETED';
    }

    // Update batch call
    await prisma.batchCall.update({
      where: { id: batchCallId },
      data: {
        completedCalls: completedCount,
        failedCalls: failedCount,
        successfulCalls: successfulCount,
        status: batchStatus,
        ...(batchStatus === 'COMPLETED' ? { completedAt: new Date() } : {})
      }
    });

    console.log(`✅ BatchCall progress updated: ${completedCount}/${recipients.length} completed`);
  } catch (error) {
    console.error('Error updating batch call progress:', error);
  }
}

// ============================================================================
// HELPER: Update BatchCall recipient by phone number (fallback method)
// ============================================================================
async function updateBatchCallRecipientByPhone(phoneNumber, status, additionalData = {}) {
  if (!phoneNumber) return;

  try {
    // Normalize phone number - get last 10 digits
    const normalizedPhone = phoneNumber.replace(/\D/g, '').slice(-10);

    console.log(`🔍 Looking for recipient with phone ending in: ${normalizedPhone}`);

    // Find recent batch calls that are PENDING or IN_PROGRESS
    const recentBatchCalls = await prisma.batchCall.findMany({
      where: {
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    console.log(`🔍 Method B: Found ${recentBatchCalls.length} recent batch calls to search`);

    for (const batchCall of recentBatchCalls) {
      let recipients = [];
      try {
        recipients = JSON.parse(batchCall.recipients || '[]');
      } catch (e) {
        continue;
      }

      // Find recipient by phone number
      const recipientIndex = recipients.findIndex(r => {
        const recipientPhone = (r.phone_number || '').replace(/\D/g, '');
        return recipientPhone.endsWith(normalizedPhone) &&
               (!r.status || r.status === 'pending' || r.status === 'in_progress');
      });

      if (recipientIndex >= 0) {
        // Update recipient
        recipients[recipientIndex] = {
          ...recipients[recipientIndex],
          status,
          ...additionalData
        };

        await prisma.batchCall.update({
          where: { id: batchCall.id },
          data: {
            recipients: JSON.stringify(recipients)
          }
        });

        console.log(`✅ BatchCall recipient updated by phone: ${phoneNumber} -> ${status}`);

        // Update batch call progress
        await updateBatchCallProgress(batchCall.id);

        return; // Found and updated, exit
      }
    }

    console.log(`⚠️ No pending recipient found for phone: ${phoneNumber}`);
  } catch (error) {
    console.error('Error updating batch call recipient by phone:', error);
  }
}

// ============================================================================
// HELPER: Extract business ID from 11Labs agent ID
// ============================================================================
async function extractBusinessIdFromAgent(agentId) {
  if (!agentId) return null;

  try {
    const assistant = await prisma.assistant.findFirst({
      where: { elevenLabsAgentId: agentId },
      select: { businessId: true }
    });
    return assistant?.businessId || null;
  } catch (error) {
    console.error('Error extracting business ID from agent:', error);
    return null;
  }
}

// ============================================================================
// HELPER: Translate summary to Turkish using OpenAI
// ============================================================================
async function translateSummaryToTurkish(englishSummary) {
  if (!englishSummary || !openai) return englishSummary;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Sen bir çevirmensin. Verilen İngilizce metni doğal Türkçe\'ye çevir. Kısa ve öz tut.'
        },
        {
          role: 'user',
          content: englishSummary
        }
      ],
      max_tokens: 300,
      temperature: 0.3
    });

    const turkishSummary = response.choices[0]?.message?.content?.trim();
    console.log('🌐 Summary translated to Turkish');
    return turkishSummary || englishSummary;
  } catch (error) {
    console.error('❌ Failed to translate summary:', error.message);
    return englishSummary; // Return original if translation fails
  }
}

// ============================================================================
// HELPER: Create call log from 11Labs data
// ============================================================================
async function createCallLog(businessId, data) {
  try {
    // Format transcript - handle 11Labs transcript format
    let transcriptData = data.transcript;
    let transcriptText = '';

    if (Array.isArray(transcriptData)) {
      const normalizedBundle = normalizeTranscriptBundle(transcriptData);
      transcriptData = normalizedBundle.transcript;
      transcriptText = normalizedBundle.transcriptText;
    } else if (typeof transcriptData === 'string') {
      transcriptText = cleanTranscriptText(transcriptData);
    }

    // Extract analysis data from 11Labs
    const analysis = data.analysis || {};

    // Get summary from various possible locations
    let summary = analysis.transcript_summary ||
                   analysis.call_summary ||
                   analysis.summary ||
                   null;

    // Translate summary to Turkish if it's in English
    if (summary && /^[A-Za-z]/.test(summary)) {
      summary = await translateSummaryToTurkish(summary);
    }

    // Get sentiment - 11Labs might return it in different formats
    let sentiment = 'neutral';
    if (analysis.user_sentiment) {
      sentiment = analysis.user_sentiment.toLowerCase();
    } else if (analysis.sentiment) {
      sentiment = analysis.sentiment.toLowerCase();
    } else if (transcriptText) {
      // Fallback: detect sentiment from transcript
      sentiment = detectSentiment(transcriptText);
    }

    // Normalize sentiment values
    if (['positive', 'happy', 'satisfied'].includes(sentiment)) {
      sentiment = 'positive';
    } else if (['negative', 'angry', 'frustrated', 'dissatisfied'].includes(sentiment)) {
      sentiment = 'negative';
    } else {
      sentiment = 'neutral';
    }

    // Determine caller ID - prioritize external number (customer's phone)
    const callerId = data.callerNumber || data.metadata?.phone_number || data.metadata?.caller_id || 'unknown';

    // Parse boolean values - 11Labs may return strings like "true"/"false"
    const parseBoolean = (val) => {
      if (val === null || val === undefined) return null;
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') {
        if (val.toLowerCase() === 'true' || val === '1') return true;
        if (val.toLowerCase() === 'false' || val === '0') return false;
      }
      return null;
    };

    const taskCompletedRaw = analysis.call_successful ?? analysis.task_completed ?? analysis.taskCompleted;
    const followUpNeededRaw = analysis.follow_up_needed ?? analysis.followUpNeeded;

    // Determine end reason from metadata
    const endReason = data.metadata?.end_reason ||
                      data.metadata?.termination_reason ||
                      analysis.call_ended_by ||
                      (data.duration > 0 ? 'call_ended' : 'no_answer');

    // Calculate call cost (based on duration)
    // Cost: 0.60 TL per minute (adjustable)
    const costPerMinute = 0.60;
    const durationMinutes = Math.ceil((data.duration || 0) / 60);
    const callCost = durationMinutes * costPerMinute;

    const callLog = await prisma.callLog.create({
      data: {
        businessId,
        callId: data.callId || `call_${Date.now()}`,
        callerId: callerId,
        duration: data.duration || 0,
        status: 'completed',
        direction: data.direction || 'inbound',
        transcript: transcriptData || null,
        transcriptText,
        recordingUrl: data.recordingUrl || null,
        // Analysis fields
        summary: summary,
        sentiment: sentiment,
        intent: analysis.intent || analysis.user_intent || null,
        keyPoints: analysis.key_points || analysis.keyPoints || analysis.data_collected || [],
        keyTopics: analysis.key_topics || analysis.keyTopics || [],
        actionItems: analysis.action_items || analysis.actionItems || [],
        taskCompleted: parseBoolean(taskCompletedRaw),
        followUpNeeded: parseBoolean(followUpNeededRaw),
        // New fields
        endReason: endReason,
        callCost: callCost
      }
    });

    console.log('✅ Call log created for call:', data.callId, {
      callLogId: callLog.id,
      callerId,
      duration: data.duration,
      sentiment,
      hasSummary: !!summary,
      hasTranscript: !!transcriptText
    });

    return callLog;
  } catch (error) {
    console.error('Error creating call log:', error);
    // Don't throw - call log creation failure shouldn't break the webhook
    return null;
  }
}

// ============================================================================
// HELPER: Detect Sentiment (Simple implementation)
// ============================================================================
function detectSentiment(transcript) {
  if (!transcript) return 'neutral';

  const text = transcript.toLowerCase();

  // Positive words (Turkish + English)
  const positiveWords = ['thank', 'great', 'excellent', 'perfect', 'happy', 'good', 'wonderful', 'amazing',
    'teşekkür', 'harika', 'mükemmel', 'güzel', 'iyi', 'süper'];
  const positiveCount = positiveWords.filter(word => text.includes(word)).length;

  // Negative words (Turkish + English)
  const negativeWords = ['bad', 'terrible', 'awful', 'angry', 'frustrated', 'disappointed', 'problem', 'issue',
    'kötü', 'berbat', 'sinir', 'sorun', 'problem', 'şikayet'];
  const negativeCount = negativeWords.filter(word => text.includes(word)).length;

  if (positiveCount > negativeCount + 1) return 'positive';
  if (negativeCount > positiveCount + 1) return 'negative';
  return 'neutral';
}

// ============================================================================
// HELPER: Generate Summary (Simple implementation)
// ============================================================================
function generateSummary(transcript) {
  if (!transcript) return 'No transcript available';

  // Take first 150 characters as summary
  const summary = transcript.substring(0, 150).trim();
  return summary.length < transcript.length ? summary + '...' : summary;
}

// ============================================================================
// HELPER: Trigger Zapier Webhook
// ============================================================================
async function triggerZapierWebhook(businessId, call, callLog) {
  try {
    // Get Zapier integration
    const integration = await prisma.integration.findFirst({
      where: {
        businessId: businessId,
        type: 'ZAPIER',
        connected: true
      }
    });

    if (!integration || !integration.credentials?.webhookUrl) {
      console.log('No Zapier webhook configured');
      return;
    }

    const webhookUrl = integration.credentials.webhookUrl;

    // Prepare payload
    const payload = {
      event: 'call_completed',
      call_id: call.id,
      duration: callLog.duration,
      transcript: callLog.transcript,
      summary: callLog.summary,
      sentiment: callLog.sentiment,
      customer_phone: callLog.callerId,
      timestamp: new Date().toISOString()
    };

    // Send to Zapier
    const axios = (await import('axios')).default;
    await axios.post(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });

    console.log('✅ Zapier webhook triggered');

  } catch (error) {
    console.error('❌ Zapier webhook error:', error.message);
    // Don't throw - webhook failures shouldn't break the main flow
  }
}

// ============================================================================
// STRIPE WEBHOOK (for future use)
// ============================================================================
router.post('/stripe', async (req, res) => {
  try {
    // Stripe webhook handling
    console.log('💳 Stripe webhook received');
    res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    res.status(400).json({ error: error.message });
  }
});

export default router;
