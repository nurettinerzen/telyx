/**
 * Calls Page
 * Call history with Retell-style table design
 * Clean, minimal layout with status indicators
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
import { Phone, Search, Download, Filter, FileText, Volume2, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { toast } from 'sonner';
import { formatDate, formatDuration, formatPhone } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import PageIntro from '@/components/PageIntro';
import { getPageHelp } from '@/content/pageHelp';
import { DateRangePicker } from '@/components/ui/date-range-picker';

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
        <Badge variant="ghost" className="text-orange-700 dark:text-orange-400 text-xs">
          <PhoneOutgoing className="h-3 w-3 mr-1" />
          {t('dashboard.callsPage.outbound')}
        </Badge>
      );
    }
    return (
      <Badge variant="ghost" className="text-emerald-700 dark:text-emerald-400 text-xs">
        <PhoneIncoming className="h-3 w-3 mr-1" />
        {t('dashboard.callsPage.inbound')}
      </Badge>
    );
  };

  // End reason badge
  const getEndReasonBadge = (endReason) => {
    if (!endReason) return <span className="text-sm text-gray-400">-</span>;

    const reasonConfig = {
      client_ended: { label: t('dashboard.callsPage.clientEnded'), color: 'text-blue-700 dark:text-blue-400' },
      agent_ended: { label: t('dashboard.callsPage.agentEnded'), color: 'text-teal-700 dark:text-teal-400' },
      system_timeout: { label: t('dashboard.callsPage.systemTimeout'), color: 'text-yellow-700 dark:text-yellow-400' },
      error: { label: t('dashboard.callsPage.error'), color: 'text-red-700 dark:text-red-400' },
      completed: { label: t('dashboard.callsPage.completed'), color: 'text-green-700 dark:text-green-400' },
    };

    const config = reasonConfig[endReason] || { label: endReason, color: 'text-gray-700 dark:text-gray-400' };

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
        <span className="text-sm text-gray-700 dark:text-gray-300">{config.label}</span>
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

  // Show gradient loader on initial load only
  if (loading && isInitialLoad) {
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
          // Refresh table while respecting active filters
          loadCalls();
        }}
      />
    </div>
  );
}
