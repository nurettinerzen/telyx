'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAnalyticsOverview, usePeakHours, useTopQuestions } from '@/hooks/useAnalytics';
import AnalyticsDashboardView from '@/components/dashboard/AnalyticsDashboardView';

export default function AnalyticsPage() {
  const { t } = useLanguage();
  const [timeRange, setTimeRange] = useState('30d');
  const [channelFilter, setChannelFilter] = useState('all');

  const { data: analytics, isLoading: overviewLoading } = useAnalyticsOverview(timeRange);
  const { data: peakHoursData, isLoading: peakHoursLoading } = usePeakHours(timeRange);
  const { data: topQuestionsData, isLoading: topicsLoading } = useTopQuestions(
    timeRange,
    channelFilter === 'all' ? null : channelFilter,
    10
  );

  const peakHours = peakHoursData?.peakHours || [];
  const topTopics = topQuestionsData?.topTopics || [];
  const loading = overviewLoading || peakHoursLoading;

  const handleExport = () => {
    if (!analytics) return;

    const csvRows = [];
    csvRows.push([t('dashboard.analyticsPage.csvReportTitle'), `${t('dashboard.analyticsPage.csvPeriod')}: ${timeRange}`]);
    csvRows.push([]);
    csvRows.push([t('dashboard.analyticsPage.csvOverviewStats')]);
    csvRows.push([t('dashboard.analyticsPage.totalCalls'), analytics.totalCalls || 0]);
    csvRows.push([t('dashboard.analyticsPage.csvTotalMinutes'), analytics.totalMinutes || 0]);
    csvRows.push([t('dashboard.analyticsPage.csvAvgDurationSec'), analytics.avgDuration || 0]);
    csvRows.push([t('dashboard.analyticsPage.chatSessions'), analytics.chatSessions || 0]);
    csvRows.push([t('dashboard.analyticsPage.csvWhatsappSessions'), analytics.whatsappSessions || 0]);
    csvRows.push([t('dashboard.analyticsPage.emailsAnswered'), analytics.emailsAnswered || 0]);
    csvRows.push([]);

    if (analytics.channelStats) {
      csvRows.push([t('dashboard.analyticsPage.channelDistribution')]);
      csvRows.push([t('dashboard.analyticsPage.csvChannel'), t('dashboard.analyticsPage.csvCount'), t('dashboard.analyticsPage.csvPercentage')]);
      csvRows.push([t('dashboard.analyticsPage.phoneCalls'), analytics.channelStats.phone.count, `${analytics.channelStats.phone.percentage}%`]);
      csvRows.push(['Chat', analytics.channelStats.chat.count, `${analytics.channelStats.chat.percentage}%`]);
      csvRows.push(['WhatsApp', analytics.channelStats.whatsapp?.count || 0, `${analytics.channelStats.whatsapp?.percentage || 0}%`]);
      csvRows.push([t('dashboard.analyticsPage.email'), analytics.channelStats.email.count, `${analytics.channelStats.email.percentage}%`]);
      csvRows.push([]);
    }

    if (analytics.callsOverTime?.length > 0) {
      csvRows.push([t('dashboard.analyticsPage.csvDailyInteractions')]);
      csvRows.push([t('dashboard.analyticsPage.csvDate'), t('dashboard.analyticsPage.phoneCalls'), 'Chat', 'WhatsApp', t('dashboard.analyticsPage.email')]);
      analytics.callsOverTime.forEach((day) => {
        csvRows.push([day.date, day.calls, day.chats, day.whatsapp, day.emails]);
      });
      csvRows.push([]);
    }

    if (topTopics?.length > 0) {
      csvRows.push([t('dashboard.analyticsPage.topQuestions')]);
      csvRows.push([t('dashboard.analyticsPage.csvCategory'), t('dashboard.analyticsPage.csvCount'), t('dashboard.analyticsPage.csvSubtopics')]);
      topTopics.forEach((topic) => {
        const subtopics = topic.subtopics?.map((subtopic) => `${subtopic.text} (${subtopic.count})`).join('; ') || '';
        csvRows.push([topic.category, topic.count, subtopics]);
      });
    }

    const csvContent = csvRows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

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

  return (
    <AnalyticsDashboardView
      analytics={analytics}
      peakHours={peakHours}
      topTopics={topTopics}
      loading={loading}
      topicsLoading={topicsLoading}
      timeRange={timeRange}
      onTimeRangeChange={setTimeRange}
      channelFilter={channelFilter}
      onChannelFilterChange={setChannelFilter}
      onExport={handleExport}
    />
  );
}
