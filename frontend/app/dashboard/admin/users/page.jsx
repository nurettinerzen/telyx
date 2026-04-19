/**
 * Admin Users List Page
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Eye,
  Ban,
  CheckCircle,
  Trash2,
  Loader2,
  Building2,
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
import { PLAN_COLORS } from '@/lib/planConfig';

const SUBSCRIPTION_LIFECYCLE_LABELS = {
  ACTIVE: 'Aktif abonelik',
  TRIAL_EXPIRED: 'Trial bitmis',
  PAID_LAPSED: 'Suresi bitmis paket',
  CANCEL_SCHEDULED: 'Donem sonu iptal planli',
  NONE: 'Abonelik yok',
};

export default function AdminUsersPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });

  // Filters
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [planFilter, setPlanFilter] = useState(() => searchParams.get('plan') || 'ALL');
  const [suspendedFilter, setSuspendedFilter] = useState(() => searchParams.get('suspended') || '');
  const [lifecycleFilter, setLifecycleFilter] = useState(() => searchParams.get('lifecycle') || 'ALL');

  // Modals
  const [suspendModal, setSuspendModal] = useState({ open: false, user: null, action: 'suspend' });
  const [suspendReason, setSuspendReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };
      if (search) params.search = search;
      if (planFilter && planFilter !== 'ALL') params.plan = planFilter;
      if (suspendedFilter) params.suspended = suspendedFilter;
      if (lifecycleFilter && lifecycleFilter !== 'ALL') params.lifecycle = lifecycleFilter;

      const response = await apiClient.admin.getUsers(params);
      setUsers(response.data.users);
      setPagination(prev => ({
        ...prev,
        ...response.data.pagination,
      }));
    } catch (error) {
      console.error('Failed to load users:', error);
      toast.error('Kullanıcılar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [lifecycleFilter, pagination.limit, pagination.page, planFilter, search, suspendedFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (pagination.page === 1) {
      loadUsers();
      return;
    }
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const handleSuspendAction = async () => {
    if (!suspendModal.user) return;

    setActionLoading(true);
    try {
      const isSuspending = suspendModal.action === 'suspend';
      await apiClient.admin.suspendUser(suspendModal.user.id, {
        suspended: isSuspending,
        reason: isSuspending ? suspendReason : null,
      });
      toast.success(isSuspending ? 'Kullanıcı donduruldu' : 'Kullanıcı aktif edildi');
      setSuspendModal({ open: false, user: null, action: 'suspend' });
      setSuspendReason('');
      loadUsers();
    } catch (error) {
      console.error('Failed to suspend/activate user:', error);
      toast.error('İşlem başarısız');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async (user) => {
    if (!confirm(`${user.email} kullanıcısını silmek istediğinize emin misiniz?`)) return;

    try {
      await apiClient.admin.deleteUser(user.id);
      toast.success('Kullanıcı silindi');
      loadUsers();
    } catch (error) {
      console.error('Failed to delete user:', error);
      toast.error('Kullanıcı silinemedi');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Kullanıcılar</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Tüm platform kullanıcıları ({pagination.total})
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Email, isim veya işletme ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 w-64"
            />
          </div>
          <Button type="submit" variant="outline">Ara</Button>
        </form>

        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Plan filtrele" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tüm Planlar</SelectItem>
            <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
            <SelectItem value="PRO">Pro</SelectItem>
            <SelectItem value="STARTER">Starter</SelectItem>
            <SelectItem value="PAYG">PAYG</SelectItem>
            <SelectItem value="TRIAL">Trial</SelectItem>
            <SelectItem value="FREE">Free</SelectItem>
          </SelectContent>
        </Select>

        <Select value={suspendedFilter || 'ALL'} onValueChange={(v) => setSuspendedFilter(v === 'ALL' ? '' : v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Durum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tümü</SelectItem>
            <SelectItem value="false">Aktif</SelectItem>
            <SelectItem value="true">Dondurulmuş</SelectItem>
          </SelectContent>
        </Select>

        <Select value={lifecycleFilter} onValueChange={setLifecycleFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Abonelik yasam dongusu" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tum yasam donguleri</SelectItem>
            <SelectItem value="TRIAL_EXPIRED">Trial bitmis</SelectItem>
            <SelectItem value="PAID_LAPSED">Yenilenmeyen paket</SelectItem>
            <SelectItem value="CANCEL_SCHEDULED">Iptal planli</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <Users className="w-12 h-12 text-gray-400 mb-4" />
            <p className="text-gray-500">Kullanıcı bulunamadı</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Kullanıcı</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">İşletme</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Plan</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Kullanım</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Durum</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{user.name || '-'}</p>
                      <p className="text-sm text-gray-500">{user.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-700 dark:text-gray-300">{user.businessName || '-'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <Badge className={PLAN_COLORS[user.plan] || PLAN_COLORS.FREE}>
                        {user.plan}
                      </Badge>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {SUBSCRIPTION_LIFECYCLE_LABELS[user.subscriptionLifecycle] || user.subscriptionStatus || 'Bilinmiyor'}
                      </p>
                      {user.currentPeriodEnd && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Donem sonu: {formatDate(user.currentPeriodEnd)}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm">
                      <p className="text-gray-700 dark:text-gray-300">{user.minutesUsed || 0} dk</p>
                      <p className="text-gray-500">{user.assistantsCount} asistan, {user.callsCount} arama</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {user.suspended ? (
                      <Badge variant="destructive">Dondurulmuş</Badge>
                    ) : (
                      <Badge variant="outline" className="text-green-600 border-green-600">Aktif</Badge>
                    )}
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
                          <Link href={`/dashboard/admin/users/${user.id}`}>
                            <Eye className="w-4 h-4 mr-2" />
                            Detay
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setSuspendModal({
                            open: true,
                            user,
                            action: user.suspended ? 'activate' : 'suspend'
                          })}
                        >
                          {user.suspended ? (
                            <>
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Aktif Et
                            </>
                          ) : (
                            <>
                              <Ban className="w-4 h-4 mr-2" />
                              Dondur
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteUser(user)}
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

      {/* Suspend Modal */}
      <Dialog open={suspendModal.open} onOpenChange={(open) => setSuspendModal({ ...suspendModal, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {suspendModal.action === 'suspend' ? 'Kullanıcıyı Dondur' : 'Kullanıcıyı Aktif Et'}
            </DialogTitle>
            <DialogDescription>
              {suspendModal.user?.email}
            </DialogDescription>
          </DialogHeader>
          {suspendModal.action === 'suspend' && (
            <div className="py-4">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Dondurma Nedeni (opsiyonel)
              </label>
              <Input
                className="mt-2"
                placeholder="Neden..."
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendModal({ open: false, user: null, action: 'suspend' })}>
              İptal
            </Button>
            <Button
              variant={suspendModal.action === 'suspend' ? 'destructive' : 'default'}
              onClick={handleSuspendAction}
              disabled={actionLoading}
            >
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {suspendModal.action === 'suspend' ? 'Dondur' : 'Aktif Et'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
