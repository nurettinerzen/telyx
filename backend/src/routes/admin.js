/**
 * Admin Routes
 * Protected routes for admin panel - Full database management
 */

import express from 'express';
import prisma from '../prismaClient.js';
import Stripe from 'stripe';
import { authenticateToken } from '../middleware/auth.js';
import {
  isAdmin,
  requireAdminMfa,
  logAuditAction,
  sanitizeResponse,
  buildChangesObject,
  validateBusinessAccess,
  canAccessBusiness
} from '../middleware/adminAuth.js';
import { createAdminAuditLog, calculateChanges, auditContext } from '../middleware/auditLog.js';
import { updateEnterpriseStripePrice, hasActiveStripeSubscription } from '../services/stripeEnterpriseService.js';
import {
  isPhoneInboundEnabledForBusinessRecord,
  isPhoneInboundForceDisabled
} from '../services/phoneInboundGate.js';
import { buildSecurityConfigDigest, compareBaselineDigest } from '../security/configIntegrity.js';
import runtimeConfig from '../config/runtime.js';

const router = express.Router();
const PAID_RENEWAL_PLANS = ['STARTER', 'PRO', 'ENTERPRISE', 'BASIC'];
const CANCELLATION_REASON_LABELS = Object.freeze({
  UNSPECIFIED: 'Belirtilmedi',
  LOW_USAGE: 'Çok kullanmıyor',
  NO_NEED: 'Artık ihtiyaç yok',
  TOO_EXPENSIVE: 'Pahalı',
  LOW_QUALITY: 'Kalite düşük',
  MISSING_FEATURES: 'Özellikler yetersiz',
  TOO_COMPLEX: 'Karmaşık',
  OTHER: 'Diğer',
});

function buildTrialExpiredSubscriptionWhere(now = new Date()) {
  return {
    plan: 'TRIAL',
    OR: [
      { trialMinutesUsed: { gte: 15 } },
      { trialChatExpiry: { lte: now } },
    ],
  };
}

function buildPaidLapsedSubscriptionWhere(now = new Date()) {
  return {
    plan: { in: PAID_RENEWAL_PLANS },
    currentPeriodEnd: { lt: now },
  };
}

function getSubscriptionLifecycle(subscription, now = new Date()) {
  if (!subscription) return 'NONE';

  if (subscription.plan === 'TRIAL') {
    const trialExpired = Number(subscription.trialMinutesUsed || 0) >= 15
      || (subscription.trialChatExpiry && new Date(subscription.trialChatExpiry) <= now);

    if (trialExpired) {
      return 'TRIAL_EXPIRED';
    }
  }

  if (PAID_RENEWAL_PLANS.includes(String(subscription.plan || ''))
    && subscription.currentPeriodEnd
    && new Date(subscription.currentPeriodEnd) < now) {
    return 'PAID_LAPSED';
  }

  if (subscription.cancelAtPeriodEnd) {
    return 'CANCEL_SCHEDULED';
  }

  return 'ACTIVE';
}

function getCancellationLifecycle(subscription, now = new Date()) {
  if (!subscription) return 'UNKNOWN';

  if (subscription.status === 'CANCELED') {
    return 'ENDED';
  }

  if (subscription.cancelAtPeriodEnd) {
    if (subscription.currentPeriodEnd && new Date(subscription.currentPeriodEnd) < now) {
      return 'ENDED';
    }
    return 'SCHEDULED';
  }

  if (subscription.currentPeriodEnd && new Date(subscription.currentPeriodEnd) < now) {
    return 'ENDED';
  }

  return 'REACTIVATED';
}

function readAuditMetadata(metadata, key, fallback = null) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return fallback;
  }

  return metadata[key] ?? fallback;
}

// Initialize Stripe if key exists
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// Apply auth and admin middleware to all routes
router.use(authenticateToken);
router.use(isAdmin);
router.use(requireAdminMfa);

/**
 * GET /api/admin/security/config-integrity
 * Returns deterministic hash of security-relevant config for tamper detection.
 */
router.get('/security/config-integrity', async (_req, res) => {
  try {
    const baseline = process.env.SECURITY_CONFIG_BASELINE_SHA256 || null;
    const result = await buildSecurityConfigDigest();
    const compare = compareBaselineDigest(result.digest, baseline);

    return res.json({
      digest: result.digest,
      baselineConfigured: Boolean(baseline),
      baselineStatus: compare.reason,
      generatedAt: result.payload.generatedAt,
      monitoredEnvKeys: result.envKeys,
      monitoredFilePaths: result.filePaths,
    });
  } catch (error) {
    console.error('Admin: Failed to compute config integrity digest:', error);
    return res.status(500).json({ error: 'Failed to compute config integrity digest' });
  }
});

/**
 * GET /api/admin/enterprise-customers
 * List all enterprise customers (active + pending)
 */
router.get('/enterprise-customers', async (req, res) => {
  try {
    // Hem aktif enterprise'ları hem de bekleyen enterprise tekliflerini getir
    const subscriptions = await prisma.subscription.findMany({
      where: {
        OR: [
          { plan: 'ENTERPRISE' },           // Aktif enterprise
          { pendingPlanId: 'ENTERPRISE' }   // Bekleyen enterprise teklifi
        ]
      },
      include: {
        business: {
          include: {
            users: {
              where: { role: 'OWNER' },
              take: 1,
              select: { email: true, name: true }
            },
            _count: {
              select: { assistants: true, callLogs: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const customers = await Promise.all(subscriptions.map(async (sub) => {
      const periodStart = sub.currentPeriodStart || sub.trialStartDate || sub.createdAt;
      const [webchatSessions, whatsappSessions, answeredEmails] = await Promise.all([
        prisma.chatLog.count({
          where: {
            businessId: sub.businessId,
            channel: 'CHAT',
            createdAt: { gte: periodStart }
          }
        }),
        prisma.chatLog.count({
          where: {
            businessId: sub.businessId,
            channel: 'WHATSAPP',
            createdAt: { gte: periodStart }
          }
        }),
        prisma.emailDraft.count({
          where: {
            businessId: sub.businessId,
            status: 'SENT',
            createdAt: { gte: periodStart }
          }
        })
      ]);

      const supportInteractionsUsed = webchatSessions + whatsappSessions + answeredEmails;

      return ({
      id: sub.id,
      businessId: sub.businessId,
      businessName: sub.business?.name,
      ownerEmail: sub.business?.users?.[0]?.email,
      ownerName: sub.business?.users?.[0]?.name,
      currentPlan: sub.plan,                    // Mevcut plan (TRIAL, STARTER vs.)
      pendingPlan: sub.pendingPlanId,           // Bekleyen plan (ENTERPRISE)
      isActive: sub.plan === 'ENTERPRISE',      // Enterprise aktif mi?
      enterpriseMinutes: sub.enterpriseMinutes,
      enterpriseSupportInteractions: sub.enterpriseSupportInteractions,
      enterprisePrice: sub.enterprisePrice,
      enterpriseConcurrent: sub.enterpriseConcurrent,
      enterpriseAssistants: sub.enterpriseAssistants,
      enterpriseStartDate: sub.enterpriseStartDate,
      enterpriseEndDate: sub.enterpriseEndDate,
      enterprisePaymentStatus: sub.enterprisePaymentStatus,
      enterpriseNotes: sub.enterpriseNotes,
      minutesUsed: sub.minutesUsed,
      supportInteractionsUsed,
      assistantsCount: sub.business?._count?.assistants || 0,
      callsCount: sub.business?._count?.callLogs || 0,
      createdAt: sub.createdAt
      });
    }));

    res.json(customers);
  } catch (error) {
    console.error('Admin: Failed to list enterprise customers:', error);
    res.status(500).json({ error: 'Failed to load enterprise customers' });
  }
});

// ==================== USER MANAGEMENT ====================

/**
 * GET /api/admin/users
 * List all users with pagination and filters
 */
router.get('/users', async (req, res) => {
  try {
    const { search, plan, suspended, lifecycle, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const now = new Date();

    const where = {
      deletedAt: null // Exclude soft-deleted
    };

    // Search filter
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { business: { name: { contains: search, mode: 'insensitive' } } }
      ];
    }

    // Suspended filter
    if (suspended === 'true') {
      where.suspended = true;
    } else if (suspended === 'false') {
      where.suspended = false;
    }

    // Plan filter (filter by business subscription)
    const subscriptionFilters = [];
    if (plan && plan !== 'ALL') {
      if (plan === '!ENTERPRISE') {
        subscriptionFilters.push({ plan: { not: 'ENTERPRISE' } });
      } else {
        subscriptionFilters.push({ plan });
      }
    }

    if (lifecycle === 'TRIAL_EXPIRED') {
      subscriptionFilters.push(buildTrialExpiredSubscriptionWhere(now));
    } else if (lifecycle === 'PAID_LAPSED') {
      subscriptionFilters.push(buildPaidLapsedSubscriptionWhere(now));
    } else if (lifecycle === 'CANCEL_SCHEDULED') {
      subscriptionFilters.push({ cancelAtPeriodEnd: true });
    }

    const subscriptionFilter = subscriptionFilters.length === 0
      ? undefined
      : subscriptionFilters.length === 1
        ? subscriptionFilters[0]
        : { AND: subscriptionFilters };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: {
          ...where,
          role: 'OWNER', // Only list business owners
          business: subscriptionFilter ? { subscription: subscriptionFilter } : undefined
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          suspended: true,
          suspendedAt: true,
          createdAt: true,
          updatedAt: true,
          business: {
            select: {
              id: true,
              name: true,
              country: true,
              createdAt: true,
              subscription: {
                select: {
                  id: true,
                  plan: true,
                  status: true,
                  minutesUsed: true,
                  balance: true,
                  currentPeriodEnd: true,
                  cancelAtPeriodEnd: true,
                  trialMinutesUsed: true,
                  trialChatExpiry: true,
                  enterpriseMinutes: true,
                  enterpriseSupportInteractions: true,
                  enterprisePrice: true,
                  enterprisePaymentStatus: true
                }
              },
              _count: {
                select: { assistants: true, callLogs: true, users: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.user.count({
        where: {
          ...where,
          role: 'OWNER',
          business: subscriptionFilter ? { subscription: subscriptionFilter } : undefined
        }
      })
    ]);

    // Transform response
    const transformedUsers = users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      suspended: u.suspended,
      suspendedAt: u.suspendedAt,
      createdAt: u.createdAt,
      businessId: u.business?.id,
      businessName: u.business?.name,
      country: u.business?.country,
      plan: u.business?.subscription?.plan || 'FREE',
      subscriptionStatus: u.business?.subscription?.status,
      currentPeriodEnd: u.business?.subscription?.currentPeriodEnd,
      cancelAtPeriodEnd: u.business?.subscription?.cancelAtPeriodEnd || false,
      subscriptionLifecycle: getSubscriptionLifecycle(u.business?.subscription, now),
      minutesUsed: u.business?.subscription?.minutesUsed || 0,
      balance: u.business?.subscription?.balance || 0,
      enterpriseMinutes: u.business?.subscription?.enterpriseMinutes,
      enterpriseSupportInteractions: u.business?.subscription?.enterpriseSupportInteractions,
      enterprisePrice: u.business?.subscription?.enterprisePrice,
      enterprisePaymentStatus: u.business?.subscription?.enterprisePaymentStatus,
      assistantsCount: u.business?._count?.assistants || 0,
      callsCount: u.business?._count?.callLogs || 0,
      teamSize: u.business?._count?.users || 1
    }));

    res.json({
      users: transformedUsers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Admin: Failed to list users:', error);
    res.status(500).json({ error: 'Kullanıcılar alınamadı' });
  }
});

/**
 * GET /api/admin/users/:id
 * Get user detail
 */
router.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        suspended: true,
        suspendedAt: true,
        suspendReason: true,
        onboardingCompleted: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        business: {
          select: {
            id: true,
            name: true,
            country: true,
            language: true,
            currency: true,
            timezone: true,
            businessType: true,
            phoneInboundEnabled: true,
            onboardingCompletedAt: true,
            createdAt: true,
            suspended: true,
            suspendedAt: true,
            suspendReason: true,
            subscription: {
              select: {
                id: true,
                plan: true,
                status: true,
                minutesUsed: true,
                minutesLimit: true,
                balance: true,
                callsThisMonth: true,
                assistantsCreated: true,
                phoneNumbersUsed: true,
                concurrentLimit: true,
                enterpriseMinutes: true,
                enterpriseSupportInteractions: true,
                enterprisePrice: true,
                enterpriseConcurrent: true,
                enterpriseAssistants: true,
                enterpriseStartDate: true,
                enterpriseEndDate: true,
                enterprisePaymentStatus: true,
                enterpriseNotes: true,
                currentPeriodStart: true,
                currentPeriodEnd: true,
                createdAt: true,
                updatedAt: true
              }
            },
            assistants: {
              select: {
                id: true,
                name: true,
                isActive: true,
                callDirection: true,
                createdAt: true,
                _count: { select: { callbackRequests: true } }
              },
              orderBy: { createdAt: 'desc' }
            },
            _count: {
              select: { callLogs: true, users: true, provisionedPhoneNumbers: true }
            }
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    if (user.business) {
      user.business.phoneInboundEnabled = isPhoneInboundEnabledForBusinessRecord(user.business);
    }

    // Get recent calls (without transcript)
    const recentCalls = await prisma.callLog.findMany({
      where: { businessId: user.business?.id },
      select: {
        id: true,
        callId: true,
        duration: true,
        status: true,
        callResult: true,
        callStatus: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    res.json({
      ...user,
      recentCalls
    });
  } catch (error) {
    console.error('Admin: Failed to get user:', error);
    res.status(500).json({ error: 'Kullanıcı alınamadı' });
  }
});

/**
 * PATCH /api/admin/users/:id
 * Update user (plan, minutes, enterprise settings)
 */
router.patch('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const allowedUserFields = ['suspended'];
    const allowedBusinessFields = ['phoneInboundEnabled'];
    const allowedSubscriptionFields = [
      'plan', 'status', 'minutesUsed', 'balance', 'minutesLimit',
      'enterpriseSupportInteractions',
      'enterpriseMinutes', 'enterprisePrice', 'enterpriseConcurrent',
      'enterpriseAssistants', 'enterprisePaymentStatus', 'enterpriseNotes',
      'currentPeriodStart', 'currentPeriodEnd'
    ];

    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: { business: { include: { subscription: true } } }
    });

    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    const userUpdates = {};
    const businessUpdates = {};
    const subscriptionUpdates = {};
    const changes = {};

    // Filter user updates
    for (const field of allowedUserFields) {
      if (req.body[field] !== undefined) {
        userUpdates[field] = req.body[field];
        changes[`user.${field}`] = { old: user[field], new: req.body[field] };
      }
    }

    // Filter subscription updates
    for (const field of allowedSubscriptionFields) {
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        // Handle date fields
        if (['currentPeriodStart', 'currentPeriodEnd', 'enterpriseStartDate', 'enterpriseEndDate'].includes(field) && value) {
          value = new Date(value);
        }
        subscriptionUpdates[field] = value;
        changes[`subscription.${field}`] = {
          old: user.business?.subscription?.[field],
          new: value
        };
      }
    }

    // Filter business-level feature updates
    for (const field of allowedBusinessFields) {
      if (req.body[field] !== undefined) {
        const desiredValue = Boolean(req.body[field]);

        if (
          field === 'phoneInboundEnabled'
          && desiredValue
          && isPhoneInboundForceDisabled({ businessId: user.businessId || user.business?.id })
        ) {
          return res.status(403).json({
            error: 'PHONE_INBOUND_LOCKED_V1',
            message: 'Inbound özelliği bu işletme için allowlist dışında olduğu için açılamıyor.'
          });
        }

        businessUpdates[field] = desiredValue;
        changes[`business.${field}`] = {
          old: user.business?.[field],
          new: businessUpdates[field]
        };
      }
    }

    // Update user if needed
    if (Object.keys(userUpdates).length > 0) {
      await prisma.user.update({
        where: { id: parseInt(id) },
        data: userUpdates
      });
    }

    // Update business if needed
    if (Object.keys(businessUpdates).length > 0 && user.business) {
      await prisma.business.update({
        where: { id: user.business.id },
        data: businessUpdates
      });
    }

    // Update subscription if needed
    if (Object.keys(subscriptionUpdates).length > 0 && user.business?.subscription) {
      await prisma.subscription.update({
        where: { id: user.business.subscription.id },
        data: subscriptionUpdates
      });
    }

    // Audit log
    if (Object.keys(changes).length > 0) {
      await logAuditAction(req.admin, 'UPDATE', 'User', id, changes, req);
    }

    // Refetch updated user
    const updatedUser = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: { business: { include: { subscription: true } } }
    });

    if (updatedUser?.business) {
      updatedUser.business.phoneInboundEnabled = isPhoneInboundEnabledForBusinessRecord(updatedUser.business);
    }

    res.json({ success: true, user: sanitizeResponse(updatedUser, 'User') });
  } catch (error) {
    console.error('Admin: Failed to update user:', error);
    res.status(500).json({ error: 'Kullanıcı güncellenemedi' });
  }
});

/**
 * POST /api/admin/users/:id/suspend
 * Suspend or unsuspend user
 */
router.post('/users/:id/suspend', async (req, res) => {
  try {
    const { id } = req.params;
    const { suspended, reason } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: { business: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    // Update user
    await prisma.user.update({
      where: { id: parseInt(id) },
      data: {
        suspended: suspended,
        suspendedAt: suspended ? new Date() : null,
        suspendReason: suspended ? reason : null
      }
    });

    // Also suspend/unsuspend business
    if (user.businessId) {
      await prisma.business.update({
        where: { id: user.businessId },
        data: {
          suspended: suspended,
          suspendedAt: suspended ? new Date() : null,
          suspendReason: suspended ? reason : null
        }
      });
    }

    await logAuditAction(
      req.admin,
      suspended ? 'SUSPEND' : 'ACTIVATE',
      'User',
      id,
      { suspended: { old: !suspended, new: suspended }, reason },
      req
    );

    res.json({
      success: true,
      message: suspended ? 'Kullanıcı donduruldu' : 'Kullanıcı aktif edildi'
    });
  } catch (error) {
    console.error('Admin: Failed to suspend user:', error);
    res.status(500).json({ error: 'İşlem başarısız' });
  }
});

/**
 * POST /api/admin/users/:id/reset-password
 * Send password reset link (placeholder)
 */
router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    // TODO: Implement password reset email
    // For now, just log the action

    await logAuditAction(req.admin, 'PASSWORD_RESET', 'User', id, null, req);

    res.json({ success: true, message: 'Şifre sıfırlama linki gönderildi' });
  } catch (error) {
    console.error('Admin: Failed to reset password:', error);
    res.status(500).json({ error: 'İşlem başarısız' });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Soft delete user
 */
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: { business: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    // Soft delete user
    await prisma.user.update({
      where: { id: parseInt(id) },
      data: {
        suspended: true,
        deletedAt: new Date()
      }
    });

    // Soft delete business
    if (user.businessId) {
      await prisma.business.update({
        where: { id: user.businessId },
        data: {
          suspended: true,
          deletedAt: new Date()
        }
      });
    }

    await logAuditAction(req.admin, 'DELETE', 'User', id, null, req);

    res.json({ success: true });
  } catch (error) {
    console.error('Admin: Failed to delete user:', error);
    res.status(500).json({ error: 'Kullanıcı silinemedi' });
  }
});

/**
 * POST /api/admin/enterprise-customers
 * Upgrade a user to enterprise
 *
 * Akış:
 * 1. Mevcut planı DEĞİŞTİRME (TRIAL, STARTER vs. kalsın)
 * 2. pendingPlanId = 'ENTERPRISE' olarak kaydet
 * 3. Enterprise detaylarını kaydet (fiyat, dakika vs.)
 * 4. enterprisePaymentStatus = 'pending'
 * 5. Ödeme yapılınca (webhook): plan = 'ENTERPRISE', status = 'ACTIVE'
 */
router.post('/enterprise-customers', async (req, res) => {
  try {
    const {
      businessId,
      minutes,
      supportInteractions,
      price,
      concurrent,
      assistants,
      startDate,
      endDate,
      notes
    } = req.body;

    if (!businessId) {
      return res.status(400).json({ error: 'businessId is required' });
    }

    // P1 Security: Validate admin can access this business
    if (!canAccessBusiness(req, businessId)) {
      await createAdminAuditLog(
        req.admin,
        'enterprise_config_access_denied',
        {
          entityType: 'Subscription',
          entityId: 'N/A',
          changes: null,
          metadata: {
            businessId: parseInt(businessId),
            operation: 'access_denied',
            reason: 'Insufficient permissions - SUPER_ADMIN required for cross-business access'
          },
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('user-agent')
        }
      );
      return res.status(403).json({
        error: 'Bu business\'a erişim yetkiniz yok',
        requiredRole: 'SUPER_ADMIN'
      });
    }

    // Mevcut subscription'ı kontrol et
    const existingSubscription = await prisma.subscription.findUnique({
      where: { businessId: parseInt(businessId) }
    });

    // Enterprise eklerken:
    // - Mevcut planı DEĞİŞTİRME (kullanıcı mevcut planını kullanmaya devam etsin)
    // - pendingPlanId = 'ENTERPRISE' olarak ayarla
    // - Enterprise detaylarını kaydet
    // - Ödeme yapılınca plan aktif olacak
    const subscription = await prisma.subscription.upsert({
      where: { businessId: parseInt(businessId) },
      create: {
        businessId: parseInt(businessId),
        plan: 'TRIAL', // Yeni kullanıcıysa TRIAL ile başlasın
        status: 'ACTIVE',
        pendingPlanId: 'ENTERPRISE', // Bekleyen plan
        enterpriseMinutes: minutes || 1000,
        enterpriseSupportInteractions: supportInteractions ?? null,
        enterprisePrice: price || 8500,
        enterpriseConcurrent: concurrent || 10,
        enterpriseAssistants: assistants || null,
        enterpriseStartDate: startDate ? new Date(startDate) : new Date(),
        enterpriseEndDate: endDate ? new Date(endDate) : null,
        enterprisePaymentStatus: 'pending',
        enterpriseNotes: notes || null
      },
      update: {
        // plan DEĞİŞMİYOR - mevcut planı koru
        pendingPlanId: 'ENTERPRISE', // Bekleyen plan
        enterpriseMinutes: minutes,
        enterpriseSupportInteractions: supportInteractions,
        enterprisePrice: price,
        enterpriseConcurrent: concurrent,
        enterpriseAssistants: assistants,
        enterpriseStartDate: startDate ? new Date(startDate) : undefined,
        enterpriseEndDate: endDate ? new Date(endDate) : undefined,
        enterprisePaymentStatus: 'pending',
        enterpriseNotes: notes
      }
    });

    // P0-C: Audit log for enterprise config
    const changes = calculateChanges(
      existingSubscription,
      subscription,
      ['enterpriseMinutes', 'enterpriseSupportInteractions', 'enterprisePrice', 'enterpriseConcurrent', 'enterpriseAssistants', 'enterprisePaymentStatus', 'pendingPlanId']
    );

    await createAdminAuditLog(
      req.admin, // Admin user from isAdmin middleware
      existingSubscription ? 'enterprise_config_updated' : 'enterprise_config_created',
      {
        entityType: 'Subscription',
        entityId: subscription.id,
        changes,
        metadata: {
          businessId: parseInt(businessId),
          operation: 'enterprise_config',
          notes,
          oldPlan: existingSubscription?.plan,
          newPendingPlan: 'ENTERPRISE'
        },
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent')
      }
    );

    console.log(`✅ Admin: Business ${businessId} - Enterprise teklifi oluşturuldu (pendingPlan). Mevcut plan: ${subscription.plan}`);
    res.json(subscription);
  } catch (error) {
    console.error('Admin: Failed to create enterprise customer:', error);
    res.status(500).json({ error: 'Failed to create enterprise customer' });
  }
});

/**
 * PUT /api/admin/enterprise-customers/:id
 * Update enterprise customer
 * If paymentStatus changes to 'paid', automatically activate the enterprise plan
 */
router.put('/enterprise-customers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      minutes,
      supportInteractions,
      price,
      concurrent,
      assistants,
      startDate,
      endDate,
      paymentStatus,
      notes
    } = req.body;

    // Get current subscription to check if we need to activate
    const currentSub = await prisma.subscription.findUnique({
      where: { id: parseInt(id) }
    });

    if (!currentSub) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // P1 Security: Validate admin can access this business
    if (!canAccessBusiness(req, currentSub.businessId)) {
      await createAdminAuditLog(
        req.admin,
        'enterprise_config_access_denied',
        {
          entityType: 'Subscription',
          entityId: currentSub.id,
          changes: null,
          metadata: {
            businessId: currentSub.businessId,
            operation: 'access_denied',
            reason: 'Insufficient permissions - SUPER_ADMIN required for cross-business access'
          },
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('user-agent')
        }
      );
      return res.status(403).json({
        error: 'Bu business\'a erişim yetkiniz yok',
        requiredRole: 'SUPER_ADMIN'
      });
    }

    // Build update data
    const updateData = {
      enterpriseMinutes: minutes,
      enterpriseSupportInteractions: supportInteractions,
      enterprisePrice: price,
      enterpriseConcurrent: concurrent,
      enterpriseAssistants: assistants,
      enterpriseStartDate: startDate ? new Date(startDate) : undefined,
      enterpriseEndDate: endDate ? new Date(endDate) : undefined,
      enterprisePaymentStatus: paymentStatus,
      enterpriseNotes: notes,
      minutesLimit: minutes,
      concurrentLimit: concurrent,
      assistantsLimit: assistants || 999
    };

    // If payment status is changing to 'paid' and plan is not ENTERPRISE yet, activate it
    if (paymentStatus === 'paid' && currentSub?.plan !== 'ENTERPRISE') {
      updateData.plan = 'ENTERPRISE';
      updateData.pendingPlanId = null;
      updateData.status = 'ACTIVE';
      updateData.currentPeriodStart = new Date();
      updateData.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      console.log(`✅ Admin: Activating ENTERPRISE plan for subscription ${id} (manual payment confirmation)`);
    }

    const subscription = await prisma.subscription.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: { business: true }
    });

    // P2: Stripe subscription price update (if price changed and has active Stripe sub)
    let stripeUpdateResult = null;
    const priceChanged = price && price !== currentSub.enterprisePrice;

    if (priceChanged && hasActiveStripeSubscription(currentSub)) {
      console.log(`💳 Admin: Price changed from ${currentSub.enterprisePrice} to ${price}, updating Stripe subscription...`);

      // Get proration preference from request (optional)
      const applyProration = req.body.applyProration === true;
      const effectiveAt = req.body.effectiveAt || 'next_period'; // 'immediate' or 'next_period'

      stripeUpdateResult = await updateEnterpriseStripePrice(
        { ...currentSub, business: subscription.business },
        price,
        { applyProration, effectiveAt }
      );

      if (stripeUpdateResult.success) {
        console.log(`✅ Admin: Stripe subscription updated - Price ${stripeUpdateResult.oldPriceId} → ${stripeUpdateResult.newPriceId}`);
      } else {
        console.warn(`⚠️ Admin: Stripe update failed: ${stripeUpdateResult.reason} - ${stripeUpdateResult.message}`);
      }
    }

    // P0-C: Audit log for enterprise update/activation
    const changes = calculateChanges(
      currentSub,
      subscription,
      ['plan', 'status', 'pendingPlanId', 'enterpriseMinutes', 'enterpriseSupportInteractions', 'enterprisePrice', 'enterpriseConcurrent', 'enterpriseAssistants', 'enterprisePaymentStatus']
    );

    const event = (paymentStatus === 'paid' && currentSub?.plan !== 'ENTERPRISE')
      ? 'enterprise_approved'
      : 'enterprise_config_updated';

    await createAdminAuditLog(
      req.admin,
      event,
      {
        entityType: 'Subscription',
        entityId: subscription.id,
        changes,
        metadata: {
          businessId: subscription.businessId,
          operation: event === 'enterprise_approved' ? 'enterprise_activation' : 'enterprise_update',
          notes,
          planActivated: event === 'enterprise_approved',
          // P2: Stripe price update metadata
          ...(stripeUpdateResult && {
            stripeUpdate: {
              success: stripeUpdateResult.success,
              oldPriceId: stripeUpdateResult.oldPriceId,
              newPriceId: stripeUpdateResult.newPriceId,
              oldAmount: stripeUpdateResult.oldAmount,
              newAmount: stripeUpdateResult.newAmount,
              proration: stripeUpdateResult.proration,
              effectiveAt: stripeUpdateResult.effectiveAt,
              prorationBehavior: stripeUpdateResult.prorationBehavior,
              reason: stripeUpdateResult.reason
            }
          })
        },
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent')
      }
    );

    console.log(`✅ Admin: Enterprise subscription ${id} updated`);
    res.json({
      subscription,
      stripeUpdate: stripeUpdateResult || { applied: false, reason: 'No price change or no active Stripe subscription' }
    });
  } catch (error) {
    console.error('Admin: Failed to update enterprise customer:', error);
    res.status(500).json({ error: 'Failed to update enterprise customer' });
  }
});

/**
 * POST /api/admin/enterprise-customers/:id/payment-link
 * Generate Stripe payment link for enterprise customer
 * Creates a recurring subscription, not one-time payment
 */
router.post('/enterprise-customers/:id/payment-link', async (req, res) => {
  try {
    const { id } = req.params;

    if (!stripe) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { id: parseInt(id) },
      include: { business: true }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // P1 Security: Validate admin can access this business
    if (!canAccessBusiness(req, subscription.businessId)) {
      await createAdminAuditLog(
        req.admin,
        'enterprise_stripe_access_denied',
        {
          entityType: 'Subscription',
          entityId: subscription.id,
          changes: null,
          metadata: {
            businessId: subscription.businessId,
            operation: 'stripe_price_access_denied',
            reason: 'Insufficient permissions - SUPER_ADMIN required for cross-business access'
          },
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('user-agent')
        }
      );
      return res.status(403).json({
        error: 'Bu business\'a erişim yetkiniz yok',
        requiredRole: 'SUPER_ADMIN'
      });
    }

    if (!subscription || !subscription.enterprisePrice) {
      return res.status(400).json({ error: 'Kurumsal fiyat belirlenmemiş' });
    }

    // Minimum fiyat kontrolü - Stripe TRY için en az 500 TL gerektirir (~$10)
    // Aslında ~$0.50 ama güvenlik için 500 TL minimum koyuyoruz
    if (subscription.enterprisePrice < 500) {
      return res.status(400).json({
        error: 'Kurumsal fiyat en az 500 TL olmalıdır',
        currentPrice: subscription.enterprisePrice
      });
    }

    // P0-C: Idempotency - check if price already exists for this exact config
    const priceHash = `ent-${subscription.id}-${subscription.enterprisePrice}-TRY-month`;

    if (subscription.stripePriceId) {
      // Get existing price metadata to compare config
      try {
        const existingPrice = await stripe.prices.retrieve(subscription.stripePriceId);
        const currentConfigHash = existingPrice.metadata?.priceHash || null;

        if (currentConfigHash === priceHash) {
          console.log(`⚠️ Admin: Stripe price already exists with same config for subscription ${id}: ${subscription.stripePriceId}`);

          const existingPaymentLink = await stripe.paymentLinks.create({
            line_items: [{
              price: subscription.stripePriceId,
              quantity: 1,
            }],
            metadata: {
              subscriptionId: subscription.id.toString(),
              businessId: subscription.businessId.toString(),
              type: 'enterprise',
              priceId: subscription.stripePriceId
            },
            after_completion: {
              type: 'redirect',
              redirect: {
                url: `${runtimeConfig.frontendUrl}/dashboard/subscription?success=true`
              }
            }
          });

          return res.json({
            url: existingPaymentLink.url,
            message: 'Price already exists, new payment link created for the same configuration',
            priceId: subscription.stripePriceId,
            idempotent: true
          });
        } else {
          console.log(`💡 Admin: Config changed for subscription ${id}, creating new price (old: ${currentConfigHash}, new: ${priceHash})`);
          // Continue to create new price
        }
      } catch (error) {
        console.error('Failed to retrieve existing Stripe price:', error);
        // Continue to create new price on error
      }
    }

    // First, create a Stripe product for this enterprise customer
    const product = await stripe.products.create({
      name: `Telyx.AI Kurumsal Plan - ${subscription.business?.name}`,
      description: `${subscription.enterpriseMinutes} dakika, ${subscription.enterpriseSupportInteractions ?? 'ozel'} destek etkilesimi dahil, özel kurumsal plan`,
      metadata: {
        businessId: subscription.businessId.toString(),
        type: 'enterprise'
      }
    });

    // Create a recurring price for this product with idempotency key
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(subscription.enterprisePrice * 100), // Kuruş
      currency: 'try',
      recurring: {
        interval: 'month'
      },
      metadata: {
        subscriptionId: subscription.id.toString(),
        businessId: subscription.businessId.toString(),
        type: 'enterprise',
        priceHash
      }
    }, {
      idempotencyKey: priceHash // Prevent duplicate price creation
    });

    // Create Stripe Payment Link with recurring subscription
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{
        price: price.id,
        quantity: 1,
      }],
      metadata: {
        subscriptionId: subscription.id.toString(),
        businessId: subscription.businessId.toString(),
        type: 'enterprise',
        priceId: price.id
      },
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `${runtimeConfig.frontendUrl}/dashboard/subscription?success=true`
        }
      }
    });

    // Store the Stripe price ID for future reference
    const updatedSubscription = await prisma.subscription.update({
      where: { id: parseInt(id) },
      data: {
        stripePriceId: price.id
      }
    });

    // P0-C: Audit log for Stripe price creation
    await createAdminAuditLog(
      req.admin,
      'enterprise_stripe_price_created',
      {
        entityType: 'Subscription',
        entityId: subscription.id,
        changes: {
          stripePriceId: { old: subscription.stripePriceId, new: price.id },
          stripeProductId: { old: null, new: product.id }
        },
        metadata: {
          businessId: subscription.businessId,
          operation: 'stripe_price_creation',
          stripeProductId: product.id,
          stripePriceId: price.id,
          priceAmount: subscription.enterprisePrice,
          currency: 'TRY',
          paymentLinkUrl: paymentLink.url
        },
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent')
      }
    );

    console.log(`✅ Admin: Payment link created for subscription ${id} (recurring)`);
    res.json({ url: paymentLink.url });
  } catch (error) {
    console.error('Admin: Failed to create payment link:', error);
    res.status(500).json({ error: 'Failed to create payment link', details: error.message });
  }
});

/**
 * GET /api/admin/stats
 * Get admin dashboard stats
 */
router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      totalBusinesses,
      activeBusinesses,
      suspendedBusinesses,
      enterpriseCount,
      proCount,
      starterCount,
      paygCount,
      trialCount,
      freeCount,
      totalCalls,
      todayCalls,
      monthCalls,
      totalAssistants,
      totalUsers,
      expiredTrials,
      paidLapsed,
      scheduledCancellations,
      totalCancellationRequests,
      cancellationFeedbackCount
    ] = await Promise.all([
      prisma.business.count({ where: { deletedAt: null } }),
      prisma.business.count({ where: { deletedAt: null, suspended: false } }),
      prisma.business.count({ where: { deletedAt: null, suspended: true } }),
      prisma.subscription.count({ where: { business: { deletedAt: null }, plan: 'ENTERPRISE' } }),
      prisma.subscription.count({ where: { business: { deletedAt: null }, plan: 'PRO' } }),
      prisma.subscription.count({ where: { business: { deletedAt: null }, plan: 'STARTER' } }),
      prisma.subscription.count({ where: { business: { deletedAt: null }, plan: 'PAYG' } }),
      prisma.subscription.count({ where: { business: { deletedAt: null }, plan: 'TRIAL' } }),
      prisma.subscription.count({ where: { business: { deletedAt: null }, plan: 'FREE' } }),
      prisma.callLog.count(),
      prisma.callLog.count({ where: { createdAt: { gte: today } } }),
      prisma.callLog.count({ where: { createdAt: { gte: thisMonth } } }),
      prisma.assistant.count(),
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.subscription.count({
        where: {
          business: { deletedAt: null },
          ...buildTrialExpiredSubscriptionWhere(now),
        }
      }),
      prisma.subscription.count({
        where: {
          business: { deletedAt: null },
          ...buildPaidLapsedSubscriptionWhere(now),
        }
      }),
      prisma.subscription.count({
        where: {
          business: { deletedAt: null },
          cancelAtPeriodEnd: true,
        }
      }),
      prisma.businessAuditLog.count({
        where: { action: 'subscription_cancel_requested' }
      }),
      prisma.businessAuditLog.count({
        where: { action: 'subscription_cancellation_feedback_submitted' }
      })
    ]);

    res.json({
      users: {
        total: totalUsers,
      },
      businesses: {
        total: totalBusinesses,
        active: activeBusinesses,
        suspended: suspendedBusinesses,
      },
      byPlan: {
        enterprise: enterpriseCount,
        pro: proCount,
        starter: starterCount,
        payg: paygCount,
        trial: trialCount,
        free: freeCount
      },
      calls: {
        total: totalCalls,
        today: todayCalls,
        month: monthCalls
      },
      assistants: totalAssistants,
      lifecycle: {
        trialExpired: expiredTrials,
        paidLapsed,
      },
      cancellations: {
        scheduled: scheduledCancellations,
        requested: totalCancellationRequests,
        feedbackProvided: cancellationFeedbackCount,
      }
    });
  } catch (error) {
    console.error('Admin: Failed to get stats:', error);
    res.status(500).json({ error: 'İstatistikler alınamadı' });
  }
});

// ==================== ASSISTANTS ====================

/**
 * GET /api/admin/assistants
 * List all assistants
 */
router.get('/assistants', async (req, res) => {
  try {
    const { search, businessId, isActive, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { business: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (businessId) {
      where.businessId = parseInt(businessId);
    }
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const [assistants, total] = await Promise.all([
      prisma.assistant.findMany({
        where,
        select: {
          id: true,
          name: true,
          assistantType: true,
          isActive: true,
          voiceId: true,
          callDirection: true,
          tone: true,
          createdAt: true,
          updatedAt: true,
          business: {
            select: {
              id: true,
              name: true,
              users: {
                where: { role: 'OWNER' },
                take: 1,
                select: { id: true, email: true }
              }
            }
          },
          _count: {
            select: { callbackRequests: true, phoneNumbers: true, chatLogs: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.assistant.count({ where })
    ]);

    const transformedAssistants = assistants.map(a => ({
      ...a,
      businessName: a.business?.name,
      ownerUserId: a.business?.users?.[0]?.id || null,
      ownerEmail: a.business?.users?.[0]?.email,
      callbacksCount: a._count?.callbackRequests || 0,
      phoneNumbersCount: a._count?.phoneNumbers || 0,
      conversationsCount: a._count?.chatLogs || 0
    }));

    res.json({
      assistants: transformedAssistants,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Admin: Failed to list assistants:', error);
    res.status(500).json({ error: 'Asistanlar alınamadı' });
  }
});

/**
 * DELETE /api/admin/assistants/:id
 * Delete assistant
 */
router.delete('/assistants/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const assistant = await prisma.assistant.findUnique({
      where: { id },
      include: { business: true }
    });

    if (!assistant) {
      return res.status(404).json({ error: 'Asistan bulunamadı' });
    }

    // TODO: Delete from 11Labs if needed
    // await delete11LabsAgent(assistant.elevenLabsAgentId);

    await prisma.assistant.delete({ where: { id } });

    await logAuditAction(req.admin, 'DELETE', 'Assistant', id, {
      name: assistant.name,
      businessId: assistant.businessId
    }, req);

    res.json({ success: true });
  } catch (error) {
    console.error('Admin: Failed to delete assistant:', error);
    res.status(500).json({ error: 'Asistan silinemedi' });
  }
});

// ==================== CALLS ====================

/**
 * GET /api/admin/calls
 * List all calls (without transcript/recording)
 */
router.get('/calls', async (req, res) => {
  try {
    const { businessId, status, callResult, startDate, endDate, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};

    if (businessId) where.businessId = parseInt(businessId);
    if (status) where.status = status;
    if (callResult) where.callResult = callResult;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [calls, total] = await Promise.all([
      prisma.callLog.findMany({
        where,
        select: {
          id: true,
          callId: true,
          callerId: true,
          duration: true,
          status: true,
          callResult: true,
          callStatus: true,
          summary: true,
          voicemailDetected: true,
          createdAt: true,
          business: {
            select: {
              id: true,
              name: true
            }
          }
          // transcript, transcriptText, recordingUrl EXCLUDED
        },
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
    console.error('Admin: Failed to list calls:', error);
    res.status(500).json({ error: 'Aramalar alınamadı' });
  }
});

// ==================== CALLBACKS ====================

/**
 * GET /api/admin/callbacks
 * List all callback requests
 */
router.get('/callbacks', async (req, res) => {
  try {
    const { status, priority, businessId, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (businessId) where.businessId = parseInt(businessId);

    const [callbacks, total] = await Promise.all([
      prisma.callbackRequest.findMany({
        where,
        include: {
          business: { select: { id: true, name: true } },
          assistant: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.callbackRequest.count({ where })
    ]);

    res.json({
      callbacks,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Admin: Failed to list callbacks:', error);
    res.status(500).json({ error: 'Geri aramalar alınamadı' });
  }
});

/**
 * PATCH /api/admin/callbacks/:id
 * Update callback status
 */
router.patch('/callbacks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, callbackNotes, priority } = req.body;

    const current = await prisma.callbackRequest.findUnique({ where: { id } });
    if (!current) {
      return res.status(404).json({ error: 'Geri arama bulunamadı' });
    }

    const updates = {};
    const changes = {};

    if (status !== undefined) {
      updates.status = status;
      changes.status = { old: current.status, new: status };
      if (status === 'COMPLETED') {
        updates.completedAt = new Date();
      }
    }
    if (notes !== undefined) {
      updates.notes = notes;
      changes.notes = { old: current.notes, new: notes };
    }
    if (callbackNotes !== undefined) {
      updates.callbackNotes = callbackNotes;
      changes.callbackNotes = { old: current.callbackNotes, new: callbackNotes };
    }
    if (priority !== undefined) {
      updates.priority = priority;
      changes.priority = { old: current.priority, new: priority };
    }

    const callback = await prisma.callbackRequest.update({
      where: { id },
      data: updates
    });

    await logAuditAction(req.admin, 'UPDATE', 'CallbackRequest', id, changes, req);

    res.json(callback);
  } catch (error) {
    console.error('Admin: Failed to update callback:', error);
    res.status(500).json({ error: 'Geri arama güncellenemedi' });
  }
});

// ==================== SUBSCRIPTIONS ====================

/**
 * GET /api/admin/subscriptions
 * List all subscriptions
 */
router.get('/subscriptions', async (req, res) => {
  try {
    const { search, plan, status, lifecycle, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const now = new Date();

    const where = {};

    if (search) {
      where.OR = [
        { business: { name: { contains: search, mode: 'insensitive' } } },
        { business: { users: { some: { email: { contains: search, mode: 'insensitive' } } } } },
        { business: { users: { some: { name: { contains: search, mode: 'insensitive' } } } } },
      ];
    }
    if (plan) where.plan = plan;
    if (status) where.status = status;
    if (lifecycle === 'TRIAL_EXPIRED') {
      Object.assign(where, buildTrialExpiredSubscriptionWhere(now));
    } else if (lifecycle === 'PAID_LAPSED') {
      Object.assign(where, buildPaidLapsedSubscriptionWhere(now));
    } else if (lifecycle === 'CANCEL_SCHEDULED') {
      where.cancelAtPeriodEnd = true;
    }

    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        include: {
          business: {
            select: {
              id: true,
              name: true,
              users: {
                where: { role: 'OWNER' },
                take: 1,
                select: { id: true, email: true, name: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.subscription.count({ where })
    ]);

    // Sanitize subscriptions (remove sensitive fields)
    const sanitizedSubscriptions = subscriptions.map(sub => {
      const { stripeCustomerId, stripeSubscriptionId, ...safe } = sub;
      return {
        ...safe,
        businessName: sub.business?.name,
        ownerUserId: sub.business?.users?.[0]?.id || null,
        ownerEmail: sub.business?.users?.[0]?.email,
        ownerName: sub.business?.users?.[0]?.name,
        subscriptionLifecycle: getSubscriptionLifecycle(sub, now),
      };
    });

    res.json({
      subscriptions: sanitizedSubscriptions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Admin: Failed to list subscriptions:', error);
    res.status(500).json({ error: 'Abonelikler alınamadı' });
  }
});

/**
 * PATCH /api/admin/subscriptions/:id
 * Update subscription
 */
router.patch('/subscriptions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const allowedFields = [
      'plan', 'status', 'minutesUsed', 'minutesLimit', 'balance',
      'currentPeriodStart', 'currentPeriodEnd',
      'enterpriseMinutes', 'enterprisePrice', 'enterpriseConcurrent',
      'enterpriseAssistants', 'enterpriseStartDate', 'enterpriseEndDate',
      'enterprisePaymentStatus', 'enterpriseNotes'
    ];

    const current = await prisma.subscription.findUnique({ where: { id: parseInt(id) } });
    if (!current) {
      return res.status(404).json({ error: 'Abonelik bulunamadı' });
    }

    const updates = {};
    const changes = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        // Handle date fields
        if (['currentPeriodStart', 'currentPeriodEnd', 'enterpriseStartDate', 'enterpriseEndDate'].includes(field) && value) {
          value = new Date(value);
        }
        updates[field] = value;
        changes[field] = { old: current[field], new: value };
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Güncellenecek alan yok' });
    }

    const subscription = await prisma.subscription.update({
      where: { id: parseInt(id) },
      data: updates
    });

    await logAuditAction(req.admin, 'UPDATE', 'Subscription', id, changes, req);

    res.json(sanitizeResponse(subscription, 'Subscription'));
  } catch (error) {
    console.error('Admin: Failed to update subscription:', error);
    res.status(500).json({ error: 'Abonelik güncellenemedi' });
  }
});

/**
 * GET /api/admin/cancellations
 * List cancellation requests and optional feedback
 */
router.get('/cancellations', async (req, res) => {
  try {
    const { search, reasonCode, lifecycle, page = 1, limit = 20 } = req.query;
    const pageNumber = parseInt(page);
    const pageSize = parseInt(limit);
    const now = new Date();

    const where = {
      action: 'subscription_cancel_requested'
    };

    if (search) {
      where.OR = [
        { business: { name: { contains: search, mode: 'insensitive' } } },
        { business: { users: { some: { role: 'OWNER', email: { contains: search, mode: 'insensitive' } } } } },
        { business: { users: { some: { role: 'OWNER', name: { contains: search, mode: 'insensitive' } } } } },
      ];
    }

    const cancellationRequests = await prisma.businessAuditLog.findMany({
      where,
      include: {
        business: {
          select: {
            id: true,
            name: true,
            subscription: {
              select: {
                plan: true,
                status: true,
                currentPeriodEnd: true,
                cancelAtPeriodEnd: true,
              }
            },
            users: {
              where: { role: 'OWNER' },
              take: 1,
              select: {
                email: true,
                name: true,
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const feedbackBusinessIds = [...new Set(cancellationRequests.map((entry) => entry.businessId).filter(Boolean))];
    const cancellationFeedback = feedbackBusinessIds.length > 0
      ? await prisma.businessAuditLog.findMany({
        where: {
          action: 'subscription_cancellation_feedback_submitted',
          businessId: { in: feedbackBusinessIds }
        },
        orderBy: { createdAt: 'desc' }
      })
      : [];

    const requestLogsByBusinessId = cancellationRequests.reduce((map, entry) => {
      if (!entry.businessId) return map;

      const key = String(entry.businessId);
      if (!map.has(key)) {
        map.set(key, []);
      }

      map.get(key).push(entry);
      return map;
    }, new Map());

    for (const requests of requestLogsByBusinessId.values()) {
      requests.sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
    }

    const feedbackLogsByBusinessId = cancellationFeedback.reduce((map, entry) => {
      if (!entry.businessId) return map;

      const key = String(entry.businessId);
      if (!map.has(key)) {
        map.set(key, []);
      }

      map.get(key).push(entry);
      return map;
    }, new Map());

    for (const feedbackLogs of feedbackLogsByBusinessId.values()) {
      feedbackLogs.sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
    }

    const mergedRows = cancellationRequests.map((requestLog) => {
      const requestLogsForBusiness = requestLogsByBusinessId.get(String(requestLog.businessId)) || [];
      const requestIndex = requestLogsForBusiness.findIndex((entry) => entry.id === requestLog.id);
      const nextRequestCreatedAt = requestIndex >= 0
        ? requestLogsForBusiness[requestIndex + 1]?.createdAt || null
        : null;
      const feedbackLogsForBusiness = feedbackLogsByBusinessId.get(String(requestLog.businessId)) || [];
      const matchingFeedback = feedbackLogsForBusiness.filter((feedbackLog) => {
        if (feedbackLog.createdAt < requestLog.createdAt) {
          return false;
        }

        if (nextRequestCreatedAt && feedbackLog.createdAt >= nextRequestCreatedAt) {
          return false;
        }

        return true;
      }).at(-1) || null;

      const reasonCodeValue = String(
        readAuditMetadata(matchingFeedback?.metadata, 'reasonCode')
        || readAuditMetadata(requestLog.metadata, 'reasonCode')
        || 'UNSPECIFIED'
      ).toUpperCase();

      const reasonLabel = readAuditMetadata(matchingFeedback?.metadata, 'reasonLabel')
        || readAuditMetadata(requestLog.metadata, 'reasonLabel')
        || CANCELLATION_REASON_LABELS[reasonCodeValue]
        || reasonCodeValue;

      const reasonDetail = readAuditMetadata(matchingFeedback?.metadata, 'reasonDetail')
        || readAuditMetadata(requestLog.metadata, 'reasonDetail')
        || null;

      const cancellationState = getCancellationLifecycle(requestLog.business?.subscription, now);
      const owner = requestLog.business?.users?.[0] || null;

      return {
        id: requestLog.id,
        businessId: requestLog.businessId,
        businessName: requestLog.business?.name || '-',
        ownerEmail: owner?.email || '-',
        ownerName: owner?.name || '-',
        plan: requestLog.business?.subscription?.plan || 'FREE',
        subscriptionStatus: requestLog.business?.subscription?.status || 'UNKNOWN',
        lifecycle: cancellationState,
        cancelAt: requestLog.business?.subscription?.currentPeriodEnd || readAuditMetadata(requestLog.metadata, 'cancelAt') || null,
        requestedAt: requestLog.createdAt,
        reasonCode: reasonCodeValue,
        reasonLabel,
        reasonDetail,
        feedbackSubmittedAt: matchingFeedback?.createdAt || null,
      };
    });

    const filteredRows = mergedRows.filter((row) => {
      if (reasonCode && reasonCode !== 'ALL' && row.reasonCode !== reasonCode) {
        return false;
      }

      if (lifecycle && lifecycle !== 'ALL' && row.lifecycle !== lifecycle) {
        return false;
      }

      return true;
    });

    const paginatedRows = filteredRows.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);

    res.json({
      cancellations: paginatedRows,
      summary: {
        total: filteredRows.length,
        scheduled: filteredRows.filter((row) => row.lifecycle === 'SCHEDULED').length,
        ended: filteredRows.filter((row) => row.lifecycle === 'ENDED').length,
        reactivated: filteredRows.filter((row) => row.lifecycle === 'REACTIVATED').length,
        feedbackProvided: filteredRows.filter((row) => Boolean(row.feedbackSubmittedAt)).length,
      },
      pagination: {
        page: pageNumber,
        limit: pageSize,
        total: filteredRows.length,
        pages: Math.ceil(filteredRows.length / pageSize),
      }
    });
  } catch (error) {
    console.error('Admin: Failed to list cancellations:', error);
    res.status(500).json({ error: 'Iptal kayitlari alinamadi' });
  }
});

// ==================== EMAIL RAG METRICS ====================

/**
 * GET /api/admin/email-rag/metrics
 * Get Email RAG performance metrics
 */
router.get('/email-rag/metrics', async (req, res) => {
  try {
    const { businessId, days = 7 } = req.query;
    const cutoffDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    // Build where clause
    const where = {
      createdAt: { gte: cutoffDate }
    };
    if (businessId) {
      where.businessId = parseInt(businessId);
    }

    // 1. Embedding stats
    const [
      totalEmbeddings,
      embeddingsByBusiness,
      embeddingsByIntent,
      recentEmbeddings
    ] = await Promise.all([
      prisma.emailEmbedding.count({ where }),
      prisma.emailEmbedding.groupBy({
        by: ['businessId'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10
      }),
      prisma.emailEmbedding.groupBy({
        by: ['intent'],
        where,
        _count: { id: true }
      }),
      prisma.emailEmbedding.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          businessId: true,
          intent: true,
          language: true,
          createdAt: true
        }
      })
    ]);

    // 2. Snippet stats
    const [
      totalSnippets,
      snippetsByIntent,
      topUsedSnippets
    ] = await Promise.all([
      prisma.emailSnippet.count({
        where: businessId ? { businessId: parseInt(businessId) } : {}
      }),
      prisma.emailSnippet.groupBy({
        by: ['intent'],
        where: businessId ? { businessId: parseInt(businessId) } : {},
        _count: { id: true }
      }),
      prisma.emailSnippet.findMany({
        where: businessId ? { businessId: parseInt(businessId) } : {},
        orderBy: { usageCount: 'desc' },
        take: 10,
        select: {
          id: true,
          name: true,
          intent: true,
          usageCount: true,
          lastUsedAt: true,
          businessId: true
        }
      })
    ]);

    // 3. Draft stats (to calculate grounding/RAG usage)
    const draftsWithRAG = await prisma.emailDraft.count({
      where: {
        createdAt: { gte: cutoffDate },
        ...(businessId ? {
          thread: { businessId: parseInt(businessId) }
        } : {}),
        metadata: {
          path: ['ragExamplesUsed'],
          gte: 1
        }
      }
    });

    const totalDrafts = await prisma.emailDraft.count({
      where: {
        createdAt: { gte: cutoffDate },
        ...(businessId ? {
          thread: { businessId: parseInt(businessId) }
        } : {})
      }
    });

    // 4. Calculate hit rate
    const ragHitRate = totalDrafts > 0
      ? Math.round((draftsWithRAG / totalDrafts) * 100)
      : 0;

    // 5. Business details for top embeddings
    let businessDetails = {};
    if (embeddingsByBusiness.length > 0) {
      const businessIds = embeddingsByBusiness.map(b => b.businessId);
      const businesses = await prisma.business.findMany({
        where: { id: { in: businessIds } },
        select: { id: true, name: true }
      });
      businessDetails = Object.fromEntries(
        businesses.map(b => [b.id, b.name])
      );
    }

    res.json({
      period: {
        days: parseInt(days),
        from: cutoffDate,
        to: new Date()
      },
      embeddings: {
        total: totalEmbeddings,
        byBusiness: embeddingsByBusiness.map(b => ({
          businessId: b.businessId,
          businessName: businessDetails[b.businessId] || 'Unknown',
          count: b._count.id
        })),
        byIntent: Object.fromEntries(
          embeddingsByIntent.map(i => [i.intent || 'unknown', i._count.id])
        ),
        recent: recentEmbeddings
      },
      snippets: {
        total: totalSnippets,
        byIntent: Object.fromEntries(
          snippetsByIntent.map(i => [i.intent || 'unknown', i._count.id])
        ),
        topUsed: topUsedSnippets
      },
      performance: {
        ragHitRate: `${ragHitRate}%`,
        draftsWithRAG,
        totalDrafts
      }
    });
  } catch (error) {
    console.error('Admin: Failed to get email RAG metrics:', error);
    res.status(500).json({ error: 'Email RAG metrikleri alınamadı' });
  }
});

/**
 * GET /api/admin/email-rag/business/:businessId
 * Get Email RAG stats for a specific business
 */
router.get('/email-rag/business/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    const bid = parseInt(businessId);

    // Get business info
    const business = await prisma.business.findUnique({
      where: { id: bid },
      select: {
        id: true,
        name: true,
        emailRagEnabled: true,
        emailSnippetsEnabled: true,
        emailRagMaxExamples: true,
        emailRagMaxSnippets: true
      }
    });

    if (!business) {
      return res.status(404).json({ error: 'Business bulunamadı' });
    }

    // Get embedding stats
    const [
      embeddingCount,
      oldestEmbedding,
      newestEmbedding,
      embeddingsByIntent
    ] = await Promise.all([
      prisma.emailEmbedding.count({ where: { businessId: bid } }),
      prisma.emailEmbedding.findFirst({
        where: { businessId: bid },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true }
      }),
      prisma.emailEmbedding.findFirst({
        where: { businessId: bid },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
      }),
      prisma.emailEmbedding.groupBy({
        by: ['intent'],
        where: { businessId: bid },
        _count: { id: true }
      })
    ]);

    // Get snippet stats
    const [
      snippetCount,
      snippets
    ] = await Promise.all([
      prisma.emailSnippet.count({ where: { businessId: bid } }),
      prisma.emailSnippet.findMany({
        where: { businessId: bid },
        orderBy: { usageCount: 'desc' },
        select: {
          id: true,
          name: true,
          intent: true,
          language: true,
          usageCount: true,
          lastUsedAt: true,
          enabled: true
        }
      })
    ]);

    res.json({
      business: {
        id: business.id,
        name: business.name,
        ragEnabled: business.emailRagEnabled,
        snippetsEnabled: business.emailSnippetsEnabled,
        maxExamples: business.emailRagMaxExamples,
        maxSnippets: business.emailRagMaxSnippets
      },
      embeddings: {
        total: embeddingCount,
        oldest: oldestEmbedding?.createdAt,
        newest: newestEmbedding?.createdAt,
        byIntent: Object.fromEntries(
          embeddingsByIntent.map(i => [i.intent || 'unknown', i._count.id])
        )
      },
      snippets: {
        total: snippetCount,
        list: snippets
      }
    });
  } catch (error) {
    console.error('Admin: Failed to get business RAG stats:', error);
    res.status(500).json({ error: 'Business RAG istatistikleri alınamadı' });
  }
});

/**
 * PATCH /api/admin/email-rag/business/:businessId/settings
 * Update business RAG settings
 */
router.patch('/email-rag/business/:businessId/settings', async (req, res) => {
  try {
    const { businessId } = req.params;
    const { ragEnabled, snippetsEnabled, maxExamples, maxSnippets } = req.body;

    const bid = parseInt(businessId);

    const current = await prisma.business.findUnique({
      where: { id: bid },
      select: {
        emailRagEnabled: true,
        emailSnippetsEnabled: true,
        emailRagMaxExamples: true,
        emailRagMaxSnippets: true
      }
    });

    if (!current) {
      return res.status(404).json({ error: 'Business bulunamadı' });
    }

    const updates = {};
    const changes = {};

    if (ragEnabled !== undefined) {
      updates.emailRagEnabled = ragEnabled;
      changes.emailRagEnabled = { old: current.emailRagEnabled, new: ragEnabled };
    }
    if (snippetsEnabled !== undefined) {
      updates.emailSnippetsEnabled = snippetsEnabled;
      changes.emailSnippetsEnabled = { old: current.emailSnippetsEnabled, new: snippetsEnabled };
    }
    if (maxExamples !== undefined) {
      updates.emailRagMaxExamples = maxExamples;
      changes.emailRagMaxExamples = { old: current.emailRagMaxExamples, new: maxExamples };
    }
    if (maxSnippets !== undefined) {
      updates.emailRagMaxSnippets = maxSnippets;
      changes.emailRagMaxSnippets = { old: current.emailRagMaxSnippets, new: maxSnippets };
    }

    const updated = await prisma.business.update({
      where: { id: bid },
      data: updates,
      select: {
        id: true,
        name: true,
        emailRagEnabled: true,
        emailSnippetsEnabled: true,
        emailRagMaxExamples: true,
        emailRagMaxSnippets: true
      }
    });

    await logAuditAction(req.admin, 'UPDATE', 'Business', businessId, changes, req);

    res.json({
      success: true,
      business: updated
    });
  } catch (error) {
    console.error('Admin: Failed to update business RAG settings:', error);
    res.status(500).json({ error: 'RAG ayarları güncellenemedi' });
  }
});

// ==================== AUDIT LOG ====================

/**
 * GET /api/admin/audit-log
 * List audit logs
 */
router.get('/audit-log', async (req, res) => {
  try {
    const { adminId, entityType, action, startDate, endDate, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};

    if (adminId) where.adminId = adminId;
    if (entityType) where.entityType = entityType;
    if (action) where.action = action;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          admin: { select: { email: true, name: true, role: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.auditLog.count({ where })
    ]);

    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Admin: Failed to list audit logs:', error);
    res.status(500).json({ error: 'Audit log alınamadı' });
  }
});

export default router;
