'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCallbacks, useCallbackStats, useCallbackDetail, useUpdateCallback, useRetryCallback } from '@/hooks/useCallbacks';
import {
  Phone,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  PhoneMissed,
  RefreshCw,
  Search,
  Filter,
  Calendar,
  User,
  MessageSquare,
  ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/contexts/LanguageContext';
import PageIntro from '@/components/PageIntro';
import { getPageHelp } from '@/content/pageHelp';

const STATUS_CONFIG = {
  PENDING: { tKey: 'dashboard.callbacksPage.statusPending', color: 'text-yellow-600 dark:text-yellow-500', icon: Clock },
  IN_PROGRESS: { tKey: 'dashboard.callbacksPage.statusInProgress', color: 'text-yellow-600 dark:text-yellow-500', icon: Phone },
  COMPLETED: { tKey: 'dashboard.callbacksPage.statusCompleted', color: 'text-green-600 dark:text-green-500', icon: CheckCircle },
  NO_ANSWER: { tKey: 'dashboard.callbacksPage.statusNoAnswer', color: 'text-red-600 dark:text-red-500', icon: PhoneMissed },
  CANCELLED: { tKey: 'dashboard.callbacksPage.statusCancelled', color: 'text-neutral-500 dark:text-neutral-400', icon: XCircle }
};

const PRIORITY_CONFIG = {
  URGENT: { tKey: 'dashboard.callbacksPage.priorityUrgent', color: 'text-neutral-700 dark:text-neutral-400', dot: 'bg-red-500' },
  HIGH: { tKey: 'dashboard.callbacksPage.priorityHigh', color: 'text-neutral-700 dark:text-neutral-400', dot: 'bg-orange-500' },
  NORMAL: { tKey: 'dashboard.callbacksPage.priorityNormal', color: 'text-neutral-700 dark:text-neutral-400', dot: 'bg-yellow-500' },
  LOW: { tKey: 'dashboard.callbacksPage.priorityLow', color: 'text-neutral-700 dark:text-neutral-400', dot: 'bg-green-500' }
};

const PHONE_PLACEHOLDER_VALUES = new Set(['none', 'null', 'undefined', 'unknown', 'bilinmiyor', 'n/a', 'na', '-']);

function hasMeaningfulPhone(value) {
  if (value === undefined || value === null) return false;
  const raw = String(value).trim();
  if (!raw) return false;
  if (PHONE_PLACEHOLDER_VALUES.has(raw.toLowerCase())) return false;
  return raw.replace(/\D/g, '').length >= 10;
}

function formatPhone(value, fallback = '—') {
  return hasMeaningfulPhone(value) ? String(value).trim() : fallback;
}

export default function CallbacksPage() {
  const { t, locale } = useLanguage();
  const pageHelp = getPageHelp('callbacks', locale);
  const router = useRouter();

  // React Query hooks
  const { data: callbacksData, isLoading: callbacksLoading, refetch: refetchCallbacks } = useCallbacks();
  const { data: statsData, refetch: refetchStats } = useCallbackStats();
  const updateCallback = useUpdateCallback();
  const retryCallback = useRetryCallback();

  // Extract data from queries
  const callbacks = callbacksData || [];
  const stats = statsData || { pending: 0, inProgress: 0, completed: 0, today: 0, urgent: 0 };
  const loading = callbacksLoading;

  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCallback, setSelectedCallback] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [callbackNotes, setCallbackNotes] = useState('');

  // Fetch full detail (with chat transcript) when a callback is selected
  const { data: detailData, isLoading: detailLoading } = useCallbackDetail(
    selectedCallback?.id
  );
  const activeCallback = detailData || selectedCallback;

  useEffect(() => {
    if (!detailData) return;
    setNotes(detailData.notes || '');
    setCallbackNotes(detailData.callbackNotes || '');
  }, [detailData]);

  const updateStatus = async (id, status) => {
    try {
      await updateCallback.mutateAsync({ id, updates: { status } });
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleRetry = async (id) => {
    try {
      await retryCallback.mutateAsync(id);
    } catch (error) {
      console.error('Error retrying callback:', error);
    }
  };

  const saveNotes = async () => {
    if (!selectedCallback) return;

    try {
      await updateCallback.mutateAsync({ id: selectedCallback.id, updates: { notes, callbackNotes } });
      setIsDetailsOpen(false);
    } catch (error) {
      console.error('Error saving notes:', error);
    }
  };

  const openDetails = (callback) => {
    setSelectedCallback(callback);
    setNotes(callback.notes || '');
    setCallbackNotes(callback.callbackNotes || '');
    setIsDetailsOpen(true);
  };

  const filteredCallbacks = callbacks.filter(cb => {
    // Status filter
    if (filter === 'pending' && cb.status !== 'PENDING' && cb.status !== 'IN_PROGRESS') return false;
    if (filter === 'completed' && cb.status !== 'COMPLETED') return false;
    if (filter === 'no_answer' && cb.status !== 'NO_ANSWER') return false;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        cb.customerName?.toLowerCase().includes(query) ||
        (hasMeaningfulPhone(cb.customerPhone) && cb.customerPhone.includes(query)) ||
        cb.topic?.toLowerCase().includes(query)
      );
    }

    return true;
  });

  return (
    <div className="space-y-6">
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
          <Button onClick={() => { refetchCallbacks(); refetchStats(); }} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('dashboard.callbacksPage.refresh')}
          </Button>
        }
      />


      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4">
          <div className="text-2xl font-bold text-neutral-900 dark:text-white">{stats.pending}</div>
          <div className="text-sm text-neutral-600 dark:text-neutral-400">{t('dashboard.callbacksPage.pending')}</div>
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4">
          <div className="text-2xl font-bold text-neutral-900 dark:text-white">{stats.inProgress}</div>
          <div className="text-sm text-neutral-600 dark:text-neutral-400">{t('dashboard.callbacksPage.inProgress')}</div>
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4">
          <div className="text-2xl font-bold text-neutral-900 dark:text-white">{stats.completed}</div>
          <div className="text-sm text-neutral-600 dark:text-neutral-400">{t('dashboard.callbacksPage.completed')}</div>
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4">
          <div className="text-2xl font-bold text-neutral-900 dark:text-white">{stats.today}</div>
          <div className="text-sm text-neutral-600 dark:text-neutral-400">{t('dashboard.callbacksPage.today')}</div>
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4">
          <div className="text-2xl font-bold text-neutral-900 dark:text-white">{stats.urgent}</div>
          <div className="text-sm text-neutral-600 dark:text-neutral-400">{t('dashboard.callbacksPage.urgent')}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <Input
            placeholder={t('dashboard.callbacksPage.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            onClick={() => setFilter('all')}
            size="sm"
          >
            {t('dashboard.callbacksPage.all')}
          </Button>
          <Button
            variant={filter === 'pending' ? 'default' : 'outline'}
            onClick={() => setFilter('pending')}
            size="sm"
          >
            {t('dashboard.callbacksPage.pendingFilter')}
          </Button>
          <Button
            variant={filter === 'completed' ? 'default' : 'outline'}
            onClick={() => setFilter('completed')}
            size="sm"
          >
            {t('dashboard.callbacksPage.completedFilter')}
          </Button>
          <Button
            variant={filter === 'no_answer' ? 'default' : 'outline'}
            onClick={() => setFilter('no_answer')}
            size="sm"
          >
            {t('dashboard.callbacksPage.noAnswerFilter')}
          </Button>
        </div>
      </div>

      {/* Callbacks List */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-neutral-500">{t('common.loading')}</div>
        ) : filteredCallbacks.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">{t('dashboard.callbacksPage.noCallbacks')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
                <tr>
                  <th className="text-left p-4 text-sm font-medium text-neutral-600 dark:text-neutral-300">{t('dashboard.callbacksPage.customer')}</th>
                  <th className="text-left p-4 text-sm font-medium text-neutral-600 dark:text-neutral-300">{t('dashboard.callbacksPage.topic')}</th>
                  <th className="text-left p-4 text-sm font-medium text-neutral-600 dark:text-neutral-300">{t('dashboard.callbacksPage.priority')}</th>
                  <th className="text-left p-4 text-sm font-medium text-neutral-600 dark:text-neutral-300">{t('dashboard.callbacksPage.date')}</th>
                  <th className="text-left p-4 text-sm font-medium text-neutral-600 dark:text-neutral-300">{t('dashboard.callbacksPage.status')}</th>
                  <th className="text-left p-4 text-sm font-medium text-neutral-600 dark:text-neutral-300">{t('dashboard.callbacksPage.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                {filteredCallbacks.map(callback => {
                  const statusConfig = STATUS_CONFIG[callback.status];
                  const priorityConfig = PRIORITY_CONFIG[callback.priority];
                  const StatusIcon = statusConfig?.icon || Clock;

                  return (
                    <tr
                      key={callback.id}
                      className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 cursor-pointer"
                      onClick={() => openDetails(callback)}
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div>
                            <div className="text-sm font-medium text-neutral-900 dark:text-white">{callback.customerName}</div>
                            <div className="text-xs text-neutral-500">{formatPhone(callback.customerPhone)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="max-w-xs">
                          <div className="text-sm truncate text-neutral-900 dark:text-white">{callback.topic}</div>
                          {callback.assistant && (
                            <div className="text-xs text-neutral-400 mt-1">
                              {callback.assistant.name}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${priorityConfig?.dot}`} />
                          <span className={`text-xs font-medium ${priorityConfig?.color}`}>
                            {priorityConfig?.tKey ? t(priorityConfig.tKey) : callback.priority}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-neutral-500 dark:text-neutral-400">
                        {new Date(callback.requestedAt).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-US', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="p-4">
                        <span className={`text-xs font-medium ${statusConfig?.color}`}>
                          {statusConfig?.tKey ? t(statusConfig.tKey) : callback.status}
                        </span>
                      </td>
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        {callback.status === 'PENDING' && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className=""
                              onClick={() => updateStatus(callback.id, 'COMPLETED')}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              {t('dashboard.callbacksPage.markCalled')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className=""
                              onClick={() => updateStatus(callback.id, 'NO_ANSWER')}
                            >
                              <PhoneMissed className="h-4 w-4 mr-1" />
                              {t('dashboard.callbacksPage.markNoAnswer')}
                            </Button>
                          </div>
                        )}
                        {callback.status === 'NO_ANSWER' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className=""
                            onClick={() => handleRetry(callback.id)}
                          >
                            <RefreshCw className="h-4 w-4 mr-1" />
                            {t('common.retry')}
                          </Button>
                        )}
                        {callback.status === 'COMPLETED' && (
                          <span className="text-sm text-neutral-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('dashboard.callbacksPage.details')}</DialogTitle>
            <DialogDescription>
              {activeCallback?.customerName} - {formatPhone(activeCallback?.customerPhone)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Topic */}
            <div>
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{t('dashboard.callbacksPage.topic')}</label>
              <p className="mt-1 text-neutral-900 dark:text-white">{activeCallback?.topic}</p>
            </div>

            {/* Status & Priority */}
            <div className="flex gap-4">
              <div>
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{t('dashboard.callbacksPage.status')}</label>
                <div className="mt-1">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_CONFIG[activeCallback?.status]?.color}`}>
                    {STATUS_CONFIG[activeCallback?.status]?.tKey ? t(STATUS_CONFIG[activeCallback?.status].tKey) : activeCallback?.status}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{t('dashboard.callbacksPage.priority')}</label>
                <div className="mt-1">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${PRIORITY_CONFIG[activeCallback?.priority]?.color}`}>
                    {PRIORITY_CONFIG[activeCallback?.priority]?.tKey ? t(PRIORITY_CONFIG[activeCallback?.priority].tKey) : activeCallback?.priority}
                  </span>
                </div>
              </div>
            </div>

            {/* Assistant */}
            {activeCallback?.assistant && (
              <div>
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{t('dashboard.callbacksPage.assistant')}</label>
                <p className="mt-1 text-neutral-900 dark:text-white">{activeCallback.assistant.name}</p>
              </div>
            )}

            {/* Chat History — link to chat detail page */}
            {detailLoading && activeCallback?.id && (
              <div className="text-sm text-neutral-400 italic py-2">{t('common.loading')}</div>
            )}
            {!detailLoading && detailData?.chatTranscript && (
              <div>
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {t('dashboard.callbacksPage.chatTranscript')}
                </label>
                <Button
                  variant="outline"
                  className="mt-2 w-full justify-between"
                  onClick={() => router.push(
                    detailData.chatTranscript.channel === 'WHATSAPP'
                      ? `/dashboard/whatsapp?chatId=${detailData.chatTranscript.id}`
                      : `/dashboard/chats?chatId=${detailData.chatTranscript.id}`
                  )}
                >
                  <span className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    {t('dashboard.callbacksPage.viewChatHistory')}
                  </span>
                  <ExternalLink className="h-4 w-4 text-neutral-400" />
                </Button>
              </div>
            )}
            {!detailLoading && detailData?.linkStatus === 'NOT_FOUND' && (
              <p className="text-sm text-neutral-400 italic">
                {t('dashboard.callbacksPage.chatTranscriptNotFound')}
              </p>
            )}

            {/* Notes */}
            <div>
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{t('dashboard.callbacksPage.notes')}</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('dashboard.callbacksPage.addNotes')}
                className="mt-1"
                rows={3}
              />
            </div>

            {/* Callback Notes */}
            <div>
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{t('dashboard.callbacksPage.callbackNotes')}</label>
              <Textarea
                value={callbackNotes}
                onChange={(e) => setCallbackNotes(e.target.value)}
                placeholder={t('dashboard.callbacksPage.addCallbackNotes')}
                className="mt-1"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={saveNotes}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
