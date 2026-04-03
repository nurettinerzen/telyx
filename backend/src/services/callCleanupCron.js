// ============================================================================
// CALL CLEANUP CRON SERVICE
// ============================================================================
// FILE: backend/src/services/callCleanupCron.js
//
// P0.4: Stuck call cleanup cron (every 10 minutes)
// Reconciles Redis + DB + 11Labs state
// Releases slots for calls that ended but weren't properly cleaned up
// ============================================================================

import cron from 'node-cron';
import prisma from '../prismaClient.js';
import globalCapacityManager from './globalCapacityManager.js';

/**
 * Reconcile stuck calls across all systems
 * Called every 10 minutes by cron
 */
async function reconcileStuckCalls() {
  console.log('🧹 [CLEANUP CRON] Starting stuck call reconciliation...');
  const startTime = Date.now();

  try {
    // 1. Get all active sessions from DB
    const activeSessions = await prisma.activeCallSession.findMany({
      where: {
        status: 'active',
        startedAt: {
          lt: new Date(Date.now() - 60 * 1000) // At least 1 minute old
        }
      },
      select: {
        id: true,
        callId: true,
        businessId: true,
        plan: true,
        startedAt: true
      }
    });

    console.log(`   Found ${activeSessions.length} active sessions in DB`);

    // 2. Get Redis global status
    const redisStatus = await globalCapacityManager.getGlobalStatus();
    const redisCallIds = redisStatus.activeCalls.map(c => c.callId);

    console.log(`   Found ${redisCallIds.length} active calls in Redis`);

    // 3. Find stuck calls (in DB but not in Redis, or vice versa)
    const dbCallIds = activeSessions.map(s => s.callId);

    const stuckInDb = activeSessions.filter(s => !redisCallIds.includes(s.callId));
    const stuckInRedis = redisCallIds.filter(id => !dbCallIds.includes(id));

    console.log(`   Stuck in DB only: ${stuckInDb.length}`);
    console.log(`   Stuck in Redis only: ${stuckInRedis.length}`);

    // 4. TODO: Verify with 11Labs API (would require 11Labs integration)
    // For now, we trust that calls older than 1 hour are definitely stuck
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const veryStuckSessions = activeSessions.filter(s => s.startedAt < oneHourAgo);

    console.log(`   Very stuck (>1 hour): ${veryStuckSessions.length}`);

    // 5. Clean up stuck calls
    let cleanedCount = 0;

    // 5a. Clean up very stuck sessions (>1 hour)
    for (const session of veryStuckSessions) {
      await cleanupStuckCall(session.callId, session.businessId, 'aged_out');
      cleanedCount++;
    }

    // 5b. Clean up stuck Redis slots (not in DB)
    if (stuckInRedis.length > 0) {
      const cleanupResult = await globalCapacityManager.cleanupStuckCalls(dbCallIds);
      cleanedCount += cleanupResult.cleaned || 0;
    }

    // 5c. Clean up stuck DB sessions (not in Redis and >10 minutes old)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    for (const session of stuckInDb) {
      if (session.startedAt < tenMinutesAgo) {
        await cleanupStuckCall(session.callId, session.businessId, 'redis_missing');
        cleanedCount++;
      }
    }

    // 6. Reconcile subscription.activeCalls with ActiveCallSession count
    const businessCounts = await prisma.activeCallSession.groupBy({
      by: ['businessId'],
      where: { status: 'active' },
      _count: { id: true }
    });

    for (const { businessId, _count } of businessCounts) {
      const subscription = await prisma.subscription.findUnique({
        where: { businessId },
        select: { activeCalls: true }
      });

      if (subscription && subscription.activeCalls !== _count.id) {
        console.log(`   ⚠️  Mismatch for business ${businessId}: DB=${subscription.activeCalls}, Sessions=${_count.id}`);

        // Sync to session count (source of truth)
        await prisma.subscription.update({
          where: { businessId },
          data: { activeCalls: _count.id }
        });

        console.log(`   ✅ Synced business ${businessId} activeCalls to ${_count.id}`);
      }
    }

    // 7. Log summary
    const duration = Date.now() - startTime;

    console.log('✅ [CLEANUP CRON] Reconciliation complete');
    console.log(`   Cleaned: ${cleanedCount} stuck calls`);
    console.log(`   Duration: ${duration}ms`);
    console.log(`   Global status: ${redisStatus.active}/${redisStatus.limit}`);

    return {
      success: true,
      cleaned: cleanedCount,
      duration,
      activeSessionsCount: activeSessions.length,
      redisActiveCount: redisCallIds.length,
      stuckInDb: stuckInDb.length,
      stuckInRedis: stuckInRedis.length
    };

  } catch (error) {
    console.error('❌ [CLEANUP CRON] Error during reconciliation:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Cleanup a single stuck call
 * @param {string} callId - Call ID
 * @param {number} businessId - Business ID
 * @param {string} reason - Cleanup reason
 */
async function cleanupStuckCall(callId, businessId, reason) {
  try {
    console.log(`   🧹 Cleaning up stuck call ${callId} (reason: ${reason})`);

    // Release global slot (Redis)
    await globalCapacityManager.releaseGlobalSlot(callId);

    // Update ActiveCallSession
    await prisma.activeCallSession.updateMany({
      where: {
        callId,
        status: 'active'
      },
      data: {
        status: 'failed',
        endedAt: new Date(),
        metadata: {
          cleanupReason: reason,
          cleanedAt: new Date().toISOString()
        }
      }
    });

    // Decrement business activeCalls
    await prisma.subscription.updateMany({
      where: {
        businessId,
        activeCalls: { gt: 0 }
      },
      data: {
        activeCalls: { decrement: 1 }
      }
    });

    console.log(`   ✅ Cleaned up ${callId}`);

  } catch (error) {
    console.error(`   ❌ Error cleaning up ${callId}:`, error);
  }
}

// Singleton guard
let cronTask = null;
let isStarted = false;

/**
 * Start cleanup cron job
 * Runs every 10 minutes
 * Singleton: only starts once
 */
export function startCleanupCron() {
  // Guard: prevent multiple cron starts
  if (isStarted) {
    console.log('⚠️  [Cron] Call cleanup already started, skipping duplicate init');
    return cronTask;
  }

  // Run every 10 minutes: '*/10 * * * *'
  cronTask = cron.schedule('*/10 * * * *', async () => {
    await reconcileStuckCalls();
  }, {
    scheduled: true,
    timezone: 'Europe/Istanbul'
  });

  isStarted = true;
  console.log('✅ Call cleanup cron started (every 10 minutes)');

  // Run once on startup (after 30 seconds delay)
  setTimeout(async () => {
    console.log('🔄 Running initial cleanup...');
    await reconcileStuckCalls();
  }, 30000);

  return cronTask;
}

/**
 * Manual trigger for cleanup (for testing)
 */
export async function triggerCleanupNow() {
  console.log('🔧 Manual cleanup triggered');
  return await reconcileStuckCalls();
}

// Export for testing
export { reconcileStuckCalls, cleanupStuckCall };
