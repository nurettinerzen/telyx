/**
 * Admin Dashboard - Stats Overview
 */

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  Building2,
  Phone,
  Bot,
  CreditCard,
  PhoneForwarded,
  TrendingUp,
  AlertCircle,
  ArrowRight,
  BarChart3,
  Loader2,
  Shield,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { toast } from 'sonner';

// Admin email whitelist - should match backend

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await apiClient.admin.getStats();
      setStats(response.data);
    } catch (error) {
      console.error('Failed to load stats:', error);
      toast.error('İstatistikler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  const statCards = [
    {
      label: 'Toplam Kullanıcı',
      value: stats?.users?.total || 0,
      icon: Users,
      color: 'bg-blue-500',
      href: '/dashboard/admin/users',
    },
    {
      label: 'Aktif İşletme',
      value: stats?.users?.active || 0,
      icon: Building2,
      color: 'bg-green-500',
      href: '/dashboard/admin/users',
    },
    {
      label: 'Bugün Arama',
      value: stats?.calls?.today || 0,
      icon: Phone,
      color: 'bg-teal-500',
      href: '/dashboard/admin/calls',
    },
    {
      label: 'Toplam Arama',
      value: stats?.calls?.total || 0,
      icon: BarChart3,
      color: 'bg-teal-500',
      href: '/dashboard/admin/calls',
    },
    {
      label: 'Asistan Sayısı',
      value: stats?.assistants || 0,
      icon: Bot,
      color: 'bg-orange-500',
      href: '/dashboard/admin/assistants',
    },
    {
      label: 'Bekleyen Callback',
      value: stats?.pendingCallbacks || 0,
      icon: PhoneForwarded,
      color: 'bg-red-500',
      href: '/dashboard/admin/callbacks',
    },
  ];

  const planStats = stats?.byPlan || {};

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Admin Panel</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Platform genel istatistikleri ve yönetim
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {statCards.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-5 hover:border-primary-500 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  {stat.label}
                </p>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
                  {stat.value.toLocaleString()}
                </p>
              </div>
              <div className={`p-2 rounded-lg ${stat.color}`}>
                <stat.icon className="w-5 h-5 text-white" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Plan Distribution */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Plan Dağılımı
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Enterprise', value: planStats.enterprise || 0, color: 'text-teal-600' },
            { label: 'Pro', value: planStats.pro || 0, color: 'text-blue-600' },
            { label: 'Starter', value: planStats.starter || 0, color: 'text-green-600' },
            { label: 'PAYG', value: planStats.payg || 0, color: 'text-orange-600' },
            { label: 'Trial', value: planStats.trial || 0, color: 'text-yellow-600' },
            { label: 'Free', value: planStats.free || 0, color: 'text-gray-600' },
          ].map((plan) => (
            <div
              key={plan.label}
              className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
            >
              <p className={`text-2xl font-bold ${plan.color}`}>{plan.value}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{plan.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Kullanıcılar', href: '/dashboard/admin/users', icon: Users },
          { label: 'Kurumsal', href: '/dashboard/admin/enterprise', icon: Building2 },
          { label: 'Abonelikler', href: '/dashboard/admin/subscriptions', icon: CreditCard },
          { label: 'Audit Log', href: '/dashboard/admin/audit-log', icon: Shield },
        ].map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className="flex items-center justify-between p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-primary-500 transition-colors"
          >
            <div className="flex items-center gap-3">
              <link.icon className="w-5 h-5 text-gray-500" />
              <span className="font-medium text-gray-900 dark:text-white">{link.label}</span>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400" />
          </Link>
        ))}
      </div>
    </div>
  );
}
