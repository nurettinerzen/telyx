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
import { getPlanDisplayName, normalizePlan } from '@/lib/planConfig';
import { useLanguage } from '@/contexts/LanguageContext';

const USER_SUMMARY_TONES = {
  access: {
    color: '#22C55E',
    glow: 'rgba(34,197,94,0.16)',
  },
  email: {
    color: '#00C4E6',
    glow: 'rgba(0,196,230,0.16)',
  },
  lifecycle: {
    color: '#F59E0B',
    glow: 'rgba(245,158,11,0.17)',
  },
  total: {
    color: '#4F7CFF',
    glow: 'rgba(79,124,255,0.18)',
  },
};

const ACTIVATION_SEGMENTS = ['NEW', 'STUCK', 'TRIED', 'ACTIVE', 'RISK'];

const ACTIVATION_TONES = {
  NEW: {
    color: '#4F7CFF',
    glow: 'rgba(79,124,255,0.18)',
  },
  STUCK: {
    color: '#F59E0B',
    glow: 'rgba(245,158,11,0.17)',
  },
  TRIED: {
    color: '#8B5CF6',
    glow: 'rgba(139,92,246,0.16)',
  },
  ACTIVE: {
    color: '#22C55E',
    glow: 'rgba(34,197,94,0.16)',
  },
  RISK: {
    color: '#EF4444',
    glow: 'rgba(239,68,68,0.16)',
  },
};

const PLAN_TEXT_COLORS = {
  FREE: 'text-cyan-700 dark:text-cyan-300',
  TRIAL: 'text-cyan-700 dark:text-cyan-300',
  PAYG: 'text-violet-700 dark:text-violet-300',
  STARTER: 'text-blue-700 dark:text-blue-300',
  PRO: 'text-green-700 dark:text-green-300',
  ENTERPRISE: 'text-amber-700 dark:text-amber-300',
};

export default function AdminUsersPage() {
  const { locale } = useLanguage();
  const isTr = locale === 'tr';
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [summaryData, setSummaryData] = useState({ users: [], total: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });

  // Filters
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [suspendedFilter, setSuspendedFilter] = useState(() => searchParams.get('suspended') || '');
  const [lifecycleFilter, setLifecycleFilter] = useState(() => searchParams.get('lifecycle') || 'ALL');
  const [emailVerificationFilter, setEmailVerificationFilter] = useState(() => searchParams.get('emailVerified') || 'ALL');
  const [activationFilter, setActivationFilter] = useState(() => searchParams.get('activation') || 'ALL');
  const [lastActivityFilter, setLastActivityFilter] = useState(() => searchParams.get('lastActivity') || 'ALL');

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
    emailStatus: isTr ? 'E-posta Durumu' : 'Email Status',
    emailVerified: isTr ? 'E-posta doğrulandı' : 'Email verified',
    emailUnverified: isTr ? 'E-posta doğrulanmadı' : 'Email unverified',
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
    summaryEmailTitle: isTr ? 'Doğrulanmamış E-posta' : 'Unverified Email',
    summaryLifecycleTitle: isTr ? 'Yaşam Döngüsü Riski' : 'Lifecycle Risk',
    summaryTotalTitle: isTr ? 'Toplam Kullanıcı' : 'Total Users',
    summaryActiveUsers: isTr ? 'aktif kullanıcı' : 'active users',
    summarySuspendedUsers: isTr ? 'dondurulmuş' : 'suspended',
    summaryVerifiedUsers: isTr ? 'doğrulanmış' : 'verified',
    summaryUnverifiedUsers: isTr ? 'doğrulanmamış' : 'unverified',
    summaryEmailAttention: isTr ? 'aksiyon bekliyor' : 'needs action',
    summaryRiskUsers: isTr ? 'takip gerektiren' : 'needs attention',
    summaryAllOwners: isTr ? 'Tüm işletme sahipleri' : 'All business owners',
    activationLabels: {
      NEW: isTr ? 'Yeni ama başlamadı' : 'New, not started',
      STUCK: isTr ? 'Kurulumda takıldı' : 'Stuck in setup',
      TRIED: isTr ? 'İlk denemeyi yaptı' : 'Tried once',
      ACTIVE: isTr ? 'Aktif kullanıyor' : 'Actively using',
      RISK: isTr ? 'Riskli / sessiz' : 'At risk / quiet',
    },
    activationHints: {
      NEW: isTr ? 'Kayıt var, ürün aksiyonu yok' : 'Signed up, no product action',
      STUCK: isTr ? 'Kurulum sinyali var, kullanım yok' : 'Setup signal, no usage yet',
      TRIED: isTr ? 'En az bir kanalı denedi' : 'Tried at least one channel',
      ACTIVE: isTr ? 'Son 48 saatte kullanım var' : 'Usage in the last 48 hours',
      RISK: isTr ? '72 saattir ürün sessiz' : 'No product signal for 72 hours',
    },
    lastActivityFilter: isTr ? 'Son Ürün Aktivitesi' : 'Last Product Activity',
    lastActivityOptions: {
      TODAY: isTr ? 'Bugün' : 'Today',
      LAST_3D: isTr ? 'Son 3 gün' : 'Last 3 days',
      LAST_7D: isTr ? 'Son 7 gün' : 'Last 7 days',
      NO_ACTIVITY: isTr ? 'Ürün aktivitesi yok' : 'No product activity',
    },
    lastActivityColumn: isTr ? 'Son Aktivite' : 'Last Activity',
    noProductActivity: isTr ? 'Ürün aktivitesi yok' : 'No product activity',
    activationScore: isTr ? 'kullanım skoru' : 'usage score',
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
    joinedAt: isTr ? 'Üyelik' : 'Joined',
    periodEnd: isTr ? 'Dönem Sonu' : 'Period End',
    usageSummary: (assistants, calls, chats, emails) => (
      isTr
        ? `${assistants} asistan, ${calls} arama, ${chats} sohbet, ${emails} e-posta`
        : `${assistants} assistants, ${calls} calls, ${chats} chats, ${emails} emails`
    ),
    detail: isTr ? 'Detay' : 'Details',
    activate: isTr ? 'Aktif Et' : 'Activate',
    suspend: isTr ? 'Dondur' : 'Suspend',
    delete: isTr ? 'Sil' : 'Delete',
    suspendTitle: isTr ? 'Kullanıcıyı Dondur' : 'Suspend User',
    activateTitle: isTr ? 'Kullanıcıyı Aktif Et' : 'Activate User',
    suspendReason: isTr ? 'Dondurma Nedeni (Opsiyonel)' : 'Suspend Reason (Optional)',
    reasonPlaceholder: isTr ? 'Neden...' : 'Reason...',
    businessColumn: isTr ? 'İşletme' : 'Business',
    emailVerificationColumn: isTr ? 'E-posta Doğrulama' : 'Email Verification',
    userColumn: isTr ? 'Kullanıcı' : 'User',
    planColumn: isTr ? 'Plan' : 'Plan',
    usageColumn: isTr ? 'Kullanım' : 'Usage',
    actionColumn: isTr ? 'İşlem' : 'Action',
  }), [isTr]);

  const loadUserSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const response = await apiClient.admin.getUsers({ page: 1, limit: 1000 });
      setSummaryData({
        users: response.data.users || [],
        total: response.data.pagination?.total || 0,
      });
    } catch (error) {
      console.error('Failed to load user summary:', error);
      setSummaryData({ users: [], total: 0 });
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };
      if (search) params.search = search;
      if (suspendedFilter) params.suspended = suspendedFilter;
      if (lifecycleFilter && lifecycleFilter !== 'ALL') params.lifecycle = lifecycleFilter;
      if (emailVerificationFilter && emailVerificationFilter !== 'ALL') params.emailVerified = emailVerificationFilter;
      if (activationFilter && activationFilter !== 'ALL') params.activation = activationFilter;
      if (lastActivityFilter && lastActivityFilter !== 'ALL') params.lastActivity = lastActivityFilter;

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
  }, [
    activationFilter,
    copy.loadFailed,
    emailVerificationFilter,
    lastActivityFilter,
    lifecycleFilter,
    pagination.limit,
    pagination.page,
    search,
    suspendedFilter,
  ]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadUserSummary();
  }, [loadUserSummary]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (pagination.page === 1) {
      loadUsers();
      return;
    }
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const formatDate = useCallback((date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString(isTr ? 'tr-TR' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }, [isTr]);

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
      loadUserSummary();
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
      loadUserSummary();
    } catch (error) {
      console.error('Failed to delete user:', error);
      toast.error(copy.deleteFailed);
    }
  };

  const formatCount = useCallback((value) => {
    return new Intl.NumberFormat(isTr ? 'tr-TR' : 'en-US').format(value || 0);
  }, [isTr]);

  const formatRelativeActivity = useCallback((date) => {
    if (!date) return copy.noProductActivity;

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) return copy.noProductActivity;

    const diffMinutes = Math.max(0, Math.round((Date.now() - parsedDate.getTime()) / (1000 * 60)));
    if (diffMinutes < 60) return isTr ? `${diffMinutes || 1} dk önce` : `${diffMinutes || 1}m ago`;

    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return isTr ? `${diffHours} saat önce` : `${diffHours}h ago`;

    const diffDays = Math.round(diffHours / 24);
    if (diffDays <= 7) return isTr ? `${diffDays} gün önce` : `${diffDays}d ago`;

    return formatDate(date);
  }, [copy.noProductActivity, formatDate, isTr]);

  const userSummary = useMemo(() => {
    const sourceUsers = summaryData.users.length > 0 ? summaryData.users : users;
    const total = summaryData.total || pagination.total || sourceUsers.length;

    const counts = sourceUsers.reduce((acc, user) => {
      if (user.suspended) acc.suspended += 1;
      else acc.active += 1;

      if (user.emailVerified) acc.emailVerified += 1;
      else acc.emailUnverified += 1;

      if (user.subscriptionLifecycle === 'TRIAL_EXPIRED') acc.trialExpired += 1;
      if (user.subscriptionLifecycle === 'PAID_LAPSED') acc.paidLapsed += 1;
      if (user.subscriptionLifecycle === 'CANCEL_SCHEDULED') acc.cancelScheduled += 1;

      const activationSegment = user.activation?.segment;
      if (activationSegment && acc.activation[activationSegment] !== undefined) {
        acc.activation[activationSegment] += 1;
      }

      return acc;
    }, {
      active: 0,
      suspended: 0,
      emailVerified: 0,
      emailUnverified: 0,
      trialExpired: 0,
      paidLapsed: 0,
      cancelScheduled: 0,
      activation: {
        NEW: 0,
        STUCK: 0,
        TRIED: 0,
        ACTIVE: 0,
        RISK: 0,
      },
    });

    return {
      ...counts,
      total,
      riskTotal: counts.trialExpired + counts.paidLapsed + counts.cancelScheduled,
      activationTotal: Object.values(counts.activation).reduce((sum, value) => sum + value, 0),
    };
  }, [pagination.total, summaryData.total, summaryData.users, users]);

  const percentageOfTotal = useCallback((value) => {
    if (!userSummary.total) return 0;
    return Math.round(((value || 0) / userSummary.total) * 100);
  }, [userSummary.total]);

  const summaryCards = useMemo(() => ([
    {
      key: 'total',
      title: copy.summaryTotalTitle,
      value: userSummary.total,
      label: copy.summaryAllOwners,
      percentage: 100,
      tone: USER_SUMMARY_TONES.total,
      rows: [
        { label: copy.active, value: userSummary.active },
        { label: copy.suspended, value: userSummary.suspended },
      ],
      isTotal: true,
    },
    {
      key: 'email',
      title: copy.summaryEmailTitle,
      value: userSummary.emailUnverified,
      label: copy.summaryEmailAttention,
      percentage: percentageOfTotal(userSummary.emailUnverified),
      tone: USER_SUMMARY_TONES.email,
      rows: [
        { label: copy.summaryVerifiedUsers, value: userSummary.emailVerified },
      ],
    },
    {
      key: 'lifecycle',
      title: copy.summaryLifecycleTitle,
      value: userSummary.riskTotal,
      label: copy.summaryRiskUsers,
      percentage: percentageOfTotal(userSummary.riskTotal),
      tone: USER_SUMMARY_TONES.lifecycle,
      rows: [
        { label: copy.lifecycleOptions.TRIAL_EXPIRED, value: userSummary.trialExpired },
        { label: copy.lifecycleOptions.PAID_LAPSED, value: userSummary.paidLapsed },
        { label: copy.lifecycleOptions.CANCEL_SCHEDULED, value: userSummary.cancelScheduled },
      ],
    },
  ]), [
    copy.active,
    copy.lifecycleOptions.CANCEL_SCHEDULED,
    copy.lifecycleOptions.PAID_LAPSED,
    copy.lifecycleOptions.TRIAL_EXPIRED,
    copy.summaryAllOwners,
    copy.summaryEmailTitle,
    copy.summaryEmailAttention,
    copy.summaryLifecycleTitle,
    copy.summaryRiskUsers,
    copy.summaryTotalTitle,
    copy.summaryVerifiedUsers,
    copy.suspended,
    percentageOfTotal,
    userSummary.active,
    userSummary.cancelScheduled,
    userSummary.emailUnverified,
    userSummary.emailVerified,
    userSummary.paidLapsed,
    userSummary.riskTotal,
    userSummary.suspended,
    userSummary.total,
    userSummary.trialExpired,
  ]);

  const activationCards = useMemo(() => (
    ACTIVATION_SEGMENTS.map((key) => {
      const value = userSummary.activation?.[key] || 0;

      return {
        key,
        title: copy.activationLabels[key],
        value,
        hint: copy.activationHints[key],
        percentage: percentageOfTotal(value),
        tone: ACTIVATION_TONES[key],
      };
    })
  ), [
    copy.activationHints,
    copy.activationLabels,
    percentageOfTotal,
    userSummary.activation,
  ]);

  const applyUserSummaryFilter = useCallback((key) => {
    setPagination(prev => ({ ...prev, page: 1 }));
    setActivationFilter('ALL');
    setLastActivityFilter('ALL');

    if (key === 'email') {
      setEmailVerificationFilter('false');
      setSuspendedFilter('');
      setLifecycleFilter('ALL');
      return;
    }

    if (key === 'lifecycle') {
      setEmailVerificationFilter('ALL');
      setSuspendedFilter('');
      setLifecycleFilter('TRIAL_EXPIRED');
      return;
    }

    setEmailVerificationFilter('ALL');
    setSuspendedFilter('');
    setLifecycleFilter('ALL');
  }, []);

  const isUserSummaryActive = useCallback((key) => {
    if (key === 'email') return emailVerificationFilter === 'false' && activationFilter === 'ALL' && lastActivityFilter === 'ALL';
    if (key === 'lifecycle') return lifecycleFilter !== 'ALL' && activationFilter === 'ALL' && lastActivityFilter === 'ALL';
    return emailVerificationFilter === 'ALL'
      && lifecycleFilter === 'ALL'
      && !suspendedFilter
      && activationFilter === 'ALL'
      && lastActivityFilter === 'ALL';
  }, [activationFilter, emailVerificationFilter, lastActivityFilter, lifecycleFilter, suspendedFilter]);

  const applyActivationFilter = useCallback((key) => {
    setPagination(prev => ({ ...prev, page: 1 }));
    setActivationFilter(prev => (prev === key ? 'ALL' : key));
  }, []);

  const setFilterAndResetPage = useCallback((setter) => (value) => {
    setPagination(prev => ({ ...prev, page: 1 }));
    setter(value);
  }, []);

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

      {/* User Summary */}
      <div className="grid grid-cols-1 gap-3 mb-6 xl:grid-cols-3">
        {summaryCards.map((card) => {
          const value = summaryLoading && summaryData.users.length === 0 ? '...' : formatCount(card.value);
          const active = isUserSummaryActive(card.key);

          return (
            <button
              type="button"
              key={card.key}
              onClick={() => applyUserSummaryFilter(card.key)}
              aria-pressed={active}
              className={`min-h-[124px] rounded-lg border p-4 text-left transition hover:-translate-y-0.5 ${
                active ? 'ring-1 ring-white/20' : ''
              } ${
                card.isTotal
                  ? 'border-blue-400/30 text-white shadow-[0_24px_70px_rgba(2,6,23,0.45)]'
                  : 'border-gray-200 text-gray-900 dark:border-white/10 dark:text-white'
              }`}
              style={{
                background: `linear-gradient(145deg, rgba(7,14,30,0.97) 12%, ${card.tone.glow} 100%)`,
              }}
            >
              <div className="flex h-full flex-col justify-between gap-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{card.title}</p>
                  </div>
                  <span
                    className="rounded-full px-2 py-1 text-[11px] font-medium"
                    style={{
                      background: `${card.tone.color}18`,
                      color: card.tone.color,
                    }}
                  >
                    %{card.percentage}
                  </span>
                </div>

                <div>
                  <div className="text-[30px] font-semibold tracking-tight text-white">
                    {value}
                  </div>
                  <div className="mt-1 text-sm text-slate-300">
                    {card.label}
                  </div>
                </div>

                <div className="grid gap-2">
                  {card.rows.map((row) => (
                    <div key={row.label} className="flex items-center justify-between border-t border-white/10 pt-2 text-xs">
                      <span className="truncate pr-3 text-slate-500">{row.label}</span>
                      <span className="font-semibold text-slate-200">{formatCount(row.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Activation Radar */}
      <div className="grid grid-cols-1 gap-3 mb-6 md:grid-cols-2 xl:grid-cols-5">
        {activationCards.map((card) => {
          const value = summaryLoading && summaryData.users.length === 0 ? '...' : formatCount(card.value);
          const active = activationFilter === card.key;

          return (
            <button
              type="button"
              key={card.key}
              onClick={() => applyActivationFilter(card.key)}
              aria-pressed={active}
              className={`min-h-[132px] rounded-lg border p-4 text-left transition hover:-translate-y-0.5 ${
                active
                  ? 'border-white/30 ring-1 ring-white/20'
                  : 'border-gray-200 dark:border-white/10'
              }`}
              style={{
                background: `linear-gradient(145deg, rgba(7,14,30,0.96) 10%, ${card.tone.glow} 100%)`,
              }}
            >
              <div className="flex h-full flex-col justify-between gap-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-white">{card.title}</p>
                  <span
                    className="rounded-full px-2 py-1 text-[11px] font-medium"
                    style={{
                      background: `${card.tone.color}18`,
                      color: card.tone.color,
                    }}
                  >
                    %{card.percentage}
                  </span>
                </div>

                <div>
                  <div className="text-[28px] font-semibold tracking-tight text-white">{value}</div>
                  <p className="mt-1 min-h-8 text-xs leading-4 text-slate-400">{card.hint}</p>
                </div>

                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${card.percentage}%`,
                      background: card.tone.color,
                    }}
                  />
                </div>
              </div>
            </button>
          );
        })}
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

        <Select value={suspendedFilter || 'ALL'} onValueChange={(v) => setFilterAndResetPage(setSuspendedFilter)(v === 'ALL' ? '' : v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={copy.status} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{copy.all}</SelectItem>
            <SelectItem value="false">{copy.active}</SelectItem>
            <SelectItem value="true">{copy.suspended}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={emailVerificationFilter} onValueChange={setFilterAndResetPage(setEmailVerificationFilter)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={copy.emailStatus} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{copy.all}</SelectItem>
            <SelectItem value="true">{copy.emailVerified}</SelectItem>
            <SelectItem value="false">{copy.emailUnverified}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={lifecycleFilter} onValueChange={setFilterAndResetPage(setLifecycleFilter)}>
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

        <Select value={lastActivityFilter} onValueChange={setFilterAndResetPage(setLastActivityFilter)}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder={copy.lastActivityFilter} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{copy.all}</SelectItem>
            <SelectItem value="TODAY">{copy.lastActivityOptions.TODAY}</SelectItem>
            <SelectItem value="LAST_3D">{copy.lastActivityOptions.LAST_3D}</SelectItem>
            <SelectItem value="LAST_7D">{copy.lastActivityOptions.LAST_7D}</SelectItem>
            <SelectItem value="NO_ACTIVITY">{copy.lastActivityOptions.NO_ACTIVITY}</SelectItem>
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#0B1730]/88">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.userColumn}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.businessColumn}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.emailVerificationColumn}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.planColumn}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.usageColumn}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.lastActivityColumn}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.status}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">{copy.actionColumn}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-white/10">
                {users.map((user) => {
                  const activationSegment = user.activation?.segment || 'NEW';
                  const activationTone = ACTIVATION_TONES[activationSegment] || ACTIVATION_TONES.NEW;

                  return (
                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{user.name || '-'}</p>
                          <p className="text-sm text-gray-500">{user.email}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {copy.joinedAt}: {formatDate(user.createdAt)}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-700 dark:text-gray-300">{user.businessName || '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm font-medium ${
                          user.emailVerified
                            ? 'text-green-700 dark:text-green-400'
                            : 'text-amber-700 dark:text-amber-300'
                        }`}>
                          {user.emailVerified ? copy.emailVerified : copy.emailUnverified}
                        </span>
                        {user.emailVerifiedAt && (
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {formatDate(user.emailVerifiedAt)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <span className={`text-sm font-medium ${PLAN_TEXT_COLORS[normalizePlan(user.plan)] || PLAN_TEXT_COLORS.FREE}`}>
                            {getPlanDisplayName(normalizePlan(user.plan), locale)}
                          </span>
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
                          <p className="text-gray-500">
                            {copy.usageSummary(
                              user.assistantsCount || 0,
                              user.callsCount || 0,
                              user.chatSessionsCount || 0,
                              user.emailDraftsCount || 0,
                            )}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            {formatRelativeActivity(user.activation?.productActivityAt)}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ background: activationTone.color }}
                            />
                            <span>
                              {copy.activationLabels[activationSegment] || '-'} · %{user.activation?.score || 0} {copy.activationScore}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {user.suspended ? (
                          <span className="text-sm font-medium text-red-700 dark:text-red-400">{copy.suspended}</span>
                        ) : (
                          <span className="text-sm font-medium text-green-700 dark:text-green-400">{copy.active}</span>
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
                  );
                })}
              </tbody>
            </table>
          </div>
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
