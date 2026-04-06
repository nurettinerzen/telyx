/**
 * Plan Gating Middleware - P1 OAuth Strategy
 *
 * Strategy: "Connect freely, use with PRO+"
 * - OAuth connection endpoints: No gating (FREE can connect)
 * - Usage endpoints: PRO+ required
 *
 * This allows:
 * 1. Growth: FREE users see connected integrations (upsell opportunity)
 * 2. Security: Tokens stored but disabled until PRO upgrade
 * 3. Upsell: Clear upgrade path when user tries to use features
 */

import prisma from '../prismaClient.js';
import { hasFeature } from '../config/plans.js';

/**
 * Plan hierarchy for comparison
 */
const PLAN_HIERARCHY = {
  FREE: 0,
  TRIAL: 1,
  PAYG: 2,
  STARTER: 3,
  PRO: 4,
  ENTERPRISE: 5
};

/**
 * Check if plan meets minimum requirement
 * @param {string} currentPlan - User's current plan
 * @param {string} requiredPlan - Minimum required plan
 * @returns {boolean}
 */
export function planMeetsRequirement(currentPlan, requiredPlan) {
  const currentLevel = PLAN_HIERARCHY[currentPlan] || 0;
  const requiredLevel = PLAN_HIERARCHY[requiredPlan] || 0;
  return currentLevel >= requiredLevel;
}

/**
 * Check whether the current subscription can use the email inbox.
 * Email access is feature-based, not strictly hierarchy-based, because PAYG
 * also includes email even though it sits below STARTER in legacy gating.
 *
 * @param {{ plan?: string, status?: string } | null | undefined} subscription
 * @returns {boolean}
 */
export function hasEmailInboxAccess(subscription) {
  if (!subscription) return false;

  const isActive = subscription.status === 'ACTIVE' || subscription.status === 'TRIAL';
  if (!isActive) return false;

  return hasFeature(subscription.plan, 'email');
}

/**
 * Require PRO or higher plan
 * Usage: router.get('/endpoint', authenticateToken, requireProOrAbove, handler)
 */
export async function requireProOrAbove(req, res, next) {
  try {
    const businessId = req.businessId;

    if (!businessId) {
      return res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required'
      });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      select: { plan: true, status: true }
    });

    if (!subscription) {
      return res.status(403).json({
        error: 'NO_SUBSCRIPTION',
        message: 'No active subscription found',
        messageTR: 'Aktif abonelik bulunamadı'
      });
    }

    // Check plan level
    if (!planMeetsRequirement(subscription.plan, 'PRO')) {
      return res.status(403).json({
        error: 'PLAN_UPGRADE_REQUIRED',
        message: 'This feature requires PRO plan or higher. Upgrade to unlock.',
        messageTR: 'Bu özellik PRO veya daha yüksek plan gerektirir. Yükseltme yapın.',
        currentPlan: subscription.plan,
        requiredPlan: 'PRO',
        upgradeUrl: '/settings/billing'
      });
    }

    // Check subscription status
    if (subscription.status !== 'ACTIVE' && subscription.status !== 'TRIAL') {
      return res.status(403).json({
        error: 'SUBSCRIPTION_INACTIVE',
        message: 'Subscription is not active',
        messageTR: 'Abonelik aktif değil',
        status: subscription.status
      });
    }

    next();
  } catch (error) {
    console.error('Plan gating error:', error);
    res.status(500).json({
      error: 'PLAN_CHECK_FAILED',
      message: 'Failed to verify plan access'
    });
  }
}

/**
 * Require STARTER or higher plan
 * Usage: router.get('/endpoint', authenticateToken, requireStarterOrAbove, handler)
 */
export async function requireStarterOrAbove(req, res, next) {
  try {
    const businessId = req.businessId;

    if (!businessId) {
      return res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required'
      });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      select: { plan: true, status: true }
    });

    if (!subscription) {
      return res.status(403).json({
        error: 'NO_SUBSCRIPTION',
        message: 'No active subscription found'
      });
    }

    if (!planMeetsRequirement(subscription.plan, 'STARTER')) {
      return res.status(403).json({
        error: 'PLAN_UPGRADE_REQUIRED',
        message: 'This feature requires STARTER plan or higher',
        currentPlan: subscription.plan,
        requiredPlan: 'STARTER',
        upgradeUrl: '/settings/billing'
      });
    }

    if (subscription.status !== 'ACTIVE' && subscription.status !== 'TRIAL') {
      return res.status(403).json({
        error: 'SUBSCRIPTION_INACTIVE',
        message: 'Subscription is not active',
        status: subscription.status
      });
    }

    next();
  } catch (error) {
    console.error('Plan gating error:', error);
    res.status(500).json({
      error: 'PLAN_CHECK_FAILED',
      message: 'Failed to verify plan access'
    });
  }
}

/**
 * Require access to the email inbox based on plan feature entitlements.
 * Usage: router.get('/threads', authenticateToken, requireEmailInboxAccess, handler)
 */
export async function requireEmailInboxAccess(req, res, next) {
  try {
    const businessId = req.businessId;

    if (!businessId) {
      return res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required'
      });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      select: { plan: true, status: true }
    });

    if (!subscription) {
      return res.status(403).json({
        error: 'NO_SUBSCRIPTION',
        message: 'No active subscription found'
      });
    }

    if (!hasEmailInboxAccess(subscription)) {
      return res.status(403).json({
        error: 'PLAN_UPGRADE_REQUIRED',
        message: 'This feature is not available on your current plan',
        currentPlan: subscription.plan,
        requiredPlan: 'PAYG',
        upgradeUrl: '/dashboard/subscription'
      });
    }

    next();
  } catch (error) {
    console.error('Email inbox gating error:', error);
    res.status(500).json({
      error: 'PLAN_CHECK_FAILED',
      message: 'Failed to verify email inbox access'
    });
  }
}

/**
 * Check if feature is enabled for plan (non-blocking, adds flag to request)
 * Usage: router.get('/endpoint', authenticateToken, checkFeatureAccess('email'), handler)
 * Access via: req.featureAccess = { hasAccess: boolean, plan: string }
 */
export function checkFeatureAccess(featureName) {
  return async (req, res, next) => {
    try {
      const businessId = req.businessId;

      if (!businessId) {
        req.featureAccess = { hasAccess: false, reason: 'NO_AUTH' };
        return next();
      }

      const subscription = await prisma.subscription.findUnique({
        where: { businessId },
        select: { plan: true, status: true }
      });

      if (!subscription || subscription.status !== 'ACTIVE') {
        req.featureAccess = { hasAccess: false, reason: 'NO_SUBSCRIPTION', plan: subscription?.plan };
        return next();
      }

      // Feature-specific requirements
      const requirements = {
        email: 'STARTER',
        integrations: 'PRO',
        batchCalls: 'TRIAL',
        analytics: 'STARTER',
        apiAccess: 'ENTERPRISE'
      };

      const requiredPlan = requirements[featureName] || 'STARTER';
      const hasAccess = planMeetsRequirement(subscription.plan, requiredPlan);

      req.featureAccess = {
        hasAccess,
        plan: subscription.plan,
        requiredPlan,
        reason: hasAccess ? 'OK' : 'PLAN_UPGRADE_REQUIRED'
      };

      next();
    } catch (error) {
      console.error('Feature access check error:', error);
      req.featureAccess = { hasAccess: false, reason: 'ERROR' };
      next();
    }
  };
}

export default {
  hasEmailInboxAccess,
  requireEmailInboxAccess,
  requireProOrAbove,
  requireStarterOrAbove,
  checkFeatureAccess,
  planMeetsRequirement
};
