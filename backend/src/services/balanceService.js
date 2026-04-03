// ============================================================================
// BALANCE SERVICE - Bakiye Yönetimi
// ============================================================================
// FILE: backend/src/services/balanceService.js
//
// Kullanıcı bakiye yönetimi:
// - topUp: Bakiye yükleme
// - deduct: Bakiye düşme
// - checkAutoReload: Otomatik yükleme kontrolü
// - processAutoReload: Otomatik yükleme işlemi
// - getBalanceInMinutes: Bakiye dakika karşılığı
// ============================================================================

import prisma from '../prismaClient.js';
import { getPricePerMinute, calculateTLToMinutes } from '../config/plans.js';

const COUNTRY_BUSINESS_SELECT = {
  business: {
    select: { country: true }
  }
};

const OWNER_EMAIL_BUSINESS_SELECT = {
  business: {
    select: {
      name: true,
      users: {
        where: { role: 'OWNER' },
        take: 1,
        select: { email: true }
      }
    }
  }
};

const BASE_BALANCE_SUBSCRIPTION_SELECT = {
  id: true,
  plan: true,
  balance: true,
  autoReloadEnabled: true,
  autoReloadThreshold: true,
  autoReloadAmount: true,
  stripeCustomerId: true,
  iyzicoCardToken: true
};

/**
 * Bakiyeye TL ekle
 * @param {number} subscriptionId - Subscription ID
 * @param {number} amountTL - Eklenecek TL miktarı
 * @param {object} paymentInfo - Ödeme bilgileri
 * @param {string} paymentInfo.stripePaymentIntentId - Stripe payment intent ID
 * @param {string} paymentInfo.iyzicoPaymentId - iyzico payment ID
 * @param {string} description - Açıklama
 * @returns {object} { success, balance, balanceMinutes, transaction }
 */
export async function topUp(subscriptionId, amountTL, paymentInfo = {}, description = null) {
  try {
    console.log(`💰 Balance topUp: Subscription ${subscriptionId}, Amount: ${amountTL} TL`);

    // Get current subscription
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: {
        ...BASE_BALANCE_SUBSCRIPTION_SELECT,
        ...COUNTRY_BUSINESS_SELECT
      }
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const balanceBefore = subscription.balance;
    const balanceAfter = balanceBefore + amountTL;

    // Calculate minutes equivalent
    const pricePerMinute = getPricePerMinute(subscription.plan, subscription.business?.country || 'TR');
    const minutesEquivalent = pricePerMinute > 0 ? Math.floor(amountTL / pricePerMinute) : 0;

    // Create description if not provided
    const txDescription = description || `${minutesEquivalent} dakika bakiye yüklendi (${amountTL} TL)`;

    // Update balance and create transaction in a transaction
    const [updatedSubscription, transaction] = await prisma.$transaction([
      prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          balance: balanceAfter
        }
      }),
      prisma.balanceTransaction.create({
        data: {
          subscriptionId,
          type: 'TOPUP',
          amount: amountTL,
          balanceBefore,
          balanceAfter,
          stripePaymentIntentId: paymentInfo.stripePaymentIntentId || null,
          iyzicoPaymentId: paymentInfo.iyzicoPaymentId || null,
          description: txDescription
        }
      })
    ]);

    console.log(`✅ Balance topUp success: ${balanceBefore} → ${balanceAfter} TL`);

    return {
      success: true,
      balance: balanceAfter,
      balanceMinutes: calculateTLToMinutes(balanceAfter, subscription.plan, subscription.business?.country || 'TR'),
      transaction
    };
  } catch (error) {
    console.error('❌ Balance topUp error:', error);
    throw error;
  }
}

/**
 * Bakiyeden TL düş
 * @param {number} subscriptionId - Subscription ID
 * @param {number} amountTL - Düşülecek TL miktarı
 * @param {string} usageRecordId - İlişkili usage record ID
 * @param {string} description - Açıklama
 * @returns {object} { success, balance, balanceMinutes, transaction }
 */
export async function deduct(subscriptionId, amountTL, usageRecordId = null, description = null) {
  try {
    console.log(`💸 Balance deduct: Subscription ${subscriptionId}, Amount: ${amountTL} TL`);

    // Get current subscription
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: {
        ...BASE_BALANCE_SUBSCRIPTION_SELECT,
        ...COUNTRY_BUSINESS_SELECT
      }
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const balanceBefore = subscription.balance;

    // Check if enough balance
    if (balanceBefore < amountTL) {
      throw new Error('INSUFFICIENT_BALANCE');
    }

    const balanceAfter = balanceBefore - amountTL;

    // Update balance and create transaction
    const [updatedSubscription, transaction] = await prisma.$transaction([
      prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          balance: balanceAfter
        }
      }),
      prisma.balanceTransaction.create({
        data: {
          subscriptionId,
          type: 'USAGE',
          amount: -amountTL, // Negative for deduction
          balanceBefore,
          balanceAfter,
          usageRecordId,
          description: description || `Kullanım: ${amountTL} TL`
        }
      })
    ]);

    console.log(`✅ Balance deduct success: ${balanceBefore} → ${balanceAfter} TL`);

    // Check auto reload after deduction
    await checkAutoReload(subscriptionId);

    return {
      success: true,
      balance: balanceAfter,
      balanceMinutes: calculateTLToMinutes(balanceAfter, subscription.plan, subscription.business?.country || 'TR'),
      transaction
    };
  } catch (error) {
    console.error('❌ Balance deduct error:', error);
    throw error;
  }
}

/**
 * Otomatik yükleme kontrolü
 * @param {number} subscriptionId - Subscription ID
 */
export async function checkAutoReload(subscriptionId) {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: {
        ...BASE_BALANCE_SUBSCRIPTION_SELECT,
        ...COUNTRY_BUSINESS_SELECT
      }
    });

    if (!subscription) {
      return;
    }

    // Check if auto reload is enabled
    if (!subscription.autoReloadEnabled) {
      return;
    }

    const country = subscription.business?.country || 'TR';
    const pricePerMinute = getPricePerMinute(subscription.plan, country);

    // Calculate current balance in minutes
    const balanceMinutes = pricePerMinute > 0 ? subscription.balance / pricePerMinute : 0;

    // Check if below threshold
    if (balanceMinutes < subscription.autoReloadThreshold) {
      console.log(`⚡ Auto reload triggered: Balance ${balanceMinutes} dk < Threshold ${subscription.autoReloadThreshold} dk`);

      // Calculate amount to reload (minutes * price per minute)
      const amountTL = subscription.autoReloadAmount * pricePerMinute;

      await processAutoReload(subscriptionId, amountTL);
    }
  } catch (error) {
    console.error('❌ Auto reload check error:', error);
    // Don't throw - auto reload failure shouldn't break the flow
  }
}

/**
 * Otomatik yükleme işlemi
 * @param {number} subscriptionId - Subscription ID
 * @param {number} amountTL - Yüklenecek TL miktarı
 */
export async function processAutoReload(subscriptionId, amountTL) {
  try {
    console.log(`🔄 Processing auto reload: Subscription ${subscriptionId}, Amount: ${amountTL} TL`);

    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: {
        ...BASE_BALANCE_SUBSCRIPTION_SELECT,
        ...OWNER_EMAIL_BUSINESS_SELECT
      }
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Try to charge from saved card
    let paymentSuccess = false;
    let paymentInfo = {};

    // Check if we have a saved card token for iyzico
    if (subscription.iyzicoCardToken) {
      try {
        // TODO: Implement iyzico card charge
        // const iyzicoService = (await import('./iyzico.js')).default;
        // const result = await iyzicoService.chargeWithToken(subscription.iyzicoCardToken, amountTL);
        // paymentInfo.iyzicoPaymentId = result.paymentId;
        // paymentSuccess = true;

        console.log('⚠️ iyzico auto-charge not implemented yet');
      } catch (chargeError) {
        console.error('❌ iyzico charge failed:', chargeError);
      }
    }

    // Check if we have Stripe customer ID
    if (!paymentSuccess && subscription.stripeCustomerId) {
      try {
        // TODO: Implement Stripe card charge
        // const stripeService = (await import('./stripe.js')).default;
        // const result = await stripeService.chargeCustomer(subscription.stripeCustomerId, amountTL);
        // paymentInfo.stripePaymentIntentId = result.paymentIntentId;
        // paymentSuccess = true;

        console.log('⚠️ Stripe auto-charge not implemented yet');
      } catch (chargeError) {
        console.error('❌ Stripe charge failed:', chargeError);
      }
    }

    if (paymentSuccess) {
      // Add balance
      await topUp(subscriptionId, amountTL, paymentInfo, 'Otomatik bakiye yükleme');
      console.log(`✅ Auto reload success: ${amountTL} TL`);
    } else {
      // Send notification email about failed auto reload
      const ownerEmail = subscription.business?.users?.[0]?.email;
      if (ownerEmail) {
        try {
          const emailService = (await import('./emailService.js')).default;
          await emailService.sendAutoReloadFailedEmail(
            ownerEmail,
            subscription.business.name,
            amountTL
          );
        } catch (emailError) {
          console.error('❌ Failed to send auto reload failed email:', emailError);
        }
      }
    }
  } catch (error) {
    console.error('❌ Process auto reload error:', error);
    throw error;
  }
}

/**
 * Bakiyeyi TL ve dakika olarak döndür
 * @param {number} subscriptionId - Subscription ID
 * @returns {object} { balanceTL, balanceMinutes, pricePerMinute }
 */
export async function getBalanceInMinutes(subscriptionId) {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: {
        ...BASE_BALANCE_SUBSCRIPTION_SELECT,
        ...COUNTRY_BUSINESS_SELECT
      }
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const country = subscription.business?.country || 'TR';
    const pricePerMinute = getPricePerMinute(subscription.plan, country);
    const balanceMinutes = pricePerMinute > 0 ? Math.floor(subscription.balance / pricePerMinute) : 0;

    return {
      balanceTL: subscription.balance,
      balanceMinutes,
      pricePerMinute
    };
  } catch (error) {
    console.error('❌ Get balance error:', error);
    throw error;
  }
}

/**
 * Bakiye işlemlerini listele
 * @param {number} subscriptionId - Subscription ID
 * @param {object} options - Sayfalama seçenekleri
 * @returns {object} { transactions, total }
 */
export async function getTransactions(subscriptionId, options = {}) {
  try {
    const { limit = 20, offset = 0, type = null } = options;

    const where = { subscriptionId };
    if (type) {
      where.type = type;
    }

    const [transactions, total] = await Promise.all([
      prisma.balanceTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.balanceTransaction.count({ where })
    ]);

    return { transactions, total };
  } catch (error) {
    console.error('❌ Get transactions error:', error);
    throw error;
  }
}

/**
 * Otomatik yükleme ayarlarını güncelle
 * @param {number} subscriptionId - Subscription ID
 * @param {object} settings - Ayarlar
 * @returns {object} Updated subscription
 */
export async function updateAutoReloadSettings(subscriptionId, settings) {
  try {
    const { enabled, threshold, amount } = settings;

    const updated = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        autoReloadEnabled: enabled,
        autoReloadThreshold: threshold,
        autoReloadAmount: amount
      }
    });

    console.log(`✅ Auto reload settings updated: Subscription ${subscriptionId}`);

    return updated;
  } catch (error) {
    console.error('❌ Update auto reload settings error:', error);
    throw error;
  }
}

/**
 * Refund işlemi
 * @param {number} subscriptionId - Subscription ID
 * @param {number} amountTL - İade edilecek TL
 * @param {string} description - Açıklama
 * @returns {object} { success, balance, transaction }
 */
export async function refund(subscriptionId, amountTL, description = 'İade') {
  try {
    console.log(`💰 Balance refund: Subscription ${subscriptionId}, Amount: ${amountTL} TL`);

    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: {
        id: true,
        balance: true
      }
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const balanceBefore = subscription.balance;
    const balanceAfter = balanceBefore + amountTL;

    const [updatedSubscription, transaction] = await prisma.$transaction([
      prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          balance: balanceAfter
        }
      }),
      prisma.balanceTransaction.create({
        data: {
          subscriptionId,
          type: 'REFUND',
          amount: amountTL,
          balanceBefore,
          balanceAfter,
          description
        }
      })
    ]);

    console.log(`✅ Balance refund success: ${balanceBefore} → ${balanceAfter} TL`);

    return {
      success: true,
      balance: balanceAfter,
      transaction
    };
  } catch (error) {
    console.error('❌ Balance refund error:', error);
    throw error;
  }
}

export default {
  topUp,
  deduct,
  checkAutoReload,
  processAutoReload,
  getBalanceInMinutes,
  getTransactions,
  updateAutoReloadSettings,
  refund
};
