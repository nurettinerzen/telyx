// ============================================================================
// SUBSCRIPTION LIMITS MIDDLEWARE
// ============================================================================
// FILE: backend/src/middleware/subscriptionLimits.js
//
// This middleware checks if users are within their subscription limits
// before allowing certain actions (creating assistants, making calls, etc.)
// Also handles feature and channel access control
// ============================================================================

import prisma from '../prismaClient.js';
import { PLANS, hasFeature, hasChannel, getConcurrentLimit } from '../config/plans.js';
import featureAccess from '../services/featureAccess.js';
import concurrentCallManager from '../services/concurrentCallManager.js';

// Plan limits configuration - YENİ PAKET YAPISI
const PLAN_LIMITS = {
  FREE: {
    minutes: 0,              // No minutes
    calls: 0,                // No calls
    assistants: 0,           // No assistants
    phoneNumbers: 0,         // No phone numbers
    concurrent: 0,           // No concurrent calls
    trainings: 3,            // 3 AI trainings
    voices: 4,               // 4 voices
    integrations: false,
    analytics: false,
    aiAnalysis: false
  },
  STARTER: {
    minutes: 100,            // 100 dk/ay (YENİ)
    calls: -1,               // Sınırsız çağrı
    assistants: -1,          // Sınırsız asistan
    phoneNumbers: -1,        // Sınırsız numara
    concurrent: 1,           // 1 eşzamanlı çağrı
    trainings: -1,           // Unlimited
    voices: -1,              // All voices
    integrations: true,
    analytics: true,         // Basic analytics
    aiAnalysis: false        // Pro'da
  },
  PRO: {
    minutes: 800,            // 800 dk/ay (YENİ)
    calls: -1,               // Sınırsız
    assistants: -1,          // Sınırsız
    phoneNumbers: -1,        // Sınırsız
    concurrent: 5,           // 5 eşzamanlı çağrı
    trainings: -1,
    voices: -1,
    integrations: true,
    analytics: true,         // Advanced analytics
    aiAnalysis: true
  },
  ENTERPRISE: {
    minutes: -1,             // Custom
    calls: -1,
    assistants: -1,
    phoneNumbers: -1,
    concurrent: 10,          // 10+ eşzamanlı
    trainings: -1,
    voices: -1,
    integrations: true,
    analytics: true,
    aiAnalysis: true
  },
  // Legacy plan aliases - yeni plan değerlerini kullan
  BASIC: {
    minutes: 100,            // → STARTER
    calls: -1,
    assistants: -1,
    phoneNumbers: -1,
    concurrent: 1,
    trainings: -1,
    voices: -1,
    integrations: true,
    analytics: true,
    aiAnalysis: false
  }
};

/**
 * Check if action is allowed based on subscription limits
 * @param {String} action - Type of action (minutes, calls, assistants, phoneNumbers, integrations)
 */
export const checkLimit = (action) => {
  return async (req, res, next) => {
    try {
      const { businessId } = req.user;

      if (!businessId) {
        return res.status(401).json({
          error: 'Business ID required',
          upgradeRequired: false
        });
      }

      // Get subscription
      const subscription = await prisma.subscription.findUnique({
        where: { businessId },
        include: {
          business: {
            select: {
              name: true,
              phoneNumbers: true
            }
          }
        }
      });

      // Default to FREE if no subscription
      const plan = subscription?.plan || 'FREE';
      const limits = PLAN_LIMITS[plan];

      // Check specific action
      switch (action) {
        case 'minutes':
          if (limits.minutes === 0) {
            return res.status(403).json({
              error: 'No call minutes available on FREE plan',
              message: 'Upgrade to STARTER plan to get 300 minutes per month',
              upgradeRequired: true,
              currentPlan: plan,
              suggestedPlan: 'STARTER'
            });
          }
          
          if (limits.minutes > 0 && subscription.minutesUsed >= limits.minutes) {
            return res.status(403).json({
              error: 'Monthly minute limit reached',
              message: `You've used ${subscription.minutesUsed}/${limits.minutes} minutes this month. Upgrade to PRO for 1500 minutes.`,
              upgradeRequired: true,
              currentPlan: plan,
              suggestedPlan: 'PRO',
              usage: {
                used: subscription.minutesUsed,
                limit: limits.minutes,
                percentage: Math.round((subscription.minutesUsed / limits.minutes) * 100)
              }
            });
          }
          break;

        case 'calls':
          if (limits.calls === 0) {
            return res.status(403).json({
              error: 'No phone calls available on FREE plan',
              message: 'Upgrade to STARTER plan to receive calls on your phone number',
              upgradeRequired: true,
              currentPlan: plan,
              suggestedPlan: 'STARTER'
            });
          }
          
          if (limits.calls > 0 && subscription.callsThisMonth >= limits.calls) {
            return res.status(403).json({
              error: 'Monthly call limit reached',
              message: `You've received ${subscription.callsThisMonth}/${limits.calls} calls this month. Upgrade to PRO for unlimited calls.`,
              upgradeRequired: true,
              currentPlan: plan,
              suggestedPlan: 'PRO',
              usage: {
                used: subscription.callsThisMonth,
                limit: limits.calls,
                percentage: Math.round((subscription.callsThisMonth / limits.calls) * 100)
              }
            });
          }
          break;

        case 'assistants':
          const currentAssistants = subscription?.assistantsCreated || 0;
          
          if (limits.assistants === 0) {
            return res.status(403).json({
              error: 'Cannot create permanent assistants on FREE plan',
              message: 'Upgrade to STARTER plan to create your first AI assistant',
              upgradeRequired: true,
              currentPlan: plan,
              suggestedPlan: 'STARTER'
            });
          }
          
          if (limits.assistants > 0 && currentAssistants >= limits.assistants) {
            return res.status(403).json({
              error: 'Assistant limit reached',
              message: `You've created ${currentAssistants}/${limits.assistants} assistants. Upgrade to PRO for 2 assistants.`,
              upgradeRequired: true,
              currentPlan: plan,
              suggestedPlan: 'PRO',
              usage: {
                used: currentAssistants,
                limit: limits.assistants
              }
            });
          }
          break;

        case 'phoneNumbers':
          const currentPhoneNumbers = subscription?.business?.phoneNumbers?.length || 0;
          
          if (limits.phoneNumbers === 0) {
            return res.status(403).json({
              error: 'Phone numbers not available on FREE plan',
              message: 'Upgrade to STARTER plan to get your phone number',
              upgradeRequired: true,
              currentPlan: plan,
              suggestedPlan: 'STARTER'
            });
          }
          
          if (limits.phoneNumbers > 0 && currentPhoneNumbers >= limits.phoneNumbers) {
            return res.status(403).json({
              error: 'Phone number limit reached',
              message: `You've provisioned ${currentPhoneNumbers}/${limits.phoneNumbers} phone numbers. Upgrade to PRO for 3 numbers.`,
              upgradeRequired: true,
              currentPlan: plan,
              suggestedPlan: 'PRO',
              usage: {
                used: currentPhoneNumbers,
                limit: limits.phoneNumbers
              }
            });
          }
          break;

        case 'integrations':
          if (!limits.integrations) {
            return res.status(403).json({
              error: 'Integrations not available on FREE plan',
              message: 'Upgrade to STARTER plan to access all integrations',
              upgradeRequired: true,
              currentPlan: plan,
              suggestedPlan: 'STARTER'
            });
          }
          break;

        case 'analytics':
          if (!limits.analytics) {
            return res.status(403).json({
              error: 'Analytics not available on FREE plan',
              message: 'Upgrade to STARTER plan for call analytics and insights',
              upgradeRequired: true,
              currentPlan: plan,
              suggestedPlan: 'STARTER'
            });
          }
          break;

        case 'aiAnalysis':
          if (!limits.aiAnalysis) {
            return res.status(403).json({
              error: 'AI Analysis is a PRO feature',
              message: 'Upgrade to PRO plan for AI-powered call insights, sentiment analysis, and transcripts',
              upgradeRequired: true,
              currentPlan: plan,
              suggestedPlan: 'PRO'
            });
          }
          break;

        default:
          console.warn(`Unknown limit check: ${action}`);
      }

      // Action is allowed, attach plan info to request
      req.subscription = {
        plan,
        limits,
        usage: {
          minutes: subscription?.minutesUsed || 0,
          calls: subscription?.callsThisMonth || 0,
          assistants: subscription?.assistantsCreated || 0,
          phoneNumbers: subscription?.business?.phoneNumbers?.length || 0
        }
      };

      next();
    } catch (error) {
      console.error('Subscription limit check error:', error);
      res.status(500).json({ 
        error: 'Failed to verify subscription limits',
        message: 'Please try again or contact support'
      });
    }
  };
};

/**
 * Check multiple limits at once
 * @param {Array<String>} actions - Array of actions to check
 */
export const checkMultipleLimits = (actions) => {
  return async (req, res, next) => {
    try {
      const { businessId } = req.user;

      if (!businessId) {
        return res.status(401).json({ error: 'Business ID required' });
      }

      const subscription = await prisma.subscription.findUnique({
        where: { businessId },
        include: {
          business: {
            select: {
              name: true,
              phoneNumbers: true
            }
          }
        }
      });

      const plan = subscription?.plan || 'FREE';
      const limits = PLAN_LIMITS[plan];

      // Check all actions
      for (const action of actions) {
        // Reuse logic from checkLimit - simplified version
        if (action === 'minutes' && limits.minutes > 0 && subscription.minutesUsed >= limits.minutes) {
          return res.status(403).json({
            error: 'Monthly minute limit reached',
            upgradeRequired: true,
            currentPlan: plan
          });
        }
        
        if (action === 'calls' && limits.calls > 0 && subscription.callsThisMonth >= limits.calls) {
          return res.status(403).json({
            error: 'Monthly call limit reached',
            upgradeRequired: true,
            currentPlan: plan
          });
        }
      }

      req.subscription = {
        plan,
        limits,
        usage: {
          minutes: subscription?.minutesUsed || 0,
          calls: subscription?.callsThisMonth || 0,
          assistants: subscription?.assistantsCreated || 0,
          phoneNumbers: subscription?.business?.phoneNumbers?.length || 0
        }
      };

      next();
    } catch (error) {
      console.error('Multiple limits check error:', error);
      res.status(500).json({ error: 'Failed to verify subscription limits' });
    }
  };
};

/**
 * Get plan limits for a specific plan
 * @param {String} plan - Plan name (FREE, STARTER, PROFESSIONAL, ENTERPRISE)
 */
export const getPlanLimits = (plan) => {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.FREE;
};

/**
 * Middleware to attach subscription info without enforcement
 * Useful for displaying usage stats
 */
export const attachSubscriptionInfo = async (req, res, next) => {
  try {
    const { businessId } = req.user;

    if (!businessId) {
      return next();
    }

    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      include: {
        business: {
          select: {
            phoneNumbers: true
          }
        }
      }
    });

    const plan = subscription?.plan || 'FREE';
    const limits = PLAN_LIMITS[plan];

    req.subscription = {
      plan,
      limits,
      usage: {
        minutes: subscription?.minutesUsed || 0,
        calls: subscription?.callsThisMonth || 0,
        assistants: subscription?.assistantsCreated || 0,
        phoneNumbers: subscription?.business?.phoneNumbers?.length || 0
      },
      status: subscription?.status || 'TRIAL'
    };

    next();
  } catch (error) {
    console.error('Attach subscription info error:', error);
    // Don't fail the request, just continue without subscription info
    next();
  }
};

/**
 * Require a specific channel to be available in the plan
 * @param {String} channel - Channel name (phone, whatsapp, chat_widget, email)
 */
export const requireChannel = (channel) => {
  return async (req, res, next) => {
    try {
      const { businessId } = req.user;

      if (!businessId) {
        return res.status(401).json({ error: 'Business ID required' });
      }

      const access = await featureAccess.canAccessChannel(businessId, channel);

      if (!access.allowed) {
        return res.status(403).json({
          error: 'CHANNEL_NOT_ALLOWED',
          message: access.reason,
          requiredPlan: access.requiredPlan,
          upgradeUrl: '/dashboard/subscription'
        });
      }

      next();
    } catch (error) {
      console.error('Channel access check error:', error);
      res.status(500).json({ error: 'Failed to verify channel access' });
    }
  };
};

/**
 * Require a specific feature to be available in the plan
 * @param {String} feature - Feature name
 */
export const requireFeature = (feature) => {
  return async (req, res, next) => {
    try {
      const { businessId } = req.user;

      if (!businessId) {
        return res.status(401).json({ error: 'Business ID required' });
      }

      const access = await featureAccess.canAccessFeature(businessId, feature);

      if (!access.allowed) {
        return res.status(403).json({
          error: 'FEATURE_NOT_ALLOWED',
          message: access.reason,
          requiredPlan: access.requiredPlan,
          upgradeUrl: '/dashboard/subscription'
        });
      }

      next();
    } catch (error) {
      console.error('Feature access check error:', error);
      res.status(500).json({ error: 'Failed to verify feature access' });
    }
  };
};

/**
 * Check concurrent call limit before starting a call
 */
export const checkConcurrentLimit = async (req, res, next) => {
  try {
    const { businessId } = req.user;

    if (!businessId) {
      return res.status(401).json({ error: 'Business ID required' });
    }

    const canStart = await concurrentCallManager.canStartCall(businessId);

    if (!canStart.canStart) {
      return res.status(429).json({
        error: 'CONCURRENT_LIMIT_EXCEEDED',
        message: canStart.reason,
        currentActive: canStart.currentActive,
        limit: canStart.limit
      });
    }

    // Attach concurrent status to request
    req.concurrentStatus = canStart;
    next();
  } catch (error) {
    console.error('Concurrent limit check error:', error);
    res.status(500).json({ error: 'Failed to verify concurrent call limit' });
  }
};

/**
 * Acquire a concurrent call slot (should be called when call actually starts)
 */
export const acquireConcurrentSlot = async (req, res, next) => {
  try {
    const { businessId } = req.user;

    if (!businessId) {
      return res.status(401).json({ error: 'Business ID required' });
    }

    const result = await concurrentCallManager.acquireSlot(businessId);

    if (!result.success) {
      return res.status(429).json({
        error: result.error,
        message: result.message,
        currentActive: result.currentActive,
        limit: result.limit
      });
    }

    req.concurrentSlot = result;
    next();
  } catch (error) {
    console.error('Acquire concurrent slot error:', error);
    res.status(500).json({ error: 'Failed to acquire call slot' });
  }
};

export default {
  checkLimit,
  checkMultipleLimits,
  getPlanLimits,
  attachSubscriptionInfo,
  requireChannel,
  requireFeature,
  checkConcurrentLimit,
  acquireConcurrentSlot,
  PLAN_LIMITS
};
