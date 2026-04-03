import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissions.js';
import { getMarketplaceServiceForPlatform } from '../services/marketplace/platformClients.js';
import {
  MARKETPLACE_QUESTION_STATUS,
  DEFAULT_QA_SETTINGS,
  MARKETPLACE_PLATFORM,
  buildMarketplaceCredentials,
  normalizeQaSettings,
  truncateMarketplaceAnswer,
} from '../services/marketplace/qaShared.js';

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

function buildQuestionFilters(query = {}) {
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
      { questionText: { contains: search, mode: 'insensitive' } },
      { productName: { contains: search, mode: 'insensitive' } },
      { generatedAnswer: { contains: search, mode: 'insensitive' } },
      { finalAnswer: { contains: search, mode: 'insensitive' } },
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

async function getMarketplaceQuestionOrThrow(id, businessId) {
  const question = await prisma.marketplaceQuestion.findFirst({
    where: {
      id,
      businessId,
    },
  });

  if (!question) {
    const error = new Error('Soru bulunamadi');
    error.status = 404;
    throw error;
  }

  return question;
}

async function getPlatformIntegration(platform, businessId) {
  const integration = await prisma.integration.findFirst({
    where: {
      businessId,
      type: platform,
      connected: true,
      isActive: true,
    },
  });

  if (!integration) {
    const error = new Error(`${platform} entegrasyonu aktif degil`);
    error.status = 400;
    throw error;
  }

  return integration;
}

async function postMarketplaceAnswer(question, answerText) {
  const service = getMarketplaceServiceForPlatform(question.platform);
  return service.postAnswer(question.businessId, question.externalId, answerText);
}

async function approveMarketplaceQuestion(question, answerText) {
  await getPlatformIntegration(question.platform, question.businessId);

  const postResult = await postMarketplaceAnswer(question, answerText);
  const updated = await prisma.marketplaceQuestion.update({
    where: { id: question.id },
    data: {
      status: MARKETPLACE_QUESTION_STATUS.POSTED,
      finalAnswer: answerText,
      postedAt: new Date(),
      answeredAt: new Date(),
      errorMessage: null,
      platformStatus: question.platform === MARKETPLACE_PLATFORM.HEPSIBURADA
        ? 'Answered'
        : 'ANSWERED',
    },
  });

  return { updated, postResult };
}

router.get('/questions', checkPermission('campaigns:view'), async (req, res) => {
  try {
    const page = toPositiveInteger(req.query.page, 1);
    const limit = Math.min(toPositiveInteger(req.query.limit, DEFAULT_PAGE_SIZE), 100);
    const where = {
      businessId: req.businessId,
      ...buildQuestionFilters(req.query),
    };

    const [items, total] = await Promise.all([
      prisma.marketplaceQuestion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.marketplaceQuestion.count({ where }),
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
    console.error('Marketplace questions list error:', error);
    res.status(500).json({ error: 'Pazaryeri sorulari getirilemedi' });
  }
});

router.get('/questions/:id', checkPermission('campaigns:view'), async (req, res) => {
  try {
    const question = await getMarketplaceQuestionOrThrow(
      Number.parseInt(req.params.id, 10),
      req.businessId
    );

    res.json(question);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message || 'Soru detayi getirilemedi' });
  }
});

router.post('/questions/:id/approve', checkPermission('campaigns:control'), async (req, res) => {
  try {
    const question = await getMarketplaceQuestionOrThrow(
      Number.parseInt(req.params.id, 10),
      req.businessId
    );

    if ([MARKETPLACE_QUESTION_STATUS.POSTED, MARKETPLACE_QUESTION_STATUS.EXPIRED].includes(question.status)) {
      return res.status(400).json({ error: 'Bu soru icin onay islemi yapilamaz' });
    }

    await getPlatformIntegration(question.platform, req.businessId);

    const answerText = truncateMarketplaceAnswer(
      req.body?.answerText || question.finalAnswer || question.generatedAnswer,
      2000
    );

    if (answerText.length < 10) {
      return res.status(400).json({ error: 'Gonderilecek cevap en az 10 karakter olmali' });
    }

    const { updated, postResult } = await approveMarketplaceQuestion(question, answerText);

    res.json({
      success: true,
      item: updated,
      postResult,
    });
  } catch (error) {
    console.error('Marketplace approve error:', error);
    const status = error.status || 500;
    const nextStatus = String(error.message || '').toLowerCase().includes('expire')
      ? MARKETPLACE_QUESTION_STATUS.EXPIRED
      : MARKETPLACE_QUESTION_STATUS.ERROR;

    const questionId = Number.parseInt(req.params.id, 10);
    if (Number.isFinite(questionId)) {
      await prisma.marketplaceQuestion.updateMany({
        where: { id: questionId, businessId: req.businessId },
        data: {
          status: nextStatus,
          errorMessage: String(error.message || 'Cevap gonderimi basarisiz').slice(0, 2000),
        },
      });
    }

    res.status(status).json({ error: error.message || 'Cevap platforma gonderilemedi' });
  }
});

router.post('/questions/:id/edit', checkPermission('campaigns:control'), async (req, res) => {
  try {
    const question = await getMarketplaceQuestionOrThrow(
      Number.parseInt(req.params.id, 10),
      req.businessId
    );

    const answerText = truncateMarketplaceAnswer(req.body?.answerText, 2000);
    if (answerText.length < 10) {
      return res.status(400).json({ error: 'Duzenlenmis cevap en az 10 karakter olmali' });
    }

    await prisma.marketplaceQuestion.update({
      where: { id: question.id },
      data: {
        finalAnswer: answerText,
        status: MARKETPLACE_QUESTION_STATUS.APPROVED,
        errorMessage: null,
      },
    });

    const { updated, postResult } = await approveMarketplaceQuestion(question, answerText);
    return res.json({
      success: true,
      item: updated,
      postResult,
    });
  } catch (error) {
    const status = error.status || 500;
    const questionId = Number.parseInt(req.params.id, 10);
    if (Number.isFinite(questionId)) {
      await prisma.marketplaceQuestion.updateMany({
        where: { id: questionId, businessId: req.businessId },
        data: {
          status: MARKETPLACE_QUESTION_STATUS.ERROR,
          errorMessage: String(error.message || 'Duzenlenen cevap gonderilemedi').slice(0, 2000),
        },
      });
    }
    res.status(status).json({ error: error.message || 'Duzenleme kaydedilemedi' });
  }
});

router.post('/questions/:id/reject', checkPermission('campaigns:control'), async (req, res) => {
  try {
    const question = await getMarketplaceQuestionOrThrow(
      Number.parseInt(req.params.id, 10),
      req.businessId
    );

    const rejectionReason = String(req.body?.rejectionReason || '').trim()
      || 'Soru su an icin yanitlanmaya uygun gorulmedi.';

    if (question.platform === MARKETPLACE_PLATFORM.HEPSIBURADA) {
      try {
        const service = getMarketplaceServiceForPlatform(question.platform);
        await service.reportIssue(question.businessId, question.externalId, rejectionReason);
      } catch (error) {
        console.warn('Hepsiburada reject/report failed, keeping local reject:', error.message);
      }
    }

    const updated = await prisma.marketplaceQuestion.update({
      where: { id: question.id },
      data: {
        status: MARKETPLACE_QUESTION_STATUS.REJECTED,
        rejectionReason,
        errorMessage: null,
      },
    });

    res.json({ success: true, item: updated });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message || 'Soru reddedilemedi' });
  }
});

router.get('/stats', checkPermission('campaigns:view'), async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const baseWhere = { businessId: req.businessId };
    const todayWhere = { ...baseWhere, createdAt: { gte: startOfDay } };

    const [
      totalQuestions,
      todayQuestions,
      pendingQuestions,
      rejectedQuestions,
      autoPostedQuestions,
      postedQuestions,
      platformBreakdown,
    ] = await Promise.all([
      prisma.marketplaceQuestion.count({ where: baseWhere }),
      prisma.marketplaceQuestion.count({ where: todayWhere }),
      prisma.marketplaceQuestion.count({
        where: {
          ...baseWhere,
          status: MARKETPLACE_QUESTION_STATUS.PENDING,
        },
      }),
      prisma.marketplaceQuestion.count({
        where: {
          ...baseWhere,
          status: MARKETPLACE_QUESTION_STATUS.REJECTED,
        },
      }),
      prisma.marketplaceQuestion.count({
        where: {
          ...todayWhere,
          answerMode: 'AUTO',
          status: MARKETPLACE_QUESTION_STATUS.POSTED,
        },
      }),
      prisma.marketplaceQuestion.count({
        where: {
          ...todayWhere,
          status: MARKETPLACE_QUESTION_STATUS.POSTED,
        },
      }),
      prisma.marketplaceQuestion.groupBy({
        by: ['platform'],
        where: baseWhere,
        _count: true,
      }),
    ]);

    res.json({
      totalQuestions,
      todayQuestions,
      pendingQuestions,
      rejectedQuestions,
      autoPostedQuestions,
      postedQuestions,
      platformBreakdown,
    });
  } catch (error) {
    console.error('Marketplace stats error:', error);
    res.status(500).json({ error: 'Pazaryeri istatistikleri getirilemedi' });
  }
});

router.get('/settings', checkPermission('campaigns:view'), async (req, res) => {
  try {
    const integrations = await prisma.integration.findMany({
      where: {
        businessId: req.businessId,
        type: { in: [MARKETPLACE_PLATFORM.TRENDYOL, MARKETPLACE_PLATFORM.HEPSIBURADA] },
      },
      select: {
        type: true,
        connected: true,
        isActive: true,
        lastSync: true,
        credentials: true,
      },
      orderBy: { type: 'asc' },
    });

    const settings = integrations.map((integration) => {
      const credentials = buildMarketplaceCredentials(integration.credentials);
      return {
        platform: integration.type,
        connected: Boolean(integration.connected && integration.isActive),
        lastSync: integration.lastSync,
        qaSettings: credentials.qaSettings || DEFAULT_QA_SETTINGS,
      };
    });

    res.json({ settings });
  } catch (error) {
    console.error('Marketplace settings error:', error);
    res.status(500).json({ error: 'Pazaryeri ayarlari getirilemedi' });
  }
});

router.put('/settings', checkPermission('campaigns:control'), async (req, res) => {
  try {
    const platform = String(req.body?.platform || '').trim().toUpperCase();
    if (![MARKETPLACE_PLATFORM.TRENDYOL, MARKETPLACE_PLATFORM.HEPSIBURADA].includes(platform)) {
      return res.status(400).json({ error: 'Gecerli bir platform secilmelidir' });
    }

    const integration = await getPlatformIntegration(platform, req.businessId);
    const existingCredentials = buildMarketplaceCredentials(integration.credentials);
    const qaSettings = normalizeQaSettings(
      req.body?.qaSettings || req.body,
      existingCredentials.qaSettings?.language
    );

    const updated = await prisma.integration.update({
      where: {
        businessId_type: {
          businessId: req.businessId,
          type: platform,
        },
      },
      data: {
        credentials: {
          ...existingCredentials,
          qaSettings,
        },
      },
      select: {
        type: true,
        lastSync: true,
        connected: true,
        isActive: true,
        credentials: true,
      },
    });

    res.json({
      success: true,
      settings: {
        platform: updated.type,
        connected: Boolean(updated.connected && updated.isActive),
        lastSync: updated.lastSync,
        qaSettings: buildMarketplaceCredentials(updated.credentials).qaSettings,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message || 'Pazaryeri ayarlari kaydedilemedi' });
  }
});

export default router;
