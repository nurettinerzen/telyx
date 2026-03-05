/**
 * Red Alert: Security Event Monitoring Dashboard
 *
 * Real-time security event analytics and monitoring
 * Admin-only access
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import { isRedAlertOpsPanelEnabled } from '../config/feature-flags.js';

const router = express.Router();
const prisma = new PrismaClient();

function parseRangeToSince(range = '24h') {
  const value = String(range || '24h').trim().toLowerCase();
  const match = value.match(/^(\d+)([hd])$/);
  if (!match) {
    return new Date(Date.now() - 24 * 60 * 60 * 1000);
  }
  const amount = Math.max(1, parseInt(match[1], 10));
  const unit = match[2];
  const ms = unit === 'd'
    ? amount * 24 * 60 * 60 * 1000
    : amount * 60 * 60 * 1000;
  return new Date(Date.now() - ms);
}

function isOpsPanelAllowed(req) {
  return isRedAlertOpsPanelEnabled({ businessId: req.businessId });
}

// Require authentication for all routes
router.use(authenticateToken);

/**
 * GET /api/red-alert/summary
 * Security events summary (respects hours query param from time filter)
 */
router.get('/summary', async (req, res) => {
  try {
    const { businessId } = req;
    const { hours = 24 } = req.query;
    const since = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);

    // Get event counts by type
    const eventsByType = await prisma.securityEvent.groupBy({
      by: ['type'],
      where: {
        createdAt: { gte: since },
        ...(businessId && { businessId }),
      },
      _count: true,
    });

    // Get event counts by severity
    const eventsBySeverity = await prisma.securityEvent.groupBy({
      by: ['severity'],
      where: {
        createdAt: { gte: since },
        ...(businessId && { businessId }),
      },
      _count: true,
    });

    const totalCount = await prisma.securityEvent.count({
      where: {
        createdAt: { gte: since },
        ...(businessId && { businessId }),
      },
    });

    // Critical events requiring immediate attention
    const criticalEvents = await prisma.securityEvent.count({
      where: {
        severity: 'critical',
        createdAt: { gte: since },
        ...(businessId && { businessId }),
      },
    });

    res.json({
      summary: {
        total: totalCount,
        critical: criticalEvents,
        hours: parseInt(hours),
      },
      byType: eventsByType.reduce((acc, item) => {
        acc[item.type] = item._count;
        return acc;
      }, {}),
      bySeverity: eventsBySeverity.reduce((acc, item) => {
        acc[item.severity] = item._count;
        return acc;
      }, {}),
    });

  } catch (error) {
    console.error('Red Alert summary error:', error);
    res.status(500).json({ error: 'Failed to fetch security summary' });
  }
});

/**
 * GET /api/red-alert/events
 * Recent security events with pagination
 */
router.get('/events', async (req, res) => {
  try {
    const { businessId } = req;
    const {
      type,
      severity,
      limit = 50,
      offset = 0,
      hours = 24,
    } = req.query;

    const since = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);

    const where = {
      createdAt: { gte: since },
      ...(businessId && { businessId }),
      ...(type && { type }),
      ...(severity && { severity }),
    };

    const [events, total] = await Promise.all([
      prisma.securityEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
        select: {
          id: true,
          type: true,
          severity: true,
          endpoint: true,
          method: true,
          statusCode: true,
          ipAddress: true,
          userAgent: true,
          businessId: true,
          userId: true,
          details: true,
          createdAt: true,
        },
      }),
      prisma.securityEvent.count({ where }),
    ]);

    res.json({
      events,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit),
      },
    });

  } catch (error) {
    console.error('Red Alert events error:', error);
    res.status(500).json({ error: 'Failed to fetch security events' });
  }
});

/**
 * GET /api/red-alert/timeline
 * Event timeline for charts (hourly buckets)
 */
router.get('/timeline', async (req, res) => {
  try {
    const { businessId } = req;
    const { hours = 24 } = req.query;

    const since = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);

    const events = await prisma.securityEvent.findMany({
      where: {
        createdAt: { gte: since },
        ...(businessId && { businessId }),
      },
      select: {
        type: true,
        severity: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group events into hourly buckets
    const buckets = {};
    const bucketSize = 60 * 60 * 1000; // 1 hour

    events.forEach(event => {
      const bucketTime = Math.floor(event.createdAt.getTime() / bucketSize) * bucketSize;
      const key = new Date(bucketTime).toISOString();

      if (!buckets[key]) {
        buckets[key] = { timestamp: key, count: 0, byType: {}, bySeverity: {} };
      }

      buckets[key].count++;
      buckets[key].byType[event.type] = (buckets[key].byType[event.type] || 0) + 1;
      buckets[key].bySeverity[event.severity] = (buckets[key].bySeverity[event.severity] || 0) + 1;
    });

    res.json({
      timeline: Object.values(buckets),
    });

  } catch (error) {
    console.error('Red Alert timeline error:', error);
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

/**
 * GET /api/red-alert/top-threats
 * Top threat sources (IPs, endpoints, users)
 */
router.get('/top-threats', async (req, res) => {
  try {
    const { businessId } = req;
    const { hours = 24 } = req.query;

    const since = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);

    const events = await prisma.securityEvent.findMany({
      where: {
        createdAt: { gte: since },
        ...(businessId && { businessId }),
      },
      select: {
        ipAddress: true,
        endpoint: true,
        type: true,
        severity: true,
      },
    });

    // Count by IP
    const byIP = {};
    const byEndpoint = {};

    events.forEach(event => {
      if (event.ipAddress) {
        byIP[event.ipAddress] = (byIP[event.ipAddress] || 0) + 1;
      }
      if (event.endpoint) {
        byEndpoint[event.endpoint] = (byEndpoint[event.endpoint] || 0) + 1;
      }
    });

    // Top 10 IPs
    const topIPs = Object.entries(byIP)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count }));

    // Top 10 endpoints
    const topEndpoints = Object.entries(byEndpoint)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([endpoint, count]) => ({ endpoint, count }));

    res.json({
      topIPs,
      topEndpoints,
    });

  } catch (error) {
    console.error('Red Alert top threats error:', error);
    res.status(500).json({ error: 'Failed to fetch top threats' });
  }
});

/**
 * GET /api/red-alert/health
 * System security health score
 */
router.get('/health', async (req, res) => {
  try {
    const { businessId } = req;
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const criticalCount = await prisma.securityEvent.count({
      where: {
        severity: 'critical',
        createdAt: { gte: last24h },
        ...(businessId && { businessId }),
      },
    });

    const highCount = await prisma.securityEvent.count({
      where: {
        severity: 'high',
        createdAt: { gte: last24h },
        ...(businessId && { businessId }),
      },
    });

    const totalCount = await prisma.securityEvent.count({
      where: {
        createdAt: { gte: last24h },
        ...(businessId && { businessId }),
      },
    });

    // Also count unresolved app errors (ErrorLog) — they affect health too
    const unresolvedErrorCount = await prisma.errorLog.count({
      where: { resolved: false },
    });

    // Health scoring: security events + unresolved app errors
    let healthScore = 100;
    healthScore -= criticalCount * 10;       // -10 per critical security event
    healthScore -= highCount * 3;            // -3 per high security event
    healthScore -= unresolvedErrorCount * 2; // -2 per unresolved app error
    healthScore = Math.max(0, healthScore);

    let status = 'healthy';
    if (criticalCount > 0) status = 'critical';
    else if (highCount > 5 || unresolvedErrorCount > 10) status = 'warning';
    else if (highCount > 0 || unresolvedErrorCount > 0) status = 'caution';

    res.json({
      healthScore,
      status,
      events: {
        critical: criticalCount,
        high: highCount,
        total: totalCount,
      },
      unresolvedErrors: unresolvedErrorCount,
    });

  } catch (error) {
    console.error('Red Alert health error:', error);
    res.status(500).json({ error: 'Failed to calculate health score' });
  }
});

// ============================================================================
// OPERATIONAL INCIDENTS / RESPONSE TRACE (Phase 1)
// ============================================================================

/**
 * GET /api/red-alert/ops/summary?range=24h
 */
router.get('/ops/summary', async (req, res) => {
  try {
    if (!isOpsPanelAllowed(req)) {
      return res.status(404).json({ error: 'Operational panel disabled' });
    }

    const { businessId } = req;
    const { range = '24h' } = req.query;
    const since = parseRangeToSince(range);

    const traceWhere = {
      createdAt: { gte: since },
      ...(businessId && { businessId }),
    };
    const incidentWhere = {
      createdAt: { gte: since },
      ...(businessId && { businessId }),
    };

    const [
      totalTurns,
      bypassTurns,
      fallbackTurns,
      toolCalledTurns,
      toolSuccessTurns,
      incidentsByCategory,
      incidentsBySeverity
    ] = await Promise.all([
      prisma.responseTrace.count({ where: traceWhere }),
      prisma.responseTrace.count({
        where: {
          ...traceWhere,
          llmUsed: false
        }
      }),
      prisma.responseTrace.count({
        where: {
          ...traceWhere,
          responseSource: { in: ['template', 'fallback', 'policy_append'] }
        }
      }),
      prisma.responseTrace.count({
        where: {
          ...traceWhere,
          toolsCalledCount: { gt: 0 }
        }
      }),
      prisma.responseTrace.count({
        where: {
          ...traceWhere,
          toolsCalledCount: { gt: 0 },
          toolSuccess: true
        }
      }),
      prisma.operationalIncident.groupBy({
        by: ['category'],
        where: incidentWhere,
        _count: true
      }),
      prisma.operationalIncident.groupBy({
        by: ['severity'],
        where: incidentWhere,
        _count: true
      })
    ]);

    const pct = (num, den) => den > 0 ? Number(((num / den) * 100).toFixed(2)) : 0;

    res.json({
      range: String(range),
      since,
      totals: {
        turns: totalTurns,
        incidents: incidentsByCategory.reduce((acc, item) => acc + item._count, 0),
      },
      cards: {
        bypassRate: pct(bypassTurns, totalTurns),
        fallbackRate: pct(fallbackTurns, totalTurns),
        toolSuccessRate: pct(toolSuccessTurns, toolCalledTurns),
      },
      byCategory: incidentsByCategory.reduce((acc, item) => {
        acc[item.category] = item._count;
        return acc;
      }, {}),
      bySeverity: incidentsBySeverity.reduce((acc, item) => {
        acc[item.severity] = item._count;
        return acc;
      }, {})
    });
  } catch (error) {
    console.error('Red Alert ops summary error:', error);
    res.status(500).json({ error: 'Failed to fetch ops summary' });
  }
});

/**
 * GET /api/red-alert/ops/events?range=24h&category=...&severity=...
 */
router.get('/ops/events', async (req, res) => {
  try {
    if (!isOpsPanelAllowed(req)) {
      return res.status(404).json({ error: 'Operational panel disabled' });
    }

    const { businessId } = req;
    const {
      range = '24h',
      category,
      severity,
      limit = 50,
      offset = 0
    } = req.query;
    const since = parseRangeToSince(range);

    const where = {
      createdAt: { gte: since },
      ...(businessId && { businessId }),
      ...(category && { category: String(category) }),
      ...(severity && { severity: String(severity).toUpperCase() })
    };

    const [events, total] = await Promise.all([
      prisma.operationalIncident.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit, 10),
        skip: parseInt(offset, 10),
        select: {
          id: true,
          createdAt: true,
          severity: true,
          category: true,
          channel: true,
          traceId: true,
          requestId: true,
          businessId: true,
          userId: true,
          sessionId: true,
          messageId: true,
          summary: true,
          details: true,
          resolved: true
        }
      }),
      prisma.operationalIncident.count({ where })
    ]);

    res.json({
      events,
      pagination: {
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        hasMore: total > parseInt(offset, 10) + parseInt(limit, 10),
      }
    });
  } catch (error) {
    console.error('Red Alert ops events error:', error);
    res.status(500).json({ error: 'Failed to fetch ops events' });
  }
});

/**
 * GET /api/red-alert/ops/repeat-responses?range=24h
 */
router.get('/ops/repeat-responses', async (req, res) => {
  try {
    if (!isOpsPanelAllowed(req)) {
      return res.status(404).json({ error: 'Operational panel disabled' });
    }

    const { businessId } = req;
    const { range = '24h', limit = 50 } = req.query;
    const since = parseRangeToSince(range);

    const traces = await prisma.responseTrace.findMany({
      where: {
        createdAt: { gte: since },
        ...(businessId && { businessId }),
        responseHash: { not: null }
      },
      select: {
        responseHash: true,
        responsePreview: true,
        channel: true,
        traceId: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 5000
    });

    const grouped = new Map();
    for (const row of traces) {
      const key = `${row.responseHash}::${row.channel}`;
      const current = grouped.get(key) || {
        responseHash: row.responseHash,
        channel: row.channel,
        count: 0,
        sample: row.responsePreview || '',
        latestTraceId: row.traceId,
        latestAt: row.createdAt
      };
      current.count += 1;
      if (!current.sample && row.responsePreview) {
        current.sample = row.responsePreview;
      }
      if (row.createdAt > current.latestAt) {
        current.latestAt = row.createdAt;
        current.latestTraceId = row.traceId;
      }
      grouped.set(key, current);
    }

    const repeats = Array.from(grouped.values())
      .filter(item => item.count > 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, parseInt(limit, 10));

    res.json({
      repeats
    });
  } catch (error) {
    console.error('Red Alert repeat response error:', error);
    res.status(500).json({ error: 'Failed to fetch repeat responses' });
  }
});

// ============================================================================
// ERROR TRACKING CENTER — Application Error Endpoints
// ============================================================================

/**
 * GET /api/red-alert/errors/summary
 * Error counts by category and severity (respects hours query param) + unresolved count
 */
router.get('/errors/summary', async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    const since = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);

    const [
      byCategory,
      bySeverity,
      totalCount,
      unresolvedCount,
    ] = await Promise.all([
      prisma.errorLog.groupBy({
        by: ['category'],
        where: { createdAt: { gte: since } },
        _count: true,
        _sum: { occurrenceCount: true },
      }),
      prisma.errorLog.groupBy({
        by: ['severity'],
        where: { createdAt: { gte: since } },
        _count: true,
      }),
      prisma.errorLog.count({
        where: { createdAt: { gte: since } },
      }),
      prisma.errorLog.count({
        where: { resolved: false, createdAt: { gte: since } },
      }),
    ]);

    res.json({
      summary: {
        total: totalCount,
        hours: parseInt(hours),
        unresolved: unresolvedCount,
      },
      byCategory: byCategory.reduce((acc, item) => {
        acc[item.category] = {
          count: item._count,
          totalOccurrences: item._sum?.occurrenceCount || item._count,
        };
        return acc;
      }, {}),
      bySeverity: bySeverity.reduce((acc, item) => {
        acc[item.severity] = item._count;
        return acc;
      }, {}),
    });
  } catch (error) {
    console.error('Red Alert errors summary error:', error);
    res.status(500).json({ error: 'Failed to fetch error summary' });
  }
});

/**
 * GET /api/red-alert/errors
 * Paginated error logs with filters
 */
router.get('/errors', async (req, res) => {
  try {
    const {
      category,
      severity,
      source,
      externalService,
      resolved,
      limit = 20,
      offset = 0,
      hours = 24,
    } = req.query;

    const since = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);

    const where = {
      createdAt: { gte: since },
      ...(category && { category }),
      ...(severity && { severity }),
      ...(source && { source }),
      ...(externalService && { externalService }),
      ...(resolved !== undefined && resolved !== '' && { resolved: resolved === 'true' }),
    };

    const [errors, total] = await Promise.all([
      prisma.errorLog.findMany({
        where,
        orderBy: { lastSeenAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
        select: {
          id: true,
          category: true,
          severity: true,
          errorCode: true,
          message: true,
          stackTrace: true,
          businessId: true,
          requestId: true,
          sessionId: true,
          source: true,
          endpoint: true,
          method: true,
          toolName: true,
          externalService: true,
          externalStatus: true,
          responseTimeMs: true,
          occurrenceCount: true,
          firstSeenAt: true,
          lastSeenAt: true,
          latestRequestId: true,
          resolved: true,
          resolvedAt: true,
          resolvedBy: true,
          createdAt: true,
        },
      }),
      prisma.errorLog.count({ where }),
    ]);

    res.json({
      errors,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit),
      },
    });
  } catch (error) {
    console.error('Red Alert errors list error:', error);
    res.status(500).json({ error: 'Failed to fetch error logs' });
  }
});

/**
 * PATCH /api/red-alert/errors/:id/resolve
 * Mark an error as resolved (or unresolve)
 */
router.patch('/errors/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    const { resolved = true } = req.body;

    const updated = await prisma.errorLog.update({
      where: { id: parseInt(id) },
      data: {
        resolved: Boolean(resolved),
        resolvedAt: resolved ? new Date() : null,
        resolvedBy: resolved ? (req.user?.email || 'admin') : null,
      },
    });

    res.json({
      message: resolved ? 'Error marked as resolved' : 'Error marked as unresolved',
      error: updated,
    });
  } catch (error) {
    console.error('Red Alert resolve error:', error);
    res.status(500).json({ error: 'Failed to update error status' });
  }
});

export default router;
