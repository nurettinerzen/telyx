/**
 * SEO Monitor.
 *
 * Periodically (cron) pulls Search Console data for each entry in
 * keywordTargets, compares to the last snapshot stored in storage,
 * and dispatches alerts when meaningful drops happen.
 *
 * Designed to be portable: the public surface is a single
 * `runSeoCheck` function. Move this module into the Campaign
 * Orchestrator by re-pointing imports for storage + alerts; the
 * monitoring logic stays unchanged.
 */

import {
  KEYWORD_TARGETS,
  POSITION_DROP_THRESHOLD,
  NEW_BAD_POSITION_THRESHOLD,
  tierAlertSeverity,
} from './keywordTargets.js';
import {
  fetchQueryPosition,
  isConfigured as isGscConfigured,
} from './gscClient.js';
import {
  ensureStorageReady,
  recordSnapshot,
  fetchPreviousSnapshot,
} from './storage.js';
import { dispatchAlerts } from './alerts.js';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://telyx.ai').replace(/\/$/, '');

function asAbsolute(targetUrl) {
  if (!targetUrl) return null;
  if (targetUrl.startsWith('http')) return targetUrl;
  return `${SITE_URL}${targetUrl.startsWith('/') ? targetUrl : `/${targetUrl}`}`;
}

function pickWindow(daysBack = 7) {
  const now = new Date();
  const end = new Date(now.getTime() - 2 * 86400000); // GSC has ~2-day lag
  const start = new Date(end.getTime() - daysBack * 86400000);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function classifyChange({ tier, previous, current }) {
  const severity = tierAlertSeverity(tier);

  if (!current) {
    // Lost from results entirely — bigger problem if previously ranked.
    if (previous && previous.position <= NEW_BAD_POSITION_THRESHOLD) {
      return { alert: true, severity: 'critical', reason: 'dropped_out' };
    }
    return { alert: false };
  }

  if (!previous) {
    // First sighting — only alert if landing position is bad for tier 1/2 targets.
    if (tier <= 2 && current.position > NEW_BAD_POSITION_THRESHOLD) {
      return { alert: true, severity, reason: 'new_low_position' };
    }
    return { alert: false };
  }

  const drop = current.position - previous.position;
  if (drop >= POSITION_DROP_THRESHOLD) {
    return { alert: true, severity, reason: 'position_drop' };
  }

  return { alert: false };
}

export async function runSeoCheck({ daysBack = 7, dryRun = false } = {}) {
  if (!isGscConfigured()) {
    console.log('[seoTracking] GSC not configured — skipping. Set GSC_SERVICE_ACCOUNT_JSON + GSC_SITE_URL.');
    return { skipped: true, reason: 'not_configured' };
  }

  await ensureStorageReady();

  const window = pickWindow(daysBack);
  console.log(`[seoTracking] running for window ${window.startDate}..${window.endDate}`);

  const alertItems = [];
  const summary = { checked: 0, alerts: 0, skipped: 0, errors: 0, window: `${window.startDate}..${window.endDate}` };

  for (const target of KEYWORD_TARGETS) {
    summary.checked += 1;
    try {
      const current = await fetchQueryPosition({
        query: target.query,
        page: asAbsolute(target.targetUrl),
        startDate: window.startDate,
        endDate: window.endDate,
      });

      const previous = await fetchPreviousSnapshot(target.query);

      const decision = classifyChange({
        tier: target.tier,
        previous,
        current,
      });

      if (current) {
        await recordSnapshot({
          query: target.query,
          page: current.page,
          position: current.position,
          clicks: current.clicks,
          impressions: current.impressions,
          ctr: current.ctr,
        });
      }

      if (decision.alert) {
        summary.alerts += 1;
        alertItems.push({
          query: target.query,
          targetUrl: target.targetUrl,
          tier: target.tier,
          severity: decision.severity,
          reason: decision.reason,
          previousPosition: previous?.position || null,
          currentPosition: current?.position ?? 999,
        });
      }
    } catch (err) {
      summary.errors += 1;
      console.error(`[seoTracking] error for "${target.query}":`, err.message);
    }
  }

  if (alertItems.length) {
    await dispatchAlerts({
      items: alertItems,
      summary: { window: summary.window },
      dryRun,
    });
  }

  console.log('[seoTracking] done', summary);
  return summary;
}
