/**
 * Chat Widget API - LEGACY
 *
 * ⚠️ DEPRECATED: This file is being phased out in favor of chat-refactored.js
 *
 * CURRENT STATUS:
 * - Used by: /api/chat-legacy endpoint (fallback only)
 * - Production uses: chat-refactored.js (core/orchestrator)
 *
 * MIGRATION PATH:
 * - Phase 1: Monitor usage via CHAT_USE_V2 metrics ✅
 * - Phase 2: Move to /api/chat-legacy endpoint ✅
 * - Phase 3: Remove if usage < 1% for 30 days
 *
 * NEW IMPLEMENTATION:
 * - See: src/routes/chat-refactored.js
 * - Uses: src/core/orchestrator/ (step-based pipeline)
 * - Features: Intent normalization, argument normalization, enhanced tool gating
 *
 * @deprecated Use chat-refactored.js instead
 * @since v1.0.0
 * @will-remove v2.0.0
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { getDateTimeContext } from '../utils/dateTime.js';
import { buildAssistantPrompt, getActiveTools as getPromptBuilderTools } from '../services/promptBuilder.js';
import { isFreePlanExpired } from '../middleware/checkPlanExpiry.js';
import { isChatWidgetResetEnabledForBusiness } from '../config/feature-flags.js';
import { getActiveTools, executeTool } from '../tools/index.js';
import { calculateTokenCost, hasFreeChat } from '../config/plans.js';
import callAnalysis from '../services/callAnalysis.js';
import { routeIntent } from '../services/intent-router.js';
import { verificationCache } from '../services/verification-manager.js';
import { validateActionClaim } from '../services/action-claim-validator.js';
import {
  getOrCreateSession,
  addMessage,
  getHistory,
  getFullHistory,
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
import {
  buildChatWrittenIdempotencyKey,
  commitWrittenInteraction,
  isWrittenUsageBlockError,
  releaseWrittenInteraction,
  reserveWrittenInteraction
} from '../services/writtenUsageService.js';

const router = express.Router();
const prisma = new PrismaClient();

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
 * Process chat with Gemini - with function calling support
 * Returns: { reply: string, inputTokens: number, outputTokens: number }
 */
async function processWithGemini(systemPrompt, conversationHistory, userMessage, language, business, sessionId) {

  // ============================================
  // INTENT ROUTING (NEW!)
  // ============================================
  console.log('🎯 Starting intent detection for session:', sessionId);

  // Check if session is still active - if terminated, reject message
  const session = getOrCreateSession(sessionId, 'chat');

  if (!session.isActive) {
    console.log('🛑 Session terminated - rejecting message');
    return {
      reply: getTerminationMessage(session.terminationReason || 'off_topic', language),
      inputTokens: 0,
      outputTokens: 0
    };
  }

  console.log('🎯 Intent router DISABLED - Gemini will handle everything');

  // Get ALL active tools for this business - let Gemini decide which to use
  const allTools = getActiveTools(business);
  console.log('🔧 All available tools:', allTools.map(t => t.function.name));

  // Get Gemini model with ALL tools
  const model = getGeminiModel({
    model: 'gemini-2.5-flash',
    temperature: 0.7,
    maxOutputTokens: 1500,
    tools: allTools.length > 0 ? allTools : null
  });

  // Build conversation history for Gemini
  const chatHistory = buildGeminiChatHistory(systemPrompt, conversationHistory, true);

  // Start chat
  const chat = model.startChat({ history: chatHistory });

  // Token tracking
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Send user message to Gemini - it will call tools when needed
  let result = await chat.sendMessage(userMessage);
  let response = result.response;

  // Track tokens from first response
  const initialTokens = extractTokenUsage(response);
  totalInputTokens += initialTokens.inputTokens;
  totalOutputTokens += initialTokens.outputTokens;

  // Handle function calls (up to 3 iterations)
  let iterations = 0;
  const maxIterations = 3;
  let hadFunctionCall = false; // Track if we had any function calls

  // Get initial text and function calls
  let initialText = '';
  try {
    initialText = response.text() || '';
  } catch (e) {
    // text() might throw if response only contains function call
  }
  const initialFunctionCalls = response.functionCalls();

  console.log('🔍 Initial response - Text:', initialText?.substring(0, 100), 'FunctionCalls:', initialFunctionCalls?.length || 0);

  while (iterations < maxIterations) {
    const functionCalls = response.functionCalls();

    if (!functionCalls || functionCalls.length === 0) {
      break; // No more function calls
    }

    hadFunctionCall = true; // Mark that we had at least one function call

    // Log if Gemini sent text along with function call (this is the "kontrol ediyorum" issue)
    try {
      const intermediateText = response.text();
      if (intermediateText) {
        console.log('⚠️ Gemini sent text WITH function call (will be replaced by tool result):', intermediateText.substring(0, 100));
      }
    } catch (e) {
      // text() might throw if response only contains function call
    }

    console.log('🔧 Gemini function call:', functionCalls[0].name, functionCalls[0].args);

    // Execute the function
    const functionCall = functionCalls[0];
    const toolResult = await executeTool(functionCall.name, functionCall.args, business, {
      channel: 'CHAT',
      sessionId: sessionId,
      conversationId: sessionId
    });

    console.log('🔧 Tool result:', toolResult.success ? 'SUCCESS' : 'FAILED', toolResult.message?.substring(0, 100));

    // Send function response back to Gemini
    // Include validation object for structured error handling
    result = await chat.sendMessage([
      {
        functionResponse: {
          name: functionCall.name,
          response: {
            success: toolResult.success,
            data: toolResult.data || null,
            message: toolResult.message || toolResult.error || 'Tool executed',
            // Include structured validation data for Gemini to interpret
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
    const tokens = extractTokenUsage(response);
    totalInputTokens += tokens.inputTokens;
    totalOutputTokens += tokens.outputTokens;

    iterations++;
  }

  let text = '';
  try {
    text = response.text() || '';
  } catch (e) {
    console.log('⚠️ Could not get text from response');
  }

  console.log('📝 Final response text:', text?.substring(0, 100));

  // BUGFIX 1: If Gemini said something like "kontrol ediyorum" but didn't call a tool
  const waitingPhrases = ['kontrol', 'bakıyorum', 'sorguluyorum', 'checking', 'looking', 'bir saniye', 'bir dakika', 'hemen'];
  const isWaitingResponse = waitingPhrases.some(phrase => text.toLowerCase().includes(phrase));

  // BUGFIX 2 removed - Pre-emptive tool call at line 121-154 now handles hallucination prevention
  // by calling the tool BEFORE sending to Gemini

  if (isWaitingResponse && !hadFunctionCall) {
    console.log('⚠️ BUGFIX: Gemini said waiting phrase but did NOT call a tool! Extracting phone and calling tool directly...');

    // Extract phone number from user message or conversation
    const phoneRegex = /(?:\+?90|0)?[5][0-9]{9}|[5][0-9]{9}/g;
    const phoneMatches = userMessage.match(phoneRegex);

    // Also check conversation history for phone numbers
    let phoneFromHistory = null;
    if (!phoneMatches && conversationHistory.length > 0) {
      for (const msg of conversationHistory.slice().reverse()) {
        const historyMatches = msg.content?.match(phoneRegex);
        if (historyMatches) {
          phoneFromHistory = historyMatches[0];
          break;
        }
      }
    }

    const extractedPhone = phoneMatches?.[0] || phoneFromHistory;
    console.log('📞 Extracted phone from message/history:', extractedPhone);

    if (extractedPhone) {
      // Call tool directly since Gemini won't do it
      console.log('🔧 DIRECT TOOL CALL: customer_data_lookup with phone:', extractedPhone);

      const toolResult = await executeTool('customer_data_lookup', {
        phone: extractedPhone,
        query_type: 'tum_bilgiler'
      }, business, {
        channel: 'CHAT',
        sessionId: sessionId,
        conversationId: sessionId,
        intent: intentResult.intent,  // Pass intent info for verification logic
        requiresVerification: intentResult.requiresVerification  // Pass verification requirement
      });

      console.log('🔧 Direct tool result:', toolResult.success ? 'SUCCESS' : 'FAILED', toolResult.message?.substring(0, 100));

      // Send tool result to Gemini to format the response
      const toolResultPrompt = language === 'TR'
        ? `Müşteri veri sorgulama sonucu:\n${toolResult.message || toolResult.error}\n\nBu bilgiyi müşteriye doğal bir şekilde aktar. "Kontrol ediyorum" DEME.`
        : `Customer data lookup result:\n${toolResult.message || toolResult.error}\n\nShare this information naturally with the customer. Do NOT say "checking".`;

      try {
        result = await chat.sendMessage(toolResultPrompt);
        response = result.response;

        // Track tokens
        if (response.usageMetadata) {
          totalInputTokens += response.usageMetadata.promptTokenCount || 0;
          totalOutputTokens += response.usageMetadata.candidatesTokenCount || 0;
        }

        // Get the new text
        text = response.text() || '';
        console.log('📝 Fixed response after direct tool call:', text?.substring(0, 100));
      } catch (formatError) {
        console.error('⚠️ Format failed, using raw tool result:', formatError.message);
        // Use tool result directly if Gemini fails
        text = toolResult.message || toolResult.error || text;
      }
    } else {
      console.log('⚠️ Could not extract phone number, cannot call tool directly');
    }
  }

  console.log(`📊 Token usage - Input: ${totalInputTokens}, Output: ${totalOutputTokens}`);

  // ============================================
  // ACTION CLAIM VALIDATION (ENFORCEMENT)
  // ============================================
  // Prevent AI from claiming actions without backing them with tool calls
  // Example violation: "Talebinizi oluşturdum" without calling create_callback
  const actionValidation = validateActionClaim(text, hadFunctionCall, language);

  if (!actionValidation.valid) {
    console.warn('⚠️ ACTION CLAIM VIOLATION:', actionValidation.error);
    console.log('🔧 Forcing AI to correct response...');

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
      console.log('✅ Response corrected:', correctedText.substring(0, 100));
    } catch (correctionError) {
      console.error('❌ Correction failed:', correctionError.message);
      // Fallback: strip action claims manually
      text = language === 'TR'
        ? 'Üzgünüm, bu konuda size yardımcı olmak için müşteri hizmetlerimize yönlendirmeniz gerekiyor.'
        : 'I apologize, for this issue you need to contact our customer service team.';
    }
  }

  // Better fallback for empty responses
  let finalText = text;
  if (!finalText || finalText.trim().length === 0) {
    console.warn('⚠️ Empty response from Gemini - Retrying with simpler prompt');

    // Retry with a direct prompt
    try {
      const retryPrompt = language === 'TR'
        ? `"${userMessage}" - yanıt ver.`
        : `"${userMessage}" - respond.`;

      const retryResult = await chat.sendMessage(retryPrompt);
      finalText = retryResult.response.text();

      if (retryResult.response.usageMetadata) {
        totalInputTokens += retryResult.response.usageMetadata.promptTokenCount || 0;
        totalOutputTokens += retryResult.response.usageMetadata.candidatesTokenCount || 0;
      }

      console.log('✅ Retry successful');
    } catch (retryError) {
      console.error('❌ Retry failed:', retryError.message);
      finalText = language === 'TR'
        ? 'Üzgünüm, şu an yanıt veremiyorum.'
        : 'Sorry, I cannot respond right now.';
    }
  }

  // Return result object (will be used by caller to add assistant message)
  return {
    reply: finalText,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens
  };
}

// POST /api/chat/widget - Public endpoint for widget
router.post('/widget', async (req, res) => {
  console.log('📨 Chat request received:', {
    body: req.body,
    businessId: req.businessId,
    headers: req.headers.authorization ? 'Auth present' : 'No auth'
  });
  let writtenUsageKey = null;

  try {
    const { embedKey, assistantId, sessionId, message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    if (!embedKey && !assistantId) {
      return res.status(400).json({ error: 'embedKey or assistantId is required' });
    }

    // Session timeout: 30 minutes of inactivity = new session
    const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

    // Check if existing session should be continued or a new one started
    let chatSessionId = sessionId;
    let shouldStartNewSession = !sessionId;

    if (sessionId) {
      // Check existing session
      const existingSession = await prisma.chatLog.findUnique({
        where: { sessionId },
        select: { id: true, updatedAt: true, status: true, messages: true }
      });

      if (existingSession) {
        const lastActivity = new Date(existingSession.updatedAt);
        const timeSinceActivity = Date.now() - lastActivity.getTime();

        if (timeSinceActivity > SESSION_TIMEOUT_MS || existingSession.status === 'ended') {
          // Session timed out or was ended - mark as ended and start new session
          console.log(`⏰ Session ${sessionId} timed out (${Math.round(timeSinceActivity / 60000)} min inactive) - starting new session`);

          // Determine normalized topic for timed out session
          let normalizedCategory = null;
          let normalizedTopic = null;
          if (existingSession.messages && Array.isArray(existingSession.messages) && existingSession.messages.length > 0) {
            try {
              const transcriptText = callAnalysis.formatChatMessagesAsTranscript(existingSession.messages);
              if (transcriptText && transcriptText.length > 20) {
                const topicResult = await callAnalysis.determineNormalizedTopic(transcriptText);
                normalizedCategory = topicResult.normalizedCategory;
                normalizedTopic = topicResult.normalizedTopic;
                console.log(`📊 Timed out chat topic: ${normalizedCategory} > ${normalizedTopic}`);
              }
            } catch (topicError) {
              console.error('⚠️ Topic determination for timed out session failed:', topicError.message);
            }
          }

          // Mark old session as ended with normalized topic
          await prisma.chatLog.update({
            where: { sessionId },
            data: {
              status: 'ended',
              normalizedCategory: normalizedCategory,
              normalizedTopic: normalizedTopic,
              updatedAt: new Date()
            }
          });

          // Generate new session ID
          chatSessionId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          shouldStartNewSession = true;
        } else {
          // Session still active
          console.log(`✅ Session ${sessionId} is active (${Math.round(timeSinceActivity / 60000)} min since last activity)`);
        }
      }
    }

    // Generate session ID if needed
    if (!chatSessionId) {
      chatSessionId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    let assistant;

    // New way: Use embedKey to find business and its active assistant
    if (embedKey) {
      const business = await prisma.business.findUnique({
        where: { chatEmbedKey: embedKey },
        include: {
          assistants: {
            where: {
              isActive: true
            },
            orderBy: { createdAt: 'desc' },
            take: 1
          },
          integrations: {
            where: { isActive: true }
          }
        }
      });

      if (!business) {
        return res.status(404).json({ error: 'Invalid embed key' });
      }

      // Check if widget is enabled by business owner
      if (!business.chatWidgetEnabled) {
        return res.status(403).json({ error: 'Chat widget is disabled for this business' });
      }

      if (!business.assistants || business.assistants.length === 0) {
        return res.status(404).json({ error: 'No active assistant found for this business' });
      }

      assistant = {
        ...business.assistants[0],
        business: business
      };
    } else {
      // Use assistantId directly
      assistant = await prisma.assistant.findFirst({
        where: { id: assistantId },
        include: {
          business: {
            include: {
              integrations: {
                where: { isActive: true }
              }
            },
          }
        }
      });
    }

    if (!assistant) {
      return res.status(404).json({ error: 'Assistant not found' });
    }

    const business = assistant.business;
    const language = business?.language || 'TR';
    const timezone = business?.timezone || 'Europe/Istanbul';

    // Get current date/time for this business's timezone
    const dateTimeContext = getDateTimeContext(timezone, language);

    // Check subscription and plan expiry
    const subscription = await prisma.subscription.findUnique({
      where: { businessId: business.id },
      include: { business: true }
    });

    if (subscription && isFreePlanExpired(subscription)) {
      console.log(`🚫 Chat blocked - FREE plan expired for business ${business.id}`);
      return res.status(403).json({
        error: language === 'TR'
          ? 'Deneme süreniz doldu. Hizmete devam etmek için lütfen bir plan seçin.'
          : 'Your trial has expired. Please choose a plan to continue.',
        expired: true
      });
    }

    if (subscription && subscription.plan !== 'FREE') {
      writtenUsageKey = buildChatWrittenIdempotencyKey({
        subscriptionId: subscription.id,
        sessionId: chatSessionId,
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
            sessionId: chatSessionId
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
          kbByType[item.type]?.push(`[${item.title}]: ${item.content.substring(0, 100000)}`);
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

      console.log(`📚 [Chat] Knowledge Base items added: ${knowledgeItems.length}`);
    }

    // Get active tools list for prompt builder
    const activeToolsList = getPromptBuilderTools(business, business.integrations || []);

    // Build system prompt using central prompt builder
    const systemPromptBase = buildAssistantPrompt(assistant, business, activeToolsList);

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

    // Build full system prompt
    const fullSystemPrompt = `${dateTimeContext}

${systemPromptBase}${kbInstruction}
${knowledgeContext}`;

    console.log('📝 [Chat] Full system prompt length:', fullSystemPrompt.length, 'chars');
    console.log('🤖 [Chat] Using Gemini model');

    // Create/get session and add user message
    getOrCreateSession(chatSessionId, 'chat');
    addMessage(chatSessionId, 'user', message);

    // Get conversation history from conversation-manager
    const conversationHistory = getHistory(chatSessionId, 10);

    // Process with Gemini (with function calling support)
    const result = await processWithGemini(fullSystemPrompt, conversationHistory, message, language, business, chatSessionId);

    // Human-like delay: reading + typing time
    // Skip delay for off-topic/direct responses (they're already pre-generated)
    if (!result.isDirectResponse) {
      // 1. Reading delay: 1-2 seconds (before typing starts)
      // 2. Typing delay: based on response length
      const replyLength = result.reply?.length || 0;
      const readingDelay = 1000 + Math.random() * 1000; // 1-2 seconds
      const typingDelay = Math.min(Math.max(replyLength * 20, 500), 6000); // 500ms-6s based on length
      const totalDelay = readingDelay + typingDelay;
      console.log(`⏱️ Total delay: ${Math.round(totalDelay)}ms (read: ${Math.round(readingDelay)}ms + type: ${Math.round(typingDelay)}ms for ${replyLength} chars)`);
      await new Promise(resolve => setTimeout(resolve, totalDelay));
    } else {
      console.log('⚡ Skipping delay for direct response (off-topic/greeting)');
    }

    // Calculate token cost based on plan
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

    console.log(`💰 Chat cost: ${tokenCost.totalCost.toFixed(6)} TL (Plan: ${planName}, Free: ${isFree})`);

    // Add assistant reply to conversation history
    addMessage(chatSessionId, 'assistant', result.reply, {
      intent: result.intent,
      tokens: { input: result.inputTokens, output: result.outputTokens }
    });

    // Get full conversation history for Prisma (including user + assistant messages)
    const fullConversationHistory = getFullHistory(chatSessionId);

    // Save chat log (upsert - create or update with token info)
    try {
      const updatedMessages = fullConversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.timestamp).toISOString()
      }));

      // Get existing chat log to accumulate tokens
      const existingLog = await prisma.chatLog.findUnique({
        where: { sessionId: chatSessionId },
        select: { inputTokens: true, outputTokens: true, totalCost: true }
      });

      const accumulatedInputTokens = (existingLog?.inputTokens || 0) + result.inputTokens;
      const accumulatedOutputTokens = (existingLog?.outputTokens || 0) + result.outputTokens;
      const accumulatedCost = (existingLog?.totalCost || 0) + tokenCost.totalCost;

      await prisma.chatLog.upsert({
        where: { sessionId: chatSessionId },
        create: {
          sessionId: chatSessionId,
          businessId: business.id,
          assistantId: assistant.id,
          channel: 'CHAT', // Explicitly set channel for analytics filtering
          messageCount: updatedMessages.length,
          messages: updatedMessages,
          status: 'active',
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          totalCost: tokenCost.totalCost
        },
        update: {
          messageCount: updatedMessages.length,
          messages: updatedMessages,
          inputTokens: accumulatedInputTokens,
          outputTokens: accumulatedOutputTokens,
          totalCost: accumulatedCost,
          updatedAt: new Date()
        }
      });
    } catch (logError) {
      console.error('Failed to save chat log:', logError);
    }

    if (writtenUsageKey) {
      await commitWrittenInteraction(writtenUsageKey, {
        channel: 'CHAT',
        requestId: req.requestId || null,
        finalReplyLength: result.reply?.length || 0
      });
      writtenUsageKey = null;
    }

    // Return response with conversation history for frontend
    res.json({
      success: true,
      reply: result.reply,
      conversationId: chatSessionId, // P0: Required for audit/correlation
      messageId: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`, // P0: Required for audit trail
      sessionId: chatSessionId,
      newSession: shouldStartNewSession, // true if a new session was started (timeout or first message)
      assistantName: assistant.name,
      history: fullConversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp
      }))
    });

  } catch (error) {
    if (writtenUsageKey) {
      await releaseWrittenInteraction(writtenUsageKey, 'CHAT_LEGACY_FAILED').catch(() => null);
    }
    console.error('Chat widget error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// GET /api/chat/assistant/:assistantId
router.get('/assistant/:assistantId', async (req, res) => {
  try {
    const { assistantId } = req.params;

    const assistant = await prisma.assistant.findFirst({
      where: { id: assistantId },
      select: {
        name: true,
        business: {
          select: { name: true }
        }
      }
    });

    if (!assistant) {
      return res.status(404).json({ error: 'Assistant not found' });
    }

    res.json({
      name: assistant.name,
      businessName: assistant.business?.name || ''
    });

  } catch (error) {
    console.error('Get assistant error:', error);
    res.status(500).json({ error: 'Failed to get assistant info' });
  }
});

// GET /api/chat/embed/:embedKey - Get business info by embed key
router.get('/embed/:embedKey', async (req, res) => {
  try {
    const { embedKey } = req.params;

    const business = await prisma.business.findUnique({
      where: { chatEmbedKey: embedKey },
      include: {
        assistants: {
          where: {
            isActive: true
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { name: true }
        }
      }
    });

    if (!business) {
      return res.status(404).json({ error: 'Invalid embed key' });
    }

    if (!business.assistants || business.assistants.length === 0) {
      return res.status(404).json({ error: 'No active assistant found' });
    }

    res.json({
      name: business.assistants[0].name,
      businessName: business.name
    });

  } catch (error) {
    console.error('Get embed info error:', error);
    res.status(500).json({ error: 'Failed to get embed info' });
  }
});

// GET /api/chat/widget/status/:assistantId - Check if widget should be active
router.get('/widget/status/:assistantId', async (req, res) => {
  try {
    const { assistantId } = req.params;

    const assistant = await prisma.assistant.findFirst({
      where: { id: assistantId },
      include: {
        business: true
      }
    });

    if (!assistant) {
      return res.json({ active: false, reason: 'not_found' });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { businessId: assistant.business.id },
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
      businessName: assistant.business?.name,
      allowReset: isChatWidgetResetEnabledForBusiness(assistant.business?.id)
    });

  } catch (error) {
    console.error('Widget status error:', error);
    res.json({ active: false, reason: 'error' });
  }
});

// GET /api/chat/widget/status/embed/:embedKey - Check if widget should be active by embed key
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
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!business) {
      return res.json({ active: false, reason: 'invalid_embed_key' });
    }

    if (!business.chatWidgetEnabled) {
      return res.json({ active: false, reason: 'widget_disabled' });
    }

    if (!business.assistants || business.assistants.length === 0) {
      return res.json({ active: false, reason: 'no_assistant' });
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
      assistantName: business.assistants[0].name,
      businessName: business.name,
      allowReset: isChatWidgetResetEnabledForBusiness(business.id)
    });

  } catch (error) {
    console.error('Widget status by embed key error:', error);
    res.json({ active: false, reason: 'error' });
  }
});

// POST /api/chat/widget/end-session - End a chat session
router.post('/widget/end-session', async (req, res) => {
  try {
    const { sessionId, embedKey } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Find the chat log
    const chatLog = await prisma.chatLog.findFirst({
      where: { sessionId }
    });

    if (!chatLog) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // === NORMALLEŞTİRİLMİŞ KONU BELİRLEME ===
    let normalizedCategory = null;
    let normalizedTopic = null;

    // Chat mesajlarından transcript oluştur
    const messages = chatLog.messages;
    if (messages && Array.isArray(messages) && messages.length > 0) {
      try {
        const transcriptText = callAnalysis.formatChatMessagesAsTranscript(messages);
        if (transcriptText && transcriptText.length > 20) {
          const topicResult = await callAnalysis.determineNormalizedTopic(transcriptText);
          normalizedCategory = topicResult.normalizedCategory;
          normalizedTopic = topicResult.normalizedTopic;
          console.log(`📊 Chat topic determined: ${normalizedCategory} > ${normalizedTopic}`);
        }
      } catch (topicError) {
        console.error('⚠️ Chat topic determination failed (non-critical):', topicError.message);
      }
    }

    // Update status to ended with normalized topic
    await prisma.chatLog.update({
      where: { id: chatLog.id },
      data: {
        status: 'ended',
        normalizedCategory: normalizedCategory,
        normalizedTopic: normalizedTopic,
        updatedAt: new Date()
      }
    });

    console.log(`📝 Chat session ended: ${sessionId}`);
    res.json({ success: true, message: 'Session ended' });

  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

export default router;
