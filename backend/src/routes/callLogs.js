import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';
import axios from 'axios';
import OpenAI from 'openai';
import { getPricePerMinute } from '../config/plans.js';
import { auditSensitiveDataAccess } from '../middleware/sensitiveDataAudit.js';
import {
  cleanTranscriptText,
  normalizeTranscriptBundle
} from '../utils/transcript.js';

const router = express.Router();
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const TURKISH_CHAR_REGEX = /[ğüşıöçĞÜŞİÖÇ]/;
const TURKISH_SUMMARY_REGEX = /\b(ve|ile|için|müşteri|musteri|asistan|görüşme|gorusme|arama|toplantı|toplanti|telefon|e-posta|eposta|başarıyla|basariyla|planlandı|planlandi|takip)\b/i;
const ENGLISH_SUMMARY_REGEX = /\b(the|and|with|from|user|customer|agent|callback|meeting|email|phone|scheduled|successfully|contacted|discussed|explained|identified|provided|follow-up|conversation|concluded|challenging|requested|agreed)\b/i;

function shouldTranslateSummaryToTurkish(summary, businessLanguage = 'TR') {
  if (businessLanguage !== 'TR' || !summary) return false;

  const normalizedSummary = String(summary).trim();
  if (!normalizedSummary) return false;
  if (TURKISH_CHAR_REGEX.test(normalizedSummary) || TURKISH_SUMMARY_REGEX.test(normalizedSummary)) {
    return false;
  }

  return ENGLISH_SUMMARY_REGEX.test(normalizedSummary);
}

async function translateSummaryToTurkish(summary) {
  if (!summary || !openai) return summary;

  try {
    const translated = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Sen bir çevirmensin. Verilen çağrı özetini doğal ve kısa Türkçe ile çevir. Özel isimleri, marka isimlerini, telefon numaralarını ve tarihleri aynen koru.'
        },
        { role: 'user', content: summary }
      ],
      max_tokens: 300,
      temperature: 0.2
    });

    return translated.choices[0]?.message?.content?.trim() || summary;
  } catch (error) {
    console.warn('Summary translation failed:', error.message);
    return summary;
  }
}

/**
 * Fetch conversation data from 11Labs and process it
 * @param {string} conversationId - 11Labs conversation ID
 * @param {Object} business - Business object with subscription
 * @returns {Object|null} Processed data for database update
 */
async function fetchAndProcessConversation(conversationId, business) {
  const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenLabsApiKey || !conversationId) return null;

  try {
    const response = await axios.get(
      `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
      { headers: { 'xi-api-key': elevenLabsApiKey } }
    );

    const data = response.data;
    if (!data) return null;

    // Parse transcript
    const { transcript: transcriptMessages, transcriptText } = normalizeTranscriptBundle(data.transcript);

    // Get summary and translate if needed
    let summary = data.analysis?.transcript_summary || data.analysis?.summary || null;
    if (shouldTranslateSummaryToTurkish(summary, business?.language)) {
      const translatedSummary = await translateSummaryToTurkish(summary);
      if (translatedSummary !== summary) {
        summary = translatedSummary;
        console.log('🌐 Summary translated to Turkish');
      }
    }

    // Parse termination reason from 11Labs metadata
    const terminationReason = data.metadata?.termination_reason ||
                              data.analysis?.call_ended_by ||
                              data.status ||
                              null;
    console.log(`🔍 Termination reason from 11Labs: ${terminationReason}`);

    let endReason = null;
    if (terminationReason) {
      const reason = terminationReason.toLowerCase();
      // 11Labs specific: "Remote party ended call" = customer hung up
      if (reason.includes('remote party') || reason.includes('client') || reason.includes('user') || reason.includes('hangup') || reason.includes('customer')) {
        endReason = 'client_ended';
      } else if (reason.includes('agent') || reason.includes('assistant') || reason.includes('ai') || reason.includes('local')) {
        endReason = 'agent_ended';
      } else if (reason.includes('timeout') || reason.includes('silence') || reason.includes('no_input') || reason.includes('inactivity')) {
        endReason = 'system_timeout';
      } else if (reason.includes('error') || reason.includes('failed')) {
        endReason = 'error';
      } else if (reason === 'done' || reason === 'completed' || reason === 'finished') {
        endReason = 'completed';
      } else {
        // Default: if call has duration, mark as completed
        endReason = 'completed';
      }
    } else {
      // No termination reason - if we have duration, mark as completed
      const duration = data.call_duration_secs || data.metadata?.call_duration_secs || 0;
      if (duration > 0) {
        endReason = 'completed';
      }
    }

    // Calculate call cost dynamically based on plan
    // SANİYE BAZLI HESAPLAMA - daha adil fiyatlandırma
    const duration = data.call_duration_secs || data.metadata?.call_duration_secs || 0;
    const plan = business?.subscription?.plan || 'PAYG';
    const subscription = business?.subscription;

    // Get cost per minute - Enterprise uses custom pricing from subscription
    let costPerMinute;
    if (plan === 'ENTERPRISE' && subscription?.enterpriseMinutes > 0 && subscription?.enterprisePrice > 0) {
      // Enterprise: dakika maliyeti = toplam fiyat / toplam dakika
      costPerMinute = subscription.enterprisePrice / subscription.enterpriseMinutes;
    } else {
      // Standard plans: use plan configuration
      costPerMinute = getPricePerMinute(plan, 'TR') || 23; // Default to PAYG rate
    }

    // Saniye bazlı hesaplama: duration(sn) / 60 * dakika fiyatı
    // Örnek: 127 sn = 2.1167 dk * 15 TL = 31.75 TL (eski yöntem: 3 dk * 15 = 45 TL)
    const durationMinutes = duration > 0 ? duration / 60 : 0;
    const callCost = durationMinutes > 0 ? Math.round(durationMinutes * costPerMinute * 100) / 100 : 0;

    // Determine direction
    let direction = data.metadata?.phone_call?.direction || data.metadata?.channel || 'inbound';
    if (direction === 'web' || direction === 'chat') direction = 'inbound';

    return {
      duration: duration || undefined,
      direction: direction,
      transcript: transcriptMessages.length > 0 ? transcriptMessages : undefined,
      transcriptText: transcriptText || undefined,
      summary: summary || undefined,
      endReason: endReason || undefined,
      callCost: callCost || undefined,
      status: 'answered',
      updatedAt: new Date()
    };
  } catch (error) {
    console.error('Error fetching 11Labs conversation:', error.message);
    return null;
  }
}

router.use(authenticateToken);

// Export calls as CSV - MUST be defined before /:id route
router.get('/export', auditSensitiveDataAccess('call_logs_export'), async (req, res) => {
  try {
    const { businessId } = req;

    // Get business language for localized export
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { language: true }
    });
    const isTurkish = business?.language === 'TR';

    const callLogs = await prisma.callLog.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' }
    });

    // Localized headers
    const headers = isTurkish
      ? ['Tarih', 'Telefon Numarası', 'Süre (sn)', 'Yön', 'Durum', 'Sonlandırma Nedeni']
      : ['Date', 'Phone Number', 'Duration (sec)', 'Direction', 'Status', 'End Reason'];

    // Localized values
    const translateDirection = (dir) => {
      if (!dir) return isTurkish ? 'Gelen' : 'Inbound';
      if (dir.startsWith('outbound')) return isTurkish ? 'Giden' : 'Outbound';
      return isTurkish ? 'Gelen' : 'Inbound';
    };

    const translateStatus = (status) => {
      const statusMap = {
        answered: isTurkish ? 'Yanıtlandı' : 'Answered',
        failed: isTurkish ? 'Başarısız' : 'Failed',
        in_progress: isTurkish ? 'Devam Ediyor' : 'In Progress',
        completed: isTurkish ? 'Tamamlandı' : 'Completed',
      };
      return statusMap[status] || status || (isTurkish ? 'Bilinmiyor' : 'Unknown');
    };

    const translateEndReason = (reason) => {
      if (!reason) return '-';
      const reasonMap = {
        client_ended: isTurkish ? 'Müşteri Sonlandırdı' : 'Client Ended',
        agent_ended: isTurkish ? 'Asistan Sonlandırdı' : 'Agent Ended',
        system_timeout: isTurkish ? 'Zaman Aşımı' : 'System Timeout',
        error: isTurkish ? 'Hata' : 'Error',
        completed: isTurkish ? 'Tamamlandı' : 'Completed',
      };
      return reasonMap[reason] || reason;
    };

    const rows = callLogs.map(call => [
      new Date(call.createdAt).toLocaleString(isTurkish ? 'tr-TR' : 'en-US'),
      call.callerId || (isTurkish ? 'Bilinmiyor' : 'Unknown'),
      call.duration || 0,
      translateDirection(call.direction),
      translateStatus(call.status),
      translateEndReason(call.endReason)
    ]);

    // Add BOM for Excel Turkish character support
    const BOM = '\uFEFF';
    const csv = BOM + [headers, ...rows].map(row => row.join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=aramalar-${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Export calls error:', error);
    res.status(500).json({ error: 'Failed to export calls' });
  }
});

// Get all call logs for the user's business (PHONE CALLS ONLY)
// Note: This endpoint is for phone calls only. Chat/WhatsApp logs are handled separately.
router.get('/', auditSensitiveDataAccess('call_logs_list'), async (req, res) => {
  try {
    const { businessId } = req;
    const { status, search, direction, endReason, startDate, endDate, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build where clause for CallLog (phone calls only)
    const callWhere = { businessId };
    const andConditions = [];

    if (status && status !== 'all') {
      callWhere.status = status;
    }

    // Search filter (server-side)
    if (search) {
      andConditions.push({
        OR: [
          { transcriptText: { contains: search, mode: 'insensitive' } },
          { callerId: { contains: search, mode: 'insensitive' } },
          { callId: { contains: search, mode: 'insensitive' } }
        ]
      });
    }

    // Direction filter (server-side)
    if (direction && direction !== 'all') {
      if (direction === 'inbound') {
        andConditions.push({
          OR: [{ direction: 'inbound' }, { direction: null }]
        });
      } else {
        callWhere.direction = { startsWith: direction };
      }
    }

    // End reason filter (server-side)
    if (endReason && endReason !== 'all') {
      callWhere.endReason = endReason;
    }

    // Date range filter (server-side)
    if (startDate || endDate) {
      callWhere.createdAt = {};
      if (startDate) callWhere.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        callWhere.createdAt.lte = end;
      }
    }

    // Combine AND conditions if any
    if (andConditions.length > 0) {
      callWhere.AND = andConditions;
    }

    // Fetch call logs, count, and business info in parallel
    const [callLogs, total, business] = await Promise.all([
      prisma.callLog.findMany({
        where: callWhere,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.callLog.count({ where: callWhere }),
      prisma.business.findUnique({
        where: { id: businessId },
        include: { subscription: { select: { plan: true } } }
      })
    ]);

    // Lazy load missing data for visible calls on the current page.
    // This keeps the list consistent with the detail modal, which already backfills
    // missing end reasons/costs on demand regardless of call age.
    const callsWithMissingData = callLogs
      .filter(call =>
        call.callId &&
        call.status !== 'in_progress' &&
        call.status !== 'in-progress' &&
        (!call.endReason || !call.callCost)
      )
      .sort((a, b) => {
        const aMissingEndReason = a.endReason ? 0 : 1;
        const bMissingEndReason = b.endReason ? 0 : 1;
        if (aMissingEndReason !== bMissingEndReason) {
          return bMissingEndReason - aMissingEndReason;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    // Update missing data and wait for it (limit to keep response fast)
    if (callsWithMissingData.length > 0 && business) {
      const callsToUpdate = callsWithMissingData.slice(0, 5);
      await Promise.all(
        callsToUpdate.map(async (call) => {
          try {
            const updatedData = await fetchAndProcessConversation(call.callId, business);
            if (updatedData) {
              await prisma.callLog.update({
                where: { id: call.id },
                data: updatedData
              });
              // Update in-memory for this response
              Object.assign(call, updatedData);
            }
          } catch (err) {
            console.warn(`Failed to lazy load call ${call.callId}:`, err.message);
          }
        })
      );
    }

    // Format phone call logs
    const formattedCalls = callLogs.map(call => ({
      id: call.id,
      callId: call.callId,
      phoneNumber: call.callerId,
      duration: call.duration,
      status: call.status,
      direction: call.direction || 'inbound',
      channel: 'phone',
      type: 'phone',
      createdAt: call.createdAt,
      sentiment: call.sentiment,
      summary: call.summary,
      hasRecording: !!call.recordingUrl && call.duration > 0,
      hasTranscript: !!call.transcript || !!call.transcriptText,
      endReason: call.endReason,
      callCost: call.callCost,
    }));

    res.json({
      calls: formattedCalls,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get call logs error:', error);
    res.status(500).json({ error: 'Failed to fetch call logs' });
  }
});

// Get a single call log by ID (supports both phone calls and chat/WhatsApp)
router.get('/:id', auditSensitiveDataAccess('call_log_detail', (req) => req.params.id), async (req, res) => {
  try {
    const { id } = req.params;
    const { businessId } = req;

    // Check if this is a chat log (ID starts with "chat-")
    if (id.startsWith('chat-')) {
      const chatId = id.replace('chat-', '');
      const chatLog = await prisma.chatLog.findUnique({
        where: { id: chatId }
      });

      if (!chatLog) {
        return res.status(404).json({ error: 'Chat log not found' });
      }

      if (chatLog.businessId !== businessId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Format chat messages to match transcript format
      const { transcript, transcriptText } = normalizeTranscriptBundle(
        chatLog.messages && Array.isArray(chatLog.messages)
          ? chatLog.messages.map((msg, index) => ({
              speaker: msg.role === 'user' ? 'user' : 'assistant',
              text: msg.content || '',
              timestamp: msg.timestamp || index
            }))
          : []
      );

      // Return chat log in the same format as call log
      const response = {
        id: `chat-${chatLog.id}`,
        callId: chatLog.sessionId,
        phoneNumber: chatLog.customerPhone || null,
        duration: null,
        recordingDuration: null,
        status: chatLog.status === 'active' ? 'in_progress' : 'completed',
        createdAt: chatLog.createdAt,
        updatedAt: chatLog.updatedAt,
        channel: chatLog.channel?.toLowerCase() || 'chat',
        type: chatLog.channel?.toLowerCase() || 'chat',

        // No recording for chat
        recordingUrl: null,

        // Transcript
        transcript: transcript,
        transcriptText: transcriptText,

        // Chat-specific
        messageCount: chatLog.messageCount || 0,
        summary: chatLog.summary,

        // Not applicable for chat
        sentiment: null,
        sentimentScore: null,
        keyTopics: null,
        actionItems: null,
        keyPoints: null,
        intent: null,
        taskCompleted: null,
        followUpNeeded: null,
        endReason: null,
        callCost: null,
        direction: 'inbound',
      };

      return res.json(response);
    }

    // Handle phone call logs (original logic)
    // ID can be either integer or string - try to parse if numeric
    let callLog = await prisma.callLog.findUnique({
      where: { id: isNaN(parseInt(id)) ? id : parseInt(id) },
      include: {
        business: {
          include: { subscription: { select: { plan: true } } }
        }
      }
    });

    if (!callLog) {
      return res.status(404).json({ error: 'Call log not found' });
    }

    if (callLog.businessId !== businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Lazy load: If missing endReason/callCost/summary, or summary needs translation
    const summaryNeedsTranslation = shouldTranslateSummaryToTurkish(callLog.summary, callLog.business?.language);
    const needsUpdate = callLog.callId && (!callLog.endReason || !callLog.callCost || !callLog.summary || summaryNeedsTranslation);

    if (needsUpdate) {
      try {
        console.log(`📞 Lazy loading conversation data for ${callLog.callId}...`);
        const updatedData = await fetchAndProcessConversation(callLog.callId, callLog.business);

        if (updatedData) {
          // Update database
          callLog = await prisma.callLog.update({
            where: { id: callLog.id },
            data: updatedData
          });
          console.log(`✅ Call log ${callLog.id} updated with 11Labs data`);
        }
      } catch (fetchError) {
        console.warn(`⚠️ Could not fetch 11Labs data: ${fetchError.message}`);
      }
    }

    if (summaryNeedsTranslation && callLog.summary) {
      const translatedSummary = await translateSummaryToTurkish(callLog.summary);
      if (translatedSummary !== callLog.summary) {
        callLog = await prisma.callLog.update({
          where: { id: callLog.id },
          data: { summary: translatedSummary }
        });
      }
    }

    // Return full call details including transcript, recording, and analysis
    const normalizedTranscriptBundle = Array.isArray(callLog.transcript)
      ? normalizeTranscriptBundle(callLog.transcript)
      : null;
    const normalizedTranscript = normalizedTranscriptBundle?.transcript?.length
      ? normalizedTranscriptBundle.transcript
      : null;
    const normalizedTranscriptText = normalizedTranscriptBundle?.transcriptText
      || cleanTranscriptText(callLog.transcriptText)
      || null;

    const response = {
      id: callLog.id,
      callId: callLog.callId,
      phoneNumber: callLog.callerId,
      duration: callLog.duration,
      recordingDuration: callLog.recordingDuration,
      status: callLog.status,
      createdAt: callLog.createdAt,
      updatedAt: callLog.updatedAt,
      channel: 'phone',
      type: 'phone',

      // Recording
      recordingUrl: callLog.recordingUrl,

      // Transcript
      transcript: normalizedTranscript, // JSON array of messages
      transcriptText: normalizedTranscriptText,

      // AI Analysis
      summary: callLog.summary,
      sentiment: callLog.sentiment,
      sentimentScore: callLog.sentimentScore,
      keyTopics: callLog.keyTopics,
      actionItems: callLog.actionItems,
      keyPoints: callLog.keyPoints,

      // Legacy fields
      intent: callLog.intent,
      taskCompleted: callLog.taskCompleted,
      followUpNeeded: callLog.followUpNeeded,

      // New fields
      endReason: callLog.endReason,
      callCost: callLog.callCost,
      direction: callLog.direction,
    };

    res.json(response);
  } catch (error) {
    console.error('Get call log error:', error);
    res.status(500).json({ error: 'Failed to fetch call log' });
  }
});

// Create a new call log
router.post('/', async (req, res) => {
  try {
    const { callId, businessId, duration, status, transcript, recordingUrl, metadata } = req.body;

    // Verify user has access to this business
    if (businessId !== req.businessId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const callLog = await prisma.callLog.create({
      data: {
        callId,
        businessId,
        duration,
        status,
        transcript,
        recordingUrl,
        metadata
      }
    });

    res.status(201).json(callLog);
  } catch (error) {
    console.error('Create call log error:', error);
    res.status(500).json({ error: 'Failed to create call log' });
  }
});

// Get call recording audio (proxy from 11Labs)
// Auth is cookie/Bearer token only (no query token support)
router.get('/:id/audio', auditSensitiveDataAccess('call_log_audio', (req) => req.params.id), async (req, res) => {
  try {
    const { businessId } = req;
    const { id } = req.params;

    // Find call log - ID can be integer or string
    const callLog = await prisma.callLog.findUnique({
      where: { id: isNaN(parseInt(id)) ? id : parseInt(id) }
    });

    if (!callLog || callLog.businessId !== businessId) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Get conversation ID from callId (which is the conversation_id from 11Labs)
    const conversationId = callLog.callId;
    console.log(`🎵 Audio request for call ${id}, conversationId: ${conversationId}, duration: ${callLog.duration}s`);

    if (!conversationId) {
      console.log(`❌ No conversationId for call ${id}`);
      return res.status(404).json({ error: 'No recording available - missing conversation ID' });
    }

    // Fetch audio from 11Labs
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenLabsApiKey) {
      return res.status(500).json({ error: 'Audio service not configured' });
    }

    // First check if audio is available by fetching conversation metadata
    try {
      const conversationResponse = await axios.get(
        `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
        { headers: { 'xi-api-key': elevenLabsApiKey } }
      );

      const convData = conversationResponse.data;
      console.log(`🎵 Conversation metadata: status=${convData.status}, has_audio=${!!convData.has_audio}`);

      // 11Labs may indicate audio unavailable in metadata
      if (convData.has_audio === false) {
        console.log(`❌ Audio not available for conversation ${conversationId}`);
        return res.status(404).json({ error: 'Audio recording not available for this call' });
      }
    } catch (metaError) {
      console.warn(`⚠️ Could not fetch conversation metadata: ${metaError.message}`);
      // Continue anyway - try to fetch audio directly
    }

    const audioUrl = `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}/audio`;
    console.log(`🎵 Fetching audio from 11Labs: ${audioUrl}`);

    // Fetch full audio file to buffer for seek support
    const audioResponse = await axios.get(audioUrl, {
      headers: { 'xi-api-key': elevenLabsApiKey },
      responseType: 'arraybuffer'
    });

    const audioBuffer = Buffer.from(audioResponse.data);
    const contentType = audioResponse.headers['content-type'] || 'audio/mpeg';
    const totalLength = audioBuffer.length;

    console.log(`🎵 Audio fetched: ${totalLength} bytes, type: ${contentType}`);

    // Handle Range requests for seeking
    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalLength - 1;
      const chunkSize = end - start + 1;

      console.log(`🎵 Range request: ${start}-${end}/${totalLength}`);

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalLength}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', chunkSize);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="call-${id}.mp3"`);
      res.end(audioBuffer.slice(start, end + 1));
    } else {
      // Full file request
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', totalLength);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Disposition', `inline; filename="call-${id}.mp3"`);
      res.end(audioBuffer);
    }
  } catch (error) {
    console.error('Get call audio error:', error.message, error.response?.status);
    if (error.response?.status === 404) {
      // Provide more helpful error message
      return res.status(404).json({
        error: 'Ses kaydı bulunamadı. Kayıt özelliği etkinleştirilmemiş olabilir.'
      });
    }
    if (error.response?.status === 401 || error.response?.status === 403) {
      return res.status(403).json({ error: 'Audio access denied' });
    }
    res.status(500).json({ error: 'Failed to fetch recording' });
  }
});

// Get call statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const { businessId } = req;

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const totalCalls = await prisma.callLog.count({
      where: { businessId }
    });

    const monthCalls = await prisma.callLog.count({
      where: {
        businessId,
        createdAt: {
          gte: firstDayOfMonth
        }
      }
    });

    const completedCalls = await prisma.callLog.count({
      where: {
        businessId,
        status: 'COMPLETED'
      }
    });

    const totalDuration = await prisma.callLog.aggregate({
      where: { businessId },
      _sum: {
        duration: true
      }
    });

    res.json({
      totalCalls,
      monthCalls,
      completedCalls,
      totalDuration: totalDuration._sum.duration || 0,
      averageDuration: totalCalls > 0 ? Math.round((totalDuration._sum.duration || 0) / totalCalls) : 0
    });
  } catch (error) {
    console.error('Get call stats error:', error);
    res.status(500).json({ error: 'Failed to fetch call statistics' });
  }
});

export default router;
