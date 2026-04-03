/**
 * Admin RAG Metrics API Routes
 *
 * Provides real-time metrics for Phase 4 pilot monitoring
 * All endpoints read from live database
 *
 * SECURITY: All routes require authentication + admin privileges
 */

import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';
import { isAdmin } from '../middleware/adminAuth.js';

const router = express.Router();

// CRITICAL: Apply auth + admin middleware to ALL routes
router.use(authenticateToken);
router.use(isAdmin);

// ============================================
// GET /api/admin/email-rag/metrics/overview
// ============================================
// Returns high-level metrics for last 24h
router.get('/metrics/overview', async (req, res) => {
  try {
    const { businessId } = req.query;
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Draft success rate
    const totalEmails = await prisma.emailThread.count({
      where: {
        businessId: businessId ? parseInt(businessId) : undefined,
        createdAt: { gte: since24h }
      }
    });

    const successfulDrafts = await prisma.emailDraft.count({
      where: {
        businessId: businessId ? parseInt(businessId) : undefined,
        createdAt: { gte: since24h },
        status: { not: 'ERROR' }
      }
    });

    const draftSuccessRate = totalEmails > 0
      ? Math.round((successfulDrafts / totalEmails) * 100)
      : 0;

    // Hallucination count (from incident logs)
    const hallucinationCount = 0; // TODO: Implement HallucinationIncident table

    // Approval rate (last 7 days)
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const sentDrafts = await prisma.emailDraft.count({
      where: {
        businessId: businessId ? parseInt(businessId) : undefined,
        createdAt: { gte: since7d },
        status: 'SENT'
      }
    });

    const allDrafts = await prisma.emailDraft.count({
      where: {
        businessId: businessId ? parseInt(businessId) : undefined,
        createdAt: { gte: since7d },
        status: { in: ['SENT', 'REJECTED', 'DISCARDED'] }
      }
    });

    const approvalRate = allDrafts > 0
      ? Math.round((sentDrafts / allDrafts) * 100)
      : 0;

    // RAG metrics
    const ragDrafts = await prisma.emailDraft.findMany({
      where: {
        businessId: businessId ? parseInt(businessId) : undefined,
        createdAt: { gte: since24h },
        metadata: {
          path: ['ragEnabled'],
          equals: true
        }
      },
      select: {
        metadata: true
      }
    });

    const ragUsedCount = ragDrafts.filter(d =>
      d.metadata?.ragExamplesUsed > 0
    ).length;

    const ragHitRate = ragDrafts.length > 0
      ? Math.round((ragUsedCount / ragDrafts.length) * 100)
      : 0;

    // RAG latency p95 (in-memory calculation)
    const ragLatencies = ragDrafts
      .map(d => d.metadata?.ragLatencyMs)
      .filter(l => l !== undefined && l !== null)
      .sort((a, b) => a - b);

    const p95Index = Math.floor(ragLatencies.length * 0.95);
    const ragLatencyP95 = ragLatencies.length > 0 ? ragLatencies[p95Index] : 0;

    res.json({
      success: true,
      period: '24h',
      metrics: {
        draftSuccessRate: {
          value: draftSuccessRate,
          target: 95,
          status: draftSuccessRate >= 95 ? 'OK' : 'WARNING',
          total: totalEmails,
          successful: successfulDrafts
        },
        hallucinationCount: {
          value: hallucinationCount,
          target: 0,
          status: hallucinationCount === 0 ? 'OK' : 'CRITICAL'
        },
        approvalRate: {
          value: approvalRate,
          target: 70,
          status: approvalRate >= 70 ? 'OK' : 'WARNING',
          period: '7d',
          sent: sentDrafts,
          total: allDrafts
        },
        ragHitRate: {
          value: ragHitRate,
          target: 60,
          status: ragHitRate >= 60 ? 'OK' : 'WARNING',
          totalRAGDrafts: ragDrafts.length,
          ragUsed: ragUsedCount
        },
        ragLatencyP95: {
          value: ragLatencyP95,
          unit: 'ms',
          target: 200,
          status: ragLatencyP95 <= 200 ? 'OK' : 'WARNING',
          samples: ragLatencies.length
        }
      }
    });

  } catch (error) {
    console.error('❌ [AdminRAGMetrics] Error fetching overview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch metrics',
      message: error.message
    });
  }
});

// ============================================
// GET /api/admin/email-rag/metrics/verification-rate
// ============================================
// Returns verification rate by intent (tool-required intents)
router.get('/metrics/verification-rate', async (req, res) => {
  try {
    const { businessId } = req.query;
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const toolRequiredIntents = [
      'ORDER', 'BILLING', 'APPOINTMENT', 'COMPLAINT',
      'TRACKING', 'PRICING', 'STOCK', 'RETURN', 'REFUND', 'ACCOUNT'
    ];

    const drafts = await prisma.emailDraft.findMany({
      where: {
        businessId: businessId ? parseInt(businessId) : undefined,
        createdAt: { gte: since24h },
        classification: {
          path: ['intent'],
          in: toolRequiredIntents
        }
      },
      select: {
        classification: true,
        metadata: true
      }
    });

    // Group by intent
    const byIntent = {};
    for (const draft of drafts) {
      const intent = draft.classification?.intent;
      if (!intent) continue;

      if (!byIntent[intent]) {
        byIntent[intent] = { total: 0, verification: 0 };
      }

      byIntent[intent].total++;

      if (draft.metadata?.policyEnforced === 'ASK_VERIFICATION') {
        byIntent[intent].verification++;
      }
    }

    // Calculate rates
    const result = Object.entries(byIntent).map(([intent, stats]) => ({
      intent,
      total: stats.total,
      verificationCount: stats.verification,
      verificationRate: Math.round((stats.verification / stats.total) * 100),
      status: stats.verification / stats.total > 0.6 ? 'WARNING' : 'OK'
    }));

    res.json({
      success: true,
      period: '24h',
      byIntent: result,
      summary: {
        totalDrafts: drafts.length,
        avgVerificationRate: result.length > 0
          ? Math.round(result.reduce((sum, r) => sum + r.verificationRate, 0) / result.length)
          : 0
      }
    });

  } catch (error) {
    console.error('❌ [AdminRAGMetrics] Error fetching verification rate:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GET /api/admin/email-rag/metrics/edit-distance
// ============================================
// Returns edit distance distribution
router.get('/metrics/edit-distance', async (req, res) => {
  try {
    const { businessId } = req.query;
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const metrics = await prisma.emailQualityMetric.findMany({
      where: {
        businessId: businessId ? parseInt(businessId) : undefined,
        createdAt: { gte: since7d },
        editDistance: { not: null }
      },
      select: {
        editDistance: true,
        similarity: true
      }
    });

    // Calculate edit distance percentage and group into bands
    const bands = {
      '0-10': 0,    // Minimal edits
      '11-30': 0,   // Moderate edits
      '31-50': 0,   // Significant edits
      '>50': 0      // Major rewrite
    };

    for (const m of metrics) {
      // Assume editDistance is stored as percentage (0-100)
      const distPct = m.editDistance || 0;

      if (distPct <= 10) bands['0-10']++;
      else if (distPct <= 30) bands['11-30']++;
      else if (distPct <= 50) bands['31-50']++;
      else bands['>50']++;
    }

    const total = metrics.length;
    const distribution = Object.entries(bands).map(([band, count]) => ({
      band,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0
    }));

    res.json({
      success: true,
      period: '7d',
      totalSamples: total,
      distribution,
      quality: {
        excellent: bands['0-10'],  // >60% target
        good: bands['11-30'],
        fair: bands['31-50'],
        poor: bands['>50']
      }
    });

  } catch (error) {
    console.error('❌ [AdminRAGMetrics] Error fetching edit distance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GET /api/admin/email-rag/pilot-businesses
// ============================================
// Returns list of pilot businesses with RAG status
router.get('/pilot-businesses', async (req, res) => {
  try {
    const { feature = 'RAG_PILOT' } = req.query;

    const pilots = await prisma.pilotBusiness.findMany({
      where: { feature },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            emailRagEnabled: true,
            emailSnippetsEnabled: true,
            emailRagMinConfidence: true,
            emailRagMaxExamples: true
          }
        }
      },
      orderBy: { enabledAt: 'asc' }
    });

    res.json({
      success: true,
      feature,
      pilots: pilots.map(p => ({
        pilotId: p.id,
        businessId: p.businessId,
        businessName: p.business.name,
        enabledAt: p.enabledAt,
        enabledBy: p.enabledBy,
        notes: p.notes,
        settings: {
          ragEnabled: p.business.emailRagEnabled,
          snippetsEnabled: p.business.emailSnippetsEnabled,
          minConfidence: p.business.emailRagMinConfidence,
          maxExamples: p.business.emailRagMaxExamples
        }
      }))
    });

  } catch (error) {
    console.error('❌ [AdminRAGMetrics] Error fetching pilot businesses:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// POST /api/admin/email-rag/pilot-businesses/:businessId/enable
// ============================================
// Add business to pilot allowlist
router.post('/pilot-businesses/:businessId/enable', async (req, res) => {
  try {
    const { businessId } = req.params;
    const { feature = 'RAG_PILOT', enabledBy, notes } = req.body;

    if (!enabledBy) {
      return res.status(400).json({
        success: false,
        error: 'enabledBy field required (admin email)'
      });
    }

    // Insert into pilot allowlist
    const pilot = await prisma.pilotBusiness.create({
      data: {
        businessId: parseInt(businessId),
        feature,
        enabledBy,
        notes: notes || null
      }
    });

    // Enable business flags
    const updates = {};
    if (feature === 'RAG_PILOT') {
      updates.emailRagEnabled = true;
      updates.emailSnippetsEnabled = true;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.business.update({
        where: { id: parseInt(businessId) },
        data: updates
      });
    }

    console.log(`✅ [AdminRAGMetrics] Enabled ${feature} for business ${businessId} by ${enabledBy}`);

    res.json({
      success: true,
      pilot,
      message: `${feature} enabled for business ${businessId}`
    });

  } catch (error) {
    console.error('❌ [AdminRAGMetrics] Error enabling pilot:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// POST /api/admin/email-rag/rollback
// ============================================
// Emergency rollback: disable feature globally
router.post('/rollback', async (req, res) => {
  try {
    const { feature = 'RAG_PILOT', reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'reason field required for rollback'
      });
    }

    console.log(`🚨 [AdminRAGMetrics] EMERGENCY ROLLBACK: ${feature} - Reason: ${reason}`);

    // Delete all pilot entries for this feature
    const deletedPilots = await prisma.pilotBusiness.deleteMany({
      where: { feature }
    });

    // Disable business flags globally
    const updates = {};
    if (feature === 'RAG_PILOT') {
      updates.emailRagEnabled = false;
      updates.emailSnippetsEnabled = false;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.business.updateMany({
        data: updates
      });
    }

    console.error(`🚨🚨🚨 [AdminRAGMetrics] ROLLBACK COMPLETE: ${feature} - ${deletedPilots.count} businesses affected`);

    res.json({
      success: true,
      feature,
      reason,
      businessesAffected: deletedPilots.count,
      message: `${feature} disabled globally. ${deletedPilots.count} businesses affected.`
    });

  } catch (error) {
    console.error('❌ [AdminRAGMetrics] CRITICAL: Rollback failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GET /api/admin/email-rag/health
// ============================================
// Health check for monitoring
router.get('/health', async (req, res) => {
  try {
    // Check DB connection
    await prisma.$queryRaw`SELECT 1`;

    // Check critical tables exist
    const pilotCount = await prisma.pilotBusiness.count();
    const embeddingCount = await prisma.emailEmbedding.count();

    res.json({
      success: true,
      status: 'healthy',
      database: 'connected',
      tables: {
        pilotBusiness: pilotCount,
        emailEmbedding: embeddingCount
      }
    });

  } catch (error) {
    console.error('❌ [AdminRAGMetrics] Health check failed:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

export default router;
