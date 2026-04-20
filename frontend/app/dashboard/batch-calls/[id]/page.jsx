'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Megaphone,
  ArrowLeft,
  Phone,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Pause,
  Users,
  PhoneCall,
  PhoneOff,
  ExternalLink,
  RotateCcw
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getLocalizedApiErrorMessage,
  getLocalizedApiMessage,
  getLocalizedApiWarning
} from '@/lib/api-messages';
import {
  formatBatchCallDisplayName,
  normalizeBatchTerminationReason
} from '@/lib/batch-calls';

const STATUS_CONFIG = {
  PENDING: {
    labelKey: 'dashboard.batchCallDetailPage.status.pending',
    color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400',
    icon: Clock
  },
  IN_PROGRESS: {
    labelKey: 'dashboard.batchCallDetailPage.status.inProgress',
    color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400',
    icon: Loader2
  },
  COMPLETED: {
    labelKey: 'dashboard.batchCallDetailPage.status.completed',
    color: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400',
    icon: CheckCircle2
  },
  FAILED: {
    labelKey: 'dashboard.batchCallDetailPage.status.failed',
    color: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400',
    icon: XCircle
  },
  CANCELLED: {
    labelKey: 'dashboard.batchCallDetailPage.status.cancelled',
    color: 'bg-neutral-100 dark:bg-white/8 text-neutral-800 dark:text-neutral-300',
    icon: Pause
  }
};

const CALL_STATUS_CONFIG = {
  pending: {
    labelKey: 'dashboard.batchCallDetailPage.callStatus.pending',
    color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400',
    icon: Clock
  },
  in_progress: {
    labelKey: 'dashboard.batchCallDetailPage.callStatus.inProgress',
    color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400',
    icon: PhoneCall
  },
  completed: {
    labelKey: 'dashboard.batchCallDetailPage.callStatus.completed',
    color: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400',
    icon: CheckCircle2
  },
  failed: {
    labelKey: 'dashboard.batchCallDetailPage.callStatus.failed',
    color: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400',
    icon: PhoneOff
  },
  no_answer: {
    labelKey: 'dashboard.batchCallDetailPage.callStatus.noAnswer',
    color: 'bg-neutral-100 dark:bg-white/8 text-neutral-800 dark:text-neutral-300',
    icon: PhoneOff
  }
};

const TERMINATION_KEYS = {
  agent_goodbye: 'dashboard.batchCallDetailPage.termination.agentGoodbye',
  user_goodbye: 'dashboard.batchCallDetailPage.termination.userGoodbye',
  voicemail_detected: 'dashboard.batchCallDetailPage.termination.voicemailDetected',
  no_input: 'dashboard.batchCallDetailPage.termination.noInput',
  completed: 'dashboard.batchCallDetailPage.termination.completed',
  failed: 'dashboard.batchCallDetailPage.termination.failed'
};

const TERMINATION_BADGE_STYLES = {
  agent_goodbye: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
  user_goodbye: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
  voicemail_detected: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800',
  no_input: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
  completed: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
  failed: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
};

export default function BatchCallDetailPage() {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const params = useParams();
  const { id } = params;

  const [batchCall, setBatchCall] = useState(null);
  const [loading, setLoading] = useState(true);
  const [restarting, setRestarting] = useState(false);

  const loadBatchCall = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await apiClient.get(`/api/batch-calls/${id}`);
      setBatchCall(response.data.batchCall);
    } catch (error) {
      console.error('Error loading batch call:', error);
      if (!silent) {
        toast.error(t('dashboard.batchCallDetailPage.campaignNotFound'));
        router.push('/dashboard/batch-calls');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id, router, t]);

  useEffect(() => {
    if (id) {
      loadBatchCall();
    }
  }, [id, loadBatchCall]);

  // Auto-refresh when campaign is in progress
  useEffect(() => {
    if (batchCall?.status === 'IN_PROGRESS' || batchCall?.status === 'PENDING') {
      const interval = setInterval(() => {
        loadBatchCall(true); // silent refresh
      }, 5000); // Poll every 5 seconds
      return () => clearInterval(interval);
    }
  }, [batchCall?.status, loadBatchCall]);

  const handleCancel = async () => {
    if (!confirm(t('dashboard.batchCallDetailPage.confirmCancelCampaign'))) {
      return;
    }

    try {
      const response = await apiClient.post(`/api/batch-calls/${id}/cancel`);
      toast.success(getLocalizedApiMessage(response.data, locale, t('dashboard.batchCallDetailPage.campaignCancelled')));

      // Show warning if there's one (e.g., active call will continue)
      const warningMessage = getLocalizedApiWarning(response.data, locale);
      if (warningMessage) {
        toast.info(warningMessage, { duration: 6000 });
      }

      loadBatchCall();
    } catch (error) {
      toast.error(getLocalizedApiErrorMessage(error, t('dashboard.batchCallDetailPage.errorOccurred'), locale));
    }
  };

  const handleRestart = async () => {
    if (!confirm(t('dashboard.batchCallDetailPage.confirmRestartCampaign'))) {
      return;
    }

    setRestarting(true);
    try {
      const response = await apiClient.post(`/api/batch-calls/${id}/restart`);
      const restartedBatchCall = response.data?.batchCall;

      toast.success(getLocalizedApiMessage(response.data, locale, t('dashboard.batchCallDetailPage.campaignRestarted')));

      if (response.data?.skippedDoNotCall > 0) {
        toast.info(t('dashboard.batchCallDetailPage.skippedDoNotCall', {
          count: response.data.skippedDoNotCall
        }), { duration: 5000 });
      }

      if (restartedBatchCall?.id) {
        router.push(`/dashboard/batch-calls/${restartedBatchCall.id}`);
        return;
      }

      loadBatchCall();
    } catch (error) {
      toast.error(getLocalizedApiErrorMessage(error, t('dashboard.batchCallDetailPage.errorOccurred'), locale));
    } finally {
      setRestarting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!batchCall) {
    return null;
  }

  const statusConfig = STATUS_CONFIG[batchCall.status] || STATUS_CONFIG.PENDING;
  const StatusIcon = statusConfig.icon;
  const progress = batchCall.totalRecipients > 0
    ? Math.round((batchCall.completedCalls / batchCall.totalRecipients) * 100)
    : 0;

  const recipients = batchCall.recipients || [];
  const displayName = formatBatchCallDisplayName(batchCall.name, {
    restartLabel: t('common.repeatCall')
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/batch-calls')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          {t('common.back')}
        </Button>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Megaphone className="h-8 w-8 text-neutral-600 dark:text-neutral-400" />
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{displayName}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={`${statusConfig.color} flex items-center gap-1`}>
                <StatusIcon className={`h-3 w-3 ${batchCall.status === 'IN_PROGRESS' ? 'animate-spin' : ''}`} />
                {t(statusConfig.labelKey)}
              </Badge>
              <span className="text-sm text-neutral-500 dark:text-neutral-400">
                {formatDate(batchCall.createdAt, 'long', locale)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {batchCall.status !== 'PENDING' && batchCall.status !== 'IN_PROGRESS' && (
            <Button variant="outline" onClick={handleRestart} disabled={restarting}>
              {restarting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              {t('dashboard.batchCallDetailPage.restartCampaign')}
            </Button>
          )}
          {(batchCall.status === 'PENDING' || batchCall.status === 'IN_PROGRESS') && (
            <Button variant="outline" onClick={handleCancel} className="text-red-600">
              <XCircle className="h-4 w-4 mr-2" />
              {t('dashboard.batchCallDetailPage.cancelCampaign')}
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#081224]/95 rounded-xl border border-neutral-200 dark:border-white/10 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
            <div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('dashboard.batchCallDetailPage.total')}</p>
              <p className="text-2xl font-bold text-neutral-900 dark:text-white">{batchCall.totalRecipients}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#081224]/95 rounded-xl border border-neutral-200 dark:border-white/10 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
            <div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('dashboard.batchCallDetailPage.successful')}</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{batchCall.successfulCalls || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#081224]/95 rounded-xl border border-neutral-200 dark:border-white/10 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <XCircle className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
            <div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('dashboard.batchCallDetailPage.failed')}</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{batchCall.failedCalls || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#081224]/95 rounded-xl border border-neutral-200 dark:border-white/10 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
            <div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('dashboard.batchCallDetailPage.pending')}</p>
              <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {batchCall.totalRecipients - batchCall.completedCalls}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white dark:bg-[#081224]/95 rounded-xl border border-neutral-200 dark:border-white/10 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t('dashboard.batchCallDetailPage.progress')}
          </span>
          <span className="text-sm text-neutral-600 dark:text-neutral-400">
            {batchCall.completedCalls} / {batchCall.totalRecipients} ({progress}%)
          </span>
        </div>
        <div className="w-full h-3 bg-neutral-200 dark:bg-[#0B1730]/88 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-600 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Recipients Table */}
      <div className="bg-white dark:bg-[#081224]/95 rounded-xl border border-neutral-200 dark:border-white/10 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-white/10">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
            {t('dashboard.batchCallDetailPage.recipientsList')}
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50 dark:bg-[#0B1730]/88 border-b border-neutral-200 dark:border-white/10">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  {t('dashboard.batchCallDetailPage.phoneHeader')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  {t('dashboard.batchCallDetailPage.customerHeader')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  {t('dashboard.batchCallDetailPage.statusHeader')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  {t('dashboard.batchCallDetailPage.durationHeader')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  {t('dashboard.batchCallDetailPage.terminationHeader')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  {t('dashboard.batchCallDetailPage.actionHeader')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-white/10">
              {recipients.length > 0 ? (
                recipients.map((recipient, index) => {
                  const callStatus = CALL_STATUS_CONFIG[recipient.status] || CALL_STATUS_CONFIG.pending;
                  const normalizedTerminationReason = normalizeBatchTerminationReason(recipient.terminationReason);
                  const terminationBadgeClass = TERMINATION_BADGE_STYLES[normalizedTerminationReason]
                    || 'bg-neutral-50 dark:bg-[#0B1730]/88 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-white/10';
                  const terminationLabel = TERMINATION_KEYS[normalizedTerminationReason]
                    ? t(TERMINATION_KEYS[normalizedTerminationReason])
                    : recipient.terminationReason;

                  return (
                    <tr key={index} className="hover:bg-neutral-50 dark:hover:bg-white/[0.03]">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Phone className="h-4 w-4 text-neutral-400 dark:text-neutral-500 mr-2" />
                          <span className="text-sm text-neutral-900 dark:text-white">{recipient.phone_number}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-neutral-900 dark:text-white">
                          {recipient.customer_name || '-'}
                        </span>
                        {recipient.debt_amount && (
                          <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-2">
                            ({recipient.debt_amount} TL)
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${
                            recipient.status === 'completed' ? 'bg-green-500' :
                            recipient.status === 'failed' || recipient.status === 'no_answer' ? 'bg-red-500' :
                            recipient.status === 'in_progress' ? 'bg-blue-500' :
                            'bg-yellow-500'
                          }`} />
                          <span className="text-sm text-neutral-700 dark:text-neutral-300">
                            {t(callStatus.labelKey)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-neutral-600 dark:text-neutral-400">
                          {recipient.duration ? `${Math.floor(recipient.duration / 60)}:${String(recipient.duration % 60).padStart(2, '0')}` : '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-neutral-600 dark:text-neutral-400">
                          {recipient.terminationReason ? (
                            <Badge variant="outline" className={terminationBadgeClass}>
                              {terminationLabel}
                            </Badge>
                          ) : '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {recipient.callLogId ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/dashboard/calls?callId=${recipient.callLogId}`)}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            {t('dashboard.batchCallDetailPage.details')}
                          </Button>
                        ) : (recipient.status === 'completed' || recipient.status === 'failed') ? (
                          <span className="text-xs text-neutral-400 dark:text-neutral-500">
                            {t('dashboard.batchCallDetailPage.waitingForRecord')}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-neutral-500 dark:text-neutral-400">
                    {t('dashboard.batchCallDetailPage.noRecipientsFound')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
