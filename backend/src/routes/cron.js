/**
 * Cron Jobs API Routes
 *
 * These endpoints are called by external schedulers (e.g., cron-job.org, Vercel cron)
 * Protected by CRON_SECRET environment variable
 *
 * SECURITY:
 * - CRON_SECRET required (no fallback in production)
 * - Hard limits on batch sizes
 * - Job state tracking to prevent overlapping runs
 * - Rate limiting per job
 */

import express from 'express';
import prisma from '../prismaClient.js';
import cronJobs from '../services/cronJobs.js';
import { backfillAllBusinesses, backfillEmailEmbeddings } from '../core/email/rag/indexingHooks.js';
import { cleanupExpiredLocks } from '../core/email/policies/idempotencyPolicy.js';
import { cleanupOldEmbeddings } from '../core/email/rag/embeddingService.js';
import { requireCronSecret } from '../middleware/cronAuth.js';
import { processMarketplaceQuestions } from '../services/marketplace/qaWorker.js';
import { processComplaintThreads } from '../services/complaints/complaintWorker.js';

const router = express.Router();

// ============================================================================
// JOB STATE TRACKING
// ============================================================================

// In-memory job state (could be Redis in production)
const jobState = new Map();

// Job configuration with hard limits
const JOB_CONFIG = {
  'reset-minutes': {
    maxDuration: 5 * 60 * 1000, // 5 minutes
    cooldown: 60 * 60 * 1000    // 1 hour
  },
  'low-balance': {
    maxDuration: 2 * 60 * 1000, // 2 minutes
    cooldown: 30 * 60 * 1000    // 30 minutes
  },
  'auto-reload': {
    maxDuration: 5 * 60 * 1000, // 5 minutes
    cooldown: 10 * 60 * 1000    // 10 minutes
  },
  'trial-expired': {
    maxDuration: 5 * 60 * 1000, // 5 minutes
    cooldown: 60 * 60 * 1000    // 1 hour
  },
  'cleanup': {
    maxDuration: 10 * 60 * 1000, // 10 minutes
    cooldown: 60 * 60 * 1000     // 1 hour
  },
  'email-rag-backfill': {
    maxDuration: 30 * 60 * 1000, // 30 minutes
    cooldown: 60 * 60 * 1000,    // 1 hour
    hardLimits: {
      maxBatchSize: 100,
      maxDaysBack: 180,
      maxBusinessesPerRun: 10
    }
  },
  'email-lock-cleanup': {
    maxDuration: 2 * 60 * 1000, // 2 minutes
    cooldown: 30 * 60 * 1000   // 30 minutes
  },
  'email-embedding-cleanup': {
    maxDuration: 15 * 60 * 1000, // 15 minutes
    cooldown: 6 * 60 * 60 * 1000, // 6 hours
    hardLimits: {
      maxDeletePerRun: 5000
    }
  },
  'red-alert-health': {
    maxDuration: 1 * 60 * 1000, // 1 minute
    cooldown: 5 * 60 * 1000     // 5 minutes (prevent spam)
  },
  'marketplace-qa': {
    maxDuration: 10 * 60 * 1000, // 10 minutes
    cooldown: 5 * 60 * 1000      // 5 minutes
  },
  'complaints-sync': {
    maxDuration: 10 * 60 * 1000, // 10 minutes
    cooldown: 5 * 60 * 1000      // 5 minutes
  }
};

/**
 * Get job state
 */
function getJobState(jobName) {
  return jobState.get(jobName) || {
    isRunning: false,
    lastStarted: null,
    lastCompleted: null,
    lastError: null,
    runCount: 0
  };
}

/**
 * Check if job can run
 */
function canJobRun(jobName) {
  const state = getJobState(jobName);
  const config = JOB_CONFIG[jobName] || { maxDuration: 5 * 60 * 1000, cooldown: 60 * 1000 };

  // Check if already running (with stale check)
  if (state.isRunning) {
    const runningFor = Date.now() - state.lastStarted;
    if (runningFor < config.maxDuration) {
      return { canRun: false, reason: 'JOB_ALREADY_RUNNING', runningFor };
    }
    // Job is stale, allow override
    console.warn(`⚠️ [Cron] Job ${jobName} appears stale (${runningFor}ms), allowing new run`);
  }

  // Check cooldown
  if (state.lastCompleted) {
    const timeSinceComplete = Date.now() - state.lastCompleted;
    if (timeSinceComplete < config.cooldown) {
      const remainingCooldown = config.cooldown - timeSinceComplete;
      return { canRun: false, reason: 'COOLDOWN_ACTIVE', remainingCooldown };
    }
  }

  return { canRun: true };
}

/**
 * Mark job as started
 */
function markJobStarted(jobName) {
  const state = getJobState(jobName);
  jobState.set(jobName, {
    ...state,
    isRunning: true,
    lastStarted: Date.now(),
    runCount: state.runCount + 1
  });
}

/**
 * Mark job as completed
 */
function markJobCompleted(jobName, success, error = null) {
  const state = getJobState(jobName);
  jobState.set(jobName, {
    ...state,
    isRunning: false,
    lastCompleted: Date.now(),
    lastError: success ? null : error
  });
}

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

/**
 * DEPRECATED: Old cron secret verification (kept for reference)
 * NOW USING: requireCronSecret from ../middleware/cronAuth.js
 * - Uses hashed constant-time comparison helper
 * - Rejects query param secrets (security: secrets in headers only)
 * - Better error messages
 */
// function verifyCronSecret(req, res, next) { ... }

// Alias for backward compatibility (uses new secure middleware)
const verifyCronSecret = requireCronSecret;

/**
 * Job state check middleware
 */
function checkJobState(jobName) {
  return (req, res, next) => {
    const { canRun, reason, runningFor, remainingCooldown } = canJobRun(jobName);

    if (!canRun) {
      console.log(`⏭️ [Cron] Job ${jobName} skipped: ${reason}`);
      return res.status(429).json({
        error: 'Job cannot run',
        reason,
        details: {
          runningFor,
          remainingCooldown
        }
      });
    }

    // Mark as started
    markJobStarted(jobName);
    req.jobName = jobName;
    next();
  };
}

/**
 * Job completion wrapper
 */
function wrapJobHandler(handler) {
  return async (req, res) => {
    const jobName = req.jobName;
    try {
      const result = await handler(req, res);
      markJobCompleted(jobName, true);
      return result;
    } catch (error) {
      markJobCompleted(jobName, false, error.message);
      throw error;
    }
  };
}

// ============================================================================
// CRON ENDPOINTS
// ============================================================================

/**
 * POST /api/cron/reset-minutes
 * Reset included minutes for STARTER/PRO plans
 * Should run: First day of each month or on subscription renewal
 */
router.post('/reset-minutes',
  verifyCronSecret,
  checkJobState('reset-minutes'),
  wrapJobHandler(async (req, res) => {
    console.log('🔄 Cron: Reset included minutes triggered');
    const result = await cronJobs.resetIncludedMinutes();
    res.json({ success: true, ...result });
  })
);

/**
 * POST /api/cron/low-balance
 * Check for low balance and send warnings
 * Should run: Every hour
 */
router.post('/low-balance',
  verifyCronSecret,
  checkJobState('low-balance'),
  wrapJobHandler(async (req, res) => {
    console.log('💰 Cron: Low balance check triggered');
    const result = await cronJobs.checkLowBalance();
    res.json({ success: true, ...result });
  })
);

/**
 * POST /api/cron/auto-reload
 * Process auto-reload for eligible subscriptions
 * Should run: Every 15 minutes
 */
router.post('/auto-reload',
  verifyCronSecret,
  checkJobState('auto-reload'),
  wrapJobHandler(async (req, res) => {
    console.log('🔄 Cron: Auto-reload triggered');
    const result = await cronJobs.processAutoReload();
    res.json({ success: true, ...result });
  })
);

/**
 * POST /api/cron/trial-expired
 * Check for expired trials and notify users
 * Should run: Daily
 */
router.post('/trial-expired',
  verifyCronSecret,
  checkJobState('trial-expired'),
  wrapJobHandler(async (req, res) => {
    console.log('⏰ Cron: Trial expired check triggered');
    const result = await cronJobs.checkTrialExpired();
    res.json({ success: true, ...result });
  })
);

/**
 * POST /api/cron/cleanup
 * Clean up old usage records
 * Should run: Weekly
 */
router.post('/cleanup',
  verifyCronSecret,
  checkJobState('cleanup'),
  wrapJobHandler(async (req, res) => {
    console.log('🧹 Cron: Cleanup triggered');
    const result = await cronJobs.cleanupOldRecords();
    res.json({ success: true, ...result });
  })
);

/**
 * POST /api/cron/email-rag-backfill
 * Backfill email embeddings for RAG
 * Should run: Daily or on-demand
 */
router.post('/email-rag-backfill',
  verifyCronSecret,
  checkJobState('email-rag-backfill'),
  wrapJobHandler(async (req, res) => {
    const config = JOB_CONFIG['email-rag-backfill'].hardLimits;
    let { businessId, daysBack = 90, batchSize = 50 } = req.body;

    // Apply hard limits
    daysBack = Math.min(parseInt(daysBack) || 90, config.maxDaysBack);
    batchSize = Math.min(parseInt(batchSize) || 50, config.maxBatchSize);

    console.log(`📧 Cron: Email RAG backfill triggered (daysBack=${daysBack}, batchSize=${batchSize})`);

    let result;
    if (businessId) {
      // Single business backfill
      result = await backfillEmailEmbeddings({
        businessId: parseInt(businessId),
        daysBack,
        batchSize
      });
    } else {
      // All businesses (with limit)
      result = await backfillAllBusinesses({
        daysBack,
        batchSize,
        maxBusinesses: config.maxBusinessesPerRun
      });
    }

    res.json({
      success: true,
      message: 'Email RAG backfill completed',
      limits: { daysBack, batchSize },
      result
    });
  })
);

/**
 * POST /api/cron/email-lock-cleanup
 * Clean up expired email draft locks
 * Should run: Hourly
 */
router.post('/email-lock-cleanup',
  verifyCronSecret,
  checkJobState('email-lock-cleanup'),
  wrapJobHandler(async (req, res) => {
    console.log('🔒 Cron: Email lock cleanup triggered');
    const count = await cleanupExpiredLocks();
    res.json({
      success: true,
      message: `Cleaned up ${count} expired locks`
    });
  })
);

/**
 * POST /api/cron/email-embedding-cleanup
 * Clean up old embeddings (TTL + per-business cap)
 * Should run: Every 6 hours
 */
router.post('/email-embedding-cleanup',
  verifyCronSecret,
  checkJobState('email-embedding-cleanup'),
  wrapJobHandler(async (req, res) => {
    const config = JOB_CONFIG['email-embedding-cleanup'].hardLimits;
    const { ttlDays = 90, maxPerBusiness = 10000 } = req.body;

    console.log(`🗑️ Cron: Email embedding cleanup triggered (TTL=${ttlDays}d, cap=${maxPerBusiness})`);

    const result = await cleanupOldEmbeddings({
      ttlDays: Math.min(parseInt(ttlDays) || 90, 365),
      maxPerBusiness: Math.min(parseInt(maxPerBusiness) || 10000, 50000),
      maxDeletePerRun: config.maxDeletePerRun
    });

    res.json({
      success: true,
      message: 'Email embedding cleanup completed',
      result
    });
  })
);

/**
 * POST /api/cron/red-alert-health
 * Check Red Alert health score and send email if critical
 * Should run: Every 6 hours (12AM, 6AM, 12PM, 6PM LA time)
 */
router.post('/red-alert-health',
  verifyCronSecret,
  checkJobState('red-alert-health'),
  wrapJobHandler(async (req, res) => {
    console.log('🚨 Cron: Red Alert health check triggered');

    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Get event counts
      const [criticalCount, highCount, totalCount] = await Promise.all([
        prisma.securityEvent.count({
          where: { severity: 'critical', createdAt: { gte: last24h } },
        }),
        prisma.securityEvent.count({
          where: { severity: 'high', createdAt: { gte: last24h } },
        }),
        prisma.securityEvent.count({
          where: { createdAt: { gte: last24h } },
        }),
      ]);

      // Calculate health score
      let healthScore = 100;
      healthScore -= criticalCount * 10;
      healthScore -= highCount * 3;
      healthScore = Math.max(0, healthScore);

      let status = 'healthy';
      if (criticalCount > 0) status = 'critical';
      else if (highCount > 5) status = 'warning';
      else if (highCount > 0) status = 'caution';

      // Get critical events for email
      let criticalEvents = [];
      if (status === 'critical') {
        criticalEvents = await prisma.securityEvent.findMany({
          where: {
            severity: 'critical',
            createdAt: { gte: last24h },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            type: true,
            endpoint: true,
            ipAddress: true,
            createdAt: true,
          },
        });
      }

      const result = {
        healthScore,
        status,
        events: { critical: criticalCount, high: highCount, total: totalCount },
        criticalEvents,
        timestamp: new Date().toISOString(),
      };

      // Log result
      console.log(`🚨 Health Check Result: Score=${healthScore}, Status=${status}, Critical=${criticalCount}, High=${highCount}`);

      // TODO: Send email if critical (integrate with email service)
      // if (status === 'critical') {
      //   await sendEmail({
      //     to: 'nurettin@telyx.ai',
      //     subject: `🚨 RED ALERT: Health Score ${healthScore} (${criticalCount} critical events)`,
      //     body: JSON.stringify(criticalEvents, null, 2)
      //   });
      // }

    res.json({
      success: true,
      message: `Health check completed: ${status}`,
      ...result,
    });
  })
);

/**
 * POST /api/cron/marketplace-qa
 * Pull unanswered marketplace questions, generate AI drafts and keep them ready for approval
 * Should run: Every 5 minutes
 */
router.post('/marketplace-qa',
  verifyCronSecret,
  checkJobState('marketplace-qa'),
  wrapJobHandler(async (_req, res) => {
    console.log('🛒 Cron: Marketplace Q&A sync triggered');
    const result = await processMarketplaceQuestions();
    res.json({
      success: true,
      message: 'Marketplace Q&A sync completed',
      result
    });
  })
);

/**
 * POST /api/cron/complaints-sync
 * Pull Sikayetvar complaints, generate AI drafts and keep them ready for manual approval
 * Should run: Every 5 minutes
 */
router.post('/complaints-sync',
  verifyCronSecret,
  checkJobState('complaints-sync'),
  wrapJobHandler(async (_req, res) => {
    console.log('📝 Cron: Complaints sync triggered');
    const result = await processComplaintThreads();
    res.json({
      success: true,
      message: 'Complaints sync completed',
      result
    });
  })
);

// ============================================================================
// STATUS & HEALTH
// ============================================================================

/**
 * GET /api/cron/health
 * Health check for cron endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    secretConfigured: !!process.env.CRON_SECRET,
    jobs: Object.entries(JOB_CONFIG).map(([name, config]) => ({
      name,
      endpoint: `/api/cron/${name}`,
      maxDuration: `${config.maxDuration / 1000}s`,
      cooldown: `${config.cooldown / 60000}m`
    }))
  });
});

/**
 * GET /api/cron/status
 * Get status of all jobs (requires auth)
 */
router.get('/status', verifyCronSecret, (req, res) => {
  const status = {};
  for (const [jobName] of Object.entries(JOB_CONFIG)) {
    const state = getJobState(jobName);
    const { canRun, reason } = canJobRun(jobName);
    status[jobName] = {
      ...state,
      canRun,
      blockReason: canRun ? null : reason
    };
  }
  res.json({ status });
});

/**
 * POST /api/cron/reset-state
 * Reset job state (emergency use only)
 */
router.post('/reset-state', verifyCronSecret, (req, res) => {
  const { jobName } = req.body;

  if (jobName) {
    jobState.delete(jobName);
    console.log(`🔄 [Cron] Reset state for job: ${jobName}`);
    res.json({ success: true, message: `State reset for ${jobName}` });
  } else {
    jobState.clear();
    console.log('🔄 [Cron] Reset state for ALL jobs');
    res.json({ success: true, message: 'All job states reset' });
  }
});

export default router;
