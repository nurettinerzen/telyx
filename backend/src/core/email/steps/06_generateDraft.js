/**
 * Step 6: Generate Email Draft
 *
 * Uses LLM to generate the draft response.
 * Includes:
 * - Business context and assistant prompt
 * - Knowledge base
 * - Style profile
 * - Tool results (with full contract)
 * - Thread history
 */

import OpenAI from 'openai';
import { getDateTimeContext } from '../../../utils/dateTime.js';
import { buildAssistantPrompt, getActiveTools } from '../../../services/promptBuilder.js';
import {
  retrieveExamplesForPrompt,
  formatExamplesForPrompt
} from '../rag/retrievalService.js';
import {
  selectSnippetsForContext,
  applyVariablesToSnippet,
  formatSnippetsForPrompt,
  recordSnippetUsage
} from '../rag/snippetService.js';
import {
  recordRAGMetrics,
  shouldUseRAG
} from '../rag/ragMetrics.js';
import {
  enforceFactGrounding,
  getFactGroundingInstructions
} from '../policies/toolRequiredPolicy.js';
import { sanitizeToolResults } from '../toolResultSanitizer.js';
import { executeTool } from '../../../tools/index.js';
import { ToolOutcome, normalizeOutcome } from '../../../tools/toolResult.js';
import { tryAutoverify } from '../../../security/autoverify.js';
import { applyOutcomeEventsToState, deriveOutcomeEvents } from '../../../security/outcomePolicy.js';
import {
  estimateTokens,
  recordTokenAccuracy
} from '../promptBudget.js';
import {
  retrieveSimilarPairs,
  formatPairsForPrompt
} from '../../../services/email-pair-retrieval.js';
import { classifyTone } from '../../../services/email-tone-classifier.js';
import { cleanEmailText } from '../../../services/email-text-cleaner.js';
import { buildBusinessIdentity } from '../../../services/businessIdentity.js';
import {
  resolveMentionedEntity,
  ENTITY_MATCH_TYPES,
  getEntityHint,
  getEntityMatchType
} from '../../../services/entityTopicResolver.js';
import {
  determineResponseGrounding,
  RESPONSE_GROUNDING,
  isBusinessClaimCategory
} from '../../../services/responseGrounding.js';
import { logEntityResolver } from '../../../services/entityResolverTelemetry.js';
import { isFeatureEnabled } from '../../../config/feature-flags.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Generate email draft content
 *
 * @param {Object} ctx - Pipeline context
 * @returns {Promise<Object>} { success, inputTokens, outputTokens, error? }
 */
export async function generateEmailDraft(ctx) {
  const {
    businessId,
    business,
    assistant,
    inboundMessage,
    threadMessages,
    knowledgeItems,
    toolResults,
    customerData,
    classification,
    language,
    styleProfile,
    emailSignature,
    signatureType,
    subject,
    customerEmail,
    customerName,
    feedback,
    options = {}
  } = ctx;

  try {
    const ragStartTime = Date.now();
    const effectiveBusinessId = businessId || business?.id;
    const inboundTextForEntity = inboundMessage?.bodyText || inboundMessage?.body || subject || '';

    const businessIdentity = await buildBusinessIdentity({
      business,
      providedKnowledgeItems: knowledgeItems
    });

    const entityResolution = resolveMentionedEntity(inboundTextForEntity, businessIdentity, {
      language
    });

    const { kbConfidence, hasKBMatch } = estimateEmailKbConfidence({
      knowledgeItems,
      entityResolution
    });

    ctx.businessIdentity = businessIdentity;
    ctx.entityResolution = entityResolution;
    ctx.kbConfidence = kbConfidence;
    ctx.hasKBMatch = hasKBMatch;
    ctx.entityResolverTelemetry = logEntityResolver({
      channel: 'EMAIL',
      entityResolution,
      kbConfidence
    });

    const strictGroundingEnabled = isFeatureEnabled('TEXT_STRICT_GROUNDING');
    const businessClaimCategory = isBusinessClaimCategory({
      userMessage: inboundTextForEntity,
      entityResolution,
      businessIdentity
    });

    if (strictGroundingEnabled && businessClaimCategory && (kbConfidence === 'LOW' || !hasKBMatch)) {
      ctx.strictGroundingHint = true;
    }

    // Check business-level RAG settings
    const ragSettings = await shouldUseRAG(effectiveBusinessId, options);

    // Retrieve similar emails for RAG (if enabled)
    let ragExamples = [];
    if (ragSettings.useRAG) {
      try {
        ragExamples = await retrieveExamplesForPrompt({
          businessId: effectiveBusinessId,
          customerEmail: inboundMessage?.bodyText || inboundMessage?.body || '',
          classification,
          maxExamples: ragSettings.maxExamples || 3
        });
        console.log(`📚 [GenerateDraft] Retrieved ${ragExamples.length} RAG examples`);
      } catch (ragError) {
        // RAG failure should not block draft generation
        console.warn('⚠️ [GenerateDraft] RAG retrieval failed:', ragError.message);
      }
    }

    // Select and apply snippets (if enabled)
    let resolvedSnippets = [];
    if (ragSettings.useSnippets) {
      try {
        const selectedSnippets = await selectSnippetsForContext({
          businessId: effectiveBusinessId,
          classification,
          language: language || 'TR',
          ctx,
          maxSnippets: ragSettings.maxSnippets || 2
        });

        // Resolve variables in selected snippets
        for (const snippet of selectedSnippets) {
          const resolved = applyVariablesToSnippet(snippet, snippet.availableVars || {});
          resolvedSnippets.push(resolved);

          // Record usage for analytics
          if (snippet.id) {
            recordSnippetUsage(snippet.id).catch(() => {}); // Fire and forget
          }
        }

        console.log(`📋 [GenerateDraft] Applied ${resolvedSnippets.length} snippets`);
      } catch (snippetError) {
        console.warn('⚠️ [GenerateDraft] Snippet selection failed:', snippetError.message);
      }
    }

    const ragLatencyMs = Date.now() - ragStartTime;

    // NEW: Retrieve similar email PAIRS for tone/style matching
    let similarPairs = [];
    let pairConfidence = 0;
    try {
      // Classify inbound tone first
      const inboundText = inboundMessage?.bodyText || inboundMessage?.body || '';
      const cleanedInbound = cleanEmailText(inboundText, 'INBOUND');
      const toneResult = await classifyTone(cleanedInbound.cleanedText, 'INBOUND');

      similarPairs = await retrieveSimilarPairs({
        businessId: effectiveBusinessId,
        inboundText: cleanedInbound.cleanedText,
        inboundTone: toneResult.tone,
        intent: classification?.intent,
        language: language || 'EN',
        k: 3
      });

      pairConfidence = similarPairs.length > 0
        ? similarPairs[0].totalScore
        : 0;

      console.log(`🎯 [GenerateDraft] Retrieved ${similarPairs.length} similar pairs (confidence: ${(pairConfidence * 100).toFixed(1)}%)`);

      if (similarPairs.length === 0) {
        console.warn('⚠️ [GenerateDraft] No similar pairs found - tone match confidence low');
      }
    } catch (pairError) {
      console.warn('⚠️ [GenerateDraft] Pair retrieval failed:', pairError.message);
    }

    // CRITICAL: Sanitize tool results before LLM
    // - Remove PII-sensitive fields
    // - Slim verbose data
    // - Enforce size limits
    const sanitizedToolResults = toolResults ? sanitizeToolResults(toolResults, {
      strict: false, // Don't be too aggressive - business data is important
      maxTokensPerTool: 3000
    }) : [];

    // Enforce fact grounding for tool-required intents
    const factGrounding = enforceFactGrounding({
      classification,
      toolResults: sanitizedToolResults,
      ragExamples
    });

    // Build system prompt with sanitized tool results
    const systemPrompt = buildEmailSystemPrompt({
      business,
      assistant,
      knowledgeItems,
      toolResults: sanitizedToolResults, // Use sanitized version
      customerData,
      language,
      styleProfile,
      emailSignature,
      signatureType,
      classification,
      ragExamples,
      snippets: resolvedSnippets,
      factGrounding,
      similarPairs, // NEW: Pass similar pairs for tone/style matching
      pairConfidence, // NEW: Pass confidence score
      businessIdentity,
      entityResolution,
      kbConfidence,
      hasKBMatch
    });

    // Build user prompt (the email to reply to)
    const userPrompt = buildEmailUserPrompt({
      inboundMessage,
      threadMessages,
      subject,
      customerEmail,
      customerName,
      feedback
    });

    // ─── LLM call with function calling (tool loop) ──────────────
    const MAX_TOOL_ROUNDS = 3;
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    // Build OpenAI tools array from gated tool definitions
    const openaiTools = (ctx.gatedToolDefs || []).length > 0
      ? ctx.gatedToolDefs.map(t => ({ type: 'function', function: t.function }))
      : undefined;

    let response;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        tools: openaiTools,
        temperature: 0.7,
        max_tokens: 1500
      });

      totalInputTokens += response.usage?.prompt_tokens || 0;
      totalOutputTokens += response.usage?.completion_tokens || 0;

      const assistantMsg = response.choices[0]?.message;

      if (!assistantMsg?.tool_calls || assistantMsg.tool_calls.length === 0) {
        break; // No tool calls — LLM is done, draft is ready
      }

      // LLM wants to call tools — add its message and execute each tool
      messages.push(assistantMsg);

      for (const toolCall of assistantMsg.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs;
        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          toolArgs = {};
        }

        console.log(`📧 [DraftToolLoop] LLM calling: ${toolName}`, Object.keys(toolArgs));

        // Use thread-scoped verification state (persists across drafts)
        const emailState = ctx.emailVerificationState || { verification: { status: 'none' } };

        const result = await executeTool(toolName, toolArgs, business, {
          channel: 'EMAIL',
          fromEmail: ctx.customerEmail || null,
          sessionId: ctx.thread?.id,
          messageId: ctx.inboundMessage?.id,
          language: ctx.language,
          state: emailState
        });

        // Attempt autoverify using email identity
        const autoverifyResult = await tryAutoverify({
          toolResult: result,
          toolName,
          business,
          state: emailState,
          language: ctx.language,
          metrics: ctx.metrics
        });

        if (autoverifyResult.applied) {
          console.log('📧 [DraftToolLoop] Autoverify succeeded');
        }

        // Apply outcome events to email verification state (for TTL + cross-anchor reuse)
        const outcomeEvents = deriveOutcomeEvents({ toolName, toolResult: result });
        if (outcomeEvents.length > 0) {
          applyOutcomeEventsToState(emailState, outcomeEvents);
        }

        // Store tool result for metrics/guardrails
        ctx.toolResults.push({
          toolName,
          args: toolArgs,
          outcome: normalizeOutcome(result.outcome) || (result.success ? ToolOutcome.OK : ToolOutcome.INFRA_ERROR),
          success: result.success,
          data: result.data || null,
          message: result.message
        });

        // If we got customer data, store it prominently
        if (toolName === 'customer_data_lookup' && result.success && result.data) {
          ctx.customerData = result.data;
        }

        // Send tool result back to LLM
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            outcome: result.outcome,
            success: result.success,
            data: result.data,
            message: result.message
          })
        });
      }
    }

    const draftContent = response.choices[0]?.message?.content || '';

    if (!draftContent || draftContent.trim().length === 0) {
      return {
        success: false,
        error: 'LLM returned empty draft'
      };
    }

    const hadToolSuccess = ctx.toolResults.some((toolResult) =>
      normalizeOutcome(toolResult?.outcome) === ToolOutcome.OK
    );

    const groundingDecision = determineResponseGrounding({
      finalResponse: draftContent,
      kbConfidence,
      hasKBMatch,
      hadToolSuccess,
      entityResolution,
      language,
      businessIdentity,
      userMessage: inboundTextForEntity
    });

    let groundedDraftContent = groundingDecision.finalResponse;
    let responseGrounding = groundingDecision.responseGrounding;

    if (groundingDecision.ungroundedDetected) {
      responseGrounding = RESPONSE_GROUNDING.CLARIFICATION;
      groundedDraftContent = groundingDecision.finalResponse;
      console.warn('⚠️ [GenerateDraft] Ungrounded email draft replaced with clarification');
    }

    ctx.responseGrounding = responseGrounding;
    ctx.draftContent = groundedDraftContent;
    ctx.rawLLMResponse = response;

    // Store RAG context for metrics
    ctx.ragExamples = ragExamples;
    ctx.resolvedSnippets = resolvedSnippets;
    ctx.ragSettings = ragSettings;

    const inputTokens = totalInputTokens;
    const outputTokens = totalOutputTokens;

    // Track token estimation accuracy
    // Estimate vs actual from OpenAI API
    const estimatedSystemPrompt = estimateTokens(systemPrompt);
    const estimatedUserPrompt = estimateTokens(userPrompt);
    const estimatedTotal = estimatedSystemPrompt + estimatedUserPrompt;

    recordTokenAccuracy(estimatedTotal, inputTokens, 'total_input');

    if (Math.abs(estimatedTotal - inputTokens) / inputTokens > 0.15) {
      console.warn(`⚠️ [GenerateDraft] Token estimation off by ${Math.round(((estimatedTotal - inputTokens) / inputTokens) * 100)}%`);
    }

    // Record RAG metrics
    recordRAGMetrics({
      businessId: effectiveBusinessId,
      threadId: ctx.threadId,
      retrievalLatencyMs: ragLatencyMs,
      examplesFound: ragExamples.length,
      snippetsFound: resolvedSnippets.length,
      promptTokensBefore: 0, // Would need baseline measurement
      promptTokensAfter: inputTokens,
      ragEnabled: ragSettings.useRAG,
      snippetsEnabled: ragSettings.useSnippets
    });

    return {
      success: true,
      inputTokens,
      outputTokens,
      ragMetrics: {
        latencyMs: ragLatencyMs,
        examplesUsed: ragExamples.length,
        snippetsUsed: resolvedSnippets.length,
        factGroundingEnforced: factGrounding.mustUseVerification
      }
    };

  } catch (error) {
    console.error('❌ [GenerateDraft] Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

function normalizeForCheck(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function estimateEmailKbConfidence({ knowledgeItems, entityResolution }) {
  const hasKnowledge = Array.isArray(knowledgeItems) && knowledgeItems.length > 0;
  if (!hasKnowledge) {
    return {
      kbConfidence: 'LOW',
      hasKBMatch: false
    };
  }

  const matchType = getEntityMatchType(entityResolution);
  const requiresEntityEvidence =
    matchType === ENTITY_MATCH_TYPES.EXACT_MATCH ||
    matchType === ENTITY_MATCH_TYPES.FUZZY_MATCH;

  if (!requiresEntityEvidence) {
    return {
      kbConfidence: 'MEDIUM',
      hasKBMatch: true
    };
  }

  const target = normalizeForCheck(getEntityHint(entityResolution) || '');
  if (!target) {
    return {
      kbConfidence: 'MEDIUM',
      hasKBMatch: true
    };
  }

  const entityFound = knowledgeItems.some(item => {
    const blob = normalizeForCheck([
      item?.title || '',
      item?.question || '',
      item?.answer || '',
      item?.content || '',
      item?.url || ''
    ].join(' '));
    return blob.includes(target);
  });

  return {
    kbConfidence: entityFound ? 'MEDIUM' : 'LOW',
    hasKBMatch: entityFound
  };
}

/**
 * Build system prompt for email draft generation
 */
function buildEmailSystemPrompt({
  business,
  assistant,
  knowledgeItems,
  toolResults,
  customerData,
  language,
  styleProfile,
  emailSignature,
  signatureType,
  classification,
  ragExamples = [],
  snippets = [],
  factGrounding = {},
  similarPairs = [],
  pairConfidence = 0,
  businessIdentity = null,
  entityResolution = null,
  kbConfidence = 'LOW',
  hasKBMatch = false
}) {
  const timezone = business.timezone || 'UTC';
  const dateTimeContext = getDateTimeContext(timezone, language);

  // Base prompt from assistant or default
  let basePrompt = '';
  if (assistant && business) {
    const integrations = business.integrations || [];
    const activeToolsList = getActiveTools(business, integrations);
    basePrompt = buildAssistantPrompt(assistant, business, activeToolsList);
  } else {
    basePrompt = `You are an AI email assistant for ${business.name}, a ${business.businessType?.toLowerCase() || 'general'} business.`;
  }

  // Language instruction
  const languageInstruction = language === 'TR'
    ? 'CRITICAL: Respond ONLY in Turkish (Türkçe). The customer wrote in Turkish.'
    : 'CRITICAL: Respond ONLY in English. The customer wrote in English.';

  // Knowledge base context
  const knowledgeContext = buildKnowledgeContext(knowledgeItems);

  // Style context
  const styleContext = buildStyleContext(styleProfile, language, emailSignature, signatureType);

  // Tool results context
  const toolContext = buildToolResultsContext(toolResults, customerData, language);

  // RAG examples context (reference replies)
  const ragContext = formatExamplesForPrompt(ragExamples);

  // Snippet templates context
  const snippetContext = formatSnippetsForPrompt(snippets);

  // Fact grounding instructions (for tool-required intents)
  const factGroundingContext = getFactGroundingInstructions(factGrounding, language);

  // NEW: Similar email pairs (tone/style matching)
  const pairContext = formatPairsForPrompt(similarPairs);
  const identityName = businessIdentity?.businessName || business.name;
  const identitySummary = businessIdentity?.identitySummary || 'not configured';
  const identityAliases = (businessIdentity?.businessAliases || []).join(', ') || 'not configured';
  const identityEntities = (businessIdentity?.keyEntities || []).join(', ') || 'not configured';
  const allowedDomains = (businessIdentity?.allowedDomains || []).join(' | ') || 'not configured';
  const resolverStatus = getEntityMatchType(entityResolution);
  const resolverHint = getEntityHint(entityResolution) || '-';
  const resolverClarificationHint = entityResolution?.clarificationQuestionHint || '-';

  return `${basePrompt}

${dateTimeContext}

${knowledgeContext}

${styleContext}

${toolContext}
${ragContext}
${snippetContext}
${pairContext}
${factGroundingContext}
## BUSINESS IDENTITY
- businessName: ${identityName}
- identitySummary: ${identitySummary}
- businessAliases: ${identityAliases}
- keyEntities: ${identityEntities}
- allowedDomains: ${allowedDomains}

## ENTITY RESOLUTION
- entityMatchType: ${resolverStatus}
- entityHint: ${resolverHint}
- needsClarification: ${entityResolution?.needsClarification ? 'YES' : 'NO'}
- clarificationQuestionHint: ${resolverClarificationHint}
- KB_CONFIDENCE: ${kbConfidence}
- KB_MATCH: ${hasKBMatch ? 'YES' : 'NO'}

## CRITICAL EMAIL DRAFT RULES:

### 1. LANGUAGE (MOST IMPORTANT)
${languageInstruction}
- NEVER mix languages in the same email
- Match greetings to language (English email = English greeting, Turkish email = Turkish greeting)

### 2. CLAIM POLICY (NO FABRICATION)
- NEVER make company/product/feature claims without KB or tool evidence
- If BUSINESS_CLAIM category and KB match is missing, NEVER claim feature/industry information
- If KB_CONFIDENCE is LOW, explicitly say verified info is unavailable
- In LOW confidence mode ask exactly one clarification question and request link/doc/feature name
- Do NOT infer company definition from general world knowledge
- In ambiguity ask which topic about ${identityName} the customer means

### 3. TOOL DATA USAGE
${getToolDataInstructions(toolResults, language)}

### 4. DRAFT-ONLY MODE
- You are generating a DRAFT that will be reviewed before sending
- Do NOT claim you have already taken actions (e.g., "I have processed your order")
- Use tentative language: "I can help with...", "Based on our records...", "I see that..."
- If tool data is NOT_FOUND (no record at all), ask for clarifying information
- If tool data is VERIFICATION_REQUIRED (record found, needs identity check), acknowledge what the customer provided and ask ONLY for the missing verification piece

### 5. NO PLACEHOLDERS OR INVENTED INFORMATION
- ABSOLUTELY FORBIDDEN: [Your Name], [Company], [İletişim Bilgileri], etc.
- ABSOLUTELY FORBIDDEN: Inventing names like "Mr. Erzen", "John Doe", "Nurettin"
- ABSOLUTELY FORBIDDEN: Inventing titles like "CEO", "Manager", "Representative"
- If information is missing → ask for it or omit it entirely
- Only use REAL data from: similar email pairs, manual signature, or tool results

### 6. SIGNATURE ENFORCEMENT (ZERO TOLERANCE)
- If manual signature is provided → use it EXACTLY (no modifications, no additions)
- If NO manual signature → use ONLY closing pattern (e.g., "Best regards")
- NEVER add name after closing if no manual signature exists
- Review similar email pair examples to see what you actually use

### 7. RESPONSE STYLE
- Be natural and human-like
- Match the tone/formality from similar email pair examples (PRIORITY)
- Keep responses concise but complete
- Address the customer's actual question/concern

### 8. FORMAT
- Brief greeting (use customer's name if known)
- Direct response to their message
- If applicable, next steps or what you need from them
- Short closing (see signature rules above)

### 9. VERIFICATION POLICY
- If sensitive information is requested but customer identity is not verified:
  - NEVER re-ask for information the customer already provided in their email
  - Only ask for the MISSING piece needed for verification (e.g. phone last 4 digits)
  - Acknowledge what the customer already gave you (e.g. "Sipariş numaranızı aldım")
  - Do NOT guess or assume customer details
  - Be helpful and specific about what info you need

Current email classification: ${classification.intent} | Urgency: ${classification.urgency}`;
}

/**
 * Build user prompt with email to reply to
 */
function buildEmailUserPrompt({
  inboundMessage,
  threadMessages,
  subject,
  customerEmail,
  customerName,
  feedback
}) {
  let prompt = `Please draft a reply to this email.\n\n`;

  prompt += `CONTEXT (for your understanding only - do NOT include in response):\n`;
  prompt += `- From: ${customerName || 'Customer'} <${customerEmail}>\n`;
  prompt += `- Subject: ${subject}\n\n`;

  prompt += `IMPORTANT: Your response should be ONLY the email body. Do NOT include:\n`;
  prompt += `- Subject line\n`;
  prompt += `- "Subject:" prefix\n`;
  prompt += `- Email headers\n`;
  prompt += `- Any meta-information\n\n`;

  prompt += `Just write the email reply content directly.\n\n`;
  prompt += `Email to reply to:\n${inboundMessage.bodyText || ''}\n`;

  // Add thread history if more than just the current message
  if (threadMessages && threadMessages.length > 1) {
    prompt += `\n\n--- PREVIOUS CONVERSATION (context only) ---\n`;
    for (const msg of threadMessages.slice(0, -1).slice(-5)) { // Last 5 before current
      const direction = msg.direction === 'INBOUND' ? 'Customer' : 'Us';
      prompt += `\n[${direction}]: ${msg.body?.substring(0, 500)}...\n`;
    }
  }

  // Add user feedback from regenerate action
  if (feedback) {
    prompt += `\n\n--- PREVIOUS DRAFT WAS REJECTED ---\n`;
    prompt += `User feedback: ${feedback}\n`;
    prompt += `Please rewrite the draft taking this feedback into account.\n`;
  }

  return prompt;
}

/**
 * Build knowledge base context
 */
function buildKnowledgeContext(knowledgeItems) {
  if (!knowledgeItems || knowledgeItems.length === 0) return '';

  const kbByType = { URL: [], DOCUMENT: [], FAQ: [] };

  for (const item of knowledgeItems) {
    if (item.type === 'FAQ' && item.question && item.answer) {
      kbByType.FAQ.push(`Q: ${item.question}\nA: ${item.answer}`);
    } else if (item.content) {
      kbByType[item.type]?.push(`[${item.title}]: ${item.content.substring(0, 1000)}`);
    }
  }

  let context = '';
  if (kbByType.FAQ.length > 0) {
    context += '\n\n=== FREQUENTLY ASKED QUESTIONS ===\n' + kbByType.FAQ.join('\n\n');
  }
  if (kbByType.URL.length > 0) {
    context += '\n\n=== WEBSITE CONTENT ===\n' + kbByType.URL.join('\n\n');
  }
  if (kbByType.DOCUMENT.length > 0) {
    context += '\n\n=== DOCUMENTS ===\n' + kbByType.DOCUMENT.join('\n\n');
  }

  return context;
}

/**
 * Build style context from profile
 *
 * CRITICAL SIGNATURE RULES:
 * 1. If manual signature exists → use it EXACTLY (no duplication)
 * 2. If NO manual signature → NEVER invent name/title
 * 3. Closing pattern only (e.g., "Best regards") without name
 */
function buildStyleContext(styleProfile, language, emailSignature, signatureType) {
  let context = '';

  // SIGNATURE HANDLING (CRITICAL - NO HALLUCINATION)
  if (emailSignature && emailSignature.trim().length > 0) {
    // User has manually configured signature - use it EXACTLY
    context += '=== EMAIL SIGNATURE (MANDATORY) ===\n';
    context += 'CRITICAL: Add this EXACT signature at the end of your reply.\n';
    context += 'DO NOT modify, duplicate, or add any additional name/title.\n';
    if (signatureType === 'HTML') {
      context += `[HTML FORMAT - Use exactly as provided]:\n${emailSignature}\n`;
    } else {
      context += `${emailSignature}\n`;
    }
    context += '\nIMPORTANT: This signature already includes closing + name. Do NOT add another name after it.\n\n';
  } else {
    // NO manual signature configured
    context += '=== EMAIL SIGNATURE (NONE CONFIGURED) ===\n';
    context += 'CRITICAL RULES:\n';
    context += '1. NO manual signature is configured\n';
    context += '2. NEVER invent or add a name (like "Mr. Erzen", "John Doe", etc.)\n';
    context += '3. NEVER add title (like "CEO", "Manager", etc.)\n';
    context += '4. You MAY use a closing pattern only (e.g., "Best regards", "Thanks")\n';
    context += '5. After closing, END THE EMAIL - no name, no signature block\n\n';
    context += 'ACCEPTABLE:\n';
    context += '  "Best regards" (and END)\n';
    context += '  "Thanks" (and END)\n\n';
    context += 'FORBIDDEN:\n';
    context += '  "Best regards,\nMr. Erzen" ❌\n';
    context += '  "Thanks,\nNurettin" ❌\n';
    context += '  "[Your Name]" ❌\n\n';
  }

  // Style profile (general patterns)
  if (styleProfile && styleProfile.analyzed) {
    context += '=== WRITING STYLE (GENERAL PATTERNS) ===\n';

    if (styleProfile.formality) {
      context += `- Formality level: ${styleProfile.formality}\n`;
    }
    if (styleProfile.tone) {
      context += `- General tone: ${styleProfile.tone}\n`;
    }
    if (styleProfile.averageLength) {
      context += `- Typical length: ${styleProfile.averageLength}\n`;
    }

    // Language-specific greetings
    const langKey = language === 'TR' ? 'turkish' : 'english';
    if (styleProfile.greetingPatterns?.[langKey] && styleProfile.greetingPatterns[langKey].length > 0) {
      context += `- Common greetings: ${styleProfile.greetingPatterns[langKey].join(', ')}\n`;
    }
    if (styleProfile.closingPatterns?.[langKey] && styleProfile.closingPatterns[langKey].length > 0) {
      context += `- Common closings: ${styleProfile.closingPatterns[langKey].join(', ')}\n`;
    }

    context += '\nNote: These are general patterns. ALWAYS prioritize similar email pair examples over these general stats.\n';
  }

  return context;
}

/**
 * Build tool results context for LLM
 * CRITICAL: Always include outcome + data + message
 *
 * CONTRACT:
 * - outcome: REQUIRED (OK, NOT_FOUND, INFRA_ERROR, VERIFICATION_REQUIRED)
 * - data: Optional (structured data from tool)
 * - message: REQUIRED (human-readable summary - ALWAYS show in response context)
 *
 * The message field is crucial because:
 * 1. It provides actionable guidance for the LLM
 * 2. It may contain verification requirements
 * 3. It explains WHY data was/wasn't found
 * 4. It must be shown PROMINENTLY even when data exists
 */
function buildToolResultsContext(toolResults, customerData, language) {
  if (!toolResults || toolResults.length === 0) {
    return '=== DATA LOOKUP ===\nNo customer/order data available. Ask for verification if needed.';
  }

  let context = '=== DATA LOOKUP RESULTS ===\n';
  context += 'IMPORTANT: Use these results to inform your response.\n\n';

  // Collect actionable messages to highlight at the top
  const actionableMessages = [];

  for (const result of toolResults) {
    context += `### ${result.toolName}\n`;
    context += `Status: ${result.outcome}\n`;

    // MESSAGE IS CRITICAL - always show it prominently
    if (result.message) {
      context += `📌 Message: ${result.message}\n`;

      // Collect messages that require action
      if (normalizeOutcome(result.outcome) !== ToolOutcome.OK ||
          result.message.includes('doğrulama') ||
          result.message.includes('verification')) {
        actionableMessages.push({
          tool: result.toolName,
          outcome: result.outcome,
          message: result.message
        });
      }
    }

    // Show data if available
    // TODO: SECURITY - Filter PII from result.data before sending to LLM
    // For now, we send full data but should implement selective field exposure
    if (normalizeOutcome(result.outcome) === ToolOutcome.OK && result.data) {
      context += `Data:\n${JSON.stringify(result.data, null, 2)}\n`;
    }

    context += '\n';
  }

  // Highlight actionable messages at the top level
  if (actionableMessages.length > 0) {
    context += '\n⚠️ ACTIONABLE ITEMS:\n';
    for (const item of actionableMessages) {
      context += `- [${item.tool}] ${item.message}\n`;
    }
    context += '\n';
  }

  // Highlight customer data if found
  if (customerData) {
    context += '\n### VERIFIED CUSTOMER INFO\n';
    context += `Name: ${customerData.name || 'Unknown'}\n`;
    context += `Phone: ${customerData.phone || 'Unknown'}\n`;
    if (customerData.email) context += `Email: ${customerData.email}\n`;
    if (customerData.lastOrder) context += `Last Order: ${customerData.lastOrder}\n`;
  }

  return context;
}

/**
 * Get tool data usage instructions
 */
function getToolDataInstructions(toolResults, language) {
  if (!toolResults || toolResults.length === 0) {
    return language === 'TR'
      ? '- Müşteri verisi bulunamadı. Gerekirse doğrulama için bilgi isteyin.'
      : '- No customer data found. Ask for verification info if needed.';
  }

  const hasSuccess = toolResults.some(r => normalizeOutcome(r.outcome) === ToolOutcome.OK);
  const hasNotFound = toolResults.some(r => normalizeOutcome(r.outcome) === ToolOutcome.NOT_FOUND);
  const hasError = toolResults.some(r => normalizeOutcome(r.outcome) === ToolOutcome.INFRA_ERROR);
  const hasVerificationRequired = toolResults.some(r => normalizeOutcome(r.outcome) === ToolOutcome.VERIFICATION_REQUIRED);

  let instructions = '';

  if (hasSuccess) {
    instructions += language === 'TR'
      ? '- Müşteri/sipariş verisi bulundu. Bu bilgileri kullanarak yanıt verin.\n'
      : '- Customer/order data found. Use this information in your response.\n';
  }

  if (hasVerificationRequired) {
    instructions += language === 'TR'
      ? '- Kayıt bulundu ancak güvenlik doğrulaması gerekiyor. ÖNEMLİ: Müşterinin e-postasında zaten verdiği bilgileri (sipariş numarası, isim vb.) TEKRAR sormayın. Sadece eksik olan doğrulama bilgisini isteyin (ör. kayıtlı telefon numarasının son 4 hanesi). Müşterinin verdiği bilgiyi aldığınızı teyit edin.\n'
      : '- Record found but security verification is required. IMPORTANT: Do NOT re-ask for information the customer already provided in their email (order number, name, etc.). Only ask for the missing verification info (e.g. last 4 digits of registered phone). Acknowledge the information the customer already gave.\n';
  }

  if (hasNotFound) {
    instructions += language === 'TR'
      ? '- Bazı aramalar sonuç vermedi. Müşteriden ek bilgi isteyebilirsiniz.\n'
      : '- Some lookups returned no results. You may ask customer for more info.\n';
  }

  if (hasError) {
    instructions += language === 'TR'
      ? '- Sistem hatası oluştu. Müşteriye teknik sorun yaşandığını bildirin ve daha sonra yardımcı olacağınızı belirtin.\n'
      : '- System error occurred. Inform customer of technical issue and that you will help shortly.\n';
  }

  return instructions;
}

export default { generateEmailDraft };
