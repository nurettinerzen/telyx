/**
 * Intent Router Service
 * Detects user intent and maps to appropriate tools
 * Handles session counters for security (off-topic, verification attempts)
 */

import { getGeminiClient } from './gemini-utils.js';
import { verificationCache } from './verification-manager.js';
import { detectNumberType } from '../utils/text.js';
import { isLikelyValidOrderNumber } from '../utils/order-number.js';

// Intent configuration with tool mapping and security rules
export const INTENT_CONFIG = {
  // ============================================
  // TRANSACTIONAL INTENTS (Verification Required)
  // ============================================
  order_status: {
    tools: ['customer_data_lookup'],
    requiresVerification: true,
    verificationFields: ['order_number'],
    maxAttempts: 3,
    description: 'User asks about ORDER STATUS/DELIVERY (INCLUDES frustrated/angry questions): sipariş nerede, siparişim gelmedi, ne zaman gelir, hala gelmedi, gecikti. Priority over complaint if order-related. NOT debts.'
  },

  debt_inquiry: {
    tools: ['customer_data_lookup'],
    requiresVerification: true,
    verificationFields: ['phone', 'tc', 'vkn'],
    maxAttempts: 3,
    description: 'User asks about DEBTS/PAYMENTS (INCLUDES frustrated questions): borcum var mı, ödeme, fatura, tahsilat. Priority over complaint if payment-related. NOT orders.'
  },

  tracking_info: {
    tools: ['customer_data_lookup'],
    requiresVerification: true,
    verificationFields: ['order_number', 'tracking_number'],
    maxAttempts: 3,
    description: 'User asks about CARGO/SHIPMENT TRACKING (INCLUDES frustrated questions): kargo, gönderi, takip kodu, nerede kargom. Priority over complaint if cargo-related. NOT payments.'
  },

  // ============================================
  // NON-VERIFICATION INTENTS
  // ============================================
  appointment: {
    tools: ['create_appointment'],
    requiresVerification: false,
    description: 'User wants to BOOK/SCHEDULE/RESERVE an appointment or reservation: randevu, rezervasyon, rez, masa ayırtma, appointment, booking, reservation, tarih/saat belirleyerek bir şey planlamak istiyor. NOT asking about existing order status.'
  },

  stock_check: {
    tools: ['get_product_stock'],
    requiresVerification: false,
    description: 'User asks about product availability, stock, "is X available?"'
  },

  product_spec: {
    tools: ['get_product_stock'],
    requiresVerification: false,
    requiresToolCall: true, // ZORUNLU: Tool çağrılmadan yanıt verilemez
    description: 'User asks for product SPECIFICATIONS, FEATURES, DETAILS: özellik, spec, Bluetooth, pil ömrü, IP rating, renk seçeneği, boyut, ağırlık. ALWAYS needs tool lookup - NEVER answer from memory.'
  },

  company_info: {
    tools: [],
    requiresVerification: false,
    useKnowledgeBase: true,
    description: 'User asks about company hours, address, services, policies'
  },

  greeting: {
    tools: [],
    requiresVerification: false,
    description: 'User greets: "hello", "hi", "good morning", "merhaba", "selam"'
  },

  complaint: {
    tools: ['create_callback'],
    requiresVerification: false,
    description: 'User complains AFTER getting info/response OR asks to speak to manager. ONLY if NOT asking for specific order/payment/cargo info. Examples: "yöneticiyle görüşmek istiyorum", "berbat hizmet genel olarak", "müşteri hizmetleri arayın beni"'
  },

  profanity: {
    tools: [],
    requiresVerification: false,
    maxCount: 3, // 3 strikes = session terminated
    response: 'polite_warning',
    description: 'User uses profanity, swear words, insults (küfür, hakaret)'
  },

  general_question: {
    tools: [],
    requiresVerification: false,
    useKnowledgeBase: true,
    description: 'General questions about products, services that need KB'
  },

  // ============================================
  // SECURITY INTENTS
  // ============================================
  off_topic: {
    tools: [],
    requiresVerification: false,
    maxCount: 3, // 3 strikes = session terminated
    response: 'polite_redirect',
    description: 'User asks unrelated questions: weather, cooking, jokes, sports'
  }
};

// Session counter storage (in-memory, could be Redis in production)
const sessionCounters = new Map();

// Session timeout: 30 minutes
const SESSION_TIMEOUT = 30 * 60 * 1000;

/**
 * Detect user intent using Gemini
 * @param {string} userMessage - User's message
 * @param {string} language - User's language (TR/EN)
 * @returns {Promise<string>} - Detected intent key
 */
export async function detectIntent(userMessage, language = 'TR') {
  try {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const intentList = Object.keys(INTENT_CONFIG).map(key =>
      `- ${key}: ${INTENT_CONFIG[key].description}`
    ).join('\n');

    const prompt = language === 'TR'
      ? `Kullanıcı şunu dedi: "${userMessage}"

Bu mesajın niyetini aşağıdaki listeden seç:

${intentList}

ÖNEMLİ KURALLAR:
1. Eğer kullanıcı SİPARİŞ/KARGO/BORÇ bilgisi soruyorsa (sinirli bile olsa), o intent'i seç
2. "complaint" SADECE: Yönetici/müşteri hizmetleri istiyor VEYA genel şikayet (spesifik bilgi istemiyor)

Yanıt olarak SADECE intent adını yaz.`
      : `User said: "${userMessage}"

Choose the intent from this list:

${intentList}

IMPORTANT RULES:
1. If user asks about ORDER/CARGO/DEBT info (even if angry), choose that intent
2. "complaint" ONLY: Asking for manager/customer service OR general complaint (NOT asking for specific info)

Reply with ONLY the intent name.`;

    const result = await model.generateContent(prompt);
    const detectedIntent = result.response.text().trim().toLowerCase();

    // Validate intent exists
    if (!INTENT_CONFIG[detectedIntent]) {
      console.warn('⚠️ Unknown intent detected:', detectedIntent);
      return 'general_question'; // fallback
    }

    console.log('🎯 Intent detected:', detectedIntent);
    return detectedIntent;

  } catch (error) {
    console.error('❌ Intent detection error:', error);
    return 'general_question'; // fallback on error
  }
}

/**
 * Validate input format (VALIDATOR ONLY - does NOT decide intent or routing)
 *
 * ARCHITECTURE CHANGE: This function NO LONGER determines intent, forces tool calls,
 * or makes routing decisions. It ONLY validates format for backend use.
 * LLM is responsible for understanding what the user means.
 *
 * @param {string} message - User message
 * @returns {Object|null} - Format validation hints (NOT routing decisions)
 */
export function validateInputFormat(message) {
  if (!message) return null;
  const trimmed = message.trim();

  // Order number format (centralized validator contract)
  const orderPrefixCandidate = trimmed.match(/\b(?:ORD|ORDER|SIP|SIPARIS)[\s\-_]*[A-Z0-9][A-Z0-9\s\-_]{2,}\b/i);
  if (orderPrefixCandidate) {
    const candidate = orderPrefixCandidate[0].trim();
    if (isLikelyValidOrderNumber(candidate)) {
      return { type: 'ORDER_NUMBER', value: candidate, confidence: 'high' };
    }
  }

  const orderKeywordCandidate = trimmed.match(/(?:sipariş|siparis|order)\s*(?:no|numarası|numarasi|number|num)?[:\s#-]+([A-Z0-9][A-Z0-9\s\-_]{2,})/i);
  if (orderKeywordCandidate) {
    const candidate = orderKeywordCandidate[1].trim();
    if (isLikelyValidOrderNumber(candidate)) {
      return { type: 'ORDER_NUMBER', value: candidate, confidence: 'medium' };
    }
  }

  // Turkish mobile phone format
  const phoneMatch = trimmed.match(/\b(0?5\d{9})\b/);
  if (phoneMatch) {
    return { type: 'PHONE', value: phoneMatch[1], confidence: 'medium' };
  }

  // TC Kimlik (11 digits)
  const tcMatch = trimmed.match(/\b(\d{11})\b/);
  if (tcMatch) {
    return { type: 'TC_KIMLIK', value: tcMatch[1], confidence: 'medium' };
  }

  // VKN (10 digits)
  const vknMatch = trimmed.match(/\b(\d{10})\b/);
  if (vknMatch) {
    return { type: 'VKN', value: vknMatch[1], confidence: 'medium' };
  }

  return null;
}

/**
 * @deprecated - REMOVED: Was forcing tool calls and routing decisions from backend.
 * Use validateInputFormat() for format validation only.
 * LLM now handles intent detection and entity extraction.
 */
function detectDeterministicPattern(message) {
  // DISABLED: No longer makes routing decisions.
  // Kept as stub for backward compatibility - always returns null.
  console.log('⚠️ [DEPRECATED] detectDeterministicPattern called but disabled - LLM handles intent now');
  return null;
}

/**
 * Get or create session counter
 * @param {string} sessionId - Session ID (phone number or chat session)
 * @returns {Object} - Session counter object
 */
function getSessionCounter(sessionId) {
  // Clean up old sessions
  cleanupExpiredSessions();

  if (!sessionCounters.has(sessionId)) {
    sessionCounters.set(sessionId, {
      offTopicCount: 0,
      verificationAttempts: {},
      lastIntent: null,
      timestamp: Date.now()
    });
  }

  // Update timestamp
  const counter = sessionCounters.get(sessionId);
  counter.timestamp = Date.now();

  return counter;
}

/**
 * Cleanup expired sessions (older than 30 minutes)
 */
function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, counter] of sessionCounters.entries()) {
    if (now - counter.timestamp > SESSION_TIMEOUT) {
      sessionCounters.delete(sessionId);
      console.log('🧹 Cleaned up expired session:', sessionId);
    }
  }
}

/**
 * Increment off-topic counter
 * @param {string} sessionId - Session ID
 * @returns {Object} - { shouldTerminate: boolean, count: number }
 */
export function incrementOffTopicCounter(sessionId) {
  const counter = getSessionCounter(sessionId);
  counter.offTopicCount += 1;

  console.log(`📊 Off-topic count for ${sessionId}: ${counter.offTopicCount}/3`);

  return {
    shouldTerminate: counter.offTopicCount >= 3,
    count: counter.offTopicCount
  };
}

/**
 * Increment verification attempt counter
 * @param {string} sessionId - Session ID
 * @param {string} intent - Intent type (e.g., 'order_status')
 * @returns {Object} - { shouldTerminate: boolean, count: number }
 */
export function incrementVerificationAttempt(sessionId, intent) {
  const counter = getSessionCounter(sessionId);

  if (!counter.verificationAttempts[intent]) {
    counter.verificationAttempts[intent] = 0;
  }

  counter.verificationAttempts[intent] += 1;

  const maxAttempts = INTENT_CONFIG[intent]?.maxAttempts || 3;
  const currentAttempts = counter.verificationAttempts[intent];

  console.log(`🔒 Verification attempts for ${intent}: ${currentAttempts}/${maxAttempts}`);

  return {
    shouldTerminate: currentAttempts >= maxAttempts,
    count: currentAttempts
  };
}

/**
 * Reset session counters
 * @param {string} sessionId - Session ID
 */
export function resetSessionCounters(sessionId) {
  sessionCounters.delete(sessionId);
  console.log('🔄 Session counters reset:', sessionId);
}

/**
 * Get tools for a specific intent
 * @param {string} intent - Intent key
 * @returns {Array} - List of tool names
 */
export function getToolsForIntent(intent) {
  return INTENT_CONFIG[intent]?.tools || [];
}

/**
 * Check if intent requires verification
 * @param {string} intent - Intent key
 * @returns {boolean}
 */
export function requiresVerification(intent) {
  return INTENT_CONFIG[intent]?.requiresVerification || false;
}

/**
 * Get verification fields for intent
 * @param {string} intent - Intent key
 * @returns {Array} - List of verification field names
 */
export function getVerificationFields(intent) {
  return INTENT_CONFIG[intent]?.verificationFields || [];
}

/**
 * Main intent routing function
 * @param {string} userMessage - User's message
 * @param {string} sessionId - Session ID (phone or chat session)
 * @param {string} language - Language code (TR/EN)
 * @param {Object} businessInfo - Optional business info for personalization
 * @returns {Promise<Object>} - Routing result with intent, tools, and actions
 */
export async function routeIntent(userMessage, sessionId, language = 'TR', businessInfo = {}) {
  try {
    // ARCHITECTURE CHANGE: detectDeterministicPattern() REMOVED from routing.
    // LLM now handles intent detection. Backend only validates format.
    // Format hints are available via validateInputFormat() if needed downstream.

    // PRIORITY CHECK: Is user responding to a verification request?
    const pendingVerification = verificationCache.get(sessionId);

    if (pendingVerification) {
      console.log('🔐 Pending verification detected - treating message as verification response');

      // Determine which field was requested based on cache
      // Priority: expectedFieldType (from tool metadata) > requestedField > field > default
      let requestedField = pendingVerification.expectedFieldType
        || pendingVerification.requestedField
        || pendingVerification.field
        || 'customer_name';

      // Map expectedFieldType to actual tool parameter names
      const fieldMapping = {
        'name': 'customer_name',
        'person_name': 'customer_name',
        'company_name': 'customer_name'
      };

      if (fieldMapping[requestedField]) {
        requestedField = fieldMapping[requestedField];
      }

      console.log(`🔍 Requested field from cache: ${requestedField} (expectedFieldType: ${pendingVerification.expectedFieldType})`);

      // Smart detection: If requested VKN but user might have given TC or phone
      if (requestedField === 'vkn') {
        const detectedType = detectNumberType(userMessage);
        console.log(`🔍 Auto-detected number type: ${detectedType}`);
        if (detectedType === 'tc' || detectedType === 'phone') {
          requestedField = detectedType;
          console.log(`✅ Corrected field type from 'vkn' to '${requestedField}'`);
        }
      }

      // User is providing verification info (name, phone, VKN, TC, etc.)
      // Route to customer_data_lookup with the user's response in the appropriate field
      return {
        intent: 'verification_response',
        tools: ['customer_data_lookup'],
        shouldTerminate: false,
        queryType: pendingVerification.queryType, // Pass queryType from cache
        // Pass user message in the dynamically determined field
        verificationData: {
          [requestedField]: userMessage.trim()
        }
      };
    }

    // 1. Detect intent
    const intent = await detectIntent(userMessage, language);

    // 2. Handle profanity (küfür) - 3 strikes (security only)
    if (intent === 'profanity') {
      const counter = getSessionCounter(sessionId);

      if (!counter.profanityCount) {
        counter.profanityCount = 0;
      }

      counter.profanityCount += 1;
      const profanityCount = counter.profanityCount;

      console.log(`🚫 Profanity count for ${sessionId}: ${profanityCount}/3`);

      if (profanityCount >= 3) {
        // 3rd strike - terminate (SECURITY: hardcoded is OK here)
        return {
          intent,
          tools: [],
          shouldTerminate: true,
          response: language === 'TR'
            ? 'Güvenlik nedeniyle oturumunuz sonlandırıldı.'
            : 'Your session has been terminated for security reasons.'
        };
      }

      // 1st and 2nd strike - LET LLM respond naturally
      // ARCHITECTURE CHANGE: No template. LLM will see profanity context and respond.
      return {
        intent,
        tools: [],
        shouldTerminate: false,
        letLLMRespond: true, // Signal: don't use directResponse, let LLM handle
        profanityStrike: profanityCount
      };
    }

    // 3. Handle off-topic
    if (intent === 'off_topic') {
      const { shouldTerminate, count } = incrementOffTopicCounter(sessionId);

      // If session should terminate, use hardcoded message
      if (shouldTerminate) {
        return {
          intent,
          tools: [],
          shouldTerminate: true,
          response: language === 'TR'
            ? 'Güvenlik nedeniyle oturumunuz sonlandırıldı.'
            : 'Your session has been terminated for security reasons.'
        };
      }

      // LLM-first: do not generate direct off-topic responses here.
      return {
        intent,
        tools: [],
        shouldTerminate: false,
        letLLMRespond: true,
        offTopicStrike: count
      };
    }

    // 3. Get tools for intent
    const tools = getToolsForIntent(intent);
    const config = INTENT_CONFIG[intent];

    // 4. Return routing result
    return {
      intent,
      tools,
      requiresVerification: config.requiresVerification,
      verificationFields: config.verificationFields,
      useKnowledgeBase: config.useKnowledgeBase,
      shouldTerminate: false
    };

  } catch (error) {
    console.error('❌ Intent routing error:', error);

    // Fallback to general question
    return {
      intent: 'general_question',
      tools: [],
      requiresVerification: false,
      shouldTerminate: false
    };
  }
}

/**
 * Handle verification failure
 * @param {string} sessionId - Session ID
 * @param {string} intent - Intent that failed verification
 * @param {string} language - Language code
 * @returns {Object} - { shouldTerminate: boolean, response: string }
 */
export function handleVerificationFailure(sessionId, intent, language = 'TR') {
  const { shouldTerminate, count } = incrementVerificationAttempt(sessionId, intent);

  const maxAttempts = INTENT_CONFIG[intent]?.maxAttempts || 3;

  return {
    shouldTerminate,
    response: language === 'TR'
      ? shouldTerminate
        ? 'Güvenlik nedeniyle oturumunuz sonlandırıldı. Lütfen müşteri hizmetlerini arayın.'
        : `Kayıt bulunamadı. Lütfen bilgilerinizi kontrol edin. (${count}/${maxAttempts})`
      : shouldTerminate
        ? 'Your session has been terminated for security reasons. Please contact customer service.'
        : `Record not found. Please check your information. (${count}/${maxAttempts})`
  };
}

export default {
  detectIntent,
  routeIntent,
  validateInputFormat,
  getToolsForIntent,
  requiresVerification,
  getVerificationFields,
  incrementOffTopicCounter,
  incrementVerificationAttempt,
  resetSessionCounters,
  handleVerificationFailure
};
