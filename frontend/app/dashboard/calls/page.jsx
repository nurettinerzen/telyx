/**
 * Calls Page
 * Call history with dark brand-themed design
 * Navy/Teal SaaS gradient aesthetic
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import TranscriptModal from '@/components/TranscriptModal';
import EmptyState from '@/components/EmptyState';
import { GradientLoaderInline } from '@/components/GradientLoader';
import { Phone, Search, Download, Filter, FileText, Volume2, PhoneIncoming, PhoneOutgoing, Activity, Clock, PhoneCall, TrendingUp } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { toast } from 'sonner';
import { formatDate, formatDuration, formatPhone } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import PageIntro from '@/components/PageIntro';
import { getPageHelp } from '@/content/pageHelp';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { useTheme } from 'next-themes';
import {
  DashboardFlowBackdrop,
  DASHBOARD_FLOW_PALETTE,
  getDashboardFlowPageStyle,
} from '@/components/dashboard/DashboardFlowBackdrop';

// Generate page numbers with ellipsis for pagination
function generatePageNumbers(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = [1];
  if (currentPage > 3) pages.push('...');
  for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
    pages.push(i);
  }
  if (currentPage < totalPages - 2) pages.push('...');
  pages.push(totalPages);
  return pages;
}

// Simple cache for calls data
const callsCache = {
  data: null,
  timestamp: null,
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes

  isValid() {
    return this.data && this.timestamp && (Date.now() - this.timestamp < this.CACHE_DURATION);
  },

  set(data) {
    this.data = data;
    this.timestamp = Date.now();
  },

  get() {
    return this.data;
  },

  clear() {
    this.data = null;
    this.timestamp = null;
  }
};

export default function CallsPage() {
  const { t, locale } = useLanguage();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const pageHelp = getPageHelp('callHistory', locale);
  const searchParams = useSearchParams();
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [endReasonFilter, setEndReasonFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ from: undefined, to: undefined });
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [selectedCallId, setSelectedCallId] = useState(null);
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);

  // Handle callId from URL query params
  useEffect(() => {
    const callIdFromUrl = searchParams.get('callId');
    if (callIdFromUrl) {
      setSelectedCallId(parseInt(callIdFromUrl, 10));
      setShowTranscriptModal(true);
    }
  }, [searchParams]);

  // Initial load with cache
  useEffect(() => {
    const loadInitial = async () => {
      // Check cache first
      if (callsCache.isValid()) {
        setCalls(callsCache.get());
        setLoading(false);
        setIsInitialLoad(false);
        // Background refresh
        refreshCalls(true);
        return;
      }

      // No cache, load fresh
      await loadCalls();
      setIsInitialLoad(false);
    };

    loadInitial();
  }, []);

  // Reload when filters change
  useEffect(() => {
    if (!isInitialLoad) {
      loadCalls();
    }
  }, [pagination.page, statusFilter, directionFilter, endReasonFilter, dateRange]);

  // Debounced search
  useEffect(() => {
    if (isInitialLoad) return;

    const timer = setTimeout(() => {
      setPagination(prev => ({ ...prev, page: 1 }));
      loadCalls();
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Real-time polling for new calls (every 10 seconds)
  useEffect(() => {
    if (isInitialLoad) return;

    const pollInterval = setInterval(() => {
      // Only poll if page is visible and no filters active
      if (document.visibilityState === 'visible' && statusFilter === 'all' && directionFilter === 'all' && endReasonFilter === 'all' && !searchQuery && !dateRange.from) {
        refreshCalls(true); // Silent refresh
      }
    }, 10000); // 10 seconds - faster updates for new calls

    return () => clearInterval(pollInterval);
  }, [isInitialLoad, statusFilter, directionFilter, endReasonFilter, searchQuery, dateRange]);

  const loadCalls = async () => {
    setLoading(true);
    try {
      // Sync conversations from 11Labs (runs in background, doesn't block)
      apiClient.elevenlabs.syncConversations().catch(err => {
        console.warn('Sync failed:', err.message);
      });

      const params = {
        page: pagination.page,
        limit: pagination.limit
      };

      // All filters sent to backend (server-side filtering)
      if (statusFilter !== 'all') params.status = statusFilter;
      if (searchQuery) params.search = searchQuery;
      if (directionFilter !== 'all') params.direction = directionFilter;
      if (endReasonFilter !== 'all') params.endReason = endReasonFilter;
      if (dateRange.from) params.startDate = dateRange.from.toISOString();
      if (dateRange.to) params.endDate = dateRange.to.toISOString();

      const response = await apiClient.calls.getAll(params);
      let callsData = response.data.calls || [];

      // Filter out chat and whatsapp - only show phone calls (structural filter stays client-side)
      callsData = callsData.filter(call => {
        if (call.id && typeof call.id === 'string' && call.id.startsWith('chat-')) return false;
        const channel = call.channel?.toLowerCase();
        const type = call.type?.toLowerCase();
        if (channel === 'chat' || channel === 'whatsapp' || type === 'chat' || type === 'whatsapp') return false;
        return true;
      });

      setCalls(callsData);
      setPagination(prev => ({
        ...prev,
        total: response.data.pagination?.total || 0,
        totalPages: response.data.pagination?.totalPages || 0
      }));

      // Only cache if no filters active
      if (statusFilter === 'all' && !searchQuery && directionFilter === 'all' && endReasonFilter === 'all' && !dateRange.from) {
        callsCache.set(callsData);
      }
    } catch (error) {
      toast.error(t('dashboard.callsPage.failedToLoadCalls'));
    } finally {
      setLoading(false);
    }
  };

  const refreshCalls = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await apiClient.calls.getAll({ page: 1, limit: 20 });
      let callsData = response.data.calls || [];

      // Filter out chat and whatsapp - only show phone calls
      callsData = callsData.filter(call => {
        if (call.id && typeof call.id === 'string' && call.id.startsWith('chat-')) return false;
        const channel = call.channel?.toLowerCase();
        const type = call.type?.toLowerCase();
        if (channel === 'chat' || channel === 'whatsapp' || type === 'chat' || type === 'whatsapp') return false;
        return true;
      });

      setCalls(callsData);
      setPagination(prev => ({
        ...prev,
        total: response.data.pagination?.total || 0,
        totalPages: response.data.pagination?.totalPages || 0
      }));
      callsCache.set(callsData);
    } catch (error) {
      if (!silent) toast.error(t('dashboard.callsPage.failedToLoadCalls'));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const response = await apiClient.calls.export('csv');
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `calls-${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(t('dashboard.callsPage.callsExportedSuccess'));
    } catch (error) {
      toast.error(t('dashboard.callsPage.failedToExportCalls'));
    }
  };

  const handleViewTranscript = (callId) => {
    setSelectedCallId(callId);
    setShowTranscriptModal(true);
  };

  // Direction badge (inbound/outbound)
  const getDirectionBadge = (call) => {
    const isOutbound = call.direction?.startsWith('outbound');
    if (isOutbound) {
      return (
        <Badge variant="ghost" className={isDark ? 'text-orange-400 text-xs' : 'text-orange-700 dark:text-orange-400 text-xs'}>
          <PhoneOutgoing className="h-3 w-3 mr-1" />
          {t('dashboard.callsPage.outbound')}
        </Badge>
      );
    }
    return (
      <Badge variant="ghost" className={isDark ? 'text-emerald-400 text-xs' : 'text-emerald-700 dark:text-emerald-400 text-xs'}>
        <PhoneIncoming className="h-3 w-3 mr-1" />
        {t('dashboard.callsPage.inbound')}
      </Badge>
    );
  };

  // End reason badge
  const getEndReasonBadge = (endReason) => {
    if (!endReason) return <span className={isDark ? 'text-sm text-slate-500' : 'text-sm text-gray-400'}>-</span>;

    const reasonConfig = {
      client_ended: { label: t('dashboard.callsPage.clientEnded'), color: isDark ? 'text-blue-400' : 'text-blue-700 dark:text-blue-400' },
      agent_ended: { label: t('dashboard.callsPage.agentEnded'), color: isDark ? 'text-teal-400' : 'text-teal-700 dark:text-teal-400' },
      system_timeout: { label: t('dashboard.callsPage.systemTimeout'), color: isDark ? 'text-yellow-400' : 'text-yellow-700 dark:text-yellow-400' },
      error: { label: t('dashboard.callsPage.error'), color: isDark ? 'text-red-400' : 'text-red-700 dark:text-red-400' },
      completed: { label: t('dashboard.callsPage.completed'), color: isDark ? 'text-green-400' : 'text-green-700 dark:text-green-400' },
    };

    const config = reasonConfig[endReason] || { label: endReason, color: isDark ? 'text-slate-400' : 'text-gray-700 dark:text-gray-400' };

    return (
      <Badge variant="ghost" className={`${config.color} text-xs`}>
        {config.label}
      </Badge>
    );
  };

  // Status indicator
  const getStatusIndicator = (status) => {
    const statusConfig = {
      completed: { color: 'bg-success-500', label: t('dashboard.callsPage.completed') },
      answered: { color: 'bg-success-500', label: t('dashboard.callsPage.answered') },
      failed: { color: 'bg-error-500', label: t('dashboard.callsPage.failed') },
      'in-progress': { color: 'bg-info-500', label: t('dashboard.callsPage.inProgress') },
      in_progress: { color: 'bg-info-500', label: t('dashboard.callsPage.inProgress') },
      queued: { color: 'bg-warning-500', label: t('dashboard.callsPage.queued') },
    };

    const config = statusConfig[status] || { color: 'bg-gray-400', label: status };

    return (
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${config.color}`} />
        <span className={isDark ? 'text-sm text-slate-300' : 'text-sm text-gray-700 dark:text-gray-300'}>{config.label}</span>
      </div>
    );
  };

  // Format date in Turkish style
  const formatCallDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Computed stats from calls state
  const totalCalls = calls.length;
  const answeredCalls = calls.filter(c => ['answered', 'completed'].includes(c.status)).length;
  const totalSeconds = calls.reduce((s, c) => s + (c.duration || 0), 0);
  const totalMinutes = Math.round(totalSeconds / 60);
  const avgDuration = totalCalls > 0 ? Math.round(totalSeconds / totalCalls) : 0;

  const statCards = [
    {
      label: t('dashboard.callsPage.totalCalls'),
      value: totalCalls,
      icon: PhoneCall,
      accent: DASHBOARD_FLOW_PALETTE.teal,
      pill: 'rgba(0,196,230,0.15)',
      glow: 'rgba(0,196,230,0.12)',
      surface: 'linear-gradient(145deg, rgba(10,18,42,0.88), rgba(0,196,230,0.14))',
      border: 'rgba(0,196,230,0.18)',
    },
    {
      label: t('dashboard.callsPage.answered'),
      value: answeredCalls,
      icon: Phone,
      accent: DASHBOARD_FLOW_PALETTE.lightBlue,
      pill: 'rgba(0,111,235,0.15)',
      glow: 'rgba(0,111,235,0.12)',
      surface: 'linear-gradient(145deg, rgba(10,18,42,0.88), rgba(0,111,235,0.14))',
      border: 'rgba(0,111,235,0.18)',
    },
    {
      label: t('dashboard.callsPage.totalMinutes'),
      value: totalMinutes,
      icon: Clock,
      accent: DASHBOARD_FLOW_PALETTE.deepBlue,
      pill: 'rgba(0,10,207,0.16)',
      glow: 'rgba(0,10,207,0.14)',
      surface: 'linear-gradient(145deg, rgba(10,18,42,0.88), rgba(0,10,207,0.16))',
      border: 'rgba(0,10,207,0.2)',
    },
    {
      label: t('dashboard.callsPage.avgDuration'),
      value: formatDuration(avgDuration),
      icon: TrendingUp,
      accent: DASHBOARD_FLOW_PALETTE.navy,
      pill: 'rgba(5,23,82,0.2)',
      glow: 'rgba(5,23,82,0.18)',
      surface: 'linear-gradient(145deg, rgba(10,18,42,0.88), rgba(5,23,82,0.2))',
      border: 'rgba(125,211,252,0.18)',
    },
  ];

  // Show gradient loader on initial load only
  if (loading && isInitialLoad) {
    if (isDark) {
      return (
        <div
          className="relative -m-6 min-h-screen overflow-hidden p-6"
          style={getDashboardFlowPageStyle(isDark)}
        >
          <DashboardFlowBackdrop dark={isDark} />
          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl" style={{ background: 'rgba(0,196,230,0.15)' }}>
                <Activity className="h-6 w-6" style={{ color: '#00C4E6' }} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">{pageHelp.title}</h1>
                <p className="text-slate-400 text-sm">{pageHelp.subtitle}</p>
              </div>
            </div>
            <GradientLoaderInline text={t('dashboard.callsPage.loadingCalls')} />
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-6">
        <PageIntro
          title={pageHelp.title}
          subtitle={pageHelp.subtitle}
          locale={locale}
          help={{
            tooltipTitle: pageHelp.tooltipTitle,
            tooltipBody: pageHelp.tooltipBody,
            quickSteps: pageHelp.quickSteps,
          }}
        />
        <GradientLoaderInline text={t('dashboard.callsPage.loadingCalls')} />
      </div>
    );
  }

  if (!isDark) {
    // --- LIGHT MODE: original design ---
    return (
      <div className="space-y-6">
        {/* Header */}
        <PageIntro
          title={pageHelp.title}
          subtitle={pageHelp.subtitle}
          locale={locale}
          help={{
            tooltipTitle: pageHelp.tooltipTitle,
            tooltipBody: pageHelp.tooltipBody,
            quickSteps: pageHelp.quickSteps,
          }}
          actions={
            <Button onClick={handleExport} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              {t('dashboard.callsPage.exportCSV')}
            </Button>
          }
        />

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder={t('dashboard.callsPage.searchByPhone')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPagination(prev => ({ ...prev, page: 1 })); }}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('dashboard.callsPage.allStatus')}</SelectItem>
              <SelectItem value="answered">{t('dashboard.callsPage.answered')}</SelectItem>
              <SelectItem value="failed">{t('dashboard.callsPage.failed')}</SelectItem>
              <SelectItem value="in_progress">{t('dashboard.callsPage.inProgress')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={directionFilter} onValueChange={(val) => { setDirectionFilter(val); setPagination(prev => ({ ...prev, page: 1 })); }}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('dashboard.callsPage.allDirections')}</SelectItem>
              <SelectItem value="inbound">{t('dashboard.callsPage.inbound')}</SelectItem>
              <SelectItem value="outbound">{t('dashboard.callsPage.outbound')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={endReasonFilter} onValueChange={(val) => { setEndReasonFilter(val); setPagination(prev => ({ ...prev, page: 1 })); }}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('dashboard.callsPage.allEndReasons')}</SelectItem>
              <SelectItem value="client_ended">{t('dashboard.callsPage.clientEnded')}</SelectItem>
              <SelectItem value="agent_ended">{t('dashboard.callsPage.agentEnded')}</SelectItem>
              <SelectItem value="system_timeout">{t('dashboard.callsPage.systemTimeout')}</SelectItem>
              <SelectItem value="error">{t('dashboard.callsPage.error')}</SelectItem>
              <SelectItem value="completed">{t('dashboard.callsPage.completed')}</SelectItem>
            </SelectContent>
          </Select>
          <DateRangePicker
            dateRange={dateRange}
            onDateRangeChange={(range) => {
              setDateRange(range || { from: undefined, to: undefined });
              setPagination(prev => ({ ...prev, page: 1 }));
            }}
            locale={locale}
            className="w-full sm:w-auto"
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="bg-white dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-800 p-6">
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
              ))}
            </div>
          </div>
        ) : calls.length > 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-800 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('dashboard.callsPage.dateTime')}</TableHead>
                  <TableHead>{t('dashboard.callsPage.duration')}</TableHead>
                  <TableHead>{t('dashboard.callsPage.direction')}</TableHead>
                  <TableHead>{t('dashboard.callsPage.status')}</TableHead>
                  <TableHead>{t('dashboard.callsPage.endReason')}</TableHead>
                  <TableHead>{t('dashboard.callsPage.phoneNumber')}</TableHead>
                  <TableHead className="text-right">{t('dashboard.callsPage.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((call) => (
                  <TableRow key={call.id}>
                    <TableCell>
                      <span className="text-sm text-gray-900 dark:text-white">
                        {formatCallDate(call.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatDuration(call.duration)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {getDirectionBadge(call)}
                    </TableCell>
                    <TableCell>
                      {getStatusIndicator(call.status)}
                    </TableCell>
                    <TableCell>
                      {getEndReasonBadge(call.endReason)}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {formatPhone(call.phoneNumber || call.callerId) || '-'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {call.hasRecording && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewTranscript(call.id)}
                            className="h-8 w-8 p-0"
                          >
                            <Volume2 className="h-4 w-4" />
                          </Button>
                        )}
                        {call.hasTranscript && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewTranscript(call.id)}
                            className="h-8 w-8 p-0"
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        )}
                        {!call.hasRecording && !call.hasTranscript && (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-800">
                <span className="text-sm text-gray-500">
                  {t('dashboard.callsPage.showingResults', {
                    from: (pagination.page - 1) * pagination.limit + 1,
                    to: Math.min(pagination.page * pagination.limit, pagination.total),
                    total: pagination.total
                  })}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page <= 1}
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                  >
                    {t('dashboard.callsPage.previous')}
                  </Button>
                  {generatePageNumbers(pagination.page, pagination.totalPages).map((pageNum, idx) => (
                    pageNum === '...' ? (
                      <span key={`dots-${idx}`} className="px-2 text-sm text-gray-400">...</span>
                    ) : (
                      <Button
                        key={pageNum}
                        variant={pageNum === pagination.page ? 'default' : 'outline'}
                        size="sm"
                        className="w-8 h-8 p-0"
                        onClick={() => setPagination(prev => ({ ...prev, page: pageNum }))}
                      >
                        {pageNum}
                      </Button>
                    )
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                  >
                    {t('dashboard.callsPage.next')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-800 p-8">
            <EmptyState
              icon={Phone}
              title={searchQuery || statusFilter !== 'all' || directionFilter !== 'all' || endReasonFilter !== 'all' || dateRange.from
                ? t('dashboard.callsPage.noCallsFound')
                : t('dashboard.callsPage.noCalls')}
              description={searchQuery || statusFilter !== 'all' || directionFilter !== 'all' || endReasonFilter !== 'all' || dateRange.from
                ? t('dashboard.callsPage.tryAdjustingFilters')
                : t('dashboard.callsPage.callsWillAppear')}
            />
          </div>
        )}

        {/* Transcript Modal */}
        <TranscriptModal
          callId={selectedCallId}
          isOpen={showTranscriptModal}
          onClose={() => {
            setShowTranscriptModal(false);
            setSelectedCallId(null);
            loadCalls();
          }}
        />
      </div>
    );
  }

  // --- DARK MODE: brand-themed design ---
  return (
    <div
      className="relative -m-6 min-h-screen overflow-hidden p-6"
      style={getDashboardFlowPageStyle(isDark)}
    >
      <DashboardFlowBackdrop dark={isDark} />
      <div className="relative z-10 space-y-6">

        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="p-2.5 rounded-xl relative"
              style={{ background: 'rgba(0,196,230,0.15)' }}
            >
              <div
                className="absolute inset-0 rounded-xl blur-md"
                style={{ background: 'rgba(0,196,230,0.2)' }}
              />
              <Activity className="h-6 w-6 relative z-10" style={{ color: '#00C4E6' }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{pageHelp.title}</h1>
              <p className="text-slate-400 text-sm">{pageHelp.subtitle}</p>
            </div>
          </div>
          <Button
            onClick={handleExport}
            size="sm"
            style={{
              background: 'rgba(15,22,41,0.7)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#94a3b8',
            }}
            className="hover:border-[#00C4E6]/40 hover:text-white transition-all"
          >
            <Download className="h-4 w-4 mr-2" />
            {t('dashboard.callsPage.exportCSV')}
          </Button>
        </div>

        {/* Quick Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <div
                key={idx}
                className="rounded-2xl border p-4 relative overflow-hidden"
                style={{
                  background: card.surface,
                  borderColor: card.border,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 20px 40px rgba(2,6,23,0.2)',
                }}
              >
                {/* Glow blob */}
                <div
                  className="absolute top-0 right-0 w-20 h-20 rounded-full blur-2xl pointer-events-none"
                  style={{ background: card.glow }}
                />
                <div className="relative z-10">
                  <div
                    className="inline-flex items-center justify-center w-9 h-9 rounded-xl mb-3"
                    style={{ background: card.pill }}
                  >
                    <Icon className="h-4 w-4" style={{ color: card.accent }} />
                  </div>
                  <div className="text-2xl font-bold text-white">{card.value}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{card.label}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Filter Bar */}
        <div
          className="rounded-2xl border p-4"
          style={{
            background: 'rgba(15,22,41,0.7)',
            borderColor: 'rgba(255,255,255,0.06)',
          }}
        >
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder={t('dashboard.callsPage.searchByPhone')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-white/5 border-white/10 text-slate-200 placeholder:text-slate-500 focus:border-[#00C4E6]/40 focus:ring-[#00C4E6]/20"
              />
            </div>
            <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPagination(prev => ({ ...prev, page: 1 })); }}>
              <SelectTrigger className="w-full sm:w-40 bg-white/5 border-white/10 text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('dashboard.callsPage.allStatus')}</SelectItem>
                <SelectItem value="answered">{t('dashboard.callsPage.answered')}</SelectItem>
                <SelectItem value="failed">{t('dashboard.callsPage.failed')}</SelectItem>
                <SelectItem value="in_progress">{t('dashboard.callsPage.inProgress')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={directionFilter} onValueChange={(val) => { setDirectionFilter(val); setPagination(prev => ({ ...prev, page: 1 })); }}>
              <SelectTrigger className="w-full sm:w-40 bg-white/5 border-white/10 text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('dashboard.callsPage.allDirections')}</SelectItem>
                <SelectItem value="inbound">{t('dashboard.callsPage.inbound')}</SelectItem>
                <SelectItem value="outbound">{t('dashboard.callsPage.outbound')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={endReasonFilter} onValueChange={(val) => { setEndReasonFilter(val); setPagination(prev => ({ ...prev, page: 1 })); }}>
              <SelectTrigger className="w-full sm:w-44 bg-white/5 border-white/10 text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('dashboard.callsPage.allEndReasons')}</SelectItem>
                <SelectItem value="client_ended">{t('dashboard.callsPage.clientEnded')}</SelectItem>
                <SelectItem value="agent_ended">{t('dashboard.callsPage.agentEnded')}</SelectItem>
                <SelectItem value="system_timeout">{t('dashboard.callsPage.systemTimeout')}</SelectItem>
                <SelectItem value="error">{t('dashboard.callsPage.error')}</SelectItem>
                <SelectItem value="completed">{t('dashboard.callsPage.completed')}</SelectItem>
              </SelectContent>
            </Select>
            <DateRangePicker
              dateRange={dateRange}
              onDateRangeChange={(range) => {
                setDateRange(range || { from: undefined, to: undefined });
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
              locale={locale}
              className="w-full sm:w-auto"
            />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div
            className="rounded-2xl border p-6"
            style={{
              background: 'rgba(15,22,41,0.7)',
              borderColor: 'rgba(255,255,255,0.06)',
            }}
          >
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        ) : calls.length > 0 ? (
          <div
            className="rounded-2xl border overflow-hidden"
            style={{
              background: 'rgba(15,22,41,0.7)',
              borderColor: 'rgba(255,255,255,0.06)',
            }}
          >
            <Table>
              <TableHeader>
                <TableRow
                  className="border-b"
                  style={{ background: '#030d20', borderColor: 'rgba(255,255,255,0.06)' }}
                >
                  <TableHead className="text-slate-400 font-medium">{t('dashboard.callsPage.dateTime')}</TableHead>
                  <TableHead className="text-slate-400 font-medium">{t('dashboard.callsPage.duration')}</TableHead>
                  <TableHead className="text-slate-400 font-medium">{t('dashboard.callsPage.direction')}</TableHead>
                  <TableHead className="text-slate-400 font-medium">{t('dashboard.callsPage.status')}</TableHead>
                  <TableHead className="text-slate-400 font-medium">{t('dashboard.callsPage.endReason')}</TableHead>
                  <TableHead className="text-slate-400 font-medium">{t('dashboard.callsPage.phoneNumber')}</TableHead>
                  <TableHead className="text-right text-slate-400 font-medium">{t('dashboard.callsPage.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((call) => (
                  <TableRow
                    key={call.id}
                    className="border-b transition-colors cursor-default"
                    style={{ borderColor: 'rgba(255,255,255,0.04)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,196,230,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <TableCell>
                      <span className="text-sm text-slate-200">
                        {formatCallDate(call.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium text-white">
                        {formatDuration(call.duration)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {getDirectionBadge(call)}
                    </TableCell>
                    <TableCell>
                      {getStatusIndicator(call.status)}
                    </TableCell>
                    <TableCell>
                      {getEndReasonBadge(call.endReason)}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-slate-400">
                        {formatPhone(call.phoneNumber || call.callerId) || '-'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {call.hasRecording && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewTranscript(call.id)}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-[#00C4E6] hover:bg-[#00C4E6]/10"
                          >
                            <Volume2 className="h-4 w-4" />
                          </Button>
                        )}
                        {call.hasTranscript && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewTranscript(call.id)}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-[#00C4E6] hover:bg-[#00C4E6]/10"
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        )}
                        {!call.hasRecording && !call.hasTranscript && (
                          <span className="text-xs text-slate-600">-</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div
                className="flex items-center justify-between px-4 py-3 border-t"
                style={{ borderColor: 'rgba(255,255,255,0.06)' }}
              >
                <span className="text-sm text-slate-500">
                  {t('dashboard.callsPage.showingResults', {
                    from: (pagination.page - 1) * pagination.limit + 1,
                    to: Math.min(pagination.page * pagination.limit, pagination.total),
                    total: pagination.total
                  })}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    disabled={pagination.page <= 1}
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: pagination.page <= 1 ? '#374151' : '#94a3b8',
                    }}
                    className="hover:border-[#00C4E6]/40 hover:text-white disabled:opacity-40 transition-all"
                  >
                    {t('dashboard.callsPage.previous')}
                  </Button>
                  {generatePageNumbers(pagination.page, pagination.totalPages).map((pageNum, idx) => (
                    pageNum === '...' ? (
                      <span key={`dots-${idx}`} className="px-2 text-sm text-slate-500">...</span>
                    ) : (
                      <Button
                        key={pageNum}
                        size="sm"
                        className="w-8 h-8 p-0 transition-all"
                        style={pageNum === pagination.page ? {
                          background: '#00C4E6',
                          border: '1px solid #00C4E6',
                          color: '#051752',
                          fontWeight: 700,
                        } : {
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#94a3b8',
                        }}
                        onClick={() => setPagination(prev => ({ ...prev, page: pageNum }))}
                      >
                        {pageNum}
                      </Button>
                    )
                  ))}
                  <Button
                    size="sm"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: pagination.page >= pagination.totalPages ? '#374151' : '#94a3b8',
                    }}
                    className="hover:border-[#00C4E6]/40 hover:text-white disabled:opacity-40 transition-all"
                  >
                    {t('dashboard.callsPage.next')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            className="rounded-2xl border p-8"
            style={{
              background: 'rgba(15,22,41,0.7)',
              borderColor: 'rgba(255,255,255,0.06)',
            }}
          >
            <EmptyState
              icon={Phone}
              title={searchQuery || statusFilter !== 'all' || directionFilter !== 'all' || endReasonFilter !== 'all' || dateRange.from
                ? t('dashboard.callsPage.noCallsFound')
                : t('dashboard.callsPage.noCalls')}
              description={searchQuery || statusFilter !== 'all' || directionFilter !== 'all' || endReasonFilter !== 'all' || dateRange.from
                ? t('dashboard.callsPage.tryAdjustingFilters')
                : t('dashboard.callsPage.callsWillAppear')}
            />
          </div>
        )}

        {/* Transcript Modal */}
        <TranscriptModal
          callId={selectedCallId}
          isOpen={showTranscriptModal}
          onClose={() => {
            setShowTranscriptModal(false);
            setSelectedCallId(null);
            // Refresh table while respecting active filters
            loadCalls();
          }}
        />
      </div>
    </div>
  );
}
