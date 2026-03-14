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
    gatedTools
  } = ctx;

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

        console.log(`🔧 [EmailToolLoop] Calling tool: ${toolName}`, Object.keys(toolArgs));

        // Check if tool is in gated list
        if (!gatedTools.includes(toolName)) {
          console.warn(`⚠️ [EmailToolLoop] Tool ${toolName} not in gated list, skipping`);
          functionResponses.push({
            functionResponse: {
              name: toolName,
              response: { message: 'Tool not available for email drafts.' }
            }
          });
          continue;
        }

        // Hydrate verification input from email thread (email-specific)
        const emailState = ctx.emailVerificationState || { verification: { status: 'none' } };
        const hydrateResult = hydrateLookupArgsWithVerificationInput({
          toolName,
          toolArgs,
          emailState,
          inboundMessage: ctx.inboundMessage,
          threadMessages: ctx.threadMessages
        });
        if (hydrateResult.hydrated) {
          toolArgs = hydrateResult.args;
          console.log(`📧 [EmailToolLoop] Hydrated verification_input for ${toolName} (askFor=${hydrateResult.askForField})`);
        }

        // Execute tool (orchestrator-driven, not LLM)
        const toolResult = await executeTool(toolName, toolArgs, business, {
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
          toolName,
          business,
          state: emailState,
          language,
          metrics: ctx.metrics
        });

        if (autoverifyResult.applied) {
          console.log('📧 [EmailToolLoop] Autoverify succeeded');
        }

        // Apply outcome events to email verification state
        const outcomeEvents = deriveOutcomeEvents({ toolName, toolResult });
        if (outcomeEvents.length > 0) {
          applyOutcomeEventsToState(emailState, outcomeEvents);
          console.log('🧭 [EmailToolLoop] Applied outcome events:', outcomeEvents.map(e => e.type));
        }

        const outcome = normalizeOutcome(toolResult.outcome);
        const askForField = toolResult.askFor || toolResult.data?.askFor || null;

        // Collect tool result for guardrails
        ctx.toolResults.push({
          toolName,
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
          name: toolName,
          outcome: toolResult.outcome,
          success: toolResult.success,
          hasData: !!toolResult.data
        });

        // If we got customer data, store it
        if (toolName === 'customer_data_lookup' && toolResult.success && toolResult.data) {
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
            name: toolName,
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
