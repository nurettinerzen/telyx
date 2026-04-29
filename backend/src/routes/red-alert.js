/**
 * Red Alert: Security Event Monitoring Dashboard
 *
 * Real-time security event analytics and monitoring
 * Admin-only access
 */

import express from 'express';
import prisma from '../prismaClient.js';
import { authenticateToken } from '../middleware/auth.js';
import { isAdmin, requireAdminMfa } from '../middleware/adminAuth.js';
import {
  isOperationalIncidentsEnabled,
  isRedAlertOpsPanelEnabled,
  isUnifiedResponseTraceEnabled
} from '../config/feature-flags.js';
import {
  ASSISTANT_INCIDENT_CATEGORIES,
  OPS_INCIDENT_CATEGORIES,
  OP_INCIDENT_CATEGORY
} from '../services/operationalIncidentLogger.js';
import { logError, ERROR_CATEGORY, SEVERITY } from '../services/errorLogger.js';

const router = express.Router();
const SECURITY_THREAT_TYPES = [
  'auth_failure',
  'cross_tenant_attempt',
  'firewall_block',
  'content_safety_block',
  'ssrf_block',
  'rate_limit_hit',
  'webhook_invalid_signature',
  'pii_leak_block'
];

async function handleRedAlertRouteError(req, res, {
  error,
  source,
  message,
  status = 500,
  publicError = 'Failed to process Red Alert request'
}) {
  console.error(message, error);

  await logError({
    category: ERROR_CATEGORY.API_ERROR,
    severity: SEVERITY.MEDIUM,
    message: `${message} ${error?.message || ''}`.trim(),
    error,
    source,
    businessId: req.businessId || null,
    userId: req.user?.id || req.userId || null,
    requestId: req.requestId || null,
    endpoint: req.originalUrl || req.path,
    method: req.method,
  });

  return res.status(status).json({ error: publicError });
}

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

function buildAssistantIncidentWhere({ businessId, since, category, severity, resolved } = {}) {
  return {
    createdAt: { gte: since },
    ...(businessId && { businessId }),
    channel: { not: 'ADMIN_DRAFT' },
    category: {
      in: category ? [String(category)] : [...ASSISTANT_INCIDENT_CATEGORIES]
    },
    ...(severity && { severity: String(severity).toUpperCase() }),
    ...(resolved === 'true' || resolved === 'false'
      ? { resolved: resolved === 'true' }
      : {})
  };
}

function buildOpsIncidentWhere({ businessId, since, category, severity } = {}) {
  return {
    createdAt: { gte: since },
    ...(businessId && { businessId }),
    channel: { not: 'ADMIN_DRAFT' },
    category: {
      in: category ? [String(category)] : [...OPS_INCIDENT_CATEGORIES]
    },
    ...(severity && { severity: String(severity).toUpperCase() })
  };
}

function toPercent(part, total) {
  if (!total || total <= 0) return 0;
  return Number(((part / total) * 100).toFixed(2));
}

// Require authenticated admin + MFA for all routes.
// This panel exposes cross-tenant operational telemetry and error stacks.
router.use(authenticateToken);
router.use(isAdmin);
router.use(requireAdminMfa);

/**
 * GET /api/red-alert/capabilities
 * Frontend capability bootstrap for assistant quality / ops panels.
 */
router.get('/capabilities', async (req, res) => {
  try {
    const { businessId } = req;

    res.json({
      redAlertOpsPanelEnabled: isRedAlertOpsPanelEnabled({ businessId }),
      unifiedResponseTraceEnabled: isUnifiedResponseTraceEnabled({ businessId }),
      operationalIncidentsEnabled: isOperationalIncidentsEnabled({ businessId })
    });
  } catch (error) {
    return handleRedAlertRouteError(req, res, {
      error,
      source: 'red_alert_capabilities',
      message: 'Red Alert capabilities error:',
      publicError: 'Failed to fetch Red Alert capabilities'
    });
  }
});

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
        type: { in: SECURITY_THREAT_TYPES },
      },
      _count: true,
    });

    // Get event counts by severity
    const eventsBySeverity = await prisma.securityEvent.groupBy({
      by: ['severity'],
      where: {
        createdAt: { gte: since },
        ...(businessId && { businessId }),
        type: { in: SECURITY_THREAT_TYPES },
      },
      _count: true,
    });

    const totalCount = await prisma.securityEvent.count({
      where: {
        createdAt: { gte: since },
        ...(businessId && { businessId }),
        type: { in: SECURITY_THREAT_TYPES },
      },
    });

    // Critical events requiring immediate attention
    const criticalEvents = await prisma.securityEvent.count({
      where: {
        severity: 'critical',
        createdAt: { gte: since },
        ...(businessId && { businessId }),
        type: { in: SECURITY_THREAT_TYPES },
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
    return handleRedAlertRouteError(req, res, {
      error,
      source: 'red_alert_security_summary',
      message: 'Red Alert summary error:',
      publicError: 'Failed to fetch security summary'
    });
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
      type: { in: SECURITY_THREAT_TYPES },
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
    return handleRedAlertRouteError(req, res, {
      error,
      source: 'red_alert_security_events',
      message: 'Red Alert events error:',
      publicError: 'Failed to fetch security events'
    });
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
        type: { in: SECURITY_THREAT_TYPES },
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
    return handleRedAlertRouteError(req, res, {
      error,
      source: 'red_alert_timeline',
      message: 'Red Alert timeline error:',
      publicError: 'Failed to fetch timeline'
    });
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
        type: { in: SECURITY_THREAT_TYPES },
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
    return handleRedAlertRouteError(req, res, {
      error,
      source: 'red_alert_top_threats',
      message: 'Red Alert top threats error:',
      publicError: 'Failed to fetch top threats'
    });
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
        type: { in: SECURITY_THREAT_TYPES },
      },
    });

    const highCount = await prisma.securityEvent.count({
      where: {
        severity: 'high',
        createdAt: { gte: last24h },
        ...(businessId && { businessId }),
        type: { in: SECURITY_THREAT_TYPES },
      },
    });

    const totalCount = await prisma.securityEvent.count({
      where: {
        createdAt: { gte: last24h },
        ...(businessId && { businessId }),
        type: { in: SECURITY_THREAT_TYPES },
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
    return handleRedAlertRouteError(req, res, {
      error,
      source: 'red_alert_health',
      message: 'Red Alert health error:',
      publicError: 'Failed to calculate health score'
    });
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
      channel: { not: 'ADMIN_DRAFT' }
    };
    const incidentWhere = buildOpsIncidentWhere({ businessId, since });

    const [
      totalTurns,
      bypassTurns,
      toolCalledTurns,
      toolSuccessTurns,
      incidentsByCategory,
      incidentsBySeverity,
      repeatIncidentCount
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
      }),
      prisma.operationalIncident.count({
        where: {
          createdAt: { gte: since },
          ...(businessId && { businessId }),
          channel: { not: 'ADMIN_DRAFT' },
          category: OP_INCIDENT_CATEGORY.RESPONSE_STUCK
        }
      })
    ]);

    const pct = (num, den) => den > 0 ? Number(((num / den) * 100).toFixed(2)) : 0;
    const categoryCounts = incidentsByCategory.reduce((acc, item) => {
      acc[item.category] = item._count;
      return acc;
    }, {});

    res.json({
      range: String(range),
      since,
      totals: {
        turns: totalTurns,
        incidents: incidentsByCategory.reduce((acc, item) => acc + item._count, 0),
      },
      cards: {
        bypassRate: pct(bypassTurns, totalTurns),
        repeatRate: pct(repeatIncidentCount, totalTurns),
        toolSuccessRate: pct(toolSuccessTurns, toolCalledTurns),
      },
      byCategory: categoryCounts,
      bySeverity: incidentsBySeverity.reduce((acc, item) => {
        acc[item.severity] = item._count;
        return acc;
      }, {})
    });
  } catch (error) {
    return handleRedAlertRouteError(req, res, {
      error,
      source: 'red_alert_ops_summary',
      message: 'Red Alert ops summary error:',
      publicError: 'Failed to fetch ops summary'
    });
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
    const where = buildOpsIncidentWhere({ businessId, since, category, severity });

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
    return handleRedAlertRouteError(req, res, {
      error,
      source: 'red_alert_ops_events',
      message: 'Red Alert ops events error:',
      publicError: 'Failed to fetch ops events'
    });
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
        channel: { not: 'ADMIN_DRAFT' },
        responseHash: { not: null }
      },
      select: {
        responseHash: true,
        responsePreview: true,
        channel: true,
        sessionId: true,
        traceId: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 5000
    });

    const grouped = new Map();
    for (const row of traces) {
      const key = `${row.responseHash}::${row.channel}::${row.sessionId || 'no-session'}`;
      const current = grouped.get(key) || {
        responseHash: row.responseHash,
        channel: row.channel,
        sessionId: row.sessionId || null,
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
    return handleRedAlertRouteError(req, res, {
      error,
      source: 'red_alert_repeat_responses',
      message: 'Red Alert repeat response error:',
      publicError: 'Failed to fetch repeat responses'
    });
  }
});

/**
 * GET /api/red-alert/assistant/summary?range=24h
 */
router.get('/assistant/summary', async (req, res) => {
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
      channel: { not: 'ADMIN_DRAFT' }
    };
    const incidentWhere = buildAssistantIncidentWhere({ businessId, since });

    const [totalTurns, incidentsByCategory, incidentsBySeverity, unresolvedCount] = await Promise.all([
      prisma.responseTrace.count({ where: traceWhere }),
      prisma.operationalIncident.groupBy({
        by: ['category'],
        where: incidentWhere,
        _count: true
      }),
      prisma.operationalIncident.groupBy({
        by: ['severity'],
        where: incidentWhere,
        _count: true
      }),
      prisma.operationalIncident.count({
        where: {
          ...incidentWhere,
          resolved: false
        }
      })
    ]);

    const categoryCounts = incidentsByCategory.reduce((acc, item) => {
      acc[item.category] = item._count;
      return acc;
    }, {});

    const positiveFeedback = categoryCounts[OP_INCIDENT_CATEGORY.ASSISTANT_POSITIVE_FEEDBACK] || 0;
    const negativeFeedback = categoryCounts[OP_INCIDENT_CATEGORY.ASSISTANT_NEGATIVE_FEEDBACK] || 0;
    const feedbackTotal = positiveFeedback + negativeFeedback;
    const blocked = categoryCounts[OP_INCIDENT_CATEGORY.ASSISTANT_BLOCKED] || 0;
    const sanitized = categoryCounts[OP_INCIDENT_CATEGORY.ASSISTANT_SANITIZED] || 0;
    const fallback = categoryCounts[OP_INCIDENT_CATEGORY.TEMPLATE_FALLBACK_USED] || 0;
    const intervention = categoryCounts[OP_INCIDENT_CATEGORY.ASSISTANT_INTERVENTION] || 0;

    res.json({
      range: String(range),
      since,
      totals: {
        turns: totalTurns,
        incidents: incidentsByCategory.reduce((acc, item) => acc + item._count, 0),
        unresolved: unresolvedCount,
        feedbackTotal
      },
      cards: {
        blockedRate: toPercent(blocked, totalTurns),
        sanitizeRate: toPercent(sanitized, totalTurns),
        fallbackRate: toPercent(fallback, totalTurns),
        interventionRate: toPercent(intervention, totalTurns),
        negativeFeedbackRate: toPercent(negativeFeedback, Math.max(feedbackTotal, 1))
      },
      counts: {
        blocked,
        sanitized,
        fallback,
        intervention,
        positiveFeedback,
        negativeFeedback
      },
      byCategory: categoryCounts,
      bySeverity: incidentsBySeverity.reduce((acc, item) => {
        acc[item.severity] = item._count;
        return acc;
      }, {})
    });
  } catch (error) {
    return handleRedAlertRouteError(req, res, {
      error,
      source: 'red_alert_assistant_summary',
      message: 'Red Alert assistant summary error:',
      publicError: 'Failed to fetch assistant summary'
    });
  }
});

/**
 * GET /api/red-alert/assistant/events?range=24h
 */
router.get('/assistant/events', async (req, res) => {
  try {
    if (!isOpsPanelAllowed(req)) {
      return res.status(404).json({ error: 'Operational panel disabled' });
    }

    const { businessId } = req;
    const {
      range = '24h',
      category,
      severity,
      resolved = '',
      limit = 50,
      offset = 0
    } = req.query;
    const since = parseRangeToSince(range);
    const where = buildAssistantIncidentWhere({ businessId, since, category, severity, resolved });

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
          resolved: true,
          resolvedAt: true,
          resolvedBy: true
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
        hasMore: total > parseInt(offset, 10) + parseInt(limit, 10)
      }
    });
  } catch (error) {
    return handleRedAlertRouteError(req, res, {
      error,
      source: 'red_alert_assistant_events',
      message: 'Red Alert assistant events error:',
      publicError: 'Failed to fetch assistant events'
    });
  }
});

/**
 * PATCH /api/red-alert/ops/events/:id/resolve
 */
router.patch('/ops/events/:id/resolve', async (req, res) => {
  try {
    if (!isOpsPanelAllowed(req)) {
      return res.status(404).json({ error: 'Operational panel disabled' });
    }

    const { businessId } = req;
    const { id } = req.params;
    const { resolved = true } = req.body || {};

    const updated = await prisma.operationalIncident.updateMany({
      where: {
        id,
        ...(businessId && { businessId }),
        channel: { not: 'ADMIN_DRAFT' },
        category: { in: [...OPS_INCIDENT_CATEGORIES] }
      },
      data: {
        resolved: resolved === true,
        resolvedAt: resolved === true ? new Date() : null,
        resolvedBy: resolved === true ? `user:${req.user?.id || 'unknown'}` : null
      }
    });

    if (updated.count === 0) {
      return res.status(404).json({ error: 'Operational event not found' });
    }

    res.json({ success: true });
  } catch (error) {
    return handleRedAlertRouteError(req, res, {
      error,
      source: 'red_alert_ops_resolve',
      message: 'Red Alert ops resolve error:',
      publicError: 'Failed to update ops event'
    });
  }
});

/**
 * GET /api/red-alert/assistant/trace/:traceId
 */
router.get('/assistant/trace/:traceId', async (req, res) => {
  try {
    if (!isOpsPanelAllowed(req)) {
      return res.status(404).json({ error: 'Operational panel disabled' });
    }

    const { businessId } = req;
    const { traceId } = req.params;

    const trace = await prisma.responseTrace.findFirst({
      where: {
        traceId,
        ...(businessId && { businessId })
      },
      select: {
        id: true,
        traceId: true,
        createdAt: true,
        requestId: true,
        channel: true,
        businessId: true,
        userId: true,
        sessionId: true,
        messageId: true,
        payload: true,
        latencyMs: true,
        responsePreview: true,
        responseSource: true,
        llmUsed: true,
        toolsCalledCount: true,
        toolSuccess: true
      }
    });

    if (!trace) {
      return res.status(404).json({ error: 'Trace not found' });
    }

    const [incidents, chatLog] = await Promise.all([
      prisma.operationalIncident.findMany({
        where: {
          traceId,
          ...(businessId && { businessId })
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          severity: true,
          category: true,
          summary: true,
          details: true,
          resolved: true,
          resolvedAt: true,
          resolvedBy: true
        }
      }),
      trace.sessionId
        ? prisma.chatLog.findFirst({
          where: {
            sessionId: trace.sessionId,
            ...(businessId && { businessId })
          },
          select: {
            id: true,
            sessionId: true,
            channel: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            messages: true,
            messageCount: true
          }
        })
        : Promise.resolve(null)
    ]);

    res.json({
      trace,
      incidents,
      chatLog
    });
  } catch (error) {
    return handleRedAlertRouteError(req, res, {
      error,
      source: 'red_alert_assistant_trace',
      message: 'Red Alert assistant trace detail error:',
      publicError: 'Failed to fetch assistant trace detail'
    });
  }
});

/**
 * PATCH /api/red-alert/assistant/events/:id/resolve
 */
router.patch('/assistant/events/:id/resolve', async (req, res) => {
  try {
    if (!isOpsPanelAllowed(req)) {
      return res.status(404).json({ error: 'Operational panel disabled' });
    }

    const { businessId } = req;
    const { id } = req.params;
    const { resolved = true } = req.body || {};

    const updated = await prisma.operationalIncident.updateMany({
      where: {
        id,
        ...(businessId && { businessId }),
        category: { in: [...ASSISTANT_INCIDENT_CATEGORIES] }
      },
      data: {
        resolved: resolved === true,
        resolvedAt: resolved === true ? new Date() : null,
        resolvedBy: resolved === true ? `user:${req.user?.id || 'unknown'}` : null
      }
    });

    if (updated.count === 0) {
      return res.status(404).json({ error: 'Assistant event not found' });
    }

    res.json({ success: true });
  } catch (error) {
    return handleRedAlertRouteError(req, res, {
      error,
      source: 'red_alert_assistant_resolve',
      message: 'Red Alert assistant resolve error:',
      publicError: 'Failed to update assistant event'
    });
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
    return handleRedAlertRouteError(req, res, {
      error,
      source: 'red_alert_errors_summary',
      message: 'Red Alert errors summary error:',
      publicError: 'Failed to fetch error summary'
    });
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
    return handleRedAlertRouteError(req, res, {
      error,
      source: 'red_alert_errors_list',
      message: 'Red Alert errors list error:',
      publicError: 'Failed to fetch error logs'
    });
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
    return handleRedAlertRouteError(req, res, {
      error,
      source: 'red_alert_errors_resolve',
      message: 'Red Alert resolve error:',
      publicError: 'Failed to update error status'
    });
  }
});

export default router;
