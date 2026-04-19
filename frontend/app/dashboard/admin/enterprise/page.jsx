/**
 * Enterprise Admin Panel
 * Manage enterprise customers with custom pricing
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Users,
  Building2,
  CreditCard,
  Plus,
  Edit,
  Link as LinkIcon,
  Loader2,
  Phone,
  Bot,
  Clock,
  CheckCircle,
  AlertCircle,
  Copy,
  ExternalLink,
  BarChart3,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { toast } from 'sonner';

// Admin email whitelist - should match backend

export default function EnterpriseAdminPage() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState('all'); // all, active, pending

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    businessId: '',
    minutes: 1000,
    supportInteractions: null,
    price: 8500,
    concurrent: 10,
    assistants: null,
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    notes: '',
    paymentStatus: 'pending'
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [customersRes, usersRes, statsRes] = await Promise.all([
        apiClient.get('/api/admin/enterprise-customers'),
        apiClient.get('/api/admin/users?plan=!ENTERPRISE'),
        apiClient.get('/api/admin/stats')
      ]);

      setCustomers(customersRes.data);
      setUsers(usersRes.data?.users || usersRes.data || []);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Failed to load admin data:', error);
      toast.error('Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCustomer = async () => {
    if (!formData.businessId) {
      toast.error('Kullanıcı seçin');
      return;
    }

    try {
      setActionLoading(true);
      await apiClient.post('/api/admin/enterprise-customers', {
        businessId: formData.businessId,
        minutes: formData.minutes,
        supportInteractions: formData.supportInteractions,
        price: formData.price,
        concurrent: formData.concurrent,
        assistants: formData.assistants,
        startDate: formData.startDate,
        endDate: formData.endDate || null,
        notes: formData.notes
      });

      toast.success('Kurumsal müşteri eklendi');
      setShowAddModal(false);
      resetForm();
      loadData();
    } catch (error) {
      console.error('Failed to add customer:', error);
      toast.error('Müşteri eklenemedi');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateCustomer = async () => {
    if (!selectedCustomer) return;

    try {
      setActionLoading(true);
      const response = await apiClient.put(`/api/admin/enterprise-customers/${selectedCustomer.id}`, {
        minutes: formData.minutes,
        supportInteractions: formData.supportInteractions,
        price: formData.price,
        concurrent: formData.concurrent,
        assistants: formData.assistants,
        startDate: formData.startDate,
        endDate: formData.endDate || null,
        paymentStatus: formData.paymentStatus,
        notes: formData.notes
      });

      // Check if plan was activated
      if (formData.paymentStatus === 'paid' && !selectedCustomer.isActive) {
        toast.success('Kurumsal plan aktif edildi!');
      } else {
        toast.success('Müşteri güncellendi');
      }

      setShowEditModal(false);
      setSelectedCustomer(null);
      resetForm();
      loadData();
    } catch (error) {
      console.error('Failed to update customer:', error);
      toast.error('Müşteri güncellenemedi');
    } finally {
      setActionLoading(false);
    }
  };

  const handleGeneratePaymentLink = async (customerId) => {
    try {
      setActionLoading(true);
      const response = await apiClient.post(`/api/admin/enterprise-customers/${customerId}/payment-link`);

      if (response.data?.url) {
        await navigator.clipboard.writeText(response.data.url);
        toast.success('Ödeme linki kopyalandı!');
      }
    } catch (error) {
      console.error('Failed to generate payment link:', error);
      toast.error('Ödeme linki oluşturulamadı');
    } finally {
      setActionLoading(false);
    }
  };

  const openEditModal = (customer) => {
    setSelectedCustomer(customer);
    setFormData({
      businessId: customer.businessId,
      minutes: customer.enterpriseMinutes || 1000,
      supportInteractions: customer.enterpriseSupportInteractions || null,
      price: customer.enterprisePrice || 8500,
      concurrent: customer.enterpriseConcurrent || 10,
      assistants: customer.enterpriseAssistants || null,
      startDate: customer.enterpriseStartDate ? new Date(customer.enterpriseStartDate).toISOString().split('T')[0] : '',
      endDate: customer.enterpriseEndDate ? new Date(customer.enterpriseEndDate).toISOString().split('T')[0] : '',
      paymentStatus: customer.enterprisePaymentStatus || 'pending',
      notes: customer.enterpriseNotes || ''
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      businessId: '',
      minutes: 1000,
      supportInteractions: null,
      price: 8500,
      concurrent: 10,
      assistants: null,
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      notes: '',
      paymentStatus: 'pending'
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('tr-TR');
  };

  const getPaymentStatusBadge = (status) => {
    const statusConfig = {
      pending: { label: 'Bekliyor', variant: 'secondary' },
      paid: { label: 'Ödendi', variant: 'default' },
      overdue: { label: 'Gecikti', variant: 'destructive' }
    };
    const config = statusConfig[status] || statusConfig.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getStatusBadge = (customer) => {
    if (customer.isActive) {
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">Aktif</Badge>;
    }
    if (customer.pendingPlan === 'ENTERPRISE') {
      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300">Bekliyor</Badge>;
    }
    return <Badge variant="secondary">Bilinmiyor</Badge>;
  };

  // Filter customers
  const filteredCustomers = customers.filter(customer => {
    if (filter === 'all') return true;
    if (filter === 'active') return customer.isActive;
    if (filter === 'pending') return !customer.isActive && customer.pendingPlan === 'ENTERPRISE';
    return true;
  });

  // Count stats
  const activeCount = customers.filter(c => c.isActive).length;
  const pendingCount = customers.filter(c => !c.isActive && c.pendingPlan === 'ENTERPRISE').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Kurumsal Müşteri Yönetimi
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Kurumsal müşteriler ve özel fiyatlandırma
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Toplam İşletme</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">{stats.totalBusinesses}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-teal-100 dark:bg-teal-900 rounded-lg">
                <Users className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Kurumsal</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">{stats.byPlan?.enterprise || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <Phone className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Toplam Çağrı</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">{stats.calls?.total || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900 rounded-lg">
                <BarChart3 className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Bugün</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">{stats.calls?.today || 0}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter & Add Customer */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            Tümü ({customers.length})
          </Button>
          <Button
            variant={filter === 'active' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('active')}
            className={filter === 'active' ? '' : 'text-green-600 border-green-200 hover:bg-green-50'}
          >
            <CheckCircle className="w-4 h-4 mr-1" />
            Aktif ({activeCount})
          </Button>
          <Button
            variant={filter === 'pending' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('pending')}
            className={filter === 'pending' ? '' : 'text-amber-600 border-amber-200 hover:bg-amber-50'}
          >
            <Clock className="w-4 h-4 mr-1" />
            Bekleyen ({pendingCount})
          </Button>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Kurumsal Müşteri Ekle
        </Button>
      </div>

      {/* Customers Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">İşletme</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Durum</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Dakika</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Yazılı Limit</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Fiyat</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Kullanım</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Ödeme</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    {filter === 'all' ? 'Henüz kurumsal müşteri yok' :
                     filter === 'active' ? 'Aktif kurumsal müşteri yok' :
                     'Bekleyen kurumsal müşteri yok'}
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50 dark:hover:bg-gray-900">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {customer.businessName || 'İşletme #' + customer.businessId}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {customer.ownerEmail}
                        </p>
                        {customer.currentPlan && customer.currentPlan !== 'ENTERPRISE' && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            Mevcut: {customer.currentPlan}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(customer)}
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">
                      {customer.enterpriseMinutes?.toLocaleString()} dk
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">
                      {customer.enterpriseSupportInteractions
                        ? `${customer.enterpriseSupportInteractions.toLocaleString()} etkileşim`
                        : 'Tanımsız'}
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">
                      {formatCurrency(customer.enterprisePrice)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-900 dark:text-white">
                          {customer.minutesUsed?.toLocaleString() || 0}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">
                          / {customer.enterpriseMinutes?.toLocaleString()} dk
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Yazılı: {customer.supportInteractionsUsed?.toLocaleString() || 0}
                        {customer.enterpriseSupportInteractions
                          ? ` / ${customer.enterpriseSupportInteractions.toLocaleString()}`
                          : ''}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mt-1">
                        <Bot className="w-3 h-3" />
                        <span>{customer.assistantsCount}</span>
                        <Phone className="w-3 h-3 ml-2" />
                        <span>{customer.callsCount}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {getPaymentStatusBadge(customer.enterprisePaymentStatus)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(customer)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        {customer.enterprisePaymentStatus === 'pending' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleGeneratePaymentLink(customer.id)}
                            disabled={actionLoading}
                            title="Ödeme linki oluştur"
                          >
                            <LinkIcon className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Customer Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Kurumsal Müşteri Ekle</DialogTitle>
            <DialogDescription>
              Mevcut kullanıcıyı kurumsal plana yükselt
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Kullanıcı Seç</Label>
              <Select
                value={formData.businessId}
                onValueChange={(value) => setFormData({ ...formData, businessId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kullanıcı seçin..." />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      {user.businessName} - {user.email} ({user.plan})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Dakika Limiti</Label>
                <Input
                  type="number"
                  value={formData.minutes}
                  onChange={(e) => setFormData({ ...formData, minutes: parseInt(e.target.value) })}
                />
              </div>
              <div>
                <Label>Yazılı Destek Limiti</Label>
                <Input
                  type="number"
                  value={formData.supportInteractions || ''}
                  onChange={(e) => setFormData({ ...formData, supportInteractions: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="Opsiyonel"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Aylık Fiyat (TL)</Label>
                <Input
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Eş Zamanlı Çağrı</Label>
                <Input
                  type="number"
                  value={formData.concurrent}
                  onChange={(e) => setFormData({ ...formData, concurrent: parseInt(e.target.value) })}
                />
              </div>
              <div>
                <Label>Asistan Limiti (opsiyonel)</Label>
                <Input
                  type="number"
                  value={formData.assistants || ''}
                  onChange={(e) => setFormData({ ...formData, assistants: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="Limitsiz"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Başlangıç Tarihi</Label>
                <Input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label>Bitiş Tarihi (opsiyonel)</Label>
                <Input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Notlar</Label>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Özel anlaşmalar, iletişim bilgileri..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              İptal
            </Button>
            <Button onClick={handleAddCustomer} disabled={actionLoading}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Kurumsal Müşteri Düzenle</DialogTitle>
            <DialogDescription>
              {selectedCustomer?.businessName || 'Müşteri'} bilgilerini güncelle
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Dakika Limiti</Label>
                <Input
                  type="number"
                  value={formData.minutes}
                  onChange={(e) => setFormData({ ...formData, minutes: parseInt(e.target.value) })}
                />
              </div>
              <div>
                <Label>Yazılı Destek Limiti</Label>
                <Input
                  type="number"
                  value={formData.supportInteractions || ''}
                  onChange={(e) => setFormData({ ...formData, supportInteractions: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="Opsiyonel"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Aylık Fiyat (TL)</Label>
                <Input
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Eş Zamanlı Çağrı</Label>
                <Input
                  type="number"
                  value={formData.concurrent}
                  onChange={(e) => setFormData({ ...formData, concurrent: parseInt(e.target.value) })}
                />
              </div>
              <div>
                <Label>Asistan Limiti (opsiyonel)</Label>
                <Input
                  type="number"
                  value={formData.assistants || ''}
                  onChange={(e) => setFormData({ ...formData, assistants: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="Limitsiz"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Başlangıç Tarihi</Label>
                <Input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label>Bitiş Tarihi (opsiyonel)</Label>
                <Input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Ödeme Durumu</Label>
              <Select
                value={formData.paymentStatus}
                onValueChange={(value) => setFormData({ ...formData, paymentStatus: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Bekliyor</SelectItem>
                  <SelectItem value="paid">Ödendi</SelectItem>
                  <SelectItem value="overdue">Gecikti</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Notlar</Label>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Özel anlaşmalar, iletişim bilgileri..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              İptal
            </Button>
            <Button onClick={handleUpdateCustomer} disabled={actionLoading}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Güncelle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
