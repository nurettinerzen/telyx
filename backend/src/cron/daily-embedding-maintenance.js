/**
 * Daily Embedding Maintenance Cron
 *
 * Runs at 3 AM daily (low traffic period)
 *
 * Tasks:
 * 1. Index new OUTBOUND emails sent yesterday
 * 2. Cleanup old embeddings (TTL enforcement: 180 days)
 * 3. Deduplication check (remove duplicate contentHash)
 * 4. Enforce embedding cap (max 100K per business)
 *
 * NOT a backfill job - only processes yesterday's emails
 */

import cron from 'node-cron';
import prisma from '../prismaClient.js';
import { generateEmbedding } from '../core/email/rag/embeddingService.js';
import { createHash } from 'crypto';

// Configuration
const EMBEDDING_TTL_DAYS = 180; // 6 months
const MAX_EMBEDDINGS_PER_BUSINESS = 100000; // 100K cap
const RATE_LIMIT_MS = 20; // 20ms between OpenAI calls (~50 RPS)

/**
 * Daily embedding maintenance
 */
async function dailyEmbeddingMaintenance() {
  const startTime = Date.now();
  console.log(`🔄 [DailyMaintenance] Starting at ${new Date().toISOString()}`);

  try {
    // ============================================
    // Task 1: Index yesterday's OUTBOUND emails
    // ============================================
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const today = new Date();

    // Only for businesses with RAG enabled
    const ragEnabledBusinesses = await prisma.business.findMany({
      where: {
        emailRagEnabled: true
      },
      select: { id: true }
    });

    const businessIds = ragEnabledBusinesses.map(b => b.id);

    if (businessIds.length === 0) {
      console.log(`⏭️  [DailyMaintenance] No businesses with RAG enabled`);
    } else {
      console.log(`📧 [DailyMaintenance] Processing ${businessIds.length} RAG-enabled businesses`);

      const newEmails = await prisma.emailThread.findMany({
        where: {
          businessId: { in: businessIds },
          direction: 'OUTBOUND',
          sentAt: { gte: yesterday, lt: today },
          // Not already embedded
          embeddings: {
            none: {}
          }
        },
        select: {
          id: true,
          businessId: true,
          subject: true,
          bodyPlain: true,
          classification: true,
          sentAt: true
        }
      });

      console.log(`📧 [DailyMaintenance] Indexing ${newEmails.length} new emails from yesterday`);

      let indexed = 0;
      let skipped = 0;
      let errors = 0;

      for (const email of newEmails) {
        try {
          // Skip if no body or too short
          if (!email.bodyPlain || email.bodyPlain.length < 50) {
            skipped++;
            continue;
          }

          // Generate content hash
          const contentHash = createHash('sha256')
            .update(email.subject + email.bodyPlain)
            .digest('hex')
            .substring(0, 16);

          // Check for duplicate
          const existing = await prisma.emailEmbedding.findFirst({
            where: {
              businessId: email.businessId,
              contentHash
            }
          });

          if (existing) {
            console.log(`⏭️  [DailyMaintenance] Duplicate: ${email.id}`);
            skipped++;
            continue;
          }

          // Generate embedding
          const text = `${email.subject}\n\n${email.bodyPlain}`;
          const embedding = await generateEmbedding(text);

          if (!embedding || embedding.length !== 1536) {
            console.error(`❌ [DailyMaintenance] Invalid embedding: ${email.id}`);
            errors++;
            continue;
          }

          // Save to DB
          await prisma.emailEmbedding.create({
            data: {
              businessId: email.businessId,
              emailId: email.id,
              subject: email.subject,
              bodyPlain: email.bodyPlain,
              embedding,
              contentHash,
              intent: email.classification?.intent || null,
              language: email.classification?.language || null,
              direction: 'OUTBOUND',
              sentAt: email.sentAt
            }
          });

          indexed++;

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));

        } catch (error) {
          console.error(`❌ [DailyMaintenance] Error indexing ${email.id}:`, error.message);
          errors++;
        }
      }

      console.log(`✅ [DailyMaintenance] Task 1 Complete: indexed=${indexed}, skipped=${skipped}, errors=${errors}`);
    }

    // ============================================
    // Task 2: Cleanup old embeddings (TTL)
    // ============================================
    const ttlCutoff = new Date(Date.now() - EMBEDDING_TTL_DAYS * 24 * 60 * 60 * 1000);

    const deleted = await prisma.emailEmbedding.deleteMany({
      where: {
        sentAt: { lt: ttlCutoff }
      }
    });

    console.log(`🗑️  [DailyMaintenance] Task 2 Complete: Deleted ${deleted.count} old embeddings (TTL: ${EMBEDDING_TTL_DAYS} days)`);

    // ============================================
    // Task 3: Deduplication check
    // ============================================
    // Find duplicate contentHash entries
    const duplicates = await prisma.$queryRaw`
      SELECT "businessId", "contentHash", COUNT(*) as count
      FROM "EmailEmbedding"
      GROUP BY "businessId", "contentHash"
      HAVING COUNT(*) > 1
    `;

    if (duplicates.length > 0) {
      console.warn(`⚠️ [DailyMaintenance] Task 3: Found ${duplicates.length} duplicate contentHash groups`);

      let dedupCount = 0;

      for (const dup of duplicates) {
        // Keep newest, delete older
        const entries = await prisma.emailEmbedding.findMany({
          where: {
            businessId: dup.businessId,
            contentHash: dup.contentHash
          },
          orderBy: { createdAt: 'desc' }
        });

        // Delete all except first (newest)
        const toDelete = entries.slice(1).map(e => e.id);

        if (toDelete.length > 0) {
          await prisma.emailEmbedding.deleteMany({
            where: { id: { in: toDelete } }
          });
          dedupCount += toDelete.length;
        }
      }

      console.log(`✅ [DailyMaintenance] Task 3 Complete: Removed ${dedupCount} duplicate embeddings`);
    } else {
      console.log(`✅ [DailyMaintenance] Task 3 Complete: No duplicates found`);
    }

    // ============================================
    // Task 4: Enforce embedding cap per business
    // ============================================
    const businessCounts = await prisma.emailEmbedding.groupBy({
      by: ['businessId'],
      _count: {
        id: true
      },
      having: {
        id: {
          _count: {
            gt: MAX_EMBEDDINGS_PER_BUSINESS
          }
        }
      }
    });

    if (businessCounts.length > 0) {
      console.warn(`⚠️ [DailyMaintenance] Task 4: ${businessCounts.length} businesses over cap (${MAX_EMBEDDINGS_PER_BUSINESS})`);

      let capEnforced = 0;

      for (const biz of businessCounts) {
        const count = biz._count.id;
        const toDelete = count - MAX_EMBEDDINGS_PER_BUSINESS;

        console.log(`🚨 [DailyMaintenance] Business ${biz.businessId} over cap: ${count}/${MAX_EMBEDDINGS_PER_BUSINESS} (deleting ${toDelete} oldest)`);

        // Find oldest embeddings
        const oldest = await prisma.emailEmbedding.findMany({
          where: { businessId: biz.businessId },
          orderBy: { sentAt: 'asc' },
          take: toDelete,
          select: { id: true }
        });

        // Delete oldest
        const result = await prisma.emailEmbedding.deleteMany({
          where: { id: { in: oldest.map(e => e.id) } }
        });

        capEnforced += result.count;
      }

      console.log(`✅ [DailyMaintenance] Task 4 Complete: Deleted ${capEnforced} embeddings to enforce cap`);
    } else {
      console.log(`✅ [DailyMaintenance] Task 4 Complete: All businesses under cap`);
    }

    // ============================================
    // Summary
    // ============================================
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`✅ [DailyMaintenance] All tasks complete in ${elapsed}s`);

  } catch (error) {
    console.error(`❌ [DailyMaintenance] Fatal error:`, error);
  } finally {
    await prisma.$disconnect();
  }
}

// ============================================
// Cron Schedule: 3 AM daily
// ============================================

cron.schedule('0 3 * * *', () => {
  console.log(`🕐 [DailyMaintenance] Cron triggered at ${new Date().toISOString()}`);
  dailyEmbeddingMaintenance();
});

console.log(`✅ [DailyMaintenance] Cron scheduled: 3 AM daily`);

// Export for manual execution
export default { dailyEmbeddingMaintenance };
