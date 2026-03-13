/**
 * State Manager
 *
 * Manages conversation state with hybrid cache + DB strategy.
 * - In-memory Map for hot state (fast access)
 * - PostgreSQL for persistence (survive restarts)
 * - TTL-based expiry with lazy cleanup
 * - Turn-based atomic writes (write once per conversation turn)
 *
 * Critical rules:
 * 1. Always write FULL state, never partial updates
 * 2. Deep merge on updates to prevent data loss
 * 3. TTL check on every read (lazy cleanup)
 * 4. One DB write per turn (not per micro-update)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// In-memory cache for active sessions
const stateCache = new Map();

// Default TTL: 30 minutes of inactivity (chat/whatsapp).
const DEFAULT_STATE_TTL_MS = 30 * 60 * 1000;
// Email flows are naturally slower and can span hours/days.
const EMAIL_STATE_TTL_MS = (parseInt(process.env.EMAIL_STATE_TTL_HOURS, 10) || 72) * 60 * 60 * 1000;

function resolveStateTTL(sessionId) {
  const normalizedSessionId = String(sessionId || '');
  if (normalizedSessionId.startsWith('email_')) {
    return EMAIL_STATE_TTL_MS;
  }
  return DEFAULT_STATE_TTL_MS;
}

/**
 * Deep merge two objects
 * Recursively merges source into target without mutating either
 */
function deepMerge(target, source) {
  const result = { ...target };

  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

/**
 * Create initial state for a new session
 */
export function createInitialState(sessionId) {
  return {
    sessionId,

    // Flow Management
    activeFlow: null,           // ORDER_STATUS | DEBT_INQUIRY | COMPLAINT | APPOINTMENT | PRODUCT_INFO | GENERAL | null
    flowStatus: 'idle',         // idle | in_progress | resolved | post_result | paused | terminated
    pauseReason: null,          // human_handoff | async_callback | null
    postResultTurns: 0,         // Turns since flow resolved (for follow-up handling)

    // Session Lock (NEW - for hard termination)
    lockReason: null,           // ABUSE | PII_RISK | THREAT | LOOP | SPAM | TOOL_FAIL | null
    lockUntil: null,            // ISO timestamp or null (null = permanent lock)
    lockedAt: null,             // ISO timestamp when locked
    lockMessageSentAt: null,    // Last time lock message sent (spam prevention)

    // Abuse Tracking (for counter-based detection)
    abuseCounter: 0,            // Number of messages with profanity in window
    abuseWindowStart: null,     // ISO timestamp of first profanity in window

    // Slot Filling
    expectedSlot: null,         // order_number | name | phone | complaint_details | null
    collectedSlots: {},         // { orderNumber: "SP001", customerName: "Cem Işık" }
    slotAttempts: {},           // { order_number: 2 } - Track failed attempts for loop guard

    // Anchor Data (persists after flow resolves for follow-up context)
    anchor: {                   // Data from resolved flow, used for dispute/follow-up
      order_number: null,
      customer_id: null,
      phone: null,
      lastFlowType: null,       // What flow just finished
      lastResult: null          // Summary of last result
    },

    // Verification (session-based, persists across flows)
    verification: {
      status: 'none',           // none | pending | verified | failed
      customerId: null,         // Set when verified
      pendingField: null,       // name | phone | null
      attempts: 0,              // Failed verification attempts
      collected: {},            // { name: "Cem Işık", phone: "905551234567" }
    },

    // Security
    allowedTools: [],           // Tools permitted for current flow
    responseGrounding: 'GROUNDED', // GROUNDED | UNGROUNDED | CLARIFICATION | OUT_OF_SCOPE

    // Metadata
    messageCount: 0,
    lastActivity: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Get state for a session
 * - Checks cache first
 * - Falls back to DB
 * - Validates TTL (lazy cleanup)
 * - Returns fresh state if expired or not found
 */
export async function getState(sessionId) {
  const ttlMs = resolveStateTTL(sessionId);

  // 1. Check cache (with TTL validation)
  const cached = stateCache.get(sessionId);
  if (cached) {
    const lastActivity = cached.lastActivity ? new Date(cached.lastActivity).getTime() : 0;
    const now = Date.now();
    if (now - lastActivity > ttlMs) {
      // Cache entry expired — remove and create fresh state
      console.log(`[StateManager] Cache expired for session ${sessionId} (idle ${Math.round((now - lastActivity) / 60000)}min)`);
      stateCache.delete(sessionId);
      const freshState = createInitialState(sessionId);
      stateCache.set(sessionId, freshState);
      return freshState;
    }
    console.log(`[StateManager] Cache hit for session ${sessionId}`);
    return cached;
  }

  // 2. Check DB
  const dbRecord = await prisma.conversationState.findUnique({
    where: { sessionId }
  });

  if (dbRecord) {
    // 3. Validate TTL
    const now = new Date();
    const expiresAt = new Date(dbRecord.expiresAt);

    if (expiresAt < now) {
      // Expired - delete and return fresh state
      console.log(`[StateManager] Session ${sessionId} expired, deleting`);
      await prisma.conversationState.delete({
        where: { sessionId }
      }).catch(err => {
        console.error('[StateManager] Failed to delete expired state:', err);
      });

      const freshState = createInitialState(sessionId);
      stateCache.set(sessionId, freshState);
      return freshState;
    }

    // Valid state - cache and return
    console.log(`[StateManager] DB hit for session ${sessionId}`);
    const state = dbRecord.state;
    stateCache.set(sessionId, state);
    return state;
  }

  // 4. Not found - return fresh state
  console.log(`[StateManager] Creating fresh state for session ${sessionId}`);
  const freshState = createInitialState(sessionId);
  stateCache.set(sessionId, freshState);
  return freshState;
}

/**
 * Update state for a session
 * - Deep merges updates with current state
 * - Updates cache
 * - Writes FULL state to DB (atomic)
 * - Resets TTL
 *
 * IMPORTANT: Call this ONCE per conversation turn, not per micro-update
 */
export async function updateState(sessionId, updates) {
  console.log(`[StateManager] Updating state for session ${sessionId}`);
  const ttlMs = resolveStateTTL(sessionId);

  // 1. Get current state
  const currentState = await getState(sessionId);

  // 2. Deep merge updates
  const mergedState = deepMerge(currentState, updates);

  // 3. Update metadata
  mergedState.lastActivity = new Date().toISOString();
  if (updates.messageCount !== undefined) {
    mergedState.messageCount = updates.messageCount;
  } else {
    mergedState.messageCount = (currentState.messageCount || 0) + 1;
  }

  // 4. Update cache
  stateCache.set(sessionId, mergedState);

  // 5. Write full state to DB
  const expiresAt = new Date(Date.now() + ttlMs);

  try {
    await prisma.conversationState.upsert({
      where: { sessionId },
      update: {
        state: mergedState,
        expiresAt,
        updatedAt: new Date(),
      },
      create: {
        sessionId,
        businessId: mergedState.businessId || 0, // Will be set properly by caller
        state: mergedState,
        expiresAt,
      }
    });

    console.log(`[StateManager] State saved to DB for session ${sessionId}`);
  } catch (error) {
    console.error('[StateManager] Failed to save state to DB:', error);
    throw error;
  }

  return mergedState;
}

/**
 * Delete state for a session
 * Useful for testing or manual cleanup
 */
export async function deleteState(sessionId) {
  console.log(`[StateManager] Deleting state for session ${sessionId}`);

  // Remove from cache
  stateCache.delete(sessionId);

  // Remove from DB
  await prisma.conversationState.delete({
    where: { sessionId }
  }).catch(err => {
    if (err.code !== 'P2025') { // Not found is OK
      console.error('[StateManager] Failed to delete state:', err);
    }
  });
}

/**
 * Cleanup expired states from DB
 * Should be called by a cron job daily
 */
export async function cleanupExpiredStates() {
  console.log('[StateManager] Running cleanup of expired states');

  const now = new Date();

  try {
    const result = await prisma.conversationState.deleteMany({
      where: {
        expiresAt: {
          lt: now
        }
      }
    });

    console.log(`[StateManager] Cleaned up ${result.count} expired states`);
    return result.count;
  } catch (error) {
    console.error('[StateManager] Failed to cleanup expired states:', error);
    throw error;
  }
}

/**
 * Get stats about cached states (for monitoring)
 */
export function getCacheStats() {
  return {
    cachedSessions: stateCache.size,
    cacheKeys: Array.from(stateCache.keys()),
  };
}
