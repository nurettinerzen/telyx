/**
 * Admin Users List Page
 */

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { useLanguage } from '@/contexts/LanguageContext';

export default function AdminUsersPage() {
  const { locale } = useLanguage();
  const isTr = locale === 'tr';
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

  const copy = useMemo(() => ({
    title: isTr ? 'Kullanıcılar' : 'Users',
    description: isTr ? 'Tüm platform kullanıcıları' : 'All platform users',
    searchPlaceholder: isTr ? 'E-posta, isim veya işletme ara...' : 'Search by email, name, or business...',
    search: isTr ? 'Ara' : 'Search',
    filterPlan: isTr ? 'Plan Filtrele' : 'Filter Plan',
    allPlans: isTr ? 'Tüm Planlar' : 'All Plans',
    active: isTr ? 'Aktif' : 'Active',
    suspended: isTr ? 'Dondurulmuş' : 'Suspended',
    status: isTr ? 'Durum' : 'Status',
    all: isTr ? 'Tümü' : 'All',
    lifecyclePlaceholder: isTr ? 'Abonelik Yaşam Döngüsü' : 'Subscription Lifecycle',
    allLifecycles: isTr ? 'Tüm Yaşam Döngüleri' : 'All Lifecycles',
    lifecycleLabels: {
      ACTIVE: isTr ? 'Aktif Abonelik' : 'Active Subscription',
      TRIAL_EXPIRED: isTr ? 'Denemesi Biten' : 'Expired Trial',
      PAID_LAPSED: isTr ? 'Süresi Biten Paket' : 'Expired Paid Plan',
      CANCEL_SCHEDULED: isTr ? 'Dönem Sonu İptal Planlı' : 'Cancellation Scheduled',
      NONE: isTr ? 'Abonelik Yok' : 'No Subscription',
    },
    lifecycleOptions: {
      TRIAL_EXPIRED: isTr ? 'Denemesi Biten' : 'Expired Trial',
      PAID_LAPSED: isTr ? 'Yenilenmeyen Paket' : 'Unrenewed Plan',
      CANCEL_SCHEDULED: isTr ? 'İptal Planlı' : 'Cancellation Scheduled',
    },
    planLabels: {
      ENTERPRISE: isTr ? 'Kurumsal' : 'Enterprise',
      PRO: 'Pro',
      STARTER: 'Starter',
      PAYG: isTr ? 'Kullandıkça Öde' : 'Pay As You Go',
      TRIAL: isTr ? 'Deneme' : 'Trial',
      FREE: isTr ? 'Ücretsiz' : 'Free',
    },
    noUsers: isTr ? 'Kullanıcı bulunamadı' : 'No users found',
    loadFailed: isTr ? 'Kullanıcılar yüklenemedi' : 'Failed to load users',
    suspendSuccess: isTr ? 'Kullanıcı donduruldu' : 'User suspended',
    activateSuccess: isTr ? 'Kullanıcı aktif edildi' : 'User activated',
    actionFailed: isTr ? 'İşlem başarısız' : 'Action failed',
    deleteConfirm: isTr ? 'kullanıcısını silmek istediğinize emin misiniz?' : 'Are you sure you want to delete this user?',
    deleteSuccess: isTr ? 'Kullanıcı silindi' : 'User deleted',
    deleteFailed: isTr ? 'Kullanıcı silinemedi' : 'Failed to delete user',
    periodEnd: isTr ? 'Dönem Sonu' : 'Period End',
    assistantCallSummary: (assistants, calls) => isTr ? `${assistants} asistan, ${calls} arama` : `${assistants} assistants, ${calls} calls`,
    detail: isTr ? 'Detay' : 'Details',
    activate: isTr ? 'Aktif Et' : 'Activate',
    suspend: isTr ? 'Dondur' : 'Suspend',
    delete: isTr ? 'Sil' : 'Delete',
    suspendTitle: isTr ? 'Kullanıcıyı Dondur' : 'Suspend User',
    activateTitle: isTr ? 'Kullanıcıyı Aktif Et' : 'Activate User',
    suspendReason: isTr ? 'Dondurma Nedeni (Opsiyonel)' : 'Suspend Reason (Optional)',
    reasonPlaceholder: isTr ? 'Neden...' : 'Reason...',
    businessColumn: isTr ? 'İşletme' : 'Business',
    userColumn: isTr ? 'Kullanıcı' : 'User',
    planColumn: isTr ? 'Plan' : 'Plan',
    usageColumn: isTr ? 'Kullanım' : 'Usage',
    actionColumn: isTr ? 'İşlem' : 'Action',
  }), [isTr]);

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
      toast.error(copy.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [copy.loadFailed, lifecycleFilter, pagination.limit, pagination.page, planFilter, search, suspendedFilter]);

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
    return new Date(date).toLocaleDateString(isTr ? 'tr-TR' : 'en-US', {
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
      toast.success(isSuspending ? copy.suspendSuccess : copy.activateSuccess);
      setSuspendModal({ open: false, user: null, action: 'suspend' });
      setSuspendReason('');
      loadUsers();
    } catch (error) {
      console.error('Failed to suspend/activate user:', error);
      toast.error(copy.actionFailed);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async (user) => {
    if (!confirm(`${user.email} ${copy.deleteConfirm}`)) return;

    try {
      await apiClient.admin.deleteUser(user.id);
      toast.success(copy.deleteSuccess);
      loadUsers();
    } catch (error) {
      console.error('Failed to delete user:', error);
      toast.error(copy.deleteFailed);
    }
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

        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={copy.filterPlan} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{copy.allPlans}</SelectItem>
            <SelectItem value="ENTERPRISE">{copy.planLabels.ENTERPRISE}</SelectItem>
            <SelectItem value="PRO">{copy.planLabels.PRO}</SelectItem>
            <SelectItem value="STARTER">{copy.planLabels.STARTER}</SelectItem>
            <SelectItem value="PAYG">{copy.planLabels.PAYG}</SelectItem>
            <SelectItem value="TRIAL">{copy.planLabels.TRIAL}</SelectItem>
            <SelectItem value="FREE">{copy.planLabels.FREE}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={suspendedFilter || 'ALL'} onValueChange={(v) => setSuspendedFilter(v === 'ALL' ? '' : v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={copy.status} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{copy.all}</SelectItem>
            <SelectItem value="false">{copy.active}</SelectItem>
            <SelectItem value="true">{copy.suspended}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={lifecycleFilter} onValueChange={setLifecycleFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder={copy.lifecyclePlaceholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{copy.allLifecycles}</SelectItem>
            <SelectItem value="TRIAL_EXPIRED">{copy.lifecycleOptions.TRIAL_EXPIRED}</SelectItem>
            <SelectItem value="PAID_LAPSED">{copy.lifecycleOptions.PAID_LAPSED}</SelectItem>
            <SelectItem value="CANCEL_SCHEDULED">{copy.lifecycleOptions.CANCEL_SCHEDULED}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-[#081224]/95 rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <Users className="w-12 h-12 text-gray-400 mb-4" />
            <p className="text-gray-500">{copy.noUsers}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#0B1730]/88">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.userColumn}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.businessColumn}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.planColumn}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.usageColumn}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.status}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.actionColumn}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-white/10">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.03]">
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
                        {copy.lifecycleLabels[user.subscriptionLifecycle] || user.subscriptionStatus || '-'}
                      </p>
                      {user.currentPeriodEnd && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {copy.periodEnd}: {formatDate(user.currentPeriodEnd)}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm">
                      <p className="text-gray-700 dark:text-gray-300">{user.minutesUsed || 0} dk</p>
                      <p className="text-gray-500">{copy.assistantCallSummary(user.assistantsCount, user.callsCount)}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {user.suspended ? (
                      <Badge variant="destructive">{copy.suspended}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-green-600 border-green-600">{copy.active}</Badge>
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
                            {copy.detail}
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
                              {copy.activate}
                            </>
                          ) : (
                            <>
                              <Ban className="w-4 h-4 mr-2" />
                              {copy.suspend}
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteUser(user)}
                          className="text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          {copy.delete}
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

      {/* Suspend Modal */}
      <Dialog open={suspendModal.open} onOpenChange={(open) => setSuspendModal({ ...suspendModal, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {suspendModal.action === 'suspend' ? copy.suspendTitle : copy.activateTitle}
            </DialogTitle>
            <DialogDescription>
              {suspendModal.user?.email}
            </DialogDescription>
          </DialogHeader>
          {suspendModal.action === 'suspend' && (
            <div className="py-4">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {copy.suspendReason}
              </label>
              <Input
                className="mt-2"
                placeholder={copy.reasonPlaceholder}
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
              {suspendModal.action === 'suspend' ? copy.suspend : copy.activate}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
