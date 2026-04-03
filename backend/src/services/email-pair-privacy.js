/**
 * Email Pair Privacy & Data Retention
 *
 * GDPR/Privacy Compliance:
 * 1. Raw email text retention: 90 days
 * 2. After 90 days: keep only cleaned text + metadata
 * 3. User deletion: purge all pairs immediately
 * 4. Encryption at rest: handled by Supabase
 *
 * CRITICAL: Raw inbound/outbound text contains PII
 */

import prisma from '../prismaClient.js';

// Retention policy: 90 days for raw text
const RAW_TEXT_RETENTION_DAYS = 90;

/**
 * Purge raw email text older than retention period
 *
 * Keeps: cleanedText, metadata (tone, intent, etc.)
 * Removes: inboundRaw, outboundRaw
 *
 * Run daily via cron
 */
export async function purgeOldRawText() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RAW_TEXT_RETENTION_DAYS);

  console.log(`[PairPrivacy] Purging raw text older than ${RAW_TEXT_RETENTION_DAYS} days (${cutoffDate.toISOString()})`);

  try {
    const result = await prisma.emailPair.updateMany({
      where: {
        sentAt: {
          lt: cutoffDate
        },
        // Only update if raw text still exists
        OR: [
          { inboundRaw: { not: null } },
          { outboundRaw: { not: null } }
        ]
      },
      data: {
        inboundRaw: null,
        outboundRaw: null
      }
    });

    console.log(`[PairPrivacy] Purged raw text from ${result.count} pairs`);

    return { success: true, purged: result.count };
  } catch (error) {
    console.error('[PairPrivacy] Purge failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete all pairs for a business (user deletion request)
 *
 * GDPR Article 17: Right to erasure
 *
 * @param {number} businessId
 * @returns {Promise<Object>} { success, deleted }
 */
export async function deleteBusinessPairs(businessId) {
  console.log(`[PairPrivacy] GDPR deletion request for business ${businessId}`);

  try {
    const result = await prisma.emailPair.deleteMany({
      where: { businessId }
    });

    console.log(`[PairPrivacy] Deleted ${result.count} pairs for business ${businessId}`);

    return { success: true, deleted: result.count };
  } catch (error) {
    console.error('[PairPrivacy] Deletion failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get privacy report for a business
 *
 * Shows:
 * - Total pairs
 * - Pairs with raw text
 * - Oldest pair
 * - Newest pair
 *
 * @param {number} businessId
 * @returns {Promise<Object>} Privacy report
 */
export async function getPrivacyReport(businessId) {
  const total = await prisma.emailPair.count({
    where: { businessId }
  });

  const withRawText = await prisma.emailPair.count({
    where: {
      businessId,
      OR: [
        { inboundRaw: { not: null } },
        { outboundRaw: { not: null } }
      ]
    }
  });

  const oldest = await prisma.emailPair.findFirst({
    where: { businessId },
    orderBy: { sentAt: 'asc' },
    select: { sentAt: true }
  });

  const newest = await prisma.emailPair.findFirst({
    where: { businessId },
    orderBy: { sentAt: 'desc' },
    select: { sentAt: true }
  });

  return {
    total,
    withRawText,
    withoutRawText: total - withRawText,
    rawTextRetentionDays: RAW_TEXT_RETENTION_DAYS,
    oldestPair: oldest?.sentAt,
    newestPair: newest?.sentAt,
    encryptionAtRest: 'Handled by Supabase PostgreSQL'
  };
}

/**
 * Anonymize a specific pair (for testing/debugging)
 *
 * Replaces actual content with hashed version
 *
 * @param {string} pairId
 * @returns {Promise<Object>} { success }
 */
export async function anonymizePair(pairId) {
  try {
    const pair = await prisma.emailPair.findUnique({
      where: { id: pairId }
    });

    if (!pair) {
      return { success: false, error: 'Pair not found' };
    }

    // Replace with anonymized content
    await prisma.emailPair.update({
      where: { id: pairId },
      data: {
        inboundText: `[ANONYMIZED ${pair.inboundTone} email about ${pair.intent || 'general inquiry'}]`,
        outboundText: `[ANONYMIZED ${pair.outboundTone} response]`,
        inboundRaw: null,
        outboundRaw: null
      }
    });

    console.log(`[PairPrivacy] Anonymized pair ${pairId}`);

    return { success: true };
  } catch (error) {
    console.error('[PairPrivacy] Anonymization failed:', error);
    return { success: false, error: error.message };
  }
}

export default {
  purgeOldRawText,
  deleteBusinessPairs,
  getPrivacyReport,
  anonymizePair
};
