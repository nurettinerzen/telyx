/**
 * Step 4: Router Decision
 *
 * ARCHITECTURE CHANGE (LLM Authority Refactor):
 * - Backend NO LONGER classifies user input (no regex, no looksLikeSlotInput)
 * - Backend NO LONGER returns directResponse templates
 * - Backend NO LONGER uses forceToolCall
 * - LLM handles: intent detection, entity extraction, natural conversation
 * - Backend handles: state tracking, security, tool gating
 *
 * Determines action based on classification:
 * - RUN_INTENT_ROUTER: New intent → LLM handles with tools
 * - HANDLE_DISPUTE: User disputes result → LLM handles with context
 * - ACKNOWLEDGE_CHATTER: Emotional/greeting → LLM responds naturally
 * - PROCESS_SLOT: (SIMPLIFIED) Only format validation, not input classification
 */

import { routeMessage } from '../../../services/message-router.js';
import { buildChatterDirective } from '../../../services/chatter-response.js';

function isRouterPassthroughEnabled() {
  return String(process.env.ROUTER_PASSTHROUGH || '').toLowerCase() === 'true';
}

/**
 * Unified chatter handler (LLM-first).
 */
function handleChatter({ userMessage, state, language, sessionId, messageRouting, detectedBy }) {
  const chatterDirective = buildChatterDirective({ userMessage, state, language, sessionId });

  // Update chatter state for anti-repeat tracking
  const previousRecent = Array.isArray(state?.chatter?.recent) ? state.chatter.recent : [];
  const nextRecent = [
    ...previousRecent,
    { messageKey: chatterDirective.messageKey, variantIndex: chatterDirective.variantIndex }
  ].slice(-2);

  state.chatter = {
    lastMessageKey: chatterDirective.messageKey,
    lastVariantIndex: chatterDirective.variantIndex,
    lastAt: new Date().toISOString(),
    recent: nextRecent
  };

  const chatterRouting = {
    ...messageRouting,
    routing: {
      ...messageRouting.routing,
      action: 'ACKNOWLEDGE_CHATTER',
      reason: `Chatter detected (${detectedBy}) — LLM directive mode`,
      nextAction: 'llm-directive'
    }
  };

  console.log(`💬 [RouterDecision] Chatter (${detectedBy}) — LLM directive mode, directResponse=false`);

  return {
    directResponse: false,
    routing: chatterRouting,
    isChatter: true,
    chatterDirective: chatterDirective.directive,
    metadata: {
      messageKey: chatterDirective.messageKey,
      variantIndex: chatterDirective.variantIndex,
      detectedBy,
      mode: 'llm_directive'
    }
  };
}

const CALLBACK_NAME_INTRO_PATTERN = /\b(ad[ıi]m|ad\s*soyad[ıi]m|ismim|isim|ben(?:im)?\s*ad[ıi]m|my\s+name\s+is|i\s+am)\b/i;
const CALLBACK_PLACEHOLDER_NAMES = new Set(['customer', 'unknown', 'anonymous', 'test', 'user', 'n/a', 'na', '-']);
const CALLBACK_NAME_BLOCKLIST = /\b(yetkili|temsilci|geri|ara|callback|human|manager|representative|operator|destek|support)\b/i;

function normalizePhoneCandidate(rawPhone) {
  if (!rawPhone) return null;
  const compact = String(rawPhone).replace(/[^\d+]/g, '');
  const digits = compact.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) return null;
  return compact.startsWith('+') ? `+${digits}` : digits;
}

function extractPhoneCandidate(message = '') {
  const match = String(message || '').match(/(\+?\d[\d\s\-()]{8,}\d)/);
  return normalizePhoneCandidate(match?.[1] || null);
}

function looksLikePlaceholderName(name) {
  if (!name) return true;
  return CALLBACK_PLACEHOLDER_NAMES.has(String(name).trim().toLowerCase());
}

function extractNameCandidate(message = '', { allowLoose = false } = {}) {
  const text = String(message || '').replace(/(\+?\d[\d\s\-()]{8,}\d)/g, ' ').trim();
  if (!text) return null;

  const hasIntro = CALLBACK_NAME_INTRO_PATTERN.test(text);
  if (!allowLoose && !hasIntro) {
    return null;
  }

  const introMatch = text.match(/(?:ad[ıi]m|ad\s*soyad[ıi]m|ismim|isim|ben(?:im)?\s*ad[ıi]m|my\s+name\s+is|i\s+am)\s*[:\-]?\s*([A-Za-zÇĞİÖŞÜçğıöşü]+(?:\s+[A-Za-zÇĞİÖŞÜçğıöşü]+){1,2})/i);
  let candidate = introMatch?.[1] || null;

  if (!candidate) {
    const tokens = text.match(/[A-Za-zÇĞİÖŞÜçğıöşü]{2,}/g) || [];
    if (tokens.length < 2 || tokens.length > 3) return null;
    candidate = tokens.join(' ');
  }

  if (!candidate) return null;
  if (CALLBACK_NAME_BLOCKLIST.test(candidate)) return null;
  if (looksLikePlaceholderName(candidate)) return null;
  return candidate.trim();
}

function upsertCallbackContext({ state, userMessage, allowLooseName = false, fallbackPhone = null }) {
  const existingName = state.callbackFlow?.customerName || state.extractedSlots?.customer_name || null;
  const existingPhone = state.callbackFlow?.customerPhone || state.extractedSlots?.phone || fallbackPhone || null;

  const extractedPhone = extractPhoneCandidate(userMessage);
  const extractedName = extractNameCandidate(userMessage, { allowLoose: allowLooseName });

  const customerName = extractedName || existingName || null;
  const customerPhone = extractedPhone || existingPhone || null;

  state.callbackFlow = {
    ...(state.callbackFlow || {}),
    pending: true,
    customerName,
    customerPhone,
    updatedAt: new Date().toISOString()
  };

  state.extractedSlots = state.extractedSlots || {};
  if (customerName) state.extractedSlots.customer_name = customerName;
  if (customerPhone) state.extractedSlots.phone = customerPhone;

  return { customerName, customerPhone };
}

export async function makeRoutingDecision(params) {
  const { classification, state, userMessage, conversationHistory, language, business, sessionId = '', channel = 'CHAT', channelUserId = null } = params;
  const routerPassthroughEnabled = isRouterPassthroughEnabled();

  // Get last assistant message
  const lastAssistantMessage = conversationHistory
    .slice().reverse()
    .find(msg => msg.role === 'assistant')?.content || '';

  // Route message — pass Step 3 classification to AVOID double Gemini call
  const messageRouting = await routeMessage(
    userMessage,
    state,
    lastAssistantMessage,
    language,
    business,
    classification  // ← Reuse Step 3 classifier result
  );

  const { routing } = messageRouting;
  const action = routing.action;

  console.log('🧭 [RouterDecision]:', {
    action,
    suggestedFlow: routing.suggestedFlow,
    triggerRule: classification.triggerRule,
    verificationStatus: state.verification?.status
  });

  const callbackPending = state.callbackFlow?.pending === true;
  const supportSuggestedFlow = String(
    classification?.suggestedFlow ||
    routing?.suggestedFlow ||
    ''
  ).toUpperCase();
  const callbackRequestedByClassifier =
    supportSuggestedFlow === 'CALLBACK_REQUEST';
  const liveHandoffRequestedByClassifier = supportSuggestedFlow === 'LIVE_HANDOFF_REQUEST';
  const supportPreferenceClarifyRequestedByClassifier = supportSuggestedFlow === 'SUPPORT_PREFERENCE_CLARIFY';

  if (callbackPending || callbackRequestedByClassifier) {
    const { customerName, customerPhone } = upsertCallbackContext({
      state,
      userMessage,
      allowLooseName: callbackPending,
      fallbackPhone: channel === 'WHATSAPP' ? channelUserId : null,
    });

    const missingFields = [];
    if (looksLikePlaceholderName(customerName)) missingFields.push('customer_name');
    if (!customerPhone) missingFields.push('phone');

    state.activeFlow = 'CALLBACK_REQUEST';
    state.flowStatus = 'in_progress';
    state.callbackFlow.pending = true;
    state.callbackFlow.missingFields = missingFields;

    const callbackRouting = {
      ...messageRouting,
      routing: {
        ...messageRouting.routing,
        action: 'RUN_INTENT_ROUTER',
        reason: callbackPending
          ? 'Callback flow pending - keep collecting callback fields'
          : 'Classifier routed turn to callback collection flow',
        suggestedFlow: 'CALLBACK_REQUEST',
        intent: 'callback_request'
      }
    };

    return {
      directResponse: false,
      routing: callbackRouting,
      callbackRequest: true,
      metadata: {
        mode: callbackPending ? 'callback_pending_flow' : 'callback_classifier_flow',
        missingFields
      }
    };
  }

  if (liveHandoffRequestedByClassifier || supportPreferenceClarifyRequestedByClassifier) {
    const intent = liveHandoffRequestedByClassifier
      ? 'live_handoff_request'
      : 'support_preference_clarify';

    return {
      directResponse: false,
      routing: {
        ...messageRouting,
        routing: {
          ...messageRouting.routing,
          action: 'RUN_INTENT_ROUTER',
          reason: liveHandoffRequestedByClassifier
            ? 'Classifier routed turn to live handoff handling'
            : 'Classifier detected ambiguous human-help preference',
          suggestedFlow: supportSuggestedFlow,
          intent,
        }
      },
      supportIntent: true,
      metadata: {
        mode: intent,
        suggestedFlow: supportSuggestedFlow,
      }
    };
  }

  // ========================================
  // VERIFICATION PENDING: Pass context to LLM, don't classify input
  // ========================================
  // ARCHITECTURE CHANGE: When verification is pending, we add context to state
  // so the LLM knows it needs verification, but we DON'T:
  //   ❌ Use regex to decide if input is name/phone/OOD
  //   ❌ Return directResponse templates
  //   ❌ Force tool calls
  // LLM sees the conversation history and understands what the user is providing.
  // Only apply verification flow for intents that actually need it.
  // Stock follow-ups should never trigger verification.
  const NON_VERIFICATION_FLOWS = ['STOCK_CHECK', 'PRODUCT_INFO'];
  // Also check lastStockContext — after post-result reset, activeFlow is null
  // but we still shouldn't inject verification for stock follow-ups.
  const hasRecentStockContext = !!state.lastStockContext || state.anchor?.type === 'STOCK';
  const isNonVerificationFlow = hasRecentStockContext ||
    NON_VERIFICATION_FLOWS.includes(state.activeFlow) ||
    NON_VERIFICATION_FLOWS.includes(classification?.suggestedFlow) ||
    NON_VERIFICATION_FLOWS.includes(routing?.suggestedFlow);

  if (state.verification?.status === 'pending' && state.verification?.anchor && !isNonVerificationFlow) {
    console.log('🔐 [Verification] Pending verification — LLM will handle input interpretation');

    // Add verification context for LLM's system prompt
    state.verificationContext = {
      status: 'pending',
      pendingField: state.verification.pendingField || 'name',
      attempts: state.verification.attempts || 0,
      anchorType: state.verification.anchor.type,
      // SECURITY: Don't leak anchor details to LLM — just the context
    };

    // Let LLM handle — it will call customer_data_lookup with verification_input
    return {
      directResponse: false,
      routing: messageRouting,
      verificationPending: true
    };
  }

  // Handle different actions
  switch (action) {
    case 'PROCESS_SLOT': {
      // ARCHITECTURE CHANGE: Simplified.
      // Backend no longer validates slot content — LLM extracted slots in Step 3.
      // We just pass through to LLM with the routing context.
      console.log('📝 [RouterDecision] Slot processing — LLM handles interpretation');

      return {
        directResponse: false,
        routing: messageRouting,
        slotProcessed: true
      };
    }

    case 'HANDLE_DISPUTE': {
      // Handle user dispute — let LLM respond with anchor context
      // ARCHITECTURE CHANGE: No more directResponse templates for disputes.
      // LLM sees anchor data (last tool result) and generates natural response.
      console.log('⚠️ [RouterDecision] Dispute detected — LLM will handle with anchor context');

      // Add dispute context for LLM
      if (state.anchor?.truth) {
        state.disputeContext = {
          originalFlow: state.anchor.lastFlowType,
          hasTrackingInfo: !!(state.anchor.truth?.order?.trackingNumber),
          lastResult: state.anchor.truth
        };
      }

      return {
        directResponse: false,
        routing: messageRouting,
        disputeHandled: true
      };
    }

    case 'RUN_INTENT_ROUTER': {
      // New intent detected — will be handled by LLM with tools
      const nextFlow = routing.suggestedFlow || classification?.suggestedFlow || null;

      if (nextFlow) {
        state.activeFlow = nextFlow;
        state.flowStatus = 'in_progress';

        // Clear stale verification from previous flows when starting a new flow.
        // Without this, verification.status='pending' from an old order/debt flow
        // bleeds into unrelated flows (e.g. stock queries).
        if (state.verification?.status === 'pending' || NON_VERIFICATION_FLOWS.includes(nextFlow)) {
          console.log(`🧹 [RouterDecision] Clearing stale verification — new flow: ${nextFlow}`);
          state.verification = { status: 'none' };
        }
      }

      return {
        directResponse: false,
        routing: messageRouting,
        newIntentDetected: true
      };
    }

    case 'CONTINUE_FLOW': {
      // Continue with current flow
      return {
        directResponse: false,
        routing: messageRouting,
        continueFlow: true
      };
    }

    case 'ACKNOWLEDGE_CHATTER': {
      if (routerPassthroughEnabled) {
        console.log('⚪ [RouterDecision] ROUTER_PASSTHROUGH=true — chatter directive suppressed');
        return {
          directResponse: false,
          routing: messageRouting,
          metadata: {
            mode: 'router_passthrough',
            suppressed: 'ACKNOWLEDGE_CHATTER'
          }
        };
      }
      return handleChatter({ userMessage, state, language, sessionId, messageRouting, detectedBy: 'action_route' });
    }

    default: {
      console.warn(`⚠️ [RouterDecision] Unknown action: ${action}`);
      return {
        directResponse: false,
        routing: messageRouting
      };
    }
  }
}

export default { makeRoutingDecision };
