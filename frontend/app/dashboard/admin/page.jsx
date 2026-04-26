/**
 * Admin Dashboard - System overview
 */

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Building2,
  CreditCard,
  Loader2,
  Megaphone,
  Phone,
  Shield,
  Users,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';

function formatNumber(value, locale) {
  return Number(value || 0).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-US');
}

function getAdminDashboardCopy(locale) {
  const isTr = locale === 'tr';

  return {
    title: isTr ? 'Admin Paneli' : 'Admin Panel',
    stats: {
      totalUsers: isTr ? 'Toplam Kullanıcı' : 'Total Users',
      activeBusinesses: isTr ? 'Aktif İşletme' : 'Active Businesses',
      todayCalls: isTr ? 'Bugün Arama' : 'Calls Today',
      assistants: isTr ? 'Asistan Sayısı' : 'Assistant Count',
      expiredTrials: isTr ? 'Denemesi Biten' : 'Expired Trials',
      paidLapsed: isTr ? 'Yenilenmeyen Paket' : 'Unrenewed Plans',
    },
    plansTitle: isTr ? 'Plan Dağılımı' : 'Plan Distribution',
    plans: {
      FREE: isTr ? 'Ücretsiz' : 'Free',
      TRIAL: isTr ? 'Deneme' : 'Trial',
      PAYG: isTr ? 'Kullandıkça Öde' : 'Pay As You Go',
      STARTER: 'Starter',
      PRO: 'Pro',
      ENTERPRISE: isTr ? 'Kurumsal' : 'Enterprise',
    },
    links: {
      leads: isTr ? 'Leadler' : 'Leads',
      users: isTr ? 'Kullanıcılar' : 'Users',
      enterprise: isTr ? 'Kurumsal' : 'Enterprise',
      cancellations: isTr ? 'İptaller' : 'Cancellations',
      auditLog: isTr ? 'Admin İşlem Logu' : 'Admin Audit Log',
    },
  };
}

export default function AdminDashboardPage() {
  const { locale } = useLanguage();
  const copy = useMemo(() => getAdminDashboardCopy(locale), [locale]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const response = await apiClient.admin.getStats();
        setStats(response.data);
      } catch (error) {
        console.error('Failed to load stats:', error);
        toast.error(locale === 'tr' ? 'Admin panel istatistikleri yüklenemedi' : 'Failed to load admin stats');
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [locale]);

  const statCards = useMemo(() => ([
    {
      label: copy.stats.totalUsers,
      value: stats?.users?.total || 0,
      icon: Users,
      color: 'bg-blue-500',
      href: '/dashboard/admin/users',
    },
    {
      label: copy.stats.activeBusinesses,
      value: stats?.businesses?.active || 0,
      icon: Building2,
      color: 'bg-green-500',
      href: '/dashboard/admin/users?suspended=false',
    },
    {
      label: copy.stats.todayCalls,
      value: stats?.calls?.today || 0,
      icon: Phone,
      color: 'bg-teal-500',
      href: '/dashboard/admin/calls',
    },
    {
      label: copy.stats.assistants,
      value: stats?.assistants || 0,
      icon: Bot,
      color: 'bg-orange-500',
      href: '/dashboard/admin/assistants',
    },
    {
      label: copy.stats.expiredTrials,
      value: stats?.lifecycle?.trialExpired || 0,
      icon: AlertTriangle,
      color: 'bg-amber-500',
      href: '/dashboard/admin/subscriptions?lifecycle=TRIAL_EXPIRED',
    },
    {
      label: copy.stats.paidLapsed,
      value: stats?.lifecycle?.paidLapsed || 0,
      icon: CreditCard,
      color: 'bg-rose-500',
      href: '/dashboard/admin/subscriptions?lifecycle=PAID_LAPSED',
    },
  ]), [copy, stats]);

  const orderedPlans = useMemo(() => {
    const byPlan = stats?.byPlan || {};

    return [
      { key: 'FREE', label: copy.plans.FREE, value: byPlan.free || 0, tone: 'text-slate-500' },
      { key: 'TRIAL', label: copy.plans.TRIAL, value: byPlan.trial || 0, tone: 'text-amber-500' },
      { key: 'PAYG', label: copy.plans.PAYG, value: byPlan.payg || 0, tone: 'text-orange-500' },
      { key: 'STARTER', label: copy.plans.STARTER, value: byPlan.starter || 0, tone: 'text-emerald-500' },
      { key: 'PRO', label: copy.plans.PRO, value: byPlan.pro || 0, tone: 'text-blue-500' },
      { key: 'ENTERPRISE', label: copy.plans.ENTERPRISE, value: byPlan.enterprise || 0, tone: 'text-cyan-500' },
    ];
  }, [copy, stats]);

  const quickLinks = useMemo(() => ([
    {
      label: copy.links.leads,
      href: '/dashboard/admin/leads',
      icon: Megaphone,
    },
    {
      label: copy.links.users,
      href: '/dashboard/admin/users',
      icon: Users,
    },
    {
      label: copy.links.enterprise,
      href: '/dashboard/admin/enterprise',
      icon: Building2,
    },
    {
      label: copy.links.cancellations,
      href: '/dashboard/admin/cancellations',
      icon: AlertTriangle,
    },
    {
      label: copy.links.auditLog,
      href: '/dashboard/admin/audit-log',
      icon: Shield,
    },
  ]), [copy]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{copy.title}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {statCards.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-primary-500 dark:border-white/10 dark:bg-[#081224]/95"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {stat.label}
                </p>
                <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
                  {formatNumber(stat.value, locale)}
                </p>
              </div>
              <div className={`shrink-0 rounded-2xl p-3 ${stat.color}`}>
                <stat.icon className="h-5 w-5 text-white" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#081224]/95">
        <h2 className="mb-5 text-lg font-semibold text-gray-900 dark:text-white">
          {copy.plansTitle}
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              {orderedPlans.map((plan) => (
            <Link
              key={plan.key}
              href={`/dashboard/admin/subscriptions?plan=${encodeURIComponent(plan.key)}`}
              className="rounded-2xl bg-gray-50 p-5 text-center transition-colors hover:bg-gray-100 dark:bg-[#0B1730]/88 dark:hover:bg-[#102043]"
            >
              <p className={`text-3xl font-semibold ${plan.tone}`}>{formatNumber(plan.value, locale)}</p>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{plan.label}</p>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {quickLinks.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-primary-500 dark:border-white/10 dark:bg-[#081224]/95"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <link.icon className="h-5 w-5 text-gray-500" />
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">
                    {link.label}
                  </span>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
