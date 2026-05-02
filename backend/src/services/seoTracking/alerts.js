/**
 * Alert dispatch.
 *
 * For now: console + e-mail (if SENDGRID is configured) + Slack
 * webhook (if SLACK_SEO_WEBHOOK_URL is set). No PagerDuty, no SMS.
 *
 * In the orchestrator project this would be replaced with the
 * orchestrator's notification layer.
 */

import https from 'node:https';

let emailService = null;
try {
  const mod = await import('../emailService.js');
  emailService = mod.default;
} catch (e) {
  // emailService not available — fine, we'll fall back to console only
}

const SLACK_WEBHOOK = process.env.SLACK_SEO_WEBHOOK_URL || '';
const ALERT_RECIPIENT = process.env.SEO_ALERT_EMAIL || 'info@telyx.ai';

function postSlack(payload) {
  return new Promise((resolve) => {
    if (!SLACK_WEBHOOK) {
      resolve(false);
      return;
    }
    try {
      const body = JSON.stringify(payload);
      const url = new URL(SLACK_WEBHOOK);
      const req = https.request(
        {
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          res.on('data', () => {});
          res.on('end', () => resolve(res.statusCode >= 200 && res.statusCode < 300));
        }
      );
      req.on('error', () => resolve(false));
      req.write(body);
      req.end();
    } catch (err) {
      resolve(false);
    }
  });
}

function formatRow(item) {
  const arrow = item.previousPosition && item.previousPosition < item.currentPosition ? '↓' : '';
  const change = item.previousPosition
    ? ` (${item.previousPosition.toFixed(1)} → ${item.currentPosition.toFixed(1)})`
    : ` (yeni: ${item.currentPosition.toFixed(1)})`;
  return `• ${item.severity.toUpperCase()} ${arrow} "${item.query}" — ${item.targetUrl}${change}`;
}

export async function dispatchAlerts({ items = [], summary = {}, dryRun = false } = {}) {
  if (!items.length) return { sent: false, reason: 'no items' };

  const lines = items.map(formatRow);
  const text = [
    `🔔 Telyx SEO uyarısı — ${summary.window || 'son haftalık'} verilerinde değişiklik`,
    '',
    ...lines,
    '',
    `Toplam ${items.length} sorgu için aksiyon önerilir.`,
    summary.dashboardUrl ? `Detay: ${summary.dashboardUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  console.log('[seoTracking][alert]\n' + text);

  if (dryRun) return { sent: false, dryRun: true, text };

  const slackOk = await postSlack({ text });

  let emailOk = false;
  if (emailService?.sendInternalNotification) {
    try {
      await emailService.sendInternalNotification({
        to: ALERT_RECIPIENT,
        subject: `Telyx SEO uyarısı (${items.length} sorgu)`,
        text,
      });
      emailOk = true;
    } catch (err) {
      console.error('[seoTracking][alert] email send failed:', err.message);
    }
  }

  return { sent: slackOk || emailOk, slackOk, emailOk, text };
}
