// ============================================================================
// CONCURRENT CALL MANAGER SERVICE
// ============================================================================
// FILE: backend/src/services/concurrentCallManager.js
//
// Manages concurrent call limits for subscriptions
// Handles acquiring and releasing call slots
// P0 UPDATE: Integrated with global capacity gate (Redis)
// ============================================================================

import prisma from '../prismaClient.js';
import globalCapacityManager from './globalCapacityManager.js';
import { getEffectivePlanConfig } from './planConfig.js';

const CONCURRENT_LIMIT_SELECT = {
  id: true,
  plan: true,
  concurrentLimit: true,
  enterpriseConcurrent: true,
  activeCalls: true,
  status: true,
  business: {
    select: {
      country: true
    }
  }
};

/**
 * Concurrent Call Manager
 * Manages concurrent call slots for businesses
 */
class ConcurrentCallManager {

  /**
   * Acquire a call slot before starting a call
   * P0 UPDATE: Checks global capacity + business limit + creates ActiveCallSession
   * Uses atomic updateMany for race condition safety
   * @param {number} businessId - Business ID
   * @param {string} callId - Unique call ID from provider
   * @param {string} direction - "inbound" or "outbound"
   * @param {Object} metadata - Additional call metadata
   * @returns {Promise<{success: boolean, currentActive?: number, limit?: number, error?: string}>}
   */
  async acquireSlot(businessId, callId = null, direction = 'outbound', metadata = {}) {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { businessId },
        select: CONCURRENT_LIMIT_SELECT
      });

      if (!subscription) {
        return {
          success: false,
          error: 'SUBSCRIPTION_NOT_FOUND',
          message: 'No subscription found for this business'
        };
      }

      // Check if subscription is active
      if (subscription.status !== 'ACTIVE' && subscription.status !== 'TRIAL') {
        return {
          success: false,
          error: 'SUBSCRIPTION_INACTIVE',
          message: 'Subscription is not active',
          status: subscription.status
        };
      }

      // Use the unified effective config so enterprise custom limits and plan defaults
      // resolve exactly the same way in UI and runtime gating.
      const limit = getEffectivePlanConfig(subscription).concurrentLimit;

      if (limit === 0) {
        return {
          success: false,
          error: 'CONCURRENT_CALLS_DISABLED',
          message: 'Concurrent calls are not available for your plan'
        };
      }

      // P0.1: Check global capacity FIRST
      const globalCheck = await globalCapacityManager.checkGlobalCapacity();

      if (!globalCheck.available) {
        console.log(`⚠️ Global capacity exceeded: ${globalCheck.current}/${globalCheck.limit}`);
        return {
          success: false,
          error: 'GLOBAL_CAPACITY_EXCEEDED',
          message: 'Platform capacity limit reached. Please try again in a few moments.',
          currentActive: subscription.activeCalls,
          limit: limit,
          globalCurrent: globalCheck.current,
          globalLimit: globalCheck.limit
        };
      }

      // Atomic increment with check - prevents race conditions (business-level)
      const result = await prisma.subscription.updateMany({
        where: {
          businessId,
          activeCalls: { lt: limit }
        },
        data: {
          activeCalls: { increment: 1 }
        }
      });

      if (result.count === 0) {
        // Business limit exceeded
        console.log(`⚠️ Business concurrent limit exceeded for business ${businessId}: ${subscription.activeCalls}/${limit}`);
        return {
          success: false,
          error: 'BUSINESS_CONCURRENT_LIMIT_EXCEEDED',
          message: 'Maximum concurrent calls reached for your account. Please try again later.',
          currentActive: subscription.activeCalls,
          limit: limit
        };
      }

      // Generate callId if not provided
      const finalCallId = callId || `call_${Date.now()}_${businessId}`;

      // P0.1: Acquire global slot (Redis)
      const globalResult = await globalCapacityManager.acquireGlobalSlot(
        finalCallId,
        subscription.plan,
        businessId
      );

      if (!globalResult.success) {
        // Rollback business counter
        await prisma.subscription.update({
          where: { businessId },
          data: { activeCalls: { decrement: 1 } }
        });

        console.log(`⚠️ Global slot acquisition failed for ${finalCallId}`);
        return {
          success: false,
          error: globalResult.reason || 'GLOBAL_SLOT_FAILED',
          message: 'Platform capacity limit reached. Please try again.',
          currentActive: subscription.activeCalls,
          limit: limit
        };
      }

      // P0.3: Create ActiveCallSession record
      try {
        await prisma.activeCallSession.create({
          data: {
            callId: finalCallId,
            businessId,
            plan: subscription.plan,
            direction,
            status: 'active',
            metadata: metadata || {}
          }
        });
      } catch (sessionError) {
        console.error(`⚠️ Failed to create ActiveCallSession for ${finalCallId}:`, sessionError);
        // Continue anyway - session is not critical for call flow
      }

      console.log(`✅ Call slot acquired for business ${businessId}: ${subscription.activeCalls + 1}/${limit} (global: ${globalResult.current}/${globalResult.limit})`);

      return {
        success: true,
        currentActive: subscription.activeCalls + 1,
        limit: limit,
        available: limit - subscription.activeCalls - 1,
        globalCurrent: globalResult.current,
        globalLimit: globalResult.limit,
        callId: finalCallId
      };

    } catch (error) {
      console.error('❌ Error acquiring call slot:', error);
      throw error;
    }
  }

  /**
   * Release a call slot when call ends
   * P0 UPDATE: Releases global slot + updates ActiveCallSession
   * @param {number} businessId - Business ID
   * @param {string} callId - Unique call ID
   * @returns {Promise<{success: boolean, currentActive?: number}>}
   */
  async releaseSlot(businessId, callId = null) {
    try {
      // Decrement active calls (business-level)
      await prisma.subscription.update({
        where: { businessId },
        data: {
          activeCalls: { decrement: 1 }
        }
      });

      // Safety check: ensure activeCalls doesn't go negative
      await prisma.subscription.updateMany({
        where: {
          businessId,
          activeCalls: { lt: 0 }
        },
        data: {
          activeCalls: 0
        }
      });

      // P0.1: Release global slot (Redis)
      if (callId) {
        await globalCapacityManager.releaseGlobalSlot(callId);

        // P0.3: Update ActiveCallSession
        try {
          await prisma.activeCallSession.updateMany({
            where: {
              callId,
              businessId,
              status: 'active'
            },
            data: {
              status: 'ended',
              endedAt: new Date()
            }
          });
        } catch (sessionError) {
          console.error(`⚠️ Failed to update ActiveCallSession for ${callId}:`, sessionError);
        }
      }

      const updated = await prisma.subscription.findUnique({
        where: { businessId },
        select: { activeCalls: true, concurrentLimit: true }
      });

      console.log(`✅ Call slot released for business ${businessId}: ${updated?.activeCalls || 0}`);

      return {
        success: true,
        currentActive: updated?.activeCalls || 0,
        callId
      };

    } catch (error) {
      console.error('❌ Error releasing call slot:', error);
      // Don't throw - release should be fault-tolerant
      return { success: false, error: error.message };
    }
  }

  /**
   * Get current concurrent call status
   * @param {number} businessId - Business ID
   * @returns {Promise<{activeCalls: number, limit: number, available: number, utilizationPercent: number}>}
   */
  async getStatus(businessId) {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { businessId },
        select: CONCURRENT_LIMIT_SELECT
      });

      if (!subscription) {
        return {
          activeCalls: 0,
          limit: 0,
          available: 0,
          utilizationPercent: 0
        };
      }

      const limit = getEffectivePlanConfig(subscription).concurrentLimit;
      const activeCalls = subscription.activeCalls || 0;

      return {
        activeCalls,
        limit,
        available: Math.max(0, limit - activeCalls),
        utilizationPercent: limit > 0 ? Math.round((activeCalls / limit) * 100) : 0
      };

    } catch (error) {
      console.error('❌ Error getting concurrent status:', error);
      throw error;
    }
  }

  /**
   * Check if a new call can be started
   * @param {number} businessId - Business ID
   * @returns {Promise<{canStart: boolean, reason?: string}>}
   */
  async canStartCall(businessId) {
    try {
      const status = await this.getStatus(businessId);

      if (status.limit === 0) {
        return {
          canStart: false,
          reason: 'Concurrent calls are not available for your plan'
        };
      }

      if (status.available <= 0) {
        return {
          canStart: false,
          reason: `Maximum concurrent calls (${status.limit}) reached`,
          currentActive: status.activeCalls,
          limit: status.limit
        };
      }

      return {
        canStart: true,
        currentActive: status.activeCalls,
        limit: status.limit,
        available: status.available
      };

    } catch (error) {
      console.error('❌ Error checking call availability:', error);
      return { canStart: false, reason: 'Error checking availability' };
    }
  }

  /**
   * Force reset active calls count
   * Use for cleanup/maintenance only
   * @param {number} businessId - Business ID
   */
  async forceReset(businessId) {
    try {
      await prisma.subscription.update({
        where: { businessId },
        data: { activeCalls: 0 }
      });

      console.log(`🔄 Force reset active calls for business ${businessId}`);
      return { success: true };

    } catch (error) {
      console.error('❌ Error force resetting calls:', error);
      throw error;
    }
  }

  /**
   * Reset all stuck calls (maintenance job)
   * Should run periodically to clean up any orphaned call slots
   */
  async cleanupStuckCalls() {
    try {
      // Find subscriptions with activeCalls > 0 that might be stuck
      // This should be called periodically (e.g., every hour)
      const stuckSubscriptions = await prisma.subscription.findMany({
        where: {
          activeCalls: { gt: 0 }
        },
        select: {
          businessId: true,
          activeCalls: true
        }
      });

      // For now, just log - in production, you'd verify against actual call data
      if (stuckSubscriptions.length > 0) {
        console.log(`⚠️ Found ${stuckSubscriptions.length} subscriptions with active calls`);
        // Could check against 11Labs or VAPI for actual active calls
      }

      return { checked: stuckSubscriptions.length };

    } catch (error) {
      console.error('❌ Error cleaning up stuck calls:', error);
      return { error: error.message };
    }
  }
}

// Export singleton instance
const concurrentCallManager = new ConcurrentCallManager();
export default concurrentCallManager;

// Named exports for direct function access
export const {
  acquireSlot,
  releaseSlot,
  getStatus,
  canStartCall,
  forceReset,
  cleanupStuckCalls
} = {
  acquireSlot: (businessId) => concurrentCallManager.acquireSlot(businessId),
  releaseSlot: (businessId) => concurrentCallManager.releaseSlot(businessId),
  getStatus: (businessId) => concurrentCallManager.getStatus(businessId),
  canStartCall: (businessId) => concurrentCallManager.canStartCall(businessId),
  forceReset: (businessId) => concurrentCallManager.forceReset(businessId),
  cleanupStuckCalls: () => concurrentCallManager.cleanupStuckCalls()
};
