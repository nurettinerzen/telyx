/**
 * Chat Widget API - REFACTORED WITH STATE MACHINE
 *
 * New architecture:
 * - State-based conversation flow
 * - Session mapping (no PII in sessionId)
 * - Flow-based tool permissions
 * - Session-based verification
 * - Turn-based atomic state writes
 */

import express from 'express';
import prisma from '../prismaClient.js';
// getDateTimeContext, buildAssistantPrompt: handled by orchestrator Step 2 (02_prepareContext.js)
import { getActiveTools as getPromptBuilderTools } from '../services/promptBuilder.js';
import { isFreePlanExpired } from '../middleware/checkPlanExpiry.js';
import { calculateTokenCost, hasFreeChat } from '../config/plans.js';
import callAnalysis from '../services/callAnalysis.js';

// NEW: State machine services
import { getOrCreateSession, getSession } from '../services/session-mapper.js';
import { getState, updateState } from '../services/state-manager.js';
import { shouldRunIntentRouter } from '../services/router-decision.js';
// DEPRECATED: processSlotInput — LLM handles slot processing now (LLM Authority Refactor)
// Only used in handleMessageLEGACY below
import { processSlotInput } from '../services/slot-processor.js';
import { routeIntent } from '../services/intent-router.js';
import { routeMessage, handleDispute } from '../services/message-router.js';
import { isFeatureEnabled, FEATURE_FLAGS, isChatWidgetResetEnabledForBusiness } from '../config/feature-flags.js';
import { validateActionClaim } from '../services/action-claim-validator.js';
import { validateComplaintResolution, forceCallbackCreation } from '../services/complaint-enforcer.js';
import { logClassification, logRoutingDecision, logViolation, logToolExecution } from '../services/routing-metrics.js';
import { getFlow, getAllowedTools as getFlowAllowedTools } from '../config/flow-definitions.js';
import { toolRegistry } from '../services/tool-registry.js';
import { executeTool } from '../tools/index.js';
import { ToolOutcome } from '../tools/toolResult.js';
// DEPRECATED: Verification handler functions — LLM handles verification now (LLM Authority Refactor)
// needsVerification, isVerified only used in handleMessageLEGACY
import {
  needsVerification,
  isVerified,
} from '../services/verification-handler.js';

// NEW: Production guardrails
import { getToolFailResponse, validateResponseAfterToolFail, executeToolWithRetry } from '../services/tool-fail-handler.js';
import { getGatedTools, canExecuteTool } from '../services/tool-gating.js';

// SECURITY (P0): Response firewall
import { sanitizeResponse, logFirewallViolation } from '../utils/response-firewall.js';

// CORE: Channel-agnostic orchestrator (step-by-step)
import { handleIncomingMessage } from '../core/handleIncomingMessage.js';

// Gemini utils
import {
  getGeminiModel,
  buildGeminiChatHistory,
  extractTokenUsage
} from '../services/gemini-utils.js';

// Session lock & risk detection
import { isSessionLocked, getLockMessage } from '../services/session-lock.js';
import { syncPersistedAssistantReply, updateAssistantReplyInMessages } from '../services/reply-parity.js';
import {
  ASSISTANT_CHANNEL_CAPABILITIES,
  assistantHasCapability,
  resolveChatAssistantForBusiness
} from '../services/assistantChannels.js';
import { extractSessionToken, verifySessionToken } from '../security/sessionToken.js';
import { queueUnifiedResponseTrace } from '../services/trace/responseTraceLogger.js';
import { logAssistantFeedback } from '../services/operationalIncidentLogger.js';
import { classifySemanticSupportIntent } from '../services/semantic-guard-classifier.js';
import {
  buildChatWrittenIdempotencyKey,
  commitWrittenInteraction,
  isWrittenUsageBlockError,
  releaseWrittenInteraction,
  reserveWrittenInteraction
} from '../services/writtenUsageService.js';
import {
  HANDOFF_MODE,
  SUPPORT_OFFER_MODE,
  appendChatLogMessages,
  buildSystemEventMessage,
  clearSupportRoutingState,
  getLiveHandoffAcknowledgementMessage,
  getLiveSupportAvailability,
  getLiveSupportClarifyMessage,
  getLiveSupportUnavailableMessage,
  getNormalizedHandoffState,
  getSupportRoutingState,
  isChatLiveHandoffEnabled,
  requestHumanHandoff,
  setSupportRoutingPending,
  shouldTriggerHumanHandoff,
} from '../services/liveHandoff.js';

const router = express.Router();

function buildWrittenUsageErrorResponse(language = 'TR', error) {
  const isEnglish = String(language || '').toUpperCase() === 'EN';
  const insufficientBalance = error?.code === 'INSUFFICIENT_BALANCE';
  return {
    status: insufficientBalance ? 402 : 403,
    body: {
      error: insufficientBalance
        ? (isEnglish ? 'Insufficient wallet balance for written support usage.' : 'Yazili destek kullanimi icin bakiye yetersiz.')
        : (isEnglish ? 'Written support limit reached for this plan.' : 'Bu paket icin yazili destek limiti doldu.'),
      code: error?.code || 'WRITTEN_USAGE_BLOCKED',
      upgradeRequired: !insufficientBalance
    }
  };
}

/**
 * Dashboard preview detection: validate JWT token and check business ownership.
 * Used to bypass chatWidgetEnabled/trial checks for authenticated dashboard users
 * previewing their own widget.
 */
async function _isDashboardPreview(req, businessId) {
  try {
    const token = extractSessionToken(req);
    if (!token) return false;

    const decoded = verifySessionToken(token);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { businessId: true }
    });

    // Only bypass for the user's OWN business
    return user?.businessId === businessId;
  } catch {
    return false;
  }
}

async function resolveWidgetContext({ embedKey, assistantId, req }) {
  let business = null;
  let assistant = null;

  if (embedKey) {
    business = await prisma.business.findUnique({
      where: { chatEmbedKey: embedKey },
      include: {
        assistants: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' }
        },
        integrations: { where: { isActive: true } },
        crmWebhook: true
      }
    });

    if (!business) {
      const error = new Error('Invalid embed key');
      error.statusCode = 404;
      throw error;
    }

    if (!business.chatWidgetEnabled) {
      const isDashboardPreview = await _isDashboardPreview(req, business.id);
      if (!isDashboardPreview) {
        const error = new Error('Chat widget is disabled');
        error.statusCode = 403;
        throw error;
      }
      console.log('🔓 [Widget] Dashboard preview bypass — chatWidgetEnabled check skipped');
    }

    const resolved = await resolveChatAssistantForBusiness({
      prisma,
      business,
      allowAutoCreate: true
    });

    assistant = resolved.assistant;

    if (!assistant) {
      const error = new Error('No chat-capable assistant found');
      error.statusCode = 404;
      throw error;
    }

    if (resolved.createdFallback) {
      console.log(`🆕 [Widget] Auto-created fallback chat assistant for business ${business.id}`);
    }
  } else {
    const requestedAssistant = await prisma.assistant.findFirst({
      where: {
        id: assistantId,
        isActive: true
      },
      include: {
        business: {
          include: {
            assistants: {
              where: { isActive: true },
              orderBy: { createdAt: 'desc' }
            },
            integrations: { where: { isActive: true } },
            crmWebhook: true
          }
        }
      }
    });

    if (!requestedAssistant) {
      const error = new Error('Assistant not found');
      error.statusCode = 404;
      throw error;
    }

    business = requestedAssistant.business;

    if (!business.chatWidgetEnabled) {
      const isDashboardPreview = await _isDashboardPreview(req, business.id);
      if (!isDashboardPreview) {
        const error = new Error('Chat widget is disabled');
        error.statusCode = 403;
        throw error;
      }
      console.log('🔓 [Widget] Dashboard preview bypass (assistantId) — chatWidgetEnabled check skipped');
    }

    if (assistantHasCapability(requestedAssistant, ASSISTANT_CHANNEL_CAPABILITIES.CHAT)) {
      assistant = requestedAssistant;
    } else {
      const resolved = await resolveChatAssistantForBusiness({
        prisma,
        business,
        allowAutoCreate: true
      });

      assistant = resolved.assistant;

      if (!assistant) {
        const error = new Error('No chat-capable assistant found');
        error.statusCode = 404;
        throw error;
      }

      console.warn(`⚠️ [Widget] Requested assistant ${requestedAssistant.id} is not chat-capable. Using ${assistant.id} instead.`);
    }
  }

  return {
    business,
    assistant: assistant ? { ...assistant, business } : null,
  };
}

function buildInternalChatHandoffEvent(content, metadata = {}) {
  return buildSystemEventMessage(content, {
    visibility: 'internal',
    ...metadata,
  });
}

function buildPublicWidgetHistory(messages = []) {
  return (Array.isArray(messages) ? messages : []).filter((message) => {
    if (message?.role !== 'system') return true;
    return message?.metadata?.visibility === 'customer';
  });
}

const PLACEHOLDER_REGEX = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
const PLACEHOLDER_DROP_KEYS = new Set([
  'customer_name',
  'customer',
  'name',
  'order_id',
  'order_number',
  'phone',
  'email'
]);
const PUBLIC_EMAIL_PATTERN = /\b[a-zA-Z0-9._%+-]{3,}@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;

function collectPublicContactEmails(business = {}) {
  const emails = new Set();

  const addEmailsFromValue = (value) => {
    if (typeof value !== 'string') return;
    const matches = value.match(PUBLIC_EMAIL_PATTERN) || [];
    for (const match of matches) {
      emails.add(match.trim().toLowerCase());
    }
  };

  const visit = (value) => {
    if (!value) return;
    if (typeof value === 'string') {
      addEmailsFromValue(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value === 'object') {
      for (const nested of Object.values(value)) visit(nested);
    }
  };

  addEmailsFromValue(business?.emailIntegration?.email);
  visit(business?.helpLinks);

  return [...emails];
}

function sanitizeChatReplyPlaceholders(reply, language = 'TR') {
  if (typeof reply !== 'string' || reply.length === 0) {
    return reply;
  }

  if (!reply.includes('{{')) {
    return reply;
  }

  const segments = reply.match(/[^.!?\n]+[.!?]?/g) || [reply];
  const cleanedSegments = [];

  for (const segment of segments) {
    PLACEHOLDER_REGEX.lastIndex = 0;
    const matches = [...segment.matchAll(PLACEHOLDER_REGEX)];
    if (matches.length === 0) {
      const safeSegment = segment.trim();
      if (safeSegment) cleanedSegments.push(safeSegment);
      continue;
    }

    const shouldDrop = matches.some((match) => PLACEHOLDER_DROP_KEYS.has(String(match[1] || '').toLowerCase()));
    if (shouldDrop) {
      continue;
    }

    PLACEHOLDER_REGEX.lastIndex = 0;
    const cleaned = segment
      .replace(PLACEHOLDER_REGEX, '')
      .replace(/\{\{|\}\}/g, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.;!?])/g, '$1')
      .trim();

    if (cleaned) {
      cleanedSegments.push(cleaned);
    }
  }

  const sanitized = cleanedSegments
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .trim();

  if (sanitized.length > 0) {
    return sanitized;
  }

  return language === 'TR'
    ? 'Merhaba! Size nasıl yardımcı olabilirim?'
    : 'Hello! How can I help you today?';
}

/**
 * Main message handler with state machine
 * NOW USES CORE ORCHESTRATOR (step-by-step pipeline)
 */
async function handleMessage(sessionId, businessId, userMessage, language, business, assistant, timezone, clientSessionId, requestId = null) {
  console.log(`\n📨 [Chat Adapter] Delegating to core orchestrator with sessionId: ${sessionId}`);

  // Call core orchestrator (step-by-step pipeline)
  // CRITICAL: Pass sessionId to prevent orchestrator from creating new session
  const result = await handleIncomingMessage({
    channel: 'CHAT',
    business,
    assistant,
    channelUserId: clientSessionId || `temp_${Date.now()}`,
    sessionId, // CRITICAL: Prevent bypass by passing existing sessionId
    messageId: `chat_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    userMessage,
    language,
    timezone: timezone || 'Europe/Istanbul',
    metadata: {
      businessId,
      requestId
    }
  });

  return {
    reply: result.reply,
    outcome: result.outcome || ToolOutcome.OK,
    locked: result.locked,
    lockReason: result.lockReason,
    lockUntil: result.lockUntil,
    inputTokens: result.inputTokens || 0,
    outputTokens: result.outputTokens || 0,
    toolsCalled: result.toolsCalled || [],
    metadata: result.metadata || {},
    metrics: result.metrics || {},
    state: result.state || null,
    traceContext: result.traceContext || null,
    traceId: result.traceId || null
  };
}

/**
 * LEGACY: Old handleMessage implementation (kept for reference, delete after validation)
 */
async function handleMessageLEGACY(sessionId, businessId, userMessage, systemPrompt, conversationHistory, language, business) {
  if (process.env.ENABLE_LEGACY_CHAT_HANDLER !== 'true') {
    throw new Error('LEGACY_HANDLER_DISABLED');
  }

  console.log(`\n📨 [HandleMessage] Session: ${sessionId}, Message: "${userMessage.substring(0, 50)}..."`);

  // 1. Get current state
  let state = await getState(sessionId);
  console.log(`📊 [State] Current:`, {
    activeFlow: state.activeFlow,
    flowStatus: state.flowStatus,
    expectedSlot: state.expectedSlot,
    verification: state.verification?.status
  });

  // Store businessId in state if not present
  if (!state.businessId) {
    state.businessId = businessId;
  }

  // 2. DECISION: Should we run intent router?
  // NEW: Use message-router for intelligent routing (feature flag)
  let runRouter = false;
  let routedThisTurn = false; // Track if router just started/changed flow this turn
  let messageRouting = null;

  if (isFeatureEnabled('USE_MESSAGE_TYPE_ROUTING')) {
    console.log('🚩 [Feature] Message-type routing ENABLED');

    // Get last assistant message from history
    const lastAssistantMessage = conversationHistory
      .slice()
      .reverse()
      .find(msg => msg.role === 'assistant')?.content || '';

    // Use new message router
    messageRouting = await routeMessage(userMessage, state, lastAssistantMessage, language, business);

    // Log classification metrics
    logClassification({
      sessionId,
      messageType: messageRouting.messageType,
      state,
      userMessage,
      lastAssistantMessage
    });

    // Handle different routing decisions
    if (messageRouting.routing.action === 'HANDLE_DISPUTE') {
      console.log('⚠️ [Router] DISPUTE detected - converting to COMPLAINT flow');

      // User disputes result - convert to complaint
      const disputeResult = await handleDispute(userMessage, state, language, business);

      // Start complaint flow with context
      const flow = getFlow('COMPLAINT');
      state.activeFlow = flow.name;
      state.flowStatus = 'in_progress';
      state.collectedSlots = {};
      state.allowedTools = flow.allowedTools;
      state.expectedSlot = flow.requiredSlots[0];

      // Preserve anchor if requested
      if (messageRouting.routing.preserveAnchor !== false) {
        // Keep anchor data
      } else {
        // Clear anchor
        state.anchor = {
          order_number: null,
          customer_id: null,
          phone: null,
          lastFlowType: null,
          lastResult: null
        };
      }

      routedThisTurn = true;
      console.log(`✅ [Flow] Started COMPLAINT (from dispute), Expected slot: ${state.expectedSlot}`);

      // Log routing decision
      logRoutingDecision({
        sessionId,
        routing: messageRouting.routing,
        triggerRule: messageRouting.messageType.triggerRule,
        state: { activeFlow: state.activeFlow, flowStatus: state.flowStatus },
        newFlow: 'COMPLAINT',
        newFlowStatus: 'in_progress'
      });

    } else if (messageRouting.routing.action === 'RUN_INTENT_ROUTER') {
      runRouter = true;

    } else if (messageRouting.routing.action === 'ACKNOWLEDGE_CHATTER') {
      console.log('💬 [Router] CHATTER detected - letting Gemini handle naturally');
      // Don't run router, don't process slot - just let Gemini respond
      runRouter = false;

    } else if (messageRouting.routing.action === 'PROCESS_SLOT') {
      // Will be handled in slot processing section
      runRouter = false;
    }

  } else {
    // Old behavior: use shouldRunIntentRouter
    console.log('🚩 [Feature] Message-type routing DISABLED (legacy mode)');
    runRouter = shouldRunIntentRouter(state, userMessage);
  }

  if (runRouter) {
    console.log('🎯 [Router] Running intent detection');

    // Run intent router
    const intentResult = await routeIntent(userMessage, conversationHistory, language);
    console.log('🎯 [Router] Result:', intentResult.intent, 'Confidence:', intentResult.confidence);

    // Get flow definition
    let flow = getFlow(intentResult.intent);
    if (!flow) {
      console.warn(`⚠️ [Router] Unknown intent: ${intentResult.intent}, defaulting to GENERAL`);
      flow = getFlow('GENERAL');
    }

    // Start new flow
    state.activeFlow = flow.name;
    state.flowStatus = 'in_progress';
    state.collectedSlots = {};
    state.allowedTools = flow.allowedTools;

    // Set expected slot if flow has required slots
    if (flow.requiredSlots && flow.requiredSlots.length > 0) {
      state.expectedSlot = flow.requiredSlots[0];
    } else {
      state.expectedSlot = null;
    }

    routedThisTurn = true; // Mark that we just started a flow
    console.log(`✅ [Flow] Started: ${flow.name}, Expected slot: ${state.expectedSlot}`);
  } else if (!messageRouting || messageRouting.routing.action !== 'HANDLE_DISPUTE') {
    console.log('⏭️ [Router] Skipping (flow in progress or slot expected)');
  }

  // 3. Slot filling (if expected AND router didn't just run)
  let shouldProcessSlot = state.expectedSlot && !routedThisTurn;

  // NEW: Feature flag - only process if message type is SLOT_ANSWER
  if (isFeatureEnabled('USE_MESSAGE_TYPE_ROUTING') && shouldProcessSlot) {
    if (messageRouting && messageRouting.messageType.type !== 'SLOT_ANSWER') {
      console.log(`⏭️ [Slot] Skipping - message type is ${messageRouting.messageType.type}, not SLOT_ANSWER`);
      shouldProcessSlot = false;
    }
  }

  if (routedThisTurn) {
    console.log(`⏭️ [Slot] Skipping slot processing (flow just started this turn)`);
  }

  if (shouldProcessSlot) {
    console.log(`🎰 [Slot] Processing input for: ${state.expectedSlot}`);

    // Pass state for loop guard
    const slotResult = processSlotInput(state.expectedSlot, userMessage, state);

    // Check for loop escalation
    if (slotResult.escalate) {
      console.error('🚫 [Loop Guard] Escalating to human handoff');

      // Clear expected slot to break loop
      state.expectedSlot = null;
      state.flowStatus = 'paused';
      state.pauseReason = 'loop_detected';

      await updateState(sessionId, state);

      return {
        reply: slotResult.hint,
        inputTokens: 0,
        outputTokens: 0
      };
    }

    if (slotResult.filled) {
      // Slot filled successfully
      console.log(`✅ [Slot] Filled: ${slotResult.slot} = ${slotResult.value}`);
      state.collectedSlots[slotResult.slot] = slotResult.value;
      state.expectedSlot = null;

      // Reset attempt counter on success
      if (state.slotAttempts[state.expectedSlot]) {
        delete state.slotAttempts[state.expectedSlot];
      }

      // Check if more required slots needed
      const flow = getFlow(state.activeFlow);
      const remainingSlots = flow.requiredSlots.filter(
        slot => !Object.keys(state.collectedSlots).some(k =>
          k.toLowerCase() === slot.toLowerCase().replace(/_/g, '')
        )
      );

      if (remainingSlots.length > 0) {
        state.expectedSlot = remainingSlots[0];
        console.log(`🎰 [Slot] Next required slot: ${state.expectedSlot}`);

        // Generate slot request message
        const slotMessages = {
          order_number: language === 'TR' ? 'Sipariş numaranızı öğrenebilir miyim?' : 'May I have your order number?',
          ticket_number: language === 'TR' ? 'Arıza/servis numaranızı alabilir miyim?' : 'May I have your ticket number?',
          name: language === 'TR' ? 'İsminizi ve soyisminizi alabilir miyim?' : 'May I have your full name?',
          phone: language === 'TR' ? 'Telefon numaranızı alabilir miyim?' : 'May I have your phone number?',
          complaint_details: language === 'TR' ? 'Şikayetinizi detaylı anlatır mısınız?' : 'Please describe your complaint in detail.',
        };

        const slotMessage = slotMessages[state.expectedSlot] || (language === 'TR' ? 'Lütfen bilgi verin.' : 'Please provide information.');

        // Update state and return slot request
        await updateState(sessionId, state);

        return {
          reply: slotMessage,
          inputTokens: 0,
          outputTokens: 0,
        };
      }
    } else {
      // Slot not filled - provide hint
      console.log(`❌ [Slot] Not filled: ${slotResult.error}`);

      // Increment attempt counter for loop guard
      if (!state.slotAttempts[state.expectedSlot]) {
        state.slotAttempts[state.expectedSlot] = 0;
      }
      state.slotAttempts[state.expectedSlot]++;
      console.log(`🔁 [Loop Guard] Slot "${state.expectedSlot}" attempt: ${state.slotAttempts[state.expectedSlot]}`);

      // Update state (increment message count + attempt)
      await updateState(sessionId, state);

      return {
        reply: slotResult.hint,
        inputTokens: 0,
        outputTokens: 0,
      };
    }
  }

  // 4. Verification will be handled at TOOL EXECUTION time (not at flow start)
  // Tools like customer_data_lookup will check verification when actually accessing data
  const flow = getFlow(state.activeFlow);

  // 4.5 GUARDRAIL: Confidence-based tool gating
  const classifierConfidence = messageRouting?.messageType?.confidence || 0.9;
  const originalAllowedTools = state.allowedTools || [];

  // Apply gating based on classifier confidence
  const gatedTools = getGatedTools(classifierConfidence, state.activeFlow, originalAllowedTools);

  console.log(`🛡️ [ToolGating] Confidence: ${classifierConfidence.toFixed(2)} → Gated tools:`, gatedTools);

  // Update state with gated tools
  state.allowedTools = gatedTools;

  // 5. All slots collected → Call Gemini
  console.log('🤖 [Gemini] Preparing request with allowed tools:', state.allowedTools);

  // Get allowed tool definitions
  const allowedToolDefs = toolRegistry.pick(state.allowedTools);
  console.log('🔧 [Tools] Allowed tool definitions:', allowedToolDefs.map(t => t.function.name));

  // Get Gemini model with allowed tools
  const model = getGeminiModel({
    model: 'gemini-2.5-flash',
    temperature: 0.7,
    maxOutputTokens: 1500,
    tools: allowedToolDefs.length > 0 ? allowedToolDefs : null
  });

  // Build conversation history
  const chatHistory = buildGeminiChatHistory(systemPrompt, conversationHistory, true);

  // Start chat
  const chat = model.startChat({ history: chatHistory });

  // Token tracking
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Send user message
  let result = await chat.sendMessage(userMessage);
  let response = result.response;

  // Track tokens
  const initialTokens = extractTokenUsage(response);
  totalInputTokens += initialTokens.inputTokens;
  totalOutputTokens += initialTokens.outputTokens;

  // Handle function calls
  let iterations = 0;
  const maxIterations = 3;
  const toolsCalled = []; // Track which tools were called (for complaint enforcement)
  let hadToolSuccess = false; // Track if ANY tool succeeded (for action claim validation)

  while (iterations < maxIterations) {
    const functionCalls = response.functionCalls();

    if (!functionCalls || functionCalls.length === 0) {
      break;
    }

    const functionCall = functionCalls[0];
    // SECURITY: Don't log full args (may contain PII)
    console.log('🔧 [Gemini] Function call:', functionCall.name, 'argCount:', Object.keys(functionCall.args || {}).length);

    // SECURITY GATE 1: Tool must be in allowedTools
    if (!state.allowedTools.includes(functionCall.name)) {
      console.warn(`🚫 [Security] Tool ${functionCall.name} NOT in allowedTools:`, state.allowedTools);

      // Send error back to Gemini
      result = await chat.sendMessage([{
        functionResponse: {
          name: functionCall.name,
          response: {
            success: false,
            error: 'TOOL_NOT_ALLOWED',
            message: language === 'TR'
              ? 'Bu işlem şu anda kullanılamıyor.'
              : 'This operation is not available right now.'
          }
        }
      }]);
      response = result.response;

      const tokens = extractTokenUsage(response);
      totalInputTokens += tokens.inputTokens;
      totalOutputTokens += tokens.outputTokens;

      iterations++;
      continue;
    }

    // SECURITY GATE 2: Removed - Verification now handled inside tool handler
    // Tool (e.g. customer_data_lookup) will check verification when accessing data

    // GUARDRAIL: Runtime tool gating check
    const toolGateCheck = canExecuteTool(functionCall.name, {
      confidence: messageRouting?.messageType?.confidence || 0.9,
      activeFlow: state.activeFlow,
      verificationStatus: state.verification?.status || 'none'
    });

    if (!toolGateCheck.allowed) {
      console.error('🚫 [ToolGate] Tool blocked:', toolGateCheck.reason);

      // Return forced template (don't let LLM decide)
      const forcedResponse = getToolFailResponse(functionCall.name, language, 'CHAT');
      await updateState(sessionId, state);

      return {
        reply: forcedResponse.reply,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        hadToolFailure: true
      };
    }

    // Execute tool with retry + metrics
    const startTime = Date.now();
    const toolExecutor = async (name, args) => {
      return executeTool(name, args, business, {
        channel: 'CHAT',
        sessionId: sessionId,
        conversationId: sessionId,
        intent: state.activeFlow,
        requiresVerification: flow?.requiresVerification || false
      });
    };

    const toolResult = await executeToolWithRetry(
      toolExecutor,
      functionCall.name,
      functionCall.args,
      1 // Max 1 retry for critical tools
    );

    const executionTime = Date.now() - startTime;

    console.log('🔧 [Tool] Result:', toolResult.success ? 'SUCCESS' : 'FAILED');

    // Log tool execution metrics
    logToolExecution({
      sessionId,
      toolName: functionCall.name,
      success: toolResult.success,
      attempts: toolResult.attempts || 1,
      errorType: toolResult.error || null,
      executionTime
    });

    // Track tool call (for complaint enforcement)
    toolsCalled.push(functionCall.name);
    if (toolResult.success) {
      hadToolSuccess = true; // Track at least one success
    }

    // GUARDRAIL: If tool failed, return forced template (DON'T let LLM make up response)
    if (!toolResult.success) {
      console.error('❌ [Tool] Failed, returning forced template');

      // Log violation
      logViolation('TOOL_FAILURE', {
        sessionId,
        details: {
          tool: functionCall.name,
          error: toolResult.error,
          attempts: toolResult.attempts
        }
      });

      const forcedResponse = getToolFailResponse(functionCall.name, language, 'CHAT');
      await updateState(sessionId, state);

      return {
        reply: forcedResponse.reply,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        hadToolFailure: true
      };
    }

    // HANDLE VERIFICATION_REQUIRED OUTCOME FROM TOOL
    if (toolResult.outcome === ToolOutcome.VERIFICATION_REQUIRED) {
      console.log('🔐 [Tool] Verification required, starting verification flow');
      console.log('🔐 [Tool] AskFor:', toolResult.data?.askFor);

      // Update state to start verification
      state.verification.status = 'pending';
      state.verification.pendingField = toolResult.data?.askFor || 'name';
      state.verification.attempts = 0;
      state.verification.anchor = toolResult.data?.anchor;

      console.log('🔐 [Verification] State updated to pending, field:', toolResult.data?.askFor);

      // Generate verification request message
      const verificationMessages = {
        name: language === 'TR'
          ? 'Kimlik doğrulaması için adınızı ve soyadınızı alabilir miyim?'
          : 'For verification, may I have your full name?',
        phone: language === 'TR'
          ? 'Kimlik doğrulaması için telefon numaranızı alabilir miyim?'
          : 'For verification, may I have your phone number?',
        email: language === 'TR'
          ? 'Kimlik doğrulaması için e-posta adresinizi alabilir miyim?'
          : 'For verification, may I have your email?'
      };

      const verificationMessage = verificationMessages[toolResult.data?.askFor] || toolResult.message;

      // Update state and return verification request
      await updateState(sessionId, state);

      return {
        reply: verificationMessage,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens
      };
    }

    // Send result back to Gemini
    result = await chat.sendMessage([{
      functionResponse: {
        name: functionCall.name,
        response: {
          success: toolResult.success,
          data: toolResult.data || null,
          message: toolResult.message || toolResult.error || 'Tool executed',
          context: toolResult.context || null
        }
      }
    }]);
    response = result.response;

    // Track tokens
    const tokens = extractTokenUsage(response);
    totalInputTokens += tokens.inputTokens;
    totalOutputTokens += tokens.outputTokens;

    // If tool executed successfully, mark flow as resolved
    if (toolResult.success) {
      state.flowStatus = 'resolved';
      console.log('✅ [Flow] Marked as resolved');

      // NEW: Set anchor data for follow-up/dispute handling
      if (isFeatureEnabled('USE_POST_RESULT_STATE')) {
        // CRITICAL: Use structured truth from tool, NOT LLM text!
        const truth = toolResult.truth || {};

        state.anchor = {
          order_number: state.collectedSlots.order_number || state.collectedSlots.orderNumber || truth.order?.orderNumber || null,
          customer_id: state.verification?.customerId || null,
          phone: state.collectedSlots.phone || state.verification?.collected?.phone || truth.phone || null,
          lastFlowType: state.activeFlow,
          // Store structured truth (for contradiction detection)
          truth: truth,
          // Store LLM text separately (for context only, NOT for routing!)
          lastResultText: text?.substring(0, 200) || null
        };
        state.flowStatus = 'post_result'; // Enter post-result grace period
        state.postResultTurns = 0;
        console.log('📍 [Flow] Anchor set with truth:', {
          flowType: state.anchor.lastFlowType,
          dataType: truth.dataType,
          orderStatus: truth.order?.status
        });
      }
    }

    iterations++;
  }

  // ============================================
  // COMPLAINT FLOW ENFORCEMENT
  // ============================================
  // Ensure COMPLAINT flow called create_callback
  if (isFeatureEnabled('ENFORCE_COMPLAINT_CALLBACK')) {
    const complaintValidation = validateComplaintResolution(
      state.activeFlow,
      state.flowStatus === 'resolved' || state.flowStatus === 'post_result',
      toolsCalled
    );

    if (!complaintValidation.valid) {
      console.error('🚫 [Enforcer] COMPLAINT VIOLATION:', complaintValidation.error);
      console.log('🔧 [Enforcer] Forcing create_callback...');

      // Log violation
      logViolation('COMPLAINT_NO_CALLBACK', {
        sessionId,
        details: {
          flow: state.activeFlow,
          toolsCalled: toolsCalled.join(', '),
          error: complaintValidation.error
        },
        resolved: false
      });

      // Force callback creation
      const forcedCallbackResult = await forceCallbackCreation(state, business, executeTool);

      if (forcedCallbackResult.success) {
        console.log('✅ [Enforcer] Callback created successfully');
        // Mark that we called the tool
        toolsCalled.push('create_callback');

        // Log as resolved
        logViolation('COMPLAINT_NO_CALLBACK', {
          sessionId,
          details: { forced: true, callbackRef: forcedCallbackResult.data?.reference },
          resolved: true
        });
      } else {
        console.error('❌ [Enforcer] Failed to create callback');

        // Log as unresolved
        logViolation('COMPLAINT_NO_CALLBACK', {
          sessionId,
          details: { forced: false, error: forcedCallbackResult.error },
          resolved: false
        });
      }
    }
  }

  // Get final text
  let text = '';
  try {
    text = response.text() || '';
  } catch (e) {
    console.warn('⚠️ Could not get text from response');
  }

  console.log('📝 [Gemini] Final response:', text.substring(0, 100));

  // 5.5 GUARDRAIL: Tool fail validation (CRITICAL - runs BEFORE action claim check)
  const toolFailValidation = validateResponseAfterToolFail(text, hadToolSuccess, language);

  if (!toolFailValidation.valid) {
    console.error('🚨 [CRITICAL] LLM made action claim after tool failure!');

    // Log critical violation
    logViolation('ACTION_CLAIM_AFTER_TOOL_FAIL', {
      sessionId,
      details: {
        originalText: text?.substring(0, 200),
        violationType: toolFailValidation.violationType,
        hadToolSuccess
      }
    });

    // HARD BLOCK: Use forced response
    text = toolFailValidation.forcedResponse;
  }

  // 5.6 ACTION CLAIM VALIDATION (if enabled)
  if (isFeatureEnabled('ENFORCE_ACTION_CLAIMS')) {
    const hadToolCalls = iterations > 0; // If we had function call iterations
    const actionValidation = validateActionClaim(text, hadToolCalls, language);

    if (!actionValidation.valid) {
      console.warn('⚠️ [Validation] ACTION CLAIM VIOLATION:', actionValidation.error);
      console.log('🔧 [Validation] Forcing AI to correct response...');

      // Log violation
      logViolation('ACTION_CLAIM', {
        sessionId,
        details: {
          originalText: text?.substring(0, 200),
          error: actionValidation.error,
          claimedAction: actionValidation.claimedAction
        },
        resolved: false // Will update after correction
      });

      // Send correction prompt
      try {
        const correctionResult = await chat.sendMessage(actionValidation.correctionPrompt);
        const correctedText = correctionResult.response.text();

        // Track tokens
        const correctionTokens = extractTokenUsage(correctionResult.response);
        totalInputTokens += correctionTokens.inputTokens;
        totalOutputTokens += correctionTokens.outputTokens;

        text = correctedText;
        console.log('✅ [Validation] Response corrected:', correctedText.substring(0, 100));

        // Log as resolved
        logViolation('ACTION_CLAIM', {
          sessionId,
          details: { correctedText: correctedText.substring(0, 200) },
          resolved: true
        });
      } catch (correctionError) {
        console.error('❌ [Validation] Correction failed:', correctionError.message);
        text = language === 'TR'
          ? 'Üzgünüm, bu konuda müşteri hizmetlerimize başvurmanız gerekiyor.'
          : 'I apologize, for this you need to contact our customer service.';

        // Log as unresolved
        logViolation('ACTION_CLAIM', {
          sessionId,
          details: { correctionFailed: true, error: correctionError.message },
          resolved: false
        });
      }
    }
  }

  // 6. Post-result turn management
  if (state.flowStatus === 'post_result') {
    state.postResultTurns++;
    console.log(`🔄 [Post-result] Turn ${state.postResultTurns}/3`);

    // After 3 turns, exit post-result grace period
    if (state.postResultTurns >= 3) {
      console.log('✅ [Post-result] Grace period ended - resetting to idle');
      state.flowStatus = 'idle';
      state.activeFlow = null;
      state.anchor = {
        order_number: null,
        customer_id: null,
        phone: null,
        lastFlowType: null,
        truth: null,
        lastResultText: null
      };
      state.postResultTurns = 0;
    }
  }

  // 7. Update state (turn-based atomic write)
  await updateState(sessionId, state);

  console.log('💾 [State] Updated and saved');

  return {
    reply: text,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens
  };
}

/**
 * GET /api/chat/widget/session - Poll the latest public-safe widget transcript state
 */
router.get('/widget/session', async (req, res) => {
  try {
    const { embedKey, assistantId, sessionId: clientSessionId } = req.query;

    if (!clientSessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    if (!embedKey && !assistantId) {
      return res.status(400).json({ error: 'embedKey or assistantId is required' });
    }

    const { business, assistant } = await resolveWidgetContext({
      embedKey,
      assistantId,
      req,
    });

    const resolvedSessionId = await getSession(business.id, 'CHAT', String(clientSessionId));
    if (!resolvedSessionId) {
      return res.json({
        success: true,
        found: false,
        conversationId: null,
        sessionId: String(clientSessionId),
        history: [],
        handoff: getNormalizedHandoffState(),
      });
    }

    const [chatLog, state] = await Promise.all([
      prisma.chatLog.findFirst({
        where: {
          sessionId: resolvedSessionId,
          businessId: business.id,
        },
        select: {
          status: true,
          messages: true,
          updatedAt: true,
        }
      }),
      getState(resolvedSessionId),
    ]);

    res.json({
      success: true,
      found: Boolean(chatLog),
      conversationId: resolvedSessionId,
      sessionId: String(clientSessionId),
      assistantName: assistant?.name || null,
      status: chatLog?.status || 'active',
      history: buildPublicWidgetHistory(chatLog?.messages || []),
      handoff: getNormalizedHandoffState(state),
      updatedAt: chatLog?.updatedAt || null,
    });
  } catch (error) {
    console.error('❌ Widget session state error:', error);
    res.status(error.statusCode || 500).json({
      error: error.message || 'Failed to load widget conversation state',
    });
  }
});

/**
 * POST /api/chat/widget - Main chat endpoint
 */
router.post('/widget', async (req, res) => {
  const _widgetStart = Date.now();
  console.log('\n\n🆕 ========== NEW CHAT REQUEST ==========');
  console.log('📨 Chat request received', {
    hasEmbedKey: Boolean(req.body?.embedKey),
    hasAssistantId: Boolean(req.body?.assistantId),
    hasSessionId: Boolean(req.body?.sessionId),
    messageLength: typeof req.body?.message === 'string' ? req.body.message.length : 0,
  });

  let business = null;
  let clientSessionId = null;
  let writtenUsageKey = null;

  try {
    const { embedKey, assistantId, sessionId: requestSessionId, message } = req.body;
    clientSessionId = requestSessionId || null;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    if (!embedKey && !assistantId) {
      return res.status(400).json({ error: 'embedKey or assistantId is required' });
    }

    // Get assistant and business
    let _t = Date.now();
    const resolvedContext = await resolveWidgetContext({
      embedKey,
      assistantId,
      req,
    });

    business = resolvedContext.business;
    let assistant = resolvedContext.assistant;

    if (!assistant || !business) {
      return res.status(404).json({ error: 'Assistant not found' });
    }

    const language = business?.language || 'TR';
    const timezone = business?.timezone || 'Europe/Istanbul';
    console.log(`⏱️ [Widget] DB assistant+business: ${Date.now() - _t}ms`); _t = Date.now();

    // Check subscription
    const subscription = await prisma.subscription.findUnique({
      where: { businessId: business.id },
      include: { business: true }
    });

    console.log(`⏱️ [Widget] DB subscription: ${Date.now() - _t}ms`); _t = Date.now();

    if (subscription && isFreePlanExpired(subscription)) {
      const isDashboardPreview = await _isDashboardPreview(req, business.id);
      if (!isDashboardPreview) {
        console.log('🚫 Trial expired');
        return res.status(403).json({
          error: language === 'TR'
            ? 'Deneme süreniz doldu. Lütfen bir plan seçin.'
            : 'Your trial has expired. Please choose a plan.',
          expired: true
        });
      }
      console.log('🔓 [Widget] Dashboard preview bypass — trial expiry check skipped');
    }

    // ===== ROUTE-LEVEL GUARD: CHECK SESSION LOCK =====
    // GUARD 1: Check if session is locked
    // NEW: Get or create universal session ID
    // WARN: temp_ fallback creates a new session every request — avoid this by ensuring
    // the widget always sends a stable clientSessionId (persisted in localStorage).
    if (!clientSessionId) {
      console.warn('⚠️ [Session] No clientSessionId from widget — using temp fallback. Anti-repeat may not work.');
    }
    const sessionId = await getOrCreateSession(business.id, 'CHAT', clientSessionId || `temp_${Date.now()}`);
    console.log(`🔑 [Session] Universal ID: ${sessionId}, Client ID: ${clientSessionId || '(temp)'}`);
    console.log(`⏱️ [Widget] Session create: ${Date.now() - _t}ms`); _t = Date.now();

    const lockStatus = await isSessionLocked(sessionId);
    if (lockStatus.locked) {
      console.log(`🔒 [Chat Guard] Session ${sessionId} is LOCKED (${lockStatus.reason})`);

      const lockMsg = getLockMessage(lockStatus.reason, language);
      return res.json({
        reply: lockMsg,
        outcome: ToolOutcome.DENIED,
        locked: true,
        lockReason: lockStatus.reason,
        lockUntil: lockStatus.until,
        conversationId: sessionId,
        sessionId: clientSessionId || sessionId,
        metadata: {
          outcome: ToolOutcome.DENIED,
          lockReason: lockStatus.reason
        }
      });
    }

    console.log(`⏱️ [Widget] Security guards: ${Date.now() - _t}ms`); _t = Date.now();

    let state = null;
    let handoff = getNormalizedHandoffState();
    let supportRouting = getSupportRoutingState();
    if (isChatLiveHandoffEnabled()) {
      state = await getState(sessionId);
      handoff = getNormalizedHandoffState(state);
      supportRouting = getSupportRoutingState(state);
    }

    const userTranscriptMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };

    if (isChatLiveHandoffEnabled()) {
      const liveSupportAvailability = await getLiveSupportAvailability({
        businessId: business.id,
        timezone,
      });

      let semanticSupportIntent = null;
      if (handoff.mode === HANDOFF_MODE.AI) {
        try {
          semanticSupportIntent = await classifySemanticSupportIntent(message, language, {
            supportChoicePending: supportRouting.pendingChoice,
            supportOfferMode: supportRouting.offerMode,
            liveSupportAvailable: liveSupportAvailability.available,
          });
        } catch (supportIntentError) {
          console.error('⚠️ [ChatWidget] Semantic support intent classifier failed:', supportIntentError.message);
        }
      }

      if (handoff.mode === HANDOFF_MODE.REQUESTED || handoff.mode === HANDOFF_MODE.ACTIVE) {
        const updatedChatLog = await appendChatLogMessages({
          sessionId,
          businessId: business.id,
          channel: 'CHAT',
          assistantId: assistant.id,
          messages: [userTranscriptMessage],
        });

        return res.json({
          success: true,
          reply: null,
          suppressed: true,
          conversationId: sessionId,
          sessionId: clientSessionId || sessionId,
          assistantName: assistant.name,
          history: buildPublicWidgetHistory(updatedChatLog?.messages || []),
          handoff: getNormalizedHandoffState(state),
        });
      }

      const fallbackLiveHandoff = shouldTriggerHumanHandoff(message);
      const shouldStartLiveHandoff =
        semanticSupportIntent?.isLiveHandoff === true ||
        (!semanticSupportIntent && fallbackLiveHandoff);
      const shouldClarifySupport = semanticSupportIntent?.needsClarification === true;

      if (shouldStartLiveHandoff) {
        if (liveSupportAvailability.available) {
          await clearSupportRoutingState({
            sessionId,
            businessId: business.id,
            currentState: state,
          });

          const nextHandoff = await requestHumanHandoff({
            sessionId,
            businessId: business.id,
            requestedBy: 'customer',
            requestedReason: 'customer_requested_live_support',
            currentState: state,
          });

          const acknowledgement = getLiveHandoffAcknowledgementMessage(language);
          const updatedChatLog = await appendChatLogMessages({
            sessionId,
            businessId: business.id,
            channel: 'CHAT',
            assistantId: assistant.id,
            messages: [
              userTranscriptMessage,
              buildInternalChatHandoffEvent(
                'Live support requested.',
                {
                  type: 'handoff_requested',
                  requestedBy: 'customer',
                  supportIntent: semanticSupportIntent?.intent || 'LIVE_HANDOFF_REQUEST',
                }
              ),
              {
                role: 'assistant',
                content: acknowledgement,
                timestamp: new Date().toISOString(),
                metadata: {
                  source: 'live_handoff_acknowledgement',
                }
              }
            ]
          });

          return res.json({
            success: true,
            reply: acknowledgement,
            conversationId: sessionId,
            sessionId: clientSessionId || sessionId,
            assistantName: assistant.name,
            history: buildPublicWidgetHistory(updatedChatLog?.messages || []),
            handoff: nextHandoff,
          });
        }

        await setSupportRoutingPending({
          sessionId,
          businessId: business.id,
          offerMode: SUPPORT_OFFER_MODE.CALLBACK_ONLY,
          liveSupportAvailable: false,
          reason: 'live_support_unavailable',
          currentState: state,
        });

        const unavailableMessage = getLiveSupportUnavailableMessage(language);
        const updatedChatLog = await appendChatLogMessages({
          sessionId,
          businessId: business.id,
          channel: 'CHAT',
          assistantId: assistant.id,
          messages: [
            userTranscriptMessage,
            buildInternalChatHandoffEvent(
              'Live support unavailable; callback offered instead.',
              {
                type: 'handoff_unavailable',
                supportIntent: semanticSupportIntent?.intent || 'LIVE_HANDOFF_REQUEST',
              }
            ),
            {
              role: 'assistant',
              content: unavailableMessage,
              timestamp: new Date().toISOString(),
              metadata: {
                source: 'live_handoff_unavailable',
              }
            }
          ]
        });

        return res.json({
          success: true,
          reply: unavailableMessage,
          conversationId: sessionId,
          sessionId: clientSessionId || sessionId,
          assistantName: assistant.name,
          history: buildPublicWidgetHistory(updatedChatLog?.messages || []),
          handoff: getNormalizedHandoffState(state),
        });
      }

      if (shouldClarifySupport) {
        const offerMode = liveSupportAvailability.available
          ? SUPPORT_OFFER_MODE.CHOICE
          : SUPPORT_OFFER_MODE.CALLBACK_ONLY;
        const clarifyMessage = liveSupportAvailability.available
          ? getLiveSupportClarifyMessage(language)
          : getLiveSupportUnavailableMessage(language);

        await setSupportRoutingPending({
          sessionId,
          businessId: business.id,
          offerMode,
          liveSupportAvailable: liveSupportAvailability.available,
          reason: 'support_preference_requested',
          currentState: state,
        });

        const updatedChatLog = await appendChatLogMessages({
          sessionId,
          businessId: business.id,
          channel: 'CHAT',
          assistantId: assistant.id,
          messages: [
            userTranscriptMessage,
            buildInternalChatHandoffEvent(
              liveSupportAvailability.available
                ? 'Asked customer to choose between live handoff and callback.'
                : 'Asked customer whether they want a callback because live support is unavailable.',
              {
                type: 'support_preference_requested',
                offerMode,
              }
            ),
            {
              role: 'assistant',
              content: clarifyMessage,
              timestamp: new Date().toISOString(),
              metadata: {
                source: 'support_preference_clarify',
                offerMode,
              }
            }
          ]
        });

        return res.json({
          success: true,
          reply: clarifyMessage,
          conversationId: sessionId,
          sessionId: clientSessionId || sessionId,
          assistantName: assistant.name,
          history: buildPublicWidgetHistory(updatedChatLog?.messages || []),
          handoff,
        });
      }
    }

    if (subscription && subscription.plan !== 'FREE') {
      writtenUsageKey = buildChatWrittenIdempotencyKey({
        subscriptionId: subscription.id,
        sessionId,
        turnIndex: req.requestId || `${Date.now()}`,
        userMessage: message
      });

      try {
        await reserveWrittenInteraction({
          subscriptionId: subscription.id,
          channel: 'CHAT',
          idempotencyKey: writtenUsageKey,
          assistantId: assistant?.id || null,
          metadata: {
            requestId: req.requestId || null,
            sessionId,
            clientSessionId
          }
        });
      } catch (error) {
        if (isWrittenUsageBlockError(error)) {
          const response = buildWrittenUsageErrorResponse(language, error);
          return res.status(response.status).json(response.body);
        }
        throw error;
      }
    }

    // ===== SESSION OK - CONTINUE NORMAL PROCESSING =====

    // SECURITY: KB Empty Hard Fallback (lightweight — COUNT only, no full KB fetch)
    // If KB is empty AND no CRM tools available, return fallback (prevent hallucination)
    const activeToolsList = getPromptBuilderTools(business, business.integrations || []);
    const hasCRMTools = activeToolsList.some(t =>
      t === 'customer_data_lookup' || t === 'check_order_status'
    );

    const kbCount = await prisma.knowledgeBase.count({
      where: { businessId: business.id, status: 'ACTIVE' }
    });
    const isKBEmpty = kbCount === 0;

    // Check if message looks like KB query (not CRM lookup)
    const looksLikeCRMQuery = /sipariş|order|müşteri|customer|takip|tracking|\d{5,}/i.test(message);

    // Greeting/chatter messages should always reach the LLM pipeline
    const isGreetingOrChatter = /^(merhaba|selam|selamlar|hey|hi|hello|günaydın|iyi\s*(günler|akşamlar)|good\s*(morning|evening)|teşekkür|sağol|tamam|ok)\b/i.test(message.trim());

    console.log(`⏱️ [Widget] KB empty check: ${Date.now() - _t}ms`); _t = Date.now();

    if (isKBEmpty && !hasCRMTools && !looksLikeCRMQuery && !isGreetingOrChatter) {
      console.log('⚠️ KB_EMPTY_FALLBACK disabled (LLM-first mode) — continuing to orchestrator');
    }

    // NOTE: System prompt, KB retrieval, chatLog, dateTimeContext are all handled
    // by orchestrator Steps 1-2. No need to duplicate here.

    // Handle message with state machine (using core orchestrator)
    // Widget timeout: Generous to avoid premature timeouts
    const WIDGET_TOTAL_TIMEOUT_MS = 30000; // 30s max total (LLM + tools)

    console.log(`⏱️ [Widget] Pre-orchestrator: ${Date.now() - _widgetStart}ms`);

    const handleMessagePromise = handleMessage(
      sessionId,
      business.id,
      message,
      language,
      business,
      assistant,
      timezone,
      clientSessionId,
      req.requestId || null
    );

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Widget request timeout')), WIDGET_TOTAL_TIMEOUT_MS)
    );

    let result;
    try {
      result = await Promise.race([handleMessagePromise, timeoutPromise]);
    } catch (timeoutError) {
      if (timeoutError.message === 'Widget request timeout') {
        console.error('⏱️  [Widget] Request timeout - returning fast ACK');

        if (writtenUsageKey) {
          await releaseWrittenInteraction(writtenUsageKey, 'WIDGET_TIMEOUT').catch(() => null);
          writtenUsageKey = null;
        }

        // Fast ACK response
        result = {
          reply: language === 'TR'
            ? 'Mesajınız alındı, yanıt hazırlanıyor... Lütfen birkaç saniye bekleyin.'
            : 'Message received, preparing response... Please wait a moment.',
          inputTokens: 0,
          outputTokens: 0
        };

        // Return 503 Service Unavailable with Retry-After
        return res.status(503).set('Retry-After', '2').json({
          success: false,
          code: 'REQUEST_TIMEOUT',
          message: result.reply,
          requestId: `req_${Date.now()}`,
          retryAfterMs: 2000
        });
      }
      throw timeoutError; // Re-throw if not timeout
    }

    // Calculate costs
    const planName = subscription?.plan || 'FREE';
    const countryCode = business?.country || 'TR';
    const isFree = hasFreeChat(planName);

    let tokenCost = { inputCost: 0, outputCost: 0, totalCost: 0 };
    if (!isFree) {
      tokenCost = calculateTokenCost(
        result.inputTokens,
        result.outputTokens,
        planName,
        countryCode
      );
    }

    console.log(`💰 Cost: ${tokenCost.totalCost.toFixed(6)} TL`);

    // NOTE: Chat messages are already persisted by orchestrator Step 8 (08_persistAndMetrics.js)
    // Here we only update token/cost tracking fields
    const existingLog = await prisma.chatLog.findUnique({
      where: { sessionId },
      select: { inputTokens: true, outputTokens: true, totalCost: true, messages: true }
    });

    const accumulatedInputTokens = (existingLog?.inputTokens || 0) + result.inputTokens;
    const accumulatedOutputTokens = (existingLog?.outputTokens || 0) + result.outputTokens;
    const accumulatedCost = (existingLog?.totalCost || 0) + tokenCost.totalCost;

    await prisma.chatLog.upsert({
      where: { sessionId },
      create: {
        sessionId,
        businessId: business.id,
        assistantId: assistant.id,
        channel: 'CHAT',
        messageCount: existingLog?.messages?.length || 0,
        messages: existingLog?.messages || [],
        status: 'active',
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        totalCost: tokenCost.totalCost
      },
      update: {
        inputTokens: accumulatedInputTokens,
        outputTokens: accumulatedOutputTokens,
        totalCost: accumulatedCost,
        updatedAt: new Date()
      }
    });

    // Route-level firewall: Step7 is the single enforcement point by default.
    // Use FEATURE_ROUTE_FIREWALL_MODE=enforce only as rollback switch.
    const routeFirewallMode = String(FEATURE_FLAGS.ROUTE_FIREWALL_MODE || 'telemetry').toLowerCase();
    const shouldEnforceRouteFirewall = routeFirewallMode === 'enforce';

    let finalReply = sanitizeChatReplyPlaceholders(result.reply, language);
    const postprocessorsApplied = [];

    if (finalReply !== result.reply) {
      console.warn(`🧹 [Widget] Placeholder artifacts sanitized for session ${sessionId}`);
      postprocessorsApplied.push('sanitize_placeholders');
    }

    const firewallResult = sanitizeResponse(finalReply, language, {
      allowedEmails: collectPublicContactEmails(business)
    });

    if (!firewallResult.safe) {
      // Always log for monitoring
      logFirewallViolation({
        violations: firewallResult.violations,
        original: firewallResult.original,
        businessId: business.id,
        sessionId
      });

      // Only block at route level in explicit rollback mode.
      if (shouldEnforceRouteFirewall) {
        console.warn('🚨 [Route Firewall] ENFORCE mode - blocking response');
        finalReply = firewallResult.sanitized;
        postprocessorsApplied.push('route_firewall_enforce_sanitize');
      }
    }
    const resultWarnings = Array.isArray(result.warnings) ? result.warnings : [];
    if (resultWarnings.length > 0) {
      postprocessorsApplied.push('core_warning_prefix');
    }

    if (writtenUsageKey) {
      const bypassReason = result?.metadata?.llmBypassReason || null;
      const shouldRollbackWrittenUsage = result?.outcome === ToolOutcome.INFRA_ERROR
        || bypassReason === 'BYPASS_LLM_PROVIDER_ERROR'
        || bypassReason === 'BYPASS_ORCHESTRATOR_FATAL';

      if (shouldRollbackWrittenUsage) {
        await releaseWrittenInteraction(writtenUsageKey, bypassReason || 'CHAT_WIDGET_BYPASS').catch(() => null);
      } else {
        await commitWrittenInteraction(writtenUsageKey, {
          channel: 'CHAT',
          requestId: req.requestId || null,
          clientSessionId,
          finalReplyLength: finalReply.length
        });
      }
      writtenUsageKey = null;
    }

    const historyParity = updateAssistantReplyInMessages({
      messages: existingLog?.messages || [],
      persistedReply: result.reply,
      finalReply
    });

    try {
      const paritySync = await syncPersistedAssistantReply({
        sessionId,
        persistedReply: result.reply,
        finalReply
      });
      if (paritySync.updated) {
        console.log(`🔁 [Widget] Persisted assistant reply synchronized (index=${paritySync.targetIndex})`);
      }
    } catch (parityError) {
      console.error('⚠️ [Widget] Failed to synchronize persisted reply:', parityError.message);
    }

    // Unified response trace (finalized after route-level postprocessing)
    const traceInput = result.traceContext || {
      context: {
        channel: 'CHAT',
        businessId: business.id,
        userId: clientSessionId || null,
        sessionId,
        messageId: null,
        requestId: req.requestId || null,
        language,
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
        model: assistant?.model || null,
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
        requestId: req.requestId || traceInput?.context?.requestId || null,
        sessionId: sessionId || traceInput?.context?.sessionId || null,
        messageId: traceInput?.context?.messageId || null
      },
      postprocessors: postprocessorsApplied,
      finalResponse: finalReply
    });

    // P0: Reload state to get updated verification status after tool execution
    const updatedState = await getState(sessionId);

    // Return response
    res.json({
      success: true,
      reply: finalReply,
      outcome: result.outcome || ToolOutcome.OK,
      traceId: result.traceId || null,
      conversationId: sessionId, // P0: conversationId is required for audit/correlation
      messageId: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`, // P0: messageId for audit trail
      // Contract: echo the caller-provided sessionId when available.
      // conversationId remains the canonical internal session key.
      sessionId: clientSessionId || sessionId,
      assistantName: assistant.name,
      history: buildPublicWidgetHistory(historyParity.updated ? historyParity.messages : (existingLog?.messages || [])),
      handoff: getNormalizedHandoffState(updatedState),
      verificationStatus: updatedState.verification?.status || 'none', // P0: Gate requirement for verification tests
      warnings: resultWarnings.length > 0 ? resultWarnings : undefined,
      toolsCalled: result.toolsCalled || [], // For test assertions (deprecated, use toolCalls)
      toolCalls: result.toolsCalled || [], // P0: Test expects 'toolCalls' not 'toolsCalled'
      metadata: {
        ...(result.metadata || {}),
        routeFirewallMode,
        routeFirewallEnforced: shouldEnforceRouteFirewall
      }
    });

  } catch (error) {
    if (writtenUsageKey) {
      await releaseWrittenInteraction(writtenUsageKey, 'CHAT_WIDGET_FAILED').catch(() => null);
    }
    console.error('❌ Chat error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      code: error.code
    });

    // Persist to ErrorLog (non-blocking)
    try {
      const { logChatError } = await import('../services/errorLogger.js');
      logChatError(error, {
        sessionId: clientSessionId || null,
        businessId: business?.id || null,
        requestId: req.requestId,
        endpoint: req.path,
        method: req.method,
      }).catch(() => {});
    } catch (_) { /* import failure */ }

    // Standardized error format (P0)
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Failed to process message',
      requestId: req.requestId || `req_${Date.now()}`,
      retryAfterMs: null, // No retry for internal errors
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/chat/widget/feedback - Capture end-user feedback about the assistant reply
 */
router.post('/widget/feedback', async (req, res) => {
  try {
    const {
      traceId = null,
      sessionId = null,
      sentiment,
      reason = null,
      comment = null,
      assistantReplyPreview = null,
      source = 'widget_inline'
    } = req.body || {};

    const normalizedSentiment = String(sentiment || '').toLowerCase();
    if (!['positive', 'negative'].includes(normalizedSentiment)) {
      return res.status(400).json({ error: 'sentiment must be positive or negative' });
    }

    let trace = null;
    if (traceId) {
      trace = await prisma.responseTrace.findFirst({
        where: { traceId: String(traceId) },
        select: {
          traceId: true,
          requestId: true,
          businessId: true,
          userId: true,
          sessionId: true,
          messageId: true,
          channel: true,
          responsePreview: true
        }
      });
    }

    if (!trace && sessionId) {
      trace = await prisma.responseTrace.findFirst({
        where: { sessionId: String(sessionId) },
        orderBy: { createdAt: 'desc' },
        select: {
          traceId: true,
          requestId: true,
          businessId: true,
          userId: true,
          sessionId: true,
          messageId: true,
          channel: true,
          responsePreview: true
        }
      });
    }

    if (!trace?.businessId) {
      return res.status(404).json({ error: 'trace/session not found' });
    }

    const feedbackResult = await logAssistantFeedback({
      businessId: trace.businessId,
      traceId: trace.traceId,
      requestId: trace.requestId || null,
      sessionId: trace.sessionId || sessionId || null,
      messageId: trace.messageId || null,
      userId: trace.userId || null,
      channel: trace.channel || 'CHAT',
      sentiment: normalizedSentiment,
      reason,
      comment,
      assistantReplyPreview: assistantReplyPreview || trace.responsePreview || null,
      source
    });

    return res.json({
      success: true,
      feedbackId: feedbackResult.id,
      deduped: feedbackResult.deduped === true
    });
  } catch (error) {
    console.error('Widget feedback error:', error);
    return res.status(500).json({ error: 'Failed to save feedback' });
  }
});

/**
 * GET /api/chat-v2/widget/status/:assistantId - Check if widget should be active
 */
router.get('/widget/status/:assistantId', async (req, res) => {
  try {
    const { assistantId } = req.params;

    const requestedAssistant = await prisma.assistant.findFirst({
      where: {
        id: assistantId,
        isActive: true
      },
      include: {
        business: {
          include: {
            assistants: {
              where: { isActive: true },
              orderBy: { createdAt: 'desc' }
            }
          }
        }
      }
    });

    if (!requestedAssistant) {
      return res.json({ active: false, reason: 'not_found' });
    }

    const business = requestedAssistant.business;
    let assistant = requestedAssistant;

    if (!assistantHasCapability(requestedAssistant, ASSISTANT_CHANNEL_CAPABILITIES.CHAT)) {
      const resolved = await resolveChatAssistantForBusiness({
        prisma,
        business,
        allowAutoCreate: true
      });

      assistant = resolved.assistant;
    }

    if (!assistant) {
      return res.json({ active: false, reason: 'no_chat_assistant' });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { businessId: business.id },
      include: { business: true }
    });

    if (!subscription) {
      return res.json({ active: false, reason: 'no_subscription' });
    }

    if (isFreePlanExpired(subscription)) {
      return res.json({ active: false, reason: 'trial_expired' });
    }

    res.json({
      active: true,
      assistantName: assistant.name,
      assistantId: assistant.id,
      businessName: business?.name,
      allowReset: isChatWidgetResetEnabledForBusiness(business?.id)
    });

  } catch (error) {
    console.error('Widget status error:', error);
    res.json({ active: false, reason: 'error' });
  }
});

/**
 * GET /api/chat-v2/widget/status/embed/:embedKey - Check if widget should be active by embed key
 */
router.get('/widget/status/embed/:embedKey', async (req, res) => {
  try {
    const { embedKey } = req.params;

    const business = await prisma.business.findUnique({
      where: { chatEmbedKey: embedKey },
      include: {
        assistants: {
          where: {
            isActive: true
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!business) {
      return res.json({ active: false, reason: 'invalid_embed_key' });
    }

    if (!business.chatWidgetEnabled) {
      return res.json({ active: false, reason: 'widget_disabled' });
    }

    const resolved = await resolveChatAssistantForBusiness({
      prisma,
      business,
      allowAutoCreate: true
    });

    const assistant = resolved.assistant;

    if (!assistant) {
      return res.json({ active: false, reason: 'no_chat_assistant' });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { businessId: business.id }
    });

    if (!subscription) {
      return res.json({ active: false, reason: 'no_subscription' });
    }

    if (isFreePlanExpired(subscription)) {
      return res.json({ active: false, reason: 'trial_expired' });
    }

    res.json({
      active: true,
      assistantName: assistant.name,
      assistantId: assistant.id,
      businessName: business.name,
      allowReset: isChatWidgetResetEnabledForBusiness(business.id)
    });

  } catch (error) {
    console.error('Widget status by embed key error:', error);
    res.json({ active: false, reason: 'error' });
  }
});

// Export handleMessage for testing
export { handleMessage };

export default router;
