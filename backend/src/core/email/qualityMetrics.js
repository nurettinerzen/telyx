/**
 * Draft Quality Metrics
 *
 * Tracks human feedback on AI-generated drafts:
 * 1. Edit Distance: How much the user changed the draft
 * 2. Discard Rate: % of drafts rejected without sending
 * 3. Time to Send: How long user reviews before sending
 * 4. Approval Rate: % of drafts sent with minimal edits
 *
 * These metrics create a feedback loop for RAG/snippet quality.
 */

import prisma from '../../prismaClient.js';

/**
 * Calculate Levenshtein distance (edit distance) between two strings
 */
function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,    // deletion
          dp[i][j - 1] + 1,    // insertion
          dp[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Normalize text for fair edit distance comparison
 *
 * Removes:
 * - Email signatures (common patterns)
 * - Quoted text (> or |)
 * - Email headers (From:, To:, etc.)
 * - Extra whitespace
 */
function normalizeForComparison(text) {
  if (!text) return '';

  let normalized = text;

  // Remove common signature patterns
  const signaturePatterns = [
    /--\s*\n[\s\S]*/,  // -- separator
    /_{3,}\s*\n[\s\S]*/,  // ___ separator
    /Best regards[\s\S]*/i,
    /Kind regards[\s\S]*/i,
    /Sincerely[\s\S]*/i,
    /Saygılarımla[\s\S]*/i,
    /İyi günler[\s\S]*/i,
    /Teşekkürler[\s\S]*/i
  ];

  for (const pattern of signaturePatterns) {
    const match = normalized.match(pattern);
    if (match && match.index > normalized.length * 0.6) {
      // Only remove if it's in the last 40% of text (likely a signature)
      normalized = normalized.substring(0, match.index);
      break;
    }
  }

  // Remove quoted text (lines starting with > or |)
  normalized = normalized
    .split('\n')
    .filter(line => !line.trim().startsWith('>') && !line.trim().startsWith('|'))
    .join('\n');

  // Remove email headers (From:, To:, Subject:, etc.)
  normalized = normalized.replace(/^(From|To|Cc|Bcc|Subject|Date):[^\n]+\n/gim, '');

  // Normalize whitespace
  normalized = normalized
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines

  return normalized;
}

/**
 * Calculate edit distance percentage
 * 0% = no changes, 100% = completely different
 *
 * NOTE: Normalizes text before comparison to ignore signatures/quoted text
 */
export function calculateEditDistancePercent(original, edited) {
  if (!original || !edited) return 100;

  // Normalize both texts for fair comparison
  const norm1 = normalizeForComparison(original);
  const norm2 = normalizeForComparison(edited);

  if (norm1 === norm2) return 0; // Identical

  // Handle edge case: very short texts
  if (norm1.length < 10 || norm2.length < 10) {
    return norm1 === norm2 ? 0 : 100;
  }

  const distance = levenshteinDistance(norm1, norm2);
  const maxLength = Math.max(norm1.length, norm2.length);

  return Math.round((distance / maxLength) * 100);
}

/**
 * Record draft approval event
 * Called when user sends the draft
 */
export async function recordDraftApproval({
  draftId,
  editedContent,
  timeToSendSeconds,
  sentMessageId
}) {
  try {
    // Get original draft
    const draft = await prisma.emailDraft.findUnique({
      where: { id: draftId },
      select: {
        generatedContent: true,
        businessId: true,
        threadId: true,
        createdAt: true,
        metadata: true
      }
    });

    if (!draft) {
      console.error('❌ [QualityMetrics] Draft not found:', draftId);
      return null;
    }

    // Calculate edit distance
    const editDistancePercent = calculateEditDistancePercent(
      draft.generatedContent,
      editedContent
    );

    // Classify edit level
    let editLevel;
    if (editDistancePercent === 0) editLevel = 'NONE';
    else if (editDistancePercent < 10) editLevel = 'MINOR';
    else if (editDistancePercent < 30) editLevel = 'MODERATE';
    else editLevel = 'MAJOR';

    // Calculate time to send
    const actualTimeToSend = timeToSendSeconds ||
      Math.floor((new Date() - new Date(draft.createdAt)) / 1000);

    // Update draft with quality metrics
    await prisma.emailDraft.update({
      where: { id: draftId },
      data: {
        editedContent,
        status: 'SENT',
        sentAt: new Date(),
        sentMessageId,
        metadata: {
          ...draft.metadata,
          qualityMetrics: {
            editDistancePercent,
            editLevel,
            timeToSendSeconds: actualTimeToSend,
            approved: true,
            recordedAt: new Date().toISOString()
          }
        }
      }
    });

    console.log(`📊 [QualityMetrics] Draft approved: edit=${editDistancePercent}%, time=${actualTimeToSend}s, level=${editLevel}`);

    return {
      editDistancePercent,
      editLevel,
      timeToSendSeconds: actualTimeToSend,
      approved: true
    };

  } catch (error) {
    console.error('❌ [QualityMetrics] Failed to record approval:', error);
    return null;
  }
}

/**
 * Record draft rejection/discard event
 * Called when user deletes or rejects the draft
 */
export async function recordDraftRejection({
  draftId,
  reason
}) {
  try {
    const draft = await prisma.emailDraft.findUnique({
      where: { id: draftId },
      select: { metadata: true, createdAt: true }
    });

    if (!draft) {
      console.error('❌ [QualityMetrics] Draft not found:', draftId);
      return null;
    }

    const timeToReject = Math.floor((new Date() - new Date(draft.createdAt)) / 1000);

    await prisma.emailDraft.update({
      where: { id: draftId },
      data: {
        status: 'REJECTED',
        metadata: {
          ...draft.metadata,
          qualityMetrics: {
            approved: false,
            rejected: true,
            rejectionReason: reason,
            timeToRejectSeconds: timeToReject,
            recordedAt: new Date().toISOString()
          }
        }
      }
    });

    console.log(`📊 [QualityMetrics] Draft rejected: reason=${reason}, time=${timeToReject}s`);

    return {
      rejected: true,
      reason,
      timeToRejectSeconds: timeToReject
    };

  } catch (error) {
    console.error('❌ [QualityMetrics] Failed to record rejection:', error);
    return null;
  }
}

/**
 * Get quality metrics for a business
 */
export async function getBusinessQualityMetrics(businessId, days = 30) {
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const drafts = await prisma.emailDraft.findMany({
      where: {
        businessId,
        createdAt: { gte: since }
      },
      select: {
        id: true,
        status: true,
        metadata: true,
        createdAt: true,
        sentAt: true
      }
    });

    if (drafts.length === 0) {
      return {
        totalDrafts: 0,
        approvalRate: 0,
        discardRate: 0,
        avgEditDistance: 0,
        avgTimeToSend: 0
      };
    }

    // Calculate metrics
    const approved = drafts.filter(d => d.metadata?.qualityMetrics?.approved);
    const rejected = drafts.filter(d => d.metadata?.qualityMetrics?.rejected);

    const editDistances = approved
      .map(d => d.metadata?.qualityMetrics?.editDistancePercent)
      .filter(e => e !== undefined);

    const timeToSends = approved
      .map(d => d.metadata?.qualityMetrics?.timeToSendSeconds)
      .filter(t => t !== undefined);

    const metrics = {
      totalDrafts: drafts.length,
      approvedDrafts: approved.length,
      rejectedDrafts: rejected.length,
      pendingDrafts: drafts.length - approved.length - rejected.length,

      approvalRate: Math.round((approved.length / drafts.length) * 100),
      discardRate: Math.round((rejected.length / drafts.length) * 100),

      avgEditDistance: editDistances.length > 0
        ? Math.round(editDistances.reduce((a, b) => a + b, 0) / editDistances.length)
        : 0,

      avgTimeToSend: timeToSends.length > 0
        ? Math.round(timeToSends.reduce((a, b) => a + b, 0) / timeToSends.length)
        : 0,

      editLevelDistribution: {
        none: approved.filter(d => d.metadata?.qualityMetrics?.editLevel === 'NONE').length,
        minor: approved.filter(d => d.metadata?.qualityMetrics?.editLevel === 'MINOR').length,
        moderate: approved.filter(d => d.metadata?.qualityMetrics?.editLevel === 'MODERATE').length,
        major: approved.filter(d => d.metadata?.qualityMetrics?.editLevel === 'MAJOR').length
      }
    };

    console.log(`📊 [QualityMetrics] Business ${businessId} (${days}d): ` +
      `approval=${metrics.approvalRate}%, ` +
      `avgEdit=${metrics.avgEditDistance}%, ` +
      `avgTime=${metrics.avgTimeToSend}s`);

    return metrics;

  } catch (error) {
    console.error('❌ [QualityMetrics] Failed to get metrics:', error);
    return null;
  }
}

/**
 * Get quality trend over time
 */
export async function getQualityTrend(businessId, days = 90) {
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const drafts = await prisma.emailDraft.findMany({
      where: {
        businessId,
        createdAt: { gte: since },
        status: { in: ['SENT', 'REJECTED'] }
      },
      select: {
        createdAt: true,
        metadata: true
      },
      orderBy: { createdAt: 'asc' }
    });

    // Group by week
    const weeklyData = new Map();

    for (const draft of drafts) {
      const weekStart = new Date(draft.createdAt);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];

      if (!weeklyData.has(weekKey)) {
        weeklyData.set(weekKey, {
          total: 0,
          approved: 0,
          totalEditDistance: 0,
          editCount: 0
        });
      }

      const week = weeklyData.get(weekKey);
      week.total++;

      if (draft.metadata?.qualityMetrics?.approved) {
        week.approved++;
        if (draft.metadata.qualityMetrics.editDistancePercent !== undefined) {
          week.totalEditDistance += draft.metadata.qualityMetrics.editDistancePercent;
          week.editCount++;
        }
      }
    }

    // Convert to array
    const trend = Array.from(weeklyData.entries()).map(([week, data]) => ({
      week,
      approvalRate: Math.round((data.approved / data.total) * 100),
      avgEditDistance: data.editCount > 0
        ? Math.round(data.totalEditDistance / data.editCount)
        : 0,
      totalDrafts: data.total
    }));

    return trend;

  } catch (error) {
    console.error('❌ [QualityMetrics] Failed to get trend:', error);
    return [];
  }
}

export default {
  calculateEditDistancePercent,
  recordDraftApproval,
  recordDraftRejection,
  getBusinessQualityMetrics,
  getQualityTrend
};
