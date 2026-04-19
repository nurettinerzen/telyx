// ============================================================================
// FEATURE ACCESS CONTROLLER SERVICE
// ============================================================================
// FILE: backend/src/services/featureAccess.js
//
// Controls access to features and channels based on subscription plan
// ============================================================================

import prisma from '../prismaClient.js';
import { PLANS, hasFeature, hasChannel, getChannels, getPlanConfig } from '../config/plans.js';
import { getEffectivePlanConfig } from './planConfig.js';

/**
 * Feature Access Controller
 * Manages feature and channel access based on subscription plans
 */
class FeatureAccessController {

  /**
   * Check if business can access a specific channel
   * @param {number} businessId - Business ID
   * @param {string} channel - Channel name (phone, whatsapp, chat_widget, email)
   * @returns {Promise<{allowed: boolean, reason?: string, requiredPlan?: string}>}
   */
  async canAccessChannel(businessId, channel) {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { businessId },
        select: { plan: true, status: true }
      });

      if (!subscription) {
        return {
          allowed: false,
          reason: 'No subscription found',
          requiredPlan: 'STARTER'
        };
      }

      // Check subscription status
      if (subscription.status !== 'ACTIVE' && subscription.status !== 'TRIAL') {
        return {
          allowed: false,
          reason: 'Subscription is not active',
          status: subscription.status
        };
      }

      const allowed = hasChannel(subscription.plan, channel);

      if (!allowed) {
        // Determine which plan is required
        let requiredPlan = 'PRO';
        if (channel === 'email') {
          requiredPlan = 'PRO';
        }

        return {
          allowed: false,
          reason: `${channel} channel requires ${requiredPlan} plan`,
          requiredPlan,
          upgradeUrl: '/dashboard/subscription'
        };
      }

      return { allowed: true };

    } catch (error) {
      console.error('❌ Error checking channel access:', error);
      throw error;
    }
  }

  /**
   * Check if business can access a specific feature
   * @param {number} businessId - Business ID
   * @param {string} feature - Feature name
   * @returns {Promise<{allowed: boolean, reason?: string, requiredPlan?: string}>}
   */
  async canAccessFeature(businessId, feature) {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { businessId },
        select: { plan: true, status: true }
      });

      if (!subscription) {
        return {
          allowed: false,
          reason: 'No subscription found',
          requiredPlan: 'STARTER'
        };
      }

      // Check subscription status
      if (subscription.status !== 'ACTIVE' && subscription.status !== 'TRIAL') {
        return {
          allowed: false,
          reason: 'Subscription is not active',
          status: subscription.status
        };
      }

      const allowed = hasFeature(subscription.plan, feature);

      if (!allowed) {
        // Determine which plan is required for this feature
        const requiredPlan = this.getRequiredPlanForFeature(feature);

        return {
          allowed: false,
          reason: `${feature} feature requires ${requiredPlan} plan`,
          requiredPlan,
          upgradeUrl: '/dashboard/subscription'
        };
      }

      return { allowed: true };

    } catch (error) {
      console.error('❌ Error checking feature access:', error);
      throw error;
    }
  }

  /**
   * Get the minimum plan required for a feature
   * @param {string} feature - Feature name
   * @returns {string} Plan name (STARTER, PRO, ENTERPRISE)
   */
  getRequiredPlanForFeature(feature) {
    const trialFeatures = [
      'batchCalls'
    ];

    // Features available in PRO and above
    const proFeatures = [
      'email',
      'prioritySupport',
      'advancedAnalytics',
      'apiAccess'
    ];

    // Features available in ENTERPRISE only
    const enterpriseFeatures = [
      'customVoice',
      'whiteLabel',
      'dedicatedSupport',
      'slaGuarantee',
      'customIntegrations'
    ];

    if (enterpriseFeatures.includes(feature)) {
      return 'ENTERPRISE';
    }

    if (trialFeatures.includes(feature)) {
      return 'TRIAL';
    }

    if (proFeatures.includes(feature)) {
      return 'PRO';
    }

    return 'STARTER';
  }

  /**
   * Get full access summary for a business
   * @param {number} businessId - Business ID
   * @returns {Promise<object>} Access summary
   */
  async getAccessSummary(businessId) {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { businessId },
        select: {
          plan: true,
          status: true,
          concurrentLimit: true,
          minutesLimit: true,
          minutesUsed: true,
          creditMinutes: true,
          creditMinutesUsed: true,
          overageMinutes: true,
          overageLimit: true
        }
      });

      if (!subscription) {
        return {
          plan: null,
          status: 'NONE',
          channels: {},
          features: {},
          limits: {}
        };
      }

      const planConfig = getPlanConfig(subscription.plan);
      const effectivePlanConfig = getEffectivePlanConfig(subscription);
      const channels = getChannels(subscription.plan);

      return {
        plan: {
          name: planConfig.nameTR || planConfig.name,
          code: subscription.plan,
          deprecated: planConfig.deprecated || false
        },
        status: subscription.status,
        channels: {
          phone: channels.includes('phone'),
          whatsapp: channels.includes('whatsapp'),
          chat_widget: channels.includes('chat_widget'),
          email: channels.includes('email')
        },
        features: {
          ecommerce: planConfig.features?.ecommerce || false,
          calendar: planConfig.features?.calendar || false,
          batchCalls: planConfig.features?.batchCalls || false,
          advancedAnalytics: planConfig.features?.advancedAnalytics || false,
          prioritySupport: planConfig.features?.prioritySupport || false,
          apiAccess: planConfig.features?.apiAccess || false
        },
        limits: {
          concurrent: effectivePlanConfig.concurrentLimit,
          assistants: planConfig.assistantsLimit,
          phoneNumbers: planConfig.phoneNumbersLimit,
          overage: subscription.overageLimit || planConfig.overageLimit
        },
        usage: {
          minutesUsed: subscription.minutesUsed,
          minutesLimit: subscription.minutesLimit,
          creditMinutes: subscription.creditMinutes,
          creditMinutesUsed: subscription.creditMinutesUsed,
          overageMinutes: subscription.overageMinutes
        },
        support: planConfig.supportLevel,
        analytics: planConfig.analyticsLevel
      };

    } catch (error) {
      console.error('❌ Error getting access summary:', error);
      throw error;
    }
  }

  /**
   * Check multiple features at once
   * @param {number} businessId - Business ID
   * @param {string[]} features - Array of feature names
   * @returns {Promise<object>} Object with feature access results
   */
  async checkMultipleFeatures(businessId, features) {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { businessId },
        select: { plan: true, status: true }
      });

      if (!subscription) {
        const result = {};
        features.forEach(f => {
          result[f] = { allowed: false, reason: 'No subscription' };
        });
        return result;
      }

      const result = {};
      features.forEach(feature => {
        const allowed = hasFeature(subscription.plan, feature);
        result[feature] = {
          allowed,
          requiredPlan: allowed ? null : this.getRequiredPlanForFeature(feature)
        };
      });

      return result;

    } catch (error) {
      console.error('❌ Error checking multiple features:', error);
      throw error;
    }
  }

  /**
   * Get upgrade recommendation based on desired features
   * @param {number} businessId - Business ID
   * @param {string[]} desiredFeatures - Features the user wants
   * @returns {Promise<object>} Upgrade recommendation
   */
  async getUpgradeRecommendation(businessId, desiredFeatures = []) {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { businessId },
        select: { plan: true }
      });

      const currentPlan = subscription?.plan || 'FREE';
      const planOrder = ['FREE', 'STARTER', 'PRO', 'ENTERPRISE'];
      const currentIndex = planOrder.indexOf(currentPlan);

      // Find missing features
      const missingFeatures = desiredFeatures.filter(f => !hasFeature(currentPlan, f));

      if (missingFeatures.length === 0) {
        return {
          needsUpgrade: false,
          currentPlan,
          message: 'Your current plan includes all requested features'
        };
      }

      // Find minimum required plan
      let requiredPlanIndex = currentIndex;
      missingFeatures.forEach(feature => {
        const requiredPlan = this.getRequiredPlanForFeature(feature);
        const planIndex = planOrder.indexOf(requiredPlan);
        if (planIndex > requiredPlanIndex) {
          requiredPlanIndex = planIndex;
        }
      });

      const recommendedPlan = planOrder[requiredPlanIndex];

      return {
        needsUpgrade: true,
        currentPlan,
        recommendedPlan,
        missingFeatures,
        upgradeUrl: '/dashboard/subscription'
      };

    } catch (error) {
      console.error('❌ Error getting upgrade recommendation:', error);
      throw error;
    }
  }
}

// Export singleton instance
const featureAccess = new FeatureAccessController();
export default featureAccess;

// Named exports
export const {
  canAccessChannel,
  canAccessFeature,
  getAccessSummary,
  checkMultipleFeatures,
  getUpgradeRecommendation
} = {
  canAccessChannel: (businessId, channel) => featureAccess.canAccessChannel(businessId, channel),
  canAccessFeature: (businessId, feature) => featureAccess.canAccessFeature(businessId, feature),
  getAccessSummary: (businessId) => featureAccess.getAccessSummary(businessId),
  checkMultipleFeatures: (businessId, features) => featureAccess.checkMultipleFeatures(businessId, features),
  getUpgradeRecommendation: (businessId, features) => featureAccess.getUpgradeRecommendation(businessId, features)
};
