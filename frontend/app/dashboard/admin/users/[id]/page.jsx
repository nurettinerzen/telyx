/**
 * Admin User Detail Page
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  User,
  Building2,
  Phone,
  Bot,
  CreditCard,
  Calendar,
  Clock,
  Ban,
  CheckCircle,
  Key,
  Trash2,
  Edit,
  Shield,
  Loader2,
  AlertCircle,
  Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import { apiClient } from '@/lib/api';
import { toast } from 'sonner';
import InfoTooltip from '@/components/InfoTooltip';
import { getPageHelp } from '@/content/pageHelp';
import { PLAN_COLORS, REGIONAL_PRICING, normalizePlan } from '@/lib/planConfig';

function getRegionalPlanDefaults(plan, country = 'TR') {
  const normalizedCountry = REGIONAL_PRICING[country] ? country : 'TR';
  const normalizedPlan = normalizePlan(plan || 'FREE');
  return REGIONAL_PRICING[normalizedCountry]?.plans?.[normalizedPlan]
    || REGIONAL_PRICING.TR.plans.FREE;
}

function toEditableNumber(value, fallback = '') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function parseIntegerOrFallback(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFloatOrFallback(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = Number.parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeIntegerInput(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return String(Number.parseInt(digits, 10));
}

function sanitizeDecimalInput(value) {
  const normalized = String(value || '').replace(',', '.').replace(/[^\d.]/g, '');
  if (!normalized) return '';

  const [integerRaw = '', ...decimalParts] = normalized.split('.');
  const integerDigits = integerRaw.replace(/\D/g, '');
  const integerPart = integerDigits ? String(Number.parseInt(integerDigits, 10)) : '0';

  if (decimalParts.length === 0) {
    return integerPart;
  }

  const decimalPart = decimalParts.join('').replace(/\D/g, '');
  return `${integerPart}.${decimalPart}`;
}


export default function AdminUserDetailPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.id;
  const adminPageHelp = getPageHelp('adminUserDetail', 'tr');

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  // Modals
  const [editModal, setEditModal] = useState(false);
  const [suspendModal, setSuspendModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Edit form
  const [editForm, setEditForm] = useState({
    plan: '',
    minutesUsed: '',
    balance: '',
    minutesLimit: '',
    writtenInteractionsLimit: '',
    concurrentLimit: '',
    assistantsLimit: '',
    enterprisePrice: '',
    enterpriseNotes: '',
    phoneInboundEnabled: false,
  });
  const [suspendReason, setSuspendReason] = useState('');

  const loadUser = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.admin.getUser(userId);
      setUser(response.data);
      const subscription = response.data.business?.subscription;
      const planDefaults = getRegionalPlanDefaults(
        subscription?.plan || 'FREE',
        response.data.business?.country || 'TR'
      );

      setEditForm({
        plan: subscription?.plan || 'FREE',
        minutesUsed: toEditableNumber(subscription?.minutesUsed ?? 0, '0'),
        balance: toEditableNumber(subscription?.balance ?? 0, '0'),
        minutesLimit: toEditableNumber(subscription?.minutesLimit ?? planDefaults.minutes ?? 0, '0'),
        writtenInteractionsLimit: toEditableNumber(subscription?.enterpriseSupportInteractions, ''),
        concurrentLimit: toEditableNumber(subscription?.concurrentLimit ?? planDefaults.concurrent ?? 0, '0'),
        assistantsLimit: toEditableNumber(subscription?.assistantsLimit ?? planDefaults.assistants ?? 0, '0'),
        enterprisePrice: toEditableNumber(subscription?.enterprisePrice, ''),
        enterpriseNotes: subscription?.enterpriseNotes || '',
        phoneInboundEnabled: response.data.business?.phoneInboundEnabled || false,
      });
    } catch (error) {
      console.error('Failed to load user:', error);
      toast.error('Kullanıcı yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      loadUser();
    }
  }, [loadUser, userId]);

  const handleSaveEdit = async () => {
    setActionLoading(true);
    try {
      const savePlanDefaults = getRegionalPlanDefaults(editForm.plan || 'FREE', user.business?.country || 'TR');

      await apiClient.admin.updateUser(userId, {
        plan: editForm.plan,
        minutesUsed: parseIntegerOrFallback(editForm.minutesUsed, 0),
        balance: parseFloatOrFallback(editForm.balance, 0),
        minutesLimit: parseIntegerOrFallback(editForm.minutesLimit, Number(savePlanDefaults.minutes ?? 0)),
        concurrentLimit: parseIntegerOrFallback(editForm.concurrentLimit, Number(savePlanDefaults.concurrent ?? 0)),
        assistantsLimit: parseIntegerOrFallback(editForm.assistantsLimit, Number(savePlanDefaults.assistants ?? 0)),
        enterpriseSupportInteractions: editForm.writtenInteractionsLimit === ''
          ? null
          : parseIntegerOrFallback(editForm.writtenInteractionsLimit, Number(savePlanDefaults.writtenInteractions ?? 0)),
        enterprisePrice: editForm.plan === 'ENTERPRISE'
          ? (editForm.enterprisePrice === '' ? null : parseFloatOrFallback(editForm.enterprisePrice, 0))
          : undefined,
        enterpriseNotes: editForm.plan === 'ENTERPRISE' ? editForm.enterpriseNotes : '',
        phoneInboundEnabled: editForm.phoneInboundEnabled,
      });
      toast.success('Kullanıcı güncellendi');
      setEditModal(false);
      loadUser();
    } catch (error) {
      console.error('Failed to update user:', error);
      toast.error('Güncelleme başarısız');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspend = async () => {
    setActionLoading(true);
    try {
      const isSuspending = !user.suspended;
      await apiClient.admin.suspendUser(userId, {
        suspended: isSuspending,
        reason: isSuspending ? suspendReason : null,
      });
      toast.success(isSuspending ? 'Kullanıcı donduruldu' : 'Kullanıcı aktif edildi');
      setSuspendModal(false);
      setSuspendReason('');
      loadUser();
    } catch (error) {
      console.error('Failed to suspend user:', error);
      toast.error('İşlem başarısız');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!confirm('Şifre sıfırlama linki gönderilsin mi?')) return;
    try {
      await apiClient.admin.resetPassword(userId);
      toast.success('Şifre sıfırlama linki gönderildi');
    } catch (error) {
      toast.error('İşlem başarısız');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Bu kullanıcıyı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.')) return;
    try {
      await apiClient.admin.deleteUser(userId);
      toast.success('Kullanıcı silindi');
      router.push('/dashboard/admin/users');
    } catch (error) {
      toast.error('Silme başarısız');
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <AlertCircle className="w-16 h-16 text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Kullanıcı Bulunamadı</h2>
      </div>
    );
  }

  const subscription = user.business?.subscription;
  const planDefaults = getRegionalPlanDefaults(subscription?.plan || 'FREE', user.business?.country || 'TR');
  const effectiveWrittenLimit = subscription?.enterpriseSupportInteractions ?? planDefaults.writtenInteractions ?? null;
  const editPlanDefaults = getRegionalPlanDefaults(editForm.plan || 'FREE', user.business?.country || 'TR');

  const handlePlanChange = (value) => {
    const previousDefaults = getRegionalPlanDefaults(editForm.plan || 'FREE', user.business?.country || 'TR');
    const nextDefaults = getRegionalPlanDefaults(value, user.business?.country || 'TR');

    setEditForm((prev) => {
      const previousMinutes = parseIntegerOrFallback(prev.minutesLimit, null);
      const previousConcurrent = parseIntegerOrFallback(prev.concurrentLimit, null);
      const previousAssistants = parseIntegerOrFallback(prev.assistantsLimit, null);
      const nextWritten = (
        prev.writtenInteractionsLimit === ''
        || Number(prev.writtenInteractionsLimit) === Number(previousDefaults.writtenInteractions ?? 0)
      )
        ? ''
        : prev.writtenInteractionsLimit;

      return {
        ...prev,
        plan: value,
        minutesLimit: prev.minutesLimit === '' || previousMinutes === Number(previousDefaults.minutes ?? 0)
          ? toEditableNumber(nextDefaults.minutes ?? 0, '0')
          : prev.minutesLimit,
        concurrentLimit: prev.concurrentLimit === '' || previousConcurrent === Number(previousDefaults.concurrent ?? 0)
          ? toEditableNumber(nextDefaults.concurrent ?? 0, '0')
          : prev.concurrentLimit,
        assistantsLimit: prev.assistantsLimit === '' || previousAssistants === Number(previousDefaults.assistants ?? 0)
          ? toEditableNumber(nextDefaults.assistants ?? 0, '0')
          : prev.assistantsLimit,
        writtenInteractionsLimit: nextWritten,
      };
    });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/admin/users">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Geri
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {user.name || user.email}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm text-gray-500">{user.email}</p>
              <Badge
                variant="outline"
                className={`text-xs ${
                  user.emailVerified
                    ? 'border-green-600 text-green-700 dark:border-green-500 dark:text-green-400'
                    : 'border-amber-500 text-amber-700 dark:border-amber-400 dark:text-amber-300'
                }`}
              >
                {user.emailVerified ? 'E-posta doğrulandı' : 'E-posta doğrulanmadı'}
              </Badge>
              <InfoTooltip
                locale="tr"
                title={adminPageHelp?.tooltipTitle}
                body={adminPageHelp?.tooltipBody}
                quickSteps={adminPageHelp?.quickSteps}
              />
            </div>
          </div>
          {user.suspended && (
            <Badge variant="destructive">Dondurulmuş</Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditModal(true)}>
            <Edit className="w-4 h-4 mr-2" />
            Düzenle
          </Button>
          <Button
            variant={user.suspended ? 'default' : 'outline'}
            onClick={() => setSuspendModal(true)}
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
          </Button>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-[#081224]/95 rounded-lg border border-gray-200 dark:border-white/10 p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <CreditCard className="w-4 h-4" />
            <span className="text-sm">Plan</span>
          </div>
          <Badge className={PLAN_COLORS[subscription?.plan] || PLAN_COLORS.FREE}>
            {subscription?.plan || 'FREE'}
          </Badge>
        </div>

        <div className="bg-white dark:bg-[#081224]/95 rounded-lg border border-gray-200 dark:border-white/10 p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Dakika Kullanımı</span>
          </div>
          <p className="text-xl font-semibold text-gray-900 dark:text-white">
            {subscription?.minutesUsed || 0} dk
          </p>
        </div>

        <div className="bg-white dark:bg-[#081224]/95 rounded-lg border border-gray-200 dark:border-white/10 p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <Bot className="w-4 h-4" />
            <span className="text-sm">Asistanlar</span>
          </div>
          <p className="text-xl font-semibold text-gray-900 dark:text-white">
            {user.business?.assistants?.length || 0}
          </p>
        </div>

        <div className="bg-white dark:bg-[#081224]/95 rounded-lg border border-gray-200 dark:border-white/10 p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <Phone className="w-4 h-4" />
            <span className="text-sm">Toplam Arama</span>
          </div>
          <p className="text-xl font-semibold text-gray-900 dark:text-white">
            {user.business?._count?.callLogs || 0}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Business Info */}
        <div className="bg-white dark:bg-[#081224]/95 rounded-lg border border-gray-200 dark:border-white/10 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            İşletme Bilgileri
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500">İşletme Adı</span>
              <span className="text-gray-900 dark:text-white">{user.business?.name || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Ülke</span>
              <span className="text-gray-900 dark:text-white">{user.business?.country || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Dil</span>
              <span className="text-gray-900 dark:text-white">{user.business?.language || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Phone Inbound</span>
              <Badge variant="outline">
                V1 Outbound-only (Kilitli)
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Kayıt Tarihi</span>
              <span className="text-gray-900 dark:text-white">{formatDate(user.createdAt)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">E-posta Doğrulama</span>
              <div className="text-right">
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    user.emailVerified
                      ? 'border-green-600 text-green-700 dark:border-green-500 dark:text-green-400'
                      : 'border-amber-500 text-amber-700 dark:border-amber-400 dark:text-amber-300'
                  }`}
                >
                  {user.emailVerified ? 'Doğrulandı' : 'Doğrulanmadı'}
                </Badge>
                {user.emailVerifiedAt && (
                  <p className="mt-1 text-xs text-gray-500">
                    {formatDate(user.emailVerifiedAt)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Takım Üyesi</span>
              <span className="text-gray-900 dark:text-white">{user.business?._count?.users || 1}</span>
            </div>
          </div>
        </div>

        {/* Subscription Info */}
        <div className="bg-white dark:bg-[#081224]/95 rounded-lg border border-gray-200 dark:border-white/10 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Abonelik Bilgileri
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500">Plan</span>
              <Badge className={PLAN_COLORS[subscription?.plan] || PLAN_COLORS.FREE}>
                {subscription?.plan || 'FREE'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Durum</span>
              <span className="text-gray-900 dark:text-white">{subscription?.status || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Bakiye</span>
              <span className="text-gray-900 dark:text-white">{subscription?.balance?.toFixed(2) || 0} TL</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Dakika Limiti</span>
              <span className="text-gray-900 dark:text-white">
                {subscription?.minutesLimit ?? planDefaults.minutes ?? 0} dk
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Yazılı Limit</span>
              <span className="text-gray-900 dark:text-white">
                {effectiveWrittenLimit === null || effectiveWrittenLimit === undefined
                  ? '-'
                  : `${Number(effectiveWrittenLimit).toLocaleString('tr-TR')} etkileşim`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Eşzamanlı Çağrı</span>
              <span className="text-gray-900 dark:text-white">
                {subscription?.concurrentLimit ?? planDefaults.concurrent ?? 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Asistan Limiti</span>
              <span className="text-gray-900 dark:text-white">
                {subscription?.assistantsLimit ?? planDefaults.assistants ?? 0}
              </span>
            </div>
            {subscription?.pendingPlanId && (
              <div className="flex justify-between">
                <span className="text-gray-500">Bekleyen Plan</span>
                <span className="text-gray-900 dark:text-white">{subscription.pendingPlanId}</span>
              </div>
            )}
            {subscription?.plan === 'ENTERPRISE' && (
              <div className="flex justify-between">
                <span className="text-gray-500">Kurumsal Fiyat</span>
                <span className="text-gray-900 dark:text-white">{subscription?.enterprisePrice || '-'} TL/ay</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Assistants */}
      {user.business?.assistants?.length > 0 && (
        <div className="mt-6 bg-white dark:bg-[#081224]/95 rounded-lg border border-gray-200 dark:border-white/10 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Bot className="w-5 h-5" />
            Asistanlar ({user.business.assistants.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {user.business.assistants.map((assistant) => (
              <div key={assistant.id} className="rounded-lg bg-gray-50 p-4 dark:bg-[#0B1730]/88">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900 dark:text-white">{assistant.name}</span>
                  <Badge variant={assistant.isActive ? 'outline' : 'secondary'}>
                    {assistant.isActive ? 'Aktif' : 'Pasif'}
                  </Badge>
                </div>
                <p className="text-sm text-gray-500">{assistant.callDirection}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Calls */}
      {user.recentCalls?.length > 0 && (
        <div className="mt-6 bg-white dark:bg-[#081224]/95 rounded-lg border border-gray-200 dark:border-white/10 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Son Aramalar
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase">
                  <th className="pb-2">Tarih</th>
                  <th className="pb-2">Süre</th>
                  <th className="pb-2">Sonuç</th>
                  <th className="pb-2">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-white/10">
                {user.recentCalls.map((call) => (
                  <tr key={call.id}>
                    <td className="py-2 text-sm text-gray-900 dark:text-white">
                      {formatDate(call.createdAt)}
                    </td>
                    <td className="py-2 text-sm text-gray-700 dark:text-gray-300">
                      {call.duration ? `${Math.round(call.duration / 60)} dk` : '-'}
                    </td>
                    <td className="py-2">
                      <Badge variant="outline">{call.callResult || '-'}</Badge>
                    </td>
                    <td className="py-2">
                      <Badge variant="outline">{call.callStatus || '-'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-6 flex gap-4">
        <Button variant="outline" onClick={handleResetPassword}>
          <Key className="w-4 h-4 mr-2" />
          Şifre Sıfırla
        </Button>
        <Button variant="destructive" onClick={handleDelete}>
          <Trash2 className="w-4 h-4 mr-2" />
          Kullanıcıyı Sil
        </Button>
      </div>

      {/* Edit Modal */}
      <Dialog open={editModal} onOpenChange={setEditModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Kullanıcı Düzenle</DialogTitle>
            <DialogDescription>{user.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Plan</Label>
              <Select
                value={editForm.plan}
                onValueChange={handlePlanChange}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FREE">Free</SelectItem>
                  <SelectItem value="TRIAL">Trial</SelectItem>
                  <SelectItem value="PAYG">PAYG</SelectItem>
                  <SelectItem value="STARTER">Starter</SelectItem>
                  <SelectItem value="PRO">Pro</SelectItem>
                  <SelectItem value="ENTERPRISE">Kurumsal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Kullanılan Dakika</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  className="mt-1"
                  value={editForm.minutesUsed}
                  onChange={(e) => setEditForm({ ...editForm, minutesUsed: sanitizeIntegerInput(e.target.value) })}
                />
              </div>
              <div>
                <Label>Bakiye (TL)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  className="mt-1"
                  value={editForm.balance}
                  onChange={(e) => setEditForm({ ...editForm, balance: sanitizeDecimalInput(e.target.value) })}
                />
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-white/10 p-4 space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">Paket Limitleri</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Super admin override alanları. Yazılı limiti boş bırakırsan plan varsayılanı kullanılır.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Dakika Limiti</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    className="mt-1"
                    value={editForm.minutesLimit}
                    onChange={(e) => setEditForm({ ...editForm, minutesLimit: sanitizeIntegerInput(e.target.value) })}
                  />
                  <p className="mt-1 text-xs text-gray-500">Plan varsayılanı: {Number(editPlanDefaults.minutes ?? 0)} dk</p>
                </div>
                <div>
                  <Label>Yazılı Etkileşim Limiti</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    className="mt-1"
                    value={editForm.writtenInteractionsLimit}
                    placeholder={String(editPlanDefaults.writtenInteractions ?? 0)}
                    onChange={(e) => setEditForm({ ...editForm, writtenInteractionsLimit: sanitizeIntegerInput(e.target.value) })}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Boş = plan varsayılanı ({Number(editPlanDefaults.writtenInteractions ?? 0).toLocaleString('tr-TR')})
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Eşzamanlı Çağrı Limiti</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    className="mt-1"
                    value={editForm.concurrentLimit}
                    onChange={(e) => setEditForm({ ...editForm, concurrentLimit: sanitizeIntegerInput(e.target.value) })}
                  />
                  <p className="mt-1 text-xs text-gray-500">Plan varsayılanı: {Number(editPlanDefaults.concurrent ?? 0)}</p>
                </div>
                <div>
                  <Label>Asistan Limiti</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    className="mt-1"
                    value={editForm.assistantsLimit}
                    onChange={(e) => setEditForm({ ...editForm, assistantsLimit: sanitizeIntegerInput(e.target.value) })}
                  />
                  <p className="mt-1 text-xs text-gray-500">Plan varsayılanı: {Number(editPlanDefaults.assistants ?? 0)}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-white/10 p-3">
              <div>
                <Label className="text-sm">Telefon Inbound (V2)</Label>
                <p className="text-xs text-gray-500 mt-1">
                  Global V1 outbound-only modunda kilitli. V2 için backend toggle açılmalıdır.
                </p>
              </div>
              <Switch
                checked={Boolean(editForm.phoneInboundEnabled)}
                onCheckedChange={(checked) => setEditForm({ ...editForm, phoneInboundEnabled: checked })}
                disabled
              />
            </div>
            {editForm.plan === 'ENTERPRISE' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Kurumsal Fiyat (TL/ay)</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      className="mt-1"
                      value={editForm.enterprisePrice}
                      onChange={(e) => setEditForm({ ...editForm, enterprisePrice: sanitizeDecimalInput(e.target.value) })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Kurumsal Notlar</Label>
                  <Textarea
                    className="mt-1"
                    value={editForm.enterpriseNotes}
                    onChange={(e) => setEditForm({ ...editForm, enterpriseNotes: e.target.value })}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModal(false)}>İptal</Button>
            <Button onClick={handleSaveEdit} disabled={actionLoading}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend Modal */}
      <Dialog open={suspendModal} onOpenChange={setSuspendModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {user.suspended ? 'Kullanıcıyı Aktif Et' : 'Kullanıcıyı Dondur'}
            </DialogTitle>
            <DialogDescription>{user.email}</DialogDescription>
          </DialogHeader>
          {!user.suspended && (
            <div className="py-4">
              <Label>Dondurma Nedeni (opsiyonel)</Label>
              <Input
                className="mt-2"
                placeholder="Neden..."
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendModal(false)}>İptal</Button>
            <Button
              variant={user.suspended ? 'default' : 'destructive'}
              onClick={handleSuspend}
              disabled={actionLoading}
            >
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {user.suspended ? 'Aktif Et' : 'Dondur'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
