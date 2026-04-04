/**
 * WhatsApp Webhook Handler
 * Multi-tenant WhatsApp Business API integration
 * Using Google Gemini API
 */

import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import prisma from '../prismaClient.js';
import { decrypt } from '../utils/encryption.js';
import { webhookRateLimiter } from '../middleware/rateLimiter.js';
import { getDateTimeContext } from '../utils/dateTime.js';
import { logWebhookSignatureFailure } from '../middleware/securityEventLogger.js';
import { buildAssistantPrompt, getActiveTools as getPromptBuilderTools } from '../services/promptBuilder.js';
import { isFreePlanExpired } from '../middleware/checkPlanExpiry.js';
import { calculateTokenCost, hasFreeChat } from '../config/plans.js';
import { getActiveTools, executeTool } from '../tools/index.js';
import callAnalysis from '../services/callAnalysis.js';
import { routeIntent } from '../services/intent-router.js';
import { validateActionClaim } from '../services/action-claim-validator.js';
import { routeMessage, handleDispute } from '../services/message-router.js';
import { isFeatureEnabled } from '../config/feature-flags.js';
import { getToolFailResponse, validateResponseAfterToolFail, executeToolWithRetry } from '../services/tool-fail-handler.js';
import { getGatedTools, canExecuteTool } from '../services/tool-gating.js';
import { logClassification, logRoutingDecision, logViolation, logToolExecution } from '../services/routing-metrics.js';
import { sendWhatsAppMessage as sendWhatsAppMessageCentral } from '../services/whatsapp-sender.js';

// CORE: Channel-agnostic orchestrator
import { handleIncomingMessage } from '../core/handleIncomingMessage.js';
import { getOrCreateSession as getUniversalSession } from '../services/session-mapper.js';
import {
  getOrCreateSession,
  addMessage,
  getHistory,
  getFullHistory,
  getPendingVerification,
  setVerificationRequest,
  clearVerificationRequest,
  terminateSession,
  isSessionActive,
  getTerminationMessage
} from '../services/conversation-manager.js';
import {
  getGeminiClient,
  convertToolsToGeminiFunctions,
  getGeminiModel,
  buildGeminiChatHistory,
  extractTokenUsage
} from '../services/gemini-utils.js';
import { isSessionLocked, getLockMessage, shouldSendAndMarkLockMessage, lockSession } from '../services/session-lock.js';
import { getState, updateState } from '../services/state-manager.js';
import { resolveChatAssistantForBusiness } from '../services/assistantChannels.js';
import { syncPersistedAssistantReply } from '../services/reply-parity.js';
import { safeCompareHex } from '../security/constantTime.js';
import { queueUnifiedResponseTrace } from '../services/trace/responseTraceLogger.js';
import {
  buildWhatsappWrittenIdempotencyKey,
  commitWrittenInteraction,
  isWrittenUsageBlockError,
  releaseWrittenInteraction,
  reserveWrittenInteraction
} from '../services/writtenUsageService.js';
import {
  appendChatLogMessages,
  buildSystemEventMessage,
  getNormalizedHandoffState,
  HANDOFF_MODE,
  requestHumanHandoff,
  shouldTriggerHumanHandoff,
} from '../services/liveHandoff.js';

const router = express.Router();
const VERIFY_TOKEN_ENV_KEYS = [
  'WHATSAPP_VERIFY_TOKEN',
  'META_VERIFY_TOKEN',
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
  'VERIFY_TOKEN'
];

// In-memory conversation history
// Format: Map<conversationKey, Array<message>>
const conversations = new Map();

// In-memory set to track processed message IDs (prevents duplicates from Meta retries)
// Messages are kept for 5 minutes then cleaned up
const processedMessages = new Map();
const MESSAGE_DEDUP_TTL = 5 * 60 * 1000; // 5 minutes
const WRITTEN_LIMIT_MESSAGE = {
  TR: 'Yazili destek limitinize ulastiniz. Devam etmek icin paketinizi yukseltin veya ek paket satin alin.',
  EN: 'You have reached your written support limit. Upgrade your plan or purchase an add-on to continue.'
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getLiveHandoffAcknowledgement(language = 'TR') {
  return String(language || 'TR').toUpperCase() === 'EN'
    ? 'A teammate will take over this WhatsApp conversation shortly. Please stay in this thread.'
    : 'Bir temsilcimiz bu WhatsApp yazışmasını birazdan devralacak. Lütfen bu konuşmada kalın.';
}

function getIntegrationCredentials(integration) {
  if (!integration || !isPlainObject(integration.credentials)) {
    return {};
  }

  return integration.credentials;
}

async function persistWhatsAppDeliveryStatus({ businessId, phoneNumberId, statuses = [] }) {
  if (!businessId || !Array.isArray(statuses) || statuses.length === 0) {
    return;
  }

  const integration = await prisma.integration.findUnique({
    where: {
      businessId_type: {
        businessId,
        type: 'WHATSAPP',
      }
    },
    select: {
      id: true,
      credentials: true,
    }
  });

  if (!integration?.id) {
    return;
  }

  const credentials = getIntegrationCredentials(integration);
  const currentTestSend = isPlainObject(credentials.lastTestSend) ? credentials.lastTestSend : null;

  if (!currentTestSend?.messageId) {
    return;
  }

  let nextTestSend = currentTestSend;
  let changed = false;

  for (const statusEntry of statuses) {
    const webhookMessageId = statusEntry?.id || null;
    if (!webhookMessageId || webhookMessageId !== currentTestSend.messageId) {
      continue;
    }

    const normalizedStatus = String(statusEntry?.status || '').trim().toLowerCase() || 'unknown';
    const errorEntry = Array.isArray(statusEntry?.errors) ? statusEntry.errors[0] : null;
    const rawTimestamp = statusEntry?.timestamp ? Number(statusEntry.timestamp) : null;
    const statusTimestamp = Number.isFinite(rawTimestamp) ? new Date(rawTimestamp * 1000).toISOString() : null;
    const lastStatusAt = new Date().toISOString();

    nextTestSend = {
      ...currentTestSend,
      phoneNumberId: phoneNumberId || currentTestSend.phoneNumberId || null,
      status: normalizedStatus,
      statusTimestamp,
      lastStatusAt,
      lastError: normalizedStatus === 'failed'
        ? {
            message: errorEntry?.message || statusEntry?.errors?.[0]?.title || 'WhatsApp delivery failed',
            code: errorEntry?.code || null,
            details: errorEntry?.error_data || null,
          }
        : null,
    };
    changed = true;
  }

  if (!changed) {
    return;
  }

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      credentials: {
        ...credentials,
        lastTestSend: nextTestSend,
      }
    }
  });

  console.log('📬 [WhatsApp Delivery Status] Updated last test send status', {
    businessId,
    phoneNumberId,
    messageId: nextTestSend.messageId,
    status: nextTestSend.status,
  });
}

// Cleanup old processed messages every minute
setInterval(() => {
  const now = Date.now();
  for (const [messageId, timestamp] of processedMessages) {
    if (now - timestamp > MESSAGE_DEDUP_TTL) {
      processedMessages.delete(messageId);
    }
  }
}, 60 * 1000);

function maskSecret(value) {
  if (!value || typeof value !== 'string') {
    return 'missing';
  }
  if (value.length <= 4) {
    return `${value.slice(0, 1)}***`;
  }
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function getBodyKeys(req) {
  if (!req.body || typeof req.body !== 'object' || Buffer.isBuffer(req.body)) {
    return [];
  }
  return Object.keys(req.body);
}

function logWebhookEntry(req, extra = {}) {
  console.log('📥 [WhatsApp Webhook ENTRY]', {
    requestId: req.requestId || null,
    method: req.method,
    path: req.originalUrl || req.path || null,
    queryKeys: Object.keys(req.query || {}),
    bodyKeys: getBodyKeys(req),
    ...extra
  });
}

function sendWebhookStatus(req, res, statusCode, reason, extra = {}) {
  if (statusCode !== 200) {
    console.warn('⚠️ [WhatsApp Webhook NON-200]', {
      requestId: req.requestId || null,
      method: req.method,
      path: req.originalUrl || req.path || null,
      statusCode,
      reason,
      ...extra
    });
  }
  return res.sendStatus(statusCode);
}

function getWrittenLimitMessage(language = 'TR') {
  return String(language || '').toUpperCase() === 'EN'
    ? WRITTEN_LIMIT_MESSAGE.EN
    : WRITTEN_LIMIT_MESSAGE.TR;
}

// ============================================================================
// WEBHOOK ENDPOINTS
// ============================================================================

// Webhook verification (Meta's initial setup verification)
router.get('/webhook', webhookRateLimiter.middleware(), async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  logWebhookEntry(req, {
    phase: 'verification',
    hubMode: mode || null,
    hasVerifyToken: Boolean(token),
    hasChallenge: Boolean(challenge)
  });

  if (mode !== 'subscribe' || !token) {
    return sendWebhookStatus(req, res, 403, 'verification_rejected', {
      hubMode: mode || null,
      hasVerifyToken: Boolean(token)
    });
  }

  if (!challenge) {
    return sendWebhookStatus(req, res, 400, 'missing_challenge');
  }

  const business = await prisma.business.findFirst({
    where: { whatsappVerifyToken: token }
  });

  if (business) {
    console.log('✅ [WhatsApp Verify] Token matched business', {
      requestId: req.requestId || null,
      businessId: business.id,
      businessName: business.name
    });
    return res.status(200).send(challenge);
  }

  const matchedEnvKey = VERIFY_TOKEN_ENV_KEYS.find((key) => {
    const envValue = process.env[key];
    return typeof envValue === 'string' && envValue.length > 0 && envValue === token;
  });

  if (matchedEnvKey) {
    console.log('✅ [WhatsApp Verify] Token matched env verify token', {
      requestId: req.requestId || null,
      envKey: matchedEnvKey,
      tokenMasked: maskSecret(token)
    });
    return res.status(200).send(challenge);
  }

  return sendWebhookStatus(req, res, 403, 'verify_token_mismatch', {
    tokenMasked: maskSecret(token)
  });
});

/**
 * Verify WhatsApp webhook signature (Meta/Facebook)
 * Uses X-Hub-Signature-256 header with HMAC-SHA256
 */
function verifyWhatsAppSignature(req, appSecret) {
  if (!appSecret) {
    const strictMode = process.env.NODE_ENV === 'production' && process.env.WHATSAPP_ALLOW_UNSIGNED_WEBHOOKS !== 'true';
    if (strictMode) {
      return {
        valid: false,
        skipped: false,
        reason: 'app_secret_missing'
      };
    }

    return {
      valid: true,
      skipped: true,
      reason: 'app_secret_missing'
    };
  }

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    return {
      valid: false,
      reason: 'missing_signature_header'
    };
  }

  // Meta sends signature as "sha256=<hash>"
  const signatureHash = signature.split('=')[1];
  if (!signatureHash) {
    return {
      valid: false,
      reason: 'invalid_signature_format'
    };
  }

  let payloadBuffer;
  if (Buffer.isBuffer(req.rawBody)) {
    payloadBuffer = req.rawBody;
  } else if (typeof req.rawBody === 'string') {
    payloadBuffer = Buffer.from(req.rawBody);
  } else if (Buffer.isBuffer(req.body)) {
    payloadBuffer = req.body;
  } else {
    payloadBuffer = Buffer.from(JSON.stringify(req.body || {}));
  }

  // Calculate expected signature
  const expectedHash = crypto
    .createHmac('sha256', appSecret)
    .update(payloadBuffer)
    .digest('hex');

  const valid = safeCompareHex(signatureHash, expectedHash);
  return {
    valid,
    reason: valid ? 'ok' : 'signature_mismatch',
    usedRawBody: Buffer.isBuffer(req.rawBody) || typeof req.rawBody === 'string'
  };
}

async function logSignatureFailure(req, reason) {
  console.error('❌ [WhatsApp Webhook] Signature verification failed', {
    requestId: req.requestId || null,
    reason,
    signaturePresent: Boolean(req.headers['x-hub-signature-256'])
  });

  try {
    await logWebhookSignatureFailure(req, 'whatsapp', 401);
  } catch (eventLogError) {
    console.error('❌ [WhatsApp Webhook] Failed to persist signature failure event', {
      requestId: req.requestId || null,
      error: eventLogError.message
    });
  }
}

// Webhook - Incoming messages (Multi-tenant)
router.post('/webhook', webhookRateLimiter.middleware(), async (req, res) => {
  logWebhookEntry(req, {
    phase: 'event',
    signaturePresent: Boolean(req.headers['x-hub-signature-256'])
  });

  const entryCount = Array.isArray(req.body?.entry) ? req.body.entry.length : 0;
  const changeCount = Array.isArray(req.body?.entry?.[0]?.changes) ? req.body.entry[0].changes.length : 0;
  console.log('🔔 WhatsApp WEBHOOK RECEIVED', {
    requestId: req.requestId || null,
    object: req.body?.object || null,
    entryCount,
    changeCount,
  });

  // SECURITY: Verify webhook signature
  const appSecret = process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET;
  const signatureResult = verifyWhatsAppSignature(req, appSecret);
  if (signatureResult.skipped) {
    console.warn('⚠️ [WhatsApp Webhook] Signature verification skipped', {
      requestId: req.requestId || null,
      reason: signatureResult.reason
    });
  }

  if (!signatureResult.valid) {
    await logSignatureFailure(req, signatureResult.reason);
    return sendWebhookStatus(req, res, 401, 'invalid_signature', {
      reason: signatureResult.reason
    });
  }

  try {
    const body = req.body;

    // Validate webhook payload from Meta
    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      // Get the phone number ID to identify which business this message is for
      const phoneNumberId = value?.metadata?.phone_number_id;

      if (!phoneNumberId) {
        console.error('❌ No phone number ID in webhook payload', {
          requestId: req.requestId || null
        });
        return sendWebhookStatus(req, res, 400, 'missing_phone_number_id');
      }

      // Find the business by phone number ID (include integrations for tools)
      let business = await prisma.business.findFirst({
        where: { whatsappPhoneNumberId: phoneNumberId },
        include: {
          assistants: {
            where: { isActive: true },
            orderBy: { createdAt: 'desc' }
          },
          integrations: {
            where: { isActive: true }
          }
        }
      });

      // Fallback: If no business found but phoneNumberId matches env, use env credentials
      // SECURITY: Only use env fallback in non-production or when WHATSAPP_FALLBACK_BUSINESS_ID is set
      // Never fall back to "first active business" — cross-tenant risk
      if (!business && phoneNumberId === process.env.WHATSAPP_PHONE_NUMBER_ID) {
        const fallbackBusinessId = parseInt(process.env.WHATSAPP_FALLBACK_BUSINESS_ID || '21');
        console.log(`⚠️ Using env fallback for WhatsApp — phoneNumberId matched env, fallback businessId=${fallbackBusinessId}`);

        business = await prisma.business.findUnique({
          where: { id: fallbackBusinessId },
          include: {
            assistants: {
              where: { isActive: true },
              orderBy: { createdAt: 'desc' }
            },
            integrations: {
              where: { isActive: true }
            }
          }
        });

        // SECURITY: Removed "first active business" fallback — never route to random tenant
        if (!business) {
          console.error(`🚫 [WhatsApp] Fallback business ${fallbackBusinessId} not found — dropping message`);
        }

        if (business) {
          business._useEnvCredentials = true;
        }
      }

      if (!business) {
        console.error(`❌ No business found for phone number ID: ${phoneNumberId}`, {
          requestId: req.requestId || null
        });
        return sendWebhookStatus(req, res, 404, 'business_not_found', { phoneNumberId });
      }

      console.log(`✅ Message for business: ${business.name} (ID: ${business.id})`);

      // Check subscription and plan expiry
      const subscription = await prisma.subscription.findUnique({
        where: { businessId: business.id },
        include: { business: true }
      });

      if (subscription && isFreePlanExpired(subscription)) {
        console.log(`🚫 WhatsApp blocked - FREE plan expired for business ${business.id}`);
        // Silently ignore the message - don't respond
        return res.sendStatus(200);
      }

      if (Array.isArray(value?.statuses) && value.statuses.length > 0) {
        await persistWhatsAppDeliveryStatus({
          businessId: business.id,
          phoneNumberId,
          statuses: value.statuses,
        }).catch((error) => {
          console.error('❌ Failed to persist WhatsApp delivery status:', {
            requestId: req.requestId || null,
            businessId: business.id,
            phoneNumberId,
            error: error.message,
          });
        });
      }

      // Process incoming messages
      if (value?.messages && value.messages.length > 0) {
        const message = value.messages[0];
        const from = message.from; // Sender's phone number
        const messageBody = message.text?.body; // Message content
        const messageId = message.id;

        // Skip if not a text message
        if (!messageBody) {
          console.log('⚠️ Non-text message received, skipping');
          return res.sendStatus(200);
        }

        // IMPORTANT: Check for duplicate messages (Meta may retry)
        if (processedMessages.has(messageId)) {
          console.log(`⚠️ Duplicate message detected, skipping: ${messageId}`);
          return res.sendStatus(200);
        }

        // Mark message as being processed IMMEDIATELY
        processedMessages.set(messageId, Date.now());

        console.log('📩 WhatsApp message received:', {
          businessId: business.id,
          businessName: business.name,
          from,
          message: messageBody,
          id: messageId
        });

        // IMPORTANT: Respond to Meta immediately to prevent retries
        // Then process the message asynchronously
        res.sendStatus(200);

        // Process message asynchronously (don't await)
        processWhatsAppMessage(business, from, messageBody, messageId, {
          requestId: req.requestId || null,
          phoneNumberId
        }).catch(err => {
          console.error('❌ Async message processing error:', err);
        });

        return; // Already sent response
      }

      return res.sendStatus(200);
    } else {
      return sendWebhookStatus(req, res, 404, 'unexpected_object', {
        object: body?.object || null
      });
    }
  } catch (error) {
    console.error('❌ Webhook error:', {
      requestId: req.requestId || null,
      message: error.message
    });
    return sendWebhookStatus(req, res, 500, 'handler_exception');
  }
});

// ============================================================================
// ASYNC MESSAGE PROCESSING
// ============================================================================

/**
 * Process WhatsApp message asynchronously
 * Called after webhook returns 200 to Meta
 */
async function processWhatsAppMessage(business, from, messageBody, messageId, traceMeta = {}) {
  try {
    // ===== ROUTE-LEVEL GUARD: CHECK SESSION LOCK =====
    // Get universal session ID for this user
    const sessionId = await getUniversalSession(business.id, 'WHATSAPP', from);
    const language = business?.language || 'TR';

    // GUARD 1: Check if session is locked
    const lockStatus = await isSessionLocked(sessionId);
    if (lockStatus.locked) {
      console.log(`🔒 [WhatsApp Guard] Session ${sessionId} is LOCKED (${lockStatus.reason})`);

      // Check spam prevention - only send lock message once per minute
      const shouldSend = await shouldSendAndMarkLockMessage(sessionId);
      if (shouldSend) {
        const lockMsg = getLockMessage(lockStatus.reason, language);
        await sendWhatsAppMessage(business, from, lockMsg, {
          inboundMessageId: messageId,
          skipUsageMetering: true
        });
        console.log(`🔒 [WhatsApp Guard] Lock message sent`);
      } else {
        console.log(`🔒 [WhatsApp Guard] Lock message skipped (spam prevention)`);
      }

      return; // EXIT - Do not process message
    }

    const state = await getState(sessionId);
    const handoff = getNormalizedHandoffState(state);
    const userTranscriptMessage = {
      role: 'user',
      content: messageBody,
      timestamp: new Date().toISOString(),
    };

    if (shouldTriggerHumanHandoff(messageBody) && handoff.mode === HANDOFF_MODE.AI) {
      await requestHumanHandoff({
        sessionId,
        businessId: business.id,
        requestedBy: 'customer',
        requestedReason: 'customer_requested_live_support',
        currentState: state,
      });

      await appendChatLogMessages({
        sessionId,
        businessId: business.id,
        channel: 'WHATSAPP',
        assistantId: business.assistants?.[0]?.id || null,
        customerPhone: from,
        messages: [
          userTranscriptMessage,
          buildSystemEventMessage(
            'Customer requested live support.',
            {
              type: 'handoff_requested',
              requestedBy: 'customer',
              inboundMessageId: messageId,
            }
          )
        ]
      });

      await sendWhatsAppMessage(business, from, getLiveHandoffAcknowledgement(language), {
        inboundMessageId: `${messageId}:handoff`,
        skipUsageMetering: true,
      });

      console.log(`🤝 [WhatsApp] Live handoff requested for session ${sessionId}`);
      return;
    }

    if (handoff.mode === HANDOFF_MODE.REQUESTED || handoff.mode === HANDOFF_MODE.ACTIVE) {
      await appendChatLogMessages({
        sessionId,
        businessId: business.id,
        channel: 'WHATSAPP',
        assistantId: business.assistants?.[0]?.id || null,
        customerPhone: from,
        messages: [userTranscriptMessage]
      });

      console.log(`🤝 [WhatsApp] Human handoff active (${handoff.mode}) — AI response suppressed for ${sessionId}`);
      return;
    }

    // ===== SESSION OK - DELEGATE TO CORE ORCHESTRATOR =====

    console.log('\n📱 [WhatsApp Adapter] Delegating to core orchestrator...');

    const resolved = await resolveChatAssistantForBusiness({
      prisma,
      business,
      allowAutoCreate: true
    });

    if (!resolved.assistant) {
      console.error(`❌ [WhatsApp] No chat-capable assistant for business ${business.id}`);
      await sendWhatsAppMessage(
        business,
        from,
        'Üzgünüm, şu anda yanıt veremiyorum. Lütfen daha sonra tekrar deneyin.',
        { inboundMessageId: messageId, skipUsageMetering: true }
      );
      return;
    }

    // Call core orchestrator (unified pipeline for all channels)
    const result = await handleIncomingMessage({
      channel: 'WHATSAPP',
      business,
      assistant: resolved.assistant,
      channelUserId: from,
      sessionId, // CRITICAL: Pass sessionId to prevent new session creation
      messageId,
      userMessage: messageBody,
      language: business.language || 'TR',
      timezone: business.timezone || 'Europe/Istanbul',
      metadata: {
        inboundMessageId: messageId,
        requestId: traceMeta.requestId || null,
        phoneNumberId: traceMeta.phoneNumberId || null,
        sessionId
      }
    });

    const aiResponse = result.reply;
    const postprocessorsApplied = Array.isArray(result.warnings) && result.warnings.length > 0
      ? ['core_warning_prefix']
      : [];

    // Send response using business's credentials (with idempotency)
    try {
      await sendWhatsAppMessage(business, from, aiResponse, {
        inboundMessageId: messageId,
        assistantId: resolved.assistant?.id || null
      });
    } catch (sendError) {
      if (isWrittenUsageBlockError(sendError)) {
        await sendWhatsAppMessage(business, from, getWrittenLimitMessage(business.language), {
          inboundMessageId: `${messageId}:limit`,
          skipUsageMetering: true
        });
        return;
      }
      throw sendError;
    }
    try {
      const paritySync = await syncPersistedAssistantReply({
        sessionId,
        persistedReply: result.reply,
        finalReply: aiResponse
      });
      if (paritySync.updated) {
        console.log(`🔁 [WhatsApp] Persisted assistant reply synchronized (index=${paritySync.targetIndex})`);
      }
    } catch (parityError) {
      console.error('⚠️ [WhatsApp] Failed to synchronize persisted reply:', parityError.message);
    }

    // Unified response trace (finalized after route-level postprocessing)
    const traceInput = result.traceContext || {
      context: {
        channel: 'WHATSAPP',
        businessId: business.id,
        userId: from,
        sessionId,
        messageId,
        requestId: traceMeta.requestId || null,
        language: business.language || 'TR',
        verificationState: result?.metadata?.verificationState || 'none',
        responseSource: result?.metrics?.response_origin || null,
        originId: result?.metrics?.origin_id || null,
        llmUsed: result?.metrics?.LLM_CALLED === true,
        llmBypassReason: result?.metrics?.llm_bypass_reason || null,
        guardrailAction: result?.metadata?.guardrailAction || 'PASS',
        guardrailReason: result?.metadata?.guardrailReason || null,
        responseGrounding: result?.metadata?.responseGrounding || null,
        messageType: result?.metadata?.messageType || null,
        guardrailsApplied: result?.metadata?.guardrailsApplied || [],
        policyAppend: result?.metrics?.policyAppend || null,
        latencyMs: result?.metrics?.turnStartTime ? Date.now() - result.metrics.turnStartTime : null
      },
      llmMeta: {
        called: result?.metrics?.LLM_CALLED === true,
        model: resolved.assistant?.model || null,
        status: result?.metrics?.llm_status || null,
        llm_bypass_reason: result?.metrics?.llm_bypass_reason || null
      },
      plan: {
        intent: result?.metrics?.intent_final || 'unknown',
        slots: result?.state?.collectedSlots || result?.state?.extractedSlots || {},
        tool_candidates: [],
        tool_selected: null,
        confidence: null
      },
      tools: [],
      guardrail: {
        action: result?.metadata?.guardrailAction || 'PASS',
        reason: result?.metadata?.guardrailReason || null
      }
    };

    queueUnifiedResponseTrace({
      ...traceInput,
      context: {
        ...(traceInput.context || {}),
        requestId: traceMeta.requestId || traceInput?.context?.requestId || null,
        messageId: messageId || traceInput?.context?.messageId || null,
        sessionId: sessionId || traceInput?.context?.sessionId || null
      },
      postprocessors: postprocessorsApplied,
      finalResponse: aiResponse
    });
  } catch (error) {
    console.error('❌ Error processing WhatsApp message:', error);

    // Persist to ErrorLog
    import('../services/errorLogger.js')
      .then(({ logChatError }) => {
        logChatError(error, {
          source: 'whatsapp',
          businessId: business?.id,
          sessionId: from || null,
        }).catch(() => {});
      })
      .catch(() => {});

    // Try to send error message to user (no idempotency for error messages)
    try {
      await sendWhatsAppMessage(
        business,
        from,
        'Üzgünüm, şu anda bir sorun yaşıyorum. Lütfen daha sonra tekrar deneyin.'
      );
    } catch (sendError) {
      console.error('❌ Failed to send error message:', sendError);
    }
  }
}

// ============================================================================
// AI RESPONSE WITH GEMINI
// ============================================================================

/**
 * Generate AI response using Gemini with proper function calling
 * Same architecture as chat.js - model calls tools when needed
 */
/**
 * @deprecated This function is deprecated. WhatsApp now uses the unified orchestrator (handleIncomingMessage).
 * Kept for reference during migration. Will be removed after validation.
 */
async function generateAIResponse_DEPRECATED(business, phoneNumber, messageBody, context = {}) {
  if (process.env.ENABLE_LEGACY_WHATSAPP_HANDLER !== 'true') {
    throw new Error('LEGACY_WHATSAPP_HANDLER_DISABLED');
  }

  try {
    console.log('\n📱 [WhatsApp] Delegating to core orchestrator...');

    const assistant = business.assistants?.[0];
    const language = business?.language || 'TR';
    const subscription = context.subscription;

    // Conversation key for in-memory cache
    const conversationKey = `${business.id}:${phoneNumber}`;

    // Get universal session ID
    const sessionId = await getUniversalSession(business.id, 'WHATSAPP', phoneNumber);

    // Build system prompt
    const systemPrompt = await buildSystemPrompt(business, assistant);

    // Session timeout: 30 minutes of inactivity = new session
    const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

    // Get conversation history (from memory cache or database)
    let history;
    let existingLog;

    // Check if existing session has timed out
    existingLog = await prisma.chatLog.findUnique({
      where: { sessionId },
      select: { id: true, inputTokens: true, outputTokens: true, totalCost: true, updatedAt: true, status: true, messages: true }
    });

    if (existingLog) {
      const lastActivity = new Date(existingLog.updatedAt);
      const timeSinceActivity = Date.now() - lastActivity.getTime();

      if (timeSinceActivity > SESSION_TIMEOUT_MS) {
        // Session timed out (30 min inactivity) - archive old session and start fresh
        console.log(`⏰ [WhatsApp] Session for ${phoneNumber} timed out (${Math.round(timeSinceActivity / 60000)} min) - starting new session`);

        // Determine normalized topic for timed out session
        let normalizedCategory = null;
        let normalizedTopic = null;
        if (existingLog.messages && Array.isArray(existingLog.messages) && existingLog.messages.length > 0) {
          try {
            const transcriptText = callAnalysis.formatChatMessagesAsTranscript(existingLog.messages);
            if (transcriptText && transcriptText.length > 20) {
              const topicResult = await callAnalysis.determineNormalizedTopic(transcriptText);
              normalizedCategory = topicResult.normalizedCategory;
              normalizedTopic = topicResult.normalizedTopic;
              console.log(`📊 [WhatsApp] Timed out session topic: ${normalizedCategory} > ${normalizedTopic}`);
            }
          } catch (topicError) {
            console.error('⚠️ [WhatsApp] Topic determination failed:', topicError.message);
          }
        }

        // Archive old session with timestamp suffix
        const archivedSessionId = `${sessionId}-${existingLog.updatedAt.getTime()}`;
        await prisma.chatLog.update({
          where: { sessionId },
          data: {
            sessionId: archivedSessionId,
            status: 'ended',
            normalizedCategory: normalizedCategory,
            normalizedTopic: normalizedTopic,
            updatedAt: new Date()
          }
        });
        console.log(`📦 [WhatsApp] Archived old session as: ${archivedSessionId}`);

        // Start fresh with same base session ID (will be created on save)
        history = [];
        existingLog = null;
        conversations.delete(conversationKey);
      } else if (conversations.has(conversationKey)) {
        // Use cached history (session still active)
        history = conversations.get(conversationKey);
        console.log(`✅ [WhatsApp] Session active (${Math.round(timeSinceActivity / 60000)} min since last activity)`);
      } else if (existingLog.messages && Array.isArray(existingLog.messages)) {
        // Load history from database (last 40 messages)
        history = existingLog.messages.slice(-40);
        conversations.set(conversationKey, history);
        console.log(`📚 [WhatsApp] Loaded ${history.length} messages from database for ${phoneNumber}`);
      } else {
        history = [];
        conversations.set(conversationKey, history);
      }
    } else {
      history = [];
      conversations.set(conversationKey, history);
    }

    // ============================================
    // INTENT ROUTING (NEW!)
    // ============================================
    console.log('🎯 [WhatsApp] Starting intent detection for:', sessionId);

    // Check if session is still active - if terminated, reject message
    const session = getOrCreateSession(sessionId, 'whatsapp');

    if (!session.isActive) {
      console.log('🛑 [WhatsApp] Session terminated - rejecting message');

      const terminationMessage = getTerminationMessage(session.terminationReason || 'off_topic', business.language);

      // Send termination message (with idempotency)
      await sendWhatsAppMessage(business, phoneNumber, terminationMessage, {
        inboundMessageId: context.messageId,
        skipUsageMetering: true
      });

      // Don't process further
      return;
    }

    // Detect user intent and get appropriate tools
    const intentResult = await routeIntent(messageBody, sessionId, business.language, { name: business.name });

    console.log('🎯 [WhatsApp] Intent result:', {
      intent: intentResult.intent,
      tools: intentResult.tools,
      shouldTerminate: intentResult.shouldTerminate
    });

    // Handle session termination
    if (intentResult.shouldTerminate) {
      terminateSession(sessionId, intentResult.intent === 'off_topic' ? 'off_topic' : 'verification_failed');

      // Send termination message (with idempotency)
      await sendWhatsAppMessage(business, phoneNumber, intentResult.response, {
        inboundMessageId: context.messageId,
        skipUsageMetering: true
      });

      // Save to conversation history
      history.push({ role: 'assistant', content: intentResult.response });

      // Save conversation to database
      await prisma.whatsappConversation.upsert({
        where: { id: conversationKey },
        update: {
          messages: JSON.stringify(history),
          lastMessageAt: new Date()
        },
        create: {
          id: conversationKey,
          businessId: business.id,
          phoneNumber,
          messages: JSON.stringify(history),
          lastMessageAt: new Date()
        }
      });

      return;
    }

    // Handle direct responses (no tools needed)
    if (intentResult.response) {
      await sendWhatsAppMessage(business, phoneNumber, intentResult.response, {
        inboundMessageId: context.messageId,
        skipUsageMetering: true
      });

      // Save to conversation history
      history.push({ role: 'assistant', content: intentResult.response });

      // Save conversation to database
      await prisma.whatsappConversation.upsert({
        where: { id: conversationKey },
        update: {
          messages: JSON.stringify(history),
          lastMessageAt: new Date()
        },
        create: {
          id: conversationKey,
          businessId: business.id,
          phoneNumber,
          messages: JSON.stringify(history),
          lastMessageAt: new Date()
        }
      });

      return;
    }

    // ============================================
    // HANDLE VERIFICATION RESPONSE (SPECIAL CASE)
    // ============================================
    // When user is responding to a verification request, call tool directly
    let verificationToolResult = null;
    if (intentResult.intent === 'verification_response' && intentResult.verificationData) {
      console.log('🔐 [WhatsApp] Processing verification response with tool');

      const pendingVerification = getPendingVerification(sessionId);

      if (pendingVerification) {
        // Call customer_data_lookup with the cached data + user's provided verification data
        // Merge all verification data from current response
        const toolResult = await executeTool(
          'customer_data_lookup',
          {
            query_type: intentResult.queryType || pendingVerification.queryType || 'siparis',
            // Spread all verification data (order_number, phone, vkn, tc, customer_name, etc.)
            ...intentResult.verificationData
          },
          business,
          {
            sessionId,
            intent: intentResult.intent,
            requiresVerification: true,
            channel: 'WHATSAPP',
            from: phoneNumber
          }
        );

        // Check if verification failed and should terminate
        if (toolResult.shouldTerminate) {
          terminateSession(sessionId, 'verification_failed');
          await sendWhatsAppMessage(
            business,
            phoneNumber,
            toolResult.error || getTerminationMessage('verification_failed', business.language),
            {
              inboundMessageId: context.messageId,
              skipUsageMetering: true
            }
          );

          history.push({ role: 'assistant', content: toolResult.error || getTerminationMessage('verification_failed', business.language) });

          await prisma.whatsappConversation.upsert({
            where: { id: conversationKey },
            update: { messages: JSON.stringify(history), lastMessageAt: new Date() },
            create: { id: conversationKey, businessId: business.id, phoneNumber, messages: JSON.stringify(history), lastMessageAt: new Date() }
          });

          return;
        }

        // Store tool result to pass to Gemini
        verificationToolResult = toolResult;
        console.log('✅ [WhatsApp] Verification tool result received, will pass to Gemini for formatting');
      }
    }

    // ============================================
    // HANDLE COMPLAINT (PRE-EMPTIVE CALLBACK)
    // ============================================
    // When user intent is complaint, automatically create callback
    if (intentResult.intent === 'complaint') {
      console.log('📞 [WhatsApp] Complaint detected, creating callback pre-emptively');

      // Clear any pending verification (user gave up on providing info)
      if (getPendingVerification(sessionId)) {
        clearVerificationRequest(sessionId);
        console.log('🧹 [WhatsApp] Cleared pending verification - user switched to complaint');
      }

      const {
        extractCustomerInfoFromHistory,
        extractTopicFromHistory,
        buildCallbackContextMessage
      } = await import('../services/callback-helper.js');

      // Extract customer info from history (WhatsApp has phone number available)
      const customerInfo = extractCustomerInfoFromHistory(history, { phone: phoneNumber, customerName: null });
      const topic = extractTopicFromHistory(history);

      // Call create_callback tool
      const callbackResult = await executeTool(
        'create_callback',
        {
          customer_name: customerInfo.name,
          customer_phone: customerInfo.phone,
          topic: topic,
          priority: 'HIGH' // Complaints are always high priority
        },
        business,
        {
          sessionId,
          intent: 'complaint',
          channel: 'WHATSAPP',
          from: phoneNumber
        }
      );

      if (callbackResult.success) {
        // Store tool result to pass to Gemini
        verificationToolResult = {
          success: true,
          data: callbackResult.data,
          message: buildCallbackContextMessage(callbackResult.data, business.language || 'TR')
        };
        console.log('✅ [WhatsApp] Callback created, will pass to Gemini for formatting');
      }
    }

    // Filter tools based on intent
    // IMPORTANT: If we have verificationToolResult, we DON'T want Gemini to call tools
    // We already called the tool pre-emptively, just need Gemini to format the response
    const allTools = getActiveTools(business);
    const filteredTools = verificationToolResult
      ? [] // No tools when we have pre-emptive verification result
      : (intentResult.tools.length > 0
          ? allTools.filter(tool => intentResult.tools.includes(tool.function.name))
          : []); // No tools for greeting, company_info, etc.

    console.log('🔧 [WhatsApp] Tools available:', filteredTools.map(t => t.function.name));

    // Get Gemini model with tools
    const model = getGeminiModel({
      model: 'gemini-2.5-flash',
      temperature: 0.7,
      maxOutputTokens: 1500,
      tools: filteredTools.length > 0 ? filteredTools : null
    });

    // Build chat history for Gemini (don't exclude last message, we'll add it separately)
    const chatHistory = buildGeminiChatHistory(systemPrompt, history, false);

    // Start chat with history
    const chat = model.startChat({ history: chatHistory });

    // Token tracking
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Add user message to history (before sending to Gemini)
    history.push({
      role: 'user',
      content: messageBody
    });

    // Send user message to Gemini
    let result;
    let response;

    if (verificationToolResult) {
      console.log('💉 [WhatsApp] Including verification tool result in message for Gemini to interpret');

      // Pass the STRUCTURED DATA to Gemini for interpretation
      let contextMessage;

      if (verificationToolResult.verificationPending) {
        // Verification is pending - tool is asking for more info
        contextMessage = `Doğrulama gerekli. Sistem mesajı: ${verificationToolResult.message}`;
      } else if (verificationToolResult.success) {
        // Verification successful - return data
        contextMessage = `Doğrulama başarılı! Müşteri bilgileri: ${JSON.stringify(verificationToolResult.data)}`;
      } else {
        // Verification failed
        contextMessage = `Doğrulama başarısız. Structured data: ${JSON.stringify({
          validation: verificationToolResult.validation,
          context: verificationToolResult.context,
          verificationFailed: verificationToolResult.verificationFailed
        })}`;
      }

      const messageWithContext = `Kullanıcı mesajı: "${messageBody}"\n\nTool sonucu (bunu YORUMLA ve doğal yanıt üret):\n${contextMessage}`;

      result = await chat.sendMessage(messageWithContext);
      response = result.response;
    } else {
      // Normal flow: Send user message to Gemini - it will call tools when needed
      result = await chat.sendMessage(messageBody);
      response = result.response;
    }

    // Track tokens from first response
    const tokens = extractTokenUsage(response);
    totalInputTokens += tokens.inputTokens;
    totalOutputTokens += tokens.outputTokens;

    // Handle function calls (up to 3 iterations)
    let iterations = 0;
    const maxIterations = 3;

    while (iterations < maxIterations) {
      const functionCalls = response.functionCalls();

      if (!functionCalls || functionCalls.length === 0) {
        break; // No more function calls
      }

      console.log('🔧 [WhatsApp] Gemini function call:', functionCalls[0].name, functionCalls[0].args);

      // Execute the function
      const functionCall = functionCalls[0];
      const toolResult = await executeTool(functionCall.name, functionCall.args, business, {
        channel: 'WHATSAPP',
        sessionId: sessionId,
        conversationId: sessionId,
        callerPhone: phoneNumber, // WhatsApp phone number for verification
        phone: phoneNumber,
        from: phoneNumber
      });

      console.log('🔧 [WhatsApp] Tool result:', toolResult.success ? 'SUCCESS' : 'FAILED', toolResult.message?.substring(0, 100));

      // Send function response back to Gemini
      result = await chat.sendMessage([
        {
          functionResponse: {
            name: functionCall.name,
            response: {
              success: toolResult.success,
              data: toolResult.data || null,
              message: toolResult.message || toolResult.error || 'Tool executed',
              validation: toolResult.validation || null,
              context: toolResult.context || null,
              verificationFailed: toolResult.verificationFailed || false,
              notFound: toolResult.notFound || false
            }
          }
        }
      ]);
      response = result.response;

      // Track tokens from function call response
      if (response.usageMetadata) {
        totalInputTokens += response.usageMetadata.promptTokenCount || 0;
        totalOutputTokens += response.usageMetadata.candidatesTokenCount || 0;
      }

      iterations++;
    }

    let text = '';
    try {
      text = response.text() || '';
    } catch (e) {
      console.log('⚠️ [WhatsApp] Could not get text from response');
    }

    console.log('📝 [WhatsApp] Final response text:', text?.substring(0, 100));
    console.log(`📊 [WhatsApp] Token usage - Input: ${totalInputTokens}, Output: ${totalOutputTokens}`);

    // Check if any function calls were made during the conversation
    const hadFunctionCall = iterations > 0;

    // ============================================
    // ACTION CLAIM VALIDATION (ENFORCEMENT)
    // ============================================
    // Prevent AI from claiming actions without backing them with tool calls
    const actionValidation = validateActionClaim(text, hadFunctionCall, language);

    if (!actionValidation.valid) {
      console.warn('⚠️ [WhatsApp] ACTION CLAIM VIOLATION:', actionValidation.error);
      console.log('🔧 [WhatsApp] Forcing AI to correct response...');

      // Send correction prompt to Gemini
      try {
        const correctionResult = await chat.sendMessage(actionValidation.correctionPrompt);
        const correctedText = correctionResult.response.text();

        // Track tokens from correction
        if (correctionResult.response.usageMetadata) {
          totalInputTokens += correctionResult.response.usageMetadata.promptTokenCount || 0;
          totalOutputTokens += correctionResult.response.usageMetadata.candidatesTokenCount || 0;
        }

        // Use corrected text
        text = correctedText;
        console.log('✅ [WhatsApp] Response corrected:', correctedText.substring(0, 100));
      } catch (correctionError) {
        console.error('❌ [WhatsApp] Correction failed:', correctionError.message);
        // Fallback: strip action claims
        text = language === 'TR'
          ? 'Üzgünüm, bu konuda müşteri hizmetlerimize başvurmanız gerekiyor.'
          : 'I apologize, for this you need to contact our customer service.';
      }
    }

    const finalResponse = text || (language === 'TR'
      ? 'Üzgünüm, bir yanıt oluşturamadım.'
      : 'Sorry, I could not generate a response.');

    // Add AI response to history
    history.push({
      role: 'assistant',
      content: finalResponse
    });

    // Limit history size
    if (history.length > 40) {
      conversations.set(conversationKey, history.slice(-40));
    }

    // Calculate token cost based on plan
    const planName = subscription?.plan || 'FREE';
    const countryCode = business?.country || 'TR';
    const isFree = hasFreeChat(planName);

    let tokenCost = { inputCost: 0, outputCost: 0, totalCost: 0 };
    if (!isFree) {
      tokenCost = calculateTokenCost(totalInputTokens, totalOutputTokens, planName, countryCode);
    }

    console.log(`💰 [WhatsApp] Chat cost: ${tokenCost.totalCost.toFixed(6)} TL (Plan: ${planName}, Free: ${isFree})`);

    // Accumulate tokens
    const accumulatedInputTokens = (existingLog?.inputTokens || 0) + totalInputTokens;
    const accumulatedOutputTokens = (existingLog?.outputTokens || 0) + totalOutputTokens;
    const accumulatedCost = (existingLog?.totalCost || 0) + tokenCost.totalCost;

    // Save/Update ChatLog for analytics with token info
    try {
      await prisma.chatLog.upsert({
        where: { sessionId },
        update: {
          messages: history,
          messageCount: history.length,
          inputTokens: accumulatedInputTokens,
          outputTokens: accumulatedOutputTokens,
          totalCost: accumulatedCost,
          updatedAt: new Date()
        },
        create: {
          sessionId,
          businessId: business.id,
          assistantId: assistant?.id || null,
          channel: 'WHATSAPP',
          customerPhone: phoneNumber,
          messages: history,
          messageCount: history.length,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalCost: tokenCost.totalCost,
          status: 'active'
        }
      });
    } catch (logError) {
      console.error('⚠️ Failed to save WhatsApp chat log:', logError.message);
    }

    console.log(`🤖 [WhatsApp] Gemini Response for ${business.name}:`, finalResponse);
    return finalResponse;

  } catch (error) {
    console.error('❌ Error generating AI response:', error);
    return getErrorMessage(business.language);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build system prompt for the assistant
 * Uses the central promptBuilder service
 */
async function buildSystemPrompt(business, assistant) {
  const language = business?.language || 'TR';
  const timezone = business?.timezone || 'Europe/Istanbul';

  // Get current date/time for this business's timezone
  const dateTimeContext = getDateTimeContext(timezone, language);

  // Get active tools list for prompt
  const activeToolsList = getPromptBuilderTools(business, business.integrations || []);

  // Use the central prompt builder
  const basePrompt = buildAssistantPrompt(assistant || {}, business, activeToolsList);

  // Get Knowledge Base content for this business
  const knowledgeItems = await prisma.knowledgeBase.findMany({
    where: { businessId: business.id, status: 'ACTIVE' }
  });

  // Build Knowledge Base context
  let knowledgeContext = '';
  if (knowledgeItems && knowledgeItems.length > 0) {
    const kbByType = { URL: [], DOCUMENT: [], FAQ: [] };

    for (const item of knowledgeItems) {
      if (item.type === 'FAQ' && item.question && item.answer) {
        kbByType.FAQ.push(`S: ${item.question}\nC: ${item.answer}`);
      } else if (item.content) {
        kbByType[item.type]?.push(`[${item.title}]: ${item.content.substring(0, 1000)}`);
      }
    }

    if (kbByType.FAQ.length > 0) {
      knowledgeContext += '\n\n## SIK SORULAN SORULAR\n' + kbByType.FAQ.join('\n\n');
    }
    if (kbByType.URL.length > 0) {
      knowledgeContext += '\n\n## WEB SAYFASI İÇERİĞİ\n' + kbByType.URL.join('\n\n');
    }
    if (kbByType.DOCUMENT.length > 0) {
      knowledgeContext += '\n\n## DÖKÜMANLAR\n' + kbByType.DOCUMENT.join('\n\n');
    }

    console.log(`📚 [WhatsApp] Knowledge Base items added: ${knowledgeItems.length}`);
  }

  // Add KB usage instruction if knowledge base exists
  const kbInstruction = knowledgeContext ? (language === 'TR'
    ? `\n\n## BİLGİ BANKASI KULLANIM KURALLARI
Aşağıdaki bilgi bankası içeriğini AKTİF OLARAK KULLAN:
- Fiyat sorulduğunda: KB'de varsa HEMEN SÖYLE
- Özellik sorulduğunda: KB'de varsa SÖYLE
- KB'de bilgi VARSA doğrudan paylaş`
    : `\n\n## KNOWLEDGE BASE USAGE
ACTIVELY USE the knowledge base content below when answering questions.`)
    : '';

  return `${dateTimeContext}

${basePrompt}${kbInstruction}
${knowledgeContext}`;
}

/**
 * Get error message in business language
 */
function getErrorMessage(language) {
  const errorMessages = {
    'EN': 'Sorry, I\'m experiencing an issue right now. Please try again later.',
    'TR': 'Üzgünüm, şu anda bir sorun yaşıyorum. Lütfen daha sonra tekrar deneyin.',
    'ES': 'Lo siento, estoy experimentando un problema en este momento. Por favor, inténtelo de nuevo más tarde.',
    'FR': 'Désolé, je rencontre un problème en ce moment. Veuillez réessayer plus tard.',
    'DE': 'Entschuldigung, ich habe gerade ein Problem. Bitte versuchen Sie es später erneut.'
  };
  return errorMessages[language] || errorMessages['EN'];
}

/**
 * Send WhatsApp message using business credentials
 * Now routes through central whatsapp-sender.js with idempotency support
 *
 * @param {Object} business - Business object
 * @param {string} to - Recipient phone number
 * @param {string} text - Message text
 * @param {Object} options - Options
 * @param {string} options.inboundMessageId - Original webhook message ID (for idempotency)
 */
async function sendWhatsAppMessage(business, to, text, options = {}) {
  let writtenUsageKey = null;

  try {
    if (!options.skipUsageMetering && business?.id && options.inboundMessageId) {
      const subscription = await prisma.subscription.findUnique({
        where: { businessId: business.id },
        include: {
          business: {
            select: { country: true }
          }
        }
      });

      if (subscription) {
        writtenUsageKey = buildWhatsappWrittenIdempotencyKey({
          subscriptionId: subscription.id,
          inboundMessageId: options.inboundMessageId,
          phoneNumber: to
        });

        await reserveWrittenInteraction({
          subscriptionId: subscription.id,
          channel: 'WHATSAPP',
          idempotencyKey: writtenUsageKey,
          assistantId: options.assistantId || null,
          metadata: {
            inboundMessageId: options.inboundMessageId,
            phoneNumber: to
          }
        });
      }
    }

    const result = await sendWhatsAppMessageCentral(business, to, text, options);

    if (!result || result.success === false) {
      const outboundError = new Error(result?.error || 'WhatsApp outbound send failed');
      outboundError.name = 'WhatsAppSendError';
      outboundError.details = result || null;
      throw outboundError;
    }

    if (result.duplicate) {
      console.log(`♻️ [WhatsApp] Duplicate send blocked for business ${business.name}`);
    } else {
      console.log(`✅ WhatsApp message sent for business ${business.name}:`, result.messageId);
    }

    if (writtenUsageKey) {
      await commitWrittenInteraction(writtenUsageKey, {
        channel: 'WHATSAPP',
        inboundMessageId: options.inboundMessageId || null,
        providerMessageId: result.messageId || null,
        duplicate: Boolean(result.duplicate)
      });
    }

    return result;
  } catch (error) {
    if (writtenUsageKey) {
      await releaseWrittenInteraction(writtenUsageKey, 'WHATSAPP_SEND_FAILED').catch(() => null);
    }

    console.error('❌ Error sending WhatsApp message:', {
      businessId: business?.id || null,
      to,
      error: error.message,
      details: error.details || null
    });
    throw error;
  }
}

// ============================================================================
// ADMIN/TEST ENDPOINTS — Protected by auth + admin check
// ============================================================================
import { authenticateToken } from '../middleware/auth.js';
import { isAdmin } from '../middleware/adminAuth.js';

// SECURITY: All admin/test endpoints require authenticated admin session
router.use('/send', authenticateToken, isAdmin);
router.use('/conversations', authenticateToken, isAdmin);

// Manual message sending endpoint (for testing)
router.post('/send', async (req, res) => {
  const { businessId, to, message } = req.body || {};

  try {
    if (!businessId || !to || !message) {
      return res.status(400).json({ error: 'businessId, to and message required' });
    }

    const business = await prisma.business.findUnique({
      where: { id: parseInt(businessId) }
    });

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const result = await sendWhatsAppMessage(business, to, message, { skipUsageMetering: true });
    res.json({ success: true, data: result });
  } catch (error) {
    // Persist to ErrorLog
    import('../services/errorLogger.js')
      .then(({ logChatError }) => {
        logChatError(error, {
          source: 'whatsapp/send',
          businessId: parseInt(businessId) || null,
          endpoint: req.path,
          method: req.method,
        }).catch(() => {});
      })
      .catch(() => {});

    res.status(500).json({
      error: 'Failed to send message',
      details: error.message
    });
  }
});

// Clear conversation history (admin)
router.delete('/conversations/:businessId/:phoneNumber', (req, res) => {
  const { businessId, phoneNumber } = req.params;
  const conversationKey = `${businessId}:${phoneNumber}`;
  conversations.delete(conversationKey);
  res.json({ success: true, message: 'Conversation history cleared' });
});

// List active conversations (admin)
router.get('/conversations', (req, res) => {
  const activeConversations = Array.from(conversations.keys()).map(key => {
    const [businessId, phoneNumber] = key.split(':');
    return {
      businessId,
      phoneNumber,
      messageCount: conversations.get(key).length
    };
  });
  res.json({ conversations: activeConversations });
});

export default router;
