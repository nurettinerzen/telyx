/**
 * Step 8: Persist and Metrics
 *
 * - Saves state to database
 * - Appends messages to conversation log (ChatLog table - single source)
 * - Emits turn metrics
 * - Returns metadata for channel adapter
 */

import { getState, updateState } from '../../../services/state-manager.js';
import { emitTurnMetrics } from '../../../metrics/emit.js';
import prisma from '../../../config/database.js';

export async function persistAndEmitMetrics(params) {
  const {
    sessionId,
    state,
    userMessage,
    finalResponse,
    classification,
    routing,
    turnStartTime,
    inputTokens,
    outputTokens,
    toolsCalled,
    hadToolSuccess,
    hadToolFailure,
    failedTool,
    responseGrounding = 'GROUNDED',
    channel,
    channelUserId = null,
    customerPhone = null,
    businessId,
    metrics,
    assistantMessageMeta = null,
    effectsEnabled = true // DRY-RUN flag (default: true for backward compat)
  } = params;

  // DRY-RUN MODE: Skip all persist/billing (read-only)
  if (!effectsEnabled) {
    console.log('🔍 [Persist] DRY-RUN mode - skipping all writes');

    return {
      shouldEndSession: false,
      forceEnd: false,
      metadata: {
        classification: classification?.type,
        confidence: classification?.confidence,
        routing: routing?.routing?.action,
        toolsCalled: toolsCalled?.length || 0,
        hadToolSuccess,
        hadToolFailure,
        responseGrounding,
        turnDuration: Date.now() - turnStartTime,
        _dryRun: true
      }
    };
  }

  console.log('💾 [Persist] Saving state and conversation...');

  const persistedState = await getState(sessionId);
  if (persistedState?.lockReason && !state.lockReason) {
    state.lockReason = persistedState.lockReason;
    state.lockedAt = persistedState.lockedAt || state.lockedAt || null;
    state.lockUntil = persistedState.lockUntil || state.lockUntil || null;
    state.lockMessageSentAt = persistedState.lockMessageSentAt || state.lockMessageSentAt || null;
    state.flowStatus = persistedState.flowStatus === 'terminated'
      ? 'terminated'
      : (state.flowStatus || 'terminated');
  }

  // STEP 1: Update state in database
  await updateState(sessionId, state);

  // STEP 2: Append to conversation log (ChatLog table - SINGLE SOURCE)
  const chatLog = await prisma.chatLog.findUnique({
    where: { sessionId }
  });

  const persistedGrounding = responseGrounding === 'UNGROUNDED'
    ? 'CLARIFICATION'
    : responseGrounding;

  const persistedResponse = responseGrounding === 'UNGROUNDED'
    ? (
      finalResponse && String(finalResponse).trim()
        ? finalResponse
        : 'Bu konuda doğrulanmış bilgi paylaşamıyorum. Hangi konuda bilgi istediğini netleştirebilir misin?'
    )
    : finalResponse;

  const fallbackGuardrailAction = hadToolFailure
    ? 'BLOCK'
    : persistedGrounding === 'CLARIFICATION'
      ? 'NEED_MIN_INFO_FOR_TOOL'
      : 'PASS';

  const inferMessageTypeFromAction = (action, grounding) => {
    if (action === 'BLOCK') return 'system_barrier';
    if (action === 'SANITIZE') return 'sanitized_assistant';
    if (action === 'NEED_MIN_INFO_FOR_TOOL') return 'clarification';
    if (grounding === 'CLARIFICATION') return 'clarification';
    return 'assistant_claim';
  };

  const normalizedGuardrailAction = assistantMessageMeta?.guardrailAction || fallbackGuardrailAction;
  const normalizedAssistantMeta = {
    messageType: assistantMessageMeta?.messageType || inferMessageTypeFromAction(normalizedGuardrailAction, persistedGrounding),
    guardrailAction: normalizedGuardrailAction,
    guardrailReason: assistantMessageMeta?.guardrailReason || null
  };

  const assistantMessage = {
    role: 'assistant',
    content: persistedResponse,
    timestamp: new Date().toISOString(),
    responseGrounding: persistedGrounding,
    metadata: normalizedAssistantMeta,
    ...(toolsCalled?.length > 0 && { toolCalls: toolsCalled })
  };

  console.log('🔧 [Persist] toolsCalled:', toolsCalled);
  console.log('🔧 [Persist] assistantMessage:', JSON.stringify(assistantMessage));

  const updatedMessages = [
    ...(chatLog?.messages || []),
    { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
    assistantMessage
  ];

  const resolvedCustomerPhone = (
    chatLog?.customerPhone ||
    customerPhone ||
    (channel === 'WHATSAPP' ? channelUserId : null) ||
    null
  );

  await prisma.chatLog.upsert({
    where: { sessionId },
    update: {
      messages: updatedMessages,
      ...(resolvedCustomerPhone ? { customerPhone: resolvedCustomerPhone } : {}),
      ...(channel && { channel }),
      updatedAt: new Date()
    },
    create: {
      sessionId,
      businessId,
      channel: channel || 'CHAT',
      ...(resolvedCustomerPhone ? { customerPhone: resolvedCustomerPhone } : {}),
      messages: updatedMessages,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  });

  // STEP 3: Update post-result tracking (if in post_result state)
  let stateWasUpdated = false;

  if (state.flowStatus === 'post_result') {
    state.postResultTurns = (state.postResultTurns || 0) + 1;
    stateWasUpdated = true;

    // Auto-reset after 3 turns in post_result
    if (state.postResultTurns >= 3) {
      console.log('🔄 [Persist] Auto-resetting after 3 post-result turns');

      // Preserve stock context so the deterministic classifier can still detect
      // stock follow-ups ("kaç tane var?") even after the grace period expires.
      if (state.anchor?.type === 'STOCK') {
        state.lastStockContext = {
          productName: state.anchor.stock?.productName,
          availability: state.anchor.stock?.availability,
          matchType: state.anchor.stock?.matchType,
          timestamp: state.anchor.timestamp
        };
        console.log('📦 [Persist] Preserved lastStockContext for follow-up detection');
      }

      state.flowStatus = 'idle';
      state.activeFlow = null;
      state.postResultTurns = 0;
      state.anchor = null;

      // Save updated state (CRITICAL: save immediately to prevent stale data)
      await updateState(sessionId, state);
      stateWasUpdated = true;
    }
  }

  // CRITICAL: If state was modified, save it one more time to ensure consistency
  // This prevents stale state if step 1 saved before post-result logic ran
  if (stateWasUpdated) {
    await updateState(sessionId, state);
  }

  // STEP 4: Emit turn metrics
  const turnDuration = Date.now() - turnStartTime;

  emitTurnMetrics({
    sessionId,
    channel,
    businessId,
    turnDuration,
    classification,
    routing,
    toolsCalled,
    hadToolSuccess,
    hadToolFailure,
    failedTool,
    inputTokens,
    outputTokens,
    error: null,
    ...metrics
  });

  console.log('✅ [Persist] State and metrics saved');

  // STEP 5: Determine session end behavior
  const shouldEndSession = state.flowStatus === 'terminated';
  const forceEnd = channel === 'PHONE' && hadToolFailure;

  return {
    shouldEndSession,
    forceEnd,
    metadata: {
      classification: classification?.type,
      confidence: classification?.confidence,
      routing: routing?.routing?.action,
      toolsCalled: toolsCalled.length,
      hadToolSuccess,
      hadToolFailure,
      responseGrounding: persistedGrounding,
      assistantMessageType: normalizedAssistantMeta.messageType,
      messageType: normalizedAssistantMeta.messageType,
      guardrailAction: normalizedAssistantMeta.guardrailAction,
      guardrailReason: normalizedAssistantMeta.guardrailReason,
      LLM_CALLED: metrics?.LLM_CALLED === true || metrics?.llmCalled === true,
      llm_call_reason: metrics?.llm_call_reason || metrics?.llmCallReason || String(channel || 'UNKNOWN').toUpperCase(),
      bypassed: typeof metrics?.bypassed === 'boolean'
        ? metrics.bypassed
        : typeof metrics?.llmBypassed === 'boolean'
          ? metrics.llmBypassed
          : !(metrics?.LLM_CALLED === true || metrics?.llmCalled === true),
      turnDuration
    }
  };
}

export default { persistAndEmitMetrics };
