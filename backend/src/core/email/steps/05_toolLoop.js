/**
 * Step 5: Tool Loop for Email (Gemini Orchestrator-Driven)
 *
 * Same architecture as chat's 06_toolLoop.js:
 * - Gemini 2.5-flash with function calling
 * - Orchestrator-driven tool execution (NOT LLM-driven)
 * - Max 3 iterations
 * - Autoverify, outcome events, state management
 *
 * Produces: ctx.draftContent, ctx.toolResults, token metrics
 */

import { getGeminiModel } from '../../../services/gemini-utils.js';
import { executeTool } from '../../../tools/index.js';
import { ToolOutcome, normalizeOutcome, GENERIC_ERROR_MESSAGES } from '../../../tools/toolResult.js';
import { tryAutoverify } from '../../../security/autoverify.js';
import { deriveOutcomeEvents, applyOutcomeEventsToState, shouldTerminate } from '../../../security/outcomePolicy.js';
import {
  hydrateLookupArgsWithVerificationInput
} from './06_generateDraft.js';

const MAX_ITERATIONS = 3;
const TOOL_ALIASES = Object.freeze({
  check_order_status: 'customer_data_lookup',
  check_order_status_crm: 'customer_data_lookup',
  get_tracking_info: 'customer_data_lookup',
  order_search: 'customer_data_lookup',
  appointment_lookup: 'customer_data_lookup',
  search_products: 'get_product_stock',
  product_lookup: 'get_product_stock',
  inventory_check: 'check_stock_crm',
  price_check: 'check_stock_crm'
});

const ALIAS_DEFAULT_ARGS = Object.freeze({
  check_order_status: { query_type: 'siparis' },
  check_order_status_crm: { query_type: 'siparis' },
  get_tracking_info: { query_type: 'siparis' },
  order_search: { query_type: 'siparis' },
  appointment_lookup: { query_type: 'randevu' }
});

const ORDER_NUMBER_PATTERN = /\b(?:B\d+-ORD-\d{4}-\d+|ORD-\d{4}-\d+)\b/i;
const TICKET_NUMBER_PATTERN = /\b(?:TKT-\d{4}-\d+|SRV-\d{4}-\d+)\b/i;
const FULL_PHONE_PATTERN = /(?:\+?90|0)?5\d{9}\b/;
const LOOKUP_INTENTS = new Set([
  'ORDER',
  'TRACKING',
  'RETURN',
  'REFUND',
  'COMPLAINT',
  'SUPPORT',
  'APPOINTMENT',
  'BILLING',
  'ACCOUNT'
]);

function getIntentQueryType(intent) {
  const normalizedIntent = String(intent || '').toUpperCase();
  switch (normalizedIntent) {
    case 'SUPPORT':
      return 'ariza';
    case 'APPOINTMENT':
      return 'randevu';
    case 'BILLING':
      return 'muhasebe';
    default:
      return 'siparis';
  }
}

function getInboundText(ctx) {
  return String(ctx?.inboundMessage?.bodyText || ctx?.inboundMessage?.body || '').trim();
}

function collectLookupTextCandidates(ctx) {
  const candidates = [];

  const push = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return;
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  push(getInboundText(ctx));
  push(ctx?.inboundMessage?.snippet);
  push(ctx?.subject);

  if (Array.isArray(ctx?.threadMessages)) {
    for (let idx = ctx.threadMessages.length - 1; idx >= 0; idx--) {
      const msg = ctx.threadMessages[idx];
      const direction = String(msg?.direction || '').toUpperCase();
      if (direction !== 'INBOUND') continue;
      push(msg?.body || msg?.content);
      if (candidates.length >= 8) {
        break;
      }
    }
  }

  return candidates;
}

function firstPatternMatch(pattern, texts = []) {
  for (const text of texts) {
    const match = String(text || '').match(pattern);
    if (match?.[0]) {
      return match[0].trim();
    }
  }
  return null;
}

function getEmailVerificationState(emailVerificationState) {
  const state = emailVerificationState || { verification: { status: 'none' } };
  const verificationStatus = state?.verification?.status || state?.verificationStatus || 'none';
  const isPending = verificationStatus === 'pending' || verificationStatus === 'failed';
  const anchor = state?.verification?.anchor || state?.verificationAnchor || null;
  return { state, verificationStatus, isPending, anchor };
}

function hasLookupIdentifier(toolArgs) {
  return Boolean(
    toolArgs?.order_number ||
    toolArgs?.ticket_number ||
    toolArgs?.phone ||
    toolArgs?.vkn ||
    toolArgs?.tc
  );
}

function isContextlessLast4Message(text) {
  return /^\d{4}$/.test(String(text || '').trim());
}

function shouldSuppressContextlessLookup({ executionToolName, toolArgs, ctx, verificationInfo }) {
  if (executionToolName !== 'customer_data_lookup') return false;
  if (verificationInfo.isPending) return false;

  const inboundText = getInboundText(ctx);
  if (!isContextlessLast4Message(inboundText)) return false;

  const orderCandidate = String(toolArgs?.order_number || '').trim();
  const ticketCandidate = String(toolArgs?.ticket_number || '').trim();
  const phoneCandidate = String(toolArgs?.phone || '').trim();
  const hasStrongIdentifier =
    ORDER_NUMBER_PATTERN.test(orderCandidate) ||
    TICKET_NUMBER_PATTERN.test(ticketCandidate) ||
    String(phoneCandidate).replace(/\D/g, '').length >= 10;

  return !hasStrongIdentifier;
}

function buildDeterministicLookupArgs(ctx, verificationInfo) {
  const intent = String(ctx?.classification?.intent || '').toUpperCase();
  const inboundText = getInboundText(ctx);
  const textCandidates = collectLookupTextCandidates(ctx);

  if (!verificationInfo.isPending && !LOOKUP_INTENTS.has(intent)) {
    return null;
  }

  const orderNumber = firstPatternMatch(ORDER_NUMBER_PATTERN, textCandidates);
  const ticketNumber = firstPatternMatch(TICKET_NUMBER_PATTERN, textCandidates);
  const rawPhone = firstPatternMatch(FULL_PHONE_PATTERN, textCandidates);
  const normalizedPhone = rawPhone ? rawPhone.replace(/[^\d+]/g, '') : null;

  // Avoid lookup on bare 4-digit messages unless verification is already pending.
  if (!verificationInfo.isPending && isContextlessLast4Message(inboundText) && !orderNumber && !ticketNumber) {
    return null;
  }

  let args = {
    query_type: getIntentQueryType(intent)
  };

  if (orderNumber) args.order_number = orderNumber;
  if (ticketNumber) args.ticket_number = ticketNumber;
  if (!orderNumber && normalizedPhone && normalizedPhone.replace(/\D/g, '').length >= 10) {
    args.phone = normalizedPhone;
  }

  if (verificationInfo.anchor) {
    const anchor = verificationInfo.anchor;
    if (!args.order_number && anchor.anchorType === 'order' && anchor.anchorValue) {
      args.order_number = anchor.anchorValue;
    }
    if (!args.ticket_number && anchor.anchorType === 'ticket' && anchor.anchorValue) {
      args.ticket_number = anchor.anchorValue;
      args.query_type = 'ariza';
    }
    if (!args.phone && anchor.phone && String(anchor.phone).replace(/\D/g, '').length >= 10) {
      args.phone = anchor.phone;
    }
  }

  if (verificationInfo.isPending) {
    const hydrated = hydrateLookupArgsWithVerificationInput({
      toolName: 'customer_data_lookup',
      toolArgs: args,
      emailState: verificationInfo.state,
      inboundMessage: ctx.inboundMessage,
      threadMessages: ctx.threadMessages
    });
    args = hydrated.args;
  }

  if (!hasLookupIdentifier(args)) {
    return null;
  }

  return args;
}

function resolveToolAliasForEmail(requestedToolName, gatedTools = []) {
  const normalizedRequested = String(requestedToolName || '').trim();
  const gated = Array.isArray(gatedTools) ? gatedTools : [];

  if (gated.includes(normalizedRequested)) {
    return {
      requestedToolName: normalizedRequested,
      executionToolName: normalizedRequested,
      aliasApplied: false
    };
  }

  const alias = TOOL_ALIASES[normalizedRequested];
  if (alias && gated.includes(alias)) {
    return {
      requestedToolName: normalizedRequested,
      executionToolName: alias,
      aliasApplied: true
    };
  }

  return {
    requestedToolName: normalizedRequested,
    executionToolName: normalizedRequested,
    aliasApplied: false
  };
}

function applyAliasDefaultArgs(requestedToolName, executionToolName, toolArgs) {
  const args = { ...(toolArgs || {}) };
  if (executionToolName === 'customer_data_lookup' && !args.query_type) {
    const defaults = ALIAS_DEFAULT_ARGS[requestedToolName];
    if (defaults?.query_type) {
      args.query_type = defaults.query_type;
    }
  }
  return args;
}

/**
 * Execute email tool loop with Gemini
 *
 * @param {Object} ctx - Pipeline context (must have systemPrompt, userPrompt, gatedToolDefs, etc.)
 * @returns {Promise<Object>} { success, inputTokens, outputTokens }
 */
export async function executeEmailToolLoop(ctx) {
  const {
    business,
    language,
    gatedToolDefs,
    gatedTools: rawGatedTools
  } = ctx;
  const gatedTools = Array.isArray(rawGatedTools) ? rawGatedTools : [];

  ctx.toolResults = [];

  // If no tools available or systemPrompt not yet built, skip tool loop
  if (!ctx.systemPrompt || !ctx.userPrompt) {
    console.log('📧 [EmailToolLoop] No prompts built yet, skipping tool loop');
    return { success: true };
  }

  const hasTools = gatedToolDefs && gatedToolDefs.length > 0;

  try {
    // Build Gemini model with tools
    const model = getGeminiModel({
      model: 'gemini-2.5-flash',
      temperature: 0.7,
      maxOutputTokens: 1500,
      tools: hasTools ? gatedToolDefs : null
    });

    // Build chat history with system prompt
    const chatHistory = [
      {
        role: 'user',
        parts: [{ text: `SİSTEM TALİMATLARI (bunları müşteriye gösterme):\n${ctx.systemPrompt}` }]
      },
      {
        role: 'model',
        parts: [{ text: 'Anladım, bu talimatlara göre e-posta taslağı oluşturacağım.' }]
      }
    ];

    // Start chat session
    const chat = model.startChat({ history: chatHistory });

    // Send user prompt (the email to reply to)
    let result = await chat.sendMessage(ctx.userPrompt);

    let totalInputTokens = result.response.usageMetadata?.promptTokenCount || 0;
    let totalOutputTokens = result.response.usageMetadata?.candidatesTokenCount || 0;

    let iterations = 0;
    let responseText = '';
    let forcedLookupAttempted = false;

    // Try to get initial text
    try {
      responseText = result.response.text() || '';
    } catch {
      // text() may throw if response only has function calls
    }

    console.log('📧 [EmailToolLoop] Initial response:', {
      hasText: !!responseText,
      hasFunctionCalls: !!(result.response.functionCalls()?.length),
      functionCallCount: result.response.functionCalls()?.length || 0
    });

    // Tool calling loop (orchestrator-driven, same as chat)
    while (iterations < MAX_ITERATIONS) {
      const functionCalls = result.response.functionCalls();

      if (!functionCalls || functionCalls.length === 0) {
        const verificationInfo = getEmailVerificationState(ctx.emailVerificationState);
        const intent = String(ctx?.classification?.intent || '').toUpperCase();
        const hasCustomerLookupCall = ctx.toolResults.some(
          (toolResult) => toolResult.toolName === 'customer_data_lookup'
        );
        const shouldTryDeterministicLookup = (
          !forcedLookupAttempted &&
          gatedTools.includes('customer_data_lookup') &&
          !hasCustomerLookupCall &&
          (verificationInfo.isPending || LOOKUP_INTENTS.has(intent))
        );

        if (shouldTryDeterministicLookup) {
          const forcedArgs = buildDeterministicLookupArgs(ctx, verificationInfo);
          forcedLookupAttempted = true;

          if (forcedArgs) {
            iterations++;
            console.log('🧭 [EmailToolLoop] Deterministic fallback lookup:', {
              intent,
              query_type: forcedArgs.query_type,
              hasOrder: !!forcedArgs.order_number,
              hasTicket: !!forcedArgs.ticket_number,
              hasPhone: !!forcedArgs.phone,
              hasVerificationInput: !!forcedArgs.verification_input
            });

            const toolResult = await executeTool('customer_data_lookup', forcedArgs, business, {
              channel: 'EMAIL',
              fromEmail: ctx.customerEmail || null,
              sessionId: ctx.thread?.id,
              messageId: ctx.inboundMessage?.id,
              language,
              state: verificationInfo.state
            });

            const autoverifyResult = await tryAutoverify({
              toolResult,
              toolName: 'customer_data_lookup',
              business,
              state: verificationInfo.state,
              language,
              metrics: ctx.metrics
            });
            if (autoverifyResult.applied) {
              console.log('📧 [EmailToolLoop] Autoverify succeeded (deterministic fallback)');
            }

            const outcomeEvents = deriveOutcomeEvents({ toolName: 'customer_data_lookup', toolResult });
            if (outcomeEvents.length > 0) {
              applyOutcomeEventsToState(verificationInfo.state, outcomeEvents);
              console.log('🧭 [EmailToolLoop] Applied fallback outcome events:', outcomeEvents.map(e => e.type));
            }

            // SECURITY GUARD: Block unverified OK in deterministic fallback path.
            // Same logic as LLM-driven path — if verification was pending but no valid
            // verification_input was in the args, an OK result is spurious.
            const fallbackPostOutcome = normalizeOutcome(toolResult.outcome);
            if (
              fallbackPostOutcome === ToolOutcome.OK &&
              verificationInfo.isPending &&
              !forcedArgs.verification_input
            ) {
              console.warn('🚨 [EmailToolLoop] SECURITY: Blocking unverified OK in deterministic fallback — verification was pending but no input provided');
              toolResult.outcome = ToolOutcome.VERIFICATION_REQUIRED;
              toolResult.data = null;
              toolResult.message = language === 'TR'
                ? 'Güvenlik doğrulaması için kayıtlı telefon numaranızın son 4 hanesini paylaşır mısınız?'
                : 'For security verification, could you share the last 4 digits of your registered phone number?';

              verificationInfo.state.verification = verificationInfo.state.verification || {};
              verificationInfo.state.verification.status = 'pending';
              verificationInfo.state.verification.pendingField = verificationInfo.state.verification.pendingField || 'phone_last4';
            }

            const outcome = normalizeOutcome(toolResult.outcome);
            const askForField = toolResult.askFor || toolResult.data?.askFor || null;
            ctx.toolResults.push({
              toolName: 'customer_data_lookup',
              requestedToolName: 'customer_data_lookup',
              args: forcedArgs,
              outcome: outcome || (toolResult.success ? ToolOutcome.OK : ToolOutcome.INFRA_ERROR),
              success: toolResult.success,
              data: toolResult.data || null,
              message: toolResult.message,
              askFor: askForField,
              _askFor: askForField || toolResult._askFor || toolResult.askFor || null,
              _identityContext: toolResult._identityContext ?? null
            });

            if (outcome === ToolOutcome.OK && toolResult.data) {
              ctx.customerData = toolResult.data;
            }

            if (shouldTerminate(outcome)) {
              ctx._terminalState = outcome;
            }

            const responseData = {
              outcome: outcome || 'UNKNOWN',
              message: toolResult.message || null
            };
            if (outcome === ToolOutcome.OK && toolResult.data) {
              responseData.data = toolResult.data;
            }

            result = await chat.sendMessage([{
              functionResponse: {
                name: 'customer_data_lookup',
                response: responseData
              }
            }]);

            totalInputTokens += result.response.usageMetadata?.promptTokenCount || 0;
            totalOutputTokens += result.response.usageMetadata?.candidatesTokenCount || 0;
            try {
              responseText = result.response.text() || responseText;
            } catch { /* keep existing */ }

            if (ctx._terminalState) {
              break;
            }
            continue;
          }
        }

        // No more tool calls — LLM returned text response
        try {
          responseText = result.response.text() || responseText;
        } catch { /* keep existing */ }
        break;
      }

      iterations++;
      console.log(`🔄 [EmailToolLoop] Iteration ${iterations}/${MAX_ITERATIONS}: ${functionCalls.length} tool call(s)`);

      const functionResponses = [];

      for (const functionCall of functionCalls) {
        const toolName = functionCall.name;
        let toolArgs = functionCall.args || {};
        const resolvedTool = resolveToolAliasForEmail(toolName, gatedTools);
        const requestedToolName = resolvedTool.requestedToolName;
        const executionToolName = resolvedTool.executionToolName;

        console.log(`🔧 [EmailToolLoop] Calling tool: ${toolName}`, Object.keys(toolArgs));

        // Check if tool is in gated list (directly or via alias)
        if (!gatedTools.includes(executionToolName)) {
          console.warn(`⚠️ [EmailToolLoop] Tool ${toolName} not in gated list, skipping`);
          functionResponses.push({
            functionResponse: {
              name: requestedToolName,
              response: { message: 'Tool not available for email drafts.' }
            }
          });
          continue;
        }

        if (resolvedTool.aliasApplied) {
          toolArgs = applyAliasDefaultArgs(requestedToolName, executionToolName, toolArgs);
          console.log(`♻️ [EmailToolLoop] Tool alias: ${requestedToolName} -> ${executionToolName}`);
        }

        // Hydrate verification input from email thread (email-specific)
        const emailState = ctx.emailVerificationState || { verification: { status: 'none' } };
        const hydrateResult = hydrateLookupArgsWithVerificationInput({
          toolName: executionToolName,
          toolArgs,
          emailState,
          inboundMessage: ctx.inboundMessage,
          threadMessages: ctx.threadMessages
        });
        if (hydrateResult.hydrated) {
          toolArgs = hydrateResult.args;
          console.log(`📧 [EmailToolLoop] Hydrated verification_input for ${executionToolName} (askFor=${hydrateResult.askForField})`);
        }

        const verificationInfo = getEmailVerificationState(emailState);
        const verificationWasPending = verificationInfo.isPending;
        if (shouldSuppressContextlessLookup({
          executionToolName,
          toolArgs,
          ctx,
          verificationInfo
        })) {
          console.log('🛑 [EmailToolLoop] Suppressing contextless lookup call (last4 without anchor)');
          functionResponses.push({
            functionResponse: {
              name: requestedToolName,
              response: {
                outcome: ToolOutcome.NEED_MORE_INFO,
                message: language === 'TR'
                  ? 'Size yardımcı olabilmem için sipariş numaranızı paylaşır mısınız?'
                  : 'Could you share your order number so I can help you?'
              }
            }
          });
          continue;
        }

        // Execute tool (orchestrator-driven, not LLM)
        const toolResult = await executeTool(executionToolName, toolArgs, business, {
          channel: 'EMAIL',
          fromEmail: ctx.customerEmail || null,
          sessionId: ctx.thread?.id,
          messageId: ctx.inboundMessage?.id,
          language,
          state: emailState
        });

        // Attempt autoverify using email identity
        const autoverifyResult = await tryAutoverify({
          toolResult,
          toolName: executionToolName,
          business,
          state: emailState,
          language,
          metrics: ctx.metrics
        });

        if (autoverifyResult.applied) {
          console.log('📧 [EmailToolLoop] Autoverify succeeded');
        }

        // Apply outcome events to email verification state
        const outcomeEvents = deriveOutcomeEvents({ toolName: executionToolName, toolResult });
        if (outcomeEvents.length > 0) {
          applyOutcomeEventsToState(emailState, outcomeEvents);
          console.log('🧭 [EmailToolLoop] Applied outcome events:', outcomeEvents.map(e => e.type));
        }

        // SECURITY GUARD: Block unverified OK results for customer_data_lookup.
        // If verification was pending/failed BEFORE this call and the tool returned OK
        // but no valid verification input was hydrated from the email, the OK is spurious
        // (LLM non-determinism). Override to VERIFICATION_REQUIRED to prevent PII leakage.
        const postOutcome = normalizeOutcome(toolResult.outcome);
        if (
          executionToolName === 'customer_data_lookup' &&
          postOutcome === ToolOutcome.OK &&
          verificationWasPending &&
          !hydrateResult.hydrated
        ) {
          console.warn('🚨 [EmailToolLoop] SECURITY: Blocking unverified OK — verification was pending but no valid input hydrated');
          toolResult.outcome = ToolOutcome.VERIFICATION_REQUIRED;
          toolResult.data = null;
          toolResult.message = language === 'TR'
            ? 'Güvenlik doğrulaması için kayıtlı telefon numaranızın son 4 hanesini paylaşır mısınız?'
            : 'For security verification, could you share the last 4 digits of your registered phone number?';

          // Revert state to pending (the OK event may have set it to verified)
          emailState.verification = emailState.verification || {};
          emailState.verification.status = 'pending';
          emailState.verification.pendingField = emailState.verification.pendingField || 'phone_last4';
        }

        const outcome = normalizeOutcome(toolResult.outcome);
        const askForField = toolResult.askFor || toolResult.data?.askFor || null;

        // Collect tool result for guardrails
        ctx.toolResults.push({
          toolName: executionToolName,
          requestedToolName,
          args: toolArgs,
          outcome: outcome || (toolResult.success ? ToolOutcome.OK : ToolOutcome.INFRA_ERROR),
          success: toolResult.success,
          data: toolResult.data || null,
          message: toolResult.message,
          askFor: askForField,
          _askFor: askForField || toolResult._askFor || toolResult.askFor || null,
          _identityContext: toolResult._identityContext ?? null
        });

        console.log(`📊 [EmailToolLoop] Tool result:`, {
          name: executionToolName,
          outcome: toolResult.outcome,
          success: toolResult.success,
          hasData: !!toolResult.data
        });

        // If we got customer data, store it
        if (executionToolName === 'customer_data_lookup' && toolResult.success && toolResult.data) {
          ctx.customerData = toolResult.data;

          // Update anchor with tool truth
          emailState.anchor = {
            truth: toolResult.data,
            timestamp: new Date().toISOString()
          };
        }

        // Terminal outcomes — stop loop, return deterministic message
        if (shouldTerminate(outcome)) {
          console.log(`⚠️ [EmailToolLoop] Terminal outcome: ${outcome} — stopping loop`);

          responseText = toolResult.message || GENERIC_ERROR_MESSAGES[language] || GENERIC_ERROR_MESSAGES.TR;

          // Still send to LLM as function response so it can generate natural text
          // But mark that we have a terminal state
          ctx._terminalState = outcome;
        }

        // LLM-FIRST: Show outcome to LLM so it can decide next action naturally.
        const responseData = {
          outcome: outcome || 'UNKNOWN',
          message: toolResult.message || null
        };

        // Only include data if outcome is OK (verified data)
        if (outcome === ToolOutcome.OK && toolResult.data) {
          responseData.data = toolResult.data;
        }

        // For VERIFICATION_REQUIRED, include askFor hint
        if (outcome === ToolOutcome.VERIFICATION_REQUIRED && toolResult._identityContext?.askFor) {
          responseData.askFor = toolResult._identityContext.askFor;
        }

        functionResponses.push({
          functionResponse: {
            name: requestedToolName,
            response: responseData
          }
        });
      }

      // If we hit a terminal state, don't continue the loop
      if (ctx._terminalState) {
        // Send function responses back so LLM can form a response
        try {
          result = await chat.sendMessage(functionResponses);
          totalInputTokens += result.response.usageMetadata?.promptTokenCount || 0;
          totalOutputTokens += result.response.usageMetadata?.candidatesTokenCount || 0;
          try {
            const text = result.response.text();
            if (text) responseText = text;
          } catch { /* keep existing */ }
        } catch (err) {
          console.warn('⚠️ [EmailToolLoop] Failed to send terminal function response:', err.message);
        }
        break;
      }

      // Send function responses back to Gemini for next iteration
      result = await chat.sendMessage(functionResponses);
      totalInputTokens += result.response.usageMetadata?.promptTokenCount || 0;
      totalOutputTokens += result.response.usageMetadata?.candidatesTokenCount || 0;
    }

    // Extract final text
    if (!responseText && result) {
      try {
        responseText = result.response.text() || '';
      } catch { /* empty */ }
    }

    if (iterations >= MAX_ITERATIONS) {
      console.warn(`⚠️ [EmailToolLoop] Hit max iterations (${MAX_ITERATIONS})`);
    }

    // Store draft content and metrics on ctx
    if (responseText) {
      ctx.draftContent = responseText;
    }
    ctx.inputTokens = totalInputTokens;
    ctx.outputTokens = totalOutputTokens;
    ctx.toolLoopIterations = iterations;

    console.log(`📧 [EmailToolLoop] Complete: ${iterations} iterations, ${ctx.toolResults.length} tool calls, draft=${!!responseText}`);

    return {
      success: true,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens
    };

  } catch (error) {
    console.error('❌ [EmailToolLoop] Error:', error);

    // Fail-open: don't block pipeline, Step 6 will handle LLM call without tools
    return {
      success: true,
      error: error.message
    };
  }
}

export default { executeEmailToolLoop };
