/**
 * Admin Assistants List Page
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Bot,
  Search,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Eye,
  Trash2,
  Loader2,
  Building2,
  PhoneCall,
  Waves,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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

const ASSISTANT_TYPE_LABELS = {
  phone: 'Telefon',
  text: 'Yazılı',
};

const CALL_DIRECTION_LABELS = {
  inbound: 'Gelen',
  outbound: 'Giden',
  outbound_campaign: 'Giden kampanya',
};

export default function AdminAssistantsPage() {
  const [loading, setLoading] = useState(true);
  const [assistants, setAssistants] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });

  // Filters
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Delete modal
  const [deleteModal, setDeleteModal] = useState({ open: false, assistant: null });
  const [actionLoading, setActionLoading] = useState(false);

  const loadAssistants = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };
      if (searchQuery) params.search = searchQuery;
      if (statusFilter && statusFilter !== 'ALL') params.isActive = statusFilter;

      const response = await apiClient.admin.getAssistants(params);
      setAssistants(response.data.assistants);
      setPagination(prev => ({
        ...prev,
        ...response.data.pagination,
      }));
    } catch (error) {
      console.error('Failed to load assistants:', error);
      toast.error('Asistanlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [pagination.limit, pagination.page, searchQuery, statusFilter]);

  useEffect(() => {
    loadAssistants();
  }, [loadAssistants]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery !== search) {
      setSearchQuery(search);
      if (pagination.page !== 1) {
        setPagination(prev => ({ ...prev, page: 1 }));
      }
      return;
    }
    if (pagination.page === 1) {
      loadAssistants();
      return;
    }
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleDelete = async () => {
    if (!deleteModal.assistant) return;

    setActionLoading(true);
    try {
      await apiClient.admin.deleteAssistant(deleteModal.assistant.id);
      toast.success('Asistan silindi');
      setDeleteModal({ open: false, assistant: null });
      loadAssistants();
    } catch (error) {
      console.error('Failed to delete assistant:', error);
      toast.error('Asistan silinemedi');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Asistanlar</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Tüm platform asistanları ({pagination.total})
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Asistan adı veya işletme ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 w-64"
            />
          </div>
          <Button type="submit" variant="outline">Ara</Button>
        </form>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Durum filtrele" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tümü</SelectItem>
            <SelectItem value="true">Aktif</SelectItem>
            <SelectItem value="false">Pasif</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Assistants Table */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : assistants.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <Bot className="w-12 h-12 text-gray-400 mb-4" />
            <p className="text-gray-500">Asistan bulunamadı</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Asistan</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">İşletme</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Durum</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Kanal</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Hat</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Konuşma</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {assistants.map((assistant) => (
                <tr key={assistant.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                        <Bot className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{assistant.name}</p>
                        <p className="text-xs text-gray-500 truncate max-w-[200px]">{assistant.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-gray-700 dark:text-gray-300">{assistant.businessName || '-'}</p>
                        <p className="text-xs text-gray-500">{assistant.ownerEmail || '-'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={assistant.isActive ? 'outline' : 'secondary'} className={assistant.isActive ? 'text-green-600 border-green-600' : ''}>
                      {assistant.isActive ? 'Aktif' : 'Pasif'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Waves className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {ASSISTANT_TYPE_LABELS[assistant.assistantType] || assistant.assistantType || '-'}
                        {' / '}
                        {CALL_DIRECTION_LABELS[assistant.callDirection] || assistant.callDirection || '-'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{assistant.phoneNumbersCount || 0} hat</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <PhoneCall className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {assistant.callbacksCount || 0} geri arama, {assistant.conversationsCount || 0} sohbet
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                          <Link href={assistant.ownerUserId ? `/dashboard/admin/users/${assistant.ownerUserId}` : `/dashboard/admin/users?search=${encodeURIComponent(assistant.ownerEmail || assistant.businessName || assistant.name)}`}>
                            <Eye className="w-4 h-4 mr-2" />
                            Sahibi gör
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteModal({ open: true, assistant })}
                          className="text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Sil
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

      {/* Delete Modal */}
      <Dialog open={deleteModal.open} onOpenChange={(open) => setDeleteModal({ ...deleteModal, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asistanı Sil</DialogTitle>
            <DialogDescription>
              &quot;{deleteModal.assistant?.name}&quot; asistanını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteModal({ open: false, assistant: null })}>
              İptal
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={actionLoading}
            >
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Sil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
