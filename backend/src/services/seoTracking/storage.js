/**
 * Lightweight storage for SEO snapshots.
 *
 * MVP uses a single Prisma model `SeoSnapshot` with one row per
 * (query, capturedAt) tuple. Avoids new schema migrations for now —
 * the `chatLog`-style append-only pattern works well here.
 *
 * If this module is moved into the Campaign Orchestrator, swap this
 * file for the orchestrator's storage layer; the rest of seoMonitor
 * does not depend on Prisma directly.
 */

import prisma from '../../prismaClient.js';

const SNAPSHOT_KIND = 'seo_snapshot';

export async function ensureStorageReady() {
  // Reuse the existing ChatLog table as a generic key-value snapshot
  // store. Each snapshot is one ChatLog row with kind=seo_snapshot,
  // bodyJson holding the snapshot payload. This avoids a schema
  // migration on Telyx; replace with a dedicated SeoSnapshot model
  // when you migrate to the orchestrator.
  return true;
}

export async function recordSnapshot({ query, page, position, clicks, impressions, ctr, capturedAt }) {
  if (!prisma?.chatLog?.create) return null;
  try {
    return await prisma.chatLog.create({
      data: {
        kind: SNAPSHOT_KIND,
        sessionId: query.slice(0, 96),
        body: page || '',
        bodyJson: {
          query,
          page,
          position,
          clicks,
          impressions,
          ctr,
          capturedAt: capturedAt || new Date().toISOString(),
        },
        createdAt: capturedAt ? new Date(capturedAt) : undefined,
      },
    });
  } catch (err) {
    console.error('[seoTracking] failed to record snapshot:', err.message);
    return null;
  }
}

export async function fetchPreviousSnapshot(query) {
  if (!prisma?.chatLog?.findFirst) return null;
  try {
    const row = await prisma.chatLog.findFirst({
      where: { kind: SNAPSHOT_KIND, sessionId: query.slice(0, 96) },
      orderBy: { createdAt: 'desc' },
    });
    return row?.bodyJson || null;
  } catch (err) {
    console.error('[seoTracking] failed to fetch previous snapshot:', err.message);
    return null;
  }
}
