/**
 * Admin cancellation insights page
 */

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
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

const REASON_OPTIONS = [
  { value: 'ALL', label: 'Tum nedenler' },
  { value: 'LOW_USAGE', label: 'Cok kullanmiyor' },
  { value: 'NO_NEED', label: 'Artik ihtiyac yok' },
  { value: 'TOO_EXPENSIVE', label: 'Pahali' },
  { value: 'LOW_QUALITY', label: 'Kalite dusuk' },
  { value: 'MISSING_FEATURES', label: 'Ozellikler yetersiz' },
  { value: 'TOO_COMPLEX', label: 'Karmasik' },
  { value: 'OTHER', label: 'Diger' },
  { value: 'UNSPECIFIED', label: 'Belirtilmedi' },
];

const LIFECYCLE_OPTIONS = [
  { value: 'ALL', label: 'Tum durumlar' },
  { value: 'SCHEDULED', label: 'Planli iptal' },
  { value: 'ENDED', label: 'Donemi bitmis' },
  { value: 'REACTIVATED', label: 'Geri alinmis' },
];

const LIFECYCLE_TONES = {
  SCHEDULED: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  ENDED: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  REACTIVATED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  UNKNOWN: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export default function AdminCancellationsPage() {
  const [loading, setLoading] = useState(true);
  const [cancellations, setCancellations] = useState([]);
  const [summary, setSummary] = useState({
    total: 0,
    scheduled: 0,
    ended: 0,
    reactivated: 0,
    feedbackProvided: 0,
  });
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [search, setSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState('ALL');
  const [lifecycleFilter, setLifecycleFilter] = useState('ALL');

  const loadCancellations = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };

      if (search) params.search = search;
      if (reasonFilter !== 'ALL') params.reasonCode = reasonFilter;
      if (lifecycleFilter !== 'ALL') params.lifecycle = lifecycleFilter;

      const response = await apiClient.admin.getCancellations(params);
      setCancellations(response.data.cancellations || []);
      setSummary(response.data.summary || {});
      setPagination((prev) => ({
        ...prev,
        ...response.data.pagination,
      }));
    } catch (error) {
      console.error('Failed to load cancellations:', error);
      toast.error('Iptal kayitlari yuklenemedi');
    } finally {
      setLoading(false);
    }
  }, [lifecycleFilter, pagination.limit, pagination.page, reasonFilter, search]);

  useEffect(() => {
    loadCancellations();
  }, [loadCancellations]);

  const handleSearch = (event) => {
    event.preventDefault();
    if (pagination.page === 1) {
      loadCancellations();
      return;
    }
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Iptaller</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Kullanici iptalleri, donem sonu cikislari ve sonrasinda birakilan nedenler.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Toplam talep', value: summary.total || 0 },
          { label: 'Planli iptal', value: summary.scheduled || 0 },
          { label: 'Donemi biten', value: summary.ended || 0 },
          { label: 'Geri bildirim gelen', value: summary.feedbackProvided || 0 },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
          >
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
              {item.label}
            </p>
            <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
              {Number(item.value || 0).toLocaleString('tr-TR')}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Sirket, sahip veya e-posta ara..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-10 w-72"
            />
          </div>
          <Button type="submit" variant="outline">Ara</Button>
        </form>

        <Select value={reasonFilter} onValueChange={setReasonFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Iptal nedeni" />
          </SelectTrigger>
          <SelectContent>
            {REASON_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={lifecycleFilter} onValueChange={setLifecycleFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Durum" />
          </SelectTrigger>
          <SelectContent>
            {LIFECYCLE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
          </div>
        ) : cancellations.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <AlertTriangle className="mb-4 h-10 w-10 text-gray-400" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Filtreye uyan iptal kaydi bulunamadi.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Sirket</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Plan</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Durum</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Neden</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Not</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Talep</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Donem sonu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {cancellations.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <Building2 className="mt-0.5 h-4 w-4 text-gray-400" />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{item.businessName}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{item.ownerEmail}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {item.plan}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={LIFECYCLE_TONES[item.lifecycle] || LIFECYCLE_TONES.UNKNOWN}>
                        {item.lifecycle}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <Badge variant="outline">{item.reasonCode}</Badge>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{item.reasonLabel}</p>
                      </div>
                    </td>
                    <td className="max-w-sm px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {item.reasonDetail || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(item.requestedAt)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(item.cancelAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination.pages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 dark:border-gray-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {((pagination.page - 1) * pagination.limit) + 1}
              {' - '}
              {Math.min(pagination.page * pagination.limit, pagination.total)}
              {' / '}
              {pagination.total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page === 1}
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page === pagination.pages}
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
