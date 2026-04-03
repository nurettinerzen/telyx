/**
 * Step 2: Fetch Thread Messages
 *
 * Retrieves email thread history for context.
 * Uses database records (already synced from provider).
 */

import prisma from '../../../prismaClient.js';

// How many messages to include for context
const MAX_THREAD_MESSAGES = 20;

/**
 * Fetch thread messages for context
 *
 * @param {Object} ctx - Pipeline context
 * @returns {Promise<Object>} { success, error? }
 */
export async function fetchThreadMessages(ctx) {
  const { thread } = ctx;

  try {
    // Get latest messages from database (already synced)
    const messages = await prisma.emailMessage.findMany({
      where: {
        threadId: thread.id
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: MAX_THREAD_MESSAGES,
      select: {
        id: true,
        messageId: true,
        direction: true,
        fromEmail: true,
        fromName: true,
        toEmail: true,
        subject: true,
        bodyText: true,
        bodyHtml: true,
        status: true,
        createdAt: true,
        sentAt: true,
        receivedAt: true
      }
    });

    if (messages.length === 0) {
      return { success: false, error: 'No messages found in thread' };
    }

    // Re-sort ascending so LLM sees chronological conversation flow.
    const chronologicalMessages = [...messages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Format messages for LLM context
    ctx.threadMessages = chronologicalMessages.map(msg => ({
      id: msg.id,
      messageId: msg.messageId,
      direction: msg.direction,
      from: {
        email: msg.fromEmail,
        name: msg.fromName
      },
      to: msg.toEmail,
      subject: msg.subject,
      body: msg.bodyText || '',
      timestamp: msg.direction === 'INBOUND'
        ? msg.receivedAt || msg.createdAt
        : msg.sentAt || msg.createdAt
    }));

    // Build conversation history for LLM
    ctx.conversationHistory = buildConversationHistory(ctx.threadMessages, ctx.connectedEmail);

    console.log(`📧 [FetchThread] Found ${messages.length} messages in thread`);
    console.log(`📧 [FetchThread] Inbound: ${chronologicalMessages.filter(m => m.direction === 'INBOUND').length}, Outbound: ${chronologicalMessages.filter(m => m.direction === 'OUTBOUND').length}`);

    return { success: true };

  } catch (error) {
    console.error('❌ [FetchThread] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Build conversation history for LLM
 * Converts email messages to a format suitable for LLM context
 *
 * @param {Array} messages - Thread messages
 * @param {string} connectedEmail - The business's connected email
 * @returns {Array} Conversation history
 */
function buildConversationHistory(messages, connectedEmail) {
  const history = [];

  for (const msg of messages) {
    const isFromBusiness = msg.from.email.toLowerCase() === connectedEmail.toLowerCase();

    if (isFromBusiness) {
      // Message from business = assistant response
      history.push({
        role: 'assistant',
        content: msg.body
      });
    } else {
      // Message from customer = user message
      history.push({
        role: 'user',
        content: msg.body
      });
    }
  }

  return history;
}

export default { fetchThreadMessages };
