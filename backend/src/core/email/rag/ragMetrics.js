/**
 * RAG Metrics Service
 *
 * Tracks RAG performance:
 * - Latency (retrieval time)
 * - Token usage (before/after RAG)
 * - Hit rate (found examples vs not)
 * - Business-level enable/disable
 */

import prisma from '../../../prismaClient.js';

// In-memory metrics buffer (flush to DB periodically)
const metricsBuffer = [];
const BUFFER_FLUSH_SIZE = 100;
const BUFFER_FLUSH_INTERVAL = 60000; // 1 minute

// Flush timer
let flushTimer = null;

/**
 * Record RAG retrieval metrics
 */
export function recordRAGMetrics({
  businessId,
  threadId,
  retrievalLatencyMs,
  examplesFound,
  snippetsFound,
  promptTokensBefore,
  promptTokensAfter,
  ragEnabled,
  snippetsEnabled
}) {
  const metric = {
    businessId,
    threadId,
    timestamp: new Date(),
    retrievalLatencyMs,
    examplesFound: examplesFound || 0,
    snippetsFound: snippetsFound || 0,
    promptTokensBefore: promptTokensBefore || 0,
    promptTokensAfter: promptTokensAfter || 0,
    tokenIncrease: (promptTokensAfter || 0) - (promptTokensBefore || 0),
    tokenIncreasePercent: promptTokensBefore > 0
      ? Math.round(((promptTokensAfter - promptTokensBefore) / promptTokensBefore) * 100)
      : 0,
    ragEnabled: ragEnabled !== false,
    snippetsEnabled: snippetsEnabled !== false
  };

  metricsBuffer.push(metric);

  // Log for immediate visibility
  console.log(`📊 [RAGMetrics] Business ${businessId}: ` +
    `latency=${retrievalLatencyMs}ms, ` +
    `examples=${examplesFound}, ` +
    `snippets=${snippetsFound}, ` +
    `tokens +${metric.tokenIncreasePercent}%`);

  // Flush if buffer is full
  if (metricsBuffer.length >= BUFFER_FLUSH_SIZE) {
    flushMetrics().catch(console.error);
  }

  // Ensure flush timer is running
  if (!flushTimer) {
    flushTimer = setInterval(() => {
      flushMetrics().catch(console.error);
    }, BUFFER_FLUSH_INTERVAL);
  }

  return metric;
}

/**
 * Flush metrics buffer to database
 */
async function flushMetrics() {
  if (metricsBuffer.length === 0) return;

  const toFlush = metricsBuffer.splice(0, metricsBuffer.length);

  try {
    // Aggregate by business for summary stats
    const byBusiness = new Map();

    for (const m of toFlush) {
      if (!byBusiness.has(m.businessId)) {
        byBusiness.set(m.businessId, {
          count: 0,
          totalLatency: 0,
          totalExamples: 0,
          totalSnippets: 0,
          totalTokenIncrease: 0
        });
      }

      const agg = byBusiness.get(m.businessId);
      agg.count++;
      agg.totalLatency += m.retrievalLatencyMs || 0;
      agg.totalExamples += m.examplesFound || 0;
      agg.totalSnippets += m.snippetsFound || 0;
      agg.totalTokenIncrease += m.tokenIncreasePercent || 0;
    }

    // Log aggregated stats
    for (const [businessId, agg] of byBusiness) {
      console.log(`📈 [RAGMetrics] Business ${businessId} summary: ` +
        `count=${agg.count}, ` +
        `avgLatency=${Math.round(agg.totalLatency / agg.count)}ms, ` +
        `avgTokenIncrease=${Math.round(agg.totalTokenIncrease / agg.count)}%`);
    }

    // Could persist to DB here if needed
    // await prisma.ragMetric.createMany({ data: toFlush });

  } catch (error) {
    console.error('❌ [RAGMetrics] Flush failed:', error);
    // Put back in buffer
    metricsBuffer.unshift(...toFlush);
  }
}

/**
 * Get RAG settings for a business
 */
export async function getBusinessRAGSettings(businessId) {
  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        emailRagEnabled: true,
        emailSnippetsEnabled: true,
        emailRagMaxExamples: true,
        emailRagMaxSnippets: true,
        emailRagMinConfidence: true
      }
    });

    if (!business) {
      return {
        ragEnabled: true,
        snippetsEnabled: true,
        maxRAGExamples: 3,
        maxSnippets: 2,
        minConfidence: 0.7
      };
    }

    // Use business settings with fallback defaults
    return {
      ragEnabled: business.emailRagEnabled ?? true,
      snippetsEnabled: business.emailSnippetsEnabled ?? true,
      maxRAGExamples: business.emailRagMaxExamples ?? 3,
      maxSnippets: business.emailRagMaxSnippets ?? 2,
      minConfidence: business.emailRagMinConfidence ?? 0.7
    };

  } catch (error) {
    console.error('❌ [RAGMetrics] Failed to get settings:', error);
    return {
      ragEnabled: true,
      snippetsEnabled: true,
      maxRAGExamples: 3,
      maxSnippets: 2
    };
  }
}

/**
 * Check if RAG should be used for this request
 * Considers business settings, classification confidence, and performance thresholds
 */
export async function shouldUseRAG(businessId, options = {}) {
  const settings = await getBusinessRAGSettings(businessId);

  // Check business-level enable
  if (!settings.ragEnabled) {
    return { useRAG: false, useSnippets: false, reason: 'BUSINESS_DISABLED' };
  }

  // Check explicit option override
  if (options.enableRAG === false) {
    return { useRAG: false, useSnippets: settings.snippetsEnabled, reason: 'OPTION_DISABLED' };
  }

  // CRITICAL: Classification confidence gating
  // If classification is uncertain, disable RAG/snippets to prevent mismatched examples
  const classification = options.classification;
  const minConfidence = settings.minConfidence || 0.7; // Business-specific or default 70%

  if (classification && classification.confidence !== undefined) {
    if (classification.confidence < minConfidence) {
      console.log(`⚠️ [RAG] Classification confidence too low (${classification.confidence} < ${minConfidence}) - disabling RAG/snippets`);
      return {
        useRAG: false,
        useSnippets: false,
        maxExamples: 0,
        maxSnippets: 0,
        minConfidence,
        reason: 'LOW_CLASSIFICATION_CONFIDENCE'
      };
    }
  }

  return {
    useRAG: settings.ragEnabled,
    useSnippets: settings.snippetsEnabled,
    maxExamples: settings.maxRAGExamples || 3,
    maxSnippets: settings.maxSnippets || 2,
    minConfidence: settings.minConfidence || 0.7,
    reason: 'ENABLED'
  };
}

/**
 * Get p95 latency for a business
 */
export function getP95Latency(businessId) {
  const businessMetrics = metricsBuffer.filter(m => m.businessId === businessId);

  if (businessMetrics.length < 10) {
    return null; // Not enough data
  }

  const latencies = businessMetrics
    .map(m => m.retrievalLatencyMs)
    .filter(l => l > 0)
    .sort((a, b) => a - b);

  const p95Index = Math.floor(latencies.length * 0.95);
  return latencies[p95Index] || null;
}

/**
 * Get average token increase for a business
 */
export function getAvgTokenIncrease(businessId) {
  const businessMetrics = metricsBuffer.filter(m => m.businessId === businessId);

  if (businessMetrics.length === 0) {
    return null;
  }

  const total = businessMetrics.reduce((sum, m) => sum + (m.tokenIncreasePercent || 0), 0);
  return Math.round(total / businessMetrics.length);
}

export default {
  recordRAGMetrics,
  getBusinessRAGSettings,
  shouldUseRAG,
  getP95Latency,
  getAvgTokenIncrease
};
