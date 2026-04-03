/**
 * Incremental Outlook Email Pair Builder
 *
 * Same functionality as Gmail incremental builder but for Outlook
 */

import prisma from '../prismaClient.js';
import { cleanEmailText, extractClosingPattern, detectLengthBucket } from './email-text-cleaner.js';
import { classifyTone, classifyContactType } from './email-tone-classifier.js';

/**
 * Create a pair for a newly detected OUTBOUND message (Outlook)
 *
 * @param {Object} params
 * @param {number} params.businessId
 * @param {string} params.threadId - EmailThread ID
 * @param {string} params.outboundMessageId - EmailMessage ID (OUTBOUND)
 * @returns {Promise<Object>} { success, pairId?, error? }
 */
export async function createOutlookPairForOutbound({ businessId, threadId, outboundMessageId }) {
  try {
    console.log(`[OutlookPairIncremental] Creating pair for outbound ${outboundMessageId}`);

    // Get the outbound message
    const outboundMessage = await prisma.emailMessage.findUnique({
      where: { id: outboundMessageId },
      include: {
        thread: {
          include: {
            messages: {
              orderBy: { receivedAt: 'asc' }
            }
          }
        }
      }
    });

    if (!outboundMessage) {
      return { success: false, error: 'Outbound message not found' };
    }

    if (outboundMessage.direction !== 'OUTBOUND') {
      return { success: false, error: 'Message is not OUTBOUND' };
    }

    // Find parent INBOUND (most recent inbound before this outbound)
    const messages = outboundMessage.thread.messages;
    const outboundIndex = messages.findIndex(m => m.id === outboundMessageId);

    if (outboundIndex === -1) {
      return { success: false, error: 'Could not find message in thread' };
    }

    // Search backwards for parent INBOUND
    let parentInbound = null;
    for (let i = outboundIndex - 1; i >= 0; i--) {
      if (messages[i].direction === 'INBOUND') {
        parentInbound = messages[i];
        break;
      }
    }

    if (!parentInbound) {
      console.log(`[OutlookPairIncremental] No parent inbound for ${outboundMessageId} - skipping`);
      return { success: false, error: 'No parent inbound (initial outreach)' };
    }

    // Check if pair already exists
    const existing = await prisma.emailPair.findFirst({
      where: {
        businessId,
        inboundMessageId: parentInbound.messageId,
        outboundMessageId: outboundMessage.messageId
      }
    });

    if (existing) {
      console.log(`[OutlookPairIncremental] Pair already exists for ${outboundMessageId}`);
      return { success: true, pairId: existing.id, existed: true };
    }

    // Build pair data
    const pairData = await buildIncrementalPairData(
      parentInbound,
      outboundMessage,
      threadId,
      businessId
    );

    // Save pair
    const pair = await prisma.emailPair.create({
      data: {
        businessId,
        ...pairData
      }
    });

    console.log(`[OutlookPairIncremental] Created pair ${pair.id}`);

    return { success: true, pairId: pair.id };

  } catch (error) {
    console.error(`[OutlookPairIncremental] Error creating pair:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Build pair data from inbound + outbound messages
 */
async function buildIncrementalPairData(inboundMsg, outboundMsg, threadId, businessId) {
  // Extract text
  const inboundRaw = inboundMsg.bodyText || '';
  const outboundRaw = outboundMsg.bodyText || '';

  // Clean text
  const inboundCleaned = cleanEmailText(inboundRaw, 'INBOUND');
  const outboundCleaned = cleanEmailText(outboundRaw, 'OUTBOUND');

  // Classify tone
  const inboundToneResult = await classifyTone(inboundCleaned.cleanedText, 'INBOUND');
  const outboundToneResult = await classifyTone(outboundCleaned.cleanedText, 'OUTBOUND');

  // Extract features
  const closingPattern = extractClosingPattern(outboundCleaned.signature);
  const lengthBucket = detectLengthBucket(outboundCleaned.cleanedText);

  // Extract domain
  const fromDomain = inboundMsg.fromEmail?.split('@')[1] || '';

  // Classify contact type
  const contactType = classifyContactType(inboundMsg.fromEmail);

  // Detect language
  const language = detectLanguage(inboundCleaned.cleanedText);

  // Sent timestamp
  const sentAt = outboundMsg.sentAt || new Date();

  return {
    threadId,
    inboundMessageId: inboundMsg.messageId,
    outboundMessageId: outboundMsg.messageId,
    inboundTone: inboundToneResult.tone,
    outboundTone: outboundToneResult.tone,
    closingPattern,
    signatureUsed: outboundCleaned.signature,
    lengthBucket,
    contactType,
    fromDomain,
    intent: null,
    language,
    inboundText: inboundCleaned.cleanedText,
    outboundText: outboundCleaned.cleanedText,
    inboundRaw,
    outboundRaw,
    confidence: Math.min(inboundToneResult.confidence, outboundToneResult.confidence),
    sentAt
  };
}

/**
 * Detect language
 */
function detectLanguage(text) {
  if (!text) return 'EN';

  if (/[ığüşöçİĞÜŞÖÇ]/.test(text)) {
    return 'TR';
  }

  const turkishWords = ['merhaba', 'teşekkür', 'lütfen', 'nasıl', 'iyi', 'günler', 'saygılar'];
  const lowerText = text.toLowerCase();

  for (const word of turkishWords) {
    if (lowerText.includes(word)) {
      return 'TR';
    }
  }

  return 'EN';
}

export default {
  createOutlookPairForOutbound
};
