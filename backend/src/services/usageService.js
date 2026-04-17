// ============================================================================
// USAGE SERVICE - Kullanım Takibi
// ============================================================================
// FILE: backend/src/services/usageService.js
//
// Arama/konuşma kullanım takibi:
// - recordUsage: Kullanım kaydı oluştur
// - calculateCharge: Ücret hesapla
// - applyCharge: Ücret uygula
// - resetIncludedMinutes: Dahil dakikaları sıfırla
// - getUsageStats: Kullanım istatistikleri
//
// Ücret Tipi Akışı:
// TRIAL → 15 dk ücretsiz, sonra TRIAL_EXPIRED
// PAYG → PREPAID: Direkt bakiyeden, yetersizse INSUFFICIENT_BALANCE
// STARTER/PRO/ENTERPRISE → POSTPAID: Önce dahil dakikadan, sonra aşım (ay sonu fatura)
//
// ÖNEMLİ: Paket planlarında aşım için bakiye kontrolü YAPILMAZ!
// Aşım dakikaları overageMinutes field'ında toplanır ve ay sonu faturalanır.
// ============================================================================

import prisma from '../prismaClient.js';
import {
  getPricePerMinute,
  getIncludedMinutes,
  getFixedOveragePrice,
  getPlanConfig,
  isPrepaidPlan,
  isPostpaidPlan,
  getTokenPricePerK
} from '../config/plans.js';
import balanceService from './balanceService.js';
import chargeCalculator from './chargeCalculator.js';
import { shouldSendUsageNotification } from './settingsPreferences.js';

/**
 * Kullanım kaydı oluştur ve ücretlendir
 * @param {object} params - Kullanım parametreleri
 * @param {number} params.subscriptionId - Subscription ID
 * @param {string} params.channel - PHONE, WHATSAPP, CHAT, EMAIL
 * @param {number} params.durationSeconds - Saniye cinsinden süre
 * @param {string} params.callId - 11Labs conversation ID (telefon için)
 * @param {string} params.conversationId - Diğer kanallar için
 * @param {string} params.assistantId - Assistant ID
 * @param {object} params.metadata - Ek bilgiler
 * @returns {object} { success, usageRecord, chargeResult }
 */
export async function recordUsage(params) {
  const {
    subscriptionId,
    channel,
    durationSeconds,
    callId = null,
    conversationId = null,
    assistantId = null,
    metadata = {}
  } = params;

  try {
    console.log(`📊 Recording usage: Subscription ${subscriptionId}, Channel: ${channel}, Duration: ${durationSeconds}s`);

    // Get subscription with business info
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            country: true,
            users: {
              where: { role: 'OWNER' },
              take: 1,
              select: { email: true }
            }
          }
        }
      }
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Convert seconds to minutes (PRECISE - not rounded, for fair billing)
    const durationMinutes = durationSeconds / 60;
    const country = subscription.business?.country || 'TR';

    // IDEMPOTENCY: Check if callId already exists BEFORE any calculation
    let usageRecord = await prisma.usageRecord.findUnique({
      where: { callId }
    });

    if (usageRecord) {
      console.log(`⚠️ Usage record already exists for callId ${callId} (idempotent - no double charge)`);

      // Reconstruct chargeResult from stored metadata
      const chargeResult = {
        chargeType: usageRecord.chargeType,
        pricePerMinute: usageRecord.pricePerMinute,
        totalCharge: usageRecord.totalCharge,
        breakdown: usageRecord.metadata?.chargeBreakdown || {}
      };

      return {
        success: true,
        usageRecord,
        chargeResult,
        idempotent: true // Indicate this was a duplicate request
      };
    }

    // Calculate charge with PAYG balance priority (P0-3)
    // Only run calculation for NEW requests
    const chargeResult = await chargeCalculator.calculateChargeWithBalance(
      subscription,
      durationMinutes,
      country
    );

    // Create usage record (will throw unique violation if duplicate arrives between check and create)
    try {
      usageRecord = await prisma.usageRecord.create({
        data: {
          subscriptionId,
          channel,
          callId,
          conversationId,
          durationSeconds,
          durationMinutes,
          chargeType: chargeResult.chargeType,
          pricePerMinute: chargeResult.pricePerMinute,
          totalCharge: chargeResult.totalCharge,
          assistantId,
          metadata: {
            ...metadata,
            businessId: subscription.business.id,
            plan: subscription.plan,
            chargeBreakdown: chargeResult.breakdown
          }
        }
      });
    } catch (createError) {
      // Handle race condition: unique constraint violation
      if (createError.code === 'P2002' && createError.meta?.target?.includes('callId')) {
        console.log(`⚠️ Race condition: callId ${callId} already created by another request`);

        // Fetch the existing record
        usageRecord = await prisma.usageRecord.findUnique({
          where: { callId }
        });

        // Reconstruct chargeResult from stored metadata (do NOT use fresh calculation)
        const storedChargeResult = {
          chargeType: usageRecord.chargeType,
          pricePerMinute: usageRecord.pricePerMinute,
          totalCharge: usageRecord.totalCharge,
          breakdown: usageRecord.metadata?.chargeBreakdown || {}
        };

        return {
          success: true,
          usageRecord,
          chargeResult: storedChargeResult,
          idempotent: true
        };
      }

      // Other errors: re-throw
      throw createError;
    }

    // Apply charge with balance priority (P0-3)
    await chargeCalculator.applyChargeWithBalance(
      subscription.id,
      chargeResult,
      usageRecord.id
    );

    // The active billing path must also trigger warning emails and overage lock state.
    await checkUsageWarnings(subscription.id);

    console.log(`✅ Usage recorded: ${durationMinutes} dk, ChargeType: ${chargeResult.chargeType}, Total: ${chargeResult.totalCharge} TL`);

    return {
      success: true,
      usageRecord,
      chargeResult
    };
  } catch (error) {
    console.error('❌ Record usage error:', error);
    throw error;
  }
}

/**
 * Ücret hesapla
 * @param {object} subscription - Subscription object
 * @param {number} durationMinutes - Dakika cinsinden süre
 * @returns {object} { chargeType, pricePerMinute, totalCharge, breakdown }
 */
export async function calculateCharge(subscription, durationMinutes) {
  const country = subscription.business?.country || 'TR';
  const plan = subscription.plan;

  // TRIAL plan
  if (plan === 'TRIAL') {
    const trialLimit = 15; // 15 dk
    const used = subscription.trialMinutesUsed || 0;
    const remaining = trialLimit - used;

    if (remaining <= 0) {
      throw new Error('TRIAL_EXPIRED');
    }

    if (durationMinutes > remaining) {
      throw new Error('TRIAL_LIMIT_EXCEEDED');
    }

    return {
      chargeType: 'TRIAL',
      pricePerMinute: 0,
      totalCharge: 0,
      breakdown: {
        fromTrial: durationMinutes,
        trialRemaining: remaining - durationMinutes
      }
    };
  }

  // PAYG plan - direkt bakiyeden
  if (plan === 'PAYG') {
    const pricePerMinute = getPricePerMinute(plan, country);
    const totalCharge = durationMinutes * pricePerMinute;

    // Check if enough balance
    if (subscription.balance < totalCharge) {
      throw new Error('INSUFFICIENT_BALANCE');
    }

    return {
      chargeType: 'BALANCE',
      pricePerMinute,
      totalCharge,
      breakdown: {
        fromBalance: durationMinutes,
        balanceCharge: totalCharge
      }
    };
  }

  // STARTER, PRO, ENTERPRISE - dahil dakika + POSTPAID aşım
  const includedMinutes = getIncludedMinutes(plan, country);
  const usedIncluded = subscription.includedMinutesUsed || 0;
  const remainingIncluded = Math.max(0, includedMinutes - usedIncluded);
  const overageRate = getFixedOveragePrice(country); // Sabit 23 TL aşım fiyatı

  let fromIncluded = 0;
  let overageMinutes = 0;
  let chargeType = 'INCLUDED';

  // First use included minutes
  if (remainingIncluded > 0) {
    fromIncluded = Math.min(durationMinutes, remainingIncluded);
  }

  // Remaining minutes go to POSTPAID overage (ay sonu faturalanır)
  overageMinutes = durationMinutes - fromIncluded;
  if (overageMinutes > 0) {
    chargeType = fromIncluded > 0 ? 'INCLUDED_AND_OVERAGE' : 'OVERAGE';
    // NOT: Bakiye kontrolü YAPILMAZ! Postpaid model.
  }

  return {
    chargeType,
    pricePerMinute: 0, // Postpaid - anında ücret yok
    totalCharge: 0,    // Postpaid - anında ücret yok
    breakdown: {
      fromIncluded,
      overageMinutes,         // Ay sonu faturalanacak aşım dakikaları
      overageRate,            // Sabit aşım fiyatı (23 TL)
      includedRemaining: remainingIncluded - fromIncluded,
      paymentModel: 'POSTPAID'
    }
  };
}

/**
 * Ücret uygula
 * @param {object} subscription - Subscription object
 * @param {object} chargeResult - calculateCharge sonucu
 * @param {string} usageRecordId - Usage record ID
 */
export async function applyCharge(subscription, chargeResult, usageRecordId) {
  const { chargeType, totalCharge, breakdown } = chargeResult;

  try {
    // Update trial minutes used
    if (chargeType === 'TRIAL') {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          trialMinutesUsed: {
            increment: breakdown.fromTrial
          }
        }
      });
      return;
    }

    // PAYG - PREPAID: Deduct from balance immediately
    if (chargeType === 'BALANCE' && totalCharge > 0) {
      const description = `PAYG kullanım: ${breakdown.fromBalance} dk`;
      await balanceService.deduct(subscription.id, totalCharge, usageRecordId, description);
      await checkUsageWarnings(subscription.id);
      return;
    }

    // STARTER/PRO/ENTERPRISE - POSTPAID model
    const updateData = {};

    // Update included minutes used
    if (breakdown.fromIncluded > 0) {
      updateData.includedMinutesUsed = {
        increment: breakdown.fromIncluded
      };
    }

    // Track overage minutes for POSTPAID billing (ay sonu fatura)
    if (breakdown.overageMinutes > 0) {
      updateData.overageMinutes = {
        increment: breakdown.overageMinutes
      };
      console.log(`📊 Postpaid aşım kaydedildi: ${breakdown.overageMinutes} dk (ay sonu faturalanacak)`);
    }

    // Apply updates
    if (Object.keys(updateData).length > 0) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: updateData
      });
    }

    // Check and send warnings
    await checkUsageWarnings(subscription.id);

  } catch (error) {
    console.error('❌ Apply charge error:', error);
    throw error;
  }
}

/**
 * Kullanım uyarılarını kontrol et
 * @param {number} subscriptionId - Subscription ID
 */
async function checkUsageWarnings(subscriptionId) {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        business: {
          select: {
            name: true,
            country: true,
            users: {
              where: { role: 'OWNER' },
              take: 1,
              select: { email: true }
            }
          }
        }
      }
    });

    if (!subscription) return;

    const country = subscription.business?.country || 'TR';
    const includedMinutes = getIncludedMinutes(subscription.plan, country);

    // Check 80% included minutes warning
    if (includedMinutes > 0) {
      const usedPercent = (subscription.includedMinutesUsed / includedMinutes) * 100;

      if (usedPercent >= 80 && !subscription.packageWarningAt80) {
        await prisma.subscription.update({
          where: { id: subscriptionId },
          data: { packageWarningAt80: true }
        });

        const ownerEmail = subscription.business?.users?.[0]?.email;
        if (ownerEmail && await shouldSendUsageNotification(subscription.business.id)) {
          try {
            const emailService = (await import('./emailService.js')).default;
            await emailService.sendLimitWarningEmail(
              ownerEmail,
              subscription.business.name,
              'package_minutes',
              {
                used: subscription.includedMinutesUsed,
                limit: includedMinutes,
                percentage: Math.round(usedPercent)
              }
            );
          } catch (emailError) {
            console.error('Failed to send warning email:', emailError);
          }
        }
      }
    }

    // Check low balance warning for PAYG
    if (subscription.plan === 'PAYG') {
      const pricePerMinute = getPricePerMinute('PAYG', country);
      const balanceMinutes = pricePerMinute > 0 ? subscription.balance / pricePerMinute : 0;

      // Warn if less than 2 minutes remaining
      if (balanceMinutes < 2) {
        const now = new Date();
        const lastWarning = subscription.lowBalanceWarningAt;
        const oneDay = 24 * 60 * 60 * 1000;

        // Only warn once per day
        if (!lastWarning || (now - new Date(lastWarning)) > oneDay) {
          await prisma.subscription.update({
            where: { id: subscriptionId },
            data: { lowBalanceWarningAt: now }
          });

          const ownerEmail = subscription.business?.users?.[0]?.email;
          if (ownerEmail && await shouldSendUsageNotification(subscription.business.id)) {
            try {
              const emailService = (await import('./emailService.js')).default;
              await emailService.sendLowBalanceWarningEmail(
                ownerEmail,
                {
                  businessName: subscription.business.name,
                  balance: subscription.balance,
                  remainingMinutes: balanceMinutes
                }
              );
            } catch (emailError) {
              console.error('Failed to send low balance email:', emailError);
            }
          }
        }
      }
    }

    // Check postpaid overage limit lock
    const currentOverageMinutes = Number(subscription.overageMinutes || 0);
    const currentOverageLimit = Number(subscription.overageLimit || 0);
    if (currentOverageLimit > 0 && currentOverageMinutes > 0 && currentOverageMinutes >= currentOverageLimit && !subscription.overageLimitReached) {
      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: { overageLimitReached: true }
      });

      const ownerEmail = subscription.business?.users?.[0]?.email;
      if (ownerEmail && await shouldSendUsageNotification(subscription.business.id)) {
        try {
          const emailService = (await import('./emailService.js')).default;
          await emailService.sendOverageLimitReachedEmail(
            ownerEmail,
            subscription.business.name,
            currentOverageMinutes,
            currentOverageLimit
          );
        } catch (emailError) {
          console.error('Failed to send overage limit email:', emailError);
        }
      }
    }
  } catch (error) {
    console.error('❌ Check usage warnings error:', error);
    // Don't throw - warnings are not critical
  }
}

/**
 * Dahil dakikaları sıfırla (cron job için)
 * @returns {object} { count }
 */
export async function resetIncludedMinutes() {
  try {
    console.log('🔄 Resetting included minutes...');

    const now = new Date();

    // Find subscriptions that need reset
    const subscriptions = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        plan: {
          in: ['STARTER', 'PRO', 'BASIC']
        },
        includedMinutesResetAt: {
          lte: now
        }
      }
    });

    let count = 0;

    for (const subscription of subscriptions) {
      try {
        // Calculate next reset date (30 days)
        const nextReset = new Date(now);
        nextReset.setDate(nextReset.getDate() + 30);

        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            includedMinutesUsed: 0,
            includedMinutesResetAt: nextReset,
            packageWarningAt80: false
          }
        });

        count++;
        console.log(`✅ Reset included minutes for subscription ${subscription.id}`);
      } catch (resetError) {
        console.error(`❌ Failed to reset subscription ${subscription.id}:`, resetError);
      }
    }

    console.log(`✅ Reset included minutes for ${count} subscriptions`);
    return { count };
  } catch (error) {
    console.error('❌ Reset included minutes error:', error);
    throw error;
  }
}

/**
 * Kullanım istatistikleri
 * @param {number} subscriptionId - Subscription ID
 * @param {Date} startDate - Başlangıç tarihi
 * @param {Date} endDate - Bitiş tarihi
 * @returns {object} Usage statistics
 */
export async function getUsageStats(subscriptionId, startDate = null, endDate = null) {
  try {
    const where = { subscriptionId };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    // Get all usage records
    const records = await prisma.usageRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    // Calculate totals
    let totalMinutes = 0;
    let totalCharge = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const byChannel = {};
    const byChargeType = {};

    for (const record of records) {
      totalMinutes += record.durationMinutes;
      totalCharge += record.totalCharge || 0;

      // Extract token info from metadata for CHAT/WHATSAPP
      if (record.metadata && (record.channel === 'CHAT' || record.channel === 'WHATSAPP')) {
        const metadata = record.metadata;
        totalInputTokens += metadata.inputTokens || 0;
        totalOutputTokens += metadata.outputTokens || 0;
      }

      // By channel
      if (!byChannel[record.channel]) {
        byChannel[record.channel] = { minutes: 0, charge: 0, count: 0, inputTokens: 0, outputTokens: 0 };
      }
      byChannel[record.channel].minutes += record.durationMinutes;
      byChannel[record.channel].charge += record.totalCharge || 0;
      byChannel[record.channel].count++;

      // Add token info for CHAT/WHATSAPP channels
      if (record.metadata && (record.channel === 'CHAT' || record.channel === 'WHATSAPP')) {
        byChannel[record.channel].inputTokens += record.metadata.inputTokens || 0;
        byChannel[record.channel].outputTokens += record.metadata.outputTokens || 0;
      }

      // By charge type
      if (!byChargeType[record.chargeType]) {
        byChargeType[record.chargeType] = { minutes: 0, charge: 0, count: 0 };
      }
      byChargeType[record.chargeType].minutes += record.durationMinutes;
      byChargeType[record.chargeType].charge += record.totalCharge || 0;
      byChargeType[record.chargeType].count++;
    }

    // Get subscription for current status
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        business: {
          select: { country: true, id: true }
        }
      }
    });

    const country = subscription?.business?.country || 'TR';
    const includedMinutes = getIncludedMinutes(subscription?.plan, country);
    const tokenPricing = getTokenPricePerK(subscription?.plan, country);

    // Get chat/whatsapp usage from ChatLog for this period
    const chatLogWhere = {
      businessId: subscription?.business?.id
    };
    if (startDate || endDate) {
      chatLogWhere.createdAt = {};
      if (startDate) chatLogWhere.createdAt.gte = startDate;
      if (endDate) chatLogWhere.createdAt.lte = endDate;
    }

    const chatLogs = await prisma.chatLog.findMany({
      where: chatLogWhere,
      select: {
        channel: true,
        inputTokens: true,
        outputTokens: true,
        totalCost: true,
        messageCount: true
      }
    });

    // Calculate chat/whatsapp totals from ChatLog
    let chatTotalInputTokens = 0;
    let chatTotalOutputTokens = 0;
    let chatTotalCost = 0;
    let whatsappTotalInputTokens = 0;
    let whatsappTotalOutputTokens = 0;
    let whatsappTotalCost = 0;
    let chatSessionCount = 0;
    let whatsappSessionCount = 0;

    for (const log of chatLogs) {
      if (log.channel === 'CHAT') {
        chatTotalInputTokens += log.inputTokens || 0;
        chatTotalOutputTokens += log.outputTokens || 0;
        chatTotalCost += log.totalCost || 0;
        chatSessionCount++;
      } else if (log.channel === 'WHATSAPP') {
        whatsappTotalInputTokens += log.inputTokens || 0;
        whatsappTotalOutputTokens += log.outputTokens || 0;
        whatsappTotalCost += log.totalCost || 0;
        whatsappSessionCount++;
      }
    }

    return {
      totalMinutes,
      totalCharge,
      recordCount: records.length,
      byChannel,
      byChargeType,
      // Token usage summary
      tokenUsage: {
        totalInputTokens: chatTotalInputTokens + whatsappTotalInputTokens,
        totalOutputTokens: chatTotalOutputTokens + whatsappTotalOutputTokens,
        totalCost: chatTotalCost + whatsappTotalCost,
        chat: {
          inputTokens: chatTotalInputTokens,
          outputTokens: chatTotalOutputTokens,
          cost: chatTotalCost,
          sessionCount: chatSessionCount
        },
        whatsapp: {
          inputTokens: whatsappTotalInputTokens,
          outputTokens: whatsappTotalOutputTokens,
          cost: whatsappTotalCost,
          sessionCount: whatsappSessionCount
        },
        pricing: tokenPricing
      },
      currentPeriod: {
        plan: subscription?.plan,
        includedMinutes,
        includedMinutesUsed: subscription?.includedMinutesUsed || 0,
        includedMinutesRemaining: Math.max(0, includedMinutes - (subscription?.includedMinutesUsed || 0)),
        balance: subscription?.balance || 0,
        trialMinutesUsed: subscription?.trialMinutesUsed || 0
      }
    };
  } catch (error) {
    console.error('❌ Get usage stats error:', error);
    throw error;
  }
}

/**
 * Kullanım kayıtlarını listele
 * @param {number} subscriptionId - Subscription ID
 * @param {object} options - Sayfalama ve filtreleme
 * @returns {object} { records, total, stats }
 */
export async function getUsageRecords(subscriptionId, options = {}) {
  try {
    const {
      limit = 20,
      offset = 0,
      channel = null,
      chargeType = null,
      startDate = null,
      endDate = null
    } = options;

    const where = { subscriptionId };

    if (channel) where.channel = channel;
    if (chargeType) where.chargeType = chargeType;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [records, total] = await Promise.all([
      prisma.usageRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.usageRecord.count({ where })
    ]);

    return { records, total };
  } catch (error) {
    console.error('❌ Get usage records error:', error);
    throw error;
  }
}

/**
 * Arama yapılabilir mi kontrol et
 * @param {number} subscriptionId - Subscription ID
 * @returns {object} { canMakeCall, reason, details }
 */
export async function canMakeCall(subscriptionId) {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        business: {
          select: { country: true }
        }
      }
    });

    if (!subscription) {
      return { canMakeCall: false, reason: 'SUBSCRIPTION_NOT_FOUND' };
    }

    const country = subscription.business?.country || 'TR';
    const plan = subscription.plan;

    // Check subscription status
    if (subscription.status !== 'ACTIVE' && subscription.status !== 'TRIAL') {
      return { canMakeCall: false, reason: 'SUBSCRIPTION_INACTIVE', status: subscription.status };
    }

    // TRIAL plan
    if (plan === 'TRIAL') {
      const trialLimit = 15;
      const remaining = trialLimit - (subscription.trialMinutesUsed || 0);

      if (remaining <= 0) {
        return { canMakeCall: false, reason: 'TRIAL_EXPIRED', trialMinutesUsed: subscription.trialMinutesUsed };
      }

      return {
        canMakeCall: true,
        reason: 'TRIAL_ACTIVE',
        details: {
          trialMinutesRemaining: remaining,
          trialMinutesUsed: subscription.trialMinutesUsed
        }
      };
    }

    // PAYG plan
    if (plan === 'PAYG') {
      const pricePerMinute = getPricePerMinute('PAYG', country);

      if (subscription.balance < pricePerMinute) {
        return { canMakeCall: false, reason: 'INSUFFICIENT_BALANCE', balance: subscription.balance };
      }

      const balanceMinutes = Math.floor(subscription.balance / pricePerMinute);
      return {
        canMakeCall: true,
        reason: 'BALANCE_AVAILABLE',
        details: {
          balance: subscription.balance,
          balanceMinutes
        }
      };
    }

    // STARTER, PRO, ENTERPRISE - POSTPAID model (bakiye kontrolü YAPILMAZ)
    const includedMinutes = getIncludedMinutes(plan, country);
    const remainingIncluded = includedMinutes - (subscription.includedMinutesUsed || 0);
    const overageRate = getFixedOveragePrice(country);
    const currentOverage = subscription.overageMinutes || 0;

    // Check if has included minutes
    if (remainingIncluded > 0) {
      return {
        canMakeCall: true,
        reason: 'INCLUDED_MINUTES_AVAILABLE',
        details: {
          includedMinutesRemaining: remainingIncluded,
          includedMinutesUsed: subscription.includedMinutesUsed,
          paymentModel: 'POSTPAID'
        }
      };
    }

    // POSTPAID: Dahil dakika bitmiş olsa bile arama yapılabilir
    // Aşım dakikaları ay sonunda faturalanır
    return {
      canMakeCall: true,
      reason: 'OVERAGE_POSTPAID',
      details: {
        overageMinutes: currentOverage,
        overageRate,
        paymentModel: 'POSTPAID',
        message: 'Aşım kullanımı ay sonu faturalanacaktır'
      }
    };

  } catch (error) {
    console.error('❌ Can make call check error:', error);
    throw error;
  }
}

export default {
  recordUsage,
  calculateCharge,
  applyCharge,
  resetIncludedMinutes,
  getUsageStats,
  getUsageRecords,
  canMakeCall
};
