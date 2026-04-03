/**
 * Step 1: Load Email Context
 *
 * Loads all necessary context for email draft generation:
 * - Business info (with assistant, integrations)
 * - Email integration (credentials, style profile)
 * - Thread details
 * - Inbound message to reply to
 * - Knowledge base items
 */

import prisma from '../../../prismaClient.js';
import { resolveChatAssistantForBusiness } from '../../../services/assistantChannels.js';

/**
 * Load email context for draft generation
 *
 * @param {Object} ctx - Pipeline context
 * @returns {Promise<Object>} { success, error? }
 */
export async function loadEmailContext(ctx) {
  const { businessId, threadId, messageId } = ctx;

  try {
    // Load business with all related data
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
        emailIntegration: true,
        crmWebhook: true  // P5-FIX: Required for check_stock_crm tool gating
      }
    });

    if (!business) {
      return { success: false, error: 'Business not found' };
    }

    if (!business.emailIntegration || !business.emailIntegration.connected) {
      return { success: false, error: 'Email not connected' };
    }

    // Load thread
    const thread = await prisma.emailThread.findFirst({
      where: {
        id: threadId,
        businessId
      }
    });

    if (!thread) {
      return { success: false, error: 'Thread not found' };
    }

    // Load inbound message to reply to
    let inboundMessage;

    if (messageId) {
      // Specific message provided
      inboundMessage = await prisma.emailMessage.findFirst({
        where: {
          id: messageId,
          threadId: thread.id
        }
      });
    } else {
      // Get latest inbound message
      inboundMessage = await prisma.emailMessage.findFirst({
        where: {
          threadId: thread.id,
          direction: 'INBOUND'
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    if (!inboundMessage) {
      return { success: false, error: 'No inbound message found to reply to' };
    }

    // Load knowledge base
    const knowledgeItems = await prisma.knowledgeBase.findMany({
      where: {
        businessId,
        status: 'ACTIVE'
      }
    });

    const resolved = await resolveChatAssistantForBusiness({
      prisma,
      business,
      allowAutoCreate: true
    });

    if (!resolved.assistant) {
      return { success: false, error: 'No chat-capable assistant found' };
    }

    // Update context
    ctx.business = business;
    ctx.assistant = resolved.assistant;
    ctx.emailIntegration = business.emailIntegration;
    ctx.thread = thread;
    ctx.inboundMessage = inboundMessage;
    ctx.knowledgeItems = knowledgeItems;

    // Extract key info for easy access
    ctx.customerEmail = thread.customerEmail;
    ctx.customerName = thread.customerName;
    ctx.subject = thread.subject;
    ctx.provider = business.emailIntegration.provider; // 'GMAIL' or 'OUTLOOK'
    ctx.connectedEmail = business.emailIntegration.email;
    ctx.styleProfile = business.emailIntegration.styleProfile;
    ctx.emailSignature = business.emailIntegration.emailSignature;
    ctx.signatureType = business.emailIntegration.signatureType || 'PLAIN';

    // Detect language from inbound message, with business language as fallback
    ctx.language = detectLanguage(inboundMessage.bodyText || inboundMessage.subject, business.language);

    console.log(`📧 [LoadContext] Business: ${business.name}, Provider: ${ctx.provider}`);
    console.log(`📧 [LoadContext] Thread: ${thread.subject}, Customer: ${ctx.customerEmail}`);
    console.log(`📧 [LoadContext] Language detected: ${ctx.language}`);

    return { success: true };

  } catch (error) {
    console.error('❌ [LoadContext] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Detect language from text
 * @param {string} text
 * @param {string} [businessLanguage] - Business default language as fallback
 * @returns {string} 'TR' or 'EN'
 */
function detectLanguage(text, businessLanguage) {
  if (!text) return businessLanguage || 'EN';

  const lowerText = text.toLowerCase();

  // Turkish special characters are strong indicators
  if (/[ığüşöçİĞÜŞÖÇ]/.test(text)) {
    return 'TR';
  }

  // Common Turkish words/phrases (expanded with order/commerce terms)
  const turkishIndicators = [
    'merhaba', 'tesekkur', 'teşekkür', 'lutfen', 'lütfen', 'nasil', 'nasıl',
    'iyi gunler', 'iyi günler', 'saygilar', 'saygılar', 'sayin', 'sayın',
    'rica', 'bilgi', 'hakkinda', 'hakkında', 'musteri', 'müşteri',
    'sikayet', 'şikayet', 'randevu', 'fiyat', 'urun', 'ürün', 'hizmet',
    'gorüşmek', 'görüşmek', 'ekteki', 'ilgili', 'konu', 'talep',
    'siparis', 'sipariş', 'odeme', 'ödeme', 'fatura', 'teslimat',
    'selamlar', 'hayirli', 'hayırlı', 'kolay gelsin', 'iyilik',
    // Order/commerce terms often seen in ORDER intent emails
    'nerede', 'durumu', 'durum', 'kargo', 'takip', 'numara',
    'ne zaman', 'gelecek', 'teslim', 'iade', 'degisim', 'değişim',
    'iptal', 'stok', 'stokta', 'mevcut', 'var mi', 'var mı',
    'siparisim', 'siparişim', 'siparis no', 'sipariş no',
    'nereden', 'nereye', 'sorunu', 'sorunum', 'yardim', 'yardım'
  ];

  // English-only words/phrases
  // NOTE: Ambiguous commerce terms (order, delivery, payment, invoice, shipping)
  // are intentionally excluded — they appear in both TR and EN emails.
  // Instead we use EN-only stopwords/phrases that never appear in Turkish text.
  const englishIndicators = [
    // Greetings & closings (EN-only)
    'hello', 'hi there', 'dear', 'thank you', 'thanks', 'please', 'regards',
    'sincerely', 'best regards', 'kind regards', 'looking forward',
    // EN-only phrases
    'i would like', 'i am', 'we are', 'could you', 'would you',
    'meeting', 'schedule', 'appointment', 'confirm', 'confirmation',
    'attached', 'please find', 'let me know', 'get back to',
    'happy to', 'hope this', 'following up', 'as discussed',
    'question', 'inquiry', 'request', 'issue', 'problem',
    'available', 'convenient', 'possible', 'appreciate',
    // EN-only stopwords (never appear in Turkish emails)
    ' the ', ' and ', ' your ', ' our ', ' this ', ' that ',
    ' with ', ' from ', ' have ', ' been ', ' has been ',
    'we will', 'you can', 'there is', 'do not', 'does not',
    'would be', 'should be', 'will be', 'can be'
  ];

  let turkishScore = 0;
  let englishScore = 0;

  for (const word of turkishIndicators) {
    if (lowerText.includes(word)) turkishScore++;
  }

  for (const word of englishIndicators) {
    if (lowerText.includes(word)) englishScore++;
  }

  if (turkishScore > englishScore) return 'TR';
  if (englishScore > turkishScore) return 'EN';

  // Tie or no matches: use business language as fallback
  return businessLanguage || 'EN';
}

export default { loadEmailContext };
