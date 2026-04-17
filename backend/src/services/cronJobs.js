/**
 * Cron Jobs Service - YENİ FİYATLANDIRMA SİSTEMİ
 *
 * Scheduled tasks:
 * 1. resetIncludedMinutes: Her ay başında STARTER/PRO planlarının dahil dakikalarını sıfırla
 * 2. lowBalanceWarning: Düşük bakiye uyarısı gönder (SADECE PAYG için)
 * 3. autoReloadCheck: Otomatik yükleme kontrolü (SADECE PAYG için)
 * 4. trialExpiredCheck: Deneme süresi dolmuş kullanıcıları kontrol et
 * 5. billOverageUsage: POSTPAID aşım faturalandırması (ay sonu - paket planları için)
 */

import prisma from '../prismaClient.js';
import { calculateTLToMinutes, getFixedOveragePrice } from '../config/plans.js';
import { shouldSendUsageNotification } from './settingsPreferences.js';

// Email service import (if available)
let emailService = null;
try {
  const module = await import('./emailService.js');
  emailService = module.default;
} catch (e) {
  console.log('📧 Email service not available for cron jobs');
}

/**
 * RECONCILE missed resets and sync periods from payment provider
 *
 * IMPORTANT: This function does NOT create or calculate period dates.
 * Period dates are ONLY set by Stripe webhooks.
 *
 * This function:
 * 1. Finds subscriptions whose period has ended (according to provider)
 * 2. Fetches REAL period dates from Stripe API
 * 3. Resets usage counters
 * 4. Updates DB with provider's period dates
 *
 * Run daily as a safety net for missed webhooks.
 */
export async function resetIncludedMinutes() {
  console.log('🔄 Starting included minutes reconciliation...');

  try {
    const now = new Date();

    // Find subscriptions that may need reconciliation
    // These have period_end in the past but still have usage
    const subscriptionsToCheck = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        plan: { in: ['STARTER', 'PRO', 'ENTERPRISE', 'BASIC'] },
        stripeSubscriptionId: { not: null },
        currentPeriodEnd: { lte: now }
      },
      include: {
        business: {
          select: { id: true, name: true }
        }
      }
    });

    console.log(`📊 Found ${subscriptionsToCheck.length} subscriptions to reconcile`);

    let reconciledCount = 0;
    let errorCount = 0;

    // Import Stripe dynamically
    let stripe = null;
    try {
      const stripeModule = await import('./stripe.js');
      stripe = stripeModule.default.getStripeClient();
    } catch (e) {
      console.error('⚠️ Stripe not available, skipping reconciliation');
      return { success: false, error: 'Stripe not configured' };
    }

    for (const subscription of subscriptionsToCheck) {
      try {
        // Fetch REAL period dates from Stripe
        const stripeSubscription = await stripe.subscriptions.retrieve(
          subscription.stripeSubscriptionId
        );

        // Get provider's current period dates (source of truth)
        const providerPeriodStart = new Date(stripeSubscription.current_period_start * 1000);
        const providerPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);

        console.log(`🔄 Reconciling ${subscription.business?.name}:`);
        console.log(`   DB period: ${subscription.currentPeriodStart?.toISOString()} → ${subscription.currentPeriodEnd?.toISOString()}`);
        console.log(`   Stripe period: ${providerPeriodStart.toISOString()} → ${providerPeriodEnd.toISOString()}`);

        // Update DB with provider's dates + reset usage
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            includedMinutesUsed: 0,
            packageWarningAt80: false,
            creditWarningAt80: false,
            voiceAddOnMinutesBalance: 0,
            writtenInteractionAddOnBalance: 0,
            // CRITICAL: Use provider's dates, never calculate ourselves
            currentPeriodStart: providerPeriodStart,
            currentPeriodEnd: providerPeriodEnd,
            updatedAt: now
          }
        });

        reconciledCount++;
        console.log(`✅ Reconciled ${subscription.business?.name}`);
      } catch (err) {
        errorCount++;
        console.error(`❌ Failed to reconcile subscription ${subscription.id}:`, err.message);
      }
    }

    console.log(`🔄 Reconciliation complete: ${reconciledCount} success, ${errorCount} errors`);
    return {
      success: true,
      reconciledCount,
      errorCount,
      total: subscriptionsToCheck.length
    };
  } catch (error) {
    console.error('❌ Reconciliation error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check for low balance and send warnings
 * Run every hour
 * NOT: Sadece PAYG planı için geçerli (prepaid model)
 * Paket planları postpaid aşım kullandığından bakiye kontrolü YAPILMAZ
 */
export async function checkLowBalance() {
  console.log('💰 Checking for low balance warnings (PAYG only)...');

  try {
    // SADECE PAYG kullanıcıları için düşük bakiye kontrolü (prepaid model)
    const lowBalanceSubscriptions = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        plan: 'PAYG', // Sadece PAYG
        balance: { lt: 100 }, // Less than 100 TL
        // Don't warn if already warned in last 24 hours
        OR: [
          { lowBalanceWarnedAt: null },
          { lowBalanceWarnedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
        ]
      },
      include: {
        business: {
          include: {
            users: {
              where: { role: 'OWNER' },
              select: { email: true, name: true }
            }
          }
        }
      }
    });

    console.log(`📊 Found ${lowBalanceSubscriptions.length} subscriptions with low balance`);

    let warnedCount = 0;
    for (const subscription of lowBalanceSubscriptions) {
      const ownerEmail = subscription.business?.users?.[0]?.email;

      if (ownerEmail && emailService && await shouldSendUsageNotification(subscription.business.id)) {
        try {
          // Send low balance email
          await emailService.sendLowBalanceWarning({
            email: ownerEmail,
            businessName: subscription.business.name,
            balance: subscription.balance
          });

          // Update warned timestamp
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: { lowBalanceWarnedAt: new Date() }
          });

          warnedCount++;
          console.log(`📧 Low balance warning sent to: ${ownerEmail}`);
        } catch (err) {
          console.error(`❌ Failed to send warning to ${ownerEmail}:`, err.message);
        }
      }
    }

    console.log(`💰 Low balance check complete: ${warnedCount} warnings sent`);
    return { success: true, warnedCount, total: lowBalanceSubscriptions.length };
  } catch (error) {
    console.error('❌ Low balance check error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Process auto-reload for subscriptions that need it
 * Run every 15 minutes
 */
export async function processAutoReload() {
  console.log('🔄 Processing auto-reload...');

  try {
    // Find subscriptions with auto-reload enabled and balance below threshold
    const autoReloadSubscriptions = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        plan: 'PAYG',
        autoReloadEnabled: true,
        autoReloadThreshold: { gt: 0 },
        autoReloadAmount: { gt: 0 }
      },
      include: {
        business: {
          select: { id: true, name: true, country: true }
        }
      }
    });

    // Filter those below threshold
    const needReload = autoReloadSubscriptions.filter(
      (sub) => calculateTLToMinutes(
        Number(sub.balance || 0),
        sub.plan,
        sub.business?.country || 'TR'
      ) < Number(sub.autoReloadThreshold || 0)
    );

    console.log(`📊 Found ${needReload.length} subscriptions needing auto-reload`);

    let reloadedCount = 0;
    for (const subscription of needReload) {
      try {
        if (!subscription.stripeCustomerId) {
          console.log(`⚠️ No payment method for ${subscription.business?.name}, skipping`);
          continue;
        }

        // Import balance service dynamically
        const balanceService = (await import('./balanceService.js')).default;

        // Process reload
        const result = await balanceService.processAutoReload(subscription.id);

        if (result.success) {
          reloadedCount++;
          console.log(`✅ Auto-reloaded ${result.amount ?? subscription.autoReloadAmount} for ${subscription.business?.name}`);
        } else {
          const reason = result.error || result.reason || 'unknown';
          console.log(`⚠️ Auto-reload failed for ${subscription.business?.name}: ${reason}`);
        }
      } catch (err) {
        console.error(`❌ Auto-reload error for ${subscription.id}:`, err.message);
      }
    }

    console.log(`🔄 Auto-reload complete: ${reloadedCount}/${needReload.length} processed`);
    return { success: true, reloadedCount, total: needReload.length };
  } catch (error) {
    console.error('❌ Auto-reload error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check for expired trials and send upgrade prompts
 * Run daily
 */
export async function checkTrialExpired() {
  console.log('⏰ Checking for expired trials...');

  try {
    const now = new Date();

    // Find TRIAL subscriptions where trial has expired
    const expiredTrials = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        plan: 'TRIAL',
        OR: [
          // Phone trial expired (15 minutes used)
          { trialMinutesUsed: { gte: 15 } },
          // Chat trial expired (7 days)
          { trialChatExpiry: { lte: now } }
        ]
      },
      include: {
        business: {
          include: {
            users: {
              where: { role: 'OWNER' },
              select: { email: true, name: true }
            }
          }
        }
      }
    });

    console.log(`📊 Found ${expiredTrials.length} expired trials`);

    let notifiedCount = 0;
    for (const subscription of expiredTrials) {
      const ownerEmail = subscription.business?.users?.[0]?.email;

      // Mark trial as expired if not already
      if (subscription.status === 'ACTIVE') {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            trialUsed: true,
            status: 'TRIAL_EXPIRED',
            updatedAt: now
          }
        });
      }

      // Send email notification
      if (ownerEmail && emailService) {
        try {
          await emailService.sendTrialExpiredNotification({
            email: ownerEmail,
            businessName: subscription.business.name,
          });

          notifiedCount++;
          console.log(`📧 Trial expired notification sent to: ${ownerEmail}`);
        } catch (err) {
          console.error(`❌ Failed to send notification to ${ownerEmail}:`, err.message);
        }
      }
    }

    console.log(`⏰ Trial check complete: ${notifiedCount} notifications sent`);
    return { success: true, notifiedCount, total: expiredTrials.length };
  } catch (error) {
    console.error('❌ Trial check error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Clean up old usage records (older than 1 year)
 * Run weekly
 */
export async function cleanupOldRecords() {
  console.log('🧹 Cleaning up old usage records...');

  try {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

    // Delete old usage records
    const deletedUsage = await prisma.usageRecord.deleteMany({
      where: {
        createdAt: { lt: oneYearAgo }
      }
    });

    // Delete old balance transactions
    const deletedTransactions = await prisma.balanceTransaction.deleteMany({
      where: {
        createdAt: { lt: oneYearAgo }
      }
    });

    console.log(`🧹 Cleanup complete: ${deletedUsage.count} usage records, ${deletedTransactions.count} transactions deleted`);
    return {
      success: true,
      deletedUsage: deletedUsage.count,
      deletedTransactions: deletedTransactions.count
    };
  } catch (error) {
    console.error('❌ Cleanup error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Bill overage usage for POSTPAID plans
 * Run at the end of each billing period (triggered by Stripe webhook or cron)
 * Paket planları için aşım faturalandırması
 */
export async function billOverageUsage() {
  console.log('💳 Processing postpaid overage billing...');

  try {
    const now = new Date();

    // Find subscriptions with overage that need billing
    // These are STARTER/PRO/ENTERPRISE plans whose billing period has ended
    const subscriptionsWithOverage = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        plan: { in: ['STARTER', 'PRO', 'ENTERPRISE', 'BASIC'] },
        overageMinutes: { gt: 0 },
        currentPeriodEnd: { lte: now },
        // Don't bill if already billed for this period
        OR: [
          { overageBilledAt: null },
          { overageBilledAt: { lt: prisma.subscription.fields.currentPeriodStart } }
        ]
      },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            country: true,
            users: {
              where: { role: 'OWNER' },
              select: { email: true, name: true }
            }
          }
        }
      }
    });

    console.log(`📊 Found ${subscriptionsWithOverage.length} subscriptions with overage to bill`);

    let billedCount = 0;
    let totalAmount = 0;

    for (const subscription of subscriptionsWithOverage) {
      try {
        const country = subscription.business?.country || 'TR';
        const overageRate = getFixedOveragePrice(country);
        const overageAmount = subscription.overageMinutes * overageRate;

        console.log(`📊 Billing ${subscription.business?.name}: ${subscription.overageMinutes} dk × ${overageRate} = ${overageAmount} TL`);

        // Check if has payment method (Stripe customer) and create invoice
        let stripeInvoiceResult = null;
        if (subscription.stripeCustomerId) {
          try {
            const stripeService = (await import('./stripe.js')).default;
            const currency = country === 'TR' ? 'TRY' : country === 'BR' ? 'BRL' : 'USD';

            stripeInvoiceResult = await stripeService.createOverageInvoice({
              customerId: subscription.stripeCustomerId,
              overageMinutes: subscription.overageMinutes,
              overageRate,
              totalAmount: overageAmount,
              currency,
              countryCode: country,
              businessName: subscription.business.name,
              periodStart: subscription.currentPeriodStart,
              periodEnd: subscription.currentPeriodEnd
            });

            console.log(`💳 Stripe invoice created: ${stripeInvoiceResult.invoiceId} for ${subscription.business?.name}`);
          } catch (stripeErr) {
            console.error(`❌ Stripe invoice creation failed for ${subscription.business?.name}:`, stripeErr.message);
            // Continue with database recording even if Stripe fails
          }
        } else {
          console.log(`⚠️ No Stripe customer for ${subscription.business?.name}, skipping invoice creation`);
        }

        // Record the billing in database
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            overageBilledAt: now,
            overageMinutes: 0, // Reset for next period
            updatedAt: now
          }
        });

        // Create a balance transaction record for tracking
        await prisma.balanceTransaction.create({
          data: {
            subscriptionId: subscription.id,
            type: 'OVERAGE_BILL',
            amount: -overageAmount, // Negative = charge
            description: `Aşım faturası: ${subscription.overageMinutes} dk (${overageAmount} TL)`,
            metadata: {
              overageMinutes: subscription.overageMinutes,
              overageRate,
              periodStart: subscription.currentPeriodStart,
              periodEnd: subscription.currentPeriodEnd,
              stripeInvoiceId: stripeInvoiceResult?.invoiceId || null,
              stripeInvoiceStatus: stripeInvoiceResult?.status || null
            }
          }
        });

        // Send email notification
        const ownerEmail = subscription.business?.users?.[0]?.email;
        if (ownerEmail && emailService && await shouldSendUsageNotification(subscription.business.id)) {
          try {
            await emailService.sendOverageBillNotification({
              email: ownerEmail,
              businessName: subscription.business.name,
              overageMinutes: subscription.overageMinutes,
              totalAmount: overageAmount
            });
            console.log(`📧 Overage bill notification sent to: ${ownerEmail}`);
          } catch (emailErr) {
            console.error(`❌ Failed to send overage email to ${ownerEmail}:`, emailErr.message);
          }
        }

        billedCount++;
        totalAmount += overageAmount;
        console.log(`✅ Overage billed for ${subscription.business?.name}: ${overageAmount} TL`);

      } catch (err) {
        console.error(`❌ Failed to bill overage for subscription ${subscription.id}:`, err.message);
      }
    }

    console.log(`💳 Overage billing complete: ${billedCount}/${subscriptionsWithOverage.length} billed, total: ${totalAmount} TL`);
    return {
      success: true,
      billedCount,
      total: subscriptionsWithOverage.length,
      totalAmount
    };
  } catch (error) {
    console.error('❌ Overage billing error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Clean up old WhatsApp/Chat conversation logs
 * - Delete conversations older than 30 days
 * - Trim messages to max 50 per conversation
 * Run daily
 */
export async function cleanupChatLogs() {
  console.log('🧹 Cleaning up old chat/WhatsApp logs...');

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const MAX_MESSAGES_PER_CONVERSATION = 50;

    // 1. Delete old conversations (no activity for 30 days)
    const deletedOld = await prisma.chatLog.deleteMany({
      where: {
        updatedAt: { lt: thirtyDaysAgo }
      }
    });

    console.log(`🗑️ Deleted ${deletedOld.count} old chat logs (>30 days)`);

    // 2. Trim messages in active conversations to max 50
    const largeConversations = await prisma.chatLog.findMany({
      where: {
        messageCount: { gt: MAX_MESSAGES_PER_CONVERSATION }
      },
      select: {
        id: true,
        sessionId: true,
        messages: true,
        messageCount: true
      }
    });

    let trimmedCount = 0;
    for (const log of largeConversations) {
      if (Array.isArray(log.messages) && log.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
        const trimmedMessages = log.messages.slice(-MAX_MESSAGES_PER_CONVERSATION);

        await prisma.chatLog.update({
          where: { id: log.id },
          data: {
            messages: trimmedMessages,
            messageCount: trimmedMessages.length
          }
        });

        trimmedCount++;
        console.log(`✂️ Trimmed ${log.sessionId}: ${log.messages.length} -> ${trimmedMessages.length} messages`);
      }
    }

    console.log(`🧹 Chat log cleanup complete: ${deletedOld.count} deleted, ${trimmedCount} trimmed`);
    return {
      success: true,
      deletedCount: deletedOld.count,
      trimmedCount
    };
  } catch (error) {
    console.error('❌ Chat log cleanup error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Auto-scan URLs that have autoScan enabled
 * Checks if lastCrawled + scanInterval hours has passed
 * Run every hour
 */
export async function autoScanUrls() {
  console.log('🔄 Starting automatic URL scanning...');

  try {
    const now = new Date();

    // Find all URLs with autoScan enabled that need rescanning
    const urlsToScan = await prisma.knowledgeBase.findMany({
      where: {
        type: 'URL',
        autoScan: true,
        status: { not: 'PROCESSING' }, // Don't scan if already processing
        url: { not: null }
      },
      select: {
        id: true,
        url: true,
        lastCrawled: true,
        scanInterval: true,
        businessId: true
      }
    });

    console.log(`📊 Found ${urlsToScan.length} URLs with auto-scan enabled`);

    let scannedCount = 0;
    let skippedCount = 0;

    for (const urlEntry of urlsToScan) {
      // Check if scan interval has passed
      const scanIntervalHours = urlEntry.scanInterval || 24;
      const lastCrawled = urlEntry.lastCrawled ? new Date(urlEntry.lastCrawled) : null;

      // If never crawled or interval has passed, scan it
      const shouldScan = !lastCrawled ||
        (now.getTime() - lastCrawled.getTime()) > (scanIntervalHours * 60 * 60 * 1000);

      if (!shouldScan) {
        skippedCount++;
        continue;
      }

      console.log(`🔍 Auto-scanning URL: ${urlEntry.url} (last: ${lastCrawled?.toISOString() || 'never'})`);

      try {
        // Import crawlURL dynamically to avoid circular dependency
        const { crawlURL } = await import('../routes/knowledge.js');

        // Set status to PROCESSING
        await prisma.knowledgeBase.update({
          where: { id: urlEntry.id },
          data: { status: 'PROCESSING' }
        });

        // Start crawling (async, don't wait)
        crawlURL(urlEntry.id, urlEntry.url).catch(error => {
          console.error(`❌ Auto-scan failed for ${urlEntry.url}:`, error.message);
        });

        scannedCount++;
      } catch (err) {
        console.error(`❌ Failed to start auto-scan for ${urlEntry.url}:`, err.message);
      }

      // Small delay between starting scans to not overload
      if (scannedCount < urlsToScan.length - skippedCount) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`🔄 Auto-scan complete: ${scannedCount} started, ${skippedCount} skipped (not due yet)`);
    return {
      success: true,
      scannedCount,
      skippedCount,
      total: urlsToScan.length
    };
  } catch (error) {
    console.error('❌ Auto-scan URLs error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Run all cron jobs - can be called by a scheduler or manually
 */
export async function runAllJobs() {
  console.log('🕐 Running all cron jobs...');

  const results = {
    resetIncludedMinutes: await resetIncludedMinutes(),
    checkLowBalance: await checkLowBalance(),
    processAutoReload: await processAutoReload(),
    checkTrialExpired: await checkTrialExpired(),
    billOverageUsage: await billOverageUsage(),
    cleanupChatLogs: await cleanupChatLogs(),
    autoScanUrls: await autoScanUrls()
  };

  console.log('🕐 All cron jobs complete:', results);
  return results;
}

export default {
  resetIncludedMinutes,
  checkLowBalance,
  processAutoReload,
  checkTrialExpired,
  cleanupOldRecords,
  cleanupChatLogs,
  billOverageUsage,
  autoScanUrls,
  runAllJobs
};
