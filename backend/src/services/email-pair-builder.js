/**
 * Email Pair Builder
 *
 * Fetches Gmail threads and builds INBOUND → OUTBOUND pairs for learning.
 *
 * Strategy:
 * 1. Fetch all threads from last 30 days
 * 2. For each thread, extract message pairs
 * 3. Match each OUTBOUND with its parent INBOUND
 * 4. Clean text, classify tone, extract features
 * 5. Save to EmailPair table
 */

import { google } from 'googleapis';
import prisma from '../prismaClient.js';
import { cleanEmailText, extractClosingPattern, detectLengthBucket } from './email-text-cleaner.js';
import { classifyTone, classifyContactType } from './email-tone-classifier.js';
import { withRetry, processBatches } from './gmail-rate-limiter.js';

/**
 * Build email pairs for a business
 * @param {number} businessId
 * @param {Object} options - { daysBack: 30, limit: 100 }
 * @returns {Promise<Object>} { success, pairsCreated, error }
 */
export async function buildEmailPairs(businessId, options = {}) {
  const { daysBack = 30, limit = 100 } = options;

  console.log(`[PairBuilder] Starting pair extraction for business ${businessId}`);
  console.log(`[PairBuilder] Config: last ${daysBack} days, max ${limit} pairs`);

  try {
    // Get email integration
    const integration = await prisma.emailIntegration.findUnique({
      where: { businessId },
      include: { business: true }
    });

    if (!integration || !integration.connected) {
      return { success: false, error: 'Email integration not connected' };
    }

    // Route to appropriate provider
    if (integration.provider === 'OUTLOOK') {
      // Import Outlook builder dynamically
      const { buildOutlookEmailPairs } = await import('./outlook-pair-builder.js');
      return await buildOutlookEmailPairs(businessId, { daysBack, limit });
    }

    // Gmail provider
    if (integration.provider !== 'GMAIL') {
      return { success: false, error: `Unsupported provider: ${integration.provider}` };
    }

    // Get authenticated Gmail client
    const gmail = await getAuthenticatedGmailClient(integration);

    // Fetch threads with both SENT and INBOX messages
    const threads = await fetchThreadsWithPairs(gmail, daysBack, limit);

    console.log(`[PairBuilder] Found ${threads.length} threads with potential pairs`);

    // Extract pairs from threads
    let pairsCreated = 0;
    const errors = [];

    for (const thread of threads) {
      try {
        const pairs = await extractPairsFromThread(thread, businessId, integration.email);

        for (const pair of pairs) {
          try {
            await savePair(pair, businessId);
            pairsCreated++;
          } catch (saveError) {
            // Likely duplicate, skip
            if (!saveError.message.includes('Unique constraint')) {
              console.warn(`[PairBuilder] Failed to save pair:`, saveError.message);
              errors.push(saveError.message);
            }
          }
        }
      } catch (extractError) {
        console.warn(`[PairBuilder] Failed to extract pairs from thread:`, extractError.message);
        errors.push(extractError.message);
      }
    }

    console.log(`[PairBuilder] Completed: ${pairsCreated} pairs created`);

    return {
      success: true,
      pairsCreated,
      threadsProcessed: threads.length,
      errors: errors.slice(0, 10) // First 10 errors only
    };

  } catch (error) {
    console.error(`[PairBuilder] Error:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Get authenticated Gmail client
 */
async function getAuthenticatedGmailClient(integration) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials(integration.credentials);

  // Handle token refresh
  if (integration.credentials.expiry_date && Date.now() >= integration.credentials.expiry_date) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    await prisma.emailIntegration.update({
      where: { id: integration.id },
      data: { credentials }
    });
    oauth2Client.setCredentials(credentials);
  }

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Fetch threads that have both SENT and INBOX messages
 */
async function fetchThreadsWithPairs(gmail, daysBack, limit) {
  const cutoffDate = Math.floor((Date.now() - daysBack * 24 * 60 * 60 * 1000) / 1000);

  // Query for threads where we sent a reply
  const query = `in:sent after:${cutoffDate}`;

  const listResponse = await gmail.users.threads.list({
    userId: 'me',
    q: query,
    maxResults: Math.min(limit, 100) // Gmail API limit
  });

  if (!listResponse.data.threads || listResponse.data.threads.length === 0) {
    return [];
  }

  // Fetch full thread details with rate limiting
  const threadRefs = listResponse.data.threads;

  const threads = await processBatches(
    threadRefs,
    async (threadRef) => {
      return await withRetry(async () => {
        const response = await gmail.users.threads.get({
          userId: 'me',
          id: threadRef.id,
          format: 'full'
        });
        return response.data;
      });
    },
    { batchSize: 10, delayMs: 100 } // 10 threads per batch, 100ms between batches
  );

  return threads.filter(t => t !== null); // Remove failed threads
}

/**
 * Extract INBOUND → OUTBOUND pairs from a thread
 */
async function extractPairsFromThread(thread, businessId, myEmail) {
  const messages = thread.messages || [];
  const pairs = [];

  // Sort messages by internalDate (oldest first)
  messages.sort((a, b) => {
    const dateA = parseInt(a.internalDate || '0');
    const dateB = parseInt(b.internalDate || '0');
    return dateA - dateB;
  });

  // Find OUTBOUND messages (sent by us)
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const headers = msg.payload?.headers || [];
    const from = headers.find(h => h.name === 'From')?.value || '';

    // Check if this is our sent message
    if (!from.toLowerCase().includes(myEmail.toLowerCase())) {
      continue;
    }

    // This is an OUTBOUND message
    // Find the parent INBOUND (previous message in thread from someone else)
    let parentInbound = null;

    for (let j = i - 1; j >= 0; j--) {
      const prevMsg = messages[j];
      const prevHeaders = prevMsg.payload?.headers || [];
      const prevFrom = prevHeaders.find(h => h.name === 'From')?.value || '';

      // Found a message from someone else
      if (!prevFrom.toLowerCase().includes(myEmail.toLowerCase())) {
        parentInbound = prevMsg;
        break;
      }
    }

    // If no parent inbound found, skip (this was an initial outbound)
    if (!parentInbound) {
      continue;
    }

    // Extract pair data
    try {
      const pairData = await buildPairData(parentInbound, msg, thread.id, businessId);
      pairs.push(pairData);
    } catch (error) {
      console.warn(`[PairBuilder] Failed to build pair data:`, error.message);
    }
  }

  return pairs;
}

/**
 * Build pair data from inbound + outbound messages
 */
async function buildPairData(inboundMsg, outboundMsg, threadId, businessId) {
  // Extract headers
  const inboundHeaders = inboundMsg.payload?.headers || [];
  const outboundHeaders = outboundMsg.payload?.headers || [];

  const inboundFrom = inboundHeaders.find(h => h.name === 'From')?.value || '';
  const inboundSubject = inboundHeaders.find(h => h.name === 'Subject')?.value || '';
  const outboundSubject = outboundHeaders.find(h => h.name === 'Subject')?.value || '';

  // Extract body text
  const inboundRaw = extractBodyText(inboundMsg.payload);
  const outboundRaw = extractBodyText(outboundMsg.payload);

  // Clean text
  const inboundCleaned = cleanEmailText(inboundRaw, 'INBOUND');
  const outboundCleaned = cleanEmailText(outboundRaw, 'OUTBOUND');

  // Classify tone (hybrid: rule-based + LLM fallback)
  const inboundToneResult = await classifyTone(inboundCleaned.cleanedText, 'INBOUND');
  const outboundToneResult = await classifyTone(outboundCleaned.cleanedText, 'OUTBOUND');

  // Extract features
  const closingPattern = extractClosingPattern(outboundCleaned.signature);
  const lengthBucket = detectLengthBucket(outboundCleaned.cleanedText);

  // Extract domain
  const fromEmail = inboundFrom.match(/<(.+)>/)?.[1] || inboundFrom;
  const fromDomain = fromEmail.split('@')[1] || '';

  // Classify contact type
  const contactType = classifyContactType(fromEmail);

  // Detect language (simple heuristic)
  const language = detectLanguage(inboundCleaned.cleanedText);

  // Sent timestamp
  const sentAt = outboundMsg.internalDate
    ? new Date(parseInt(outboundMsg.internalDate))
    : new Date();

  return {
    threadId,
    inboundMessageId: inboundMsg.id,
    outboundMessageId: outboundMsg.id,
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
 * Extract body text from Gmail message payload
 */
function extractBodyText(payload) {
  if (!payload) return '';

  // Try body.data first
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }

  // Try parts
  if (payload.parts) {
    // Look for text/plain part
    const textPart = payload.parts.find(p => p.mimeType === 'text/plain' && p.body?.data);
    if (textPart) {
      return Buffer.from(textPart.body.data, 'base64').toString('utf-8');
    }

    // Fallback: text/html
    const htmlPart = payload.parts.find(p => p.mimeType === 'text/html' && p.body?.data);
    if (htmlPart) {
      const html = Buffer.from(htmlPart.body.data, 'base64').toString('utf-8');
      return stripHtml(html);
    }

    // Recursive: check nested parts (multipart/alternative, etc.)
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBodyText(part);
        if (nested) return nested;
      }
    }
  }

  return '';
}

/**
 * Strip HTML tags (simple)
 */
function stripHtml(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect language (simple heuristic)
 */
function detectLanguage(text) {
  if (!text) return 'EN';

  // Turkish special characters
  if (/[ığüşöçİĞÜŞÖÇ]/.test(text)) {
    return 'TR';
  }

  // Turkish words
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

/**
 * Get pair statistics for a business
 */
export async function getPairStatistics(businessId) {
  const total = await prisma.emailPair.count({ where: { businessId } });

  const byTone = await prisma.emailPair.groupBy({
    by: ['inboundTone', 'outboundTone'],
    where: { businessId },
    _count: true
  });

  const byLanguage = await prisma.emailPair.groupBy({
    by: ['language'],
    where: { businessId },
    _count: true
  });

  return {
    total,
    byTone,
    byLanguage
  };
}

export default {
  buildEmailPairs,
  getPairStatistics
};
