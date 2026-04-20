/**
 * Email Inbox Dashboard
 * View threads, manage drafts, and send AI-assisted responses
 */

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Inbox,
  Mail,
  Send,
  RefreshCw,
  CheckCircle2,
  Clock,
  MessageSquare,
  Pencil,
  RotateCcw,
  X,
  ChevronRight,
  AlertCircle,
  Trash2,
  ExternalLink,
  Search,
  Paperclip
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/contexts/LanguageContext';
import PageIntro from '@/components/PageIntro';
import { getPageHelp } from '@/content/pageHelp';
import { formatDistanceToNow } from 'date-fns';
import { useEmailStatus, useEmailThreads, useEmailThread, useEmailStats } from '@/hooks/useEmail';
import { useQueryClient } from '@tanstack/react-query';

// Status badge colors and translation keys
const STATUS_CONFIG = {
  NEW: { bg: 'bg-neutral-100 dark:bg-neutral-800', text: 'text-neutral-700 dark:text-neutral-400', key: 'new' },
  PENDING_REPLY: { bg: 'bg-neutral-100 dark:bg-neutral-800', text: 'text-neutral-700 dark:text-neutral-400', key: 'new' }, // Legacy - treat same as NEW
  DRAFT_READY: { bg: 'bg-neutral-100 dark:bg-neutral-800', text: 'text-neutral-700 dark:text-neutral-400', key: 'draftReady' },
  REPLIED: { bg: 'bg-neutral-100 dark:bg-neutral-800', text: 'text-neutral-700 dark:text-neutral-400', key: 'replied' },
  CLOSED: { bg: 'bg-neutral-100 dark:bg-neutral-800', text: 'text-neutral-700 dark:text-neutral-400', key: 'closed' },
  NO_REPLY_NEEDED: { bg: 'bg-neutral-100 dark:bg-neutral-800', text: 'text-neutral-700 dark:text-neutral-400', key: 'noReplyNeeded' }
};

export default function EmailDashboardPage() {
  const { t, locale } = useLanguage();
  const pageHelp = getPageHelp('email', locale);
  const queryClient = useQueryClient();

  // React Query hooks
  const { data: emailStatus, isLoading: statusLoading } = useEmailStatus();
  const [statusFilter, setStatusFilter] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const { data: threads = [], isLoading: threadsLoading, refetch: refetchThreads } = useEmailThreads(statusFilter, debouncedSearch || null);
  const { data: stats } = useEmailStats();
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const { data: selectedThread } = useEmailThread(selectedThreadId, !!selectedThreadId);

  const loading = statusLoading || threadsLoading;

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // UI State
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);

  // Draft editor state
  const [editedContent, setEditedContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);

  // Update draft content when selected thread changes
  useEffect(() => {
    if (selectedThread?.drafts && selectedThread.drafts.length > 0) {
      const activeDraft = selectedThread.drafts.find(d => d.status === 'PENDING_REVIEW');
      if (activeDraft) {
        setEditedContent(activeDraft.editedContent || activeDraft.generatedContent);
      }
    }
  }, [selectedThread]);

  // Sync emails with real-time updates via SSE
  const handleSync = async () => {
    setSyncing(true);

    try {
      // Create EventSource with custom headers (requires polyfill or fetch workaround)
      // Since EventSource doesn't support custom headers, we'll use fetch with stream
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/email/sync/stream`,
        {
          method: 'GET',
          credentials: 'include',
          headers: {
            Accept: 'text/event-stream'
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to start sync');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Process stream
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          setSyncing(false);
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          const eventMatch = line.match(/^event: (.+)$/m);
          const dataMatch = line.match(/^data: (.+)$/m);

          if (eventMatch && dataMatch) {
            const eventType = eventMatch[1];
            const data = JSON.parse(dataMatch[1]);

            switch (eventType) {
              case 'started':
                console.log('Sync started:', data.message);
                break;

              case 'thread':
                console.log('New thread:', data.thread);

                // Optimistic update: immediately add/update thread in cache
                // so it appears in the list without waiting for refetch
                if (data.thread) {
                  queryClient.setQueriesData(
                    { queryKey: ['email', 'threads'] },
                    (old) => {
                      if (!Array.isArray(old)) return old;
                      const idx = old.findIndex(t => t.id === data.thread.id);
                      if (idx >= 0) {
                        // Update existing thread
                        const updated = [...old];
                        updated[idx] = { ...updated[idx], ...data.thread };
                        return updated.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
                      }
                      // Add new thread at top
                      return [data.thread, ...old];
                    }
                  );
                }

                // Also invalidate stats (counts may have changed)
                queryClient.invalidateQueries({ queryKey: ['email', 'stats'] });
                break;

              case 'completed':
                console.log('Sync completed:', data);
                {
                  const count = data.processedCount || 0;
                  const msg = count > 0
                    ? (locale === 'tr' ? `${count} yeni e-posta senkronize edildi` : `Synced ${count} new emails`)
                    : (locale === 'tr' ? 'Tüm e-postalar güncel' : 'All emails are up to date');
                  toast.success(msg);
                }

                // Final refresh
                queryClient.invalidateQueries({ queryKey: ['email'] });
                setSyncing(false);
                break;

              case 'error':
                console.error('Sync error:', data);
                toast.error(t('dashboard.emailPage.failedToSyncEmails'));
                setSyncing(false);
                break;
            }
          }
        }
      }
    } catch (error) {
      console.error('Sync error:', error);
      toast.error(t('dashboard.emailPage.failedToSyncEmails'));
      setSyncing(false);
    }
  };

  // Send draft
  const handleSendDraft = async () => {
    if (!selectedThread || !selectedThread.drafts?.length) return;

    const activeDraft = selectedThread.drafts.find(d => d.status === 'PENDING_REVIEW');
    if (!activeDraft) return;

    // Update draft content if edited
    if (editedContent !== activeDraft.generatedContent) {
      await apiClient.put(`/api/email/drafts/${activeDraft.id}`, {
        content: editedContent
      });
    }

    setSending(true);
    try {
      await apiClient.post(`/api/email/drafts/${activeDraft.id}/send`);
      toast.success(t('dashboard.emailPage.emailSentSuccess'));
      queryClient.invalidateQueries({ queryKey: ['email'] });
      setIsEditing(false);
    } catch (error) {
      toast.error(t('dashboard.emailPage.failedToSendEmail'));
    } finally {
      setSending(false);
    }
  };

  // Regenerate draft
  const handleRegenerateDraft = async (feedback = null) => {
    if (!selectedThread || !selectedThread.drafts?.length) return;

    const activeDraft = selectedThread.drafts.find(d => d.status === 'PENDING_REVIEW');
    if (!activeDraft) return;

    setRegenerating(true);
    try {
      await apiClient.post(`/api/email/drafts/${activeDraft.id}/regenerate`, { feedback });
      toast.success(t('dashboard.emailPage.draftRegenerated'));
      queryClient.invalidateQueries({ queryKey: ['email', 'threads', selectedThreadId] });
    } catch (error) {
      toast.error(t('dashboard.emailPage.failedToRegenerateDraft'));
    } finally {
      setRegenerating(false);
    }
  };

  // Close thread
  const handleCloseThread = async () => {
    if (!selectedThread) return;

    try {
      await apiClient.post(`/api/email/threads/${selectedThread.id}/close`);
      toast.success(t('dashboard.emailPage.threadClosed'));
      queryClient.invalidateQueries({ queryKey: ['email'] });
      setSelectedThreadId(null);
    } catch (error) {
      toast.error(t('dashboard.emailPage.failedToCloseThread'));
    }
  };

  // Mark thread as NO_REPLY_NEEDED (manual tagging)
  const handleMarkNoReplyNeeded = async () => {
    if (!selectedThread) return;

    try {
      await apiClient.email.updateThread(selectedThread.id, { status: 'NO_REPLY_NEEDED' });
      toast.success(t('dashboard.emailPage.markedNoReplyNeeded'));
      queryClient.invalidateQueries({ queryKey: ['email'] });
    } catch (error) {
      toast.error(t('dashboard.emailPage.failedToMarkNoReplyNeeded'));
    }
  };

  // Generate draft manually (for NO_REPLY_NEEDED threads that user wants to reply to)
  const handleGenerateDraft = async () => {
    if (!selectedThread) return;

    setGeneratingDraft(true);
    try {
      await apiClient.email.generateDraft(selectedThread.id);
      toast.success(t('dashboard.emailPage.draftGenerated'));
      queryClient.invalidateQueries({ queryKey: ['email'] });
    } catch (error) {
      toast.error(t('dashboard.emailPage.failedToGenerateDraft'));
    } finally {
      setGeneratingDraft(false);
    }
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return dateString;
    }
  };

  // Get active draft
  const getActiveDraft = () => {
    if (!selectedThread?.drafts) return null;
    return selectedThread.drafts.find(d => d.status === 'PENDING_REVIEW');
  };

  // Not connected state
  if (!loading && !emailStatus?.connected) {
    return (
      <div className="space-y-6">
        <PageIntro
          title={pageHelp.title}
          subtitle={pageHelp.subtitle}
          locale={locale}
          help={{
            tooltipTitle: pageHelp.tooltipTitle,
            tooltipBody: pageHelp.tooltipBody,
            quickSteps: pageHelp.quickSteps,
          }}
        />

        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-12 text-center">
          <Mail className="h-16 w-16 mx-auto text-neutral-600 dark:text-neutral-400 mb-4" />
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-2">
            {t('dashboard.emailPage.connectYourEmail')}
          </h2>
          <p className="text-neutral-600 dark:text-neutral-400 mb-6 max-w-md mx-auto">
            {t('dashboard.emailPage.connectEmailDesc')}
          </p>
          <Button onClick={() => window.location.href = '/dashboard/integrations'}>
            {t('dashboard.emailPage.goToIntegrations')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageIntro
        title={pageHelp.title}
        subtitle={emailStatus?.email
          ? `${t('dashboard.emailPage.connected')}: ${emailStatus.email}`
          : pageHelp.subtitle
        }
        locale={locale}
        help={{
          tooltipTitle: pageHelp.tooltipTitle,
          tooltipBody: pageHelp.tooltipBody,
          quickSteps: pageHelp.quickSteps,
        }}
        actions={
          <Button onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? t('dashboard.emailPage.syncing') : t('dashboard.emailPage.syncEmails')}
          </Button>
        }
      />

      {/* Stats - Clickable for filtering */}
      {/* Order: AI Taslak (DRAFT_READY), Yanıtlandı (REPLIED), Yanıt Gerekmiyor (NO_REPLY_NEEDED), Tüm Konuşmalar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* AI Taslak (DRAFT_READY) */}
          <button
            onClick={() => {
              setStatusFilter(statusFilter === 'DRAFT_READY' ? null : 'DRAFT_READY');
            }}
            className={`bg-white dark:bg-neutral-900 rounded-lg border p-4 text-left transition-all hover:shadow-md ${
              statusFilter === 'DRAFT_READY' ? 'border-neutral-400 ring-2 ring-neutral-200 dark:ring-neutral-700' : 'border-neutral-200 dark:border-neutral-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <Pencil className="h-6 w-6 text-neutral-600 dark:text-neutral-400" />
              <div>
                <p className="text-2xl font-bold text-neutral-900 dark:text-white">{stats.draftReadyCount || 0}</p>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('dashboard.emailPage.aiDraft')}</p>
              </div>
            </div>
          </button>
          {/* Yanıtlandı (REPLIED) */}
          <button
            onClick={() => {
              setStatusFilter(statusFilter === 'REPLIED' ? null : 'REPLIED');
            }}
            className={`bg-white dark:bg-neutral-900 rounded-lg border p-4 text-left transition-all hover:shadow-md ${
              statusFilter === 'REPLIED' ? 'border-neutral-400 ring-2 ring-neutral-200 dark:ring-neutral-700' : 'border-neutral-200 dark:border-neutral-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-neutral-600 dark:text-neutral-400" />
              <div>
                <p className="text-2xl font-bold text-neutral-900 dark:text-white">{stats.repliedCount || 0}</p>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('dashboard.emailPage.replied')}</p>
              </div>
            </div>
          </button>
          {/* Yanıt Gerekmiyor (NO_REPLY_NEEDED) */}
          <button
            onClick={() => {
              setStatusFilter(statusFilter === 'NO_REPLY_NEEDED' ? null : 'NO_REPLY_NEEDED');
            }}
            className={`bg-white dark:bg-neutral-900 rounded-lg border p-4 text-left transition-all hover:shadow-md ${
              statusFilter === 'NO_REPLY_NEEDED' ? 'border-neutral-400 ring-2 ring-neutral-200 dark:ring-neutral-700' : 'border-neutral-200 dark:border-neutral-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <Clock className="h-6 w-6 text-neutral-600 dark:text-neutral-400" />
              <div>
                <p className="text-2xl font-bold text-neutral-900 dark:text-white">{stats.noReplyNeededCount || 0}</p>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('dashboard.emailPage.noReplyNeeded')}</p>
              </div>
            </div>
          </button>
          {/* Tüm Konuşmalar */}
          <button
            onClick={() => {
              setStatusFilter(null);
            }}
            className={`bg-white dark:bg-neutral-900 rounded-lg border p-4 text-left transition-all hover:shadow-md ${
              statusFilter === null ? 'border-neutral-500 ring-2 ring-neutral-200 dark:ring-neutral-700' : 'border-neutral-200 dark:border-neutral-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
                <Inbox className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-900 dark:text-white">{stats.totalThreads || 0}</p>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('dashboard.emailPage.allConversations')}</p>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Thread List */}
        <div className="lg:col-span-1 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-700 space-y-3">
            <h2 className="font-semibold text-neutral-900 dark:text-white">{t('dashboard.emailPage.conversations')}</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={locale === 'tr' ? 'Konu, isim veya e-posta ara...' : 'Search subject, name or email...'}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600"
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <X className="h-3.5 w-3.5 text-neutral-400 hover:text-neutral-600" />
                </button>
              )}
            </div>
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800 max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center">
                <RefreshCw className="h-6 w-6 mx-auto text-neutral-400 animate-spin" />
              </div>
            ) : threads.length === 0 ? (
              <div className="p-8 text-center text-neutral-500">
                <Mail className="h-8 w-8 mx-auto mb-2 text-neutral-400" />
                <p>{t('dashboard.emailPage.noConversations')}</p>
                <p className="text-sm mt-1">{t('dashboard.emailPage.syncToGetStarted')}</p>
              </div>
            ) : (
              threads.map((thread) => {
                const statusStyle = STATUS_CONFIG[thread.status] || STATUS_CONFIG.NEW;
                const isSelected = selectedThread?.id === thread.id;
                const hasDraft = thread.drafts?.some(d => d.status === 'PENDING_REVIEW');
                // Don't show badge for NEW or PENDING_REPLY status (they look the same as "no tag")
                const showStatusBadge = thread.status && !['NEW', 'PENDING_REPLY'].includes(thread.status);
                // Check if any message in thread has attachments
                const attachmentCount = thread.messages?.reduce((sum, m) => sum + (m.attachments?.length || 0), 0) || 0;
                const hasAttachments = attachmentCount > 0;

                return (
                  <button
                    key={thread.id}
                    onClick={() => setSelectedThreadId(thread.id)}
                    className={`w-full text-left p-4 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors ${
                      isSelected ? 'bg-neutral-50 dark:bg-neutral-800 border-l-4 border-neutral-400' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-neutral-900 dark:text-white truncate">
                          {thread.customerName || thread.customerEmail}
                        </p>
                        <p className="text-sm text-neutral-600 dark:text-neutral-400 truncate mt-0.5">
                          {thread.subject}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          {showStatusBadge && (
                            <Badge className={`${statusStyle.bg} ${statusStyle.text} text-xs`}>
                              {t(`dashboard.emailPage.status.${statusStyle.key}`)}
                            </Badge>
                          )}
                          {hasDraft && !showStatusBadge && (
                            <Badge className="bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 text-xs">
                              {t('dashboard.emailPage.aiDraft')}
                            </Badge>
                          )}
                          {hasAttachments && (
                            <span className="inline-flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                              <Paperclip className="h-3 w-3" />
                              <span>{attachmentCount > 1 ? `${attachmentCount} ${locale === 'tr' ? 'Ek' : 'Files'}` : (locale === 'tr' ? 'Ek' : 'File')}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-neutral-500">
                          {formatDate(thread.lastMessageAt)}
                        </p>
                        <ChevronRight className="h-4 w-4 text-neutral-400 mt-2 ml-auto" />
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Thread Detail & Draft Editor */}
        <div className="lg:col-span-2 space-y-4">
          {selectedThread ? (
            <>
              {/* Thread Header */}
              <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                      {selectedThread.subject}
                    </h2>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                      {t('dashboard.emailPage.from')}: {selectedThread.customerName || selectedThread.customerEmail}
                      {selectedThread.customerName && (
                        <span className="text-neutral-400"> &lt;{selectedThread.customerEmail}&gt;</span>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCloseThread}
                    disabled={selectedThread.status === 'CLOSED'}
                  >
                    <X className="h-4 w-4 mr-1" />
                    {t('common.close')}
                  </Button>
                </div>
              </div>

              {/* Messages */}
              <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-4 max-h-[300px] overflow-y-auto">
                <h3 className="font-medium text-neutral-900 dark:text-white mb-4">{t('dashboard.emailPage.conversation')}</h3>
                <div className="space-y-4">
                  {selectedThread.messages?.map((message) => (
                    <div
                      key={message.id}
                      className={`p-4 rounded-lg ${
                        message.direction === 'INBOUND'
                          ? 'bg-neutral-100 dark:bg-neutral-800 mr-8'
                          : 'bg-neutral-50 dark:bg-neutral-900 ml-8'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">
                          {message.direction === 'INBOUND' ? (
                            <span className="text-neutral-700 dark:text-neutral-300">
                              {message.fromName || message.fromEmail}
                            </span>
                          ) : (
                            <span className="text-neutral-700 dark:text-neutral-300">{t('dashboard.emailPage.you')}</span>
                          )}
                        </span>
                        <span className="text-xs text-neutral-500">
                          {formatDate(message.receivedAt || message.sentAt || message.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
                        {message.bodyText?.substring(0, 500)}
                        {message.bodyText?.length > 500 && '...'}
                      </p>
                      {message.attachments?.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-neutral-200 dark:border-neutral-700">
                          <div className="flex flex-wrap gap-2">
                            {message.attachments.map((att, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-50 dark:bg-neutral-700 text-xs text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-600"
                              >
                                <Paperclip className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate max-w-[180px]">{att.filename}</span>
                                {att.size > 0 && (
                                  <span className="text-neutral-400 flex-shrink-0">
                                    ({att.size > 1048576 ? `${(att.size / 1048576).toFixed(1)} MB` : `${Math.round(att.size / 1024)} KB`})
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Draft Editor */}
              {getActiveDraft() && selectedThread.status !== 'CLOSED' && (
                <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium text-neutral-900 dark:text-white flex items-center gap-2">
                      <Pencil className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      {t('dashboard.emailPage.aiDraftResponse')}
                    </h3>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRegenerateDraft()}
                        disabled={regenerating}
                      >
                        <RotateCcw className={`h-4 w-4 mr-1 ${regenerating ? 'animate-spin' : ''}`} />
                        {t('dashboard.emailPage.regenerate')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsEditing(!isEditing)}
                      >
                        <Pencil className="h-4 w-4 mr-1" />
                        {isEditing ? t('common.preview') : t('common.edit')}
                      </Button>
                    </div>
                  </div>

                  {isEditing ? (
                    <Textarea
                      value={editedContent}
                      onChange={(e) => setEditedContent(e.target.value)}
                      className="min-h-[200px] font-mono text-sm"
                      placeholder={t('dashboard.emailPage.editResponsePlaceholder')}
                    />
                  ) : (
                    <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-4 min-h-[200px] text-sm whitespace-pre-wrap dark:text-neutral-200">
                      {editedContent}
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
                    <p className="text-xs text-neutral-500">
                      {t('dashboard.emailPage.reviewBeforeSending')}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          const draft = getActiveDraft();
                          if (draft) {
                            setEditedContent(draft.generatedContent);
                            setIsEditing(false);
                          }
                        }}
                      >
                        {t('common.reset')}
                      </Button>
                      <Button onClick={handleSendDraft} disabled={sending}>
                        <Send className={`h-4 w-4 mr-2 ${sending ? 'animate-pulse' : ''}`} />
                        {sending ? t('dashboard.emailPage.sending') : t('dashboard.emailPage.sendEmail')}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* PENDING_REPLY or NEW - No draft yet, show action buttons */}
              {!getActiveDraft() && (selectedThread.status === 'PENDING_REPLY' || selectedThread.status === 'NEW') && (
                <div className="bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-neutral-600 dark:text-neutral-400 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-medium text-neutral-900 dark:text-white">
                        {t('dashboard.emailPage.pendingReplyTitle')}
                      </h3>
                      <p className="text-sm text-neutral-700 dark:text-neutral-300 mt-1">
                        {t('dashboard.emailPage.pendingReplyDesc')}
                      </p>
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm"
                          onClick={handleGenerateDraft}
                          disabled={generatingDraft}
                        >
                          <Pencil className={`h-4 w-4 mr-2 ${generatingDraft ? 'animate-spin' : ''}`} />
                          {generatingDraft
                            ? t('dashboard.emailPage.generatingDraft')
                            : t('dashboard.emailPage.generateAiDraft')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleMarkNoReplyNeeded}
                        >
                          <X className="h-4 w-4 mr-2" />
                          {t('dashboard.emailPage.markNoReplyNeeded')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* NO_REPLY_NEEDED - Show generate draft option */}
              {selectedThread.status === 'NO_REPLY_NEEDED' && !getActiveDraft() && (
                <div className="bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-neutral-600 dark:text-neutral-400 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-medium text-neutral-900 dark:text-white">
                        {t('dashboard.emailPage.noReplyNeededTitle')}
                      </h3>
                      <p className="text-sm text-neutral-700 dark:text-neutral-300 mt-1">
                        {t('dashboard.emailPage.noReplyNeededDesc')}
                      </p>
                      <Button
                        className="mt-3"
                        size="sm"
                        onClick={handleGenerateDraft}
                        disabled={generatingDraft}
                      >
                        <Pencil className={`h-4 w-4 mr-2 ${generatingDraft ? 'animate-spin' : ''}`} />
                        {generatingDraft
                          ? t('dashboard.emailPage.generatingDraft')
                          : t('dashboard.emailPage.generateAiDraft')}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Thread closed */}
              {selectedThread.status === 'CLOSED' && (
                <div className="bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 text-center">
                  <CheckCircle2 className="h-8 w-8 mx-auto text-neutral-400 mb-2" />
                  <p className="text-neutral-600 dark:text-neutral-400">{t('dashboard.emailPage.conversationClosed')}</p>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-12 text-center">
              <MessageSquare className="h-12 w-12 mx-auto text-neutral-300 dark:text-neutral-600 mb-4" />
              <h3 className="text-lg font-medium text-neutral-900 dark:text-white mb-2">
                {t('dashboard.emailPage.selectConversation')}
              </h3>
              <p className="text-neutral-600 dark:text-neutral-400">
                {t('dashboard.emailPage.selectConversationDesc')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
