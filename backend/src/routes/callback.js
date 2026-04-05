/**
 * Callback (Geri Arama) Routes
 *
 * Asistan müşteriye yardımcı olamadığında veya müşteri gerçek biriyle
 * görüşmek istediğinde geri arama kaydı oluşturulur.
 */

import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken, verifyBusinessAccess } from '../middleware/auth.js';

const router = express.Router();
const PHONE_PLACEHOLDER_VALUES = new Set(['none', 'null', 'undefined', 'unknown', 'bilinmiyor', 'n/a', 'na', '-']);

// ============================================================================
// PUBLIC ENDPOINT - Asistan tool'undan çağrılır
// SECURITY: Rate limited to prevent callback queue spam
// ============================================================================

// Rate limit: max 10 callback creates per minute per IP
const _callbackRateMap = new Map();
const CB_RATE_LIMIT = 10;
const CB_RATE_WINDOW_MS = 60_000;

function callbackRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = _callbackRateMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > CB_RATE_WINDOW_MS) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count++;
  _callbackRateMap.set(ip, entry);
  if (entry.count > CB_RATE_LIMIT) {
    console.warn(`🚫 [Callback] Rate limit exceeded for ${ip}`);
    return res.status(429).json({ error: 'Çok fazla istek. Lütfen bekleyin.' });
  }
  next();
}

function hasMeaningfulPhone(value) {
  if (value === undefined || value === null) return false;
  const raw = String(value).trim();
  if (!raw) return false;
  if (PHONE_PLACEHOLDER_VALUES.has(raw.toLowerCase())) return false;
  return raw.replace(/\D/g, '').length >= 10;
}

async function hydrateCallbackPhones(callbacks, businessId) {
  const rows = Array.isArray(callbacks) ? callbacks : [callbacks].filter(Boolean);
  if (rows.length === 0) return Array.isArray(callbacks) ? [] : null;

  const missingPhoneRows = rows.filter((callback) => !hasMeaningfulPhone(callback?.customerPhone) && callback?.callId);
  if (missingPhoneRows.length === 0) {
    return Array.isArray(callbacks) ? rows : rows[0];
  }

  const mappings = await prisma.sessionMapping.findMany({
    where: {
      businessId,
      channel: 'WHATSAPP',
      sessionId: { in: missingPhoneRows.map((callback) => callback.callId) }
    },
    select: {
      sessionId: true,
      channelUserId: true
    }
  });

  const phoneBySessionId = new Map(
    mappings
      .filter((entry) => entry?.sessionId && hasMeaningfulPhone(entry.channelUserId))
      .map((entry) => [entry.sessionId, String(entry.channelUserId).trim()])
  );

  await Promise.all(
    missingPhoneRows.map((callback) => {
      const customerPhone = phoneBySessionId.get(callback.callId);
      if (!customerPhone) return Promise.resolve();

      return prisma.callbackRequest.update({
        where: { id: callback.id },
        data: { customerPhone }
      }).catch(() => null);
    })
  );

  const hydratedRows = rows.map((callback) => ({
    ...callback,
    customerPhone: hasMeaningfulPhone(callback.customerPhone)
      ? callback.customerPhone
      : (phoneBySessionId.get(callback.callId) || callback.customerPhone || null)
  }));

  return Array.isArray(callbacks) ? hydratedRows : hydratedRows[0];
}

/**
 * POST /api/callbacks/create
 * Yeni callback oluştur (asistan tool'undan çağrılır)
 * NOT: Bu endpoint public'tir, assistantId ile yetkilendirme yapılır
 */
router.post('/create', callbackRateLimit, async (req, res) => {
  try {
    const {
      assistantId,
      customerName,
      customerPhone,
      topic,
      priority = 'NORMAL',
      callId
    } = req.body;

    // Validasyon
    if (!assistantId || !customerName || !customerPhone || !topic) {
      return res.status(400).json({
        error: 'assistantId, customerName, customerPhone ve topic zorunludur'
      });
    }

    // Assistant'tan businessId al
    const assistant = await prisma.assistant.findUnique({
      where: { id: assistantId },
      select: { businessId: true, name: true }
    });

    if (!assistant) {
      return res.status(404).json({ error: 'Asistan bulunamadı' });
    }

    // Priority validasyonu
    const validPriorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
    const finalPriority = validPriorities.includes(priority) ? priority : 'NORMAL';

    // Callback oluştur
    const callback = await prisma.callbackRequest.create({
      data: {
        businessId: assistant.businessId,
        assistantId,
        callId,
        customerName,
        customerPhone,
        topic,
        priority: finalPriority
      }
    });

    console.log(`✅ Callback created: ${callback.id} by assistant ${assistant.name}`);

    // TODO: İşletmeye bildirim gönder (email/push notification)
    // Bu bir sonraki iterasyonda eklenecek

    res.json({
      success: true,
      message: 'Geri arama kaydı oluşturuldu',
      callbackId: callback.id
    });
  } catch (error) {
    console.error('❌ Error creating callback:', error);
    res.status(500).json({ error: 'Callback oluşturulamadı' });
  }
});

// ============================================================================
// PROTECTED ENDPOINTS - Dashboard için
// ============================================================================

router.use(authenticateToken);
router.use(verifyBusinessAccess);

/**
 * GET /api/callbacks
 * Callback listesi (dashboard için)
 */
router.get('/', async (req, res) => {
  try {
    const { businessId } = req.user;
    const { status, priority, limit = 50, offset = 0 } = req.query;

    const where = { businessId };

    // Filtreler
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const callbacks = await prisma.callbackRequest.findMany({
      where,
      include: {
        assistant: { select: { name: true } }
      },
      orderBy: [
        { status: 'asc' },      // PENDING önce
        { priority: 'desc' },   // URGENT önce
        { requestedAt: 'desc' }
      ],
      take: parseInt(limit),
      skip: parseInt(offset)
    });

    res.json(await hydrateCallbackPhones(callbacks, businessId));
  } catch (error) {
    console.error('❌ Error fetching callbacks:', error);
    res.status(500).json({ error: 'Callback listesi alınamadı' });
  }
});

/**
 * GET /api/callbacks/stats
 * Callback istatistikleri
 */
router.get('/stats', async (req, res) => {
  try {
    const { businessId } = req.user;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [pending, inProgress, completed, noAnswer, today, urgent] = await Promise.all([
      prisma.callbackRequest.count({
        where: { businessId, status: 'PENDING' }
      }),
      prisma.callbackRequest.count({
        where: { businessId, status: 'IN_PROGRESS' }
      }),
      prisma.callbackRequest.count({
        where: { businessId, status: 'COMPLETED' }
      }),
      prisma.callbackRequest.count({
        where: { businessId, status: 'NO_ANSWER' }
      }),
      prisma.callbackRequest.count({
        where: {
          businessId,
          requestedAt: { gte: todayStart }
        }
      }),
      prisma.callbackRequest.count({
        where: {
          businessId,
          priority: 'URGENT',
          status: { in: ['PENDING', 'IN_PROGRESS'] }
        }
      })
    ]);

    res.json({
      pending,
      inProgress,
      completed,
      noAnswer,
      today,
      urgent,
      total: pending + inProgress + completed + noAnswer
    });
  } catch (error) {
    console.error('❌ Error fetching callback stats:', error);
    res.status(500).json({ error: 'İstatistikler alınamadı' });
  }
});

/**
 * GET /api/callbacks/:id
 * Tek callback detayı
 */
router.get('/:id', async (req, res) => {
  try {
    const { businessId } = req.user;
    const { id } = req.params;

    let callback = await prisma.callbackRequest.findFirst({
      where: { id, businessId },
      include: {
        assistant: { select: { name: true } }
      }
    });

    if (!callback) {
      return res.status(404).json({ error: 'Callback bulunamadı' });
    }

    callback = await hydrateCallbackPhones(callback, businessId);

    // Fetch linked chat transcript if callId exists
    // callId = ChatLog.sessionId (set by create_callback tool handler)
    let chatTranscript = null;
    let linkStatus = callback.callId ? 'NOT_FOUND' : 'NO_LINK';

    if (callback.callId) {
      try {
        const chatLog = await prisma.chatLog.findUnique({
          where: { sessionId: callback.callId },
          select: {
            id: true,
            sessionId: true,
            channel: true,
            createdAt: true,
            messages: true // Json field, not a relation
          }
        });
        if (chatLog) {
          // messages is a Json column (array of {role, content, ...})
          // Limit to last 50 entries for performance
          const allMessages = Array.isArray(chatLog.messages) ? chatLog.messages : [];
          chatTranscript = {
            ...chatLog,
            messages: allMessages.slice(-50)
          };
          linkStatus = 'FOUND';
        }
      } catch (chatErr) {
        console.warn(`⚠️ Error fetching linked chat for callback ${id}:`, chatErr.message);
      }
    }

    res.json({ ...callback, chatTranscript, linkStatus });
  } catch (error) {
    console.error('❌ Error fetching callback:', error);
    res.status(500).json({ error: 'Callback alınamadı' });
  }
});

/**
 * PATCH /api/callbacks/:id
 * Callback durumu güncelle
 */
router.patch('/:id', async (req, res) => {
  try {
    const { businessId } = req.user;
    const { id } = req.params;
    const { status, notes, callbackNotes, scheduledFor, priority } = req.body;

    // Kullanıcının callback'i olduğunu doğrula
    const existing = await prisma.callbackRequest.findFirst({
      where: { id, businessId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Callback bulunamadı' });
    }

    const updateData = {};

    // Status güncelleme
    if (status) {
      const validStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'NO_ANSWER', 'CANCELLED'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Geçersiz status değeri' });
      }
      updateData.status = status;

      // Tamamlandıysa completedAt ayarla
      if (status === 'COMPLETED') {
        updateData.completedAt = new Date();
      }
    }

    // Priority güncelleme
    if (priority) {
      const validPriorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
      if (!validPriorities.includes(priority)) {
        return res.status(400).json({ error: 'Geçersiz priority değeri' });
      }
      updateData.priority = priority;
    }

    // Notlar
    if (notes !== undefined) updateData.notes = notes;
    if (callbackNotes !== undefined) updateData.callbackNotes = callbackNotes;

    // Planlanma zamanı
    if (scheduledFor !== undefined) {
      updateData.scheduledFor = scheduledFor ? new Date(scheduledFor) : null;
    }

    const callback = await prisma.callbackRequest.update({
      where: { id },
      data: updateData,
      include: {
        assistant: { select: { name: true } }
      }
    });

    res.json(callback);
  } catch (error) {
    console.error('❌ Error updating callback:', error);
    res.status(500).json({ error: 'Callback güncellenemedi' });
  }
});

/**
 * DELETE /api/callbacks/:id
 * Callback sil
 */
router.delete('/:id', async (req, res) => {
  try {
    const { businessId } = req.user;
    const { id } = req.params;

    // Kullanıcının callback'i olduğunu doğrula
    const existing = await prisma.callbackRequest.findFirst({
      where: { id, businessId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Callback bulunamadı' });
    }

    await prisma.callbackRequest.delete({
      where: { id }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error deleting callback:', error);
    res.status(500).json({ error: 'Callback silinemedi' });
  }
});

/**
 * POST /api/callbacks/:id/retry
 * Cevap vermeyen callback'i tekrar kuyruğa al
 */
router.post('/:id/retry', async (req, res) => {
  try {
    const { businessId } = req.user;
    const { id } = req.params;

    const existing = await prisma.callbackRequest.findFirst({
      where: { id, businessId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Callback bulunamadı' });
    }

    if (existing.status !== 'NO_ANSWER') {
      return res.status(400).json({ error: 'Sadece cevapsız callback tekrar denenebilir' });
    }

    const callback = await prisma.callbackRequest.update({
      where: { id },
      data: {
        status: 'PENDING',
        completedAt: null
      }
    });

    res.json(callback);
  } catch (error) {
    console.error('❌ Error retrying callback:', error);
    res.status(500).json({ error: 'Callback tekrar denenemedi' });
  }
});

export default router;
