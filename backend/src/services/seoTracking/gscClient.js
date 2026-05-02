/**
 * Google Search Console API wrapper.
 *
 * Uses a service account JSON to authenticate and query GSC for:
 *  - Search Analytics (queries, pages, clicks, impressions, CTR, position)
 *  - Sitemaps (status, last fetched, errors)
 *  - URL Inspection (per-URL coverage / index status)
 *
 * Credentials are loaded from GSC_SERVICE_ACCOUNT_JSON (entire JSON
 * pasted into a single env var) or, fallback, from
 * GSC_SERVICE_ACCOUNT_FILE (path to a JSON file).
 *
 * The site URL the service account has access to is read from
 * GSC_SITE_URL — typically `sc-domain:telyx.ai` or
 * `https://telyx.ai/` depending on how the property was added.
 */

import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { readFile } from 'node:fs/promises';

let cachedClient = null;

async function loadServiceAccount() {
  const jsonInline = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (jsonInline) {
    try {
      return JSON.parse(jsonInline);
    } catch (err) {
      throw new Error(`GSC_SERVICE_ACCOUNT_JSON is not valid JSON: ${err.message}`);
    }
  }

  const filePath = process.env.GSC_SERVICE_ACCOUNT_FILE;
  if (filePath) {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  }

  return null;
}

export async function getSearchConsoleClient() {
  if (cachedClient) return cachedClient;

  const credentials = await loadServiceAccount();
  if (!credentials) {
    throw new Error(
      'GSC service account not configured. Set GSC_SERVICE_ACCOUNT_JSON ' +
        '(inline JSON) or GSC_SERVICE_ACCOUNT_FILE (path to JSON file).'
    );
  }

  const auth = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });

  cachedClient = google.searchconsole({ version: 'v1', auth });
  return cachedClient;
}

export function getSiteUrl() {
  const url = process.env.GSC_SITE_URL;
  if (!url) {
    throw new Error(
      'GSC_SITE_URL not set. Use sc-domain:telyx.ai or https://telyx.ai/'
    );
  }
  return url;
}

/**
 * Fetch search analytics for a date range.
 *
 * `dimensions` is an array of strings: 'query', 'page', 'country',
 * 'device', 'date'. Combine to slice the data.
 */
export async function fetchSearchAnalytics({
  startDate,
  endDate,
  dimensions = ['query', 'page'],
  rowLimit = 5000,
  startRow = 0,
  filters = [],
}) {
  const sc = await getSearchConsoleClient();
  const siteUrl = getSiteUrl();

  const dimensionFilterGroups = filters.length
    ? [{ filters: filters.map(({ dimension, operator = 'equals', expression }) => ({ dimension, operator, expression })) }]
    : undefined;

  const res = await sc.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions,
      rowLimit,
      startRow,
      dimensionFilterGroups,
    },
  });

  return res.data.rows || [];
}

/**
 * Find the position of a specific query for a specific page.
 * Returns null if the query/page combination did not appear in the
 * date range.
 */
export async function fetchQueryPosition({ query, page, startDate, endDate }) {
  const filters = [{ dimension: 'query', expression: query }];
  if (page) filters.push({ dimension: 'page', expression: page });

  const rows = await fetchSearchAnalytics({
    startDate,
    endDate,
    dimensions: ['query', 'page'],
    rowLimit: 10,
    filters,
  });

  if (!rows.length) return null;

  // Take the row with the most impressions (in case multiple pages match).
  const best = rows.sort((a, b) => b.impressions - a.impressions)[0];
  return {
    query: best.keys[0],
    page: best.keys[1],
    position: best.position,
    clicks: best.clicks,
    impressions: best.impressions,
    ctr: best.ctr,
  };
}

export async function listSitemaps() {
  const sc = await getSearchConsoleClient();
  const res = await sc.sitemaps.list({ siteUrl: getSiteUrl() });
  return res.data.sitemap || [];
}

export async function inspectUrl(url) {
  const sc = await getSearchConsoleClient();
  const res = await sc.urlInspection.index.inspect({
    requestBody: { inspectionUrl: url, siteUrl: getSiteUrl() },
  });
  return res.data.inspectionResult || null;
}

export function isConfigured() {
  return Boolean(
    (process.env.GSC_SERVICE_ACCOUNT_JSON || process.env.GSC_SERVICE_ACCOUNT_FILE) &&
      process.env.GSC_SITE_URL
  );
}
