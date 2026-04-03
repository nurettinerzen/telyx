/**
 * Stripe Enterprise Service
 * Handles Stripe subscription updates for enterprise customers
 */

import Stripe from 'stripe';
import prisma from '../prismaClient.js';
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

/**
 * Update Stripe subscription price when enterprise config changes
 *
 * @param {Object} subscription - Current subscription from DB
 * @param {number} newPrice - New enterprise price in TRY
 * @param {Object} options - Update options
 * @param {boolean} options.applyProration - Whether to apply proration (default: false)
 * @param {string} options.effectiveAt - 'immediate' or 'next_period' (default: 'next_period')
 * @returns {Promise<Object>} - { success, oldPriceId, newPriceId, stripeSubscriptionId, proration }
 */
export async function updateEnterpriseStripePrice(subscription, newPrice, options = {}) {
  if (!stripe) {
    throw new Error('Stripe not configured');
  }

  const {
    applyProration = false,
    effectiveAt = 'next_period'
  } = options;

  // Check if Stripe subscription exists
  if (!subscription.stripeSubscriptionId) {
    return {
      success: false,
      reason: 'NO_STRIPE_SUBSCRIPTION',
      message: 'No active Stripe subscription found'
    };
  }

  // Check if price actually changed
  const oldPrice = subscription.enterprisePrice;
  if (oldPrice === newPrice) {
    return {
      success: false,
      reason: 'NO_PRICE_CHANGE',
      message: 'Price unchanged'
    };
  }

  try {
    // 1. Retrieve existing Stripe subscription
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );

    if (!stripeSubscription || stripeSubscription.status === 'canceled') {
      return {
        success: false,
        reason: 'SUBSCRIPTION_INACTIVE',
        message: 'Stripe subscription is canceled or not found'
      };
    }

    const oldPriceId = subscription.stripePriceId || stripeSubscription.items.data[0]?.price.id;

    // 2. Create new Stripe price (Stripe doesn't allow editing existing prices)
    const priceHash = `ent-${subscription.id}-${newPrice}-TRY-month-${Date.now()}`;

    // Get or create product
    let product;
    if (stripeSubscription.items.data[0]?.price.product) {
      product = { id: stripeSubscription.items.data[0].price.product };
    } else {
      // Create new product if not exists
      product = await stripe.products.create({
        name: `Telyx.AI Kurumsal Plan - ${subscription.business?.name || subscription.businessId}`,
        description: `${subscription.enterpriseMinutes} dakika dahil, özel kurumsal plan`,
        metadata: {
          businessId: subscription.businessId.toString(),
          type: 'enterprise'
        }
      });
    }

    const newStripePrice = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(newPrice * 100), // TRY to kuruş
      currency: 'try',
      recurring: {
        interval: 'month'
      },
      metadata: {
        subscriptionId: subscription.id.toString(),
        businessId: subscription.businessId.toString(),
        type: 'enterprise',
        priceHash,
        previousPriceId: oldPriceId || 'none'
      }
    }, {
      idempotencyKey: priceHash
    });

    // 3. Update subscription item with new price
    const subscriptionItem = stripeSubscription.items.data[0];

    const prorationBehavior = applyProration ? 'create_prorations' : 'none';
    const billingCycleAnchor = effectiveAt === 'immediate' ? undefined : 'unchanged';

    await stripe.subscriptionItems.update(
      subscriptionItem.id,
      {
        price: newStripePrice.id,
        proration_behavior: prorationBehavior
      }
    );

    // 4. Archive old price (mark as inactive)
    if (oldPriceId) {
      try {
        await stripe.prices.update(oldPriceId, { active: false });
      } catch (error) {
        console.warn(`Failed to archive old price ${oldPriceId}:`, error.message);
        // Non-critical, continue
      }
    }

    // 5. Update DB with new price ID
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        stripePriceId: newStripePrice.id
      }
    });

    return {
      success: true,
      oldPriceId,
      newPriceId: newStripePrice.id,
      oldAmount: oldPrice,
      newAmount: newPrice,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      proration: applyProration,
      effectiveAt,
      prorationBehavior
    };

  } catch (error) {
    console.error('Failed to update Stripe subscription price:', error);
    return {
      success: false,
      reason: 'STRIPE_ERROR',
      message: error.message,
      error
    };
  }
}

/**
 * Check if subscription has active Stripe subscription
 */
export function hasActiveStripeSubscription(subscription) {
  return !!(subscription.stripeSubscriptionId && subscription.stripePriceId);
}

export default {
  updateEnterpriseStripePrice,
  hasActiveStripeSubscription
};
