import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissions.js';
import SikayetvarService from '../services/integrations/complaints/sikayetvar.service.js';
import {
  buildSikayetvarCredentials,
  COMPLAINT_PLATFORM,
  COMPLAINT_THREAD_STATUS,
  DEFAULT_SIKAYETVAR_SETTINGS,
  normalizeSikayetvarSettings,
  truncateComplaintReply,
} from '../services/complaints/sikayetvarShared.js';

const router = express.Router();
const DEFAULT_PAGE_SIZE = 20;

router.use(authenticateToken);

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function buildComplaintFilters(query = {}) {
  const where = {};

  if (query.platform && query.platform !== 'ALL') {
    where.platform = String(query.platform).toUpperCase();
  }

  if (query.status && query.status !== 'ALL') {
    const statuses = String(query.status)
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);

    if (statuses.length === 1) {
      where.status = statuses[0];
    } else if (statuses.length > 1) {
      where.status = { in: statuses };
    }
  }

  if (query.search) {
    const search = String(query.search).trim();
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { complaintText: { contains: search, mode: 'insensitive' } },
      { generatedReply: { contains: search, mode: 'insensitive' } },
      { finalReply: { contains: search, mode: 'insensitive' } },
      { customerName: { contains: search, mode: 'insensitive' } },
    ];
  }

  const createdAt = {};
  if (query.fromDate) {
    const fromDate = new Date(`${query.fromDate}T00:00:00.000Z`);
    if (!Number.isNaN(fromDate.getTime())) {
      createdAt.gte = fromDate;
    }
  }

  if (query.toDate) {
    const toDate = new Date(`${query.toDate}T23:59:59.999Z`);
    if (!Number.isNaN(toDate.getTime())) {
      createdAt.lte = toDate;
    }
  }

  if (createdAt.gte || createdAt.lte) {
    where.createdAt = createdAt;
  }

  return where;
}

async function getComplaintOrThrow(id, businessId) {
  const item = await prisma.complaintThread.findFirst({
    where: {
      id,
      businessId,
    },
  });

  if (!item) {
    const error = new Error('Şikayet kaydı bulunamadı');
    error.status = 404;
    throw error;
  }

  return item;
}

async function getComplaintIntegration(platform, businessId) {
  const integration = await prisma.integration.findFirst({
    where: {
      businessId,
      type: platform,
      connected: true,
      isActive: true,
    },
  });

  if (!integration) {
    const error = new Error(`${platform} entegrasyonu aktif değil`);
    error.status = 400;
    throw error;
  }

  return integration;
}

async function approveComplaint(item, answerText) {
  await getComplaintIntegration(item.platform, item.businessId);

  const service = new SikayetvarService();
  const postResult = await service.postAnswer(item.businessId, item.externalId, answerText);
  const updated = await prisma.complaintThread.update({
    where: { id: item.id },
    data: {
      status: COMPLAINT_THREAD_STATUS.POSTED,
      finalReply: answerText,
      externalAnswerId: postResult.complaintAnswerId || item.externalAnswerId,
      postedAt: new Date(),
      answeredAt: new Date(),
      errorMessage: null,
      platformStatus: 'ANSWERED',
    },
  });

  return { updated, postResult };
}

router.get('/threads', checkPermission('campaigns:view'), async (req, res) => {
  try {
    const page = toPositiveInteger(req.query.page, 1);
    const limit = Math.min(toPositiveInteger(req.query.limit, DEFAULT_PAGE_SIZE), 100);
    const where = {
      businessId: req.businessId,
      ...buildComplaintFilters(req.query),
    };

    const [items, total] = await Promise.all([
      prisma.complaintThread.findMany({
        where,
        orderBy: [
          { sourceCreatedAt: 'desc' },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.complaintThread.count({ where }),
    ]);

    res.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error('Complaints list error:', error);
    res.status(500).json({ error: 'Şikayet listesi getirilemedi' });
  }
});

router.get('/threads/:id', checkPermission('campaigns:view'), async (req, res) => {
  try {
    const item = await getComplaintOrThrow(
      Number.parseInt(req.params.id, 10),
      req.businessId
    );

    res.json(item);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message || 'Şikayet detayı getirilemedi' });
  }
});

router.post('/threads/:id/approve', checkPermission('campaigns:control'), async (req, res) => {
  try {
    const item = await getComplaintOrThrow(
      Number.parseInt(req.params.id, 10),
      req.businessId
    );

    if ([COMPLAINT_THREAD_STATUS.POSTED, COMPLAINT_THREAD_STATUS.CLOSED].includes(item.status)) {
      return res.status(400).json({ error: 'Bu şikayet için onay işlemi yapılamaz' });
    }

    const answerText = truncateComplaintReply(
      req.body?.answerText || item.finalReply || item.generatedReply,
      5000
    );

    if (answerText.length < 10) {
      return res.status(400).json({ error: 'Gönderilecek cevap en az 10 karakter olmalı' });
    }

    const { updated, postResult } = await approveComplaint(item, answerText);

    res.json({
      success: true,
      item: updated,
      postResult,
    });
  } catch (error) {
    console.error('Complaint approve error:', error);
    const status = error.status || 500;
    const threadId = Number.parseInt(req.params.id, 10);

    if (Number.isFinite(threadId)) {
      await prisma.complaintThread.updateMany({
        where: { id: threadId, businessId: req.businessId },
        data: {
          status: COMPLAINT_THREAD_STATUS.ERROR,
          errorMessage: String(error.message || 'Cevap gönderimi başarısız').slice(0, 4000),
        },
      });
    }

    res.status(status).json({ error: error.message || 'Cevap platforma gönderilemedi' });
  }
});

router.post('/threads/:id/edit', checkPermission('campaigns:control'), async (req, res) => {
  try {
    const item = await getComplaintOrThrow(
      Number.parseInt(req.params.id, 10),
      req.businessId
    );

    const answerText = truncateComplaintReply(req.body?.answerText, 5000);
    if (answerText.length < 10) {
      return res.status(400).json({ error: 'Düzenlenmiş cevap en az 10 karakter olmalı' });
    }

    await prisma.complaintThread.update({
      where: { id: item.id },
      data: {
        finalReply: answerText,
        status: COMPLAINT_THREAD_STATUS.APPROVED,
        errorMessage: null,
      },
    });

    const refreshed = await getComplaintOrThrow(item.id, req.businessId);
    const { updated, postResult } = await approveComplaint(refreshed, answerText);

    res.json({
      success: true,
      item: updated,
      postResult,
    });
  } catch (error) {
    console.error('Complaint edit error:', error);
    const status = error.status || 500;
    res.status(status).json({ error: error.message || 'Düzenlenmiş cevap gönderilemedi' });
  }
});

router.post('/threads/:id/reject', checkPermission('campaigns:control'), async (req, res) => {
  try {
    const item = await getComplaintOrThrow(
      Number.parseInt(req.params.id, 10),
      req.businessId
    );

    if (item.status === COMPLAINT_THREAD_STATUS.POSTED) {
      return res.status(400).json({ error: 'Gönderilmiş şikayet cevabı reddedilemez' });
    }

    const rejectionReason = String(req.body?.rejectionReason || '').trim().slice(0, 1000);
    if (!rejectionReason) {
      return res.status(400).json({ error: 'Reddetme nedeni gerekli' });
    }

    const updated = await prisma.complaintThread.update({
      where: { id: item.id },
      data: {
        status: COMPLAINT_THREAD_STATUS.REJECTED,
        errorMessage: rejectionReason,
      },
    });

    res.json({ success: true, item: updated });
  } catch (error) {
    console.error('Complaint reject error:', error);
    const status = error.status || 500;
    res.status(status).json({ error: error.message || 'Şikayet reddedilemedi' });
  }
});

router.get('/stats', checkPermission('campaigns:view'), async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const where = { businessId: req.businessId };
    const [total, pending, posted, rejected, todayTotal] = await Promise.all([
      prisma.complaintThread.count({ where }),
      prisma.complaintThread.count({
        where: { ...where, status: { in: [COMPLAINT_THREAD_STATUS.PENDING, COMPLAINT_THREAD_STATUS.APPROVED] } },
      }),
      prisma.complaintThread.count({ where: { ...where, status: COMPLAINT_THREAD_STATUS.POSTED } }),
      prisma.complaintThread.count({ where: { ...where, status: COMPLAINT_THREAD_STATUS.REJECTED } }),
      prisma.complaintThread.count({ where: { ...where, createdAt: { gte: startOfDay } } }),
    ]);

    res.json({
      total,
      pending,
      posted,
      rejected,
      todayTotal,
    });
  } catch (error) {
    console.error('Complaint stats error:', error);
    res.status(500).json({ error: 'Şikayet istatistikleri alınamadı' });
  }
});

router.get('/settings', checkPermission('campaigns:view'), async (req, res) => {
  try {
    const integration = await prisma.integration.findFirst({
      where: {
        businessId: req.businessId,
        type: COMPLAINT_PLATFORM.SIKAYETVAR,
      },
      select: {
        credentials: true,
        connected: true,
        isActive: true,
      },
    });

    const credentials = buildSikayetvarCredentials(integration?.credentials || {});
    res.json({
      settings: [{
        platform: COMPLAINT_PLATFORM.SIKAYETVAR,
        connected: Boolean(integration?.connected && integration?.isActive),
        complaintSettings: credentials.complaintSettings || DEFAULT_SIKAYETVAR_SETTINGS,
      }],
    });
  } catch (error) {
    console.error('Complaint settings error:', error);
    res.status(500).json({ error: 'Şikayet ayarları getirilemedi' });
  }
});

router.put('/settings', checkPermission('campaigns:control'), async (req, res) => {
  try {
    const platform = String(req.body?.platform || '').toUpperCase();
    if (platform !== COMPLAINT_PLATFORM.SIKAYETVAR) {
      return res.status(400).json({ error: 'Desteklenmeyen şikayet platformu' });
    }

    const integration = await prisma.integration.findFirst({
      where: {
        businessId: req.businessId,
        type: platform,
      },
    });

    if (!integration) {
      return res.status(404).json({ error: 'Şikayetvar entegrasyonu bulunamadı' });
    }

    const business = await prisma.business.findUnique({
      where: { id: req.businessId },
      select: { language: true },
    });

    const existingCredentials = buildSikayetvarCredentials(integration.credentials, business?.language || 'tr');
    const complaintSettings = normalizeSikayetvarSettings(
      req.body?.complaintSettings,
      business?.language || existingCredentials.complaintSettings?.language || 'tr'
    );

    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        credentials: {
          ...integration.credentials,
          complaintSettings,
        },
      },
    });

    res.json({
      success: true,
      platform,
      complaintSettings,
    });
  } catch (error) {
    console.error('Complaint settings update error:', error);
    res.status(500).json({ error: 'Şikayet ayarları güncellenemedi' });
  }
});

export default router;
