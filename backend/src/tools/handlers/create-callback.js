/**
 * create_callback Tool Handler
 * Geri arama kaydı oluşturur.
 */

import prisma from '../../prismaClient.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ok, systemError, ToolOutcome } from '../toolResult.js';
import crypto from 'crypto';

/**
 * Normalize topic for duplicate detection
 * Removes common punctuation, lowercases, trims
 */
function normalizeTopic(topic) {
  return topic
    .toLowerCase()
    .replace(/[.,!?;:\-]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Generate hash from normalized topic
 */
function generateTopicHash(topic) {
  const normalized = normalizeTopic(topic);
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Generate topic from conversation context (deterministic)
 * Extracts key information from state and recent messages
 */
function generateTopicFromContext(context, language) {
  const state = context.state || {};
  const extractedSlots = state.extractedSlots || {};

  // Build topic from available context
  const topicParts = [];

  // 1. Check for order-related context
  if (extractedSlots.order_number) {
    topicParts.push(
      language === 'TR'
        ? `Sipariş ${extractedSlots.order_number}`
        : `Order ${extractedSlots.order_number}`
    );
  }

  // 2. Check for complaint/issue indicators
  const complaintIndicators = [
    'teslim almadım', 'gelmedi', 'ulaşmadı', 'problem', 'sorun',
    'şikayet', 'itiraz', 'yanlış', 'hatalı', 'eksik'
  ];

  const recentMessages = context.conversationHistory?.slice(-6) || [];
  const hasComplaint = recentMessages.some(msg =>
    msg.role === 'user' && complaintIndicators.some(indicator =>
      msg.content?.toLowerCase().includes(indicator)
    )
  );

  if (hasComplaint) {
    topicParts.push(
      language === 'TR' ? 'hakkında sorun' : 'issue'
    );
  }

  // 3. Check for callback/manager request
  const callbackIndicators = ['yönetici', 'yetkili', 'geri ara', 'ara beni', 'callback'];
  const hasCallbackRequest = recentMessages.some(msg =>
    msg.role === 'user' && callbackIndicators.some(indicator =>
      msg.content?.toLowerCase().includes(indicator)
    )
  );

  if (hasCallbackRequest && topicParts.length === 0) {
    topicParts.push(
      language === 'TR' ? 'Genel görüşme talebi' : 'General inquiry'
    );
  }

  // 4. Fallback: Use last user message snippet
  if (topicParts.length === 0) {
    const lastUserMessage = recentMessages
      .filter(msg => msg.role === 'user')
      .pop();

    if (lastUserMessage?.content) {
      const snippet = lastUserMessage.content.substring(0, 50);
      topicParts.push(snippet);
    } else {
      topicParts.push(
        language === 'TR' ? 'Müşteri talebi' : 'Customer request'
      );
    }
  }

  return topicParts.join(' - ');
}

/**
 * Redact PII from text before sending to LLM
 * Masks phone numbers, emails, dates, Turkish ID numbers
 */
function redactPII(text) {
  if (!text) return '';
  return text
    .replace(/\b\d{10,11}\b/g, '[TEL]')                      // phone numbers (10-11 digits)
    .replace(/\b[\w.-]+@[\w.-]+\.\w+\b/g, '[EMAIL]')         // email addresses
    .replace(/\b\d{1,3}[./]\d{1,3}[./]\d{2,4}\b/g, '[DATE]') // date patterns
    .replace(/\bTC?\s?\d{11}\b/gi, '[TCKN]');                 // Turkish ID number
}

/**
 * Generate topic summary using LLM (gemini-2.5-flash-lite)
 * PII is redacted before sending to model.
 * Returns null on failure (caller should fallback to keyword-based).
 */
async function generateTopicWithLLM(conversationHistory, language) {
  const recentMessages = (conversationHistory || []).slice(-10);
  if (recentMessages.length === 0) return null;

  // PII redaction before sending to LLM
  const transcript = recentMessages
    .map(m => `${m.role === 'user' ? 'Müşteri' : 'Asistan'}: ${redactPII(m.content || '')}`)
    .join('\n');

  const prompt = language === 'TR'
    ? `Aşağıdaki müşteri-asistan konuşmasını 1 cümle ile özetle. Maksimum 100 karakter. Sadece konuyu belirt. Örnek: "Sipariş kargo gecikmesi sorunu"\n\n${transcript}`
    : `Summarize this customer-assistant conversation in 1 sentence. Max 100 chars. Topic only. Example: "Order shipping delay issue"\n\n${transcript}`;

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

  const result = await model.generateContent(prompt);
  const summary = result.response?.text()?.trim();

  if (!summary || summary.length === 0) return null;
  return summary.length <= 160 ? summary : summary.substring(0, 157) + '...';
}

// Generic topic values that indicate keyword-based generation was inconclusive
const GENERIC_TOPICS = [
  'Müşteri talebi', 'Customer request',
  'Genel görüşme talebi', 'General inquiry'
];

const PLACEHOLDER_NAMES = new Set([
  'customer',
  'unknown',
  'anonim',
  'anonymous',
  'test',
  '-',
  'n/a',
  'na'
]);

const PLACEHOLDER_PHONES = new Set([
  'none',
  'null',
  'undefined',
  'unknown',
  'bilinmiyor',
  'n/a',
  'na',
  '-'
]);

function isPlaceholderName(name) {
  if (!name) return true;
  const normalized = String(name).trim().toLowerCase();
  return !normalized || PLACEHOLDER_NAMES.has(normalized);
}

function normalizeCallbackPhone(value) {
  if (value === undefined || value === null) return null;

  const raw = String(value).trim();
  if (!raw) return null;
  if (PLACEHOLDER_PHONES.has(raw.toLowerCase())) return null;

  const compact = raw.replace(/[^\d+]/g, '');
  const digits = compact.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) return null;

  return compact.startsWith('+') ? `+${digits}` : digits;
}

function buildCallbackValidationError(language, missingFields) {
  const askFor = missingFields.length > 0 ? missingFields : ['customer_name', 'phone'];
  const isEnglish = String(language || 'TR').toUpperCase() === 'EN';
  let message;

  if (askFor.length === 1 && askFor[0] === 'customer_name') {
    message = isEnglish
      ? 'To create your callback, could you share your name?'
      : 'Geri arama talebinizi oluşturmak için adınızı paylaşır mısınız?';
  } else if (askFor.length === 1 && askFor[0] === 'phone') {
    message = isEnglish
      ? 'To create your callback, could you share your phone number?'
      : 'Geri arama talebinizi oluşturmak için telefon numaranızı paylaşır mısınız?';
  } else {
    message = isEnglish
      ? 'To create your callback, could you share your name and phone number?'
      : 'Geri arama talebinizi oluşturmak için adınızı ve telefon numaranızı paylaşır mısınız?';
  }

  return {
    outcome: ToolOutcome.VALIDATION_ERROR,
    success: true,
    validationError: true,
    askFor,
    data: { askFor },
    message
  };
}

export default {
  name: 'create_callback',

  async execute(args, business, context = {}) {
    try {
      let { customerName, customerPhone, topic, priority = 'NORMAL' } = args;
      const language = business.language || 'TR';
      customerPhone =
        normalizeCallbackPhone(customerPhone) ||
        normalizeCallbackPhone(context?.extractedSlots?.phone) ||
        normalizeCallbackPhone(context?.channelUserId) ||
        normalizeCallbackPhone(context?.from) ||
        normalizeCallbackPhone(context?.phone) ||
        normalizeCallbackPhone(context?.callerPhone) ||
        normalizeCallbackPhone(context?.phoneNumber);

      // Deterministic contract: callback cannot proceed without real name + phone.
      const missing = [];
      if (isPlaceholderName(customerName)) {
        missing.push('customer_name');
      }
      if (!customerPhone || String(customerPhone).trim() === '') {
        missing.push('phone');
      }
      if (missing.length > 0) {
        return buildCallbackValidationError(language, missing);
      }

      // AUTO-GENERATE TOPIC: If not provided, infer from conversation context
      // Strategy: Deterministic (keyword) first → LLM fallback only if generic
      if (!topic || topic.trim().length === 0) {
        // 1) Deterministic: keyword-based (fast, free, reliable)
        topic = generateTopicFromContext(context, language);
        console.log(`🔧 [create_callback] Keyword-generated topic: "${topic}"`);

        // 2) LLM fallback: only if keyword gave a generic result AND we have conversation context
        const isGenericTopic = GENERIC_TOPICS.some(g => topic === g);
        if (isGenericTopic && context.conversationHistory?.length > 2) {
          try {
            const llmTopic = await Promise.race([
              generateTopicWithLLM(context.conversationHistory, language),
              new Promise((_, reject) => setTimeout(() => reject(new Error('LLM topic timeout')), 5000))
            ]);
            if (llmTopic) {
              topic = llmTopic;
              console.log(`🤖 [create_callback] LLM-generated topic: "${topic}"`);
            }
          } catch (err) {
            console.warn(`⚠️ [create_callback] LLM topic failed, using keyword: ${err.message}`);
          }
        }
      }

      // Ensure topic is not too long (max 160 chars for readability)
      if (topic.length > 160) {
        topic = topic.substring(0, 157) + '...';
      }

      // Generate topic hash for duplicate detection
      const topicHash = generateTopicHash(topic);

      // DUPLICATE GUARD: Check for recent callback with same phone + topic hash
      // Time window: 15 minutes
      // Uses composite index: [customerPhone, topicHash, requestedAt]
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

      const recentCallback = await prisma.callbackRequest.findFirst({
        where: {
          businessId: business.id,
          customerPhone,
          topicHash, // Use hash in query for index performance
          status: 'PENDING',
          requestedAt: {
            gte: fifteenMinutesAgo
          }
        },
        orderBy: {
          requestedAt: 'desc'
        }
      });

      if (recentCallback) {
        console.log(`🔒 [create_callback] Duplicate detected: ${recentCallback.id} (same phone + topic within 15min)`);

        return ok(
          { callbackId: recentCallback.id, status: 'PENDING', isDuplicate: true },
          language === 'TR'
            ? `Talebiniz zaten kaydedildi. Yeni bir kayıt açmadım. ${customerName} en kısa sürede aranacak.`
            : `Your request is already registered. I did not create a new record. ${customerName} will be called back shortly.`
        );
      }

      // Priority validasyonu
      const validPriorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
      const finalPriority = validPriorities.includes(priority) ? priority : 'NORMAL';

      // Callback oluştur
      const callback = await prisma.callbackRequest.create({
        data: {
          businessId: business.id,
          assistantId: context.assistantId || null,
          callId: context.conversationId || null, // callId = ChatLog.sessionId (links callback → chat)
          customerName,
          customerPhone,
          topic,
          topicHash, // Store hash for future duplicate detection
          priority: finalPriority
        }
      });

      console.log(`✅ Callback created via tool: ${callback.id} for business ${business.id}`);

      return ok(
        { callbackId: callback.id, status: 'PENDING' },
        language === 'TR'
          ? `Geri arama kaydı oluşturuldu. ${customerName} en kısa sürede aranacak.`
          : `Callback request created. ${customerName} will be called back shortly.`
      );

    } catch (error) {
      console.error('❌ create_callback error:', error);
      return systemError(
        business.language === 'TR'
          ? 'Geri arama kaydı oluşturulamadı. Lütfen tekrar deneyin.'
          : 'Could not create callback request. Please try again.',
        error
      );
    }
  }
};
