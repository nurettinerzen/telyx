/**
 * MetricCard Component
 * Dashboard metric card with icon, value, label, trend, and sparkline
 */

import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Sparkline from './Sparkline';
import { useLanguage } from '@/contexts/LanguageContext';

export default function MetricCard({
  label,
  value,
  icon: Icon,
  trend,
  trendValue,
  sparklineData = [],
  color = 'primary',
  loading = false,
}) {
  const { t } = useLanguage();

  const colorClasses = {
    primary: { bg: 'bg-primary-50 dark:bg-primary-900/30', text: 'text-primary-600 dark:text-primary-400', sparkline: '#4f46e5' },
    success: { bg: 'bg-green-50 dark:bg-green-900/30', text: 'text-green-600 dark:text-green-400', sparkline: '#10b981' },
    warning: { bg: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400', sparkline: '#f59e0b' },
    danger: { bg: 'bg-red-50 dark:bg-red-900/30', text: 'text-red-600 dark:text-red-400', sparkline: '#ef4444' },
    info: { bg: 'bg-info-50 dark:bg-info-900/30', text: 'text-info-600 dark:text-info-400', sparkline: '#006FEB' },
    purple: { bg: 'bg-cyan-50 dark:bg-cyan-900/30', text: 'text-cyan-600 dark:text-cyan-400', sparkline: '#00C4E6' },
  };

  const getTrendIcon = () => {
    if (trend === 'up') return <TrendingUp className="h-3.5 w-3.5" />;
    if (trend === 'down') return <TrendingDown className="h-3.5 w-3.5" />;
    return <Minus className="h-3.5 w-3.5" />;
  };

  const getTrendColor = () => {
    if (trend === 'up') return 'text-green-600';
    if (trend === 'down') return 'text-red-600';
    return 'text-neutral-500';
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-5 shadow-sm">
        <div className="animate-pulse">
          <div className="h-3 w-20 bg-neutral-200 dark:bg-neutral-700 rounded mb-3"></div>
          <div className="h-7 w-28 bg-neutral-200 dark:bg-neutral-700 rounded mb-4"></div>
          <div className="h-10 bg-neutral-200 dark:bg-neutral-700 rounded mb-3"></div>
          <div className="h-3 w-24 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
        </div>
      </div>
    );
  }

  const colors = colorClasses[color];

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-5 shadow-sm hover:shadow-md transition-all duration-200">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">
            {label}
          </p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-white">{value}</p>
        </div>

        {Icon && (
          <div className={`p-2.5 rounded-lg ${colors.bg}`}>
            <Icon className={`h-5 w-5 ${colors.text}`} />
          </div>
        )}
      </div>

      {/* Sparkline */}
      {sparklineData && sparklineData.length > 0 && (
        <div className="mb-3 -mx-1">
          <Sparkline data={sparklineData} color={colors.sparkline} height={32} />
        </div>
      )}

      {/* Trend */}
      {(trend || trendValue) && (
        <div className="flex items-center gap-1">
          <span className={`flex items-center gap-1 text-xs font-semibold ${getTrendColor()}`}>
            {getTrendIcon()}
            {trendValue}
          </span>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">{t('dashboard.overviewPage.fromLastWeek')}</span>
        </div>
      )}
    </div>
  );
}
