/**
 * Admin Calls List Page
 * Read-only view - transcripts excluded for privacy
 */

'use client';

import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
  Phone,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Building2,
  Clock,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Calendar,
  Bot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiClient } from '@/lib/api';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';

const STATUS_COLORS = {
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  ongoing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  missed: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  busy: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  no_answer: 'bg-gray-100 text-gray-700 dark:bg-white/8 dark:text-gray-400',
};

export default function AdminCallsPage() {
  const { locale } = useLanguage();
  const isTr = locale === 'tr';
  const [loading, setLoading] = useState(true);
  const [calls, setCalls] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [directionFilter, setDirectionFilter] = useState('ALL');

  const copy = useMemo(() => ({
    title: isTr ? 'Aramalar' : 'Calls',
    description: isTr ? 'Tüm platform aramaları' : 'All platform calls',
    searchPlaceholder: isTr ? 'Telefon numarası veya işletme ara...' : 'Search by phone number or business...',
    search: isTr ? 'Ara' : 'Search',
    status: isTr ? 'Durum' : 'Status',
    direction: isTr ? 'Yön' : 'Direction',
    allStatuses: isTr ? 'Tüm Durumlar' : 'All Statuses',
    all: isTr ? 'Tümü' : 'All',
    directions: {
      inbound: isTr ? 'Gelen' : 'Inbound',
      outbound: isTr ? 'Giden' : 'Outbound',
    },
    noCalls: isTr ? 'Arama bulunamadı' : 'No calls found',
    loadFailed: isTr ? 'Aramalar yüklenemedi' : 'Failed to load calls',
    table: {
      date: isTr ? 'Tarih' : 'Date',
      direction: isTr ? 'Yön' : 'Direction',
      phone: isTr ? 'Telefon' : 'Phone',
      business: isTr ? 'İşletme' : 'Business',
      assistant: isTr ? 'Asistan' : 'Assistant',
      duration: isTr ? 'Süre' : 'Duration',
      status: isTr ? 'Durum' : 'Status',
    },
    statuses: {
      completed: isTr ? 'Tamamlandı' : 'Completed',
      ongoing: isTr ? 'Devam Ediyor' : 'Ongoing',
      failed: isTr ? 'Başarısız' : 'Failed',
      missed: isTr ? 'Cevapsız' : 'Missed',
      busy: isTr ? 'Meşgul' : 'Busy',
      no_answer: isTr ? 'Cevaplanmadı' : 'No Answer',
    },
  }), [isTr]);

  const loadCalls = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };
      if (search) params.search = search;
      if (statusFilter && statusFilter !== 'ALL') params.status = statusFilter;
      if (directionFilter && directionFilter !== 'ALL') params.direction = directionFilter;

      const response = await apiClient.admin.getCalls(params);
      setCalls(response.data.calls);
      setPagination(prev => ({
        ...prev,
        ...response.data.pagination,
      }));
    } catch (error) {
      console.error('Failed to load calls:', error);
      toast.error(copy.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [copy.loadFailed, directionFilter, pagination.limit, pagination.page, search, statusFilter]);

  useEffect(() => {
    loadCalls();
  }, [loadCalls]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
    loadCalls();
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString(isTr ? 'tr-TR' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDirectionIcon = (direction) => {
    switch (direction) {
      case 'inbound':
        return <PhoneIncoming className="w-4 h-4 text-green-500" />;
      case 'outbound':
        return <PhoneOutgoing className="w-4 h-4 text-blue-500" />;
      default:
        return <Phone className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Aramalar</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {copy.description} ({pagination.total})
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder={copy.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 w-64"
            />
          </div>
          <Button type="submit" variant="outline">{copy.search}</Button>
        </form>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={copy.status} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{copy.allStatuses}</SelectItem>
            <SelectItem value="completed">{copy.statuses.completed}</SelectItem>
            <SelectItem value="ongoing">{copy.statuses.ongoing}</SelectItem>
            <SelectItem value="failed">{copy.statuses.failed}</SelectItem>
            <SelectItem value="missed">{copy.statuses.missed}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={directionFilter} onValueChange={setDirectionFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={copy.direction} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{copy.all}</SelectItem>
            <SelectItem value="inbound">{copy.directions.inbound}</SelectItem>
            <SelectItem value="outbound">{copy.directions.outbound}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Calls Table */}
      <div className="bg-white dark:bg-[#081224]/95 rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : calls.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <Phone className="w-12 h-12 text-gray-400 mb-4" />
            <p className="text-gray-500">{copy.noCalls}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#0B1730]/88">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.table.date}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.table.direction}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.table.phone}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.table.business}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.table.assistant}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.table.duration}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.table.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-white/10">
              {calls.map((call) => (
                <tr key={call.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{formatDate(call.startTime || call.createdAt)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {getDirectionIcon(call.direction)}
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {call.direction === 'inbound' ? copy.directions.inbound : copy.directions.outbound}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-mono text-gray-700 dark:text-gray-300">
                      {call.customerPhone || call.fromNumber || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{call.business?.name || '-'}</p>
                        <p className="text-xs text-gray-500">{call.user?.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{call.assistant?.name || '-'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{formatDuration(call.durationSeconds)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={STATUS_COLORS[call.status] || STATUS_COLORS.completed}>
                      {copy.statuses[call.status] || call.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-white/10">
            <p className="text-sm text-gray-500">
              {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} / {pagination.total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page === 1}
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page === pagination.pages}
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Privacy Notice */}
      <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
        <p className="text-sm text-yellow-700 dark:text-yellow-400">
          <strong>Gizlilik Notu:</strong> Arama transkriptleri ve kayıtları gizlilik nedeniyle bu listede gösterilmemektedir.
        </p>
      </div>
    </div>
  );
}
