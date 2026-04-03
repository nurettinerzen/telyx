/**
 * Email Indexing Hooks
 *
 * Triggers embedding generation at the right time:
 * 1. After email is SENT (not drafted)
 * 2. Via cron for backfill
 *
 * NEVER index:
 * - Drafts (not sent)
 * - Failed sends
 * - Inbound emails (customer data)
 * - Bounce/auto-reply/no-reply/newsletter emails
 */

import prisma from '../../../prismaClient.js';
import { indexEmailMessage, shouldIndexEmail } from './embeddingService.js';

// Email quality filter patterns
const QUALITY_FILTERS = {
  // No-reply sender patterns (don't index replies to these)
  noReplyPatterns: [
    /^no[-_]?reply@/i,
    /^noreply@/i,
    /^do[-_]?not[-_]?reply@/i,
    /^mailer[-_]?daemon@/i,
    /^postmaster@/i,
    /^bounce[s]?@/i,
    /^notification[s]?@/i,
    /^alert[s]?@/i,
    /^system@/i,
    /^auto[-_]?notify@/i
  ],

  // Bounce/auto-reply subject patterns
  bounceSubjectPatterns: [
    /^(re:\s*)?(mail delivery|delivery status|undeliverable|returned mail)/i,
    /^(re:\s*)?(failure notice|delivery failure|mail failure)/i,
    /^(re:\s*)?auto[-_]?(reply|response|matic)/i,
    /^(re:\s*)?(out of office|ooo|away from office)/i,
    /^(re:\s*)?(automatic reply|automated response)/i,
    /^(re:\s*)?vacation (reply|response|notice)/i,
    /\[auto[-_]?reply\]/i,
    /\[automated\]/i
  ],

  // Newsletter/marketing patterns in headers or content
  newsletterPatterns: [
    /list[-_]?unsubscribe/i,
    /unsubscribe from this list/i,
    /manage your subscription/i,
    /email preferences/i,
    /you('re| are) receiving this (email|message|newsletter)/i,
    /this is an automated (marketing|promotional) message/i,
    /bulk[-_]?mail/i,
    /precedence:\s*(bulk|list|junk)/i
  ],

  // Minimum content length for quality reply
  minContentLength: 50,

  // Maximum auto-reply indicators in body
  autoReplyBodyPatterns: [
    /this is an automated (response|reply|message)/i,
    /i('m| am) (currently )?(out of (the )?office|on vacation|away)/i,
    /will (respond|reply|get back to you) (when i return|upon my return)/i,
    /thank you for (your email|contacting|reaching out).*will (respond|reply)/i,
    /auto[-_]?generated message/i
  ]
};

/**
 * Check if email is a quality reply worth indexing
 * Returns { isQuality: boolean, reason?: string }
 */
function checkEmailQuality(message, thread, draft) {
  const recipientEmail = thread?.customerEmail || '';
  const subject = message.subject || thread?.subject || '';
  const bodyText = message.bodyText || message.bodyHtml || '';
  const headers = message.headers || {};

  // 1. Check if replying to no-reply address
  for (const pattern of QUALITY_FILTERS.noReplyPatterns) {
    if (pattern.test(recipientEmail)) {
      return { isQuality: false, reason: 'NO_REPLY_RECIPIENT' };
    }
  }

  // 2. Check for bounce/auto-reply subject
  for (const pattern of QUALITY_FILTERS.bounceSubjectPatterns) {
    if (pattern.test(subject)) {
      return { isQuality: false, reason: 'BOUNCE_OR_AUTOREPLY_SUBJECT' };
    }
  }

  // 3. Check for newsletter indicators in headers
  const headerString = JSON.stringify(headers).toLowerCase();
  for (const pattern of QUALITY_FILTERS.newsletterPatterns) {
    if (pattern.test(headerString)) {
      return { isQuality: false, reason: 'NEWSLETTER_HEADERS' };
    }
  }

  // 4. Check body for auto-reply patterns
  let autoReplyScore = 0;
  for (const pattern of QUALITY_FILTERS.autoReplyBodyPatterns) {
    if (pattern.test(bodyText)) {
      autoReplyScore++;
    }
  }
  if (autoReplyScore >= 2) {
    return { isQuality: false, reason: 'AUTOREPLY_BODY_CONTENT' };
  }

  // 5. Check minimum content length
  const cleanBody = bodyText
    .replace(/<[^>]*>/g, '') // Strip HTML
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim();

  if (cleanBody.length < QUALITY_FILTERS.minContentLength) {
    return { isQuality: false, reason: 'CONTENT_TOO_SHORT' };
  }

  // 6. Check if draft was auto-generated vs human-approved
  if (draft && draft.status !== 'APPROVED' && draft.status !== 'SENT') {
    return { isQuality: false, reason: 'DRAFT_NOT_APPROVED' };
  }

  return { isQuality: true };
}

/**
 * Check if thread is a newsletter/bulk email thread
 */
function isNewsletterThread(thread) {
  if (!thread) return false;

  // Check thread metadata
  if (thread.metadata) {
    const meta = typeof thread.metadata === 'string'
      ? JSON.parse(thread.metadata)
      : thread.metadata;

    if (meta.isNewsletter || meta.isBulk || meta.isMarketing) {
      return true;
    }
  }

  // Check customer email for common newsletter domains
  const newsletterDomains = [
    'mailchimp.com', 'sendgrid.net', 'constantcontact.com',
    'campaign-archive.com', 'list-manage.com', 'email.mg.',
    'mailer.', 'news.', 'newsletter.', 'promo.', 'marketing.'
  ];

  const customerEmail = thread.customerEmail || '';
  const emailDomain = customerEmail.split('@')[1] || '';

  for (const domain of newsletterDomains) {
    if (emailDomain.includes(domain)) {
      return true;
    }
  }

  return false;
}

/**
 * Hook: Call after email is successfully sent
 * This is the PRIMARY indexing trigger
 *
 * @param {Object} params
 * @param {string} params.messageId - The sent message ID
 * @param {string} params.threadId - Thread ID
 * @param {number} params.businessId - Business ID
 * @param {Object} params.classification - Email classification (optional)
 */
export async function onEmailSent({ messageId, threadId, businessId, classification }) {
  console.log(`📬 [IndexHook] Email sent: ${messageId}`);

  try {
    // Fetch the message
    const message = await prisma.emailMessage.findUnique({
      where: { id: messageId },
      include: {
        thread: true,
        drafts: {
          where: { status: { in: ['SENT', 'APPROVED'] } },
          take: 1
        }
      }
    });

    if (!message) {
      console.warn(`⚠️ [IndexHook] Message not found: ${messageId}`);
      return { indexed: false, reason: 'MESSAGE_NOT_FOUND' };
    }

    // Check basic eligibility (SENT, OUTBOUND, etc.)
    if (!shouldIndexEmail(message, message.drafts?.[0])) {
      console.log(`⏭️ [IndexHook] Skipping index (not eligible): ${messageId}`);
      return { indexed: false, reason: 'NOT_ELIGIBLE' };
    }

    // Check if thread is newsletter/bulk
    if (isNewsletterThread(message.thread)) {
      console.log(`⏭️ [IndexHook] Skipping index (newsletter thread): ${messageId}`);
      return { indexed: false, reason: 'NEWSLETTER_THREAD' };
    }

    // Check email quality (bounce, auto-reply, no-reply, content quality)
    const qualityCheck = checkEmailQuality(message, message.thread, message.drafts?.[0]);
    if (!qualityCheck.isQuality) {
      console.log(`⏭️ [IndexHook] Skipping index (quality filter: ${qualityCheck.reason}): ${messageId}`);
      return { indexed: false, reason: qualityCheck.reason };
    }

    // Extract recipient domain
    const recipientDomain = message.thread?.customerEmail?.split('@')[1];

    // Index the message
    const result = await indexEmailMessage({
      businessId,
      threadId,
      messageId,
      message: {
        ...message,
        bodyText: message.bodyText || message.bodyHtml,
        direction: message.direction,
        sentAt: message.sentAt
      },
      metadata: {
        intent: classification?.intent,
        language: classification?.language || 'TR',
        recipientDomain,
        tags: classification?.tags || [],
        qualityChecked: true
      }
    });

    console.log(`✅ [IndexHook] Indexed: ${messageId}, chunks: ${result.chunksStored}`);
    return { indexed: true, ...result };

  } catch (error) {
    console.error(`❌ [IndexHook] Failed to index ${messageId}:`, error);
    return { indexed: false, error: error.message };
  }
}

/**
 * Backfill: Index historical emails
 * Run via cron or manually
 *
 * @param {Object} params
 * @param {number} params.businessId - Business ID (required)
 * @param {number} params.daysBack - How many days to look back (default 90)
 * @param {number} params.batchSize - Messages per batch (default 50)
 */
export async function backfillEmailEmbeddings({
  businessId,
  daysBack = 90,
  batchSize = 50
}) {
  if (!businessId) {
    throw new Error('businessId is required for backfill');
  }

  console.log(`🔄 [Backfill] Starting for business ${businessId}, last ${daysBack} days`);

  const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  try {
    // Find sent messages not yet indexed
    const messages = await prisma.emailMessage.findMany({
      where: {
        thread: {
          businessId
        },
        direction: 'OUTBOUND',
        sentAt: {
          gte: cutoffDate
        },
        // Not already indexed
        NOT: {
          id: {
            in: await prisma.emailEmbedding.findMany({
              where: { businessId },
              select: { messageId: true }
            }).then(embeddings =>
              embeddings.map(e => e.messageId).filter(Boolean)
            )
          }
        }
      },
      include: {
        thread: true,
        drafts: {
          where: { status: { in: ['SENT', 'APPROVED'] } },
          take: 1
        }
      },
      take: batchSize,
      orderBy: { sentAt: 'desc' }
    });

    console.log(`📊 [Backfill] Found ${messages.length} messages to index`);

    const results = {
      total: messages.length,
      indexed: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };

    for (const message of messages) {
      // Check eligibility
      if (!shouldIndexEmail(message, message.drafts?.[0])) {
        results.skipped++;
        continue;
      }

      // Check if newsletter thread
      if (isNewsletterThread(message.thread)) {
        results.skipped++;
        continue;
      }

      // Check email quality
      const qualityCheck = checkEmailQuality(message, message.thread, message.drafts?.[0]);
      if (!qualityCheck.isQuality) {
        results.skipped++;
        continue;
      }

      try {
        const recipientDomain = message.thread?.customerEmail?.split('@')[1];

        await indexEmailMessage({
          businessId,
          threadId: message.threadId,
          messageId: message.id,
          message: {
            ...message,
            bodyText: message.bodyText || message.bodyHtml,
            direction: message.direction,
            sentAt: message.sentAt
          },
          metadata: {
            recipientDomain,
            language: 'TR', // Default, could be detected
            qualityChecked: true
          }
        });

        results.indexed++;
      } catch (error) {
        results.failed++;
        results.errors.push({ messageId: message.id, error: error.message });
      }
    }

    console.log(`✅ [Backfill] Complete: ${results.indexed} indexed, ${results.skipped} skipped, ${results.failed} failed`);
    return results;

  } catch (error) {
    console.error('❌ [Backfill] Failed:', error);
    throw error;
  }
}

/**
 * Backfill all businesses (admin/cron use)
 */
export async function backfillAllBusinesses({ daysBack = 90, batchSize = 50 }) {
  const businesses = await prisma.business.findMany({
    where: {
      emailIntegration: {
        isNot: null
      }
    },
    select: { id: true, name: true }
  });

  console.log(`🔄 [Backfill] Processing ${businesses.length} businesses`);

  const allResults = [];

  for (const business of businesses) {
    console.log(`\n📧 [Backfill] Business: ${business.name} (${business.id})`);

    const result = await backfillEmailEmbeddings({
      businessId: business.id,
      daysBack,
      batchSize
    });

    allResults.push({
      businessId: business.id,
      businessName: business.name,
      ...result
    });
  }

  return allResults;
}

export default {
  onEmailSent,
  backfillEmailEmbeddings,
  backfillAllBusinesses
};
