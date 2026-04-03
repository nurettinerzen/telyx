/**
 * Recipient Ownership Policy (HARD)
 *
 * CRITICAL SECURITY BOUNDARY:
 * - LLM CANNOT set To/CC/BCC - orchestrator controls this
 * - Reply goes ONLY to original sender (From/Reply-To)
 * - List/no-reply emails are blocked or flagged for manual review
 * - CC/BCC always empty unless explicitly from CRM verified contacts
 *
 * This policy is enforced at multiple layers:
 * 1. Before generation: Validate thread ownership
 * 2. After generation: Strip any recipient mentions from draft
 * 3. At send time: Orchestrator sets recipients, not LLM output
 */

import prisma from '../../../prismaClient.js';

// Patterns that indicate automated/list emails (should not auto-reply)
const NO_REPLY_PATTERNS = [
  /no-?reply@/i,
  /noreply@/i,
  /do-?not-?reply@/i,
  /donotreply@/i,
  /automated@/i,
  /mailer-?daemon@/i,
  /postmaster@/i,
  /bounce[s]?@/i
];

const LIST_HEADER_PATTERNS = [
  'list-unsubscribe',
  'list-id',
  'list-post',
  'list-help',
  'precedence'
];

const BULK_PRECEDENCE_VALUES = ['bulk', 'list', 'junk'];

/**
 * Validate thread ownership and determine allowed recipients
 *
 * @param {Object} params
 * @param {number} params.businessId
 * @param {string} params.threadId
 * @param {string} params.targetEmail - Intended recipient (for validation)
 * @returns {Promise<Object>}
 */
export async function validateRecipientOwnership({ businessId, threadId, targetEmail }) {
  try {
    // 1. Verify thread belongs to business
    const thread = await prisma.emailThread.findFirst({
      where: {
        id: threadId,
        businessId
      },
      select: {
        id: true,
        businessId: true,
        customerEmail: true,
        threadId: true
      }
    });

    if (!thread) {
      console.error(`🚫 [RecipientOwnership] Thread ${threadId} not found for business ${businessId}`);
      return {
        valid: false,
        error: 'THREAD_NOT_FOUND',
        message: 'Thread does not exist or does not belong to this business'
      };
    }

    // 2. Get inbound messages to extract sender info
    const inboundMessages = await prisma.emailMessage.findMany({
      where: {
        threadId: thread.id,
        direction: 'INBOUND'
      },
      select: {
        id: true,
        fromEmail: true,
        toEmail: true,
        messageId: true,
        bodyHtml: true // For header extraction if stored
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 5
    });

    if (inboundMessages.length === 0) {
      return {
        valid: false,
        error: 'NO_INBOUND_MESSAGE',
        message: 'No inbound message found to reply to'
      };
    }

    const latestInbound = inboundMessages[0];
    const senderEmail = latestInbound.fromEmail?.toLowerCase();

    // 3. Check for no-reply/automated sender
    const noReplyCheck = checkNoReplyEmail(senderEmail);
    if (noReplyCheck.isNoReply) {
      console.warn(`⚠️ [RecipientOwnership] No-reply email detected: ${senderEmail}`);
      return {
        valid: false,
        error: 'NO_REPLY_EMAIL',
        message: 'This email is from a no-reply address and cannot be replied to',
        requiresManualReview: true,
        senderEmail
      };
    }

    // 4. Check for list/bulk email (from headers if available)
    // Note: In production, headers should be stored separately
    const listCheck = checkListEmail(latestInbound);
    if (listCheck.isList) {
      console.warn(`⚠️ [RecipientOwnership] List/bulk email detected`);
      return {
        valid: false,
        error: 'LIST_EMAIL',
        message: 'This appears to be a mailing list or bulk email. Manual review required.',
        requiresManualReview: true,
        listType: listCheck.type
      };
    }

    // 5. Build allowed recipients (STRICT)
    const allowedRecipients = {
      to: senderEmail, // ONLY the original sender
      cc: [],          // Empty by default
      bcc: [],         // Empty by default
      replyTo: senderEmail
    };

    // 6. Validate target email matches allowed
    if (targetEmail && targetEmail.toLowerCase() !== senderEmail) {
      console.error(`🚫 [RecipientOwnership] Target email mismatch: ${targetEmail} !== ${senderEmail}`);
      return {
        valid: false,
        error: 'RECIPIENT_MISMATCH',
        message: 'Target email does not match the allowed recipient',
        allowedRecipient: senderEmail,
        attemptedRecipient: targetEmail
      };
    }

    console.log(`✅ [RecipientOwnership] Valid recipient: ${senderEmail}`);

    return {
      valid: true,
      recipients: allowedRecipients,
      originalSender: senderEmail,
      threadOwner: businessId
    };

  } catch (error) {
    console.error('❌ [RecipientOwnership] Validation error:', error);
    return {
      valid: false,
      error: 'VALIDATION_ERROR',
      message: 'Could not validate recipient ownership'
    };
  }
}

/**
 * Check if email is from a no-reply address
 */
function checkNoReplyEmail(email) {
  if (!email) {
    return { isNoReply: false };
  }

  for (const pattern of NO_REPLY_PATTERNS) {
    if (pattern.test(email)) {
      return {
        isNoReply: true,
        pattern: pattern.toString()
      };
    }
  }

  return { isNoReply: false };
}

/**
 * Check if email is from a mailing list
 * Note: Full implementation would check email headers
 */
function checkListEmail(message) {
  // In a full implementation, we would check:
  // - List-Unsubscribe header
  // - List-Id header
  // - Precedence: bulk/list
  // For now, check email patterns

  const email = message.fromEmail?.toLowerCase() || '';

  // Common list email patterns
  if (email.includes('newsletter@') ||
      email.includes('updates@') ||
      email.includes('notifications@') ||
      email.includes('digest@') ||
      email.includes('marketing@')) {
    return {
      isList: true,
      type: 'marketing'
    };
  }

  return { isList: false };
}

/**
 * Strip any recipient-related content from draft
 * LLM should NEVER be able to set recipients through draft content
 *
 * @param {string} draftContent
 * @returns {Object} { content, stripped }
 */
export function stripRecipientMentions(draftContent) {
  if (!draftContent) {
    return { content: draftContent, stripped: [] };
  }

  const stripped = [];
  let cleanContent = draftContent;

  // Pattern 1: Explicit To/CC/BCC headers
  const headerPatterns = [
    /^To:\s*[^\n]+\n?/gim,
    /^CC:\s*[^\n]+\n?/gim,
    /^Cc:\s*[^\n]+\n?/gim,
    /^BCC:\s*[^\n]+\n?/gim,
    /^Bcc:\s*[^\n]+\n?/gim
  ];

  for (const pattern of headerPatterns) {
    const matches = cleanContent.match(pattern);
    if (matches) {
      stripped.push(...matches);
      cleanContent = cleanContent.replace(pattern, '');
    }
  }

  // Pattern 2: "Forward this to..." instructions
  const forwardPatterns = [
    /(?:please\s+)?(?:forward|send|cc|copy)\s+(?:this\s+)?(?:to|email)\s+[^\n.]+[.\n]/gi,
    /(?:lütfen\s+)?(?:ilet|gönder|kopyala)\s+(?:bunu\s+)?(?:şuna|buraya)\s+[^\n.]+[.\n]/gi
  ];

  for (const pattern of forwardPatterns) {
    const matches = cleanContent.match(pattern);
    if (matches) {
      stripped.push(...matches);
      cleanContent = cleanContent.replace(pattern, '');
    }
  }

  // Pattern 3: Inline email addresses with "send to" context
  // Be careful not to strip legitimate email mentions
  const sendToPattern = /(?:send|mail|email|forward|ilet|gönder)\s+(?:to|it\s+to)?\s*:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
  const sendToMatches = cleanContent.match(sendToPattern);
  if (sendToMatches) {
    stripped.push(...sendToMatches);
    cleanContent = cleanContent.replace(sendToPattern, '[removed]');
  }

  return {
    content: cleanContent.trim(),
    stripped,
    wasModified: stripped.length > 0
  };
}

/**
 * Build safe recipients object (orchestrator use only)
 * This is what actually gets used when sending - NOT LLM output
 *
 * @param {Object} thread
 * @param {Object} inboundMessage
 * @returns {Object}
 */
export function buildSafeRecipients(thread, inboundMessage) {
  // Extract Reply-To if present, otherwise use From
  const replyTo = inboundMessage.replyTo || inboundMessage.fromEmail;

  return {
    to: replyTo,
    cc: [], // Always empty - never auto-CC
    bcc: [], // Always empty - never auto-BCC
    from: null, // Set by provider from integration settings
    replyToMessageId: inboundMessage.messageId
  };
}

/**
 * Validate that final draft doesn't contain recipient manipulation
 * Called before persist/send
 */
export function validateDraftContent(draftContent) {
  const stripped = stripRecipientMentions(draftContent);

  if (stripped.wasModified) {
    console.warn(`⚠️ [RecipientOwnership] Draft contained recipient mentions:`, stripped.stripped);
  }

  return {
    valid: true, // We strip, don't block
    content: stripped.content,
    hadRecipientMentions: stripped.wasModified,
    strippedContent: stripped.stripped
  };
}

export default {
  validateRecipientOwnership,
  stripRecipientMentions,
  buildSafeRecipients,
  validateDraftContent,
  checkNoReplyEmail,
  checkListEmail
};
