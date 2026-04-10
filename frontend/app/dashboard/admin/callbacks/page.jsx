/**
 * Admin Callbacks List Page
 * Manage callback requests with status updates
 */

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  PhoneForwarded,
  Search,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Shield,
  Loader2,
  Building2,
  Clock,
  Calendar,
  CheckCircle,
  XCircle,
  AlertCircle,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { apiClient } from '@/lib/api';
import { toast } from 'sonner';


const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const STATUS_LABELS = {
  pending: 'Bekliyor',
  in_progress: 'İşlemde',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
  failed: 'Başarısız',
};

const PRIORITY_COLORS = {
  low: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  normal: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export default function AdminCallbacksPage() {
  const [loading, setLoading] = useState(true);
  const [callbacks, setCallbacks] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Update modal
  const [updateModal, setUpdateModal] = useState({ open: false, callback: null });
  const [updateData, setUpdateData] = useState({ status: '', notes: '' });
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadCallbacks();
  }, [pagination.page, statusFilter]);

  const loadCallbacks = async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };
      if (search) params.search = search;
      if (statusFilter && statusFilter !== 'ALL') params.status = statusFilter;

      const response = await apiClient.admin.getCallbacks(params);
      setCallbacks(response.data.callbacks);
      setPagination(prev => ({
        ...prev,
        ...response.data.pagination,
      }));
    } catch (error) {
      console.error('Failed to load callbacks:', error);
      toast.error('Callback istekleri yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
    loadCallbacks();
  };

  const openUpdateModal = (callback) => {
    setUpdateModal({ open: true, callback });
    setUpdateData({ status: callback.status, notes: callback.adminNotes || '' });
  };

  const handleUpdate = async () => {
    if (!updateModal.callback) return;

    setActionLoading(true);
    try {
      await apiClient.admin.updateCallback(updateModal.callback.id, updateData);
      toast.success('Callback güncellendi');
      setUpdateModal({ open: false, callback: null });
      loadCallbacks();
    } catch (error) {
      console.error('Failed to update callback:', error);
      toast.error('Güncelleme başarısız');
    } finally {
      setActionLoading(false);
    }
  };

  const quickUpdateStatus = async (callback, newStatus) => {
    try {
      await apiClient.admin.updateCallback(callback.id, { status: newStatus });
      toast.success('Durum güncellendi');
      loadCallbacks();
    } catch (error) {
      console.error('Failed to update status:', error);
      toast.error('Durum güncellenemedi');
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Callback İstekleri</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Geri arama talepleri ({pagination.total})
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Telefon veya isim ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 w-64"
            />
          </div>
          <Button type="submit" variant="outline">Ara</Button>
        </form>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Durum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tüm Durumlar</SelectItem>
            <SelectItem value="pending">Bekliyor</SelectItem>
            <SelectItem value="in_progress">İşlemde</SelectItem>
            <SelectItem value="completed">Tamamlandı</SelectItem>
            <SelectItem value="cancelled">İptal</SelectItem>
            <SelectItem value="failed">Başarısız</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Callbacks Table */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : callbacks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <PhoneForwarded className="w-12 h-12 text-gray-400 mb-4" />
            <p className="text-gray-500">Callback isteği bulunamadı</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tarih</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Müşteri</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">İşletme</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Konu</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Öncelik</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Durum</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {callbacks.map((callback) => (
                <tr key={callback.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{formatDate(callback.createdAt)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{callback.customerName || '-'}</p>
                      <p className="text-sm text-gray-500 font-mono">{callback.customerPhone}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{callback.business?.name || '-'}</p>
                        <p className="text-xs text-gray-500">{callback.user?.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[200px]">
                      <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{callback.reason || '-'}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={PRIORITY_COLORS[callback.priority] || PRIORITY_COLORS.normal}>
                      {callback.priority || 'normal'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={STATUS_COLORS[callback.status] || STATUS_COLORS.pending}>
                      {STATUS_LABELS[callback.status] || callback.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openUpdateModal(callback)}>
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Düzenle
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => quickUpdateStatus(callback, 'in_progress')}
                          disabled={callback.status === 'in_progress'}
                        >
                          <Clock className="w-4 h-4 mr-2 text-blue-500" />
                          İşlemde
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => quickUpdateStatus(callback, 'completed')}
                          disabled={callback.status === 'completed'}
                        >
                          <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                          Tamamlandı
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => quickUpdateStatus(callback, 'cancelled')}
                          disabled={callback.status === 'cancelled'}
                        >
                          <XCircle className="w-4 h-4 mr-2 text-gray-500" />
                          İptal Et
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-800">
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

      {/* Update Modal */}
      <Dialog open={updateModal.open} onOpenChange={(open) => setUpdateModal({ ...updateModal, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Callback Güncelle</DialogTitle>
            <DialogDescription>
              {updateModal.callback?.customerName} - {updateModal.callback?.customerPhone}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Durum</label>
              <Select value={updateData.status} onValueChange={(v) => setUpdateData(prev => ({ ...prev, status: v }))}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Durum seç" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Bekliyor</SelectItem>
                  <SelectItem value="in_progress">İşlemde</SelectItem>
                  <SelectItem value="completed">Tamamlandı</SelectItem>
                  <SelectItem value="cancelled">İptal</SelectItem>
                  <SelectItem value="failed">Başarısız</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Admin Notları</label>
              <Textarea
                className="mt-2"
                placeholder="Notlar..."
                value={updateData.notes}
                onChange={(e) => setUpdateData(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateModal({ open: false, callback: null })}>
              İptal
            </Button>
            <Button onClick={handleUpdate} disabled={actionLoading}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
