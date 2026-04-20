'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PageIntro from '@/components/PageIntro';
import { getPageHelp } from '@/content/pageHelp';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Phone,
  Calendar,
  Download,
  MessageCircle,
  Mail,
} from 'lucide-react';
import { formatDuration } from '@/lib/utils';
import { getDashboardSkeletonClass } from '@/components/dashboard/dashboardSurfaceTheme';

const BRAND = {
  phone: {
    color: '#00C4E6',
    strong: '#00A8C7',
    light: '#E6FBFF',
    darkGlow: 'rgba(0,196,230,0.16)',
  },
  chat: {
    color: '#000ACF',
    strong: '#1D4ED8',
    light: '#EEF2FF',
    darkGlow: 'rgba(0,10,207,0.18)',
  },
  whatsapp: {
    color: '#006FEB',
    strong: '#2563EB',
    light: '#ECF5FF',
    darkGlow: 'rgba(0,111,235,0.18)',
  },
  email: {
    color: '#4F7CFF',
    strong: '#305CE5',
    light: '#EEF4FF',
    darkGlow: 'rgba(79,124,255,0.16)',
  },
  duration: {
    color: '#7DD3FC',
    strong: '#0284C7',
    light: '#F0F9FF',
    darkGlow: 'rgba(125,211,252,0.16)',
  },
};

const TIME_RANGE_KEYS = ['7d', '30d', '90d'];

const WhatsAppIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

function SurfaceCard({ dark, className, children }) {
  return (
    <div
      className={cn(
        'rounded-[28px] border p-5 md:p-6',
        dark
          ? 'border-white/10 bg-[#081224]/95 shadow-[0_24px_70px_rgba(2,6,23,0.45)]'
          : 'border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]',
        className
      )}
    >
      {children}
    </div>
  );
}

function StatCard({ dark, icon: Icon, value, label, tone }) {
  const accent = BRAND[tone];

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[28px] border p-5',
        dark ? 'border-white/10 text-white' : 'border-slate-200 text-slate-900'
      )}
      style={{
        background: dark
          ? `linear-gradient(145deg, rgba(7,14,30,0.96) 12%, ${accent.darkGlow} 100%)`
          : `linear-gradient(145deg, ${accent.light} 0%, rgba(255,255,255,0.98) 72%)`,
      }}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full blur-3xl"
        style={{ background: accent.darkGlow }}
      />
      <div className="relative z-10">
        <div
          className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl"
          style={{
            background: dark ? `${accent.color}22` : `${accent.color}16`,
            boxShadow: dark ? `0 0 0 1px ${accent.color}22 inset` : 'none',
          }}
        >
          <Icon className="h-5 w-5" style={{ color: dark ? accent.color : accent.strong }} />
        </div>
        <div className={cn('text-[30px] font-semibold tracking-tight', dark ? 'text-white' : 'text-slate-900')}>
          {value}
        </div>
        <div className={cn('mt-1 text-sm', dark ? 'text-slate-400' : 'text-slate-500')}>
          {label}
        </div>
      </div>
    </div>
  );
}

function ChartDefs({ dark }) {
  return (
    <defs>
      {Object.entries(BRAND).map(([key, value]) => (
        <React.Fragment key={key}>
          <linearGradient id={`analytics-area-${key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={value.color} stopOpacity={dark ? 0.36 : 0.28} />
            <stop offset="100%" stopColor={value.color} stopOpacity={0.04} />
          </linearGradient>
          <linearGradient id={`analytics-bar-${key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={value.color} stopOpacity={1} />
            <stop offset="100%" stopColor={value.strong} stopOpacity={dark ? 0.72 : 0.88} />
          </linearGradient>
        </React.Fragment>
      ))}
    </defs>
  );
}

function DonutLabel({ cx, cy, midAngle, innerRadius, outerRadius, percentage }) {
  if (percentage < 7) return null;

  const radian = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.52;
  const x = cx + radius * Math.cos(-midAngle * radian);
  const y = cy + radius * Math.sin(-midAngle * radian);

  return (
    <text
      x={x}
      y={y}
      fill="#fff"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={700}
    >
      {`${percentage}%`}
    </text>
  );
}

function FilterPill({ active, onClick, dark, color, children }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
        active
          ? 'text-white shadow-md'
          : dark
            ? 'bg-white/6 text-slate-400 hover:bg-white/10 hover:text-slate-200'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
      )}
      style={active ? { background: color } : undefined}
      type="button"
    >
      {children}
    </button>
  );
}

function makeTooltipStyle(dark) {
  return {
    contentStyle: {
      backgroundColor: dark ? '#081224' : '#ffffff',
      border: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`,
      borderRadius: '16px',
      color: dark ? '#e2e8f0' : '#0f172a',
      fontSize: 12,
      boxShadow: dark ? '0 20px 48px rgba(2,6,23,0.5)' : '0 16px 40px rgba(15,23,42,0.12)',
    },
    labelStyle: { color: dark ? '#94a3b8' : '#64748b', marginBottom: 4 },
    itemStyle: { color: dark ? '#e2e8f0' : '#334155' },
    cursor: { stroke: dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)', strokeWidth: 1 },
  };
}

function makeAxisProps(dark) {
  return {
    tick: { fill: dark ? '#64748b' : '#94a3b8', fontSize: 11 },
    axisLine: { stroke: dark ? 'rgba(255,255,255,0.07)' : '#e2e8f0' },
    tickLine: false,
  };
}

function makeGridProps(dark) {
  return {
    strokeDasharray: '3 3',
    stroke: dark ? 'rgba(255,255,255,0.05)' : '#e2e8f0',
    vertical: false,
  };
}

export default function AnalyticsDashboardView({
  analytics,
  peakHours,
  topTopics,
  loading,
  topicsLoading,
  timeRange,
  onTimeRangeChange,
  channelFilter,
  onChannelFilterChange,
  onExport,
}) {
  const { t, locale } = useLanguage();
  const { resolvedTheme } = useTheme();
  const pageHelp = getPageHelp('analytics', locale);
  const dark = resolvedTheme === 'dark';

  const axisProps = makeAxisProps(dark);
  const gridProps = makeGridProps(dark);
  const tooltipStyle = makeTooltipStyle(dark);

  const timeRanges = TIME_RANGE_KEYS.map((value) => ({
    value,
    label: t(`dashboard.analyticsPage.${value === '7d' ? 'last7Days' : value === '30d' ? 'last30Days' : 'last90Days'}`),
  }));

  const statCards = [
    { icon: Phone, value: analytics?.totalCalls || 0, label: t('dashboard.analyticsPage.totalCalls'), tone: 'phone' },
    { icon: MessageCircle, value: analytics?.chatSessions || 0, label: t('dashboard.analyticsPage.chatSessions'), tone: 'chat' },
    { icon: WhatsAppIcon, value: analytics?.whatsappSessions || 0, label: t('dashboard.analyticsPage.whatsappMessages'), tone: 'whatsapp' },
    { icon: Mail, value: analytics?.emailsAnswered || 0, label: t('dashboard.analyticsPage.emailsAnswered'), tone: 'email' },
  ];

  const channelStats = analytics?.channelStats
    ? [
        {
          key: 'phone',
          name: t('dashboard.analyticsPage.phoneCalls'),
          value: analytics.channelStats.phone.count,
          percentage: analytics.channelStats.phone.percentage,
          color: BRAND.phone.color,
        },
        {
          key: 'chat',
          name: t('dashboard.analyticsPage.chatSessions'),
          value: analytics.channelStats.chat.count,
          percentage: analytics.channelStats.chat.percentage,
          color: BRAND.chat.color,
        },
        {
          key: 'whatsapp',
          name: t('dashboard.analyticsPage.whatsappMessages'),
          value: analytics.channelStats.whatsapp?.count || 0,
          percentage: analytics.channelStats.whatsapp?.percentage || 0,
          color: BRAND.whatsapp.color,
        },
        {
          key: 'email',
          name: t('dashboard.analyticsPage.emailsAnswered'),
          value: analytics.channelStats.email.count,
          percentage: analytics.channelStats.email.percentage,
          color: BRAND.email.color,
        },
      ].filter((item) => item.value > 0)
    : [];

  const chartData = (analytics?.callsOverTime || []).map((item) => ({
    ...item,
    date: new Date(item.date).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-US', {
      month: 'short',
      day: 'numeric',
    }),
  }));

  const sessionCards = [
    {
      key: 'phone',
      tone: 'phone',
      icon: Phone,
      label: t('dashboard.analyticsPage.phoneCalls'),
      data: analytics?.channelSessionDuration?.phone,
    },
    {
      key: 'chat',
      tone: 'chat',
      icon: MessageCircle,
      label: t('dashboard.analyticsPage.chatSessions'),
      data: analytics?.channelSessionDuration?.chat,
    },
    {
      key: 'whatsapp',
      tone: 'whatsapp',
      icon: WhatsAppIcon,
      label: 'WhatsApp',
      data: analytics?.channelSessionDuration?.whatsapp,
    },
    {
      key: 'email',
      tone: 'email',
      icon: Mail,
      label: t('dashboard.analyticsPage.email'),
      data: analytics?.channelSessionDuration?.email,
    },
  ];

  const filterButtons = [
    { key: 'phone', label: t('dashboard.analyticsPage.phoneCalls'), icon: <Phone className="h-3 w-3" />, color: BRAND.phone.color },
    { key: 'chat', label: t('dashboard.analyticsPage.chatSessions'), icon: <MessageCircle className="h-3 w-3" />, color: BRAND.chat.color },
    { key: 'whatsapp', label: 'WhatsApp', icon: <WhatsAppIcon className="h-3 w-3" />, color: BRAND.whatsapp.color },
    { key: 'email', label: t('dashboard.analyticsPage.email'), icon: <Mail className="h-3 w-3" />, color: BRAND.email.color },
  ];

  if (loading) {
    return (
      <div className="space-y-8">
        <div className={cn('h-8 w-64 rounded-xl animate-pulse', getDashboardSkeletonClass(dark))} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((card) => (
            <div key={card} className={cn('h-36 rounded-[28px] animate-pulse', getDashboardSkeletonClass(dark))} />
          ))}
        </div>
        <div className={cn('h-96 rounded-[28px] animate-pulse', getDashboardSkeletonClass(dark))} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageIntro
        title={pageHelp.title}
        subtitle={pageHelp.subtitle}
        locale={locale}
        help={{
          tooltipTitle: pageHelp.tooltipTitle,
          tooltipBody: pageHelp.tooltipBody,
          quickSteps: pageHelp.quickSteps,
        }}
        actions={
          <div className="flex flex-wrap gap-3">
            <Select value={timeRange} onValueChange={onTimeRangeChange}>
              <SelectTrigger
                className={cn(
                  'h-10 w-44 rounded-2xl',
                  dark ? 'border-white/10 bg-[#081224] text-slate-200' : 'border-slate-200 bg-white'
                )}
              >
                <Calendar className={cn('mr-2 h-4 w-4', dark ? 'text-slate-400' : 'text-slate-500')} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={dark ? 'border-white/10 bg-[#081224] text-slate-200' : ''}>
                {timeRanges.map((range) => (
                  <SelectItem key={range.value} value={range.value}>
                    {range.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                'h-10 rounded-2xl',
                dark
                  ? 'border-white/10 bg-[#081224] text-slate-200 hover:bg-white/10 hover:text-white'
                  : 'border-slate-200 bg-white'
              )}
              onClick={onExport}
              disabled={!analytics}
            >
              <Download className="mr-2 h-4 w-4" />
              {t('dashboard.analyticsPage.export')}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <StatCard key={card.label} dark={dark} {...card} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SurfaceCard dark={dark} className="xl:col-span-2">
          <div className="mb-5">
            <h3 className={cn('text-base font-semibold', dark ? 'text-white' : 'text-slate-900')}>
              {t('dashboard.analyticsPage.activityOverTime')}
            </h3>
            <p className={cn('mt-1 text-xs', dark ? 'text-slate-500' : 'text-slate-500')}>
              {t('dashboard.analyticsPage.csvDailyInteractions')}
            </p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 4, right: 6, left: -18, bottom: 0 }}>
              <ChartDefs dark={dark} />
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="date" {...axisProps} />
              <YAxis {...axisProps} />
              <Tooltip {...tooltipStyle} />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value) => (
                  <span style={{ color: dark ? '#94a3b8' : '#64748b', fontSize: 11 }}>{value}</span>
                )}
              />
              <Area type="monotone" dataKey="calls" stroke={BRAND.phone.color} fill="url(#analytics-area-phone)" strokeWidth={2.2} name={t('dashboard.analyticsPage.phoneCalls')} />
              <Area type="monotone" dataKey="chats" stroke={BRAND.chat.color} fill="url(#analytics-area-chat)" strokeWidth={2.2} name={t('dashboard.analyticsPage.chatSessions')} />
              <Area type="monotone" dataKey="whatsapp" stroke={BRAND.whatsapp.color} fill="url(#analytics-area-whatsapp)" strokeWidth={2.2} name={t('dashboard.analyticsPage.whatsappMessages')} />
              <Area type="monotone" dataKey="emails" stroke={BRAND.email.color} fill="url(#analytics-area-email)" strokeWidth={2.2} name={t('dashboard.analyticsPage.emailsAnswered')} />
            </AreaChart>
          </ResponsiveContainer>
        </SurfaceCard>

        <SurfaceCard dark={dark}>
          <div className="mb-5">
            <h3 className={cn('text-base font-semibold', dark ? 'text-white' : 'text-slate-900')}>
              {t('dashboard.analyticsPage.channelDistribution')}
            </h3>
            <p className={cn('mt-1 text-xs', dark ? 'text-slate-500' : 'text-slate-500')}>
              {t('dashboard.analyticsPage.csvOverviewStats')}
            </p>
          </div>

          {channelStats.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={channelStats}
                    cx="50%"
                    cy="50%"
                    innerRadius={56}
                    outerRadius={84}
                    paddingAngle={3}
                    dataKey="value"
                    labelLine={false}
                    label={DonutLabel}
                    strokeWidth={0}
                  >
                    {channelStats.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(value, name, props) => [`${value} (${props.payload.percentage}%)`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="mt-4 space-y-2.5">
                {channelStats.map((item) => (
                  <div key={item.key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                      <span className={cn('text-sm', dark ? 'text-slate-300' : 'text-slate-600')}>{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('text-sm font-semibold', dark ? 'text-white' : 'text-slate-900')}>{item.value}</span>
                      <span className={cn('text-xs', dark ? 'text-slate-500' : 'text-slate-400')}>{item.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className={cn('flex h-[240px] items-center justify-center text-sm', dark ? 'text-slate-500' : 'text-slate-400')}>
              {t('dashboard.analyticsPage.noDataYet')}
            </div>
          )}
        </SurfaceCard>
      </div>

      <div>
        <h3 className={cn('mb-4 text-base font-semibold', dark ? 'text-white' : 'text-slate-900')}>
          {t('dashboard.analyticsPage.channelSessionDurationTitle')}
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {sessionCards.map((card) => {
            const tone = BRAND[card.tone];
            const Icon = card.icon;

            return (
              <SurfaceCard key={card.key} dark={dark}>
                <div className="mb-4 flex items-center gap-3">
                  <div
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl"
                    style={{ background: dark ? `${tone.color}22` : `${tone.color}14` }}
                  >
                    <Icon className="h-5 w-5" style={{ color: dark ? tone.color : tone.strong }} />
                  </div>
                  <div>
                    <div className={cn('text-sm font-semibold', dark ? 'text-white' : 'text-slate-900')}>{card.label}</div>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className={cn('text-sm', dark ? 'text-slate-400' : 'text-slate-500')}>
                      {t('dashboard.analyticsPage.averageSessionDuration')}
                    </span>
                    <span className={cn('text-sm font-semibold', dark ? 'text-white' : 'text-slate-900')}>
                      {formatDuration(card.data?.averageSeconds || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={cn('text-sm', dark ? 'text-slate-400' : 'text-slate-500')}>
                      {t('dashboard.analyticsPage.totalSessionDuration')}
                    </span>
                    <span className={cn('text-sm font-semibold', dark ? 'text-white' : 'text-slate-900')}>
                      {formatDuration(card.data?.totalSeconds || 0)}
                    </span>
                  </div>
                </div>
              </SurfaceCard>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_1fr]">
        <SurfaceCard dark={dark}>
          <div className="mb-5">
            <h3 className={cn('text-base font-semibold', dark ? 'text-white' : 'text-slate-900')}>
              {t('dashboard.analyticsPage.topQuestions')}
            </h3>
            <p className={cn('mt-1 text-xs', dark ? 'text-slate-500' : 'text-slate-500')}>
              {t('dashboard.analyticsPage.topQuestionsDescription')}
            </p>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            <FilterPill dark={dark} active={channelFilter === 'all'} onClick={() => onChannelFilterChange('all')} color={dark ? '#334155' : '#475569'}>
              {t('dashboard.analyticsPage.allChannels')}
            </FilterPill>
            {filterButtons.map((button) => (
              <FilterPill
                key={button.key}
                dark={dark}
                active={channelFilter === button.key}
                onClick={() => onChannelFilterChange(button.key)}
                color={button.color}
              >
                {button.icon}
                {button.label}
              </FilterPill>
            ))}
          </div>

          {topicsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className={cn('h-20 rounded-3xl animate-pulse', getDashboardSkeletonClass(dark))} />
              ))}
            </div>
          ) : topTopics.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {topTopics.map((topic) => (
                <div
                  key={topic.category}
                  className={cn(
                    'rounded-[24px] border p-4',
                    dark ? 'border-white/8 bg-white/[0.03]' : 'border-slate-200 bg-slate-50/90'
                  )}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className={cn('text-sm font-semibold', dark ? 'text-white' : 'text-slate-900')}>
                        {topic.category}
                      </div>
                      <div className={cn('mt-1 text-xs', dark ? 'text-slate-500' : 'text-slate-500')}>
                        {topic.channels.map((channel) => {
                          const item = filterButtons.find((button) => button.key === channel);
                          return item ? item.label : channel;
                        }).join(' / ')}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                        dark ? 'border-white/12 bg-white/5 text-slate-200' : 'border-slate-200 bg-white text-slate-700'
                      )}
                    >
                      {topic.count}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {topic.subtopics?.map((subtopic) => (
                      <span
                        key={subtopic.text}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs',
                          dark ? 'border-white/10 bg-white/5 text-slate-300' : 'border-slate-200 bg-white text-slate-700'
                        )}
                      >
                        {subtopic.text}
                        <span className="font-semibold text-cyan-500">{subtopic.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={cn('py-10 text-center text-sm', dark ? 'text-slate-500' : 'text-slate-400')}>
              {t('dashboard.analyticsPage.noQuestionsYet')}
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard dark={dark}>
          <div className="mb-5">
            <h3 className={cn('text-base font-semibold', dark ? 'text-white' : 'text-slate-900')}>
              {t('dashboard.analyticsPage.peakActivityHours')}
            </h3>
            <p className={cn('mt-1 text-xs', dark ? 'text-slate-500' : 'text-slate-500')}>
              {t('dashboard.analyticsPage.channelDistribution')}
            </p>
          </div>

          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={peakHours} margin={{ top: 4, right: 0, left: -18, bottom: 0 }} barSize={16}>
              <ChartDefs dark={dark} />
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="hour" {...axisProps} />
              <YAxis {...axisProps} />
              <Tooltip {...tooltipStyle} />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value) => (
                  <span style={{ color: dark ? '#94a3b8' : '#64748b', fontSize: 11 }}>{value}</span>
                )}
              />
              <Bar dataKey="phone" stackId="a" fill="url(#analytics-bar-phone)" name={t('dashboard.analyticsPage.phoneCalls')} radius={[0, 0, 0, 0]} />
              <Bar dataKey="chat" stackId="a" fill="url(#analytics-bar-chat)" name={t('dashboard.analyticsPage.chatSessions')} radius={[0, 0, 0, 0]} />
              <Bar dataKey="whatsapp" stackId="a" fill="url(#analytics-bar-whatsapp)" name={t('dashboard.analyticsPage.whatsappMessages')} radius={[0, 0, 0, 0]} />
              <Bar dataKey="email" stackId="a" fill="url(#analytics-bar-email)" name={t('dashboard.analyticsPage.emailsAnswered')} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SurfaceCard>
      </div>
    </div>
  );
}
