/**
 * Tool Idempotency Service - DB-Based (Restart-Safe)
 *
 * Prevents duplicate tool executions using PostgreSQL.
 * Key: {businessId, channel, messageId, toolName}
 *
 * Fallback: In-memory cache if DB unavailable
 */

import prisma from '../config/database.js';

// In-memory fallback (if DB fails)
const memoryCache = new Map();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (webhook retries can be delayed)
const TOOL_RESULT_CACHE_VERSION = 1;

function toJsonSafe(value) {
  if (value === undefined) {
    return null;
  }

  return JSON.parse(JSON.stringify(value));
}

function packCachedToolResult(result) {
  return toJsonSafe({
    __toolResultCache: TOOL_RESULT_CACHE_VERSION,
    result: result || {}
  });
}

function isPackedToolResult(data) {
  return !!data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    data.__toolResultCache === TOOL_RESULT_CACHE_VERSION &&
    Object.prototype.hasOwnProperty.call(data, 'result');
}

function unpackCachedToolResult(cached) {
  if (isPackedToolResult(cached?.data)) {
    const unpacked = cached.data.result || {};

    return {
      ...unpacked,
      success: unpacked.success ?? cached.success,
      error: unpacked.error ?? cached.error ?? null,
      data: unpacked.data ?? null
    };
  }

  // Legacy cache rows only stored success/data/error. Keep them readable.
  return {
    success: cached.success,
    data: cached.data,
    error: cached.error
  };
}

/**
 * Get tool execution result (DB-first, memory fallback)
 *
 * @param {Object} key
 * @param {number} key.businessId
 * @param {string} key.channel
 * @param {string} key.messageId
 * @param {string} key.toolName
 * @returns {Promise<Object|null>} Cached result or null
 */
export async function getToolExecutionResult(key) {
  const { businessId, channel, messageId, toolName } = key;

  try {
    // Try DB first
    const cached = await prisma.toolExecution.findUnique({
      where: {
        businessId_channel_messageId_toolName: {
          businessId,
          channel,
          messageId,
          toolName
        }
      }
    });

    if (!cached) {
      return null;
    }

    // Check TTL
    if (new Date() > cached.expiresAt) {
      // Expired - delete it
      await prisma.toolExecution.delete({
        where: { id: cached.id }
      }).catch(() => {}); // Ignore delete errors

      return null;
    }

    console.log(`♻️ [Idempotency] DB Cache HIT for ${toolName} (messageId: ${messageId})`);

    // Return result
    return unpackCachedToolResult(cached);

  } catch (error) {
    console.error('⚠️ [Idempotency] DB error, falling back to memory:', error.message);

    // Fallback to in-memory
    return getToolExecutionResult_Memory(key);
  }
}

/**
 * Store tool execution result (DB-first, memory fallback)
 *
 * @param {Object} key
 * @param {number} key.businessId
 * @param {string} key.channel
 * @param {string} key.messageId
 * @param {string} key.toolName
 * @param {Object} result - Tool execution result
 */
export async function setToolExecutionResult(key, result) {
  const { businessId, channel, messageId, toolName } = key;

  try {
    // Store in DB
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS);

    await prisma.toolExecution.upsert({
      where: {
        businessId_channel_messageId_toolName: {
          businessId,
          channel,
          messageId,
          toolName
        }
      },
      update: {
        success: result.success,
        data: packCachedToolResult(result),
        error: result.error || null,
        expiresAt
      },
      create: {
        businessId,
        channel,
        messageId,
        toolName,
        success: result.success,
        data: packCachedToolResult(result),
        error: result.error || null,
        expiresAt
      }
    });

    console.log(`💾 [Idempotency] DB Cached result for ${toolName} (messageId: ${messageId})`);

  } catch (error) {
    console.error('⚠️ [Idempotency] DB error, falling back to memory:', error.message);

    // Fallback to in-memory
    setToolExecutionResult_Memory(key, result);
  }
}

/**
 * Clear all cached results (for testing)
 */
export async function clearToolExecutionCache() {
  try {
    await prisma.toolExecution.deleteMany({});
    console.log('🗑️ [Idempotency] DB cache cleared');
  } catch (error) {
    console.error('⚠️ [Idempotency] DB clear error:', error.message);
  }

  // Also clear memory
  memoryCache.clear();
}

/**
 * Get cache statistics
 *
 * @returns {Promise<Object>}
 */
export async function getIdempotencyStats() {
  try {
    const now = new Date();

    const total = await prisma.toolExecution.count();
    const active = await prisma.toolExecution.count({
      where: {
        expiresAt: {
          gt: now
        }
      }
    });
    const expired = total - active;

    const oldest = await prisma.toolExecution.findFirst({
      orderBy: {
        createdAt: 'asc'
      },
      select: {
        createdAt: true
      }
    });

    return {
      totalEntries: total,
      activeEntries: active,
      expiredEntries: expired,
      cacheTTL: CACHE_TTL_MS,
      oldestEntry: oldest ? Date.now() - oldest.createdAt.getTime() : null,
      storage: 'postgresql'
    };

  } catch (error) {
    console.error('⚠️ [Idempotency] DB stats error:', error.message);

    return {
      totalEntries: memoryCache.size,
      activeEntries: memoryCache.size,
      expiredEntries: 0,
      cacheTTL: CACHE_TTL_MS,
      storage: 'memory_fallback'
    };
  }
}

/**
 * Cleanup expired entries (background job)
 */
export async function cleanupExpiredToolExecutions() {
  try {
    const now = new Date();

    const result = await prisma.toolExecution.deleteMany({
      where: {
        expiresAt: {
          lt: now
        }
      }
    });

    if (result.count > 0) {
      console.log(`🧹 [Idempotency] Cleaned up ${result.count} expired entries`);
    }

    return result.count;

  } catch (error) {
    console.error('⚠️ [Idempotency] Cleanup error:', error.message);
    return 0;
  }
}

// ============================================================================
// IN-MEMORY FALLBACK (if DB unavailable)
// ============================================================================

function getToolExecutionResult_Memory(key) {
  const cacheKey = buildMemoryCacheKey(key);
  const cached = memoryCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  // Check TTL
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    memoryCache.delete(cacheKey);
    return null;
  }

  console.log(`♻️ [Idempotency] Memory Cache HIT for ${key.toolName}`);
  return cached.result;
}

function setToolExecutionResult_Memory(key, result) {
  const cacheKey = buildMemoryCacheKey(key);

  memoryCache.set(cacheKey, {
    result,
    timestamp: Date.now()
  });

  console.log(`💾 [Idempotency] Memory Cached result for ${key.toolName}`);
}

function buildMemoryCacheKey(key) {
  return `${key.businessId}:${key.channel}:${key.messageId}:${key.toolName}`;
}

// Start cleanup job (every 1 hour - TTL is 7 days so no rush)
setInterval(() => {
  cleanupExpiredToolExecutions().catch(err => {
    console.error('⚠️ [Idempotency] Cleanup job error:', err);
  });
}, 60 * 60 * 1000);

export default {
  getToolExecutionResult,
  setToolExecutionResult,
  clearToolExecutionCache,
  getIdempotencyStats,
  cleanupExpiredToolExecutions
};
