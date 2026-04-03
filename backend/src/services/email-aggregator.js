/**
 * Email Aggregator Service
 * Provides a unified interface for Gmail and Outlook
 */

import prisma from '../prismaClient.js';
import gmailService from './gmail.js';
import outlookService from './outlook.js';

class EmailAggregatorService {
  /**
   * Get the connected email provider for a business
   */
  async getProvider(businessId) {
    const integration = await prisma.emailIntegration.findUnique({
      where: { businessId }
    });

    if (!integration || !integration.connected) {
      return null;
    }

    return integration.provider; // 'GMAIL' or 'OUTLOOK'
  }

  /**
   * Get the email integration details
   */
  async getIntegration(businessId) {
    return await prisma.emailIntegration.findUnique({
      where: { businessId }
    });
  }

  /**
   * Get the appropriate service based on provider
   */
  getService(provider) {
    if (provider === 'GMAIL') {
      return gmailService;
    } else if (provider === 'OUTLOOK') {
      return outlookService;
    }
    throw new Error(`Unknown email provider: ${provider}`);
  }

  /**
   * Get auth URL for a provider
   */
  getAuthUrl(provider, businessId) {
    const service = this.getService(provider);
    return service.getAuthUrl(businessId);
  }

  /**
   * Handle OAuth callback
   */
  async handleCallback(provider, code, businessId) {
    const service = this.getService(provider);
    return await service.handleCallback(code, businessId);
  }

  /**
   * Get messages from connected provider
   */
  async getMessages(businessId, options = {}) {
    const provider = await this.getProvider(businessId);
    if (!provider) {
      throw new Error('No email provider connected');
    }

    const service = this.getService(provider);
    return await service.getMessages(businessId, options);
  }

  /**
   * Get single message
   */
  async getMessage(businessId, messageId) {
    const provider = await this.getProvider(businessId);
    if (!provider) {
      throw new Error('No email provider connected');
    }

    const service = this.getService(provider);
    return await service.getMessage(businessId, messageId);
  }

  /**
   * Get thread (conversation)
   */
  async getThread(businessId, threadId) {
    const provider = await this.getProvider(businessId);
    if (!provider) {
      throw new Error('No email provider connected');
    }

    const service = this.getService(provider);
    return await service.getThread(businessId, threadId);
  }

  /**
   * Send message
   */
  async sendMessage(businessId, to, subject, body, options = {}) {
    const provider = await this.getProvider(businessId);
    if (!provider) {
      throw new Error('No email provider connected');
    }

    const service = this.getService(provider);
    return await service.sendMessage(businessId, to, subject, body, options);
  }

  /**
   * Mark message as read
   */
  async markAsRead(businessId, messageId) {
    const provider = await this.getProvider(businessId);
    if (!provider) {
      throw new Error('No email provider connected');
    }

    const service = this.getService(provider);
    return await service.markAsRead(businessId, messageId);
  }

  /**
   * Sync new messages
   */
  async syncNewMessages(businessId) {
    const provider = await this.getProvider(businessId);
    if (!provider) {
      throw new Error('No email provider connected');
    }

    const service = this.getService(provider);
    return await service.syncNewMessages(businessId);
  }

/**
 * Disconnect email
 */
async disconnect(businessId) {
  const provider = await this.getProvider(businessId);
  if (!provider) {
    throw new Error('No email provider connected');
  }

  const service = this.getService(provider);

  // Eski thread ve mesajları sil
  await prisma.emailMessage.deleteMany({
    where: {
      thread: {
        businessId: businessId
      }
    }
  });

  await prisma.emailDraft.deleteMany({
    where: {
      businessId: businessId
    }
  });

  await prisma.emailThread.deleteMany({
    where: {
      businessId: businessId
    }
  });

  if (typeof service.disconnect === 'function') {
    await service.disconnect(businessId);
  } else {
    await prisma.emailIntegration.update({
      where: { businessId },
      data: {
        connected: false,
        lastSyncedAt: null
      }
    });
  }

  return { success: true };
}

  /**
   * Check if any email provider is connected
   */
  async isConnected(businessId) {
    const provider = await this.getProvider(businessId);
    return provider !== null;
  }

  /**
   * Get connection status
   */
  async getStatus(businessId) {
    const integration = await this.getIntegration(businessId);

    if (!integration) {
      return {
        connected: false,
        provider: null,
        email: null
      };
    }

    return {
      connected: integration.connected,
      provider: integration.provider,
      email: integration.email,
      lastSyncedAt: integration.lastSyncedAt
    };
  }

  /**
   * Save message to database
   */
  async saveMessageToDb(businessId, message, direction = 'INBOUND') {
    const integration = await this.getIntegration(businessId);
    const connectedEmail = integration?.email;

    // Determine customer email
    const customerEmail = direction === 'INBOUND'
      ? message.from.email
      : message.to.split(',')[0].trim();

    // Find or create thread
    let thread = await prisma.emailThread.findFirst({
      where: {
        businessId,
        threadId: message.threadId
      }
    });

    if (!thread) {
      // New thread - start with NEW status (no tag shown in UI)
      // User will manually tag as needed (generate draft, mark no reply, etc.)
      thread = await prisma.emailThread.create({
        data: {
          businessId,
          threadId: message.threadId,
          subject: message.subject,
          customerEmail,
          customerName: direction === 'INBOUND' ? message.from.name : null,
          status: 'NEW',
          lastMessageAt: new Date(message.date)
        }
      });
    } else {
      // Update thread - don't change status for existing threads
      // Status is managed manually by user actions
      await prisma.emailThread.update({
        where: { id: thread.id },
        data: {
          lastMessageAt: new Date(message.date)
        }
      });
    }

    // Check if message already exists
    const existingMessage = await prisma.emailMessage.findFirst({
      where: {
        threadId: thread.id,
        messageId: message.messageId
      }
    });

    if (existingMessage) {
      return { thread, message: existingMessage, isNew: false };
    }

    // Create message — set createdAt to actual mail date for correct chronological ordering
    const mailDate = new Date(message.date);
    const savedMessage = await prisma.emailMessage.create({
      data: {
        threadId: thread.id,
        messageId: message.messageId,
        direction,
        fromEmail: message.from.email,
        fromName: message.from.name,
        toEmail: message.to,
        subject: message.subject,
        bodyText: message.bodyText,
        bodyHtml: message.bodyHtml,
        attachments: message.attachments,
        status: direction === 'INBOUND' ? 'RECEIVED' : 'SENT',
        receivedAt: direction === 'INBOUND' ? mailDate : null,
        sentAt: direction === 'OUTBOUND' ? mailDate : null,
        createdAt: mailDate  // Override default now() — ensures orderBy createdAt = chronological mail order
      }
    });

    return { thread, message: savedMessage, isNew: true };
  }

  /**
   * Get threads from database
   */
  async getThreadsFromDb(businessId, options = {}) {
    const { status, limit = 20, offset = 0, search } = options;

    const where = { businessId };
    if (status) {
      where.status = status;
    }
    if (search && search.trim()) {
      where.OR = [
        { subject: { contains: search.trim(), mode: 'insensitive' } },
        { customerEmail: { contains: search.trim(), mode: 'insensitive' } },
        { customerName: { contains: search.trim(), mode: 'insensitive' } }
      ];
    }

    const threads = await prisma.emailThread.findMany({
      where,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        drafts: {
          where: { status: 'PENDING_REVIEW' },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { lastMessageAt: 'desc' },
      take: limit,
      skip: offset
    });

    const total = await prisma.emailThread.count({ where });

    return { threads, total };
  }

  /**
   * Get thread from database with all messages
   */
  async getThreadFromDb(businessId, threadId) {
    const thread = await prisma.emailThread.findFirst({
      where: {
        businessId,
        id: threadId
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        },
        drafts: {
          where: { status: 'PENDING_REVIEW' },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    // Post-query sort: use actual mail date (receivedAt/sentAt) for correct chronological order
    // Handles legacy records where createdAt was set to DB insert time, not mail date
    if (thread?.messages) {
      thread.messages.sort((a, b) => {
        const dateA = new Date(a.receivedAt || a.sentAt || a.createdAt);
        const dateB = new Date(b.receivedAt || b.sentAt || b.createdAt);
        return dateA - dateB;
      });
    }

    return thread;
  }

  /**
   * Update thread status
   */
  async updateThreadStatus(threadId, status) {
    return await prisma.emailThread.update({
      where: { id: threadId },
      data: { status }
    });
  }
}

export default new EmailAggregatorService();
