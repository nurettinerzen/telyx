/**
 * Admin Subscriptions List Page
 * Manage user subscriptions and billing
 */

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CreditCard,
  Search,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Eye,
  Edit,
  Shield,
  Loader2,
  Building2,
  Calendar,
  DollarSign,
  Clock,
  AlertTriangle,
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


const STATUS_COLORS = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  trialing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  past_due: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  canceled: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  unpaid: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  pending_payment: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

const STATUS_LABELS = {
  active: 'Aktif',
  trialing: 'Deneme',
  past_due: 'Gecikmiş',
  canceled: 'İptal',
  unpaid: 'Ödenmemiş',
  pending_payment: 'Ödeme Bekliyor',
};

export default function AdminSubscriptionsPage() {
  const [loading, setLoading] = useState(true);
  const [subscriptions, setSubscriptions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });

  // Filters
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Edit modal
  const [editModal, setEditModal] = useState({ open: false, subscription: null });
  const [editData, setEditData] = useState({ plan: '', status: '', minutesIncluded: '' });
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadSubscriptions();
  }, [pagination.page, planFilter, statusFilter]);

  const loadSubscriptions = async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };
      if (search) params.search = search;
      if (planFilter && planFilter !== 'ALL') params.plan = planFilter;
      if (statusFilter && statusFilter !== 'ALL') params.status = statusFilter;

      const response = await apiClient.admin.getSubscriptions(params);
      setSubscriptions(response.data.subscriptions);
      setPagination(prev => ({
        ...prev,
        ...response.data.pagination,
      }));
    } catch (error) {
      console.error('Failed to load subscriptions:', error);
      toast.error('Abonelikler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
    loadSubscriptions();
  };

  const openEditModal = (subscription) => {
    setEditModal({ open: true, subscription });
    setEditData({
      plan: subscription.plan || '',
      status: subscription.status || '',
      minutesIncluded: subscription.minutesIncluded?.toString() || '',
    });
  };

  const handleEdit = async () => {
    if (!editModal.subscription) return;

    setActionLoading(true);
    try {
      const data = {
        plan: editData.plan,
        status: editData.status,
      };
      if (editData.minutesIncluded) {
        data.minutesIncluded = parseInt(editData.minutesIncluded);
      }

      await apiClient.admin.updateSubscription(editModal.subscription.id, data);
      toast.success('Abonelik güncellendi');
      setEditModal({ open: false, subscription: null });
      loadSubscriptions();
    } catch (error) {
      console.error('Failed to update subscription:', error);
      toast.error('Güncelleme başarısız');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount, currency = 'TRY') => {
    if (!amount) return '-';
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: currency,
    }).format(amount / 100);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Abonelikler</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Tüm platform abonelikleri ({pagination.total})
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Email veya işletme ara..."
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

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Durum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tüm Durumlar</SelectItem>
            <SelectItem value="active">Aktif</SelectItem>
            <SelectItem value="trialing">Deneme</SelectItem>
            <SelectItem value="past_due">Gecikmiş</SelectItem>
            <SelectItem value="canceled">İptal</SelectItem>
            <SelectItem value="pending_payment">Ödeme Bekliyor</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Subscriptions Table */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <CreditCard className="w-12 h-12 text-gray-400 mb-4" />
            <p className="text-gray-500">Abonelik bulunamadı</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Kullanıcı</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Plan</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Durum</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Dakika</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Dönem Sonu</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Ödeme</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {subscriptions.map((sub) => (
                <tr key={sub.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Building2 className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{sub.user?.businessName || sub.business?.name || '-'}</p>
                        <p className="text-sm text-gray-500">{sub.user?.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={PLAN_COLORS[sub.plan] || PLAN_COLORS.FREE}>
                      {sub.plan}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={STATUS_COLORS[sub.status] || STATUS_COLORS.active}>
                      {STATUS_LABELS[sub.status] || sub.status}
                    </Badge>
                    {sub.status === 'past_due' && (
                      <AlertTriangle className="inline-block w-4 h-4 ml-2 text-red-500" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm">
                      <p className="text-gray-900 dark:text-white">{sub.minutesUsed || 0} / {sub.minutesIncluded || 0}</p>
                      <p className="text-gray-500">dakika kullanıldı</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {formatDate(sub.currentPeriodEnd)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm">
                      <p className="text-gray-900 dark:text-white">
                        {sub.paymentProvider === 'stripe'
                          ? 'Stripe'
                          : sub.paymentProvider === 'stripe_brl'
                            ? 'Stripe (BR)'
                            : 'Manual'}
                      </p>
                      {sub.stripeSubscriptionId && (
                        <p className="text-xs text-gray-500 font-mono truncate max-w-[100px]">{sub.stripeSubscriptionId}</p>
                      )}
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
                          <Link href={`/dashboard/admin/users/${sub.userId}`}>
                            <Eye className="w-4 h-4 mr-2" />
                            Kullanıcıyı Gör
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEditModal(sub)}>
                          <Edit className="w-4 h-4 mr-2" />
                          Düzenle
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

      {/* Edit Modal */}
      <Dialog open={editModal.open} onOpenChange={(open) => setEditModal({ ...editModal, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aboneliği Düzenle</DialogTitle>
            <DialogDescription>
              {editModal.subscription?.user?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Plan</label>
              <Select value={editData.plan} onValueChange={(v) => setEditData(prev => ({ ...prev, plan: v }))}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Plan seç" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FREE">Free</SelectItem>
                  <SelectItem value="TRIAL">Trial</SelectItem>
                  <SelectItem value="PAYG">PAYG</SelectItem>
                  <SelectItem value="STARTER">Starter</SelectItem>
                  <SelectItem value="PRO">Pro</SelectItem>
                  <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Durum</label>
              <Select value={editData.status} onValueChange={(v) => setEditData(prev => ({ ...prev, status: v }))}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Durum seç" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="trialing">Deneme</SelectItem>
                  <SelectItem value="past_due">Gecikmiş</SelectItem>
                  <SelectItem value="canceled">İptal</SelectItem>
                  <SelectItem value="pending_payment">Ödeme Bekliyor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Dahil Dakika</label>
              <Input
                type="number"
                className="mt-2"
                placeholder="Dakika miktarı"
                value={editData.minutesIncluded}
                onChange={(e) => setEditData(prev => ({ ...prev, minutesIncluded: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModal({ open: false, subscription: null })}>
              İptal
            </Button>
            <Button onClick={handleEdit} disabled={actionLoading}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
