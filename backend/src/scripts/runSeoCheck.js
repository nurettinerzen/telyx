#!/usr/bin/env node
/**
 * Manual trigger for the SEO check pipeline.
 *
 * Usage:
 *   node src/scripts/runSeoCheck.js              # weekly window, alerts dispatched
 *   node src/scripts/runSeoCheck.js --dry-run    # log alerts without sending
 *   node src/scripts/runSeoCheck.js --days=14    # widen the GSC window
 *
 * Required env:
 *   GSC_SERVICE_ACCOUNT_JSON  — full JSON content of the service account key
 *   GSC_SITE_URL              — sc-domain:telyx.ai or https://telyx.ai/
 *
 * Optional env:
 *   SLACK_SEO_WEBHOOK_URL     — incoming webhook for alerts
 *   SEO_ALERT_EMAIL           — recipient (defaults to info@telyx.ai)
 */

import { runSeoCheck } from '../services/seoTracking/index.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const daysArg = args.find((a) => a.startsWith('--days='));
const daysBack = daysArg ? Number(daysArg.split('=')[1]) || 7 : 7;

runSeoCheck({ daysBack, dryRun })
  .then((summary) => {
    console.log('Done.', summary);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  });
