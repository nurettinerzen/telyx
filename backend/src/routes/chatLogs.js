/**
 * Chat Logs API
 * Manages chat conversation logs for analytics
 */

import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';
import { sendWhatsAppMessage } from '../services/whatsapp-sender.js';
import {
  appendChatLogMessages,
  buildHandoffView,
  buildSystemEventMessage,
  claimHumanHandoff,
  noteHumanReply,
  requestHumanHandoff,
  returnConversationToAi,
} from '../services/liveHandoff.js';

const router = express.Router();
const ACTIVE_CHAT_WINDOW_MS = 30 * 60 * 1000;

function getActorName(user = {}) {
  return user?.name || user?.email || 'Team member';
}

function getReplyText(req) {
  return String(req.body?.message || req.body?.text || '').trim();
}

function normalizeChatLogStatus(chatLog) {
  if (!chatLog) return chatLog;

  const lastActivity = new Date(chatLog.updatedAt || chatLog.createdAt || 0).getTime();
  const staleThreshold = Date.now() - ACTIVE_CHAT_WINDOW_MS;

  if (chatLog.status === 'active' && Number.isFinite(lastActivity) && lastActivity < staleThreshold) {
    return {
      ...chatLog,
      status: 'ended',
    };
  }

  return chatLog;
}

function buildChatLogHandoffView(chatLog, state, viewerUserId) {
  const normalizedChatLog = normalizeChatLogStatus(chatLog);

  if (!normalizedChatLog || normalizedChatLog.status !== 'active') {
    return buildHandoffView(undefined, viewerUserId);
  }

  return buildHandoffView(state, viewerUserId);
}

async function enrichChatLogsWithHandoff(chatLogs, businessId, viewerUserId) {
  if (!Array.isArray(chatLogs) || chatLogs.length === 0) {
    return [];
  }

  const sessionIds = chatLogs.map((log) => log.sessionId).filter(Boolean);
  const states = await prisma.conversationState.findMany({
    where: {
      businessId,
      sessionId: { in: sessionIds },
    },
    select: {
      sessionId: true,
      state: true,
    }
  });

  const stateMap = new Map(states.map((entry) => [entry.sessionId, entry.state]));

  return chatLogs.map((log) => ({
    ...log,
    handoff: buildChatLogHandoffView(log, stateMap.get(log.sessionId), viewerUserId),
  }));
}

async function hydrateWhatsAppPhonesForChatLogs(chatLogs, businessId) {
  if (!Array.isArray(chatLogs) || chatLogs.length === 0) {
    return chatLogs;
  }

  const missingPhoneLogs = chatLogs.filter((log) => (
    log?.channel === 'WHATSAPP' &&
    !log?.customerPhone &&
    log?.sessionId
  ));

  if (missingPhoneLogs.length === 0) {
    return chatLogs;
  }

  const mappings = await prisma.sessionMapping.findMany({
    where: {
      businessId,
      channel: 'WHATSAPP',
      sessionId: { in: missingPhoneLogs.map((log) => log.sessionId) },
    },
    select: {
      sessionId: true,
      channelUserId: true,
    }
  });

  const phoneBySessionId = new Map(
    mappings
      .filter((entry) => entry?.sessionId && entry?.channelUserId)
      .map((entry) => [entry.sessionId, entry.channelUserId])
  );

  await Promise.all(
    missingPhoneLogs.map((log) => {
      const customerPhone = phoneBySessionId.get(log.sessionId);
      if (!customerPhone) return Promise.resolve();
      return prisma.chatLog.update({
        where: { id: log.id },
        data: { customerPhone },
      }).catch(() => null);
    })
  );

  return chatLogs.map((log) => ({
    ...log,
    customerPhone: log.customerPhone || phoneBySessionId.get(log.sessionId) || null,
  }));
}

async function getOwnedChatLog(id, businessId) {
  return prisma.chatLog.findFirst({
    where: {
      id,
      businessId,
    },
    include: {
      assistant: {
        select: { name: true }
      }
    }
  });
}

async function hydrateWhatsAppCustomerPhone(chatLog, businessId) {
  if (!chatLog || chatLog.channel !== 'WHATSAPP' || chatLog.customerPhone || !chatLog.sessionId) {
    return chatLog;
  }

  const mapping = await prisma.sessionMapping.findUnique({
    where: { sessionId: chatLog.sessionId },
    select: {
      businessId: true,
      channel: true,
      channelUserId: true,
    }
  });

  if (!mapping || mapping.businessId !== businessId || mapping.channel !== 'WHATSAPP' || !mapping.channelUserId) {
    return chatLog;
  }

  const updated = await prisma.chatLog.update({
    where: { id: chatLog.id },
    data: { customerPhone: mapping.channelUserId },
    include: {
      assistant: {
        select: { name: true }
      }
    }
  });

  return updated;
}

async function getBusinessForWhatsAppReply(businessId) {
  return prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      whatsappPhoneNumberId: true,
      whatsappAccessToken: true,
    }
  });
}

// GET /api/chat-logs - Get all chat logs for business
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, channel, search, startDate, endDate } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      businessId: req.businessId
    };

    // Status filter (server-side)
    // Most chats in DB have status='active' but are actually stale (idle >30min).
    // We use updatedAt to distinguish truly active vs stale-active (=ended).
    const thirtyMinutesAgo = new Date(Date.now() - ACTIVE_CHAT_WINDOW_MS);
    // Use AND array to safely combine multiple OR conditions (status + search)
    const andConditions = [];

    if (status && status !== 'all') {
      if (status === 'completed') {
        // "Tamamlandı" = DB completed/ended + stale active (updatedAt < 30min ago)
        andConditions.push({
          OR: [
            { status: { in: ['completed', 'ended'] } },
            { status: 'active', updatedAt: { lt: thirtyMinutesAgo } }
          ]
        });
      } else if (status === 'active') {
        // "Aktif" = only truly active chats (updated within last 30 min)
        where.status = 'active';
        where.updatedAt = { gte: thirtyMinutesAgo };
      } else {
        where.status = status;
      }
    }

    // Channel filter (server-side)
    if (channel && channel !== 'all') {
      where.channel = channel;
    }

    // Search filter (server-side)
    if (search) {
      andConditions.push({
        OR: [
          { sessionId: { contains: search, mode: 'insensitive' } },
          { customerPhone: { contains: search, mode: 'insensitive' } },
          { customerIp: { contains: search, mode: 'insensitive' } }
        ]
      });
    }

    // Combine AND conditions if any exist
    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    // Date range filter (server-side)
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const [chatLogs, total] = await Promise.all([
      prisma.chatLog.findMany({
        where,
        include: {
          assistant: {
            select: { name: true }
          }
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.chatLog.count({ where })
    ]);

    // Auto-mark old "active" chats as "ended" for display
    // Also compute messageCount from messages array if it's 0
    const processedLogs = chatLogs.map(log => {
      const processed = normalizeChatLogStatus({ ...log });

      // Fix messageCount: derive from messages array if stored count is 0
      if ((!processed.messageCount || processed.messageCount === 0) && Array.isArray(processed.messages)) {
        processed.messageCount = processed.messages.length;
      }

      return processed;
    });

    const hydratedLogs = await hydrateWhatsAppPhonesForChatLogs(processedLogs, req.businessId);
    const enrichedLogs = await enrichChatLogsWithHandoff(hydratedLogs, req.businessId, req.userId);

    res.json({
      chatLogs: enrichedLogs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get chat logs error:', error);
    res.status(500).json({ error: 'Failed to fetch chat logs' });
  }
});

// GET /api/chat-logs/stats - Get chat statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const where = {
      businessId: req.businessId
    };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Business timezone'una göre bugünün başlangıcını hesapla
    const business = await prisma.business.findUnique({
      where: { id: req.businessId },
      select: { timezone: true }
    });
    const tz = business?.timezone || 'Europe/Istanbul';
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-CA', { timeZone: tz }); // "2026-02-11"
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const offsetMs = tzDate - utcDate;
    const todayStart = new Date(new Date(dateStr + 'T00:00:00.000Z').getTime() - offsetMs);

    const [totalChats, totalMessages, todayChats] = await Promise.all([
      prisma.chatLog.count({ where }),
      prisma.chatLog.aggregate({
        where,
        _sum: { messageCount: true }
      }),
      prisma.chatLog.count({
        where: {
          businessId: req.businessId,
          createdAt: { gte: todayStart }
        }
      })
    ]);

    // Get daily chat counts for chart
    const dailyChats = await prisma.chatLog.groupBy({
      by: ['createdAt'],
      where,
      _count: true,
      orderBy: { createdAt: 'asc' }
    });

    res.json({
      totalChats,
      totalMessages: totalMessages._sum.messageCount || 0,
      todayChats,
      avgMessagesPerChat: totalChats > 0
        ? Math.round((totalMessages._sum.messageCount || 0) / totalChats * 10) / 10
        : 0
    });
  } catch (error) {
    console.error('Get chat stats error:', error);
    res.status(500).json({ error: 'Failed to fetch chat statistics' });
  }
});

// GET /api/chat-logs/:id - Get single chat log with full messages
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const chatLog = await hydrateWhatsAppCustomerPhone(
      await getOwnedChatLog(id, req.businessId),
      req.businessId
    );

    if (!chatLog) {
      return res.status(404).json({ error: 'Chat log not found' });
    }

    // If no assistant attached, get business's first assistant
    if (!chatLog.assistant) {
      const business = await prisma.business.findUnique({
        where: { id: req.businessId },
        include: {
          assistants: {
            select: { name: true },
            take: 1
          }
        }
      });

      if (business?.assistants && business.assistants.length > 0) {
        chatLog.assistant = business.assistants[0];
      }
    }

    const normalizedChatLog = normalizeChatLogStatus(chatLog);
    const conversationState = await prisma.conversationState.findUnique({
      where: { sessionId: normalizedChatLog.sessionId },
      select: { state: true }
    });

    res.json({
      ...normalizedChatLog,
      handoff: buildChatLogHandoffView(normalizedChatLog, conversationState?.state, req.userId)
    });
  } catch (error) {
    console.error('Get chat log error:', error);
    res.status(500).json({ error: 'Failed to fetch chat log' });
  }
});

router.post('/:id/handoff/request', authenticateToken, async (req, res) => {
  try {
    const chatLog = await hydrateWhatsAppCustomerPhone(
      await getOwnedChatLog(req.params.id, req.businessId),
      req.businessId
    );

    if (!chatLog) {
      return res.status(404).json({ error: 'Chat log not found' });
    }

    if (chatLog.channel !== 'WHATSAPP') {
      return res.status(400).json({ error: 'Live handoff is currently available only for WhatsApp conversations' });
    }

    const state = await requestHumanHandoff({
      sessionId: chatLog.sessionId,
      businessId: req.businessId,
      requestedBy: 'operator',
      requestedReason: req.body?.reason || 'operator_requested_live_handoff',
    });

    await appendChatLogMessages({
      sessionId: chatLog.sessionId,
      businessId: req.businessId,
      channel: chatLog.channel,
      assistantId: chatLog.assistantId || null,
      customerPhone: chatLog.customerPhone || null,
      messages: [
        buildSystemEventMessage(
          `${getActorName(req.user)} requested live takeover.`,
          {
            type: 'handoff_requested',
            actorUserId: req.userId,
            actorName: getActorName(req.user),
            requestedBy: 'operator',
          }
        )
      ]
    });

    res.json({
      success: true,
      handoff: buildHandoffView({ humanHandoff: state }, req.userId),
    });
  } catch (error) {
    console.error('Request handoff error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to request live handoff' });
  }
});

router.post('/:id/handoff/claim', authenticateToken, async (req, res) => {
  try {
    const chatLog = await hydrateWhatsAppCustomerPhone(
      await getOwnedChatLog(req.params.id, req.businessId),
      req.businessId
    );

    if (!chatLog) {
      return res.status(404).json({ error: 'Chat log not found' });
    }

    if (chatLog.channel !== 'WHATSAPP') {
      return res.status(400).json({ error: 'Live handoff is currently available only for WhatsApp conversations' });
    }

    const state = await claimHumanHandoff({
      sessionId: chatLog.sessionId,
      businessId: req.businessId,
      userId: req.userId,
      userName: getActorName(req.user),
    });

    await appendChatLogMessages({
      sessionId: chatLog.sessionId,
      businessId: req.businessId,
      channel: chatLog.channel,
      assistantId: chatLog.assistantId || null,
      customerPhone: chatLog.customerPhone || null,
      messages: [
        buildSystemEventMessage(
          `${getActorName(req.user)} claimed this conversation.`,
          {
            type: 'handoff_claimed',
            actorUserId: req.userId,
            actorName: getActorName(req.user),
          }
        )
      ]
    });

    res.json({
      success: true,
      handoff: buildHandoffView({ humanHandoff: state }, req.userId),
    });
  } catch (error) {
    console.error('Claim handoff error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to claim conversation' });
  }
});

router.post('/:id/handoff/release', authenticateToken, async (req, res) => {
  try {
    const chatLog = await hydrateWhatsAppCustomerPhone(
      await getOwnedChatLog(req.params.id, req.businessId),
      req.businessId
    );

    if (!chatLog) {
      return res.status(404).json({ error: 'Chat log not found' });
    }

    if (chatLog.channel !== 'WHATSAPP') {
      return res.status(400).json({ error: 'Live handoff is currently available only for WhatsApp conversations' });
    }

    const state = await returnConversationToAi({
      sessionId: chatLog.sessionId,
      businessId: req.businessId,
      userId: req.userId,
    });

    await appendChatLogMessages({
      sessionId: chatLog.sessionId,
      businessId: req.businessId,
      channel: chatLog.channel,
      assistantId: chatLog.assistantId || null,
      customerPhone: chatLog.customerPhone || null,
      messages: [
        buildSystemEventMessage(
          `${getActorName(req.user)} returned this conversation to AI.`,
          {
            type: 'handoff_released',
            actorUserId: req.userId,
            actorName: getActorName(req.user),
          }
        )
      ]
    });

    res.json({
      success: true,
      handoff: buildHandoffView({ humanHandoff: state }, req.userId),
    });
  } catch (error) {
    console.error('Release handoff error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to return conversation to AI' });
  }
});

router.post('/:id/handoff/reply', authenticateToken, async (req, res) => {
  try {
    const chatLog = await hydrateWhatsAppCustomerPhone(
      await getOwnedChatLog(req.params.id, req.businessId),
      req.businessId
    );

    if (!chatLog) {
      return res.status(404).json({ error: 'Chat log not found' });
    }

    if (chatLog.channel !== 'WHATSAPP') {
      return res.status(400).json({ error: 'Live handoff is currently available only for WhatsApp conversations' });
    }

    if (!chatLog.customerPhone) {
      return res.status(400).json({ error: 'This WhatsApp conversation does not have a customer phone number' });
    }

    const message = getReplyText(req);
    if (!message) {
      return res.status(422).json({ error: 'Reply message is required' });
    }

    const business = await getBusinessForWhatsAppReply(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    await noteHumanReply({
      sessionId: chatLog.sessionId,
      businessId: req.businessId,
      userId: req.userId,
      userName: getActorName(req.user),
    });

    const sendResult = await sendWhatsAppMessage(business, chatLog.customerPhone, message);
    if (!sendResult?.success) {
      return res.status(502).json({ error: sendResult?.error || 'Failed to send WhatsApp reply' });
    }

    await appendChatLogMessages({
      sessionId: chatLog.sessionId,
      businessId: req.businessId,
      channel: chatLog.channel,
      assistantId: chatLog.assistantId || null,
      customerPhone: chatLog.customerPhone || null,
      messages: [
        {
          role: 'human_agent',
          content: message,
          metadata: {
            actorUserId: req.userId,
            actorName: getActorName(req.user),
            channel: 'WHATSAPP',
            source: 'live_handoff',
          }
        }
      ]
    });

    const refreshed = await getOwnedChatLog(req.params.id, req.businessId);
    const normalizedRefreshed = normalizeChatLogStatus(refreshed);
    const refreshedState = (await prisma.conversationState.findUnique({
      where: { sessionId: chatLog.sessionId },
      select: { state: true }
    }))?.state;

    res.json({
      success: true,
      chatLog: {
        ...normalizedRefreshed,
        handoff: buildChatLogHandoffView(
          normalizedRefreshed,
          refreshedState,
          req.userId
        )
      }
    });
  } catch (error) {
    console.error('Live handoff reply error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to send live handoff reply' });
  }
});

// DELETE /api/chat-logs/:id - Delete a chat log
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.chatLog.deleteMany({
      where: {
        id,
        businessId: req.businessId
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete chat log error:', error);
    res.status(500).json({ error: 'Failed to delete chat log' });
  }
});

export default router;
