import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

const MARKETING_EVENT_ALLOWLIST = new Set([
  'page_view',
  'scroll',
  'scroll_25',
  'scroll_50',
  'scroll_75',
  'scroll_100',
  'time_on_page',
  'cta_click',
  'signup_page_view',
  'signup_start',
  'signup_submit',
  'signup_complete',
  'trial_start',
  'pricing_view',
  'pricing_plan_click',
  'contact_click',
  'demo_request',
  'generate_lead',
  'sign_up',
  'form_error'
]);

function sanitizeMarketingString(value, maxLength = 500) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  if (!normalized) return undefined;
  return normalized.slice(0, maxLength);
}

function sanitizeMarketingProperties(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const blocked = new Set(['email', 'phone', 'password', 'full_name', 'fullName', 'business_name', 'businessName']);
  const output = {};

  for (const [key, value] of Object.entries(input)) {
    if (blocked.has(key) || value === undefined || value === null || value === '') continue;
    if (typeof value === 'string') {
      output[key] = value.slice(0, 500);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      output[key] = value;
    }
  }

  return output;
}

// POST /api/analytics/marketing-event - Public, best-effort relay to Campaign Orchestrator.
router.post('/marketing-event', async (req, res) => {
  const eventName = sanitizeMarketingString(req.body?.eventName, 80);

  if (!eventName || !MARKETING_EVENT_ALLOWLIST.has(eventName)) {
    return res.status(400).json({
      error: 'Unsupported marketing event',
      code: 'UNSUPPORTED_MARKETING_EVENT'
    });
  }

  const orchestratorUrl = sanitizeMarketingString(
    process.env.CAMPAIGN_ORCHESTRATOR_ANALYTICS_URL ||
      process.env.MARKETING_ANALYTICS_INGEST_URL,
    1000
  );

  if (!orchestratorUrl) {
    return res.status(202).json({
      success: true,
      forwarded: false,
      reason: 'MARKETING_ANALYTICS_NOT_CONFIGURED'
    });
  }

  const payload = {
    secret: sanitizeMarketingString(
      process.env.CAMPAIGN_ORCHESTRATOR_ANALYTICS_SECRET ||
        process.env.ANALYTICS_INGEST_SHARED_SECRET,
      500
    ),
    campaignDraftId: sanitizeMarketingString(req.body?.campaignDraftId, 80),
    sessionId: sanitizeMarketingString(req.body?.sessionId, 120),
    anonymousId: sanitizeMarketingString(req.body?.anonymousId, 120),
    userId: sanitizeMarketingString(req.body?.userId, 120),
    eventName,
    pageUrl: sanitizeMarketingString(req.body?.pageUrl, 1000),
    pagePath: sanitizeMarketingString(req.body?.pagePath, 300),
    referrer: sanitizeMarketingString(req.body?.referrer, 1000),
    source: sanitizeMarketingString(req.body?.source, 120),
    medium: sanitizeMarketingString(req.body?.medium, 120),
    campaignName: sanitizeMarketingString(req.body?.campaignName, 300),
    properties: sanitizeMarketingProperties(req.body?.properties),
    occurredAt: sanitizeMarketingString(req.body?.occurredAt, 80)
  };

  try {
    const response = await fetch(orchestratorUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.warn('[marketing-analytics] relay failed', {
        status: response.status,
        eventName
      });
    }
  } catch (error) {
    console.warn('[marketing-analytics] relay error', {
      eventName,
      message: error.message
    });
  }

  return res.status(202).json({ success: true, forwarded: true });
});

// GET /api/analytics/overview?range=30d
router.get('/overview', authenticateToken, async (req, res) => {
  try {
    const { businessId } = req;
    const { range = '30d' } = req.query;

    // Parse time range
    const days = parseInt(range.replace(/[^0-9]/g, ''));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all calls in range
    const calls = await prisma.callLog.findMany({
      where: {
        businessId,
        createdAt: { gte: startDate }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Get chat logs (sessions) - separated by channel
    const chatLogs = await prisma.chatLog.findMany({
      where: {
        businessId,
        createdAt: { gte: startDate },
        channel: 'CHAT'
      }
    });

    // Get WhatsApp logs (sessions)
    const whatsappLogs = await prisma.chatLog.findMany({
      where: {
        businessId,
        createdAt: { gte: startDate },
        channel: 'WHATSAPP'
      }
    });

    // Get email threads with AI responses
    const emailThreads = await prisma.emailThread.findMany({
      where: {
        businessId,
        createdAt: { gte: startDate }
      }
    });

    // Get AI-generated email drafts that were sent
    const sentEmailDrafts = await prisma.emailDraft.findMany({
      where: {
        businessId,
        status: 'SENT',
        createdAt: { gte: startDate }
      }
    });

    // Get assistants
    const assistants = await prisma.assistant.findMany({
      where: { businessId, isActive: true }
    });

    // Calculate PHONE stats
    const totalCalls = calls.length;
    const totalDuration = calls.reduce((sum, call) => sum + (call.duration || 0), 0);
    const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;
    const totalCost = totalDuration * 0.01;

    // Calculate CHAT stats - count sessions (not individual messages)
    const chatSessions = chatLogs.length;

    // Calculate WHATSAPP stats
    const whatsappSessions = whatsappLogs.length;

    // Calculate EMAIL stats - count AI-answered emails
    const emailsAnswered = sentEmailDrafts.length;
    const totalEmailThreads = emailThreads.length;

    const toDurationSeconds = (start, end) => {
      if (!start || !end) return 0;
      const diff = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
      return diff > 0 ? diff : 0;
    };

    const chatTotalSessionDuration = chatLogs.reduce(
      (sum, session) => sum + toDurationSeconds(session.createdAt, session.updatedAt),
      0
    );
    const whatsappTotalSessionDuration = whatsappLogs.reduce(
      (sum, session) => sum + toDurationSeconds(session.createdAt, session.updatedAt),
      0
    );
    const emailTotalSessionDuration = emailThreads.reduce(
      (sum, thread) => sum + toDurationSeconds(thread.createdAt, thread.lastMessageAt || thread.updatedAt),
      0
    );

    const channelSessionDuration = {
      phone: {
        sessions: totalCalls,
        averageSeconds: avgDuration,
        totalSeconds: totalDuration
      },
      chat: {
        sessions: chatSessions,
        averageSeconds: chatSessions > 0 ? Math.round(chatTotalSessionDuration / chatSessions) : 0,
        totalSeconds: chatTotalSessionDuration
      },
      whatsapp: {
        sessions: whatsappSessions,
        averageSeconds: whatsappSessions > 0 ? Math.round(whatsappTotalSessionDuration / whatsappSessions) : 0,
        totalSeconds: whatsappTotalSessionDuration
      },
      email: {
        sessions: totalEmailThreads,
        averageSeconds: totalEmailThreads > 0 ? Math.round(emailTotalSessionDuration / totalEmailThreads) : 0,
        totalSeconds: emailTotalSessionDuration
      }
    };

    // Calls over time WITH chats, whatsapp, and emails
    const callsByDate = {};
    const chatsByDate = {};
    const whatsappByDate = {};
    const emailsByDate = {};

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (days - i - 1));
      const dateStr = date.toISOString().split('T')[0];
      callsByDate[dateStr] = 0;
      chatsByDate[dateStr] = 0;
      whatsappByDate[dateStr] = 0;
      emailsByDate[dateStr] = 0;
    }

    calls.forEach(call => {
      const dateStr = call.createdAt.toISOString().split('T')[0];
      if (callsByDate[dateStr] !== undefined) {
        callsByDate[dateStr]++;
      }
    });

    chatLogs.forEach(log => {
      const dateStr = log.createdAt.toISOString().split('T')[0];
      if (chatsByDate[dateStr] !== undefined) {
        chatsByDate[dateStr]++;
      }
    });

    whatsappLogs.forEach(log => {
      const dateStr = log.createdAt.toISOString().split('T')[0];
      if (whatsappByDate[dateStr] !== undefined) {
        whatsappByDate[dateStr]++;
      }
    });

    sentEmailDrafts.forEach(draft => {
      const dateStr = draft.createdAt.toISOString().split('T')[0];
      if (emailsByDate[dateStr] !== undefined) {
        emailsByDate[dateStr]++;
      }
    });

    const callsOverTime = Object.keys(callsByDate).map((date) => ({
      date, // Return ISO date string, let frontend format it
      calls: callsByDate[date],
      chats: chatsByDate[date] || 0,
      whatsapp: whatsappByDate[date] || 0,
      emails: emailsByDate[date] || 0
    }));

    // Status distribution
    const statusCount = {};
    calls.forEach(call => {
      const status = call.status || 'unknown';
      statusCount[status] = (statusCount[status] || 0) + 1;
    });
    const statusDistribution = Object.entries(statusCount).map(([status, value]) => ({
      status: status.charAt(0).toUpperCase() + status.slice(1),
      value
    }));

    // Duration distribution
    const durationRanges = [
      { range: '0-30s', min: 0, max: 30, count: 0 },
      { range: '30s-1m', min: 30, max: 60, count: 0 },
      { range: '1-2m', min: 60, max: 120, count: 0 },
      { range: '2-5m', min: 120, max: 300, count: 0 },
      { range: '5m+', min: 300, max: Infinity, count: 0 }
    ];
    calls.forEach(call => {
      const duration = call.duration || 0;
      const range = durationRanges.find(r => duration >= r.min && duration < r.max);
      if (range) range.count++;
    });
    const durationDistribution = durationRanges.map(({ range, count }) => ({ range, count }));

    // Assistant performance
    const assistantCalls = {};
    calls.forEach(call => {
      const assistantId = call.assistantId || 'unknown';
      assistantCalls[assistantId] = (assistantCalls[assistantId] || 0) + 1;
    });
    const assistantPerformance = assistants.map(assistant => ({
      name: assistant.name,
      calls: assistantCalls[assistant.id] || 0
    }));

    // Channel distribution - now with 4 channels
    const totalInteractions = totalCalls + chatSessions + whatsappSessions + emailsAnswered;
    const channelStats = {
      phone: { count: totalCalls, percentage: 0 },
      chat: { count: chatSessions, percentage: 0 },
      whatsapp: { count: whatsappSessions, percentage: 0 },
      email: { count: emailsAnswered, percentage: 0 },
      total: totalInteractions
    };
    if (totalInteractions > 0) {
      channelStats.phone.percentage = parseFloat(((totalCalls / totalInteractions) * 100).toFixed(1));
      channelStats.chat.percentage = parseFloat(((chatSessions / totalInteractions) * 100).toFixed(1));
      channelStats.whatsapp.percentage = parseFloat(((whatsappSessions / totalInteractions) * 100).toFixed(1));
      channelStats.email.percentage = parseFloat(((emailsAnswered / totalInteractions) * 100).toFixed(1));
    }

    res.json({
      // Phone metrics
      totalCalls,
      totalMinutes: Math.round(totalDuration / 60),
      avgDuration,
      totalCost: parseFloat(totalCost.toFixed(2)),

      // Chat metrics (session-based)
      chatSessions,

      // WhatsApp metrics
      whatsappSessions,

      // Email metrics
      emailsAnswered,
      totalEmailThreads,

      // Charts data
      callsOverTime,
      statusDistribution,
      durationDistribution,
      assistantPerformance,

      // Channel stats
      channelStats,
      channelSessionDuration
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// GET /api/analytics/calls - Paginated call list with filters
router.get('/calls', authenticateToken, async (req, res) => {
  try {
    const { businessId } = req;
    const { 
      page = 1, 
      limit = 20, 
      startDate, 
      endDate, 
      sentiment,
      status 
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build where clause
    const where = { businessId };
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }
    
    if (sentiment) where.sentiment = sentiment;
    if (status) where.status = status;

    // Get calls
    const [calls, total] = await Promise.all([
      prisma.callLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.callLog.count({ where })
    ]);

    res.json({
      calls,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching calls:', error);
    res.status(500).json({ error: 'Failed to fetch calls' });
  }
});

// GET /api/analytics/calls/:callId - Single call detail
router.get('/calls/:callId', authenticateToken, async (req, res) => {
  try {
    const { businessId } = req;
    const { callId } = req.params;

    const call = await prisma.callLog.findFirst({
      where: {
        callId,
        businessId
      }
    });

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    res.json({ call });
  } catch (error) {
    console.error('Error fetching call:', error);
    res.status(500).json({ error: 'Failed to fetch call' });
  }
});

// GET /api/analytics/trends - Trend data for graphs
router.get('/trends', authenticateToken, async (req, res) => {
  try {
    const { businessId } = req;
    const { period = 'daily' } = req.query;

    const days = period === 'daily' ? 30 : period === 'weekly' ? 90 : 365;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const calls = await prisma.callLog.findMany({
      where: {
        businessId,
        createdAt: { gte: startDate }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Group by period
    const trends = {};
    calls.forEach(call => {
      let key;
      if (period === 'daily') {
        key = call.createdAt.toISOString().split('T')[0];
      } else if (period === 'weekly') {
        const weekStart = new Date(call.createdAt);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        key = weekStart.toISOString().split('T')[0];
      } else {
        key = call.createdAt.toISOString().substring(0, 7);
      }

      if (!trends[key]) {
        trends[key] = { calls: 0, duration: 0, positive: 0, negative: 0 };
      }
      trends[key].calls++;
      trends[key].duration += call.duration || 0;
      if (call.sentiment === 'positive') trends[key].positive++;
      if (call.sentiment === 'negative') trends[key].negative++;
    });

    const trendData = Object.entries(trends).map(([date, data]) => ({
      date,
      calls: data.calls,
      avgDuration: Math.round(data.duration / data.calls),
      positiveRate: data.calls > 0 ? ((data.positive / data.calls) * 100).toFixed(1) : 0
    }));

    res.json({ trends: trendData });
  } catch (error) {
    console.error('Error fetching trends:', error);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

// GET /api/analytics/peak-hours - Peak activity hours (all channels)
router.get('/peak-hours', authenticateToken, async (req, res) => {
  try {
    const { businessId } = req;
    const { range = '30d' } = req.query;

    // Parse time range
    const days = parseInt(range.replace(/[^0-9]/g, ''));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all calls in range
    const calls = await prisma.callLog.findMany({
      where: {
        businessId,
        createdAt: { gte: startDate }
      },
      select: { createdAt: true }
    });

    // Get all chat sessions in range
    const chatLogs = await prisma.chatLog.findMany({
      where: {
        businessId,
        channel: 'CHAT',
        createdAt: { gte: startDate }
      },
      select: { createdAt: true }
    });

    // Get all WhatsApp sessions in range
    const whatsappLogs = await prisma.chatLog.findMany({
      where: {
        businessId,
        channel: 'WHATSAPP',
        createdAt: { gte: startDate }
      },
      select: { createdAt: true }
    });

    // Get all email threads in range
    const emailThreads = await prisma.emailThread.findMany({
      where: {
        businessId,
        createdAt: { gte: startDate }
      },
      select: { createdAt: true }
    });

    // Group by hour - separate channels
    const hourData = Array(24).fill(null).map(() => ({
      phone: 0,
      chat: 0,
      whatsapp: 0,
      email: 0
    }));

    calls.forEach(call => {
      const hour = new Date(call.createdAt).getHours();
      hourData[hour].phone++;
    });

    chatLogs.forEach(chat => {
      const hour = new Date(chat.createdAt).getHours();
      hourData[hour].chat++;
    });

    whatsappLogs.forEach(wa => {
      const hour = new Date(wa.createdAt).getHours();
      hourData[hour].whatsapp++;
    });

    emailThreads.forEach(email => {
      const hour = new Date(email.createdAt).getHours();
      hourData[hour].email++;
    });

    const peakHours = hourData.map((data, hour) => ({
      hour: `${hour.toString().padStart(2, '0')}:00`,
      phone: data.phone,
      chat: data.chat,
      whatsapp: data.whatsapp,
      email: data.email
    }));

    res.json({ peakHours });
  } catch (error) {
    console.error('Error fetching peak hours:', error);
    res.status(500).json({ error: 'Failed to fetch peak hours' });
  }
});

// GET /api/analytics/top-questions - Top topics/questions from INBOUND interactions only
router.get('/top-questions', authenticateToken, async (req, res) => {
  try {
    const { businessId } = req;
    const { range = '30d', limit = 10, channel } = req.query;

    // Parse time range
    const days = parseInt(range.replace(/[^0-9]/g, ''));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Collect topics from INBOUND channels only
    const topics = [];

    // 1. Get INBOUND call topics (direction = inbound)
    // PRIORITY: Use normalizedCategory/normalizedTopic if available (AI-determined)
    // FALLBACK: Use summary with keyword matching
    if (!channel || channel === 'phone') {
      const calls = await prisma.callLog.findMany({
        where: {
          businessId,
          createdAt: { gte: startDate },
          direction: 'inbound', // Only inbound calls
          OR: [
            { normalizedCategory: { not: null } },
            { summary: { not: null } }
          ]
        },
        select: {
          summary: true,
          normalizedCategory: true,
          normalizedTopic: true,
          createdAt: true
        }
      });

      calls.forEach(call => {
        // If normalized category exists, use it directly (already AI-determined)
        if (call.normalizedCategory && call.normalizedTopic) {
          topics.push({
            text: call.summary || '',
            channel: 'phone',
            date: call.createdAt,
            // Pre-normalized - skip keyword matching
            preNormalized: true,
            category: call.normalizedCategory,
            normalizedTopic: call.normalizedTopic
          });
        } else if (call.summary) {
          // Fallback to summary with keyword matching
          topics.push({
            text: call.summary,
            channel: 'phone',
            date: call.createdAt,
            preNormalized: false
          });
        }
      });
    }

    // 2. Get web chat topics
    // PRIORITY: Use normalizedCategory/normalizedTopic if available (AI-determined)
    // FALLBACK: Use summary or first user message with keyword matching
    if (!channel || channel === 'chat') {
      const chatLogs = await prisma.chatLog.findMany({
        where: {
          businessId,
          createdAt: { gte: startDate },
          channel: 'CHAT'
        },
        select: {
          messages: true,
          summary: true,
          normalizedCategory: true,
          normalizedTopic: true,
          createdAt: true
        }
      });

      chatLogs.forEach(log => {
        // If normalized category exists, use it directly
        if (log.normalizedCategory && log.normalizedTopic) {
          topics.push({
            text: log.summary || '',
            channel: 'chat',
            date: log.createdAt,
            preNormalized: true,
            category: log.normalizedCategory,
            normalizedTopic: log.normalizedTopic
          });
        } else if (log.summary) {
          // Fallback to summary
          topics.push({
            text: log.summary.substring(0, 200),
            channel: 'chat',
            date: log.createdAt,
            preNormalized: false
          });
        } else if (log.messages) {
          // Fallback to first user message
          let messages = log.messages;
          if (typeof messages === 'string') {
            try {
              messages = JSON.parse(messages);
            } catch (e) {
              messages = [];
            }
          }

          if (Array.isArray(messages) && messages.length > 0) {
            const userMessage = messages.find(m => m.role === 'user');
            if (userMessage && userMessage.content) {
              topics.push({
                text: userMessage.content.substring(0, 200),
                channel: 'chat',
                date: log.createdAt,
                preNormalized: false
              });
            }
          }
        }
      });
    }

    // 3. Get WhatsApp topics
    // PRIORITY: Use normalizedCategory/normalizedTopic if available (AI-determined)
    // FALLBACK: Use summary or first user message with keyword matching
    if (!channel || channel === 'whatsapp') {
      const whatsappLogs = await prisma.chatLog.findMany({
        where: {
          businessId,
          createdAt: { gte: startDate },
          channel: 'WHATSAPP'
        },
        select: {
          messages: true,
          summary: true,
          normalizedCategory: true,
          normalizedTopic: true,
          createdAt: true
        }
      });

      whatsappLogs.forEach(log => {
        // If normalized category exists, use it directly
        if (log.normalizedCategory && log.normalizedTopic) {
          topics.push({
            text: log.summary || '',
            channel: 'whatsapp',
            date: log.createdAt,
            preNormalized: true,
            category: log.normalizedCategory,
            normalizedTopic: log.normalizedTopic
          });
        } else if (log.summary) {
          // Fallback to summary
          topics.push({
            text: log.summary.substring(0, 200),
            channel: 'whatsapp',
            date: log.createdAt,
            preNormalized: false
          });
        } else if (log.messages) {
          // Fallback to first user message
          let messages = log.messages;
          if (typeof messages === 'string') {
            try {
              messages = JSON.parse(messages);
            } catch (e) {
              messages = [];
            }
          }

          if (Array.isArray(messages) && messages.length > 0) {
            const userMessage = messages.find(m => m.role === 'user');
            if (userMessage && userMessage.content) {
              topics.push({
                text: userMessage.content.substring(0, 200),
                channel: 'whatsapp',
                date: log.createdAt,
                preNormalized: false
              });
            }
          }
        }
      });
    }

    // 4. Get INBOUND email subjects
    if (!channel || channel === 'email') {
      const emailMessages = await prisma.emailMessage.findMany({
        where: {
          thread: {
            businessId
          },
          direction: 'INBOUND',
          createdAt: { gte: startDate }
        },
        select: {
          subject: true,
          createdAt: true
        },
        take: 100
      });

      emailMessages.forEach(email => {
        if (email.subject) {
          topics.push({
            text: email.subject,
            channel: 'email',
            date: email.createdAt
          });
        }
      });
    }

    // Filter out invalid/empty topics
    const invalidPatterns = [
      'yanıt vermedi',
      'arama sona erdi',
      'kullanıcı yanıt',
      'no response',
      'call ended',
      'greeting in',
      'turkish conversation',
      'ai assistant introduction',
      'greeting and',
      'selam', 'merhaba', 'hello', 'hi', 'hey',
      'iyi günler', 'iyi akşamlar', 'günaydın'
    ];

    const filteredTopics = topics.filter(topic => {
      const lowerText = topic.text.toLowerCase().trim();
      if (lowerText.length < 5) return false;
      if (invalidPatterns.some(p => lowerText.includes(p))) return false;
      const greetingOnly = /^(merhaba|selam|hi|hello|hey|günaydın|iyi günler|iyi akşamlar)[.,!?]?$/i.test(lowerText);
      if (greetingOnly) return false;
      return true;
    });

    // ============================================================================
    // NORMALIZED TOPIC CATEGORIES - Standardized topic names
    // ============================================================================
    // Category -> Normalized Topics mapping
    const normalizedTopics = {
      'Sipariş': {
        keywords: ['sipariş', 'order', 'siparişim', 'siparis'],
        topics: {
          'Sipariş Durumu Sorgulama': ['sipariş durumu', 'siparişim nerede', 'siparis nerde', 'order status', 'order inquiry', 'takip', 'ne durumda', 'ne oldu', 'kargom', 'nerede kaldı', 'nerda', 'nerde'],
          'Sipariş Verme': ['sipariş vermek', 'sipariş ver', 'satın al', 'almak istiyorum', 'sipariş oluştur'],
          'Sipariş İptali': ['sipariş iptal', 'iptal etmek', 'vazgeç', 'cancel order'],
          'Sipariş Değişikliği': ['sipariş değiştir', 'adres değiştir', 'güncelle']
        }
      },
      'İade': {
        keywords: ['iade', 'return', 'refund', 'değişim', 'geri'],
        topics: {
          'İade Talebi': ['iade etmek', 'iade başlat', 'iade istiyorum', 'return request', 'geri vermek', 'iade sürecini başlat'],
          'İade Durumu Sorgulama': ['iade durumu', 'iadem ne oldu', 'return status', 'iade nerede'],
          'Değişim Talebi': ['değişim', 'değiştirmek', 'exchange', 'başka beden', 'başka renk']
        }
      },
      'Ödeme': {
        keywords: ['ödeme', 'payment', 'borç', 'fatura', 'kredi', 'taksit', 'eft', 'havale'],
        topics: {
          'Borç Sorgulama': ['borç', 'borcum', 'ne kadar borç', 'bakiye', 'hesap durumu', 'cari'],
          'Ödeme Bilgisi': ['nasıl ödenir', 'ödeme yöntemi', 'kredi kartı', 'taksit', 'havale', 'eft'],
          'Fatura Talebi': ['fatura', 'e-fatura', 'fatura iste', 'fatura gönder'],
          'Ödeme Onayı': ['ödeme yaptım', 'ödeme onay', 'dekont', 'payment confirm']
        }
      },
      'Muhasebe': {
        keywords: ['sgk', 'vergi', 'beyanname', 'kdv', 'gelir vergisi', 'muhasebe'],
        topics: {
          'Vergi Sorgulama': ['vergi borcu', 'vergi durumu', 'kdv', 'gelir vergisi'],
          'SGK Sorgulama': ['sgk', 'sigorta', 'prim'],
          'Beyanname': ['beyanname', 'beyan']
        }
      },
      'Ürün': {
        keywords: ['ürün', 'product', 'stok', 'fiyat', 'beden', 'renk'],
        topics: {
          'Ürün Bilgisi': ['ürün hakkında', 'özellik', 'product info', 'bilgi almak'],
          'Stok Durumu': ['stok', 'var mı', 'mevcut mu', 'stock'],
          'Fiyat Bilgisi': ['fiyat', 'ne kadar', 'kaç para', 'ücret', 'price']
        }
      },
      'Teslimat': {
        keywords: ['kargo', 'teslimat', 'teslim', 'kurye', 'gönderim'],
        topics: {
          'Teslimat Durumu': ['kargo nerede', 'ne zaman gelir', 'teslimat durumu', 'delivery status'],
          'Adres Değişikliği': ['adres değiştir', 'teslimat adresi', 'yeni adres'],
          'Teslimat Sorunu': ['kargo gelmedi', 'teslim edilmedi', 'hasarlı']
        }
      },
      'Destek': {
        keywords: ['şikayet', 'sorun', 'problem', 'hata', 'çalışmıyor', 'arıza', 'bozuk'],
        topics: {
          'Şikayet': ['şikayet', 'memnun değil', 'complaint'],
          'Teknik Sorun': ['çalışmıyor', 'hata', 'bozuk', 'arıza', 'error'],
          'Yardım Talebi': ['yardım', 'help', 'destek']
        }
      },
      'Randevu': {
        keywords: ['randevu', 'appointment', 'rezervasyon', 'booking'],
        topics: {
          'Randevu Alma': ['randevu almak', 'randevu oluştur', 'rezervasyon yap'],
          'Randevu İptali': ['randevu iptal', 'vazgeç'],
          'Randevu Sorgulama': ['randevum ne zaman', 'randevu durumu']
        }
      },
      'Genel': {
        keywords: ['bilgi', 'adres', 'çalışma saatleri', 'iletişim', 'telefon'],
        topics: {
          'Genel Bilgi': ['bilgi almak', 'hakkında', 'nasıl'],
          'İletişim Bilgisi': ['adres', 'telefon', 'iletişim', 'çalışma saatleri']
        }
      }
    };

    // Function to normalize a topic text to a standard topic name
    const normalizeTopicText = (text) => {
      const lowerText = text.toLowerCase();

      for (const [category, config] of Object.entries(normalizedTopics)) {
        // Check if text belongs to this category
        const matchesCategory = config.keywords.some(kw => lowerText.includes(kw));
        if (!matchesCategory) continue;

        // Find matching normalized topic
        for (const [normalizedName, patterns] of Object.entries(config.topics)) {
          if (patterns.some(pattern => lowerText.includes(pattern))) {
            return { category, topic: normalizedName };
          }
        }

        // Category matched but no specific topic - use first topic as default
        const defaultTopic = Object.keys(config.topics)[0];
        return { category, topic: defaultTopic };
      }

      return { category: 'Diğer', topic: 'Diğer Konular' };
    };

    // Categorize and normalize each topic
    // If preNormalized = true, use the AI-determined category/topic directly
    // If preNormalized = false, use keyword matching
    const categorizedTopics = filteredTopics.map(topic => {
      if (topic.preNormalized) {
        // Already normalized by AI - use directly
        return { ...topic };
      }
      // Fallback: use keyword matching
      const { category, topic: normalizedTopic } = normalizeTopicText(topic.text);
      return { ...topic, category, normalizedTopic };
    });

    // Group by category with normalized subtopic aggregation
    const categoryStats = {};
    categorizedTopics.forEach(t => {
      if (!categoryStats[t.category]) {
        categoryStats[t.category] = {
          category: t.category,
          count: 0,
          channels: new Set(),
          subtopics: {}
        };
      }
      categoryStats[t.category].count++;
      categoryStats[t.category].channels.add(t.channel);

      // Aggregate by normalized topic name
      if (!categoryStats[t.category].subtopics[t.normalizedTopic]) {
        categoryStats[t.category].subtopics[t.normalizedTopic] = {
          text: t.normalizedTopic,
          count: 0
        };
      }
      categoryStats[t.category].subtopics[t.normalizedTopic].count++;
    });

    // Sort by count and get top N
    const topTopics = Object.values(categoryStats)
      .map(c => {
        const sortedSubtopics = Object.values(c.subtopics)
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
          .map(s => ({ text: s.text, count: s.count }));

        return {
          category: c.category,
          count: c.count,
          channels: Array.from(c.channels),
          subtopics: sortedSubtopics
        };
      })
      .filter(c => c.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, parseInt(limit));

    res.json({
      topTopics,
      totalInteractions: topics.length
    });
  } catch (error) {
    console.error('Error fetching top questions:', error);
    res.status(500).json({ error: 'Failed to fetch top questions' });
  }
});

export default router;
