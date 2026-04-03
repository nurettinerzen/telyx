/**
 * Email Draft Idempotency Policy (DB-HARD)
 *
 * Guarantees single draft generation per (businessId, threadId, sourceMessageId).
 * Uses PostgreSQL unique constraint + transaction for multi-instance safety.
 *
 * Flow:
 * 1. Try INSERT with unique key
 * 2. If duplicate → return existing draft
 * 3. If success → proceed with generation
 * 4. On complete → update lock status
 *
 * Handles:
 * - Concurrent requests (same process)
 * - Multi-instance deployments
 * - Server restarts during generation
 */

import { Prisma } from '@prisma/client';
import prisma from '../../../prismaClient.js';
import crypto from 'crypto';

// Lock TTL: How long before a stale IN_PROGRESS lock is considered abandoned
const LOCK_TTL_MS = 2 * 60 * 1000; // 2 minutes

// Lock expiry: When to auto-delete old locks
const LOCK_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Acquire draft generation lock (DB transaction)
 *
 * @param {Object} params
 * @param {number} params.businessId
 * @param {string} params.threadId
 * @param {string} params.messageId - Source message being replied to
 * @param {Object} params.requestParams - Additional params for hash
 * @returns {Promise<Object>} { acquired, existingDraftId?, lockId?, reason? }
 */
export async function acquireDraftLock({ businessId, threadId, messageId, requestParams = {} }) {
  const requestHash = createRequestHash({ businessId, threadId, messageId, ...requestParams });

  try {
    // Use transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      // 1. Check for existing lock
      const existingLock = await tx.emailDraftLock.findUnique({
        where: {
          businessId_threadId_sourceMessageId: {
            businessId,
            threadId,
            sourceMessageId: messageId
          }
        }
      });

      if (existingLock) {
        // Lock exists - check status
        if (existingLock.status === 'COMPLETED' && existingLock.draftId) {
          // Already generated
          console.log(`🔒 [Idempotency] Draft already exists: ${existingLock.draftId}`);
          return {
            acquired: false,
            reason: 'DRAFT_ALREADY_EXISTS',
            existingDraftId: existingLock.draftId,
            lockId: existingLock.id
          };
        }

        if (existingLock.status === 'IN_PROGRESS') {
          // Check if stale
          const lockAge = Date.now() - existingLock.startedAt.getTime();

          if (lockAge < LOCK_TTL_MS) {
            // Still in progress
            console.log(`🔒 [Idempotency] Generation in progress (${Math.round(lockAge / 1000)}s)`);
            return {
              acquired: false,
              reason: 'GENERATION_IN_PROGRESS',
              lockId: existingLock.id,
              startedAt: existingLock.startedAt
            };
          }

          // Stale lock - take over
          console.warn(`⚠️ [Idempotency] Taking over stale lock (age: ${Math.round(lockAge / 1000)}s)`);

          await tx.emailDraftLock.update({
            where: { id: existingLock.id },
            data: {
              status: 'IN_PROGRESS',
              startedAt: new Date(),
              expiresAt: new Date(Date.now() + LOCK_EXPIRY_MS),
              requestHash,
              draftId: null,
              completedAt: null
            }
          });

          return {
            acquired: true,
            lockId: existingLock.id,
            takenOver: true
          };
        }

        if (existingLock.status === 'FAILED') {
          // Previous attempt failed - allow retry
          console.log(`🔄 [Idempotency] Retrying after failed attempt`);

          await tx.emailDraftLock.update({
            where: { id: existingLock.id },
            data: {
              status: 'IN_PROGRESS',
              startedAt: new Date(),
              expiresAt: new Date(Date.now() + LOCK_EXPIRY_MS),
              requestHash,
              draftId: null,
              completedAt: null
            }
          });

          return {
            acquired: true,
            lockId: existingLock.id,
            retry: true
          };
        }
      }

      // 2. No existing lock - create new
      const newLock = await tx.emailDraftLock.create({
        data: {
          businessId,
          threadId,
          sourceMessageId: messageId,
          requestHash,
          status: 'IN_PROGRESS',
          expiresAt: new Date(Date.now() + LOCK_EXPIRY_MS)
        }
      });

      console.log(`🔒 [Idempotency] Lock acquired: ${newLock.id}`);

      return {
        acquired: true,
        lockId: newLock.id
      };
    });

    return result;

  } catch (error) {
    // Handle unique constraint violation (race condition)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        // Unique constraint failed - another request won the race
        console.log(`🔒 [Idempotency] Race condition - another request won`);

        // Fetch the winning lock
        const existingLock = await prisma.emailDraftLock.findUnique({
          where: {
            businessId_threadId_sourceMessageId: {
              businessId,
              threadId,
              sourceMessageId: messageId
            }
          }
        });

        if (existingLock) {
          return {
            acquired: false,
            reason: existingLock.status === 'COMPLETED' ? 'DRAFT_ALREADY_EXISTS' : 'GENERATION_IN_PROGRESS',
            existingDraftId: existingLock.draftId,
            lockId: existingLock.id
          };
        }
      }
    }

    console.error('❌ [Idempotency] Lock acquisition error:', error);
    throw error;
  }
}

/**
 * Release lock on successful completion
 *
 * @param {string} lockId
 * @param {string} draftId - Created draft ID
 */
export async function completeDraftLock(lockId, draftId) {
  try {
    await prisma.emailDraftLock.update({
      where: { id: lockId },
      data: {
        status: 'COMPLETED',
        draftId,
        completedAt: new Date()
      }
    });

    console.log(`✅ [Idempotency] Lock completed: ${lockId} → ${draftId}`);
  } catch (error) {
    console.error('❌ [Idempotency] Failed to complete lock:', error);
    // Don't throw - draft was created successfully
  }
}

/**
 * Release lock on failure
 *
 * @param {string} lockId
 * @param {string} errorMessage
 */
export async function failDraftLock(lockId, errorMessage) {
  try {
    await prisma.emailDraftLock.update({
      where: { id: lockId },
      data: {
        status: 'FAILED',
        completedAt: new Date()
      }
    });

    console.log(`❌ [Idempotency] Lock failed: ${lockId}`);
  } catch (error) {
    console.error('❌ [Idempotency] Failed to update lock status:', error);
  }
}

/**
 * Check if draft generation is allowed (wrapper for backward compat)
 */
export async function checkDraftIdempotency({ businessId, threadId, messageId }) {
  const result = await acquireDraftLock({ businessId, threadId, messageId });

  if (result.acquired) {
    return {
      allowed: true,
      lockId: result.lockId
    };
  }

  return {
    allowed: false,
    reason: result.reason,
    existingDraftId: result.existingDraftId,
    message: result.reason === 'DRAFT_ALREADY_EXISTS'
      ? 'A draft already exists for this message'
      : 'Draft generation is already in progress'
  };
}

/**
 * Mark draft generation complete (wrapper for backward compat)
 */
export function markDraftGenerated({ lockId, draftId, success }) {
  if (!lockId) return;

  if (success && draftId) {
    completeDraftLock(lockId, draftId);
  } else {
    failDraftLock(lockId, 'Generation failed');
  }
}

/**
 * Create hash of request params for additional safety
 */
function createRequestHash(params) {
  const str = JSON.stringify(params);
  return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
}

/**
 * Cleanup expired locks (background job)
 */
export async function cleanupExpiredLocks() {
  try {
    const result = await prisma.emailDraftLock.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });

    if (result.count > 0) {
      console.log(`🧹 [Idempotency] Cleaned ${result.count} expired locks`);
    }

    return result.count;
  } catch (error) {
    console.error('❌ [Idempotency] Cleanup error:', error);
    return 0;
  }
}

// Schedule cleanup every hour
setInterval(() => {
  cleanupExpiredLocks().catch(console.error);
}, 60 * 60 * 1000);

export default {
  acquireDraftLock,
  completeDraftLock,
  failDraftLock,
  checkDraftIdempotency,
  markDraftGenerated,
  cleanupExpiredLocks
};
