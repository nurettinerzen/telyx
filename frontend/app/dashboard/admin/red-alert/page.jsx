'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Shield, AlertCircle, Activity,
  Server, Eye, ChevronLeft, ChevronRight,
  Bug, Wrench, MessageSquare, Globe, CheckCircle, XCircle, ChevronDown, ChevronUp, Sparkles
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { getRedAlertCopy } from '@/lib/redAlertCopy';
import { toast } from 'sonner';

const SEVERITY_COLORS = {
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const HEALTH_BADGE_COLORS = {
  healthy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  caution: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  warning: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const ERROR_CATEGORY_ICONS = {
  tool_failure: Wrench,
  chat_error: MessageSquare,
  assistant_error: Server,
  api_error: Globe,
  system_error: AlertCircle,
  webhook_error: Activity,
};

const ASSISTANT_PANEL_CATEGORY_KEYS = [
  'ASSISTANT_BLOCKED',
  'ASSISTANT_SANITIZED',
  'TEMPLATE_FALLBACK_USED',
  'ASSISTANT_INTERVENTION',
  'ASSISTANT_NEGATIVE_FEEDBACK',
  'ASSISTANT_POSITIVE_FEEDBACK'
];

const OPS_PANEL_CATEGORY_KEYS = [
  'LLM_BYPASSED',
  'TOOL_NOT_CALLED_WHEN_EXPECTED'
];


export default function RedAlertPage() {
  const { locale } = useLanguage();
  const copy = getRedAlertCopy(locale);
  const uiLocale = locale === 'tr' ? 'tr-TR' : 'en-US';
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [health, setHealth] = useState(null);
  const [activePanel, setActivePanel] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('redAlertPanel') || 'errors';
    }
    return 'errors';
  });
  const [filters, setFilters] = useState(() => {
    let hours = 168; // default: Son 7 Gün
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('redAlertHours');
      if (saved) hours = parseInt(saved);
    }
    return { hours, severity: '', type: '' };
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    hasMore: false,
  });

  // Error Tracking State
  const [errorSummary, setErrorSummary] = useState(null);
  const [errorLogs, setErrorLogs] = useState([]);
  const [errorFilters, setErrorFilters] = useState({
    category: '',
    severity: '',
    resolved: 'false',
  });
  const [errorPagination, setErrorPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    hasMore: false,
  });
  const [expandedErrors, setExpandedErrors] = useState(new Set());
  const [expandedSecurityEvents, setExpandedSecurityEvents] = useState(new Set());
  const [opsSummary, setOpsSummary] = useState(null);
  const [opsEvents, setOpsEvents] = useState([]);
  const [repeatResponses, setRepeatResponses] = useState([]);
  const [opsFilters, setOpsFilters] = useState({
    category: '',
    severity: '',
  });
  const [opsPagination, setOpsPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    hasMore: false,
  });
  const [assistantSummary, setAssistantSummary] = useState(null);
  const [assistantEvents, setAssistantEvents] = useState([]);
  const [assistantFilters, setAssistantFilters] = useState({
    category: '',
    severity: '',
    resolved: 'false',
  });
  const [assistantPagination, setAssistantPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    hasMore: false,
  });
  const [assistantTraceDetail, setAssistantTraceDetail] = useState(null);
  const [assistantTraceOpen, setAssistantTraceOpen] = useState(false);
  const [assistantTraceLoading, setAssistantTraceLoading] = useState(false);
  const [selectedAssistantGroup, setSelectedAssistantGroup] = useState(null);
  const [traceContext, setTraceContext] = useState('assistant');
  const [opsCapabilities, setOpsCapabilities] = useState({
    loaded: false,
    redAlertOpsPanelEnabled: false,
    unifiedResponseTraceEnabled: false,
    operationalIncidentsEnabled: false
  });
  const opsPanelEnabled = opsCapabilities.redAlertOpsPanelEnabled === true;
  const eventTypeLabels = copy.eventTypes.labels;
  const eventTypeDescriptions = copy.eventTypes.descriptions;
  const securityEventFilterKeys = Object.keys(eventTypeLabels).filter((key) => key !== 'sensitive_data_access');
  const errorCategoryLabels = copy.errorCategories;
  const opsCategoryLabels = copy.opsCategories;
  const assistantCategoryLabels = copy.assistantCategories;

  const interpolate = (template, params = {}) => {
    if (!template) return '';
    return String(template).replace(/\{(\w+)\}/g, (_, key) => (
      params[key] !== undefined ? String(params[key]) : `{${key}}`
    ));
  };

  const formatDateTime = (value) => {
    if (!value) return '-';
    return new Date(value).toLocaleString(uiLocale);
  };

  const formatSeverityLabel = (severity) => {
    const key = String(severity || '').toLowerCase();
    return copy.severities[key] || severity || copy.common.unknown;
  };

  const formatGuardrailAction = (action) => {
    const normalized = String(action || '').toUpperCase();
    const translated = copy.traceModal.guardrailActions[normalized];
    if (!normalized) return '-';
    return translated ? `${translated} (${normalized})` : normalized;
  };

  const formatChannel = (channel) => {
    const normalized = String(channel || '').toLowerCase();
    return copy.common.channels[normalized] || channel || copy.common.unknown;
  };

  const formatResponseSource = (source) => {
    const normalized = String(source || '').toLowerCase();
    return copy.traceModal.responseSources[normalized] || source || '-';
  };

  const formatConversationRole = (role) => {
    const normalized = String(role || '').toLowerCase();
    return copy.traceModal.roles[normalized] || role || copy.common.unknown;
  };

  const formatGrounding = (value) => {
    const normalized = String(value || '').toUpperCase();
    return copy.traceModal.groundingValues[normalized] || value || '-';
  };

  const formatMessageType = (value) => {
    const normalized = String(value || '').toLowerCase();
    return copy.traceModal.messageTypes[normalized] || value || '-';
  };

  const getSeverityRank = (severity) => {
    const normalized = String(severity || '').toUpperCase();
    if (normalized === 'CRITICAL') return 4;
    if (normalized === 'HIGH') return 3;
    if (normalized === 'MEDIUM') return 2;
    if (normalized === 'LOW') return 1;
    return 0;
  };

  const getIncidentPriority = (category) => {
    const priorities = {
      ASSISTANT_NEGATIVE_FEEDBACK: 120,
      ASSISTANT_BLOCKED: 110,
      HALLUCINATION_RISK: 105,
      VERIFICATION_INCONSISTENT: 100,
      TOOL_NOT_CALLED_WHEN_EXPECTED: 95,
      TEMPLATE_FALLBACK_USED: 90,
      ASSISTANT_NEEDS_CLARIFICATION: 80,
      ASSISTANT_INTERVENTION: 70,
      ASSISTANT_SANITIZED: 60,
      LLM_BYPASSED: 40,
      ASSISTANT_POSITIVE_FEEDBACK: 30
    };
    return priorities[String(category || '')] || 0;
  };

  const getIncidentDescription = (incident) => {
    if (!incident) return copy.common.unknown;

    const category = String(incident.category || '');
    const details = incident.details && typeof incident.details === 'object' ? incident.details : {};
    const base = copy.assistant.signalDescriptions[category] || incident.summary || assistantCategoryLabels[category] || category;

    if (category === 'ASSISTANT_NEGATIVE_FEEDBACK' && details.comment) {
      return `${base} ${details.comment}`;
    }

    if (category === 'ASSISTANT_INTERVENTION' && details.guardrail_reason) {
      return `${base} ${details.guardrail_reason}`;
    }

    if (category === 'TOOL_NOT_CALLED_WHEN_EXPECTED' && details.tool_selected) {
      return `${base} ${details.tool_selected}`;
    }

    return base;
  };

  const getIncidentAction = (incident) => {
    if (!incident) return copy.common.none;
    return copy.incidentActions?.[incident.category] || copy.common.none;
  };

  const isClarificationLikeTrace = (trace) => {
    const payload = trace?.payload || {};
    const guardrailAction = String(payload?.guardrail?.action || '').toUpperCase();
    const responsePreview = String(trace?.responsePreview || payload?.details?.response_preview || '');
    const responseGrounding = String(payload?.details?.response_grounding || '').toUpperCase();

    return (
      responseGrounding === 'CLARIFICATION'
      || guardrailAction === 'NEED_MIN_INFO_FOR_TOOL'
      || /(teyit|doğrula|dogrula|verify|confirm|rica edebilir miyim|paylaşır mısınız|paylasir misiniz|sipariş numaranızı|siparis numaranizi|son dört han|last four)/i.test(responsePreview)
    );
  };

  const groupedAssistantEvents = useMemo(() => {
    const groups = new Map();

    for (const event of assistantEvents) {
      const groupKey = event.traceId || event.sessionId || event.id;
      const existing = groups.get(groupKey) || {
        id: groupKey,
        traceId: event.traceId || null,
        sessionId: event.sessionId || null,
        channel: event.channel || null,
        createdAt: event.createdAt,
        incidents: [],
        resolved: true
      };

      existing.incidents.push(event);
      existing.resolved = existing.resolved && Boolean(event.resolved);

      if (new Date(event.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
        existing.createdAt = event.createdAt;
      }

      groups.set(groupKey, existing);
    }

    return Array.from(groups.values())
      .map((group) => {
        const incidents = [...group.incidents].sort((a, b) => {
          const severityDiff = getSeverityRank(b.severity) - getSeverityRank(a.severity);
          if (severityDiff !== 0) return severityDiff;
          return getIncidentPriority(b.category) - getIncidentPriority(a.category);
        });

        const categories = [...new Set(incidents.map((incident) => incident.category))];
        const highestSeverity = incidents.reduce((highest, incident) => (
          getSeverityRank(incident.severity) > getSeverityRank(highest) ? incident.severity : highest
        ), incidents[0]?.severity || 'LOW');

        return {
          ...group,
          incidents,
          categories,
          highestSeverity,
          primaryIncident: incidents[0] || null,
          primaryDescription: getIncidentDescription(incidents[0]),
          additionalSignalCount: Math.max(categories.length - 1, 0)
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [assistantEvents, copy]);
  const assistantTraceIdSet = useMemo(() => (
    new Set(
      groupedAssistantEvents
        .map((group) => group.traceId)
        .filter(Boolean)
    )
  ), [groupedAssistantEvents]);
  const visibleOpsEvents = useMemo(() => (
    opsEvents.filter((event) => {
      if (!event.traceId) return true;
      return !assistantTraceIdSet.has(event.traceId);
    })
  ), [assistantTraceIdSet, opsEvents]);

  // Check admin access
  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        const response = await apiClient.get('/api/auth/me');
        if (response.data?.isAdmin === true) {
          setIsAdmin(true);
          const capabilities = await loadRedAlertCapabilities();
          await loadDashboardData(capabilities);
        } else {
          setIsAdmin(false);
          setLoading(false);
        }
      } catch (error) {
        console.error('Failed to check admin access:', error);
        setLoading(false);
      }
    };

    checkAdminAccess();
  }, []);

  const loadRedAlertCapabilities = async () => {
    try {
      const response = await apiClient.get('/api/red-alert/capabilities');
      const nextCapabilities = {
        loaded: true,
        redAlertOpsPanelEnabled: response.data?.redAlertOpsPanelEnabled === true,
        unifiedResponseTraceEnabled: response.data?.unifiedResponseTraceEnabled === true,
        operationalIncidentsEnabled: response.data?.operationalIncidentsEnabled === true
      };
      setOpsCapabilities(nextCapabilities);
      return nextCapabilities;
    } catch (error) {
      console.error('Failed to load Red Alert capabilities:', error);
      const fallbackCapabilities = {
        loaded: true,
        redAlertOpsPanelEnabled: false,
        unifiedResponseTraceEnabled: false,
        operationalIncidentsEnabled: false
      };
      setOpsCapabilities(fallbackCapabilities);
      return fallbackCapabilities;
    }
  };

  // Load all dashboard data
  const loadDashboardData = async (capabilityOverride = opsCapabilities) => {
    setLoading(true);
    try {
      const baseLoads = [
        loadSummary(),
        loadEvents(),
        loadHealth(),
        loadErrorSummary(),
        loadErrorLogs(),
      ];

      if (capabilityOverride?.redAlertOpsPanelEnabled === true) {
        baseLoads.push(
          loadOpsSummary(),
          loadOpsEvents(),
          loadRepeatResponses(),
          loadAssistantSummary(),
          loadAssistantEvents()
        );
      }

      await Promise.all(baseLoads);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
      toast.error(copy.common.refreshFailed);
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    try {
      const response = await apiClient.get('/api/red-alert/summary', {
        params: { hours: filters.hours },
      });
      setSummary(response.data);
    } catch (error) {
      console.error('Failed to load summary:', error);
    }
  };

  const loadEvents = async () => {
    try {
      const response = await apiClient.get('/api/red-alert/events', {
        params: {
          hours: filters.hours,
          severity: filters.severity || undefined,
          type: filters.type || undefined,
          limit: pagination.limit,
          offset: (pagination.page - 1) * pagination.limit,
        },
      });
      setEvents(response.data.events);
      setPagination(prev => ({
        ...prev,
        total: response.data.pagination.total,
        hasMore: response.data.pagination.hasMore,
      }));
    } catch (error) {
      console.error('Failed to load events:', error);
    }
  };

  const loadHealth = async () => {
    try {
      const response = await apiClient.get('/api/red-alert/health');
      setHealth(response.data);
    } catch (error) {
      console.error('Failed to load health:', error);
    }
  };

  const loadOpsSummary = async () => {
    if (!opsPanelEnabled) return;
    try {
      const response = await apiClient.get('/api/red-alert/ops/summary', {
        params: { range: `${filters.hours}h` },
      });
      setOpsSummary(response.data);
    } catch (error) {
      console.error('Failed to load ops summary:', error);
    }
  };

  const loadOpsEvents = async () => {
    if (!opsPanelEnabled) return;
    try {
      const response = await apiClient.get('/api/red-alert/ops/events', {
        params: {
          range: `${filters.hours}h`,
          category: opsFilters.category || undefined,
          severity: opsFilters.severity || undefined,
          limit: opsPagination.limit,
          offset: (opsPagination.page - 1) * opsPagination.limit,
        },
      });
      setOpsEvents(response.data.events || []);
      setOpsPagination(prev => ({
        ...prev,
        total: response.data.pagination?.total || 0,
        hasMore: response.data.pagination?.hasMore || false,
      }));
    } catch (error) {
      console.error('Failed to load ops events:', error);
    }
  };

  const loadRepeatResponses = async () => {
    if (!opsPanelEnabled) return;
    try {
      const response = await apiClient.get('/api/red-alert/ops/repeat-responses', {
        params: { range: `${filters.hours}h` },
      });
      setRepeatResponses(response.data.repeats || []);
    } catch (error) {
      console.error('Failed to load repeat responses:', error);
    }
  };

  const loadAssistantSummary = async () => {
    if (!opsPanelEnabled) return;
    try {
      const response = await apiClient.get('/api/red-alert/assistant/summary', {
        params: { range: `${filters.hours}h` },
      });
      setAssistantSummary(response.data);
    } catch (error) {
      console.error('Failed to load assistant summary:', error);
    }
  };

  const loadAssistantEvents = async () => {
    if (!opsPanelEnabled) return;
    try {
      const response = await apiClient.get('/api/red-alert/assistant/events', {
        params: {
          range: `${filters.hours}h`,
          category: assistantFilters.category || undefined,
          severity: assistantFilters.severity || undefined,
          resolved: assistantFilters.resolved !== '' ? assistantFilters.resolved : undefined,
          limit: assistantPagination.limit,
          offset: (assistantPagination.page - 1) * assistantPagination.limit,
        },
      });
      setAssistantEvents(response.data.events || []);
      setAssistantPagination(prev => ({
        ...prev,
        total: response.data.pagination?.total || 0,
        hasMore: response.data.pagination?.hasMore || false,
      }));
    } catch (error) {
      console.error('Failed to load assistant events:', error);
    }
  };

  const loadAssistantTraceDetail = async (traceId, assistantGroup = null, context = 'assistant') => {
    if (!traceId) return;
    setAssistantTraceLoading(true);
    setSelectedAssistantGroup(assistantGroup);
    setTraceContext(context);
    try {
      const response = await apiClient.get(`/api/red-alert/assistant/trace/${traceId}`);
      setAssistantTraceDetail(response.data);
      setAssistantTraceOpen(true);
    } catch (error) {
      console.error('Failed to load assistant trace detail:', error);
      toast.error(copy.assistant.notifications.traceFailed);
    } finally {
      setAssistantTraceLoading(false);
    }
  };

  const handleResolveAssistantGroup = async (group, resolved) => {
    if (!group?.incidents?.length) return;

    try {
      await Promise.all(
        group.incidents.map((incident) => (
          apiClient.patch(`/api/red-alert/assistant/events/${incident.id}/resolve`, { resolved })
        ))
      );
      toast.success(resolved ? copy.assistant.notifications.resolved : copy.assistant.notifications.reopened);
      loadAssistantEvents();
      loadAssistantSummary();
    } catch (error) {
      console.error('Failed to resolve assistant group:', error);
      toast.error(copy.assistant.notifications.updateFailed);
    }
  };

  const handleResolveOpsEvent = async (eventId, resolved) => {
    try {
      await apiClient.patch(`/api/red-alert/ops/events/${eventId}/resolve`, { resolved });
      toast.success(resolved ? copy.ops.notifications.resolved : copy.ops.notifications.reopened);
      loadOpsEvents();
      loadOpsSummary();
    } catch (error) {
      console.error('Failed to resolve ops event:', error);
      toast.error(copy.ops.notifications.updateFailed);
    }
  };

  // Error Tracking Data Loaders
  const loadErrorSummary = async () => {
    try {
      const response = await apiClient.get('/api/red-alert/errors/summary', {
        params: { hours: filters.hours },
      });
      setErrorSummary(response.data);
    } catch (error) {
      console.error('Failed to load error summary:', error);
    }
  };

  const loadErrorLogs = async () => {
    try {
      const response = await apiClient.get('/api/red-alert/errors', {
        params: {
          hours: filters.hours,
          category: errorFilters.category || undefined,
          severity: errorFilters.severity || undefined,
          resolved: errorFilters.resolved !== '' ? errorFilters.resolved : undefined,
          limit: errorPagination.limit,
          offset: (errorPagination.page - 1) * errorPagination.limit,
        },
      });
      setErrorLogs(response.data.errors);
      setErrorPagination(prev => ({
        ...prev,
        total: response.data.pagination.total,
        hasMore: response.data.pagination.hasMore,
      }));
    } catch (error) {
      console.error('Failed to load error logs:', error);
    }
  };

  const handleResolveError = async (errorId, resolved) => {
    try {
      await apiClient.patch(`/api/red-alert/errors/${errorId}/resolve`, { resolved });
      toast.success(resolved ? copy.errors.notifications.resolved : copy.errors.notifications.reopened);
      loadErrorLogs();
      loadErrorSummary();
      loadHealth();
    } catch (error) {
      console.error('Failed to resolve error:', error);
      toast.error(copy.errors.notifications.updateFailed);
    }
  };

  const toggleErrorExpand = (errorId) => {
    setExpandedErrors(prev => {
      const next = new Set(prev);
      if (next.has(errorId)) next.delete(errorId);
      else next.add(errorId);
      return next;
    });
  };

  const toggleSecurityEventExpand = (eventId) => {
    setExpandedSecurityEvents(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  // Persist preferences
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('redAlertHours', filters.hours.toString());
    }
  }, [filters.hours]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('redAlertPanel', activePanel);
    }
  }, [activePanel]);

  // Reload data when filters change
  useEffect(() => {
    if (isAdmin && opsCapabilities.loaded) {
      loadDashboardData();
    }
  }, [filters.hours, filters.severity, filters.type, isAdmin, opsCapabilities.loaded]);

  useEffect(() => {
    if (['timeline', 'threats'].includes(activePanel)) {
      setActivePanel('events');
      return;
    }

    if (!opsPanelEnabled && activePanel === 'ops') {
      setActivePanel('errors');
    }
  }, [activePanel, opsPanelEnabled]);

  // Reload events when pagination changes
  useEffect(() => {
    if (isAdmin && pagination.page > 1) {
      loadEvents();
    }
  }, [pagination.page]);

  // Reload error logs when error filters or pagination change
  useEffect(() => {
    if (isAdmin) {
      loadErrorLogs();
    }
  }, [errorFilters.category, errorFilters.severity, errorFilters.resolved, errorPagination.page]);

  useEffect(() => {
    if (isAdmin && opsPanelEnabled) {
      loadOpsEvents();
    }
  }, [opsFilters.category, opsFilters.severity, opsPagination.page, isAdmin, opsPanelEnabled]);

  useEffect(() => {
    if (isAdmin && opsPanelEnabled) {
      loadAssistantEvents();
    }
  }, [assistantFilters.category, assistantFilters.severity, assistantFilters.resolved, assistantPagination.page, isAdmin, opsPanelEnabled]);

  if (!isAdmin && !loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {copy.common.accessDenied}
            </CardTitle>
            <CardDescription>
              {copy.common.accessDeniedDesc}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Activity className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">{copy.common.loading}</p>
        </div>
      </div>
    );
  }

  // Nav card helper
  const NavCard = ({ id, icon: Icon, iconColor, title, value, subtitle, borderColor, activeBorderColor }) => {
    const isActive = activePanel === id;
    return (
      <Card
        className={`cursor-pointer transition-all ${
          isActive
            ? `border-2 ${activeBorderColor} shadow-md`
            : `hover:${borderColor}`
        }`}
        onClick={() => setActivePanel(id)}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{value}</div>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </CardContent>
      </Card>
    );
  };

  const unresolvedCount = errorSummary?.summary?.unresolved || 0;
  const totalErrors = unresolvedCount;
  const totalEvents = summary?.summary?.total || 0;
  const opsIncidentCount = (opsSummary?.totals?.incidents || 0) + repeatResponses.length;
  const assistantIncidentCount = assistantSummary?.totals?.unresolved || 0;
  const traceIncidents = assistantTraceDetail?.incidents || [];
  let assistantSignalItems = [];
  if (selectedAssistantGroup?.incidents?.length) {
    assistantSignalItems = selectedAssistantGroup.incidents;
  } else {
    const sourceItems = traceIncidents;
    const clarificationLike = isClarificationLikeTrace(assistantTraceDetail?.trace);

    if (traceContext === 'assistant') {
      assistantSignalItems = sourceItems.filter((incident) => ASSISTANT_PANEL_CATEGORY_KEYS.includes(incident.category));
    } else {
      const opsItems = sourceItems.filter((incident) => OPS_PANEL_CATEGORY_KEYS.includes(incident.category));
      assistantSignalItems = clarificationLike
        ? opsItems.filter((incident) => (
          incident.category !== 'HALLUCINATION_RISK'
          && incident.category !== 'VERIFICATION_INCONSISTENT'
          && incident.category !== 'ASSISTANT_NEEDS_CLARIFICATION'
        ))
        : opsItems;
    }
  }
  const traceModalTitle = traceContext === 'repeat'
    ? copy.ops.repeatTitle
    : traceContext === 'ops'
      ? copy.ops.title
      : copy.traceModal.incidentSummaryTitle;
  const traceModalDescription = traceContext === 'repeat'
    ? copy.ops.repeatDescription
    : traceContext === 'ops'
      ? copy.ops.description
      : copy.traceModal.incidentSummaryDescription;
  const traceHeadline = selectedAssistantGroup?.primaryDescription
    || getIncidentDescription(assistantSignalItems[0]);
  const emptyTraceSignalText = traceContext === 'assistant'
    ? copy.traceModal.noAssistantSignals
    : copy.traceModal.noOpsSignals;
  const traceGuardrailAction = assistantTraceDetail?.trace?.payload?.guardrail?.action;
  const traceGuardrailReason = assistantTraceDetail?.trace?.payload?.guardrail?.reason;
  const traceGrounding = formatGrounding(assistantTraceDetail?.trace?.payload?.details?.response_grounding);
  const traceMessageType = formatMessageType(assistantTraceDetail?.trace?.payload?.details?.message_type);
  const responseMetaItems = [
    { label: copy.traceModal.createdAt, value: formatDateTime(assistantTraceDetail?.trace?.createdAt) },
    { label: copy.traceModal.channel, value: formatChannel(assistantTraceDetail?.trace?.channel) },
    { label: copy.traceModal.responseSource, value: formatResponseSource(assistantTraceDetail?.trace?.responseSource) },
    { label: copy.traceModal.guardrail, value: formatGuardrailAction(traceGuardrailAction) },
    traceGuardrailReason ? { label: copy.traceModal.guardrailReason, value: traceGuardrailReason } : null,
    traceGrounding !== '-' ? { label: copy.traceModal.grounding, value: traceGrounding } : null,
    traceMessageType !== '-' ? { label: copy.traceModal.messageType, value: traceMessageType } : null
  ].filter(Boolean);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header + Time Filter */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Shield className="h-6 w-6 text-red-600" />
            {copy.header.title}
            {health && (
              <Badge className={`${HEALTH_BADGE_COLORS[health.status] || 'bg-muted text-foreground'} ml-2 text-xs`}>
                {health.healthScore}/100
              </Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {copy.header.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={filters.hours.toString()}
            onValueChange={(value) => setFilters(prev => ({ ...prev, hours: parseInt(value) }))}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">{copy.timeRanges.oneHour}</SelectItem>
              <SelectItem value="6">{copy.timeRanges.sixHours}</SelectItem>
              <SelectItem value="24">{copy.timeRanges.twentyFourHours}</SelectItem>
              <SelectItem value="168">{copy.timeRanges.sevenDays}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={async () => {
              const capabilities = await loadRedAlertCapabilities();
              loadDashboardData(capabilities);
            }}
            variant="outline"
            size="sm"
          >
            <Activity className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Navigation Cards — 4 cards */}
      <div className={`grid grid-cols-1 ${opsPanelEnabled ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4 mb-6`}>
        <NavCard
          id="errors"
          icon={Bug}
          iconColor="text-orange-600"
          title={copy.nav.errors.title}
          value={
            <span className="text-orange-600 dark:text-orange-400">{totalErrors}</span>
          }
          subtitle={
            unresolvedCount > 0
              ? <span className="text-red-500 font-medium">{interpolate(copy.nav.errors.unresolved, { count: unresolvedCount })}</span>
              : copy.nav.errors.none
          }
          activeBorderColor="border-orange-500 dark:border-orange-400"
          borderColor="border-orange-300"
        />
        <NavCard
          id="events"
          icon={Eye}
          iconColor="text-blue-600"
          title={copy.nav.events.title}
          value={totalEvents}
          subtitle={
            summary?.summary?.critical > 0
              ? <span className="text-red-500 font-medium">{interpolate(copy.nav.events.critical, { count: summary.summary.critical })}</span>
              : copy.nav.events.none
          }
          activeBorderColor="border-blue-500 dark:border-blue-400"
          borderColor="border-blue-300"
        />
        <NavCard
          id="assistant"
          icon={Sparkles}
          iconColor="text-fuchsia-600"
          title={copy.nav.assistant.title}
          value={assistantIncidentCount}
          subtitle={
            opsPanelEnabled
              ? (
                assistantIncidentCount > 0
                  ? interpolate(copy.nav.assistant.unresolved, { count: assistantIncidentCount })
                  : copy.nav.assistant.none
              )
              : copy.nav.assistant.disabled
          }
          activeBorderColor="border-fuchsia-500 dark:border-fuchsia-400"
          borderColor="border-fuchsia-300"
        />
        {opsPanelEnabled && (
          <NavCard
            id="ops"
            icon={Activity}
            iconColor="text-emerald-600"
            title={copy.nav.ops.title}
            value={opsIncidentCount}
            subtitle={copy.nav.ops.subtitle}
            activeBorderColor="border-emerald-500 dark:border-emerald-400"
            borderColor="border-emerald-300"
          />
        )}
      </div>

      {/* ═══════════ Panel: Uygulama Hataları ═══════════ */}
      {activePanel === 'errors' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Bug className="h-5 w-5" />
                  {copy.errors.title}
                </CardTitle>
                <CardDescription className="mt-1">
                  {copy.errors.description}
                </CardDescription>
              </div>
            </div>
            <div className="flex gap-4 mt-4">
              <Select
                value={errorFilters.category || 'all'}
                onValueChange={(value) => {
                  setErrorFilters(prev => ({ ...prev, category: value === 'all' ? '' : value }));
                  setErrorPagination(prev => ({ ...prev, page: 1 }));
                }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder={copy.filters.allCategories} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{copy.filters.allCategories}</SelectItem>
                  {Object.entries(errorCategoryLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={errorFilters.severity || 'all'}
                onValueChange={(value) => {
                  setErrorFilters(prev => ({ ...prev, severity: value === 'all' ? '' : value }));
                  setErrorPagination(prev => ({ ...prev, page: 1 }));
                }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder={copy.filters.allSeverities} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{copy.filters.allSeverities}</SelectItem>
                  <SelectItem value="medium">{copy.severities.medium}</SelectItem>
                  <SelectItem value="high">{copy.severities.high}</SelectItem>
                  <SelectItem value="critical">{copy.severities.critical}</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={errorFilters.resolved !== '' ? errorFilters.resolved : 'all'}
                onValueChange={(value) => {
                  setErrorFilters(prev => ({ ...prev, resolved: value === 'all' ? '' : value }));
                  setErrorPagination(prev => ({ ...prev, page: 1 }));
                }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder={copy.filters.allStatuses} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{copy.filters.allStatuses}</SelectItem>
                  <SelectItem value="false">{copy.filters.unresolvedOnly}</SelectItem>
                  <SelectItem value="true">{copy.filters.resolvedOnly}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>{copy.errors.table.lastSeen}</TableHead>
                  <TableHead>{copy.errors.table.category}</TableHead>
                  <TableHead>{copy.errors.table.severity}</TableHead>
                  <TableHead>{copy.errors.table.source}</TableHead>
                  <TableHead>{copy.errors.table.message}</TableHead>
                  <TableHead className="text-center">{copy.errors.table.repeat}</TableHead>
                  <TableHead>{copy.errors.table.status}</TableHead>
                  <TableHead>{copy.errors.table.action}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errorLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      {copy.errors.empty}
                    </TableCell>
                  </TableRow>
                ) : (
                  errorLogs.map((err) => {
                    const CategoryIcon = ERROR_CATEGORY_ICONS[err.category] || AlertCircle;
                    const isExpanded = expandedErrors.has(err.id);
                    return (
                      <React.Fragment key={err.id}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => toggleErrorExpand(err.id)}
                        >
                          <TableCell>
                            {isExpanded
                              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            }
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {formatDateTime(err.lastSeenAt)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <CategoryIcon className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs">{errorCategoryLabels[err.category] || err.category}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={SEVERITY_COLORS[err.severity]}>
                              {formatSeverityLabel(err.severity)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs">{err.source}</code>
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-xs" title={err.message}>
                            {err.message}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="font-mono">
                              {err.occurrenceCount}x
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {err.resolved ? (
                              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                {copy.common.resolved}
                              </Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                {copy.common.open}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleResolveError(err.id, !err.resolved);
                              }}
                              title={err.resolved ? copy.errors.actions.reopen : copy.errors.actions.resolve}
                            >
                              {err.resolved ? (
                                <XCircle className="h-4 w-4 text-red-500" />
                              ) : (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={9} className="bg-muted/30 p-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-3">
                                {err.toolName && (
                                  <div>
                                    <span className="text-muted-foreground">{copy.errors.detail.tool}:</span>{' '}
                                    <code>{err.toolName}</code>
                                  </div>
                                )}
                                {err.externalService && (
                                  <div>
                                    <span className="text-muted-foreground">{copy.errors.detail.service}:</span>{' '}
                                    <code>{err.externalService}</code>
                                    {err.externalStatus && <span className="ml-1">({err.externalStatus})</span>}
                                  </div>
                                )}
                                {err.endpoint && (
                                  <div>
                                    <span className="text-muted-foreground">{copy.errors.detail.endpoint}:</span>{' '}
                                    <code>{err.method} {err.endpoint}</code>
                                  </div>
                                )}
                                {err.errorCode && (
                                  <div>
                                    <span className="text-muted-foreground">{copy.errors.detail.code}:</span>{' '}
                                    <code>{err.errorCode}</code>
                                  </div>
                                )}
                                {err.businessId && (
                                  <div>
                                    <span className="text-muted-foreground">{copy.errors.detail.business}:</span>{' '}
                                    {err.businessId}
                                  </div>
                                )}
                                {err.requestId && (
                                  <div>
                                    <span className="text-muted-foreground">{copy.errors.detail.request}:</span>{' '}
                                    <code className="text-xs">{err.requestId}</code>
                                  </div>
                                )}
                                <div>
                                  <span className="text-muted-foreground">{copy.errors.detail.firstSeen}:</span>{' '}
                                  {formatDateTime(err.firstSeenAt)}
                                </div>
                                {err.responseTimeMs && (
                                  <div>
                                    <span className="text-muted-foreground">{copy.errors.detail.responseTime}:</span>{' '}
                                    {err.responseTimeMs}ms
                                  </div>
                                )}
                              </div>
                              {err.stackTrace && (
                                <div>
                                  <div className="text-xs text-muted-foreground mb-1">{copy.errors.detail.stackTrace}:</div>
                                  <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
                                    {err.stackTrace}
                                  </pre>
                                </div>
                              )}
                              {err.resolvedBy && (
                                <div className="text-xs mt-2 text-muted-foreground">
                                  {interpolate(copy.errors.detail.resolvedBy, {
                                    user: err.resolvedBy,
                                    date: formatDateTime(err.resolvedAt)
                                  })}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>

            {/* Error Pagination */}
            {errorPagination.total > errorPagination.limit && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  {interpolate(copy.errors.pagination, {
                    start: ((errorPagination.page - 1) * errorPagination.limit) + 1,
                    end: Math.min(errorPagination.page * errorPagination.limit, errorPagination.total),
                    total: errorPagination.total
                  })}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setErrorPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    disabled={errorPagination.page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {copy.common.previous}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setErrorPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    disabled={!errorPagination.hasMore}
                  >
                    {copy.common.next}
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════ Panel: Güvenlik Olayları ═══════════ */}
      {activePanel === 'events' && (
        <Card>
          <CardHeader>
            <CardTitle>{copy.securityEvents.title}</CardTitle>
            <CardDescription>
              {copy.securityEvents.description}
            </CardDescription>
            <div className="flex gap-4 mt-4">
              <Select
                value={filters.severity || 'all'}
                onValueChange={(value) => setFilters(prev => ({ ...prev, severity: value === 'all' ? '' : value }))}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder={copy.filters.allSeverities} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{copy.filters.allSeverities}</SelectItem>
                  <SelectItem value="low">{copy.severities.low}</SelectItem>
                  <SelectItem value="medium">{copy.severities.medium}</SelectItem>
                  <SelectItem value="high">{copy.severities.high}</SelectItem>
                  <SelectItem value="critical">{copy.severities.critical}</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filters.type || 'all'}
                onValueChange={(value) => setFilters(prev => ({ ...prev, type: value === 'all' ? '' : value }))}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder={copy.filters.allEventTypes} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{copy.filters.allEventTypes}</SelectItem>
                  {securityEventFilterKeys.map((key) => (
                    <SelectItem key={key} value={key}>{eventTypeLabels[key]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>{copy.securityEvents.table.time}</TableHead>
                  <TableHead>{copy.securityEvents.table.type}</TableHead>
                  <TableHead>{copy.securityEvents.table.severity}</TableHead>
                  <TableHead>{copy.securityEvents.table.source}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      {copy.securityEvents.empty}
                    </TableCell>
                  </TableRow>
                ) : (
                  events.map((event) => {
                    const isExpanded = expandedSecurityEvents.has(event.id);
                    return (
                      <React.Fragment key={event.id}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => toggleSecurityEventExpand(event.id)}
                        >
                          <TableCell>
                            {isExpanded
                              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            }
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {formatDateTime(event.createdAt)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {eventTypeLabels[event.type] || event.type}
                          </TableCell>
                          <TableCell>
                            <Badge className={SEVERITY_COLORS[event.severity]}>
                              {formatSeverityLabel(event.severity)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="font-mono">{event.method || '-'} {event.endpoint || '-'}</div>
                            <div className="text-muted-foreground">{event.ipAddress || '-'}</div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={5} className="bg-muted/30 p-4">
                              <div className="space-y-3 text-xs">
                                <div className="rounded-lg border bg-background/60 p-3">
                                  <div className="font-medium mb-1">{copy.securityEvents.explanationTitle}</div>
                                  <div className="text-muted-foreground">
                                    {eventTypeDescriptions[event.type] || copy.securityEvents.explanationFallback}
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  <div>
                                    <span className="text-muted-foreground">{copy.securityEvents.table.endpoint}:</span>{' '}
                                    <code>{event.endpoint || '-'}</code>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">{copy.securityEvents.table.method}:</span>{' '}
                                    <code>{event.method || '-'}</code>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">{copy.securityEvents.table.httpStatus}:</span>{' '}
                                    <code>{event.statusCode || '-'}</code>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">{copy.securityEvents.table.ip}:</span>{' '}
                                    <code>{event.ipAddress || '-'}</code>
                                  </div>
                                </div>
                                {event.userAgent && (
                                  <div>
                                    <div className="text-muted-foreground mb-1">{copy.securityEvents.userAgent}</div>
                                    <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 overflow-x-auto">{event.userAgent}</pre>
                                  </div>
                                )}
                                {event.details && (
                                  <div>
                                    <div className="text-muted-foreground mb-1">{copy.securityEvents.technicalDetail}</div>
                                    <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 overflow-x-auto">
                                      {JSON.stringify(event.details, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {pagination.total > pagination.limit && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  {interpolate(copy.securityEvents.pagination, {
                    start: ((pagination.page - 1) * pagination.limit) + 1,
                    end: Math.min(pagination.page * pagination.limit, pagination.total),
                    total: pagination.total
                  })}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    disabled={pagination.page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {copy.common.previous}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    disabled={!pagination.hasMore}
                  >
                    {copy.common.next}
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activePanel === 'assistant' && !opsPanelEnabled && (
        <Card>
          <CardHeader>
            <CardTitle>{copy.assistantUnavailable.title}</CardTitle>
            <CardDescription>
              {copy.assistantUnavailable.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {copy.assistantUnavailable.body}
            </p>
            <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span>{copy.assistantUnavailable.trace}</span>
                <Badge variant={opsCapabilities.unifiedResponseTraceEnabled ? 'default' : 'outline'}>
                  {opsCapabilities.unifiedResponseTraceEnabled ? copy.common.enabled : copy.common.disabled}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>{copy.assistantUnavailable.incidents}</span>
                <Badge variant={opsCapabilities.operationalIncidentsEnabled ? 'default' : 'outline'}>
                  {opsCapabilities.operationalIncidentsEnabled ? copy.common.enabled : copy.common.disabled}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>{copy.assistantUnavailable.panel}</span>
                <Badge variant={opsCapabilities.redAlertOpsPanelEnabled ? 'default' : 'outline'}>
                  {opsCapabilities.redAlertOpsPanelEnabled ? copy.common.enabled : copy.common.disabled}
                </Badge>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {copy.assistantUnavailable.envHint}:{' '}
              <code>FEATURE_UNIFIED_RESPONSE_TRACE=true</code>, <code>FEATURE_OPERATIONAL_INCIDENTS=true</code>, <code>FEATURE_REDALERT_OPS_PANEL=true</code>.
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════ Panel: Operasyonel Olaylar ═══════════ */}
      {opsPanelEnabled && activePanel === 'assistant' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{copy.assistant.highlightTitle}</CardTitle>
              <CardDescription>
                {copy.assistant.highlightDescription}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-muted-foreground">{copy.assistant.metrics.blocked}</div>
                  <div className="mt-1 text-2xl font-bold text-red-600">{assistantSummary?.cards?.blockedRate ?? 0}%</div>
                  <div className="text-xs text-muted-foreground">{assistantSummary?.counts?.blocked ?? 0} {copy.assistant.metrics.turn}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-muted-foreground">{copy.assistant.metrics.sanitize}</div>
                  <div className="mt-1 text-2xl font-bold text-amber-600">{assistantSummary?.cards?.sanitizeRate ?? 0}%</div>
                  <div className="text-xs text-muted-foreground">{assistantSummary?.counts?.sanitized ?? 0} {copy.assistant.metrics.turn}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-muted-foreground">{copy.assistant.metrics.fallback}</div>
                  <div className="mt-1 text-2xl font-bold text-yellow-600">{assistantSummary?.cards?.fallbackRate ?? 0}%</div>
                  <div className="text-xs text-muted-foreground">{assistantSummary?.counts?.fallback ?? 0} {copy.assistant.metrics.turn}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-muted-foreground">{copy.assistant.metrics.intervention}</div>
                  <div className="mt-1 text-2xl font-bold text-blue-600">{assistantSummary?.cards?.interventionRate ?? 0}%</div>
                  <div className="text-xs text-muted-foreground">{assistantSummary?.counts?.intervention ?? 0} {copy.assistant.metrics.turn}</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-muted-foreground">{copy.assistant.metrics.negativeFeedback}</div>
                  <div className="mt-1 text-2xl font-bold text-fuchsia-600">{assistantSummary?.counts?.negativeFeedback ?? 0}</div>
                  <div className="text-xs text-muted-foreground">{assistantSummary?.cards?.negativeFeedbackRate ?? 0}% {copy.assistant.metrics.feedback}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{copy.assistant.title}</CardTitle>
              <CardDescription>
                {copy.assistant.description}
              </CardDescription>
              <div className="flex gap-4 mt-4 flex-wrap">
                <Select
                  value={assistantFilters.category || 'all'}
                  onValueChange={(value) => {
                    setAssistantFilters(prev => ({ ...prev, category: value === 'all' ? '' : value }));
                    setAssistantPagination(prev => ({ ...prev, page: 1 }));
                  }}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder={copy.filters.allCategories} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{copy.filters.allCategories}</SelectItem>
                    {ASSISTANT_PANEL_CATEGORY_KEYS.map((key) => (
                      <SelectItem key={key} value={key}>{assistantCategoryLabels[key] || key}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={assistantFilters.severity || 'all'}
                  onValueChange={(value) => {
                    setAssistantFilters(prev => ({ ...prev, severity: value === 'all' ? '' : value }));
                    setAssistantPagination(prev => ({ ...prev, page: 1 }));
                  }}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder={copy.filters.allSeverities} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{copy.filters.allSeverities}</SelectItem>
                    <SelectItem value="LOW">{copy.severities.low}</SelectItem>
                    <SelectItem value="MEDIUM">{copy.severities.medium}</SelectItem>
                    <SelectItem value="HIGH">{copy.severities.high}</SelectItem>
                    <SelectItem value="CRITICAL">{copy.severities.critical}</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={assistantFilters.resolved !== '' ? assistantFilters.resolved : 'all'}
                  onValueChange={(value) => {
                    setAssistantFilters(prev => ({ ...prev, resolved: value === 'all' ? '' : value }));
                    setAssistantPagination(prev => ({ ...prev, page: 1 }));
                  }}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder={copy.filters.allStatuses} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{copy.filters.allStatuses}</SelectItem>
                    <SelectItem value="false">{copy.filters.unresolvedOnly}</SelectItem>
                    <SelectItem value="true">{copy.filters.resolvedOnly}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{copy.assistant.table.time}</TableHead>
                    <TableHead>{copy.assistant.table.summary}</TableHead>
                    <TableHead>{copy.assistant.table.signals}</TableHead>
                    <TableHead>{copy.assistant.table.severity}</TableHead>
                    <TableHead>{copy.assistant.table.status}</TableHead>
                    <TableHead>{copy.assistant.table.action}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedAssistantEvents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        {copy.assistant.empty}
                      </TableCell>
                    </TableRow>
                  ) : (
                    groupedAssistantEvents.map((group) => (
                      <TableRow key={group.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          <div>{formatDateTime(group.createdAt)}</div>
                          <div className="text-[11px] text-muted-foreground mt-1">
                            {formatChannel(group.channel)}{group.sessionId ? ` • ${group.sessionId.slice(0, 14)}...` : ''}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-sm">
                          <div className="text-sm font-medium leading-5">
                            {group.primaryDescription}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <div className="flex flex-wrap gap-1.5">
                            {group.categories.slice(0, 2).map((category) => (
                              <Badge key={category} variant="outline" className="text-[11px]">
                                {assistantCategoryLabels[category] || category}
                              </Badge>
                            ))}
                            {group.additionalSignalCount > 0 && (
                              <Badge variant="outline" className="text-[11px]">
                                {interpolate(copy.assistant.additionalSignals, { count: group.additionalSignalCount })}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="w-28">
                          <Badge className={SEVERITY_COLORS[(group.highestSeverity || '').toLowerCase()] || 'bg-muted text-foreground'}>
                            {formatSeverityLabel(group.highestSeverity)}
                          </Badge>
                        </TableCell>
                        <TableCell className="w-28">
                          {group.resolved ? (
                            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              {copy.common.resolved}
                            </Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                              {copy.common.open}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="w-28">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => loadAssistantTraceDetail(group.traceId, group, 'assistant')}
                              disabled={!group.traceId || assistantTraceLoading}
                              title={copy.assistant.actions.viewTrace}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleResolveAssistantGroup(group, !group.resolved)}
                              title={group.resolved ? copy.assistant.actions.reopen : copy.assistant.actions.resolve}
                            >
                              {group.resolved ? (
                                <XCircle className="h-4 w-4 text-red-500" />
                              ) : (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {assistantPagination.total > assistantPagination.limit && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    {interpolate(copy.assistant.pagination, {
                      start: ((assistantPagination.page - 1) * assistantPagination.limit) + 1,
                      end: Math.min(assistantPagination.page * assistantPagination.limit, assistantPagination.total),
                      total: assistantPagination.total
                    })}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAssistantPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                      disabled={assistantPagination.page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      {copy.common.previous}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAssistantPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                      disabled={!assistantPagination.hasMore}
                    >
                      {copy.common.next}
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {opsPanelEnabled && activePanel === 'ops' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{copy.ops.metrics.bypassRate}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {opsSummary?.cards?.bypassRate ?? 0}%
                </div>
                <p className="text-xs text-muted-foreground">{copy.ops.metrics.bypassHint}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{copy.ops.metrics.repeatRate}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  {opsSummary?.cards?.repeatRate ?? 0}%
                </div>
                <p className="text-xs text-muted-foreground">{copy.ops.metrics.repeatHint}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{copy.ops.metrics.toolSuccess}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600">
                  {opsSummary?.cards?.toolSuccessRate ?? 0}%
                </div>
                <p className="text-xs text-muted-foreground">{copy.ops.metrics.toolSuccessHint}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{copy.ops.repeatTitle}</CardTitle>
              <CardDescription>
                {copy.ops.repeatDescription}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{copy.ops.table.time}</TableHead>
                    <TableHead>{copy.ops.table.channel}</TableHead>
                    <TableHead>{copy.ops.table.session}</TableHead>
                    <TableHead>{copy.ops.table.count}</TableHead>
                    <TableHead>{copy.ops.table.sample}</TableHead>
                    <TableHead>{copy.ops.table.trace}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {repeatResponses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        {copy.ops.repeatEmpty}
                      </TableCell>
                    </TableRow>
                  ) : (
                    repeatResponses.map((item) => (
                      <TableRow key={`${item.responseHash}-${item.channel}-${item.sessionId || 'no-session'}`}>
                        <TableCell className="whitespace-nowrap text-xs">{formatDateTime(item.latestAt)}</TableCell>
                        <TableCell>{formatChannel(item.channel)}</TableCell>
                        <TableCell className="font-mono text-xs">{item.sessionId ? `${item.sessionId.slice(0, 12)}...` : '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">{item.count}</Badge>
                        </TableCell>
                        <TableCell className="max-w-md truncate" title={item.sample || ''}>
                          {item.sample || '-'}
                        </TableCell>
                        <TableCell>
                          {item.latestTraceId ? (
                            <button
                              type="button"
                              className="text-blue-600 hover:underline text-sm"
                              onClick={() => loadAssistantTraceDetail(item.latestTraceId, null, 'repeat')}
                            >
                              {copy.ops.actions.viewTrace}
                            </button>
                          ) : '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{copy.ops.title}</CardTitle>
                  <CardDescription>{copy.ops.description}</CardDescription>
                </div>
              </div>
              <div className="flex gap-4 mt-4">
                <Select
                  value={opsFilters.category || 'all'}
                  onValueChange={(value) => {
                    setOpsFilters(prev => ({ ...prev, category: value === 'all' ? '' : value }));
                    setOpsPagination(prev => ({ ...prev, page: 1 }));
                  }}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder={copy.filters.allCategories} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{copy.filters.allCategories}</SelectItem>
                    {OPS_PANEL_CATEGORY_KEYS.map((key) => (
                      <SelectItem key={key} value={key}>{opsCategoryLabels[key] || key}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={opsFilters.severity || 'all'}
                  onValueChange={(value) => {
                    setOpsFilters(prev => ({ ...prev, severity: value === 'all' ? '' : value }));
                    setOpsPagination(prev => ({ ...prev, page: 1 }));
                  }}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder={copy.filters.allSeverities} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{copy.filters.allSeverities}</SelectItem>
                    <SelectItem value="LOW">{copy.severities.low}</SelectItem>
                    <SelectItem value="MEDIUM">{copy.severities.medium}</SelectItem>
                    <SelectItem value="HIGH">{copy.severities.high}</SelectItem>
                    <SelectItem value="CRITICAL">{copy.severities.critical}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                <TableRow>
                  <TableHead>{copy.ops.table.time}</TableHead>
                  <TableHead>{copy.ops.table.category}</TableHead>
                  <TableHead>{copy.ops.table.summary}</TableHead>
                  <TableHead>{copy.ops.table.severity}</TableHead>
                  <TableHead>{copy.ops.table.status}</TableHead>
                  <TableHead>{copy.ops.table.action}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleOpsEvents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        {copy.ops.eventsEmpty}
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleOpsEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        <div>{formatDateTime(event.createdAt)}</div>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          {formatChannel(event.channel)}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {opsCategoryLabels[event.category] || event.category}
                      </TableCell>
                      <TableCell className="max-w-md">
                        <div className="text-sm leading-5" title={getIncidentDescription(event)}>
                          {getIncidentDescription(event)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={SEVERITY_COLORS[(event.severity || '').toLowerCase()] || 'bg-muted text-foreground'}>
                          {formatSeverityLabel(event.severity)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {event.resolved ? (
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            {copy.common.resolved}
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                            {copy.common.open}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="w-28">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => loadAssistantTraceDetail(event.traceId, null, 'ops')}
                            disabled={!event.traceId || assistantTraceLoading}
                            title={copy.ops.actions.viewTrace}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResolveOpsEvent(event.id, !event.resolved)}
                            title={event.resolved ? copy.ops.actions.reopen : copy.ops.actions.resolve}
                          >
                            {event.resolved ? (
                              <XCircle className="h-4 w-4 text-red-500" />
                            ) : (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {opsPagination.total > opsPagination.limit && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    {interpolate(copy.ops.pagination, {
                      start: ((opsPagination.page - 1) * opsPagination.limit) + 1,
                      end: Math.min(opsPagination.page * opsPagination.limit, opsPagination.total),
                      total: opsPagination.total
                    })}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setOpsPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                      disabled={opsPagination.page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      {copy.common.previous}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setOpsPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                      disabled={!opsPagination.hasMore}
                    >
                      {copy.common.next}
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog
        open={assistantTraceOpen}
        onOpenChange={(open) => {
          setAssistantTraceOpen(open);
          if (!open) {
            setSelectedAssistantGroup(null);
          }
        }}
      >
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{copy.traceModal.title}</DialogTitle>
          </DialogHeader>

          {assistantTraceDetail?.trace ? (
            <div className="space-y-6">
              {assistantSignalItems.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{traceModalTitle}</CardTitle>
                    {traceModalDescription ? (
                      <CardDescription>{traceModalDescription}</CardDescription>
                    ) : null}
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {assistantSignalItems.map((incident) => (
                      <div key={incident.id} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">{assistantCategoryLabels[incident.category] || incident.category}</Badge>
                            </div>
                            <div className="mt-2 text-sm leading-6">
                              {getIncidentDescription(incident)}
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              {getIncidentAction(incident)}
                            </div>
                            {(incident.details?.reason || incident.details?.comment || incident.details?.guardrail_reason) && (
                              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                {incident.details?.reason && (
                                  <div>{copy.traceModal.reason}: <code>{incident.details.reason}</code></div>
                                )}
                                {incident.details?.guardrail_reason && (
                                  <div>{copy.traceModal.guardrailReason}: <code>{incident.details.guardrail_reason}</code></div>
                                )}
                                {incident.details?.comment && (
                                  <div className="whitespace-pre-wrap">{copy.traceModal.comment}: {incident.details.comment}</div>
                                )}
                              </div>
                            )}
                          </div>
                          <Badge className={SEVERITY_COLORS[(incident.severity || '').toLowerCase()] || 'bg-muted text-foreground'}>
                            {formatSeverityLabel(incident.severity)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{copy.traceModal.responsePreview}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-md border bg-muted/30 p-3 whitespace-pre-wrap text-sm">
                    {assistantTraceDetail.trace.responsePreview || assistantTraceDetail.trace.payload?.details?.response_preview || '-'}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    {responseMetaItems.map((item) => (
                      <div key={`${item.label}-${item.value}`}>
                        <div className="text-muted-foreground text-xs">{item.label}</div>
                        <div className="break-words">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{copy.traceModal.technicalDetails}</CardTitle>
                  <CardDescription>{copy.traceModal.technicalDescription}</CardDescription>
                </CardHeader>
                <CardContent>
                  <details className="rounded-lg border bg-muted/10 p-4">
                    <summary className="cursor-pointer text-sm font-medium">{copy.common.details}</summary>
                    <div className="mt-4 space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground text-xs">{copy.traceModal.trace}</div>
                          <div className="font-mono text-xs break-all">{assistantTraceDetail.trace.traceId}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs">{copy.traceModal.session}</div>
                          <div className="font-mono text-xs break-all">{assistantTraceDetail.trace.sessionId || '-'}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs">{copy.traceModal.latency}</div>
                          <div>{assistantTraceDetail.trace.latencyMs || 0} ms</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs">{copy.traceModal.llmUsed}</div>
                          <div>{assistantTraceDetail.trace.llmUsed ? copy.common.yes : copy.common.no}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs">{copy.traceModal.toolsCalled}</div>
                          <div>{assistantTraceDetail.trace.toolsCalledCount || 0}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs">{copy.traceModal.toolSuccess}</div>
                          <div>{assistantTraceDetail.trace.toolSuccess ? copy.common.yes : copy.common.no}</div>
                        </div>
                      </div>

                      <div className="text-sm">
                        <div className="text-muted-foreground text-xs mb-1">{copy.traceModal.postprocessors}</div>
                        <div className="flex flex-wrap gap-2">
                          {(assistantTraceDetail.trace.payload?.postprocessors_applied || []).length === 0 ? (
                            <Badge variant="outline">{copy.common.none}</Badge>
                          ) : (
                            (assistantTraceDetail.trace.payload?.postprocessors_applied || []).map((item) => (
                              <Badge key={item} variant="outline">{item}</Badge>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="text-sm">
                        <div className="text-muted-foreground text-xs mb-1">{copy.traceModal.tools}</div>
                        <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
                          {JSON.stringify(assistantTraceDetail.trace.payload?.tools_called || [], null, 2)}
                        </pre>
                      </div>
                    </div>
                  </details>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{copy.traceModal.conversationSnapshot}</CardTitle>
                      <CardDescription>
                        {copy.traceModal.conversationDescription}
                      </CardDescription>
                    </div>
                    {assistantTraceDetail.chatLog?.id && (
                      <a
                        href={`/dashboard/chat-history?chatId=${assistantTraceDetail.chatLog.id}`}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {copy.traceModal.openChatHistory}
                      </a>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {assistantTraceDetail.chatLog?.messages?.length ? (
                    <div className="space-y-3 max-h-[360px] overflow-y-auto">
                      {assistantTraceDetail.chatLog.messages.map((message, index) => (
                        <div
                          key={`${message.role || 'msg'}-${index}`}
                          className={`rounded-xl px-4 py-3 text-sm ${
                            message.role === 'user'
                              ? 'ml-10 border border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-50'
                              : 'mr-10 border bg-muted text-foreground'
                          }`}
                        >
                          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                            {formatConversationRole(message.role)}
                          </div>
                          <div className="whitespace-pre-wrap">{message.content || '-'}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">{copy.traceModal.noChatLog}</div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {assistantTraceLoading ? copy.traceModal.loading : copy.traceModal.notFound}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
