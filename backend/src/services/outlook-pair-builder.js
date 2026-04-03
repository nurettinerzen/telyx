/**
 * Outlook Email Pair Builder
 *
 * Same functionality as Gmail pair builder but for Outlook/Microsoft Graph API
 *
 * Graph API endpoints:
 * - GET /me/mailFolders/sentitems/messages (sent emails)
 * - GET /me/messages/{id} (message details)
 * - conversationId for thread grouping
 */

import axios from 'axios';
import prisma from '../prismaClient.js';
import { cleanEmailText, extractClosingPattern, detectLengthBucket } from './email-text-cleaner.js';
import { classifyTone, classifyContactType } from './email-tone-classifier.js';
import { withRetry, processBatches } from './gmail-rate-limiter.js'; // Same rate limiter

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

/**
 * Build email pairs for Outlook
 * @param {number} businessId
 * @param {Object} options - { daysBack: 30, limit: 100 }
 * @returns {Promise<Object>} { success, pairsCreated, error }
 */
export async function buildOutlookEmailPairs(businessId, options = {}) {
  const { daysBack = 30, limit = 100 } = options;

  console.log(`[OutlookPairBuilder] Starting pair extraction for business ${businessId}`);
  console.log(`[OutlookPairBuilder] Config: last ${daysBack} days, max ${limit} pairs`);

  try {
    // Get email integration
    const integration = await prisma.emailIntegration.findUnique({
      where: { businessId },
      include: { business: true }
    });

    if (!integration || !integration.connected) {
      return { success: false, error: 'Email integration not connected' };
    }

    if (integration.provider !== 'OUTLOOK') {
      return { success: false, error: 'Only Outlook is supported by this builder' };
    }

    // Get access token
    const accessToken = await getOutlookAccessToken(integration);

    // Fetch sent emails with conversations
    const sentEmails = await fetchOutlookSentEmails(accessToken, daysBack, limit);

    console.log(`[OutlookPairBuilder] Found ${sentEmails.length} sent emails`);

    // Group by conversationId
    const conversationMap = new Map();
    for (const email of sentEmails) {
      const convId = email.conversationId;
      if (!conversationMap.has(convId)) {
        conversationMap.set(convId, []);
      }
      conversationMap.get(convId).push(email);
    }

    console.log(`[OutlookPairBuilder] Grouped into ${conversationMap.size} conversations`);

    // For each conversation, fetch full thread
    let pairsCreated = 0;
    const errors = [];

    for (const [convId, sentMessages] of conversationMap.entries()) {
      try {
        // Fetch all messages in this conversation
        const threadMessages = await fetchConversationMessages(accessToken, convId);

        // Extract pairs
        const pairs = await extractPairsFromOutlookThread(
          threadMessages,
          sentMessages,
          businessId,
          integration.email
        );

        // Save pairs
        for (const pair of pairs) {
          try {
            await savePair(pair, businessId);
            pairsCreated++;
          } catch (saveError) {
            // Likely duplicate
            if (!saveError.message.includes('Unique constraint')) {
              console.warn(`[OutlookPairBuilder] Failed to save pair:`, saveError.message);
              errors.push(saveError.message);
            }
          }
        }
      } catch (convError) {
        console.warn(`[OutlookPairBuilder] Failed to process conversation ${convId}:`, convError.message);
        errors.push(convError.message);
      }
    }

    console.log(`[OutlookPairBuilder] Completed: ${pairsCreated} pairs created`);

    return {
      success: true,
      pairsCreated,
      conversationsProcessed: conversationMap.size,
      errors: errors.slice(0, 10)
    };

  } catch (error) {
    console.error(`[OutlookPairBuilder] Error:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Get Outlook access token (with refresh if needed)
 */
async function getOutlookAccessToken(integration) {
  const { credentials } = integration;

  // Check if token expired
  if (credentials.expiry_date && Date.now() >= credentials.expiry_date) {
    console.log('[OutlookPairBuilder] Access token expired, refreshing...');

    // Refresh token
    const response = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      refresh_token: credentials.refresh_token,
      grant_type: 'refresh_token',
      scope: 'https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send offline_access'
    }));

    const newCredentials = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token || credentials.refresh_token,
      expiry_date: Date.now() + (response.data.expires_in * 1000)
    };

    // Update in DB
    await prisma.emailIntegration.update({
      where: { id: integration.id },
      data: { credentials: newCredentials }
    });

    return newCredentials.access_token;
  }

  return credentials.access_token;
}

/**
 * Fetch sent emails from Outlook (last N days)
 */
async function fetchOutlookSentEmails(accessToken, daysBack, limit) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  const query = {
    $filter: `sentDateTime ge ${cutoffDate.toISOString()}`,
    $orderby: 'sentDateTime desc',
    $top: limit,
    $select: 'id,conversationId,subject,sentDateTime,from,toRecipients,body,internetMessageId,internetMessageHeaders'
  };

  const url = `${GRAPH_API_BASE}/me/mailFolders/sentitems/messages`;

  const response = await withRetry(async () => {
    return await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: query
    });
  });

  return response.data.value || [];
}

/**
 * Fetch all messages in a conversation
 */
async function fetchConversationMessages(accessToken, conversationId) {
  const query = {
    $filter: `conversationId eq '${conversationId}'`,
    $orderby: 'receivedDateTime asc',
    $select: 'id,conversationId,subject,sentDateTime,receivedDateTime,from,toRecipients,body,internetMessageId,internetMessageHeaders,isRead'
  };

  const url = `${GRAPH_API_BASE}/me/messages`;

  const response = await withRetry(async () => {
    return await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: query
    });
  });

  return response.data.value || [];
}

/**
 * Extract INBOUND → OUTBOUND pairs from Outlook thread
 *
 * Same logic as Gmail but adapted for Graph API structure
 */
async function extractPairsFromOutlookThread(threadMessages, sentMessages, businessId, myEmail) {
  const pairs = [];

  // Build message ID map for In-Reply-To matching
  const messageMap = new Map();
  for (const msg of threadMessages) {
    const internetMessageId = msg.internetMessageId;
    if (internetMessageId) {
      messageMap.set(internetMessageId, msg);
    }
  }

  // Process each OUTBOUND message
  for (const outboundMsg of sentMessages) {
    let parentInbound = null;

    // STRATEGY 1: Use In-Reply-To header
    const headers = outboundMsg.internetMessageHeaders || [];
    const inReplyToHeader = headers.find(h => h.name === 'In-Reply-To');

    if (inReplyToHeader) {
      parentInbound = messageMap.get(inReplyToHeader.value);
      if (parentInbound) {
        console.log(`[OutlookPairBuilder] Found parent via In-Reply-To`);
      }
    }

    // STRATEGY 2: Use References header
    if (!parentInbound) {
      const referencesHeader = headers.find(h => h.name === 'References');
      if (referencesHeader) {
        const refIds = referencesHeader.value.match(/<[^>]+>/g) || [];
        for (let k = refIds.length - 1; k >= 0; k--) {
          const refId = refIds[k].slice(1, -1);
          parentInbound = messageMap.get(refId);
          if (parentInbound) {
            console.log(`[OutlookPairBuilder] Found parent via References`);
            break;
          }
        }
      }
    }

    // STRATEGY 3: Recency heuristic
    if (!parentInbound) {
      const outboundTime = new Date(outboundMsg.sentDateTime).getTime();

      // Find most recent INBOUND before this OUTBOUND
      for (let i = threadMessages.length - 1; i >= 0; i--) {
        const msg = threadMessages[i];
        const msgTime = new Date(msg.receivedDateTime || msg.sentDateTime).getTime();

        // Must be before outbound
        if (msgTime >= outboundTime) continue;

        // Must be from someone else
        const fromEmail = msg.from?.emailAddress?.address || '';
        if (fromEmail.toLowerCase() === myEmail.toLowerCase()) continue;

        parentInbound = msg;
        console.log(`[OutlookPairBuilder] Found parent via recency heuristic`);
        break;
      }
    }

    if (!parentInbound) {
      console.log(`[OutlookPairBuilder] No parent inbound for ${outboundMsg.id} - skipping`);
      continue;
    }

    // VALIDATION: Time gap check (max 7 days)
    const outboundTime = new Date(outboundMsg.sentDateTime).getTime();
    const inboundTime = new Date(parentInbound.receivedDateTime || parentInbound.sentDateTime).getTime();
    const timeDiffDays = (outboundTime - inboundTime) / (1000 * 60 * 60 * 24);

    if (timeDiffDays > 7) {
      console.warn(`[OutlookPairBuilder] Time gap too large (${timeDiffDays.toFixed(1)} days) - skipping`);
      continue;
    }

    // Build pair data
    try {
      const pairData = await buildOutlookPairData(parentInbound, outboundMsg, outboundMsg.conversationId, businessId);
      pairs.push(pairData);
    } catch (error) {
      console.warn(`[OutlookPairBuilder] Failed to build pair:`, error.message);
    }
  }

  return pairs;
}

/**
 * Build pair data from Outlook messages
 */
async function buildOutlookPairData(inboundMsg, outboundMsg, threadId, businessId) {
  // Extract text content
  const inboundRaw = inboundMsg.body?.content || '';
  const outboundRaw = outboundMsg.body?.content || '';

  // Clean text (strips HTML if body type is HTML)
  const inboundCleaned = cleanEmailText(inboundRaw, 'INBOUND');
  const outboundCleaned = cleanEmailText(outboundRaw, 'OUTBOUND');

  // Classify tone
  const inboundToneResult = await classifyTone(inboundCleaned.cleanedText, 'INBOUND');
  const outboundToneResult = await classifyTone(outboundCleaned.cleanedText, 'OUTBOUND');

  // Extract features
  const closingPattern = extractClosingPattern(outboundCleaned.signature);
  const lengthBucket = detectLengthBucket(outboundCleaned.cleanedText);

  // Extract domain
  const fromEmail = inboundMsg.from?.emailAddress?.address || '';
  const fromDomain = fromEmail.split('@')[1] || '';

  // Classify contact type
  const contactType = classifyContactType(fromEmail);

  // Detect language
  const language = detectLanguage(inboundCleaned.cleanedText);

  // Sent timestamp
  const sentAt = new Date(outboundMsg.sentDateTime);

  return {
    threadId,
    inboundMessageId: inboundMsg.internetMessageId || inboundMsg.id,
    outboundMessageId: outboundMsg.internetMessageId || outboundMsg.id,
    inboundTone: inboundToneResult.tone,
    outboundTone: outboundToneResult.tone,
    closingPattern,
    signatureUsed: outboundCleaned.signature,
    lengthBucket,
    contactType,
    fromDomain,
    intent: null, // TODO: Add intent classification
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

/**
 * Save pair to database
 */
async function savePair(pairData, businessId) {
  return await prisma.emailPair.create({
    data: {
      businessId,
      ...pairData
    }
  });
}

export default {
  buildOutlookEmailPairs
};
