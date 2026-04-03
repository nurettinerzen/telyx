// ============================================================================
// USAGE TRACKING SERVICE - KREDİ SİSTEMİ İLE GÜNCELLENMİŞ
// ============================================================================
// FILE: backend/src/services/usageTracking.js
//
// Handles tracking and updating subscription usage (minutes, calls, etc.)
// Now supports: Package minutes -> Credit minutes -> Overage
// ============================================================================

import prisma from '../prismaClient.js';
import emailService from './emailService.js';
import { getEffectivePlanConfig } from './planConfig.js';

/**
 * Track call usage with credit system
 * Priority: 1. Package minutes -> 2. Credit minutes -> 3. Overage
 * @param {Number} businessId
 * @param {Number} durationInSeconds - Call duration in seconds
 * @param {Object} callData - Additional call data (callId, callerId, transcript, etc.)
 */
export const trackCallUsage = async (businessId, durationInSeconds, callData = {}) => {
  try {
    console.log(`📊 Tracking call usage for business ${businessId}: ${durationInSeconds}s`);

    // Convert seconds to minutes (rounded up)
    const totalMinutes = Math.ceil(durationInSeconds / 60);

    // Get current subscription
    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      include: {
        business: {
          select: {
            name: true,
            users: {
              select: {
                email: true,
                role: true
              },
              where: {
                role: 'OWNER'
              },
              take: 1
            }
          }
        }
      }
    });

    if (!subscription) {
      console.warn(`⚠️ No subscription found for business ${businessId}`);
      return null;
    }

    // Dakika düşme işlemi - KREDİ SİSTEMİ
    const result = await deductMinutesWithCredits(businessId, subscription, totalMinutes, callData.callId);

    console.log(`✅ Updated usage: Package=${result.fromPackage}, Credit=${result.fromCredit}, Overage=${result.fromOverage}`);

    // Update calls count
    await prisma.subscription.update({
      where: { businessId },
      data: {
        callsThisMonth: { increment: 1 }
      }
    });

    return result;
  } catch (error) {
    console.error('❌ Error tracking call usage:', error);
    throw error;
  }
};

/**
 * Deduct minutes using credit system priority
 * 1. Package minutes (paket dakikaları)
 * 2. Credit minutes (satın alınan krediler)
 * 3. Overage (aşım dakikaları)
 *
 * @param {Number} businessId
 * @param {Object} subscription - Current subscription
 * @param {Number} minutes - Minutes to deduct
 * @param {String} callId - Call ID (optional, 11Labs conversation_id)
 */
async function deductMinutesWithCredits(businessId, subscription, minutes, callId = null) {
  let remainingMinutes = minutes;
  let fromPackage = 0;
  let fromCredit = 0;
  let fromOverage = 0;

  // 1. Önce paketten düş
  const packageRemaining = subscription.minutesLimit - subscription.minutesUsed;
  if (packageRemaining > 0) {
    fromPackage = Math.min(remainingMinutes, packageRemaining);
    remainingMinutes -= fromPackage;
  }

  // 2. Sonra krediden düş
  if (remainingMinutes > 0) {
    const creditRemaining = subscription.creditMinutes - subscription.creditMinutesUsed;
    if (creditRemaining > 0) {
      fromCredit = Math.min(remainingMinutes, creditRemaining);
      remainingMinutes -= fromCredit;
    }
  }

  // 3. Kalan aşım olarak kaydet
  if (remainingMinutes > 0) {
    fromOverage = remainingMinutes;
  }

  // DB güncelle
  const updatedSubscription = await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      minutesUsed: { increment: fromPackage },
      creditMinutesUsed: { increment: fromCredit },
      overageMinutes: { increment: fromOverage }
    }
  });

  // Usage log kaydet
  await prisma.usageLog.create({
    data: {
      businessId,
      type: 'CALL',
      minutes,
      source: fromOverage > 0 ? 'OVERAGE' : (fromCredit > 0 ? 'CREDIT' : 'PACKAGE'),
      callId,
      metadata: { fromPackage, fromCredit, fromOverage }
    }
  });

  console.log(`📊 Dakika düşüldü: Paket=${fromPackage}, Kredi=${fromCredit}, Aşım=${fromOverage}`);

  // Uyarı kontrolü
  await checkUsageWarnings(businessId, updatedSubscription);

  // Aşım limit kontrolü
  if (updatedSubscription.overageMinutes >= updatedSubscription.overageLimit && !updatedSubscription.overageLimitReached) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { overageLimitReached: true }
    });
    console.log('⚠️ Aşım limiti aşıldı! Telefon devre dışı.');

    // Email gönder
    const ownerEmail = subscription.business?.users?.[0]?.email;
    if (ownerEmail) {
      try {
        await emailService.sendOverageLimitReachedEmail(
          ownerEmail,
          subscription.business.name,
          updatedSubscription.overageMinutes,
          updatedSubscription.overageLimit
        );
      } catch (emailError) {
        console.error('Failed to send overage limit email:', emailError);
      }
    }
  }

  return {
    totalDeducted: minutes,
    fromPackage,
    fromCredit,
    fromOverage,
    subscription: updatedSubscription
  };
}

/**
 * Check usage warnings (80% threshold)
 * @param {Number} businessId
 * @param {Object} subscription
 */
async function checkUsageWarnings(businessId, subscription) {
  const packageUsagePercent = subscription.minutesLimit > 0
    ? (subscription.minutesUsed / subscription.minutesLimit) * 100
    : 0;

  const creditUsagePercent = subscription.creditMinutes > 0
    ? (subscription.creditMinutesUsed / subscription.creditMinutes) * 100
    : 0;

  // Paket %80 uyarısı
  if (packageUsagePercent >= 80 && !subscription.packageWarningAt80) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { packageWarningAt80: true }
    });
    console.log('⚠️ Paket %80 uyarısı gönderilecek');

    // Get business for email
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        users: {
          where: { role: 'OWNER' },
          take: 1,
          select: { email: true }
        }
      }
    });

    if (business?.users?.[0]?.email) {
      try {
        await sendLimitWarning(businessId, 'package_minutes', {
          used: subscription.minutesUsed,
          limit: subscription.minutesLimit,
          percentage: Math.round(packageUsagePercent)
        });
      } catch (err) {
        console.error('Failed to send package warning email:', err);
      }
    }
  }

  // Kredi %80 uyarısı
  if (creditUsagePercent >= 80 && !subscription.creditWarningAt80) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { creditWarningAt80: true }
    });
    console.log('⚠️ Kredi %80 uyarısı gönderilecek');

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        users: {
          where: { role: 'OWNER' },
          take: 1,
          select: { email: true }
        }
      }
    });

    if (business?.users?.[0]?.email) {
      try {
        await sendLimitWarning(businessId, 'credit_minutes', {
          used: subscription.creditMinutesUsed,
          limit: subscription.creditMinutes,
          percentage: Math.round(creditUsagePercent)
        });
      } catch (err) {
        console.error('Failed to send credit warning email:', err);
      }
    }
  }
}

/**
 * Check if a specific limit has been reached
 * @param {Number} businessId 
 * @param {String} limitType - 'minutes', 'calls', 'assistants', 'phoneNumbers'
 */
export const checkLimit = async (businessId, limitType) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      include: {
        business: {
          select: {
            phoneNumbers: true,
            country: true
          }
        }
      }
    });

    if (!subscription) {
      return { reached: false, plan: 'FREE' };
    }

    const effectivePlan = getEffectivePlanConfig(subscription);
    let usage, limit;

    switch (limitType) {
      case 'minutes':
        usage = subscription.minutesUsed;
        limit = effectivePlan.includedMinutes;
        break;
      case 'calls':
        usage = subscription.callsThisMonth;
        limit = subscription.callsLimit;
        break;
      case 'assistants':
        usage = subscription.assistantsCreated;
        limit = effectivePlan.assistantsLimit;
        break;
      case 'phoneNumbers':
        usage = subscription.business.phoneNumbers?.length || 0;
        limit = effectivePlan.phoneNumbersLimit;
        break;
      case 'concurrent':
        usage = subscription.activeCalls || 0;
        limit = effectivePlan.concurrentLimit;
        break;
      default:
        return { reached: false };
    }

    // -1 means unlimited
    if (limit === -1 || limit === null) {
      return { reached: false, usage, limit: 'unlimited' };
    }

    // 0 means feature not available
    if (limit === 0) {
      return { reached: true, usage, limit, reason: 'not_available' };
    }

    return {
      reached: usage >= limit,
      usage,
      limit,
      percentage: Math.round((usage / limit) * 100)
    };
  } catch (error) {
    console.error('❌ Error checking limit:', error);
    throw error;
  }
};

/**
 * Reset monthly usage counters - KREDİ SİSTEMİ GÜNCELLENMİŞ
 * This should be called via cron job on the 1st of each month
 *
 * NOT: creditMinutes ve creditMinutesUsed SIFIRLANMAZ (lifetime krediler)
 */
export const resetMonthlyUsage = async () => {
  try {
    console.log('🔄 Resetting monthly usage for all subscriptions...');

    // Get all subscriptions that need processing (period ended)
    const subscriptions = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        currentPeriodEnd: { lte: new Date() }
      },
      include: {
        business: {
          select: {
            name: true,
            users: {
              select: { email: true, role: true },
              where: { role: 'OWNER' },
              take: 1
            }
          }
        }
      }
    });

    let processedCount = 0;

    for (const subscription of subscriptions) {
      try {
        // 1. Aşım faturası oluştur (eğer aşım varsa)
        if (subscription.overageMinutes > 0) {
          const overageAmount = subscription.overageMinutes * subscription.overageRate;
          console.log(`💰 Aşım faturası: Business ${subscription.businessId}, ${subscription.overageMinutes} dk, ${overageAmount} TL`);

          // TODO: iyzico ile çek
          // await iyzicoService.chargeCard({
          //   cardToken: subscription.iyzicoCardToken,
          //   amount: overageAmount,
          //   description: `${subscription.overageMinutes} dakika aşım ücreti`
          // });

          // Usage log kaydet
          await prisma.usageLog.create({
            data: {
              businessId: subscription.businessId,
              type: 'OVERAGE_CHARGE',
              minutes: subscription.overageMinutes,
              source: 'BILLING',
              metadata: {
                amount: overageAmount,
                rate: subscription.overageRate,
                period: subscription.currentPeriodEnd
              }
            }
          });
        }

        // 2. Yeni dönem tarihlerini hesapla
        const now = new Date();
        const nextMonth = new Date(now);
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        // 3. Aylık değerleri sıfırla
        // NOT: creditMinutes ve creditMinutesUsed SIFIRLANMAZ!
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            minutesUsed: 0,                    // Paket dakikaları sıfırla
            callsThisMonth: 0,                 // Çağrı sayısı sıfırla
            overageMinutes: 0,                 // Aşım dakikaları sıfırla
            packageWarningAt80: false,         // Paket uyarısını sıfırla
            creditWarningAt80: false,          // Kredi uyarısını sıfırla (yeni ay için)
            overageLimitReached: false,        // Aşım limitini sıfırla
            currentPeriodStart: now,
            currentPeriodEnd: nextMonth
          }
        });

        processedCount++;
        console.log(`✅ Business ${subscription.businessId} sıfırlandı`);

        // 4. Email gönder
        const ownerEmail = subscription.business?.users?.[0]?.email;
        if (ownerEmail) {
          try {
            await emailService.sendMonthlyResetEmail(
              ownerEmail,
              subscription.business.name,
              subscription.plan
            );
          } catch (emailError) {
            console.error(`Failed to send reset email to ${ownerEmail}:`, emailError);
          }
        }
      } catch (subError) {
        console.error(`❌ Business ${subscription.businessId} sıfırlama hatası:`, subError);
      }
    }

    console.log(`✅ Reset usage for ${processedCount} subscriptions`);
    return { count: processedCount };
  } catch (error) {
    console.error('❌ Error resetting monthly usage:', error);
    throw error;
  }
};

/**
 * Send warning email when approaching limit (90%)
 * @param {Number} businessId 
 * @param {String} limitType 
 * @param {Object} usage 
 */
export const sendLimitWarning = async (businessId, limitType, usage) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      include: {
        business: {
          select: {
            name: true,
            users: {
              select: { email: true },
              where: { role: 'OWNER' },
              take: 1
            }
          }
        }
      }
    });

    if (!subscription?.business.users[0]?.email) {
      return;
    }

    const email = subscription.business.users[0].email;
    const businessName = subscription.business.name;

    await emailService.sendLimitWarningEmail(
      email,
      businessName,
      limitType,
      usage
    );

    console.log(`⚠️ Sent ${limitType} warning email to ${email}`);
  } catch (error) {
    console.error('❌ Error sending limit warning:', error);
    // Don't throw - email failure shouldn't break usage tracking
  }
};

/**
 * Send notification when limit is reached
 * @param {Number} businessId 
 * @param {String} limitType 
 * @param {Object} usage 
 */
export const sendLimitReached = async (businessId, limitType, usage) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { businessId },
      include: {
        business: {
          select: {
            name: true,
            users: {
              select: { email: true },
              where: { role: 'OWNER' },
              take: 1
            }
          }
        }
      }
    });

    if (!subscription?.business.users[0]?.email) {
      return;
    }

    const email = subscription.business.users[0].email;
    const businessName = subscription.business.name;

    await emailService.sendLimitReachedEmail(
      email,
      businessName,
      limitType,
      usage,
      subscription.plan
    );

    console.log(`🚫 Sent ${limitType} limit reached email to ${email}`);
  } catch (error) {
    console.error('❌ Error sending limit reached notification:', error);
  }
};

/**
 * Get usage statistics for a business
 * @param {Number} businessId 
 */
export const getUsageStats = async (businessId) => {
  try {
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

    if (!subscription) {
      return null;
    }

    const plan = subscription.plan;
    const limits = {
      FREE: { minutes: 0, calls: 0, assistants: 0, phoneNumbers: 0 },
      STARTER: { minutes: 300, calls: 50, assistants: 1, phoneNumbers: 1 },
      PRO: { minutes: 1500, calls: -1, assistants: 2, phoneNumbers: 3 },
      ENTERPRISE: { minutes: -1, calls: -1, assistants: 5, phoneNumbers: 10 }
    };

    const planLimits = limits[plan];

    return {
      plan,
      status: subscription.status,
      usage: {
        minutes: {
          used: subscription.minutesUsed,
          limit: planLimits.minutes,
          percentage: planLimits.minutes > 0 
            ? Math.round((subscription.minutesUsed / planLimits.minutes) * 100)
            : 0,
          unlimited: planLimits.minutes === -1
        },
        calls: {
          used: subscription.callsThisMonth,
          limit: planLimits.calls,
          percentage: planLimits.calls > 0 
            ? Math.round((subscription.callsThisMonth / planLimits.calls) * 100)
            : 0,
          unlimited: planLimits.calls === -1
        },
        assistants: {
          used: subscription.assistantsCreated,
          limit: planLimits.assistants,
          available: planLimits.assistants > 0
        },
        phoneNumbers: {
          used: subscription.business.phoneNumbers?.length || 0,
          limit: planLimits.phoneNumbers,
          available: planLimits.phoneNumbers > 0
        }
      },
      period: {
        start: subscription.currentPeriodStart,
        end: subscription.currentPeriodEnd
      }
    };
  } catch (error) {
    console.error('❌ Error getting usage stats:', error);
    throw error;
  }
};

export default {
  trackCallUsage,
  checkLimit,
  resetMonthlyUsage,
  sendLimitWarning,
  sendLimitReached,
  getUsageStats
};
