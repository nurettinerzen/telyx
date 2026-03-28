'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Shield, AlertTriangle, AlertCircle, Activity,
  Clock, Server, Eye, ChevronLeft, ChevronRight,
  Bug, Wrench, MessageSquare, Globe, CheckCircle, XCircle, ChevronDown, ChevronUp, Sparkles
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { toast } from 'sonner';
import { LineChart } from '@/components/charts/LineChart';
import { BarChart } from '@/components/charts/BarChart';

const SEVERITY_COLORS = {
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const HEALTH_STATUS_COLORS = {
  healthy: 'text-green-600 dark:text-green-400',
  caution: 'text-yellow-600 dark:text-yellow-400',
  warning: 'text-orange-600 dark:text-orange-400',
  critical: 'text-red-600 dark:text-red-400',
};

const EVENT_TYPE_LABELS = {
  auth_failure: 'Auth Failure',
  cross_tenant_attempt: 'Cross-Tenant Attempt',
  firewall_block: 'Firewall Block',
  content_safety_block: 'Content Safety Block',
  ssrf_block: 'SSRF Block',
  rate_limit_hit: 'Rate Limit Hit',
  webhook_invalid_signature: 'Webhook Invalid Signature',
  pii_leak_block: 'PII Leak Block',
};

const ERROR_CATEGORY_LABELS = {
  tool_failure: 'Tool Failure',
  chat_error: 'Chat Error',
  assistant_error: 'Assistant Error',
  api_error: 'External API Error',
  system_error: 'System Error',
  webhook_error: 'Webhook Error',
};

const ERROR_CATEGORY_ICONS = {
  tool_failure: Wrench,
  chat_error: MessageSquare,
  assistant_error: Server,
  api_error: Globe,
  system_error: AlertCircle,
  webhook_error: Activity,
};

const OPS_CATEGORY_LABELS = {
  LLM_BYPASSED: 'LLM Bypassed',
  TEMPLATE_FALLBACK_USED: 'Template/Fallback',
  TOOL_NOT_CALLED_WHEN_EXPECTED: 'Tool Not Called',
  VERIFICATION_INCONSISTENT: 'Verification Drift',
  HALLUCINATION_RISK: 'Hallucination Risk',
  RESPONSE_STUCK: 'Response Stuck',
};

const ASSISTANT_CATEGORY_LABELS = {
  ASSISTANT_BLOCKED: 'Blocked',
  ASSISTANT_SANITIZED: 'Sanitized',
  ASSISTANT_NEEDS_CLARIFICATION: 'Needs Clarification',
  ASSISTANT_INTERVENTION: 'Intervention',
  ASSISTANT_NEGATIVE_FEEDBACK: 'Negative Feedback',
  ASSISTANT_POSITIVE_FEEDBACK: 'Positive Feedback',
  LLM_BYPASSED: 'LLM Bypassed',
  TEMPLATE_FALLBACK_USED: 'Fallback Used',
  TOOL_NOT_CALLED_WHEN_EXPECTED: 'Tool Skipped',
  VERIFICATION_INCONSISTENT: 'Verification Drift',
  HALLUCINATION_RISK: 'Hallucination Risk',
  RESPONSE_STUCK: 'Response Stuck',
};


export default function RedAlertPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [topThreats, setTopThreats] = useState({ topIPs: [], topEndpoints: [] });
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
    resolved: '',
  });
  const [errorPagination, setErrorPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    hasMore: false,
  });
  const [expandedErrors, setExpandedErrors] = useState(new Set());
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
    resolved: '',
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
  const [opsCapabilities, setOpsCapabilities] = useState({
    loaded: false,
    redAlertOpsPanelEnabled: false,
    unifiedResponseTraceEnabled: false,
    operationalIncidentsEnabled: false
  });
  const opsPanelEnabled = opsCapabilities.redAlertOpsPanelEnabled === true;

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
        loadTimeline(),
        loadTopThreats(),
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
      toast.error('Güvenlik paneli yüklenemedi');
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

  const loadTimeline = async () => {
    try {
      const response = await apiClient.get('/api/red-alert/timeline', {
        params: { hours: filters.hours },
      });
      setTimeline(response.data.timeline);
    } catch (error) {
      console.error('Failed to load timeline:', error);
    }
  };

  const loadTopThreats = async () => {
    try {
      const response = await apiClient.get('/api/red-alert/top-threats', {
        params: { hours: filters.hours },
      });
      setTopThreats(response.data);
    } catch (error) {
      console.error('Failed to load top threats:', error);
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

  const loadAssistantTraceDetail = async (traceId) => {
    if (!traceId) return;
    setAssistantTraceLoading(true);
    try {
      const response = await apiClient.get(`/api/red-alert/assistant/trace/${traceId}`);
      setAssistantTraceDetail(response.data);
      setAssistantTraceOpen(true);
    } catch (error) {
      console.error('Failed to load assistant trace detail:', error);
      toast.error('Trace detayi yuklenemedi');
    } finally {
      setAssistantTraceLoading(false);
    }
  };

  const handleResolveAssistantEvent = async (eventId, resolved) => {
    try {
      await apiClient.patch(`/api/red-alert/assistant/events/${eventId}/resolve`, { resolved });
      toast.success(resolved ? 'Assistant event cozuldu olarak isaretlendi' : 'Assistant event tekrar acildi');
      loadAssistantEvents();
      loadAssistantSummary();
    } catch (error) {
      console.error('Failed to resolve assistant event:', error);
      toast.error('Assistant event guncellenemedi');
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
      toast.success(resolved ? 'Hata çözüldü olarak işaretlendi' : 'Hata tekrar açıldı');
      loadErrorLogs();
      loadErrorSummary();
      loadHealth();
    } catch (error) {
      console.error('Failed to resolve error:', error);
      toast.error('Hata durumu güncellenemedi');
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
              Erişim Engellendi
            </CardTitle>
            <CardDescription>
              Red Alert paneline erişim yetkiniz yok.
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
          <p className="text-muted-foreground">Güvenlik paneli yükleniyor...</p>
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
  const totalErrors = errorSummary?.summary?.total || 0;
  const totalEvents = summary?.summary?.total || 0;
  const threatCount = (topThreats.topIPs?.length || 0) + (topThreats.topEndpoints?.length || 0);
  const opsIncidentCount = opsSummary?.totals?.incidents || 0;
  const assistantIncidentCount = assistantSummary?.totals?.incidents || 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header + Time Filter */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Shield className="h-6 w-6 text-red-600" />
            Red Alert
            {health && (
              <Badge className={SEVERITY_COLORS[health.status] + ' ml-2 text-xs'}>
                {health.healthScore}/100
              </Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Güvenlik olayları ve uygulama hatalarını gerçek zamanlı izleme
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
              <SelectItem value="1">Son 1 Saat</SelectItem>
              <SelectItem value="6">Son 6 Saat</SelectItem>
              <SelectItem value="24">Son 24 Saat</SelectItem>
              <SelectItem value="168">Son 7 Gün</SelectItem>
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
      <div className={`grid grid-cols-2 ${opsPanelEnabled ? 'md:grid-cols-6' : 'md:grid-cols-5'} gap-4 mb-6`}>
        <NavCard
          id="errors"
          icon={Bug}
          iconColor="text-orange-600"
          title="Uygulama Hataları"
          value={
            <span className="text-orange-600 dark:text-orange-400">{totalErrors}</span>
          }
          subtitle={
            unresolvedCount > 0
              ? <span className="text-red-500 font-medium">{unresolvedCount} çözülmemiş</span>
              : 'Tümü çözüldü'
          }
          activeBorderColor="border-orange-500 dark:border-orange-400"
          borderColor="border-orange-300"
        />
        <NavCard
          id="events"
          icon={Eye}
          iconColor="text-blue-600"
          title="Güvenlik Olayları"
          value={totalEvents}
          subtitle={
            summary?.summary?.critical > 0
              ? <span className="text-red-500 font-medium">{summary.summary.critical} kritik</span>
              : 'Kritik olay yok'
          }
          activeBorderColor="border-blue-500 dark:border-blue-400"
          borderColor="border-blue-300"
        />
        <NavCard
          id="timeline"
          icon={Clock}
          iconColor="text-purple-600"
          title="Zaman Çizelgesi"
          value={timeline.length}
          subtitle="Saatlik dağılım"
          activeBorderColor="border-purple-500 dark:border-purple-400"
          borderColor="border-purple-300"
        />
        <NavCard
          id="threats"
          icon={AlertTriangle}
          iconColor="text-red-600"
          title="Tehdit Kaynakları"
          value={threatCount}
          subtitle="IP + Endpoint"
          activeBorderColor="border-red-500 dark:border-red-400"
          borderColor="border-red-300"
        />
        <NavCard
          id="assistant"
          icon={Sparkles}
          iconColor="text-fuchsia-600"
          title="Assistant Quality"
          value={assistantIncidentCount}
          subtitle={
            opsPanelEnabled
              ? 'Davranis ve feedback sinyalleri'
              : 'Panel kapaliysa buradan nedenini gor'
          }
          activeBorderColor="border-fuchsia-500 dark:border-fuchsia-400"
          borderColor="border-fuchsia-300"
        />
        {opsPanelEnabled && (
          <NavCard
            id="ops"
            icon={Activity}
            iconColor="text-emerald-600"
            title="Ops Olayları"
            value={opsIncidentCount}
            subtitle="Trace/incident görünümü"
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
                  Uygulama Hataları
                </CardTitle>
                <CardDescription className="mt-1">
                  Araç hataları, API hataları, sistem hataları ve diğerleri
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
                  <SelectValue placeholder="Tüm Kategoriler" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Kategoriler</SelectItem>
                  {Object.entries(ERROR_CATEGORY_LABELS).map(([key, label]) => (
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
                  <SelectValue placeholder="Tüm Önem Dereceleri" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Önem Dereceleri</SelectItem>
                  <SelectItem value="medium">Orta</SelectItem>
                  <SelectItem value="high">Yüksek</SelectItem>
                  <SelectItem value="critical">Kritik</SelectItem>
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
                  <SelectValue placeholder="Tüm Durumlar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Durumlar</SelectItem>
                  <SelectItem value="false">Çözülmemiş</SelectItem>
                  <SelectItem value="true">Çözülmüş</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Son Görülme</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Önem</TableHead>
                  <TableHead>Kaynak</TableHead>
                  <TableHead>Mesaj</TableHead>
                  <TableHead className="text-center">Tekrar</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errorLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      Hata bulunamadı
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
                            {new Date(err.lastSeenAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <CategoryIcon className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs">{ERROR_CATEGORY_LABELS[err.category] || err.category}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={SEVERITY_COLORS[err.severity]}>
                              {err.severity.toUpperCase()}
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
                                Çözüldü
                              </Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                Açık
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
                                    <span className="text-muted-foreground">Tool:</span>{' '}
                                    <code>{err.toolName}</code>
                                  </div>
                                )}
                                {err.externalService && (
                                  <div>
                                    <span className="text-muted-foreground">Servis:</span>{' '}
                                    <code>{err.externalService}</code>
                                    {err.externalStatus && <span className="ml-1">({err.externalStatus})</span>}
                                  </div>
                                )}
                                {err.endpoint && (
                                  <div>
                                    <span className="text-muted-foreground">Endpoint:</span>{' '}
                                    <code>{err.method} {err.endpoint}</code>
                                  </div>
                                )}
                                {err.errorCode && (
                                  <div>
                                    <span className="text-muted-foreground">Kod:</span>{' '}
                                    <code>{err.errorCode}</code>
                                  </div>
                                )}
                                {err.businessId && (
                                  <div>
                                    <span className="text-muted-foreground">Business:</span>{' '}
                                    {err.businessId}
                                  </div>
                                )}
                                {err.requestId && (
                                  <div>
                                    <span className="text-muted-foreground">Request:</span>{' '}
                                    <code className="text-xs">{err.requestId}</code>
                                  </div>
                                )}
                                <div>
                                  <span className="text-muted-foreground">İlk Görülme:</span>{' '}
                                  {new Date(err.firstSeenAt).toLocaleString()}
                                </div>
                                {err.responseTimeMs && (
                                  <div>
                                    <span className="text-muted-foreground">Yanıt Süresi:</span>{' '}
                                    {err.responseTimeMs}ms
                                  </div>
                                )}
                              </div>
                              {err.stackTrace && (
                                <div>
                                  <div className="text-xs text-muted-foreground mb-1">Stack Trace:</div>
                                  <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
                                    {err.stackTrace}
                                  </pre>
                                </div>
                              )}
                              {err.resolvedBy && (
                                <div className="text-xs mt-2 text-muted-foreground">
                                  {err.resolvedBy} tarafından {new Date(err.resolvedAt).toLocaleString()} tarihinde çözüldü
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
                  {((errorPagination.page - 1) * errorPagination.limit) + 1} -{' '}
                  {Math.min(errorPagination.page * errorPagination.limit, errorPagination.total)} / toplam{' '}
                  {errorPagination.total} hata
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setErrorPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    disabled={errorPagination.page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Önceki
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setErrorPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    disabled={!errorPagination.hasMore}
                  >
                    Sonraki
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
            <CardTitle>Güvenlik Olayları</CardTitle>
            <CardDescription>
              Filtreleme seçenekleri ile güvenlik olayları
            </CardDescription>
            <div className="flex gap-4 mt-4">
              <Select
                value={filters.severity || 'all'}
                onValueChange={(value) => setFilters(prev => ({ ...prev, severity: value === 'all' ? '' : value }))}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Tüm Önem Dereceleri" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Önem Dereceleri</SelectItem>
                  <SelectItem value="low">Düşük</SelectItem>
                  <SelectItem value="medium">Orta</SelectItem>
                  <SelectItem value="high">Yüksek</SelectItem>
                  <SelectItem value="critical">Kritik</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filters.type || 'all'}
                onValueChange={(value) => setFilters(prev => ({ ...prev, type: value === 'all' ? '' : value }))}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Tüm Olay Türleri" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Olay Türleri</SelectItem>
                  {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zaman</TableHead>
                  <TableHead>Tür</TableHead>
                  <TableHead>Önem</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Metod</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>IP Adresi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Güvenlik olayı bulunamadı
                    </TableCell>
                  </TableRow>
                ) : (
                  events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(event.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs">{EVENT_TYPE_LABELS[event.type] || event.type}</code>
                      </TableCell>
                      <TableCell>
                        <Badge className={SEVERITY_COLORS[event.severity]}>
                          {event.severity.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs">{event.endpoint || '-'}</code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{event.method || '-'}</Badge>
                      </TableCell>
                      <TableCell>{event.statusCode || '-'}</TableCell>
                      <TableCell>
                        <code className="text-xs">{event.ipAddress || '-'}</code>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {pagination.total > pagination.limit && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  {((pagination.page - 1) * pagination.limit) + 1} -{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} / toplam{' '}
                  {pagination.total} olay
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    disabled={pagination.page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Önceki
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    disabled={!pagination.hasMore}
                  >
                    Sonraki
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
            <CardTitle>Assistant Quality</CardTitle>
            <CardDescription>
              Bu alan commit/push eksik oldugu icin degil, backend capability kapali oldugu icin gorunmeyebilir.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Panelin veri uretebilmesi icin backend tarafinda unified trace, operational incidents ve Red Alert ops panel capability acik olmali.
            </p>
            <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span>Unified Response Trace</span>
                <Badge variant={opsCapabilities.unifiedResponseTraceEnabled ? 'default' : 'outline'}>
                  {opsCapabilities.unifiedResponseTraceEnabled ? 'Acik' : 'Kapali'}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Operational Incidents</span>
                <Badge variant={opsCapabilities.operationalIncidentsEnabled ? 'default' : 'outline'}>
                  {opsCapabilities.operationalIncidentsEnabled ? 'Acik' : 'Kapali'}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Assistant/Ops Panel</span>
                <Badge variant={opsCapabilities.redAlertOpsPanelEnabled ? 'default' : 'outline'}>
                  {opsCapabilities.redAlertOpsPanelEnabled ? 'Acik' : 'Kapali'}
                </Badge>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Prod/pilot ortaminda gerekli backend envler: <code>FEATURE_UNIFIED_RESPONSE_TRACE=true</code>, <code>FEATURE_OPERATIONAL_INCIDENTS=true</code>, <code>FEATURE_REDALERT_OPS_PANEL=true</code>.
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════ Panel: Operasyonel Olaylar ═══════════ */}
      {opsPanelEnabled && activePanel === 'assistant' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Blocked Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {assistantSummary?.cards?.blockedRate ?? 0}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {assistantSummary?.counts?.blocked ?? 0} blocked turn
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Sanitize Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600">
                  {assistantSummary?.cards?.sanitizeRate ?? 0}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {assistantSummary?.counts?.sanitized ?? 0} sanitized turn
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Fallback Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  {assistantSummary?.cards?.fallbackRate ?? 0}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {assistantSummary?.counts?.fallback ?? 0} fallback turn
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Clarification Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {assistantSummary?.cards?.clarificationRate ?? 0}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {assistantSummary?.counts?.clarification ?? 0} clarification turn
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Negative Feedback</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-fuchsia-600">
                  {assistantSummary?.counts?.negativeFeedback ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {assistantSummary?.cards?.negativeFeedbackRate ?? 0}% of feedback
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Assistant Quality Events</CardTitle>
              <CardDescription>
                Block, sanitize, fallback, tool skip, intervention ve kullanici feedback sinyalleri
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
                    <SelectValue placeholder="Tum Kategoriler" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tum Kategoriler</SelectItem>
                    {Object.entries(ASSISTANT_CATEGORY_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
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
                    <SelectValue placeholder="Tum Onem Dereceleri" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tum Onem Dereceleri</SelectItem>
                    <SelectItem value="LOW">LOW</SelectItem>
                    <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                    <SelectItem value="HIGH">HIGH</SelectItem>
                    <SelectItem value="CRITICAL">CRITICAL</SelectItem>
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
                    <SelectValue placeholder="Tum Durumlar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tum Durumlar</SelectItem>
                    <SelectItem value="false">Acilanlar</SelectItem>
                    <SelectItem value="true">Cozulenler</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zaman</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Onem</TableHead>
                    <TableHead>Ozet</TableHead>
                    <TableHead>Kanal</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>Islem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assistantEvents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        Assistant event bulunamadi
                      </TableCell>
                    </TableRow>
                  ) : (
                    assistantEvents.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {new Date(event.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs">
                          {ASSISTANT_CATEGORY_LABELS[event.category] || event.category}
                        </TableCell>
                        <TableCell>
                          <Badge className={SEVERITY_COLORS[(event.severity || '').toLowerCase()] || 'bg-muted text-foreground'}>
                            {event.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-md truncate" title={event.summary}>
                          {event.summary}
                        </TableCell>
                        <TableCell>{event.channel}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {event.sessionId ? `${event.sessionId.slice(0, 14)}...` : '-'}
                        </TableCell>
                        <TableCell>
                          {event.resolved ? (
                            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              Cozuldu
                            </Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                              Acik
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => loadAssistantTraceDetail(event.traceId)}
                              disabled={!event.traceId || assistantTraceLoading}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleResolveAssistantEvent(event.id, !event.resolved)}
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

              {assistantPagination.total > assistantPagination.limit && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    {((assistantPagination.page - 1) * assistantPagination.limit) + 1} -{' '}
                    {Math.min(assistantPagination.page * assistantPagination.limit, assistantPagination.total)} / toplam{' '}
                    {assistantPagination.total} event
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAssistantPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                      disabled={assistantPagination.page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Onceki
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAssistantPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                      disabled={!assistantPagination.hasMore}
                    >
                      Sonraki
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
                <CardTitle className="text-sm font-medium">Bypass Oranı</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {opsSummary?.cards?.bypassRate ?? 0}%
                </div>
                <p className="text-xs text-muted-foreground">LLM bypass / toplam turn</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Fallback Oranı</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  {opsSummary?.cards?.fallbackRate ?? 0}%
                </div>
                <p className="text-xs text-muted-foreground">template + fallback kaynakları</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Tool Success</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600">
                  {opsSummary?.cards?.toolSuccessRate ?? 0}%
                </div>
                <p className="text-xs text-muted-foreground">tool çağrılan turnlerde başarı</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Repeat Responses</CardTitle>
              <CardDescription>
                Aynı/benzer hash ile tekrar eden yanıtlar
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hash</TableHead>
                    <TableHead>Kanal</TableHead>
                    <TableHead>Count</TableHead>
                    <TableHead>Örnek Metin</TableHead>
                    <TableHead>Trace</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {repeatResponses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Tekrarlayan yanıt bulunamadı
                      </TableCell>
                    </TableRow>
                  ) : (
                    repeatResponses.map((item) => (
                      <TableRow key={`${item.responseHash}-${item.channel}`}>
                        <TableCell className="font-mono text-xs">{item.responseHash?.slice(0, 12)}...</TableCell>
                        <TableCell>{item.channel}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">{item.count}</Badge>
                        </TableCell>
                        <TableCell className="max-w-md truncate" title={item.sample || ''}>
                          {item.sample || '-'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {item.latestTraceId ? `${item.latestTraceId.slice(0, 12)}...` : '-'}
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
                  <CardTitle>Ops Events</CardTitle>
                  <CardDescription>Category/severity bazında operational incident akışı</CardDescription>
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
                    <SelectValue placeholder="Tüm Kategoriler" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tüm Kategoriler</SelectItem>
                    {Object.entries(OPS_CATEGORY_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
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
                    <SelectValue placeholder="Tüm Önem Dereceleri" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tüm Önem Dereceleri</SelectItem>
                    <SelectItem value="LOW">LOW</SelectItem>
                    <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                    <SelectItem value="HIGH">HIGH</SelectItem>
                    <SelectItem value="CRITICAL">CRITICAL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zaman</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Önem</TableHead>
                    <TableHead>Özet</TableHead>
                    <TableHead>Kanal</TableHead>
                    <TableHead>Trace</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {opsEvents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Operational event bulunamadı
                      </TableCell>
                    </TableRow>
                  ) : (
                    opsEvents.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {new Date(event.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs">
                          {OPS_CATEGORY_LABELS[event.category] || event.category}
                        </TableCell>
                        <TableCell>
                          <Badge className={SEVERITY_COLORS[(event.severity || '').toLowerCase()] || 'bg-muted text-foreground'}>
                            {event.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-md truncate" title={event.summary}>
                          {event.summary}
                        </TableCell>
                        <TableCell>{event.channel}</TableCell>
                        <TableCell className="font-mono text-xs">
                          <a
                            href={`/dashboard/admin/red-alert?traceId=${event.traceId}`}
                            className="text-blue-600 hover:underline"
                          >
                            {event.traceId?.slice(0, 12)}...
                          </a>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {opsPagination.total > opsPagination.limit && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    {((opsPagination.page - 1) * opsPagination.limit) + 1} -{' '}
                    {Math.min(opsPagination.page * opsPagination.limit, opsPagination.total)} / toplam{' '}
                    {opsPagination.total} olay
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setOpsPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                      disabled={opsPagination.page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Önceki
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setOpsPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                      disabled={!opsPagination.hasMore}
                    >
                      Sonraki
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════ Panel: Zaman Çizelgesi ═══════════ */}
      {activePanel === 'timeline' && (
        <Card>
          <CardHeader>
            <CardTitle>Olay Zaman Çizelgesi</CardTitle>
            <CardDescription>
              Saatlik olay dağılımı
            </CardDescription>
          </CardHeader>
          <CardContent>
            {timeline.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">
                Zaman çizelgesi verisi yok
              </div>
            ) : (
              <LineChart
                data={timeline.map(t => ({
                  time: new Date(t.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  }),
                  events: t.count,
                }))}
                dataKey="events"
                xAxisKey="time"
                color="#ef4444"
                height={400}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════ Panel: Tehdit Kaynakları ═══════════ */}
      {activePanel === 'threats' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>En Cok Tehdit IP&apos;leri</CardTitle>
              <CardDescription>
                En fazla güvenlik olayı üreten IP adresleri
              </CardDescription>
            </CardHeader>
            <CardContent>
              {topThreats.topIPs.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  Tehdit verisi yok
                </div>
              ) : (
                <BarChart
                  data={topThreats.topIPs.map(t => ({
                    ip: t.ip,
                    count: t.count,
                  }))}
                  dataKey="count"
                  xAxisKey="ip"
                  horizontal={true}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>En Cok Hedeflenen Endpoint&apos;ler</CardTitle>
              <CardDescription>
                En fazla saldiriya ugrayan API endpoint&apos;leri
              </CardDescription>
            </CardHeader>
            <CardContent>
              {topThreats.topEndpoints.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  Tehdit verisi yok
                </div>
              ) : (
                <BarChart
                  data={topThreats.topEndpoints.map(t => ({
                    endpoint: t.endpoint.replace('/api/', ''),
                    count: t.count,
                  }))}
                  dataKey="count"
                  xAxisKey="endpoint"
                  horizontal={true}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={assistantTraceOpen} onOpenChange={setAssistantTraceOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assistant Trace Detail</DialogTitle>
          </DialogHeader>

          {assistantTraceDetail?.trace ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs">Trace</div>
                  <div className="font-mono text-xs break-all">{assistantTraceDetail.trace.traceId}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Channel</div>
                  <div>{assistantTraceDetail.trace.channel}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Response Source</div>
                  <div>{assistantTraceDetail.trace.responseSource || '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Latency</div>
                  <div>{assistantTraceDetail.trace.latencyMs || 0} ms</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">LLM Used</div>
                  <div>{assistantTraceDetail.trace.llmUsed ? 'Yes' : 'No'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Tools Called</div>
                  <div>{assistantTraceDetail.trace.toolsCalledCount || 0}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Tool Success</div>
                  <div>{assistantTraceDetail.trace.toolSuccess ? 'Yes' : 'No'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Session</div>
                  <div className="font-mono text-xs break-all">{assistantTraceDetail.trace.sessionId || '-'}</div>
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Trace Payload</CardTitle>
                  <CardDescription>
                    Guardrail, source, grounding ve postprocessor detaylari
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-sm">
                    <div className="text-muted-foreground text-xs mb-1">Response Preview</div>
                    <div className="rounded-md border bg-muted/30 p-3 whitespace-pre-wrap">
                      {assistantTraceDetail.trace.responsePreview || assistantTraceDetail.trace.payload?.details?.response_preview || '-'}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground text-xs">Guardrail</div>
                      <div>{assistantTraceDetail.trace.payload?.guardrail?.action || '-'}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {assistantTraceDetail.trace.payload?.guardrail?.reason || '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Grounding</div>
                      <div>{assistantTraceDetail.trace.payload?.details?.response_grounding || '-'}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Message Type</div>
                      <div>{assistantTraceDetail.trace.payload?.details?.message_type || '-'}</div>
                    </div>
                  </div>

                  <div className="text-sm">
                    <div className="text-muted-foreground text-xs mb-1">Postprocessors</div>
                    <div className="flex flex-wrap gap-2">
                      {(assistantTraceDetail.trace.payload?.postprocessors_applied || []).length === 0 ? (
                        <Badge variant="outline">None</Badge>
                      ) : (
                        (assistantTraceDetail.trace.payload?.postprocessors_applied || []).map((item) => (
                          <Badge key={item} variant="outline">{item}</Badge>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="text-sm">
                    <div className="text-muted-foreground text-xs mb-1">Tools</div>
                    <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
                      {JSON.stringify(assistantTraceDetail.trace.payload?.tools_called || [], null, 2)}
                    </pre>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Linked Incidents</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {(assistantTraceDetail.incidents || []).map((incident) => (
                      <div key={incident.id} className="rounded-md border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium text-sm">
                              {ASSISTANT_CATEGORY_LABELS[incident.category] || incident.category}
                            </div>
                            <div className="text-xs text-muted-foreground">{incident.summary}</div>
                            {(incident.details?.reason || incident.details?.comment || incident.details?.guardrail_reason) && (
                              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                {incident.details?.reason && (
                                  <div>Reason: <code>{incident.details.reason}</code></div>
                                )}
                                {incident.details?.guardrail_reason && (
                                  <div>Guardrail: <code>{incident.details.guardrail_reason}</code></div>
                                )}
                                {incident.details?.comment && (
                                  <div className="whitespace-pre-wrap">Comment: {incident.details.comment}</div>
                                )}
                              </div>
                            )}
                          </div>
                          <Badge className={SEVERITY_COLORS[(incident.severity || '').toLowerCase()] || 'bg-muted text-foreground'}>
                            {incident.severity}
                          </Badge>
                        </div>
                      </div>
                    ))}
                    {(assistantTraceDetail.incidents || []).length === 0 && (
                      <div className="text-sm text-muted-foreground">Linked incident yok.</div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">Conversation Snapshot</CardTitle>
                      <CardDescription>
                        Mevcut chat log kaydi uzerinden konusma icerigi
                      </CardDescription>
                    </div>
                    {assistantTraceDetail.chatLog?.id && (
                      <a
                        href={`/dashboard/chat-history?chatId=${assistantTraceDetail.chatLog.id}`}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Chat historyde ac
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
                              ? 'ml-10 bg-blue-50 border border-blue-100'
                              : 'mr-10 bg-muted border'
                          }`}
                        >
                          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                            {message.role || 'unknown'}
                          </div>
                          <div className="whitespace-pre-wrap">{message.content || '-'}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Bu trace icin bagli bir chat log bulunamadi.</div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {assistantTraceLoading ? 'Trace yukleniyor...' : 'Trace detayi bulunamadi.'}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
