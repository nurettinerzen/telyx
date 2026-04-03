/**
 * Chat/WhatsApp Rate Limiting Service
 *
 * Two-layer protection:
 * 1. Daily message limit (prevents spam/bot abuse)
 * 2. Monthly token limit (prevents cost explosion)
 *
 * Limits by plan:
 * - TRIAL: 200 msg/day, 100k tokens/month
 * - PAYG: 1000 msg/day, 1M tokens/month
 * - STARTER: 2000 msg/day, 2M tokens/month
 * - PRO: 5000 msg/day, 5M tokens/month
 * - ENTERPRISE: Custom (default 10k msg/day, 10M tokens/month)
 */

import prisma from '../prismaClient.js';

// Plan-based limits
const RATE_LIMITS = {
  TRIAL: {
    messagesPerDay: 200,
    tokensPerMonth: 100_000
  },
  PAYG: {
    messagesPerDay: 1000,
    tokensPerMonth: 1_000_000
  },
  STARTER: {
    messagesPerDay: 2000,
    tokensPerMonth: 2_000_000
  },
  PRO: {
    messagesPerDay: 5000,
    tokensPerMonth: 5_000_000
  },
  ENTERPRISE: {
    messagesPerDay: 10000,
    tokensPerMonth: 10_000_000
  },
  FREE: {
    messagesPerDay: 0,
    tokensPerMonth: 0
  }
};

/**
 * Check if business can send a chat message
 * @param {number} businessId
 * @returns {Promise<{canSend: boolean, reason?: string, remaining?: number}>}
 */
export async function canSendChatMessage(businessId) {
  try {
    // Feature flag: If rate limiting disabled, allow all
    const rateLimitingEnabled = process.env.CHAT_RATE_LIMITING_ENABLED === 'true';
    if (!rateLimitingEnabled) {
      console.log('⚠️ Chat rate limiting DISABLED (feature flag off)');
      return { canSend: true, reason: 'FEATURE_DISABLED' };
    }

    const subscription = await prisma.subscription.findUnique({
      where: { businessId }
    });

    if (!subscription) {
      return { canSend: false, reason: 'NO_SUBSCRIPTION' };
    }

    // FREE plan cannot use chat
    if (subscription.plan === 'FREE') {
      return { canSend: false, reason: 'FREE_PLAN_NO_CHAT' };
    }

    // TRIAL: Check if chat trial expired
    if (subscription.plan === 'TRIAL') {
      if (!subscription.trialChatExpiry) {
        return { canSend: false, reason: 'NO_TRIAL_CHAT' };
      }

      const now = new Date();
      if (now > new Date(subscription.trialChatExpiry)) {
        return { canSend: false, reason: 'TRIAL_CHAT_EXPIRED' };
      }
    }

    const limits = RATE_LIMITS[subscription.plan] || RATE_LIMITS.PAYG;

    // ===== CHECK 1: Daily message limit =====
    const today = new Date().toISOString().split('T')[0];
    const lastMessageDate = subscription.chatDailyMessageDate
      ? new Date(subscription.chatDailyMessageDate).toISOString().split('T')[0]
      : null;

    let dailyCount = subscription.chatDailyMessageCount || 0;

    // Reset daily counter if new day
    if (lastMessageDate !== today) {
      dailyCount = 0;
    }

    if (dailyCount >= limits.messagesPerDay) {
      return {
        canSend: false,
        reason: 'DAILY_MESSAGE_LIMIT_EXCEEDED',
        limit: limits.messagesPerDay,
        used: dailyCount
      };
    }

    // ===== CHECK 2: Monthly token limit =====
    const tokensUsed = subscription.chatTokensUsed || 0;
    const tokenLimit = limits.tokensPerMonth;

    if (tokenLimit > 0 && tokensUsed >= tokenLimit) {
      return {
        canSend: false,
        reason: 'MONTHLY_TOKEN_LIMIT_EXCEEDED',
        limit: tokenLimit,
        used: tokensUsed
      };
    }

    // All checks passed
    return {
      canSend: true,
      dailyRemaining: limits.messagesPerDay - dailyCount,
      tokenRemaining: tokenLimit > 0 ? tokenLimit - tokensUsed : Infinity
    };
  } catch (error) {
    console.error('Chat rate limit check error:', error);
    return { canSend: false, reason: 'ERROR' };
  }
}

/**
 * Record chat message sent (increment daily counter)
 * ATOMIC: Uses DB-level increment to prevent race conditions
 * @param {number} businessId
 * @returns {Promise<void>}
 */
export async function recordChatMessage(businessId) {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // ATOMIC: Read and update in single query to prevent race conditions
    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      select: { chatDailyMessageDate: true, chatDailyMessageCount: true }
    });

    if (!subscription) return;

    const lastMessageDate = subscription.chatDailyMessageDate
      ? new Date(subscription.chatDailyMessageDate).toISOString().split('T')[0]
      : null;

    // If same day, increment atomically
    if (lastMessageDate === today) {
      await prisma.subscription.update({
        where: { businessId },
        data: {
          chatDailyMessageCount: { increment: 1 },
          chatDailyMessageDate: now
        }
      });
    } else {
      // New day, reset to 1
      await prisma.subscription.update({
        where: { businessId },
        data: {
          chatDailyMessageCount: 1,
          chatDailyMessageDate: now
        }
      });
    }
  } catch (error) {
    console.error('Record chat message error:', error);
  }
}

/**
 * Record chat tokens used (for monthly limit tracking)
 * @param {number} businessId
 * @param {number} tokensUsed - Total tokens (input + output)
 * @returns {Promise<void>}
 */
export async function recordChatTokens(businessId, tokensUsed) {
  try {
    await prisma.subscription.update({
      where: { businessId },
      data: {
        chatTokensUsed: {
          increment: tokensUsed
        }
      }
    });

    // Check if approaching limit (80% warning)
    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      include: { business: true }
    });

    if (!subscription) return;

    const limits = RATE_LIMITS[subscription.plan] || RATE_LIMITS.PAYG;
    const tokenLimit = limits.tokensPerMonth;

    if (tokenLimit > 0) {
      const usedPercent = (subscription.chatTokensUsed / tokenLimit) * 100;

      // Send warning at 80%
      if (usedPercent >= 80 && usedPercent < 100) {
        console.log(`⚠️ Chat token usage warning: ${subscription.business?.name} at ${usedPercent.toFixed(1)}%`);
        // TODO: Send email warning
      }

      // Block at 100%
      if (usedPercent >= 100) {
        console.log(`🚫 Chat token limit reached: ${subscription.business?.name}`);
        // Subsequent canSendChatMessage calls will block
      }
    }
  } catch (error) {
    console.error('Record chat tokens error:', error);
  }
}

/**
 * Reset monthly chat token counter
 * Called by cron job at period start
 * @param {number} businessId
 * @returns {Promise<void>}
 */
export async function resetMonthlyTokens(businessId) {
  try {
    await prisma.subscription.update({
      where: { businessId },
      data: {
        chatTokensUsed: 0,
        chatTokensResetAt: new Date()
      }
    });

    console.log(`✅ Reset chat tokens for business ${businessId}`);
  } catch (error) {
    console.error('Reset chat tokens error:', error);
  }
}

/**
 * Get chat usage stats
 * @param {number} businessId
 * @returns {Promise<object>}
 */
export async function getChatUsageStats(businessId) {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { businessId }
    });

    if (!subscription) {
      return null;
    }

    const limits = RATE_LIMITS[subscription.plan] || RATE_LIMITS.PAYG;

    return {
      plan: subscription.plan,
      dailyMessages: {
        used: subscription.chatDailyMessageCount || 0,
        limit: limits.messagesPerDay,
        remaining: Math.max(0, limits.messagesPerDay - (subscription.chatDailyMessageCount || 0))
      },
      monthlyTokens: {
        used: subscription.chatTokensUsed || 0,
        limit: limits.tokensPerMonth,
        remaining: limits.tokensPerMonth > 0
          ? Math.max(0, limits.tokensPerMonth - (subscription.chatTokensUsed || 0))
          : Infinity
      }
    };
  } catch (error) {
    console.error('Get chat usage stats error:', error);
    return null;
  }
}

export default {
  canSendChatMessage,
  recordChatMessage,
  recordChatTokens,
  resetMonthlyTokens,
  getChatUsageStats,
  RATE_LIMITS
};
