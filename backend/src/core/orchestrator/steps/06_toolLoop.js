/**
 * Step 6: Tool Loop
 *
 * - Executes LLM with tool calling loop
 * - Handles tool execution with retry and idempotency
 * - Applies tool fail policy
 * - Returns final response text + metadata
 */

import crypto from 'crypto';
import { applyToolFailPolicy } from '../../../policies/toolFailPolicy.js';
import { executeToolWithRetry } from '../../../services/tool-fail-handler.js';
import { executeTool } from '../../../tools/index.js';
import registry from '../../../tools/registry.js';
import { getToolExecutionResult, setToolExecutionResult } from '../../../services/tool-idempotency-db.js';
import { isSessionLocked, getLockMessage, checkEnumerationAttempt } from '../../../services/session-lock.js';
import { GENERIC_ERROR_MESSAGES, ToolOutcome, normalizeOutcome } from '../../../tools/toolResult.js';
import {
  deriveOutcomeEvents,
  applyOutcomeEventsToState,
  shouldAskVerification,
  shouldTerminate,
  OutcomeEventType
} from '../../../security/outcomePolicy.js';
import { tryAutoverify } from '../../../security/autoverify.js';
import { getMessage } from '../../../messages/messageCatalog.js';

const MAX_ITERATIONS = 3;
const REPEAT_WINDOW_MS = 10 * 60 * 1000;
const REPEAT_IDENTIFIER_KEYS = ['order_number', 'phone', 'email', 'customer_name', 'vkn', 'tc', 'ticket_number'];
const CALLBACK_PHONE_PATTERN = /(\+?\d[\d\s\-()]{8,}\d)/;
const CALLBACK_NAME_PATTERN = /[A-Za-zÇĞİÖŞÜçğıöşü]{2,}/g;
const CALLBACK_PLACEHOLDER_NAMES = new Set(['customer', 'unknown', 'anonymous', 'test', 'user', 'n/a', 'na', '-']);
const CALLBACK_NAME_STOPWORDS = new Set([
  'beni', 'bana', 'ara', 'arayin', 'arayabilir', 'arayabilirsiniz', 'lutfen', 'lütfen',
  'telefon', 'numara', 'numarasi', 'numarami', 'geri', 'donus', 'donusum', 'cagri', 'talep',
  'please', 'call', 'me', 'back', 'callback', 'agent', 'representative', 'human', 'support',
  'my', 'name', 'is', 'i', 'am'
]);

const RESPONSE_ORIGIN = Object.freeze({
  LLM: 'LLM',
  TEMPLATE: 'TEMPLATE',
  FALLBACK: 'FALLBACK'
});
const LLM_SEND_MAX_ATTEMPTS = 2;
const LLM_SEND_RETRY_BASE_MS = 400;
const RETRYABLE_SEND_ERROR_PATTERN = /(timeout|timed out|rate limit|429|temporar|unavailable|503|econnreset|socket hang up|upstream|try again)/i;

function isRetryableSendError(error) {
  const message = String(error?.message || '');
  return RETRYABLE_SEND_ERROR_PATTERN.test(message);
}

function getSendErrorCode(error) {
  const message = String(error?.message || '');
  if (/timeout|timed out/i.test(message)) return 'LLM_TIMEOUT';
  if (/429|rate limit/i.test(message)) return 'LLM_RATE_LIMIT';
  if (/503|unavailable|overload|upstream/i.test(message)) return 'LLM_PROVIDER_UNAVAILABLE';
  return 'LLM_SEND_ERROR';
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendMessageWithRetry(chat, payload, { label = 'llm.sendMessage', maxAttempts = LLM_SEND_MAX_ATTEMPTS } = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (attempt > 1) {
        console.log(`🔁 [ToolLoop] Retrying ${label} (${attempt}/${maxAttempts})`);
      }
      const result = await chat.sendMessage(payload);
      if (attempt > 1) {
        console.log(`✅ [ToolLoop] ${label} recovered on attempt ${attempt}`);
      }
      return result;
    } catch (error) {
      lastError = error;
      const retryable = isRetryableSendError(error);
      const errorCode = getSendErrorCode(error);
      console.warn(`⚠️ [ToolLoop] ${label} failed (attempt ${attempt}/${maxAttempts}, code=${errorCode}, retryable=${retryable})`);

      if (!retryable || attempt === maxAttempts) {
        error.llmErrorCode = errorCode;
        error.llmRetryable = retryable;
        error.llmRetryAttempts = attempt;
        throw error;
      }

      await wait(LLM_SEND_RETRY_BASE_MS * attempt);
    }
  }

  throw lastError;
}

/**
 * Compute stable hash from tool args for repeat NOT_FOUND detection.
 * Sorts keys, normalizes string values (trim+lowercase), returns 16-char SHA-256 prefix.
 */
function computeArgsHash(args) {
  if (!args || typeof args !== 'object') return null;
  try {
    const sorted = Object.keys(args).sort().reduce((acc, key) => {
      const val = args[key];
      acc[key] = typeof val === 'string' ? val.trim().toLowerCase() : val;
      return acc;
    }, {});
    return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex').substring(0, 16);
  } catch { return null; }
}

function normalizeCallbackPhone(rawPhone) {
  if (!rawPhone) return null;
  const compact = String(rawPhone).replace(/[^\d+]/g, '');
  const digits = compact.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) return null;
  return compact.startsWith('+') ? `+${digits}` : digits;
}

export function extractCallbackPhone(message = '') {
  const match = String(message || '').match(CALLBACK_PHONE_PATTERN);
  return normalizeCallbackPhone(match?.[1] || null);
}

function looksLikeRealCallbackName(name) {
  if (!name) return false;
  const normalized = String(name).trim().toLowerCase();
  if (!normalized || CALLBACK_PLACEHOLDER_NAMES.has(normalized)) return false;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 4) return false;
  if (tokens.some(token => CALLBACK_NAME_STOPWORDS.has(token))) return false;
  return true;
}

export function extractCallbackName(message = '') {
  const text = String(message || '').replace(CALLBACK_PHONE_PATTERN, ' ').trim();
  if (!text) return null;

  const introMatch = text.match(/(?:adim|adım|isim|ismim|my\s+name\s+is|i\s+am)\s*[:\-]?\s*([A-Za-zÇĞİÖŞÜçğıöşü]+(?:\s+[A-Za-zÇĞİÖŞÜçğıöşü]+){1,2})/i);
  if (introMatch?.[1] && looksLikeRealCallbackName(introMatch[1])) {
    return introMatch[1].trim();
  }

  const tokens = text.match(CALLBACK_NAME_PATTERN) || [];
  if (tokens.length < 2) return null;

  const candidate = tokens.slice(0, 3).join(' ').trim();
  return looksLikeRealCallbackName(candidate) ? candidate : null;
}

export function hydrateCreateCallbackArgs({ userMessage, state, args = {} }) {
  const extractedSlots = state.extractedSlots || {};
  const callbackFlow = state.callbackFlow || {};

  const existingNameCandidate = args.customerName || callbackFlow.customerName || extractedSlots.customer_name || null;
  const existingPhoneCandidate = args.customerPhone || callbackFlow.customerPhone || extractedSlots.phone || null;
  const existingName = looksLikeRealCallbackName(existingNameCandidate) ? existingNameCandidate : null;
  const existingPhone = normalizeCallbackPhone(existingPhoneCandidate);

  const parsedPhone = extractCallbackPhone(userMessage);
  const parsedName = extractCallbackName(userMessage);

  const customerName = existingName || parsedName || null;
  const customerPhone = existingPhone || parsedPhone || null;

  const hydratedArgs = {
    ...args,
    ...(customerName ? { customerName } : {}),
    ...(customerPhone ? { customerPhone } : {})
  };

  return {
    hydratedArgs,
    extracted: {
      customer_name: customerName,
      phone: customerPhone
    }
  };
}

export function buildCallbackMissingGuidance(missingSlots, language) {
  const missing = Array.isArray(missingSlots) ? missingSlots : [];
  const isEN = String(language || 'TR').toUpperCase() === 'EN';

  if (missing.length === 1 && missing[0] === 'customer_name') {
    return isEN
      ? 'To create your callback request, could you share your full name?'
      : 'Geri arama talebinizi olusturmak icin ad-soyadinizi paylasir misiniz?';
  }

  if (missing.length === 1 && missing[0] === 'phone') {
    return isEN
      ? 'To create your callback request, could you share your phone number?'
      : 'Geri arama talebinizi olusturmak icin telefon numaranizi paylasir misiniz?';
  }

  return isEN
    ? 'To create your callback request, could you share your full name and phone number?'
    : 'Geri arama talebinizi olusturmak icin ad-soyad ve telefon numaranizi paylasir misiniz?';
}

function normalizeAskFor(rawAskFor) {
  if (!rawAskFor) return [];
  if (Array.isArray(rawAskFor)) return rawAskFor.filter(Boolean).map(String);
  if (typeof rawAskFor === 'string') return [rawAskFor];
  return [];
}

function isRepeatGuardOutcome(outcome) {
  const normalized = normalizeOutcome(outcome);
  return normalized === ToolOutcome.NOT_FOUND || normalized === ToolOutcome.NEED_MORE_INFO;
}

function hasNewIdentifierInState(state = {}) {
  const currentSlots = state.extractedSlots || {};
  const prevSlots = state._previousExtractedSlots || {};
  return REPEAT_IDENTIFIER_KEYS.some(
    key => currentSlots[key] && currentSlots[key] !== prevSlots[key]
  );
}

function buildRepeatGuardMessage(language, previousRepeatState = {}) {
  const askFor = normalizeAskFor(previousRepeatState.askFor);
  if (askFor.includes('phone_last4')) {
    return getMessage('ORDER_PHONE_LAST4_REQUIRED', { language });
  }
  if (askFor.includes('customer_name') || askFor.includes('phone')) {
    const fields = language === 'TR'
      ? 'ad-soyad ve telefon numaranızı'
      : 'full name and phone number';
    return getMessage('CALLBACK_INFO_REQUIRED', {
      language,
      variables: { fields }
    });
  }
  return getMessage('NOT_FOUND_REPEAT', { language })
    || (language === 'TR'
      ? 'Bu bilgilerle kayıt bulunamadı. Lütfen farklı bir bilgi ile tekrar deneyin.'
      : 'No record found. Please try with different information.');
}

export function shouldBlockRepeatedToolCall({ state, toolName, argsHash, language, nowMs = Date.now() }) {
  if (!argsHash || !state?.lastToolAttempt) {
    return { blocked: false };
  }

  const previous = state.lastToolAttempt;
  if (previous.tool !== toolName || previous.argsHash !== argsHash) {
    return { blocked: false };
  }

  if (!isRepeatGuardOutcome(previous.outcome)) {
    return { blocked: false };
  }

  const lastAgeMs = nowMs - new Date(previous.at).getTime();
  if (!Number.isFinite(lastAgeMs) || lastAgeMs >= REPEAT_WINDOW_MS) {
    return { blocked: false };
  }

  if (hasNewIdentifierInState(state)) {
    return { blocked: false };
  }

  return {
    blocked: true,
    outcome: normalizeOutcome(previous.outcome) || ToolOutcome.NEED_MORE_INFO,
    message: buildRepeatGuardMessage(language, previous)
  };
}

function trackRepeatableOutcome({ state, toolName, argsHash, outcome, toolResult }) {
  if (!argsHash) return;
  const normalizedOutcome = normalizeOutcome(outcome);
  const previous = state.lastToolAttempt;

  if (!isRepeatGuardOutcome(normalizedOutcome)) {
    if (previous?.tool === toolName && previous?.argsHash === argsHash) {
      delete state.lastToolAttempt;
    }
    return;
  }

  const withinWindow = previous?.at &&
    (Date.now() - new Date(previous.at).getTime()) < REPEAT_WINDOW_MS;
  const sameCall = previous?.tool === toolName && previous?.argsHash === argsHash;
  const sameOutcome = previous?.outcome === normalizedOutcome;

  state.lastToolAttempt = {
    tool: toolName,
    argsHash,
    outcome: normalizedOutcome,
    count: sameCall && sameOutcome && withinWindow ? (previous.count || 1) + 1 : 1,
    askFor: normalizeAskFor(toolResult?.askFor || toolResult?.data?.askFor),
    at: new Date().toISOString()
  };
}

export async function executeToolLoop(params) {
  const {
    chat,
    userMessage,
    conversationHistory, // For topic generation in tools
    gatedTools,
    hasTools,
    state,
    business,
    language,
    channel,
    channelUserId,       // Channel identity signal (phone for WA, email for Email, null for Chat)
    sessionId,
    messageId,
    metrics,
    effectsEnabled = true // DRY-RUN flag (default: true for backward compat)
  } = params;
  let llmCalled = false;

  // ========================================
  // KB_ONLY: Hard tool kill-switch — zero tool execution risk
  // LLM responds with text only, no tool calls possible
  // ========================================
  if (params.channelMode === 'KB_ONLY') {
    console.log('🔒 [ToolLoop] KB_ONLY mode — tool loop bypassed, text-only LLM call');
    const result = await sendMessageWithRetry(chat, userMessage, { label: 'kb_only.initial' });
    llmCalled = true;
    const responseText = result.response?.text() || '';
    return {
      reply: responseText,
      inputTokens: result.response?.usageMetadata?.promptTokenCount || 0,
      outputTokens: result.response?.usageMetadata?.candidatesTokenCount || 0,
      hadToolSuccess: false,
      hadToolFailure: false,
      failedTool: null,
      toolsCalled: [],
      toolResults: [],
      iterations: 0,
      chat,
      _responseOrigin: RESPONSE_ORIGIN.LLM,
      _originId: 'toolLoop.kbOnly.llm',
      _llmCalled: llmCalled,
      _llmStatus: 'success'
    };
  }

  // Check lock state once more before tool execution (defensive).
  const lockStatus = await isSessionLocked(sessionId);
  if (lockStatus.locked && lockStatus.reason === 'ENUMERATION') {
    console.log(`🚫 [ToolLoop] Session blocked due to enumeration policy: ${sessionId}`);
    return {
      reply: getLockMessage('ENUMERATION', language, sessionId),
      inputTokens: 0,
      outputTokens: 0,
      hadToolSuccess: false,
      hadToolFailure: true,
      failedTool: null,
      toolsCalled: [],
      toolResults: [],
      iterations: 0,
      chat: null,
      _blocked: 'ENUMERATION',
      _responseOrigin: RESPONSE_ORIGIN.TEMPLATE,
      _originId: 'toolLoop.sessionLock.ENUMERATION',
      _llmCalled: llmCalled,
      _llmStatus: 'not_called'
    };
  }

  // DRY-RUN MODE: Stub all tools (no side-effects)
  if (!effectsEnabled) {
    console.log('🔍 [ToolLoop] DRY-RUN mode - stubbing all tools');

    return {
      reply: language === 'TR'
        ? 'Talebinizi kontrol ediyorum...' // Generic response
        : 'Checking your request...',
      inputTokens: 100, // Estimated
      outputTokens: 50,
      hadToolSuccess: true,
      hadToolFailure: false,
      failedTool: null,
      toolsCalled: gatedTools, // Would have called these
      iterations: 1,
      chat: null,
      _dryRun: true,
      _responseOrigin: RESPONSE_ORIGIN.FALLBACK,
      _originId: 'toolLoop.dryRunStub',
      _llmCalled: llmCalled,
      _llmStatus: 'not_called'
    };
  }

  let iterations = 0;
  let hadToolSuccess = false;
  let hadToolFailure = false;
  let failedTool = null;
  const toolsCalled = [];
  const toolResults = []; // Collect all tool results for guardrails

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let usedFinalFallback = false;

  let result;
  let responseText = '';

  // Send initial message to LLM
  result = await sendMessageWithRetry(chat, userMessage, { label: 'tool_loop.initial' });
  llmCalled = true;

  totalInputTokens += result.response.usageMetadata?.promptTokenCount || 0;
  totalOutputTokens += result.response.usageMetadata?.candidatesTokenCount || 0;

  // DEBUG: Log raw response
  console.log('🔍 [ToolLoop] Raw response:', {
    hasText: !!result.response.text(),
    textPreview: result.response.text()?.substring(0, 100) || '(empty)',
    hasFunctionCalls: !!(result.response.functionCalls()?.length),
    functionCallCount: result.response.functionCalls()?.length || 0,
    candidates: result.response.candidates?.length || 0,
    finishReason: result.response.candidates?.[0]?.finishReason || 'unknown'
  });

  // Tool calling loop
  while (iterations < MAX_ITERATIONS) {
    const functionCalls = result.response.functionCalls();

    if (!functionCalls || functionCalls.length === 0) {
      // No more tool calls - LLM returned text response
      responseText = result.response.text() || '';
      break;
    }

    // After each iteration, also capture any text response (for final turn after tool results)
    const iterationText = result.response.text();
    if (iterationText) {
      responseText = iterationText;
    }

    iterations++;
    console.log(`🔄 [ToolLoop] Iteration ${iterations}/${MAX_ITERATIONS}`);

    // Execute all function calls in this iteration
    const functionResponses = [];

    for (const functionCall of functionCalls) {
      const toolName = functionCall.name;
      let toolArgs = functionCall.args || {};

      console.log(`🔧 [ToolLoop] Calling tool: ${toolName}`);
      toolsCalled.push(toolName);

      // Deterministic callback arg extraction:
      // Do not rely solely on LLM function arguments for critical callback fields.
      if (toolName === 'create_callback') {
        const { hydratedArgs, extracted } = hydrateCreateCallbackArgs({
          userMessage,
          state,
          args: toolArgs
        });

        toolArgs = hydratedArgs;
        state.extractedSlots = state.extractedSlots || {};
        if (extracted.customer_name) state.extractedSlots.customer_name = extracted.customer_name;
        if (extracted.phone) state.extractedSlots.phone = extracted.phone;

        if (state.callbackFlow?.pending) {
          state.callbackFlow.customerName = extracted.customer_name || state.callbackFlow.customerName || null;
          state.callbackFlow.customerPhone = extracted.phone || state.callbackFlow.customerPhone || null;
          state.callbackFlow.updatedAt = new Date().toISOString();
        }
      }

      // ════════════════════════════════════════════════════════════════════
      // PRECONDITION CHECK: extractedSlots'ta gerekli alanlar var mı?
      // ════════════════════════════════════════════════════════════════════
      // Tool metadata'sında preconditions varsa, extractedSlots kontrol edilir.
      // Eksikse tool çalıştırılmaz, LLM'e guidance function response gönderilir.
      // Non-terminal: LLM doğal şekilde müşteriye eksik bilgiyi sorar.
      const rawDef = registry.getRawDefinition(toolName);
      const preconditions = rawDef?.metadata?.preconditions;

      if (preconditions?.requiredSlots?.length > 0) {
        const currentSlots = { ...(state.extractedSlots || {}) };
        if (toolName === 'create_callback') {
          if (toolArgs.customerName) currentSlots.customer_name = currentSlots.customer_name || toolArgs.customerName;
          if (toolArgs.customerPhone) currentSlots.phone = currentSlots.phone || toolArgs.customerPhone;
        }
        const missingSlots = preconditions.requiredSlots.filter(
          slot => !currentSlots[slot] || String(currentSlots[slot]).trim() === ''
        );

        if (missingSlots.length > 0) {
          console.log(`⚠️ [ToolLoop] Precondition FAILED for ${toolName}: missing [${missingSlots.join(', ')}]`);

          const guidanceMsg = toolName === 'create_callback'
            ? buildCallbackMissingGuidance(missingSlots, language)
            : preconditions.guidance?.[language]
            || preconditions.guidance?.TR
            || `Missing required info: ${missingSlots.join(', ')}`;

          // NON-TERMINAL: Send guidance back to LLM as function response
          functionResponses.push({
            functionResponse: {
              name: toolName,
              response: { message: guidanceMsg }
            }
          });
          continue; // Skip tool execution, proceed to next function call
        }
      }

      // Deterministic repeat breaker for NOT_FOUND / NEED_MORE_INFO outcomes.
      const currentArgsHash = computeArgsHash(toolArgs);
      const repeatGuardResult = shouldBlockRepeatedToolCall({
        state,
        toolName,
        argsHash: currentArgsHash,
        language
      });
      if (repeatGuardResult.blocked) {
        console.log(`🔁 [ToolLoop] Repeat call blocked: ${toolName} hash=${currentArgsHash} outcome=${repeatGuardResult.outcome}`);
        const repeatMessageType = normalizeOutcome(repeatGuardResult.outcome) === ToolOutcome.DENIED
          ? 'system_barrier'
          : 'clarification';
        return {
          reply: repeatGuardResult.message,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          hadToolSuccess: true,
          hadToolFailure: false,
          failedTool: null,
          toolsCalled,
          toolResults,
          iterations,
          chat: null,
          _terminalState: repeatGuardResult.outcome,
          _terminalMessageType: repeatMessageType,
          _repeatNotFoundBlocked: true,
          _responseOrigin: RESPONSE_ORIGIN.TEMPLATE,
          _originId: `repeatGuard.${repeatGuardResult.outcome || ToolOutcome.NEED_MORE_INFO}`,
          _llmCalled: llmCalled,
          _llmStatus: 'success'
        };
      }

      const toolStartTime = Date.now();

      // IDEMPOTENCY CHECK: Has this tool already been executed for this messageId?
      const idempotencyKey = {
        businessId: business.id,
        channel,
        messageId,
        toolName
      };

      const cachedResult = await getToolExecutionResult(idempotencyKey);

      let toolResult;

      // ════════════════════════════════════════════════════════════════════
      // TEST_MOCK_TOOLS HOOK (test-only, zero production impact)
      // ════════════════════════════════════════════════════════════════════
      // When TEST_MOCK_TOOLS=1 and state._mockToolOutputs has a fixture
      // for this tool, return the fixture instead of calling the real tool.
      // This enables deterministic golden suite testing without side-effects.
      // ════════════════════════════════════════════════════════════════════
      if (
        process.env.TEST_MOCK_TOOLS === '1' &&
        state._mockToolOutputs &&
        state._mockToolOutputs[toolName]
      ) {
        toolResult = { ...state._mockToolOutputs[toolName] };
        console.log(`🧪 [ToolLoop] TEST_MOCK_TOOLS: Using mock fixture for ${toolName} (outcome=${toolResult.outcome})`);
      } else if (cachedResult) {
        // Use cached result (prevents duplicate operations)
        console.log(`♻️ [ToolLoop] Using cached result for ${toolName} (duplicate messageId)`);
        toolResult = cachedResult;
      } else {
        // Execute tool with retry
        toolResult = await executeToolWithRetry(
          async (name, args) => {
            // executeTool signature: (toolName, args, business, context)
            return await executeTool(name, args, business, {
              state,
              language,
              sessionId,
              conversationId: sessionId, // Links callback → ChatLog (callId = ChatLog.sessionId)
              messageId, // For tool-level idempotency
              channel,
              channelUserId,  // Channel identity signal for identity proof
              conversationHistory, // For topic generation in create_callback
              extractedSlots: state.extractedSlots || {} // Pass extractedSlots for argument normalization
            });
          },
          toolName,
          toolArgs,
          1 // maxRetries (1 retry = 2 total attempts)
        );

        // CACHE RESULT: Store for future duplicate requests
        if (toolResult.success) {
          await setToolExecutionResult(idempotencyKey, toolResult);
        }
      }

      const toolExecutionTime = Date.now() - toolStartTime;

      // Apply tool fail policy
      const failPolicyResult = applyToolFailPolicy({
        toolResult,
        toolName,
        language,
        channel,
        sessionId,
        executionTime: toolExecutionTime,
        metrics
      });

      if (failPolicyResult) {
        // Tool failed - return forced template immediately
        console.error(`❌ [ToolLoop] Tool ${toolName} failed, returning forced response`);

        hadToolFailure = true;
        failedTool = toolName;

        return {
          reply: failPolicyResult.reply,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          hadToolSuccess: false,
          hadToolFailure: true,
          failedTool: toolName,
          toolsCalled,
          metadata: failPolicyResult.metadata,
          _responseOrigin: RESPONSE_ORIGIN.TEMPLATE,
          _originId: failPolicyResult?.metadata?.messageKey || `toolFailPolicy.${toolName || 'unknown'}`,
          _llmCalled: llmCalled,
          _llmStatus: 'success'
        };
      }

      // Tool succeeded
      hadToolSuccess = true;

      // Collect tool result for guardrails (for NOT_FOUND detection etc.)
      // P1-FIX: Standardized format - always use explicit null instead of fallbacks
      toolResults.push({
        name: toolName,
        success: toolResult.success ?? false,
        output: toolResult.data ?? null, // Don't fallback to full toolResult - keep clean
        outcome: toolResult.outcome ?? null,
        message: toolResult.message ?? null,
        askFor: toolResult.askFor || toolResult.data?.askFor || null,
        field: toolResult.field ?? null,
        expectedFormat: toolResult.expectedFormat ?? null,
        promptStyle: toolResult.promptStyle ?? null,
        validationCode: toolResult.validationCode ?? null,
        stateEvents: toolResult.stateEvents ?? [],
        _identityContext: toolResult._identityContext ?? null
      });

      console.log(`📊 [ToolLoop] Tool result collected:`, {
        name: toolName,
        outcome: toolResult.outcome,
        success: toolResult.success,
        hasData: !!toolResult.data
      });

      // Store tool result for state updates
      if (toolResult.data) {
        // Update anchor with tool truth
        if (toolName === 'customer_data_lookup') {
          state.anchor = {
            truth: toolResult.data,
            timestamp: new Date().toISOString()
          };
        }

        // Stock tool results → write to anchor so classifier knows context
        if (toolName === 'check_stock_crm' || toolName === 'get_product_stock') {
          const matchType = toolResult.data.match_type; // EXACT_SKU | MULTIPLE_CANDIDATES
          state.anchor = {
            type: 'STOCK',
            stock: {
              matchType,
              productName: toolResult.data.product_name || toolResult.data.title || toolResult.data.search_term,
              availability: toolResult.data.availability || null,
              disambiguationRequired: !!toolResult.data.disambiguation_required
            },
            timestamp: new Date().toISOString()
          };
          state.activeFlow = 'STOCK_CHECK';
          state.flowStatus = matchType === 'EXACT_SKU' ? 'post_result' : 'in_progress';

          // Stock flows NEVER need PII verification — clear any stale verification state
          if (state.verification?.status === 'pending') {
            console.log('🧹 [ToolLoop] Clearing stale verification — stock flow does not require PII');
            state.verification = { status: 'none' };
          }

          console.log(`📦 [ToolLoop] Stock anchor set: matchType=${matchType}, flow=STOCK_CHECK`);
        }

        // Store callback ID for tracking
        if (toolName === 'create_callback' && toolResult.data.callbackId) {
          state.lastCallbackId = toolResult.data.callbackId;
          if (state.callbackFlow) {
            state.callbackFlow.pending = false;
            state.callbackFlow.completedAt = new Date().toISOString();
            state.callbackFlow.missingFields = [];
          }
        }
      }

      // ════════════════════════════════════════════════════════════════════
      // CHANNEL IDENTITY PROOF AUTOVERIFY (Shared Helper)
      // ════════════════════════════════════════════════════════════════════
      const autoverifyResult = await tryAutoverify({
        toolResult, toolName, business, state, language, metrics
      });

      if (autoverifyResult.applied) {
        // Update the collected toolResult in toolResults array
        const lastToolResult = toolResults[toolResults.length - 1];
        if (lastToolResult && lastToolResult.name === toolName) {
          lastToolResult.outcome = ToolOutcome.OK;
          lastToolResult.output = toolResult.data;
          lastToolResult.message = toolResult.message;
          lastToolResult.stateEvents = toolResult.stateEvents;
        }

        // Update anchor with verified tool truth
        if (toolName === 'customer_data_lookup') {
          state.anchor = {
            truth: toolResult.data,
            timestamp: new Date().toISOString()
          };
        }
      }

      // Stamp argsHash on toolResult for state tracking (repeat NOT_FOUND detection)
      if (currentArgsHash) {
        toolResult._argsHash = currentArgsHash;
      }

      // Apply centralized outcome -> state events (single writer: orchestrator)
      // Controlled by USE_STATE_EVENTS flag. Set FEATURE_USE_STATE_EVENTS=false to revert.
      const useStateEvents = process.env.FEATURE_USE_STATE_EVENTS !== 'false';
      if (useStateEvents) {
        const outcomeEvents = deriveOutcomeEvents({ toolName, toolResult });
        if (outcomeEvents.length > 0) {
          applyOutcomeEventsToState(state, outcomeEvents);
          console.log('🧭 [ToolLoop] Applied outcome events:', outcomeEvents.map(e => e.type));
        }
      } else {
        console.log('🚩 [ToolLoop] USE_STATE_EVENTS=false, skipping centralized event pipeline');
      }

      const outcome = normalizeOutcome(toolResult.outcome);
      trackRepeatableOutcome({
        state,
        toolName,
        argsHash: currentArgsHash,
        outcome,
        toolResult
      });

      if (shouldAskVerification(outcome)) {
        console.log('🔐 [ToolLoop] Verification required outcome received');
      }

      // Terminal outcomes are decided by centralized outcome policy.
      if (shouldTerminate(outcome)) {
        if (outcome === ToolOutcome.NOT_FOUND) {
          console.log(`📭 [ToolLoop] NOT_FOUND terminal state - stopping loop, NOT sending to LLM`);

          // Count NOT_FOUND only when probing signal is suspicious (rapid/sequential).
          const enumerationResult = await checkEnumerationAttempt(sessionId, {
            mode: 'not_found',
            signal: {
              userMessage,
              toolName
            }
          });
          if (enumerationResult.shouldBlock) {
            console.log('🚨 [ToolLoop] Session blocked after suspicious NOT_FOUND pattern');
          }

          responseText = toolResult.message || GENERIC_ERROR_MESSAGES[language] || GENERIC_ERROR_MESSAGES.TR;

          return {
            reply: responseText,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            hadToolSuccess: true,
            hadToolFailure: false,
            failedTool: null,
            toolsCalled,
            toolResults,
            iterations,
            chat: null,
            _terminalState: ToolOutcome.NOT_FOUND,
            _terminalMessageType: 'clarification',
            _enumerationCount: enumerationResult.attempts,
            _enumerationCounted: enumerationResult.counted,
            _responseOrigin: RESPONSE_ORIGIN.FALLBACK,
            _originId: `tool.${toolName || 'unknown'}.${ToolOutcome.NOT_FOUND}`,
            _llmCalled: llmCalled,
            _llmStatus: 'success'
          };
        }

        console.log(`⚠️ [ToolLoop] ${outcome || toolResult.outcome} terminal state - stopping loop`);
        responseText = toolResult.message || GENERIC_ERROR_MESSAGES[language] || GENERIC_ERROR_MESSAGES.TR;

        return {
          reply: responseText,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          hadToolSuccess: true,
          hadToolFailure: false,
          failedTool: null,
          toolsCalled,
          toolResults,
          iterations,
          chat: null,
          _terminalState: outcome || 'TERMINAL',
          _terminalMessageType: (outcome === ToolOutcome.DENIED || outcome === ToolOutcome.INFRA_ERROR)
            ? 'system_barrier'
            : 'clarification',
          _responseOrigin: RESPONSE_ORIGIN.FALLBACK,
          _originId: `tool.${toolName || 'unknown'}.${outcome || 'TERMINAL'}`,
          _llmCalled: llmCalled,
          _llmStatus: 'success'
        };
      }

      // LLM-FIRST: Show outcome to LLM so it can decide next action naturally.
      // Strip only internal/anchor data — outcome + message are visible.
      const responseData = {
        outcome: outcome || 'UNKNOWN',
        message: toolResult.message || null
      };

      // Include data only if outcome is OK (verified data)
      // VERIFICATION_REQUIRED: Don't leak anchor/internal data to LLM
      if (outcome === ToolOutcome.OK && toolResult.data) {
        responseData.data = toolResult.data;
      }

      // For VERIFICATION_REQUIRED, include askFor hint so LLM knows what to ask
      if (outcome === ToolOutcome.VERIFICATION_REQUIRED && toolResult._identityContext?.askFor) {
        responseData.askFor = toolResult._identityContext.askFor;
      }

      console.log(`📤 [ToolLoop] functionResponse for ${toolName}:`, {
        outcome,
        sentToLLM: JSON.stringify(responseData)
      });

      functionResponses.push({
        functionResponse: {
          name: toolName,
          response: responseData
        }
      });
    }

    // Send function responses back to LLM
    result = await sendMessageWithRetry(chat, functionResponses, {
      label: `tool_loop.iteration_${iterations}_followup`
    });

    totalInputTokens += result.response.usageMetadata?.promptTokenCount || 0;
    totalOutputTokens += result.response.usageMetadata?.candidatesTokenCount || 0;
  }

  // Check if we hit max iterations
  if (iterations >= MAX_ITERATIONS) {
    console.warn(`⚠️ [ToolLoop] Hit max iterations (${MAX_ITERATIONS})`);
    responseText = result.response.text() || '';
  }

  // EMPTY-REPLY GUARD: If responseText is still empty after tool loop, get final text from last result
  if (!responseText && result) {
    responseText = result.response.text() || '';
    console.warn(`⚠️ [ToolLoop] Empty response after tool loop, extracted: "${responseText.substring(0, 50)}..."`);
  }

  // FINAL FALLBACK: If still empty, return a user-friendly message
  // NOTE: This should never happen — if it does, it's a bug to investigate
  if (!responseText) {
    console.error('❌ [ToolLoop] CRITICAL: No response text after all attempts');
    responseText = language === 'TR'
      ? 'Bir sorun oluştu. Lütfen tekrar deneyin veya farklı bir şekilde sorunuzu iletin.'
      : 'Something went wrong. Please try again or rephrase your question.';
    usedFinalFallback = true;
  }

  return {
    reply: responseText,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    hadToolSuccess,
    hadToolFailure,
    failedTool,
    toolsCalled,
    toolResults, // For guardrails (NOT_FOUND detection etc.)
    iterations,
    chat, // Return chat session for potential correction
    _responseOrigin: usedFinalFallback ? RESPONSE_ORIGIN.FALLBACK : RESPONSE_ORIGIN.LLM,
    _originId: usedFinalFallback ? 'toolLoop.emptyResponseFallback' : 'toolLoop.finalModelResponse',
    _llmCalled: llmCalled,
    _llmStatus: 'success'
  };
}

export default { executeToolLoop };
