/**
 * Session Mapper
 *
 * Maps channel-specific user identifiers to universal session IDs.
 *
 * Critical design decisions:
 * 1. NO PII in sessionId (no phone numbers, no emails)
 * 2. Universal sessionId format: conv_${uuid}
 * 3. Channel + channelUserId + businessId → sessionId mapping
 * 4. Supports multi-channel conversations (same user, different channels)
 *
 * Channels:
 * - CHAT: channelUserId = widget session ID
 * - WHATSAPP: channelUserId = WhatsApp user ID (wa_id from Meta)
 * - PHONE: channelUserId = call/conversation ID
 */

import prisma from '../prismaClient.js';
import { randomUUID } from 'crypto';
import { updateState } from './state-manager.js';
import { HANDOFF_MODE, getNormalizedHandoffState } from './liveHandoff.js';

// Session inactivity TTL: 30 minutes (matches state-manager TTL)
const SESSION_INACTIVITY_TTL_MS = 30 * 60 * 1000;

// In-memory cache for fast lookups (stores { sessionId, lastActivity })
const mappingCache = new Map();

/**
 * Generate cache key for mapping lookup
 */
function getCacheKey(businessId, channel, channelUserId) {
  return `${businessId}:${channel}:${channelUserId}`;
}

async function touchSessionMapping(businessId, channel, channelUserId) {
  try {
    await prisma.sessionMapping.update({
      where: {
        businessId_channel_channelUserId: {
          businessId,
          channel,
          channelUserId,
        }
      },
      data: {
        updatedAt: new Date(),
      }
    });
  } catch (error) {
    if (error?.code !== 'P2025') {
      console.error('[SessionMapper] Failed to touch mapping:', error);
    }
  }
}

async function closeStaleSessionArtifacts(sessionId) {
  if (!sessionId) return;

  try {
    await prisma.chatLog.updateMany({
      where: {
        sessionId,
        status: 'active',
      },
      data: {
        status: 'ended',
        updatedAt: new Date(),
      }
    });

    const stateRecord = await prisma.conversationState.findUnique({
      where: { sessionId },
      select: {
        businessId: true,
        state: true,
      }
    });

    if (!stateRecord?.state) {
      return;
    }

    const currentHandoff = getNormalizedHandoffState(stateRecord.state);
    if (currentHandoff.mode === HANDOFF_MODE.AI && !currentHandoff.assignedUserId && !currentHandoff.assignedUserName) {
      return;
    }

    await updateState(sessionId, {
      businessId: stateRecord.businessId || stateRecord.state.businessId || 0,
      messageCount: stateRecord.state.messageCount || 0,
      humanHandoff: {
        ...currentHandoff,
        mode: HANDOFF_MODE.AI,
        requestedAt: null,
        requestedBy: null,
        requestedReason: null,
        assignedUserId: null,
        assignedUserName: null,
        claimedAt: null,
        releasedAt: new Date().toISOString(),
      }
    });
  } catch (error) {
    console.error('[SessionMapper] Failed to close stale session artifacts:', error);
  }
}

/**
 * Get or create a session ID for a channel user
 *
 * @param {number} businessId - Business ID
 * @param {string} channel - Channel type (CHAT, WHATSAPP, PHONE)
 * @param {string} channelUserId - Channel-specific user identifier
 * @returns {Promise<string>} Universal session ID
 */
export async function getOrCreateSession(businessId, channel, channelUserId) {
  const cacheKey = getCacheKey(businessId, channel, channelUserId);

  // 1. Check cache
  const cached = mappingCache.get(cacheKey);
  if (cached) {
    const now = Date.now();
    if (now - cached.lastActivity > SESSION_INACTIVITY_TTL_MS) {
      // Session expired due to inactivity — rotate to a new session
      console.log(`[SessionMapper] Session expired (idle ${Math.round((now - cached.lastActivity) / 60000)}min), rotating: ${cacheKey}`);
      mappingCache.delete(cacheKey);
      // Fall through to create new session below
    } else {
      // Update last activity timestamp
      cached.lastActivity = now;
      await touchSessionMapping(businessId, channel, channelUserId);
      console.log(`[SessionMapper] Cache hit: ${cacheKey} → ${cached.sessionId}`);
      return cached.sessionId;
    }
  }

  // 2. Check DB
  const existing = await prisma.sessionMapping.findUnique({
    where: {
      businessId_channel_channelUserId: {
        businessId,
        channel,
        channelUserId
      }
    }
  });

  if (existing) {
    // Check if session is stale based on updatedAt
    const now = Date.now();
    const updatedAt = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
    if (now - updatedAt > SESSION_INACTIVITY_TTL_MS) {
      console.log(`[SessionMapper] DB session expired (idle ${Math.round((now - updatedAt) / 60000)}min), rotating: ${cacheKey}`);
      await closeStaleSessionArtifacts(existing.sessionId);
      // Delete old mapping, fall through to create new session
      await prisma.sessionMapping.delete({
        where: {
          businessId_channel_channelUserId: { businessId, channel, channelUserId }
        }
      }).catch(err => {
        if (err.code !== 'P2025') console.error('[SessionMapper] Failed to delete expired mapping:', err);
      });
      // Fall through to create new session below
    } else {
      console.log(`[SessionMapper] DB hit: ${cacheKey} → ${existing.sessionId}`);
      await touchSessionMapping(businessId, channel, channelUserId);
      mappingCache.set(cacheKey, { sessionId: existing.sessionId, lastActivity: now });
      return existing.sessionId;
    }
  }

  // 3. Create new session
  const sessionId = `conv_${randomUUID()}`;

  try {
    await prisma.sessionMapping.create({
      data: {
        sessionId,
        businessId,
        channel,
        channelUserId,
      }
    });

    console.log(`[SessionMapper] Created new session: ${cacheKey} → ${sessionId}`);
    mappingCache.set(cacheKey, { sessionId, lastActivity: Date.now() });

    return sessionId;
  } catch (error) {
    // Handle race condition - another process might have created it
    if (error.code === 'P2002') { // Unique constraint violation
      console.log(`[SessionMapper] Race condition detected, retrying lookup`);

      const retryExisting = await prisma.sessionMapping.findUnique({
        where: {
          businessId_channel_channelUserId: {
            businessId,
            channel,
            channelUserId
          }
        }
      });

      if (retryExisting) {
        mappingCache.set(cacheKey, { sessionId: retryExisting.sessionId, lastActivity: Date.now() });
        return retryExisting.sessionId;
      }
    }

    console.error('[SessionMapper] Failed to create session mapping:', error);
    throw error;
  }
}

/**
 * Get session ID if exists (without creating)
 *
 * @param {number} businessId
 * @param {string} channel
 * @param {string} channelUserId
 * @returns {Promise<string|null>} Session ID or null if not found
 */
export async function getSession(businessId, channel, channelUserId) {
  const cacheKey = getCacheKey(businessId, channel, channelUserId);

  // Check cache
  const cached = mappingCache.get(cacheKey);
  if (cached) {
    const now = Date.now();
    if (now - cached.lastActivity > SESSION_INACTIVITY_TTL_MS) {
      mappingCache.delete(cacheKey);
      return null;
    }
    return cached.sessionId;
  }

  // Check DB
  const existing = await prisma.sessionMapping.findUnique({
    where: {
      businessId_channel_channelUserId: {
        businessId,
        channel,
        channelUserId
      }
    }
  });

  if (existing) {
    const now = Date.now();
    const updatedAt = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
    if (now - updatedAt > SESSION_INACTIVITY_TTL_MS) {
      return null; // Expired
    }
    mappingCache.set(cacheKey, { sessionId: existing.sessionId, lastActivity: now });
    return existing.sessionId;
  }

  return null;
}

/**
 * Get all channel mappings for a session
 * Useful for understanding multi-channel conversations
 *
 * @param {string} sessionId
 * @returns {Promise<Array>} Array of channel mappings
 */
export async function getChannelsForSession(sessionId) {
  return await prisma.sessionMapping.findMany({
    where: { sessionId }
  });
}

/**
 * Delete session mapping
 * Useful for testing or manual cleanup
 *
 * @param {number} businessId
 * @param {string} channel
 * @param {string} channelUserId
 */
export async function deleteSessionMapping(businessId, channel, channelUserId) {
  const cacheKey = getCacheKey(businessId, channel, channelUserId);

  // Remove from cache
  mappingCache.delete(cacheKey);

  // Remove from DB
  await prisma.sessionMapping.delete({
    where: {
      businessId_channel_channelUserId: {
        businessId,
        channel,
        channelUserId
      }
    }
  }).catch(err => {
    if (err.code !== 'P2025') { // Not found is OK
      console.error('[SessionMapper] Failed to delete mapping:', err);
    }
  });
}

/**
 * Get cache stats (for monitoring)
 */
export function getCacheStats() {
  return {
    cachedMappings: mappingCache.size,
    cacheKeys: Array.from(mappingCache.keys()),
  };
}
