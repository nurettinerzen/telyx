/**
 * Analytics Dashboard
 * Multi-channel analytics with phone, chat, and email metrics
 */

'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import PageIntro from '@/components/PageIntro';
import { getPageHelp } from '@/content/pageHelp';
import { useAnalyticsOverview, usePeakHours, useTopQuestions } from '@/hooks/useAnalytics';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Phone,
  Clock,
  Calendar,
  Download,
  MessageCircle,
  Mail,
  HelpCircle,
  Tag
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDuration } from '@/lib/utils';
import {
  LineChart,
  Line,
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

const CHANNEL_COLORS = {
  phone: '#00A2B3',      // Brand color - Teal
  chat: '#3B82F6',       // Blue - Chat
  whatsapp: '#10B981',   // Green - WhatsApp
  email: '#F59E0B'       // Amber - Email
};

// WhatsApp icon component
const WhatsAppIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

export default function AnalyticsPage() {
  const { t, locale } = useLanguage();
  const pageHelp = getPageHelp('analytics', locale);
  const [timeRange, setTimeRange] = useState('30d');
  const [channelFilter, setChannelFilter] = useState('all');

  // React Query hooks - automatic caching and revalidation
  const { data: analytics, isLoading: overviewLoading } = useAnalyticsOverview(timeRange);
  const { data: peakHoursData, isLoading: peakHoursLoading } = usePeakHours(timeRange);
  const { data: topQuestionsData, isLoading: topicsLoading } = useTopQuestions(
    timeRange,
    channelFilter === 'all' ? null : channelFilter,
    10
  );

  // Extract data from query results
  const peakHours = peakHoursData?.peakHours || [];
  const topTopics = topQuestionsData?.topTopics || [];
  const loading = overviewLoading || peakHoursLoading;

  const handleExport = () => {
    if (!analytics) return;

    // Prepare CSV data
    const csvRows = [];

    // Header
    csvRows.push([t('dashboard.analyticsPage.csvReportTitle'), `${t('dashboard.analyticsPage.csvPeriod')}: ${timeRange}`]);
    csvRows.push([]);

    // Overview stats
    csvRows.push([t('dashboard.analyticsPage.csvOverviewStats')]);
    csvRows.push([t('dashboard.analyticsPage.totalCalls'), analytics.totalCalls || 0]);
    csvRows.push([t('dashboard.analyticsPage.csvTotalMinutes'), analytics.totalMinutes || 0]);
    csvRows.push([t('dashboard.analyticsPage.csvAvgDurationSec'), analytics.avgDuration || 0]);
    csvRows.push([t('dashboard.analyticsPage.chatSessions'), analytics.chatSessions || 0]);
    csvRows.push([t('dashboard.analyticsPage.csvWhatsappSessions'), analytics.whatsappSessions || 0]);
    csvRows.push([t('dashboard.analyticsPage.emailsAnswered'), analytics.emailsAnswered || 0]);
    csvRows.push([]);

    // Channel distribution
    csvRows.push([t('dashboard.analyticsPage.channelDistribution')]);
    csvRows.push([t('dashboard.analyticsPage.csvChannel'), t('dashboard.analyticsPage.csvCount'), t('dashboard.analyticsPage.csvPercentage')]);
    if (analytics.channelStats) {
      csvRows.push([t('dashboard.analyticsPage.phoneCalls'), analytics.channelStats.phone.count, `${analytics.channelStats.phone.percentage}%`]);
      csvRows.push(['Chat', analytics.channelStats.chat.count, `${analytics.channelStats.chat.percentage}%`]);
      csvRows.push(['WhatsApp', analytics.channelStats.whatsapp?.count || 0, `${analytics.channelStats.whatsapp?.percentage || 0}%`]);
      csvRows.push([t('dashboard.analyticsPage.email'), analytics.channelStats.email.count, `${analytics.channelStats.email.percentage}%`]);
    }
    csvRows.push([]);

    // Calls over time
    if (analytics.callsOverTime?.length > 0) {
      csvRows.push([t('dashboard.analyticsPage.csvDailyInteractions')]);
      csvRows.push([t('dashboard.analyticsPage.csvDate'), t('dashboard.analyticsPage.phoneCalls'), 'Chat', 'WhatsApp', t('dashboard.analyticsPage.email')]);
      analytics.callsOverTime.forEach(day => {
        csvRows.push([day.date, day.calls, day.chats, day.whatsapp, day.emails]);
      });
      csvRows.push([]);
    }

    // Top topics
    if (topTopics?.length > 0) {
      csvRows.push([t('dashboard.analyticsPage.topQuestions')]);
      csvRows.push([t('dashboard.analyticsPage.csvCategory'), t('dashboard.analyticsPage.csvCount'), t('dashboard.analyticsPage.csvSubtopics')]);
      topTopics.forEach(topic => {
        const subtopics = topic.subtopics?.map(s => `${s.text} (${s.count})`).join('; ') || '';
        csvRows.push([topic.category, topic.count, subtopics]);
      });
    }

    // Convert to CSV string
    const csvContent = csvRows.map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    // Download
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analitik-rapor-${timeRange}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(t('dashboard.analyticsPage.reportDownloaded'));
  };

  const TIME_RANGES = [
    { value: '7d', label: t('dashboard.analyticsPage.last7Days') },
    { value: '30d', label: t('dashboard.analyticsPage.last30Days') },
    { value: '90d', label: t('dashboard.analyticsPage.last90Days') },
  ];

  // Prepare channel data for pie chart
  const channelData = analytics?.channelStats ? [
    { name: t('dashboard.analyticsPage.phoneCalls'), value: analytics.channelStats.phone.count, percentage: analytics.channelStats.phone.percentage, color: CHANNEL_COLORS.phone },
    { name: t('dashboard.analyticsPage.chatSessions'), value: analytics.channelStats.chat.count, percentage: analytics.channelStats.chat.percentage, color: CHANNEL_COLORS.chat },
    { name: t('dashboard.analyticsPage.whatsappMessages'), value: analytics.channelStats.whatsapp?.count || 0, percentage: analytics.channelStats.whatsapp?.percentage || 0, color: CHANNEL_COLORS.whatsapp },
    { name: t('dashboard.analyticsPage.emailsAnswered'), value: analytics.channelStats.email.count, percentage: analytics.channelStats.email.percentage, color: CHANNEL_COLORS.email }
  ].filter(item => item.value > 0) : [];

  // Channel icon helper
  const getChannelIcon = (channel) => {
    switch(channel) {
      case 'phone': return <Phone className="h-3 w-3" />;
      case 'chat': return <MessageCircle className="h-3 w-3" />;
      case 'whatsapp': return <WhatsAppIcon className="h-3 w-3" />;
      case 'email': return <Mail className="h-3 w-3" />;
      default: return <HelpCircle className="h-3 w-3" />;
    }
  };

  const getChannelColor = (channel) => {
    switch(channel) {
      case 'phone': return 'bg-[#00A2B3]/10 text-[#00A2B3] dark:bg-[#00A2B3]/20 dark:text-[#00A2B3]';
      case 'chat': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'whatsapp': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'email': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const getChannelIconColor = (channel) => {
    switch(channel) {
      case 'phone': return 'text-[#00A2B3]';
      case 'chat': return 'text-[#3B82F6]';
      case 'whatsapp': return 'text-[#10B981]';
      case 'email': return 'text-[#F59E0B]';
      default: return 'text-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-neutral-200 dark:bg-neutral-700 rounded-xl animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
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
          <div className="flex gap-3">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-48 h-9">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGES.map((range) => (
                  <SelectItem key={range.value} value={range.value}>
                    {range.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-9" onClick={handleExport} disabled={!analytics}>
              <Download className="h-4 w-4 mr-2" />
              {t('dashboard.analyticsPage.export')}
            </Button>
          </div>
        }
      />

      {/* Overview Cards - 5 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Calls */}
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <Phone className="h-5 w-5 text-[#00A2B3]" />
          </div>
          <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
            {analytics?.totalCalls || 0}
          </h3>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">{t('dashboard.analyticsPage.totalCalls')}</p>
        </div>

        {/* Chat Sessions */}
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <MessageCircle className="h-5 w-5 text-[#3B82F6]" />
          </div>
          <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
            {analytics?.chatSessions || 0}
          </h3>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">{t('dashboard.analyticsPage.chatSessions')}</p>
        </div>

        {/* WhatsApp Messages */}
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <WhatsAppIcon className="h-5 w-5 text-[#10B981]" />
          </div>
          <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
            {analytics?.whatsappSessions || 0}
          </h3>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">{t('dashboard.analyticsPage.whatsappMessages')}</p>
        </div>

        {/* Emails Answered */}
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <Mail className="h-5 w-5 text-[#F59E0B]" />
          </div>
          <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
            {analytics?.emailsAnswered || 0}
          </h3>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">{t('dashboard.analyticsPage.emailsAnswered')}</p>
        </div>

        {/* Average Call Duration */}
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <Clock className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
          </div>
          <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
            {formatDuration(analytics?.avgDuration || 0)}
          </h3>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">{t('dashboard.analyticsPage.avgCallDuration')}</p>
        </div>
      </div>

      {/* Channel Session Duration Cards */}
      <div>
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
          {t('dashboard.analyticsPage.channelSessionDurationTitle')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle className="h-4 w-4 text-[#3B82F6]" />
              <p className="text-sm font-semibold text-neutral-900 dark:text-white">{t('dashboard.analyticsPage.chatSessions')}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {t('dashboard.analyticsPage.averageSessionDuration')}: <span className="font-semibold text-neutral-900 dark:text-white">{formatDuration(analytics?.channelSessionDuration?.chat?.averageSeconds || 0)}</span>
              </p>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {t('dashboard.analyticsPage.totalSessionDuration')}: <span className="font-semibold text-neutral-900 dark:text-white">{formatDuration(analytics?.channelSessionDuration?.chat?.totalSeconds || 0)}</span>
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <WhatsAppIcon className="h-4 w-4 text-[#10B981]" />
              <p className="text-sm font-semibold text-neutral-900 dark:text-white">WhatsApp</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {t('dashboard.analyticsPage.averageSessionDuration')}: <span className="font-semibold text-neutral-900 dark:text-white">{formatDuration(analytics?.channelSessionDuration?.whatsapp?.averageSeconds || 0)}</span>
              </p>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {t('dashboard.analyticsPage.totalSessionDuration')}: <span className="font-semibold text-neutral-900 dark:text-white">{formatDuration(analytics?.channelSessionDuration?.whatsapp?.totalSeconds || 0)}</span>
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Mail className="h-4 w-4 text-[#F59E0B]" />
              <p className="text-sm font-semibold text-neutral-900 dark:text-white">{t('dashboard.analyticsPage.email')}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {t('dashboard.analyticsPage.averageSessionDuration')}: <span className="font-semibold text-neutral-900 dark:text-white">{formatDuration(analytics?.channelSessionDuration?.email?.averageSeconds || 0)}</span>
              </p>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {t('dashboard.analyticsPage.totalSessionDuration')}: <span className="font-semibold text-neutral-900 dark:text-white">{formatDuration(analytics?.channelSessionDuration?.email?.totalSeconds || 0)}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Multi-Channel Activity Chart */}
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-4">{t('dashboard.analyticsPage.activityOverTime')}</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={(analytics?.callsOverTime || []).map(item => ({
              ...item,
              date: new Date(item.date).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-US', { month: 'short', day: 'numeric' })
            }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="calls"
                stroke={CHANNEL_COLORS.phone}
                strokeWidth={2}
                name={t('dashboard.analyticsPage.phoneCalls')}
              />
              <Line
                type="monotone"
                dataKey="chats"
                stroke={CHANNEL_COLORS.chat}
                strokeWidth={2}
                name={t('dashboard.analyticsPage.chatSessions')}
              />
              <Line
                type="monotone"
                dataKey="whatsapp"
                stroke={CHANNEL_COLORS.whatsapp}
                strokeWidth={2}
                name={t('dashboard.analyticsPage.whatsappMessages')}
              />
              <Line
                type="monotone"
                dataKey="emails"
                stroke={CHANNEL_COLORS.email}
                strokeWidth={2}
                name={t('dashboard.analyticsPage.emailsAnswered')}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Channel Distribution */}
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-4">{t('dashboard.analyticsPage.channelDistribution')}</h3>
          {channelData.length > 0 ? (
            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={channelData}
                    cx="50%"
                    cy="45%"
                    labelLine={false}
                    label={({ cx, cy, midAngle, innerRadius, outerRadius, percentage }) => {
                      const RADIAN = Math.PI / 180;
                      const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                      const x = cx + radius * Math.cos(-midAngle * RADIAN);
                      const y = cy + radius * Math.sin(-midAngle * RADIAN);
                      return percentage > 5 ? (
                        <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
                          {`${percentage}%`}
                        </text>
                      ) : null;
                    }}
                    outerRadius={90}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {channelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value, entry) => {
                      const item = channelData.find(d => d.name === value);
                      return `${value} (${item?.percentage || 0}%)`;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-neutral-500 dark:text-neutral-400">
              {t('dashboard.analyticsPage.noDataYet')}
            </div>
          )}
        </div>
      </div>

      {/* Top Topics Section */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">{t('dashboard.analyticsPage.topQuestions')}</h3>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setChannelFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                channelFilter === 'all'
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
              }`}
            >
              {t('dashboard.analyticsPage.allChannels')}
            </button>
            <button
              onClick={() => setChannelFilter('phone')}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1 ${
                channelFilter === 'phone'
                  ? 'bg-[#00A2B3] text-white'
                  : 'bg-[#00A2B3]/10 text-[#00A2B3] hover:bg-[#00A2B3]/20 dark:bg-[#00A2B3]/20 dark:hover:bg-[#00A2B3]/30'
              }`}
            >
              <Phone className="h-3 w-3" />
              {t('dashboard.analyticsPage.phoneCalls')}
            </button>
            <button
              onClick={() => setChannelFilter('chat')}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1 ${
                channelFilter === 'chat'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50'
              }`}
            >
              <MessageCircle className="h-3 w-3" />
              {t('dashboard.analyticsPage.chatSessions')}
            </button>
            <button
              onClick={() => setChannelFilter('whatsapp')}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1 ${
                channelFilter === 'whatsapp'
                  ? 'bg-green-600 text-white'
                  : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50'
              }`}
            >
              <WhatsAppIcon className="h-3 w-3" />
              WhatsApp
            </button>
            <button
              onClick={() => setChannelFilter('email')}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1 ${
                channelFilter === 'email'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50'
              }`}
            >
              <Mail className="h-3 w-3" />
              {t('dashboard.analyticsPage.emailsAnswered')}
            </button>
          </div>
        </div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
          {t('dashboard.analyticsPage.topQuestionsDescription')}
        </p>
        {topicsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg animate-pulse">
                <div className="h-6 w-48 bg-neutral-200 dark:bg-neutral-700 rounded mb-2"></div>
                <div className="h-4 w-full bg-neutral-200 dark:bg-neutral-700 rounded"></div>
              </div>
            ))}
          </div>
        ) : topTopics.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {topTopics.map((topic, index) => (
              <div
                key={index}
                className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-neutral-900 dark:text-white">
                      {topic.category}
                    </span>
                    <Badge variant="outline" className="font-semibold text-xs">
                      {topic.count}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {topic.channels.map((channel) => (
                      <span key={channel} className={getChannelIconColor(channel)}>
                        {getChannelIcon(channel)}
                      </span>
                    ))}
                  </div>
                </div>
                {/* Subtopics with counts */}
                {topic.subtopics && topic.subtopics.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {topic.subtopics.map((subtopic, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-white dark:bg-neutral-700 rounded-full border border-neutral-200 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300"
                      >
                        {subtopic.text}
                        <span className="font-semibold text-primary-600 dark:text-primary-400">
                          {subtopic.count}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
                {/* Fallback for old examples format */}
                {!topic.subtopics && topic.examples && topic.examples.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {topic.examples.slice(0, 2).map((example, i) => (
                      <p key={i} className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1">
                        "{example}"
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
            {t('dashboard.analyticsPage.noQuestionsYet')}
          </div>
        )}
      </div>

      {/* Peak Hours Chart */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-4">{t('dashboard.analyticsPage.peakActivityHours')}</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={peakHours}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="hour" />
            <YAxis />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #e5e7eb',
                borderRadius: '8px'
              }}
              labelStyle={{ color: '#000' }}
            />
            <Legend />
            <Bar dataKey="phone" stackId="a" fill={CHANNEL_COLORS.phone} name={t('dashboard.analyticsPage.phoneCalls')} />
            <Bar dataKey="chat" stackId="a" fill={CHANNEL_COLORS.chat} name={t('dashboard.analyticsPage.chatSessions')} />
            <Bar dataKey="whatsapp" stackId="a" fill={CHANNEL_COLORS.whatsapp} name="WhatsApp" />
            <Bar dataKey="email" stackId="a" fill={CHANNEL_COLORS.email} name={t('dashboard.analyticsPage.emailsAnswered')} />
          </BarChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}
