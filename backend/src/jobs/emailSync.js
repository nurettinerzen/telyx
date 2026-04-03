/**
 * Email Sync Background Job
 * Periodically syncs new emails for all connected businesses
 *
 * NOTE: This job ONLY syncs emails. It does NOT generate AI drafts automatically.
 * Draft generation is 100% manual - users click "Generate AI Draft" button for specific threads.
 */

import cron from 'node-cron';
import prisma from '../prismaClient.js';
import emailAggregator from '../services/email-aggregator.js';
import { createPairForOutbound } from '../services/email-pair-incremental.js';
import { createOutlookPairForOutbound } from '../services/outlook-pair-incremental.js';

/**
 * Sync emails for a single business
 * Only syncs emails - NO automatic draft generation
 */
async function syncBusinessEmails(integration) {
  const { businessId, provider, email } = integration;

  try {
    console.log(`[Email Sync] Syncing ${provider} for business ${businessId} (${email})`);

    // Get new messages from provider
    const newMessages = await emailAggregator.syncNewMessages(businessId);

    if (newMessages.length === 0) {
      console.log(`[Email Sync] No new messages for business ${businessId}`);
      return { businessId, processed: 0 };
    }

    let processedCount = 0;

    for (const message of newMessages) {
      // Determine direction
      const direction = message.from.email.toLowerCase() === email.toLowerCase()
        ? 'OUTBOUND'
        : 'INBOUND';

      // Save to database
      const { thread, isNew } = await emailAggregator.saveMessageToDb(
        businessId,
        message,
        direction
      );

      if (isNew) {
        processedCount++;

        // For OUTBOUND messages (sent by user), mark thread as REPLIED
        // This handles the case when user replies via external email app
        if (direction === 'OUTBOUND' && thread.status !== 'REPLIED') {
          await prisma.emailThread.update({
            where: { id: thread.id },
            data: { status: 'REPLIED' }
          });
          console.log(`[Email Sync] Thread ${thread.id} marked as REPLIED (outbound message detected)`);

          // AUTO-LEARNING: Create email pair for this outbound (async, non-blocking)
          // This builds the learning dataset incrementally
          // Route to appropriate provider
          if (provider === 'GMAIL') {
            createPairForOutbound({
              businessId,
              threadId: thread.id,
              outboundMessageId: message.id
            }).catch(err => {
              console.warn(`[Email Sync] Failed to create Gmail pair for outbound ${message.id}:`, err.message);
            });
          } else if (provider === 'OUTLOOK') {
            createOutlookPairForOutbound({
              businessId,
              threadId: thread.id,
              outboundMessageId: message.id
            }).catch(err => {
              console.warn(`[Email Sync] Failed to create Outlook pair for outbound ${message.id}:`, err.message);
            });
          }
        }

        // For INBOUND messages: If thread was REPLIED or CLOSED, reopen it as PENDING_REPLY
        // This handles the case where a customer sends a follow-up email after we replied
        if (direction === 'INBOUND' && (thread.status === 'REPLIED' || thread.status === 'CLOSED' || thread.status === 'NO_REPLY_NEEDED')) {
          // Cancel any pending drafts for this thread (they're for old messages)
          await prisma.emailDraft.updateMany({
            where: {
              threadId: thread.id,
              status: 'PENDING_REVIEW'
            },
            data: { status: 'CANCELLED' }
          });

          await prisma.emailThread.update({
            where: { id: thread.id },
            data: { status: 'PENDING_REPLY' }
          });
          console.log(`[Email Sync] Thread ${thread.id} reopened as PENDING_REPLY (new inbound message)`);
        }
      }
    }

    console.log(`[Email Sync] Business ${businessId}: ${processedCount} new messages synced`);
    return { businessId, processed: processedCount };
  } catch (error) {
    // Check if this is a token expiration error (already handled in gmail.js)
    if (error.message.includes('reconnect') || error.message.includes('bağlantısı sona erdi')) {
      console.log(`[Email Sync] Business ${businessId}: Gmail connection expired, marked as disconnected`);
      return { businessId, disconnected: true, error: 'Token expired' };
    }

    console.error(`[Email Sync] Error syncing business ${businessId}:`, error.message);
    return { businessId, error: error.message };
  }
}

/**
 * Run full sync for all connected businesses
 */
async function runEmailSync() {
  console.log('\n========================================');
  console.log('[Email Sync] Starting email sync job');
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');

  try {
    // Get all connected email integrations
    const integrations = await prisma.emailIntegration.findMany({
      where: { connected: true }
    });

    if (integrations.length === 0) {
      console.log('[Email Sync] No connected email integrations found');
      return { success: true, synced: 0 };
    }

    console.log(`[Email Sync] Found ${integrations.length} connected accounts`);

    const results = [];

    // Process each integration sequentially to avoid rate limiting
    for (const integration of integrations) {
      const result = await syncBusinessEmails(integration);
      results.push(result);

      // Small delay between businesses to avoid API rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const totalProcessed = results.reduce((sum, r) => sum + (r.processed || 0), 0);
    const errors = results.filter(r => r.error).length;

    console.log('\n========================================');
    console.log('[Email Sync] Sync job completed');
    console.log(`Businesses: ${integrations.length}`);
    console.log(`Messages synced: ${totalProcessed}`);
    console.log(`Errors: ${errors}`);
    console.log('========================================\n');

    return {
      success: true,
      synced: integrations.length,
      processed: totalProcessed,
      errors
    };
  } catch (error) {
    console.error('[Email Sync] Job failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Initialize the email sync cron job
 * Runs every 3 minutes
 */
export function initEmailSyncJob() {
  console.log('[Email Sync] Initializing email sync cron job...');

  // Run every 3 minutes
  const job = cron.schedule('*/3 * * * *', async () => {
    await runEmailSync();
  }, {
    scheduled: true,
    timezone: 'UTC'
  });

  console.log('[Email Sync] Cron job initialized (runs every 3 minutes)');

  return job;
}

/**
 * Manual trigger for testing
 */
export async function runManualEmailSync() {
  console.log('[Email Sync] Running manual sync...');
  return await runEmailSync();
}

/**
 * Sync single business (for API calls)
 */
export async function syncSingleBusiness(businessId) {
  const integration = await prisma.emailIntegration.findUnique({
    where: { businessId }
  });

  if (!integration || !integration.connected) {
    throw new Error('No email provider connected');
  }

  return await syncBusinessEmails(integration);
}

export default {
  initEmailSyncJob,
  runManualEmailSync,
  syncSingleBusiness
};
