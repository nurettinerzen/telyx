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
  Phone,
  Shield,
  Users,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { toast } from 'sonner';

function formatNumber(value) {
  return Number(value || 0).toLocaleString('tr-TR');
}

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const response = await apiClient.admin.getStats();
        setStats(response.data);
      } catch (error) {
        console.error('Failed to load stats:', error);
        toast.error('Admin panel istatistikleri yuklenemedi');
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  const statCards = useMemo(() => ([
    {
      label: 'Toplam Kullanici',
      description: 'Sistemdeki toplam hesap sayisi',
      value: stats?.users?.total || 0,
      icon: Users,
      color: 'bg-blue-500',
      href: '/dashboard/admin/users',
    },
    {
      label: 'Aktif Isletme',
      description: 'Dondurulmamis isletmeler',
      value: stats?.businesses?.active || 0,
      icon: Building2,
      color: 'bg-green-500',
      href: '/dashboard/admin/users?suspended=false',
    },
    {
      label: 'Bugun Arama',
      description: 'Gunluk cagri hacmi',
      value: stats?.calls?.today || 0,
      icon: Phone,
      color: 'bg-teal-500',
      href: '/dashboard/admin/calls',
    },
    {
      label: 'Asistan Sayisi',
      description: 'Toplam asistan envanteri',
      value: stats?.assistants || 0,
      icon: Bot,
      color: 'bg-orange-500',
      href: '/dashboard/admin/assistants',
    },
    {
      label: 'Deneme Bitmis',
      description: 'Trial bitmis, donusmemis hesaplar',
      value: stats?.lifecycle?.trialExpired || 0,
      icon: AlertTriangle,
      color: 'bg-amber-500',
      href: '/dashboard/admin/users?lifecycle=TRIAL_EXPIRED',
    },
    {
      label: 'Yenilenmeyen Paket',
      description: 'Suresi bitmis ve devam etmeyen ucretli planlar',
      value: stats?.lifecycle?.paidLapsed || 0,
      icon: CreditCard,
      color: 'bg-rose-500',
      href: '/dashboard/admin/users?lifecycle=PAID_LAPSED',
    },
  ]), [stats]);

  const orderedPlans = useMemo(() => {
    const byPlan = stats?.byPlan || {};

    return [
      { key: 'FREE', label: 'Free', value: byPlan.free || 0, tone: 'text-slate-500' },
      { key: 'TRIAL', label: 'Trial', value: byPlan.trial || 0, tone: 'text-amber-500' },
      { key: 'PAYG', label: 'PAYG', value: byPlan.payg || 0, tone: 'text-orange-500' },
      { key: 'STARTER', label: 'Starter', value: byPlan.starter || 0, tone: 'text-emerald-500' },
      { key: 'PRO', label: 'Pro', value: byPlan.pro || 0, tone: 'text-blue-500' },
      { key: 'ENTERPRISE', label: 'Enterprise', value: byPlan.enterprise || 0, tone: 'text-cyan-500' },
    ];
  }, [stats]);

  const quickLinks = useMemo(() => ([
    {
      label: 'Kullanicilar',
      description: 'Tum sahip hesaplari ve filtreli liste',
      href: '/dashboard/admin/users',
      icon: Users,
    },
    {
      label: 'Kurumsal',
      description: 'Enterprise musteriler ve teklif akisleri',
      href: '/dashboard/admin/enterprise',
      icon: Building2,
    },
    {
      label: 'Iptaller',
      description: 'Iptal nedenleri ve churn sinyalleri',
      href: '/dashboard/admin/cancellations',
      icon: AlertTriangle,
      meta: `${formatNumber(stats?.cancellations?.scheduled || 0)} aktif iptal talebi`,
    },
    {
      label: 'Admin Islem Logu',
      description: 'Yalnizca admin aksiyon gecmisi',
      href: '/dashboard/admin/audit-log',
      icon: Shield,
    },
  ]), [stats]);

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
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Admin Panel</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Kullanici operasyonundan cok sistem sagligi, plan dagilimi ve churn sinyallerine odaklanan genel gorunum.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {statCards.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-primary-500 dark:border-gray-800 dark:bg-gray-900"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                  {stat.label}
                </p>
                <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
                  {formatNumber(stat.value)}
                </p>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {stat.description}
                </p>
              </div>
              <div className={`shrink-0 rounded-2xl p-3 ${stat.color}`}>
                <stat.icon className="h-5 w-5 text-white" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-1 mb-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Plan Dagilimi
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Kartlara basarak ilgili planin filtreli kullanici listesine gidebilirsin.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {orderedPlans.map((plan) => (
            <Link
              key={plan.key}
              href={`/dashboard/admin/users?plan=${encodeURIComponent(plan.key)}`}
              className="rounded-2xl bg-gray-50 p-5 text-center transition-colors hover:bg-gray-100 dark:bg-gray-800/80 dark:hover:bg-gray-800"
            >
              <p className={`text-3xl font-semibold ${plan.tone}`}>{formatNumber(plan.value)}</p>
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
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-primary-500 dark:border-gray-800 dark:bg-gray-900"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <link.icon className="h-5 w-5 text-gray-500" />
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">
                    {link.label}
                  </span>
                </div>
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                  {link.description}
                </p>
                {link.meta && (
                  <p className="mt-2 text-xs font-medium uppercase tracking-[0.12em] text-primary-600 dark:text-primary-400">
                    {link.meta}
                  </p>
                )}
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
