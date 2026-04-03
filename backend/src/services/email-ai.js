/**
 * Email AI Service - LEGACY
 *
 * ⚠️ PARTIALLY DEPRECATED: Draft generation migrated to core/email orchestrator
 *
 * CURRENT USAGE:
 * ✅ ACTIVE (CRUD Operations):
 *    - getDraft(draftId)
 *    - getPendingDrafts(businessId)
 *    - updateDraft(draftId, content)
 *    - approveDraft(draftId, userId)
 *    - rejectDraft(draftId, userId)
 *    - regenerateDraft(draftId, feedback)
 *
 * ❌ DEPRECATED (Draft Generation):
 *    - generateDraft() → Migrated to core/email/handleEmailTurn.js
 *    - Uses new orchestrator pipeline with RAG, guardrails, policies
 *
 * ROUTE OWNERSHIP:
 * - Draft Generation: POST /api/email/threads/:id/generate-draft
 *   → Uses: core/email/handleEmailTurn.js (NEW ✅)
 *
 * - Draft CRUD: GET/PUT/POST /api/email/drafts/*
 *   → Uses: email-ai.js (THIS FILE - LEGACY ⚠️)
 *
 * MIGRATION PLAN:
 * - Phase 1 (Current): Document usage and ownership ✅
 * - Phase 2: Create core/email/drafts/ service for CRUD operations
 * - Phase 3: Migrate routes to use new CRUD service
 * - Phase 4: Remove this file
 *
 * @deprecated Draft generation methods deprecated as of v1.5.0
 * @see src/core/email/handleEmailTurn.js for new draft generation
 * @will-migrate CRUD operations to core/email/drafts/ in v2.0.0
 */

import OpenAI from 'openai';
import prisma from '../prismaClient.js';
import { getDateTimeContext } from '../utils/dateTime.js';
import { getActiveTools, executeTool } from '../tools/index.js';
import { buildAssistantPrompt, getActiveTools as getPromptBuilderTools } from './promptBuilder.js';
import { resolveChatAssistantForBusiness } from './assistantChannels.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ============================================================
// TOOL DEFINITIONS - Using Central Tool System
// ============================================================
// Tools are now managed centrally in ../tools/index.js
// This ensures consistency across all channels (Chat, WhatsApp, Email, Phone)

class EmailAIService {
  /**
   * Generate a draft reply for an incoming email
   */
  async generateDraft(businessId, thread, incomingMessage) {
    try {
      // Get business info with integrations and email integration
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        include: {
          assistants: {
            where: { isActive: true },
            orderBy: { createdAt: 'desc' }
          },
          integrations: {
            where: { isActive: true }
          },
          emailIntegration: true
        }
      });

      if (!business) {
        throw new Error('Business not found');
      }

      const resolved = await resolveChatAssistantForBusiness({
        prisma,
        business,
        allowAutoCreate: true
      });
      const selectedAssistant = resolved.assistant;

      // Get Knowledge Base content
      const knowledgeItems = await prisma.knowledgeBase.findMany({
        where: { businessId, status: 'ACTIVE' }
      });

      // Get thread history (last 5 messages for context)
      const threadHistory = await prisma.emailMessage.findMany({
        where: { threadId: thread.id },
        orderBy: { createdAt: 'asc' },
        take: 5
      });

      // Build context
      const businessName = business.name;
      const businessType = business.businessType;
      const assistantPrompt = selectedAssistant?.systemPrompt || '';
      // IMPORTANT: Always detect language from the incoming email, not from business settings
      // This ensures we respond in the same language the customer used
      const detectedLanguage = this.detectLanguage(incomingMessage.bodyText || incomingMessage.subject);
      const language = detectedLanguage; // Always use detected language for email responses
      const timezone = business.timezone || 'UTC';

      // Build Knowledge Base context
      const knowledgeContext = this.buildKnowledgeContext(knowledgeItems);

      // Get style profile and custom signature if available
      const styleProfile = business.emailIntegration?.styleProfile;
      const customSignature = business.emailIntegration?.emailSignature;
      const signatureType = business.emailIntegration?.signatureType || 'PLAIN';
      const styleContext = this.buildStyleContext(styleProfile, language, customSignature, signatureType);

      // Build the prompt using central prompt builder
      const assistant = selectedAssistant || null;
      const systemPrompt = this.buildSystemPrompt({
        businessName,
        businessType,
        assistantPrompt,
        language,
        timezone,
        knowledgeContext,
        styleContext,
        business,
        assistant
      });

      const userPrompt = this.buildUserPrompt({
        subject: incomingMessage.subject,
        from: incomingMessage.fromEmail,
        fromName: incomingMessage.fromName,
        body: incomingMessage.bodyText,
        threadHistory
      });

      // Get active tools for this business
      const activeTools = getActiveTools(business);
      console.log(`🔧 [Email] Active tools for business ${business.id}: ${activeTools.map(t => t.function.name).join(', ') || 'none'}`);

      // Call OpenAI with tools
      const completionParams = {
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 1000
      };

      // Add tools if available
      if (activeTools.length > 0) {
        completionParams.tools = activeTools;
        completionParams.tool_choice = 'auto';
      }

      let response = await openai.chat.completions.create(completionParams);
      let responseMessage = response.choices[0]?.message;

      // Handle tool calls
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        console.log('🔧 Email tool calls detected:', responseMessage.tool_calls.length);

        const toolResponses = [];
        for (const toolCall of responseMessage.tool_calls) {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);
          
          console.log(`🔧 [Email] Executing tool: ${functionName}`, JSON.stringify(functionArgs));

          const result = await this.executeToolCall(business, functionName, functionArgs, thread.customerEmail);

          console.log(`🔧 [Email] Tool result for ${functionName}:`, result.success ? 'SUCCESS' : 'FAILED', result);
          
          toolResponses.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          });
        }

        // Get final response with tool results
        const secondResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
            {
              role: 'assistant',
              content: responseMessage.content || null,
              tool_calls: responseMessage.tool_calls
            },
            ...toolResponses
          ],
          temperature: 0.7,
          max_tokens: 1000
        });

        responseMessage = secondResponse.choices[0]?.message;
      }

      const draftContent = responseMessage?.content || '';

      // Save draft to database
      const draft = await prisma.emailDraft.create({
        data: {
          messageId: incomingMessage.id,
          threadId: thread.id,
          businessId,
          generatedContent: draftContent,
          status: 'PENDING_REVIEW'
        }
      });

      // Update thread status
      await prisma.emailThread.update({
        where: { id: thread.id },
        data: { status: 'DRAFT_READY' }
      });

      console.log('✅ Email draft generated:', draft.id);
      return draft;
    } catch (error) {
      console.error('Generate draft error:', error);
      throw error;
    }
  }

  /**
   * Execute tool call using central tool system
   */
  async executeToolCall(business, functionName, args, customerEmail) {
    // Use central tool system for consistency across all channels
    return await executeTool(functionName, args, business, {
      channel: 'EMAIL',
      customerEmail
    });
  }

  // NOTE: Tool execution is now handled by the central tool system (../tools/index.js)
  // This ensures consistency across all channels: Chat, WhatsApp, Email, Phone

  /**
   * Build Knowledge Base context
   */
  buildKnowledgeContext(knowledgeItems) {
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
   * Build system prompt for draft generation
   * Now uses the central promptBuilder service
   */
  buildSystemPrompt({ businessName, businessType, assistantPrompt, language, timezone, knowledgeContext, styleContext, business, assistant }) {
    const languageInstruction = language === 'TR'
      ? 'CRITICAL: Respond ONLY in Turkish (Türkçe). The customer wrote in Turkish.'
      : 'CRITICAL: Respond ONLY in English. The customer wrote in English.';

    // Use central prompt builder if business and assistant are available
    let basePrompt = '';
    if (business && assistant) {
      const activeToolsList = getPromptBuilderTools(business, business.integrations || []);
      basePrompt = buildAssistantPrompt(assistant, business, activeToolsList);
    } else {
      // Fallback to basic prompt
      const dateTimeContext = getDateTimeContext(timezone, language);
      basePrompt = `You are an AI email assistant for ${businessName}, a ${businessType?.toLowerCase() || 'general'} business.

${dateTimeContext}

${assistantPrompt ? `Business Instructions:\n${assistantPrompt}\n` : ''}`;
    }

    return `${basePrompt}

${knowledgeContext ? `\n=== KNOWLEDGE BASE ===${knowledgeContext}\n` : ''}
${styleContext ? `\n${styleContext}\n` : ''}

## CRITICAL EMAIL RULES:

### 1. LANGUAGE (MOST IMPORTANT)
${languageInstruction}
- NEVER mix languages. If email is in English, respond 100% in English.
- If email is in Turkish, respond 100% in Turkish.

### 2. UNDERSTAND THE EMAIL'S PURPOSE
Before responding, ask yourself:
- What is the customer asking/saying?
- What action (if any) do they expect from me?
- Is this a question, confirmation, request, or closing message?

### 3. CLAIM POLICY (NO FABRICATION)
- Never make company/product/feature claims without Knowledge Base or tool evidence
- If KB is empty or confidence is low, say verified information is unavailable
- In low-confidence mode ask exactly one clarification question and request link/doc/feature name
- Do not infer company description from general world knowledge
- In ambiguity ask which topic about ${businessName} the customer means

### 4. AVOID DUMB RESPONSES
**NEVER DO THESE:**
- Don't repeat what the customer just said (e.g., "You said you will send the invite" → WRONG)
- Don't say YOU will do something that the CUSTOMER said THEY will do
- Don't summarize their email back to them
- Don't state the obvious
- Don't be overly formal or robotic

**DO THESE INSTEAD:**
- If customer confirms a meeting time → Simply acknowledge: "Perfect, looking forward to it!"
- If customer says they'll send something → Thank them and confirm you'll wait for it
- If customer is wrapping up → Keep your response brief and friendly
- If customer asks a question → Answer directly, don't repeat the question

### 5. RESPONSE STYLE
- Be natural and human-like
- Match the formality level of the incoming email
- Keep responses concise - don't over-explain
- Be helpful but not verbose

### 6. FORMAT
- Brief greeting (use customer's name if available)
- Direct response to their message
- Short, friendly closing
- Include signature if provided in the style profile above

### 7. GREETING LANGUAGE RULE (CRITICAL)
- If email is in ENGLISH → Use ONLY English greetings (Hi, Hello, Dear, etc.)
- If email is in TURKISH → Use ONLY Turkish greetings (Merhaba, İyi günler, Selam, etc.)
- NEVER start an English email with "Merhaba"
- NEVER start a Turkish email with "Hello"

### 8. NO PLACEHOLDERS (CRITICAL)
- NEVER use placeholders like [Adınız], [Your Name], [İletişim Bilgileriniz], [Company], etc.
- If you don't know specific information, simply omit it
- If signature info is not provided, end the email naturally without a formal signature
- If you don't know the sender's name, use their email or a generic greeting
- Use REAL information only - never templated/placeholder text

### 9. TONE AUTHENTICITY
- Write naturally as a real person would
- Do NOT use overly formal or robotic language
- Do NOT use words that feel unnatural like "sabırsızlanıyorum" (I'm being impatient) unless the context truly requires it
- Keep the tone professional but human
- Avoid clichéd phrases and corporate speak

### 10. TOOLS
- Use available tools to check order status, appointments, etc. when relevant`;
  }

  /**
   * Build style context from style profile
   * @param {object} styleProfile - The style profile from analyzer
   * @param {string} emailLanguage - The detected language of the incoming email ('TR' or 'EN')
   * @param {string} customSignature - Custom email signature from user settings
   * @param {string} signatureType - 'PLAIN' or 'HTML'
   */
  buildStyleContext(styleProfile, emailLanguage = 'EN', customSignature = null, signatureType = 'PLAIN') {
    if (!styleProfile || !styleProfile.analyzed) {
      // Even without style profile, we might have a custom signature
      if (customSignature) {
        let context = '=== EMAIL SIGNATURE ===\n';
        context += 'ALWAYS add this exact signature at the end of every email:\n';
        if (signatureType === 'HTML') {
          context += `[HTML SIGNATURE - Use exactly as provided, do not modify]\n${customSignature}\n`;
        } else {
          context += `${customSignature}\n`;
        }
        return context;
      }
      return '';
    }

    let context = '=== USER WRITING STYLE (MATCH THIS EXACTLY) ===\n';
    context += 'You MUST match this writing style when drafting responses:\n\n';

    if (styleProfile.formality) {
      context += `- Formality Level: ${styleProfile.formality}\n`;
    }

    if (styleProfile.tone) {
      context += `- Tone: ${styleProfile.tone}\n`;
    }

    if (styleProfile.averageLength) {
      context += `- Response Length: ${styleProfile.averageLength} (keep responses similar in length)\n`;
    }

    // Language-specific greetings - CRITICAL for avoiding language mixing
    const langKey = emailLanguage === 'TR' ? 'turkish' : 'english';
    if (styleProfile.greetingPatterns) {
      if (typeof styleProfile.greetingPatterns === 'object' && !Array.isArray(styleProfile.greetingPatterns)) {
        const greetings = styleProfile.greetingPatterns[langKey];
        if (greetings && greetings.length > 0) {
          context += `- USE THESE GREETINGS (for ${emailLanguage} emails): ${greetings.join(', ')}\n`;
          context += `  IMPORTANT: Do NOT use greetings from other languages!\n`;
        }
      } else if (Array.isArray(styleProfile.greetingPatterns)) {
        context += `- Preferred Greetings: ${styleProfile.greetingPatterns.join(', ')}\n`;
      }
    }

    // Language-specific closings
    if (styleProfile.closingPatterns) {
      if (typeof styleProfile.closingPatterns === 'object' && !Array.isArray(styleProfile.closingPatterns)) {
        const closings = styleProfile.closingPatterns[langKey];
        if (closings && closings.length > 0) {
          context += `- USE THESE CLOSINGS (for ${emailLanguage} emails): ${closings.join(', ')}\n`;
        }
      } else if (Array.isArray(styleProfile.closingPatterns)) {
        context += `- Preferred Closings: ${styleProfile.closingPatterns.join(', ')}\n`;
      }
    }

    // Signature - Use custom signature if provided, otherwise use business name
    context += '\n### SIGNATURE (ALWAYS ADD AT THE END) ###\n';
    if (customSignature) {
      context += 'ALWAYS add this exact signature at the end of every email:\n';
      if (signatureType === 'HTML') {
        context += `[HTML SIGNATURE - Use exactly as provided, do not modify]\n${customSignature}\n`;
      } else {
        context += `${customSignature}\n`;
      }
    } else {
      context += `DO NOT use personal names in signature. Use only the business name.\n`;
      context += `Sign off with just the business name - nothing else.\n`;
    }

    // Writing characteristics
    if (styleProfile.writingCharacteristics) {
      const wc = styleProfile.writingCharacteristics;
      context += '\n### WRITING STYLE DETAILS ###\n';
      if (wc.usesEmoji === true) context += '- Uses emojis occasionally\n';
      if (wc.usesEmoji === false) context += '- Does NOT use emojis\n';
      if (wc.paragraphStyle) context += `- Paragraph style: ${wc.paragraphStyle}\n`;
      if (wc.bulletPoints) context += '- Uses bullet points when listing\n';
    }

    // Response patterns
    if (styleProfile.responsePatterns) {
      const rp = styleProfile.responsePatterns;
      context += '\n### RESPONSE PATTERNS ###\n';
      if (rp.addressesRecipientByName) context += '- Addresses recipient by name when known\n';
      if (rp.directToPoint) context += '- Gets directly to the point\n';
      if (rp.includesPleasantries) context += '- Includes brief pleasantries\n';
    }

    // Primary language info (legacy support)
    if (styleProfile.language || styleProfile.primaryLanguage) {
      const lang = styleProfile.primaryLanguage || styleProfile.language;
      context += `\n- User's Primary Language: ${lang === 'tr' ? 'Turkish' : lang === 'en' ? 'English' : 'Mixed'}\n`;
    }

    if (styleProfile.additionalNotes) {
      context += `- Additional Notes: ${styleProfile.additionalNotes}\n`;
    }

    return context;
  }

  /**
   * Build user prompt with context
   * NOTE: Subject is intentionally NOT included in the output - it's only for AI context
   */
  buildUserPrompt({ subject, from, fromName, body, threadHistory }) {
    let prompt = `Please draft a reply to this email.\n\n`;
    prompt += `CONTEXT (for your understanding only - do NOT include in response):\n`;
    prompt += `- From: ${fromName ? `${fromName} <${from}>` : from}\n`;
    prompt += `- Subject: ${subject}\n\n`;
    prompt += `IMPORTANT: Your response should be ONLY the email body. Do NOT include:\n`;
    prompt += `- Subject line\n`;
    prompt += `- "Subject:" prefix\n`;
    prompt += `- Email headers\n`;
    prompt += `- Any meta-information\n\n`;
    prompt += `Just write the email reply content directly.\n\n`;
    prompt += `Email to reply to:\n${body}\n`;

    if (threadHistory && threadHistory.length > 1) {
      prompt += `\n\n--- PREVIOUS CONVERSATION (context only) ---\n`;
      for (const msg of threadHistory.slice(0, -1)) {
        const direction = msg.direction === 'INBOUND' ? 'Customer' : 'Us';
        prompt += `\n[${direction}]: ${msg.bodyText?.substring(0, 500)}...\n`;
      }
    }

    return prompt;
  }

  /**
   * Regenerate a draft with optional feedback
   */
  async regenerateDraft(draftId, feedback = null) {
    try {
      const existingDraft = await prisma.emailDraft.findUnique({
        where: { id: draftId },
        include: {
          thread: true,
          message: true,
          business: {
            include: {
              assistants: { where: { isActive: true }, orderBy: { createdAt: 'desc' } },
              integrations: { where: { isActive: true } }
            }
          }
        }
      });

      if (!existingDraft) {
        throw new Error('Draft not found');
      }

      const business = existingDraft.business;
      const thread = existingDraft.thread;
      const incomingMessage = existingDraft.message;

      // Get Knowledge Base
      const knowledgeItems = await prisma.knowledgeBase.findMany({
        where: { businessId: business.id, status: 'ACTIVE' }
      });

      // Get thread history
      const threadHistory = await prisma.emailMessage.findMany({
        where: { threadId: thread.id },
        orderBy: { createdAt: 'asc' },
        take: 5
      });

      const language = business.language || this.detectLanguage(incomingMessage?.bodyText || thread.subject);
      const knowledgeContext = this.buildKnowledgeContext(knowledgeItems);
      const resolved = await resolveChatAssistantForBusiness({
        prisma,
        business,
        allowAutoCreate: true
      });
      const assistant = resolved.assistant || null;

      const systemPrompt = this.buildSystemPrompt({
        businessName: business.name,
        businessType: business.businessType,
        assistantPrompt: assistant?.systemPrompt || '',
        language,
        timezone: business.timezone || 'UTC',
        knowledgeContext,
        business,
        assistant
      });

      let userPrompt = this.buildUserPrompt({
        subject: thread.subject,
        from: thread.customerEmail,
        fromName: thread.customerName,
        body: incomingMessage?.bodyText || '',
        threadHistory
      });

      if (feedback) {
        userPrompt += `\n\n--- FEEDBACK ---\nPlease regenerate with these considerations:\n${feedback}`;
      }

      userPrompt += `\n\n--- PREVIOUS DRAFT ---\n${existingDraft.generatedContent}`;

      // Call OpenAI
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.8,
        max_tokens: 1000
      });

      const newContent = response.choices[0]?.message?.content || '';

      const updatedDraft = await prisma.emailDraft.update({
        where: { id: draftId },
        data: {
          generatedContent: newContent,
          editedContent: null,
          status: 'PENDING_REVIEW'
        }
      });

      return updatedDraft;
    } catch (error) {
      console.error('Regenerate draft error:', error);
      throw error;
    }
  }

  /**
   * Improved language detection - detects both Turkish and English
   */
  detectLanguage(text) {
    if (!text) return 'EN';

    const lowerText = text.toLowerCase();

    // Turkish special characters are strong indicators
    if (/[ığüşöçİĞÜŞÖÇ]/.test(text)) {
      console.log('[Language Detection] Turkish characters detected');
      return 'TR';
    }

    // Common Turkish words/phrases
    const turkishIndicators = [
      'merhaba', 'tesekkur', 'teşekkür', 'lutfen', 'lütfen', 'nasil', 'nasıl',
      'iyi gunler', 'iyi günler', 'saygilar', 'saygılar', 'sayin', 'sayın',
      'rica', 'bilgi', 'hakkinda', 'hakkında', 'musteri', 'müşteri',
      'sikayet', 'şikayet', 'randevu', 'fiyat', 'urun', 'ürün', 'hizmet',
      'gorüşmek', 'görüşmek', 'ekteki', 'ilgili', 'konu', 'talep',
      'siparis', 'sipariş', 'odeme', 'ödeme', 'fatura', 'teslimat',
      'selamlar', 'hayirli', 'hayırlı', 'kolay gelsin', 'iyilik'
    ];

    // Common English words/phrases - strong indicators
    const englishIndicators = [
      'hello', 'hi there', 'dear', 'thank you', 'thanks', 'please', 'regards',
      'sincerely', 'best regards', 'kind regards', 'looking forward',
      'i would like', 'i am', 'we are', 'could you', 'would you',
      'meeting', 'schedule', 'appointment', 'confirm', 'confirmation',
      'attached', 'please find', 'let me know', 'get back to',
      'happy to', 'hope this', 'following up', 'as discussed',
      'invoice', 'payment', 'order', 'delivery', 'shipping',
      'question', 'inquiry', 'request', 'issue', 'problem',
      'available', 'convenient', 'possible', 'appreciate'
    ];

    // Count matches for each language
    let turkishScore = 0;
    let englishScore = 0;

    for (const word of turkishIndicators) {
      if (lowerText.includes(word)) {
        turkishScore++;
      }
    }

    for (const word of englishIndicators) {
      if (lowerText.includes(word)) {
        englishScore++;
      }
    }

    console.log(`[Language Detection] Turkish score: ${turkishScore}, English score: ${englishScore}`);

    // Return based on scores
    if (turkishScore > englishScore) {
      return 'TR';
    } else if (englishScore > turkishScore) {
      return 'EN';
    }

    // If no clear winner, default to English
    return 'EN';
  }

  // ==================== EXISTING METHODS ====================

  async getDraft(draftId) {
    return await prisma.emailDraft.findUnique({
      where: { id: draftId },
      include: { thread: true, message: true }
    });
  }

  async updateDraft(draftId, content) {
    return await prisma.emailDraft.update({
      where: { id: draftId },
      data: { editedContent: content }
    });
  }

  async approveDraft(draftId, userId) {
    return await prisma.emailDraft.update({
      where: { id: draftId },
      data: {
        status: 'APPROVED',
        reviewedAt: new Date(),
        reviewedBy: userId
      }
    });
  }

  async markDraftSent(draftId, sentMessageId) {
    return await prisma.emailDraft.update({
      where: { id: draftId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        sentMessageId
      }
    });
  }

  async rejectDraft(draftId, userId) {
    return await prisma.emailDraft.update({
      where: { id: draftId },
      data: {
        status: 'REJECTED',
        reviewedAt: new Date(),
        reviewedBy: userId
      }
    });
  }

  async getPendingDrafts(businessId) {
    return await prisma.emailDraft.findMany({
      where: { businessId, status: 'PENDING_REVIEW' },
      include: { thread: true, message: true },
      orderBy: { createdAt: 'desc' }
    });
  }
}

export default new EmailAIService();
