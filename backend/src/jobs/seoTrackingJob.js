// ============================================================================
// SEO TRACKING CRON JOB
// ============================================================================
// FILE: backend/src/jobs/seoTrackingJob.js
//
// Runs the SEO ranking check on a weekly schedule, pulling data from
// Google Search Console for each tracked keyword and dispatching alerts
// when positions drop. Driven by the seoTracking service module.
//
// Required env to activate:
//   GSC_SERVICE_ACCOUNT_JSON  (or GSC_SERVICE_ACCOUNT_FILE)
//   GSC_SITE_URL
//
// Optional:
//   SEO_TRACKING_CRON         — override the default schedule
//   SLACK_SEO_WEBHOOK_URL     — Slack alert destination
//   SEO_ALERT_EMAIL           — email alert recipient
// ============================================================================

import cron from 'node-cron';
import { runSeoCheck, isSeoTrackingConfigured } from '../services/seoTracking/index.js';

const DEFAULT_CRON = '0 7 * * 1'; // every Monday 07:00 UTC

export const initSeoTrackingJob = () => {
  if (!isSeoTrackingConfigured()) {
    console.log('🔍 SEO tracking job skipped — GSC not configured.');
    return null;
  }

  const schedule = process.env.SEO_TRACKING_CRON || DEFAULT_CRON;
  console.log(`🔍 Initializing SEO tracking cron job (${schedule} UTC)…`);

  const job = cron.schedule(
    schedule,
    async () => {
      console.log('\n────────────────────────────────────────');
      console.log('🔍 SEO TRACKING JOB STARTED');
      console.log('Time:', new Date().toISOString());
      console.log('────────────────────────────────────────\n');

      try {
        const summary = await runSeoCheck({ daysBack: 7 });
        console.log('🔍 SEO tracking job summary:', summary);
      } catch (err) {
        console.error('❌ SEO tracking job failed:', err.message);
      }

      console.log('\n────────────────────────────────────────');
      console.log('🔍 SEO TRACKING JOB COMPLETED');
      console.log('────────────────────────────────────────\n');
    },
    { scheduled: true, timezone: 'UTC' }
  );

  console.log(`✅ SEO tracking job initialized (cron: ${schedule}).`);
  return job;
};

export const runManualSeoCheck = async ({ daysBack = 7, dryRun = false } = {}) => {
  if (!isSeoTrackingConfigured()) {
    return { skipped: true, reason: 'not_configured' };
  }
  return runSeoCheck({ daysBack, dryRun });
};

export default {
  initSeoTrackingJob,
  runManualSeoCheck,
};
