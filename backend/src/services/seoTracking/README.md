# SEO Tracking Module

Polls Google Search Console weekly, compares positions against the
last snapshot, and dispatches alerts when tracked queries drop. Runs
inside the Telyx backend cron stack today; designed to be lifted into
the Campaign Orchestrator unchanged.

## Architecture

```
keywordTargets.js  →  list of (query, targetUrl, tier) entries to track
gscClient.js       →  Search Console API wrapper (service account auth)
storage.js         →  snapshot persistence (uses ChatLog as KV today)
alerts.js          →  Slack + email dispatch
seoMonitor.js      →  orchestration (runSeoCheck)
index.js           →  public exports
```

The `runSeoCheck()` function is the single entry point. It is called
from `backend/src/jobs/seoTrackingJob.js` (cron) and
`backend/src/scripts/runSeoCheck.js` (manual).

## Required environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GSC_SERVICE_ACCOUNT_JSON` | yes\* | Full service-account JSON (single-line, escape newlines) |
| `GSC_SERVICE_ACCOUNT_FILE` | yes\* | Or: filesystem path to the JSON key |
| `GSC_SITE_URL` | yes | `sc-domain:telyx.ai` (Domain property) or `https://telyx.ai/` (URL prefix property) |
| `SEO_TRACKING_CRON` | no | Override default `0 7 * * 1` (Mondays 07:00 UTC) |
| `SLACK_SEO_WEBHOOK_URL` | no | Incoming webhook for alerts |
| `SEO_ALERT_EMAIL` | no | Recipient (defaults to `info@telyx.ai`) |

\* Set one of `GSC_SERVICE_ACCOUNT_JSON` or `GSC_SERVICE_ACCOUNT_FILE`.

## Setup checklist

1. **Google Cloud project** — create or reuse a project at
   <https://console.cloud.google.com>.
2. **Enable Search Console API** — APIs & Services → Library →
   "Google Search Console API" → Enable.
3. **Create service account** — IAM & Admin → Service Accounts →
   Create. Skip role assignment.
4. **Download JSON key** — service account → Keys → Add Key → JSON.
5. **Grant access in GSC** — Search Console → Settings → Users and
   permissions → add the service account email (`*.iam.gserviceaccount.com`)
   as a **Restricted** user on the property.
6. **Set env vars** in Render (or wherever the backend runs).
7. **Restart backend** — the job will self-register on boot if
   `isSeoTrackingConfigured()` returns true.

## Manual run

```bash
node src/scripts/runSeoCheck.js              # weekly window, alerts dispatched
node src/scripts/runSeoCheck.js --dry-run    # log, do not send alerts
node src/scripts/runSeoCheck.js --days=14    # widen GSC window
```

## Adding more keywords

Edit `keywordTargets.js`. Each entry has:

```js
{ query: 'whatsapp business api fiyat', targetUrl: '/pricing', tier: 1, clusterId: 'pricing' }
```

Tiers: 1 (critical → critical alert severity), 2 (warning), 3 (info).

## Migrating to Campaign Orchestrator

This module is intentionally portable. To move it:

1. Copy `backend/src/services/seoTracking/` into the orchestrator
   project under whatever services directory it uses.
2. Rewrite `storage.js` to use the orchestrator's persistence layer.
3. Rewrite `alerts.js` to use the orchestrator's notification layer.
4. Re-import `runSeoCheck` from the orchestrator's scheduler instead
   of from Telyx's `cronJobs.js`.

`gscClient.js`, `seoMonitor.js`, `keywordTargets.js` and `index.js`
move without modification.
