/**
 * Admin Audit Log Page
 * View all admin actions for compliance and tracking
 */

'use client';

import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
  Shield,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Calendar,
  User,
  FileText,
  Eye,
  Edit,
  Trash2,
  UserPlus,
  Ban,
  CheckCircle,
  Key,
  Settings,
  Clock,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { apiClient } from '@/lib/api';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';


const ACTION_COLORS = {
  VIEW: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  CREATE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  UPDATE: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  SUSPEND: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  ACTIVATE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  RESET_PASSWORD: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  LOGIN: 'bg-gray-100 text-gray-700 dark:bg-white/8 dark:text-gray-400',
};

const ACTION_LABELS = {
  VIEW: 'Görüntüleme',
  CREATE: 'Oluşturma',
  UPDATE: 'Güncelleme',
  DELETE: 'Silme',
  SUSPEND: 'Dondurma',
  ACTIVATE: 'Aktifleştirme',
  RESET_PASSWORD: 'Şifre Sıfırlama',
  LOGIN: 'Giriş',
};

const ACTION_ICONS = {
  VIEW: Eye,
  CREATE: UserPlus,
  UPDATE: Edit,
  DELETE: Trash2,
  SUSPEND: Ban,
  ACTIVATE: CheckCircle,
  RESET_PASSWORD: Key,
  LOGIN: User,
};

const ENTITY_LABELS = {
  User: 'Kullanıcı',
  Business: 'İşletme',
  Assistant: 'Asistan',
  Subscription: 'Abonelik',
  CallLog: 'Arama',
  CallbackRequest: 'Geri Arama',
  PhoneNumber: 'Telefon No',
};

export default function AdminAuditLogPage() {
  const { locale } = useLanguage();
  const isTr = locale === 'tr';
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });

  // Filters
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [entityFilter, setEntityFilter] = useState('ALL');

  // Detail modal
  const [detailModal, setDetailModal] = useState({ open: false, log: null });

  const copy = useMemo(() => ({
    title: isTr ? 'Denetim Kaydı' : 'Audit Log',
    description: isTr ? 'Admin işlem geçmişi' : 'Admin activity history',
    searchPlaceholder: isTr ? 'Admin e-postası ara...' : 'Search admin email...',
    search: isTr ? 'Ara' : 'Search',
    actionType: isTr ? 'İşlem Tipi' : 'Action Type',
    entityType: isTr ? 'Varlık Tipi' : 'Entity Type',
    allActions: isTr ? 'Tüm İşlemler' : 'All Actions',
    allEntities: isTr ? 'Tüm Varlıklar' : 'All Entities',
    notFound: isTr ? 'Denetim kaydı bulunamadı' : 'No audit log found',
    loadFailed: isTr ? 'Denetim kayıtları yüklenemedi' : 'Failed to load audit logs',
    table: {
      date: isTr ? 'Tarih' : 'Date',
      admin: isTr ? 'Admin' : 'Admin',
      action: isTr ? 'İşlem' : 'Action',
      entity: isTr ? 'Varlık' : 'Entity',
      id: 'ID',
      detail: isTr ? 'Detay' : 'Details',
    },
  }), [isTr]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };
      if (search) params.search = search;
      if (actionFilter && actionFilter !== 'ALL') params.action = actionFilter;
      if (entityFilter && entityFilter !== 'ALL') params.entityType = entityFilter;

      const response = await apiClient.admin.getAuditLogs(params);
      setLogs(response.data.logs);
      setPagination(prev => ({
        ...prev,
        ...response.data.pagination,
      }));
    } catch (error) {
      console.error('Failed to load audit logs:', error);
      toast.error(copy.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, copy.loadFailed, entityFilter, pagination.limit, pagination.page, search]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
    loadLogs();
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString(isTr ? 'tr-TR' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getActionIcon = (action) => {
    const Icon = ACTION_ICONS[action] || Settings;
    return <Icon className="w-4 h-4" />;
  };

  const formatChanges = (changes) => {
    if (!changes) return null;
    return (
      <pre className="max-h-64 overflow-auto rounded-lg bg-gray-100 p-3 text-xs dark:bg-[#0B1730]/88">
        {JSON.stringify(changes, null, 2)}
      </pre>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{copy.title}</h1>
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

        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={copy.actionType} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{copy.allActions}</SelectItem>
            <SelectItem value="VIEW">Görüntüleme</SelectItem>
            <SelectItem value="CREATE">Oluşturma</SelectItem>
            <SelectItem value="UPDATE">Güncelleme</SelectItem>
            <SelectItem value="DELETE">Silme</SelectItem>
            <SelectItem value="SUSPEND">Dondurma</SelectItem>
            <SelectItem value="ACTIVATE">Aktifleştirme</SelectItem>
            <SelectItem value="RESET_PASSWORD">Şifre Sıfırlama</SelectItem>
          </SelectContent>
        </Select>

        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={copy.entityType} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{copy.allEntities}</SelectItem>
            <SelectItem value="User">Kullanıcı</SelectItem>
            <SelectItem value="Business">İşletme</SelectItem>
            <SelectItem value="Assistant">Asistan</SelectItem>
            <SelectItem value="Subscription">Abonelik</SelectItem>
            <SelectItem value="CallbackRequest">{isTr ? 'Geri Arama' : 'Callback'}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Logs Table */}
      <div className="bg-white dark:bg-[#081224]/95 rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <FileText className="w-12 h-12 text-gray-400 mb-4" />
            <p className="text-gray-500">{copy.notFound}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#0B1730]/88">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.table.date}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.table.admin}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.table.action}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.table.entity}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.table.id}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.table.detail}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-white/10">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{formatDate(log.createdAt)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{log.adminEmail}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge className={ACTION_COLORS[log.action] || ACTION_COLORS.VIEW}>
                        {getActionIcon(log.action)}
                        <span className="ml-1">{ACTION_LABELS[log.action] || log.action}</span>
                      </Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {ENTITY_LABELS[log.entityType] || log.entityType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono text-gray-500 truncate max-w-[150px] block">
                      {log.entityId}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDetailModal({ open: true, log })}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
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

      {/* Detail Modal */}
      <Dialog open={detailModal.open} onOpenChange={(open) => setDetailModal({ ...detailModal, open })}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isTr ? 'Denetim Kaydı Detayı' : 'Audit Log Detail'}</DialogTitle>
            <DialogDescription>
              {detailModal.log && formatDate(detailModal.log.createdAt)}
            </DialogDescription>
          </DialogHeader>
          {detailModal.log && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Admin</label>
                  <p className="text-sm text-gray-900 dark:text-white mt-1">{detailModal.log.adminEmail}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">İşlem</label>
                  <div className="mt-1">
                    <Badge className={ACTION_COLORS[detailModal.log.action]}>
                      {ACTION_LABELS[detailModal.log.action] || detailModal.log.action}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Varlık Tipi</label>
                  <p className="text-sm text-gray-900 dark:text-white mt-1">
                    {ENTITY_LABELS[detailModal.log.entityType] || detailModal.log.entityType}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Varlık ID</label>
                  <p className="text-sm font-mono text-gray-900 dark:text-white mt-1">{detailModal.log.entityId}</p>
                </div>
                {detailModal.log.ipAddress && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase">IP Adresi</label>
                    <p className="text-sm font-mono text-gray-900 dark:text-white mt-1">{detailModal.log.ipAddress}</p>
                  </div>
                )}
              </div>

              {detailModal.log.changes && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">Değişiklikler</label>
                  {formatChanges(detailModal.log.changes)}
                </div>
              )}

              {detailModal.log.metadata && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">Metadata</label>
                  {formatChanges(detailModal.log.metadata)}
                </div>
              )}

              {detailModal.log.userAgent && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">User Agent</label>
                  <p className="text-xs text-gray-500 mt-1 break-all">{detailModal.log.userAgent}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
