/**
 * Email Inbox Dashboard — Outlook-style 3-Panel Layout
 * Left: Mail list with Inbox/Sent tabs, filters, search
 * Middle: Thread view with bubble messages, customer strip, reply composer
 * Right: Customer data sidebar (CRM info, order stats, tags, notes)
 */

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Inbox,
  Mail,
  Send,
  SendHorizonal,
  RefreshCw,
  CheckCircle2,
  MessageSquare,
  Pencil,
  RotateCcw,
  X,
  Search,
  Paperclip,
  Sparkles,
  PanelRightOpen,
  PanelRightClose,
  Building2,
  Phone,
  AtSign,
  Package,
  Tag,
  StickyNote,
  BarChart3,
  UserCircle,
  ExternalLink,
  Wrench,
  ShoppingBag,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useEmailStatus, useEmailThreads, useEmailThread, useEmailStats, useCustomerByEmail } from '@/hooks/useEmail';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';

// ─── Helpers ───────────────────────────────────────────────

/** Generate consistent avatar color from string */
function avatarColor(str) {
  const colors = [
    'bg-emerald-500', 'bg-indigo-500', 'bg-amber-500', 'bg-rose-500',
    'bg-blue-500', 'bg-purple-500', 'bg-teal-500', 'bg-pink-500',
  ];
  let hash = 0;
  for (let i = 0; i < (str || '').length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

/** Get initials from name or email */
function initials(name, email) {
  if (name) {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }
  return (email || '??').substring(0, 2).toUpperCase();
}

/** Format relative time */
function formatRelative(dateString, locale) {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    if (isToday(d)) return format(d, 'HH:mm');
    if (isYesterday(d)) return locale === 'tr' ? 'Dün' : 'Yesterday';
    return formatDistanceToNow(d, { addSuffix: true, locale: locale === 'tr' ? tr : undefined });
  } catch {
    return '';
  }
}

/** Group date label for message separator */
function dateLabel(dateString, locale) {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    if (isToday(d)) return locale === 'tr' ? 'Bugün' : 'Today';
    if (isYesterday(d)) return locale === 'tr' ? 'Dün' : 'Yesterday';
    return format(d, 'd MMMM yyyy', { locale: locale === 'tr' ? tr : undefined });
  } catch {
    return '';
  }
}

/** Extract quoted content from email body */
function splitQuotedContent(bodyText) {
  if (!bodyText) return { main: '', quoted: null };
  // Normalize line endings
  const text = bodyText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Try each pattern — find the earliest match position
  const patterns = [
    /^[ \t]*From\s*:.*@/im,                                // "From: ...@..." at line start
    /^[ \t]*(?:Gönderen|Kimden)\s*:/im,                    // Turkish "From:"
    /^[ \t]*-{3,}[ \t]*$/m,                                // --- separator on its own line
    /^[ \t]*On .+ wrote:\s*$/im,                           // "On Mon, Jan 1 X wrote:"
    /^[ \t]*>+\s/m,                                        // > quoted line at line start
  ];
  let earliest = -1;
  for (const p of patterns) {
    const match = p.exec(text);
    if (match && match.index > 0 && (earliest === -1 || match.index < earliest)) {
      earliest = match.index;
    }
  }
  if (earliest > 0) {
    return {
      main: text.substring(0, earliest).trim(),
      quoted: text.substring(earliest).trim(),
    };
  }
  return { main: text, quoted: null };
}

/** Get message date for sorting/grouping */
function msgDate(msg) {
  return msg.receivedAt || msg.sentAt || msg.createdAt;
}

// ─── Status Config ─────────────────────────────────────────

const TAG_CONFIG = {
  NEW:              { label: 'Yeni',       labelEn: 'New',           cls: 'bg-blue-500/15 text-blue-400' },
  PENDING_REPLY:    { label: 'Yeni',       labelEn: 'New',           cls: 'bg-blue-500/15 text-blue-400' },
  DRAFT_READY:      { label: 'AI Taslak',  labelEn: 'AI Draft',      cls: 'bg-purple-500/15 text-purple-400' },
  REPLIED:          { label: 'Yanıtlandı', labelEn: 'Replied',       cls: 'bg-emerald-500/15 text-emerald-400' },
  CLOSED:           { label: 'Kapalı',     labelEn: 'Closed',        cls: 'bg-neutral-500/15 text-neutral-400' },
  NO_REPLY_NEEDED:  { label: 'Bekliyor',   labelEn: 'Pending',       cls: 'bg-amber-500/15 text-amber-400' },
};

// ════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════

export default function EmailDashboardPage() {
  const { t, locale } = useLanguage();
  const queryClient = useQueryClient();

  // ─── Data Hooks ──────────────────────────────────────────
  const { data: emailStatus, isLoading: statusLoading } = useEmailStatus();
  const [statusFilter, setStatusFilter] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const { data: threads = [], isLoading: threadsLoading, refetch: refetchThreads } = useEmailThreads(statusFilter, debouncedSearch || null);
  const { data: stats } = useEmailStats();
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const { data: selectedThread } = useEmailThread(selectedThreadId, !!selectedThreadId);
  const loading = statusLoading || threadsLoading;

  // Debounce search (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ─── UI State ────────────────────────────────────────────
  const [activeFolder, setActiveFolder] = useState('inbox'); // 'inbox' | 'sent'
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Customer data for sidebar
  const { data: customerData, isLoading: customerLoading } = useCustomerByEmail(selectedThread?.customerEmail);

  // Update draft content when thread changes
  useEffect(() => {
    if (selectedThread?.drafts?.length) {
      const active = selectedThread.drafts.find(d => d.status === 'PENDING_REVIEW');
      if (active) setEditedContent(active.editedContent || active.generatedContent);
    }
  }, [selectedThread]);

  // ─── Filtered threads ────────────────────────────────────
  const filteredThreads = useMemo(() => {
    if (activeFolder === 'sent') {
      // Sent folder: show threads that have been replied to (status REPLIED or DRAFT_READY with sent drafts)
      return threads.filter(th =>
        th.messages?.some(m => m.direction === 'OUTBOUND') ||
        ['REPLIED', 'CLOSED'].includes(th.status)
      );
    }
    return threads;
  }, [threads, activeFolder]);

  // ─── Sorted messages (newest first) ──────────────────────
  const sortedMessages = useMemo(() => {
    if (!selectedThread?.messages) return [];
    return [...selectedThread.messages].sort(
      (a, b) => new Date(msgDate(b)) - new Date(msgDate(a))
    );
  }, [selectedThread]);

  // ─── Messages with date groups ───────────────────────────
  const messagesWithSeparators = useMemo(() => {
    const result = [];
    let lastDateKey = null;
    for (const msg of sortedMessages) {
      const d = new Date(msgDate(msg));
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (key !== lastDateKey) {
        result.push({ type: 'separator', label: dateLabel(msgDate(msg), locale), key });
        lastDateKey = key;
      }
      result.push({ type: 'message', data: msg });
    }
    return result;
  }, [sortedMessages, locale]);

  // ─── Business Logic (preserved from original) ────────────

  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/email/sync/stream`,
        { method: 'GET', credentials: 'include', headers: { Accept: 'text/event-stream' } }
      );
      if (!response.ok) throw new Error('Sync failed');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) { setSyncing(false); break; }
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
            if (eventType === 'thread' && data.thread) {
              queryClient.setQueriesData({ queryKey: ['email', 'threads'] }, (old) => {
                if (!Array.isArray(old)) return old;
                const idx = old.findIndex(t => t.id === data.thread.id);
                if (idx >= 0) {
                  const updated = [...old];
                  updated[idx] = { ...updated[idx], ...data.thread };
                  return updated.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
                }
                return [data.thread, ...old];
              });
              queryClient.invalidateQueries({ queryKey: ['email', 'stats'] });
            } else if (eventType === 'completed') {
              const count = data.processedCount || 0;
              toast.success(count > 0
                ? (locale === 'tr' ? `${count} yeni e-posta senkronize edildi` : `Synced ${count} new emails`)
                : (locale === 'tr' ? 'Tüm e-postalar güncel' : 'All emails are up to date'));
              queryClient.invalidateQueries({ queryKey: ['email'] });
              setSyncing(false);
            } else if (eventType === 'error') {
              toast.error(locale === 'tr' ? 'Senkronizasyon hatası' : 'Sync error');
              setSyncing(false);
            }
          }
        }
      }
    } catch {
      toast.error(locale === 'tr' ? 'E-posta senkronizasyonu başarısız' : 'Failed to sync emails');
      setSyncing(false);
    }
  };

  const handleSendDraft = async () => {
    if (!selectedThread?.drafts?.length) return;
    const active = selectedThread.drafts.find(d => d.status === 'PENDING_REVIEW');
    if (!active) return;
    if (editedContent !== active.generatedContent) {
      await apiClient.put(`/api/email/drafts/${active.id}`, { content: editedContent });
    }
    setSending(true);
    try {
      await apiClient.post(`/api/email/drafts/${active.id}/send`);
      toast.success(locale === 'tr' ? 'E-posta gönderildi' : 'Email sent');
      queryClient.invalidateQueries({ queryKey: ['email'] });
      setIsEditing(false);
    } catch {
      toast.error(locale === 'tr' ? 'Gönderim başarısız' : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const handleRegenerateDraft = async (feedback = null) => {
    if (!selectedThread?.drafts?.length) return;
    const active = selectedThread.drafts.find(d => d.status === 'PENDING_REVIEW');
    if (!active) return;
    setRegenerating(true);
    try {
      await apiClient.post(`/api/email/drafts/${active.id}/regenerate`, { feedback });
      toast.success(locale === 'tr' ? 'Taslak yeniden oluşturuldu' : 'Draft regenerated');
      queryClient.invalidateQueries({ queryKey: ['email', 'threads', selectedThreadId] });
    } catch {
      toast.error(locale === 'tr' ? 'Yeniden oluşturma başarısız' : 'Failed to regenerate');
    } finally {
      setRegenerating(false);
    }
  };

  const handleCloseThread = async () => {
    if (!selectedThread) return;
    try {
      await apiClient.post(`/api/email/threads/${selectedThread.id}/close`);
      toast.success(locale === 'tr' ? 'Konu kapatıldı' : 'Thread closed');
      queryClient.invalidateQueries({ queryKey: ['email'] });
      setSelectedThreadId(null);
    } catch {
      toast.error(locale === 'tr' ? 'Kapatma başarısız' : 'Failed to close');
    }
  };

  const handleMarkNoReplyNeeded = async () => {
    if (!selectedThread) return;
    try {
      await apiClient.email.updateThread(selectedThread.id, { status: 'NO_REPLY_NEEDED' });
      toast.success(locale === 'tr' ? 'Yanıt gerekmiyor olarak işaretlendi' : 'Marked as no reply needed');
      queryClient.invalidateQueries({ queryKey: ['email'] });
    } catch {
      toast.error(locale === 'tr' ? 'İşaretleme başarısız' : 'Failed to mark');
    }
  };

  const handleGenerateDraft = async () => {
    if (!selectedThread) return;
    setGeneratingDraft(true);
    try {
      await apiClient.email.generateDraft(selectedThread.id);
      toast.success(locale === 'tr' ? 'AI taslak oluşturuldu' : 'AI draft generated');
      queryClient.invalidateQueries({ queryKey: ['email'] });
    } catch {
      toast.error(locale === 'tr' ? 'Taslak oluşturma başarısız' : 'Failed to generate draft');
    } finally {
      setGeneratingDraft(false);
    }
  };

  const getActiveDraft = () => {
    if (!selectedThread?.drafts) return null;
    return selectedThread.drafts.find(d => d.status === 'PENDING_REVIEW');
  };

  // ─── Not Connected ──────────────────────────────────────
  if (!loading && !emailStatus?.connected) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="text-center max-w-md">
          <Mail className="h-16 w-16 mx-auto text-neutral-400 dark:text-neutral-600 mb-4" />
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-2">
            {locale === 'tr' ? 'E-posta Bağlantısı Gerekli' : 'Email Connection Required'}
          </h2>
          <p className="text-neutral-500 dark:text-neutral-400 mb-6">
            {locale === 'tr' ? 'E-postaları yönetmek için entegrasyon sayfasından bağlantı kurun.' : 'Connect your email from the integrations page.'}
          </p>
          <Button onClick={() => window.location.href = '/dashboard/integrations'}>
            {locale === 'tr' ? 'Entegrasyonlara Git' : 'Go to Integrations'}
          </Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════

  return (
    <div className="fixed inset-0 lg:left-60 flex bg-white dark:bg-neutral-950 z-10">

      {/* ════════ LEFT: MAIL LIST ════════ */}
      <div className="w-[380px] min-w-[380px] border-r border-neutral-200 dark:border-neutral-800 flex flex-col bg-neutral-50 dark:bg-neutral-900">

        {/* Header */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-neutral-700 dark:text-neutral-300" />
              <h1 className="text-lg font-bold text-neutral-900 dark:text-white">Email</h1>
              <span className="text-xs text-neutral-500 bg-neutral-200 dark:bg-neutral-800 px-2 py-0.5 rounded-full">
                {stats?.totalThreads || threads.length}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleSync} disabled={syncing} className="h-8">
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Folder Tabs */}
          <div className="flex gap-1 bg-neutral-200/60 dark:bg-neutral-800 rounded-lg p-1 mb-3">
            <button
              onClick={() => setActiveFolder('inbox')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeFolder === 'inbox'
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              <Inbox className="h-3.5 w-3.5" />
              {locale === 'tr' ? 'Gelen Kutusu' : 'Inbox'}
              {stats?.totalThreads > 0 && (
                <span className="bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                  {stats.totalThreads}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveFolder('sent')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeFolder === 'sent'
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              <SendHorizonal className="h-3.5 w-3.5" />
              {locale === 'tr' ? 'Gönderilenler' : 'Sent'}
            </button>
          </div>

          {/* Filter Chips */}
          <div className="flex gap-1.5 flex-wrap mb-3">
            {[
              { key: null, label: locale === 'tr' ? 'Tümü' : 'All' },
              { key: 'DRAFT_READY', label: locale === 'tr' ? 'AI Taslak' : 'AI Draft' },
              { key: 'REPLIED', label: locale === 'tr' ? 'Yanıtlandı' : 'Replied' },
              { key: 'CLOSED', label: locale === 'tr' ? 'Kapalı' : 'Closed' },
            ].map(f => (
              <button
                key={f.key || 'all'}
                onClick={() => setStatusFilter(f.key)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                  statusFilter === f.key
                    ? 'bg-blue-500 border-blue-500 text-white'
                    : 'border-neutral-300 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:border-neutral-400 dark:hover:border-neutral-600'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={locale === 'tr' ? 'Gönderen, konu veya içerik ara...' : 'Search sender, subject or content...'}
              className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
            {searchInput && (
              <button onClick={() => setSearchInput('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-3 w-3 text-neutral-400 hover:text-neutral-600" />
              </button>
            )}
          </div>
        </div>

        {/* Thread List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center">
              <RefreshCw className="h-5 w-5 mx-auto text-neutral-400 animate-spin" />
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="p-8 text-center">
              <Mail className="h-8 w-8 mx-auto text-neutral-300 dark:text-neutral-600 mb-2" />
              <p className="text-sm text-neutral-500">{locale === 'tr' ? 'Konuşma bulunamadı' : 'No conversations found'}</p>
            </div>
          ) : (
            filteredThreads.map((thread) => {
              const isSelected = selectedThread?.id === thread.id;
              const isUnread = ['NEW', 'PENDING_REPLY'].includes(thread.status);
              const tagCfg = TAG_CONFIG[thread.status];
              const msgCount = thread.messages?.length || 0;
              const isSentView = activeFolder === 'sent';

              return (
                <button
                  key={thread.id}
                  onClick={() => setSelectedThreadId(thread.id)}
                  className={`w-full text-left p-3 border-b border-neutral-100 dark:border-neutral-800 transition-colors ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-950/30 border-l-[3px] border-l-blue-500'
                      : isUnread
                        ? 'border-l-[3px] border-l-blue-500 hover:bg-neutral-100 dark:hover:bg-neutral-800/50'
                        : 'hover:bg-neutral-100 dark:hover:bg-neutral-800/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-full ${avatarColor(thread.customerEmail)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                      {isSentView ? '→' : initials(thread.customerName, thread.customerEmail)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm truncate ${isUnread ? 'font-semibold text-neutral-900 dark:text-white' : 'font-medium text-neutral-600 dark:text-neutral-400'}`}>
                          {isSentView ? `→ ${thread.customerName || thread.customerEmail}` : (thread.customerName || thread.customerEmail)}
                        </span>
                        <span className="text-[11px] text-neutral-400 flex-shrink-0 ml-2">
                          {formatRelative(thread.lastMessageAt, locale)}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-500 truncate mt-0.5">
                        {thread.customerEmail}
                      </div>
                      <div className={`text-xs mt-1 truncate ${isUnread ? 'font-semibold text-neutral-800 dark:text-neutral-200' : 'text-neutral-500 dark:text-neutral-400'}`}>
                        {thread.subject}
                        {msgCount > 1 && (
                          <span className="ml-1 text-[10px] bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 px-1.5 py-0.5 rounded-full">
                            {msgCount}
                          </span>
                        )}
                      </div>
                      {tagCfg && !['NEW', 'PENDING_REPLY'].includes(thread.status) && (
                        <div className="mt-1.5">
                          <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded ${tagCfg.cls}`}>
                            {locale === 'tr' ? tagCfg.label : tagCfg.labelEn}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ════════ RIGHT: THREAD VIEW ════════ */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-neutral-950">
        {selectedThread ? (
          <>
            {/* Thread Header */}
            <div className="px-5 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-neutral-900 dark:text-white truncate">
                  {selectedThread.subject}
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {selectedThread.customerEmail} · {selectedThread.messages?.length || 0} {locale === 'tr' ? 'mesaj' : 'messages'}
                </p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleGenerateDraft} disabled={generatingDraft || !!getActiveDraft()}>
                  <Sparkles className={`h-3.5 w-3.5 mr-1.5 ${generatingDraft ? 'animate-spin' : ''}`} />
                  AI Öneri
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleCloseThread} disabled={selectedThread.status === 'CLOSED'}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  {locale === 'tr' ? 'Çözümlendi' : 'Resolve'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setSidebarOpen(prev => !prev)}
                  title={locale === 'tr' ? 'Müşteri paneli' : 'Customer panel'}
                >
                  {sidebarOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>

            {/* Customer Strip */}
            <div className="px-5 py-2.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full ${avatarColor(selectedThread.customerEmail)} flex items-center justify-center text-white text-sm font-bold`}>
                {initials(selectedThread.customerName, selectedThread.customerEmail)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                  {selectedThread.customerName || selectedThread.customerEmail}
                </p>
                <p className="text-xs text-neutral-500">{selectedThread.customerEmail}</p>
              </div>
              {/* Mini stats would go here if we had customer data */}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {messagesWithSeparators.map((item, idx) => {
                if (item.type === 'separator') {
                  return (
                    <div key={`sep-${item.key}`} className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
                      <span className="text-[11px] text-neutral-400 font-medium whitespace-nowrap">{item.label}</span>
                      <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
                    </div>
                  );
                }

                const msg = item.data;
                const isInbound = msg.direction === 'INBOUND';
                const { main } = splitQuotedContent(msg.bodyText);

                return (
                  <MessageBubble
                    key={msg.id}
                    msg={msg}
                    isInbound={isInbound}
                    mainContent={main}
                    locale={locale}
                    customerName={selectedThread.customerName}
                    customerEmail={selectedThread.customerEmail}
                  />
                );
              })}
            </div>

            {/* Draft Editor / Reply Composer */}
            <div className="border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-4">
              {getActiveDraft() && selectedThread.status !== 'CLOSED' ? (
                <>
                  {/* Active Draft */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-neutral-500 font-medium uppercase tracking-wide flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3 text-purple-500" />
                      AI {locale === 'tr' ? 'Taslak' : 'Draft'}
                    </span>
                    <div className="flex gap-1.5">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleRegenerateDraft()} disabled={regenerating}>
                        <RotateCcw className={`h-3 w-3 mr-1 ${regenerating ? 'animate-spin' : ''}`} />
                        {locale === 'tr' ? 'Yeniden' : 'Regen'}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsEditing(!isEditing)}>
                        <Pencil className="h-3 w-3 mr-1" />
                        {isEditing ? (locale === 'tr' ? 'Önizle' : 'Preview') : (locale === 'tr' ? 'Düzenle' : 'Edit')}
                      </Button>
                    </div>
                  </div>
                  {isEditing ? (
                    <Textarea
                      value={editedContent}
                      onChange={(e) => setEditedContent(e.target.value)}
                      className="min-h-[120px] text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700"
                    />
                  ) : (
                    <div className="bg-white dark:bg-neutral-800 rounded-lg p-3 min-h-[80px] text-sm whitespace-pre-wrap text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700">
                      {editedContent}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-[10px] text-neutral-400">
                      {locale === 'tr' ? 'Göndermeden önce incelemeyi unutmayın' : 'Review before sending'}
                    </p>
                    <Button size="sm" onClick={handleSendDraft} disabled={sending} className="h-8">
                      <Send className={`h-3.5 w-3.5 mr-1.5 ${sending ? 'animate-pulse' : ''}`} />
                      {sending ? (locale === 'tr' ? 'Gönderiliyor...' : 'Sending...') : (locale === 'tr' ? 'Gönder' : 'Send')}
                    </Button>
                  </div>
                </>
              ) : selectedThread.status === 'CLOSED' ? (
                <div className="text-center py-4">
                  <CheckCircle2 className="h-6 w-6 mx-auto text-neutral-400 mb-1" />
                  <p className="text-xs text-neutral-400">{locale === 'tr' ? 'Bu konu çözümlendi' : 'This thread is resolved'}</p>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-xs text-neutral-500">
                    {locale === 'tr' ? 'Bu konuya yanıt oluşturmak için AI Öneri butonunu kullanın.' : 'Use AI Suggest button to generate a reply.'}
                  </div>
                  <Button size="sm" onClick={handleGenerateDraft} disabled={generatingDraft} className="h-8">
                    <Sparkles className={`h-3.5 w-3.5 mr-1.5 ${generatingDraft ? 'animate-spin' : ''}`} />
                    {generatingDraft ? (locale === 'tr' ? 'Oluşturuluyor...' : 'Generating...') : 'AI Öneri'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleMarkNoReplyNeeded} className="h-8 text-xs">
                    <X className="h-3.5 w-3.5 mr-1" />
                    {locale === 'tr' ? 'Gerek Yok' : 'No Reply'}
                  </Button>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 mx-auto text-neutral-300 dark:text-neutral-700 mb-3" />
              <h3 className="text-sm font-medium text-neutral-900 dark:text-white mb-1">
                {locale === 'tr' ? 'Bir konuşma seçin' : 'Select a conversation'}
              </h3>
              <p className="text-xs text-neutral-500">
                {locale === 'tr' ? 'Soldaki listeden bir e-posta seçerek başlayın' : 'Choose an email from the list to get started'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ════════ RIGHT SIDEBAR: CUSTOMER DATA ════════ */}
      {selectedThread && sidebarOpen && (
        <CustomerSidebar
          customer={customerData?.customer}
          orderStats={customerData?.orderStats}
          recentOrders={customerData?.recentOrders}
          tickets={customerData?.tickets}
          loading={customerLoading}
          locale={locale}
          customerEmail={selectedThread.customerEmail}
          customerName={selectedThread.customerName}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// CUSTOMER SIDEBAR COMPONENT
// ════════════════════════════════════════════════════════════

function CustomerSidebar({ customer, orderStats, recentOrders, tickets, loading, locale, customerEmail, customerName }) {
  if (loading) {
    return (
      <div className="w-[300px] min-w-[300px] border-l border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 hidden lg:flex flex-col items-center justify-center">
        <div className="animate-pulse space-y-3 w-full px-4">
          <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-3/4 mx-auto" />
          <div className="h-3 bg-neutral-200 dark:bg-neutral-700 rounded w-1/2 mx-auto" />
          <div className="h-20 bg-neutral-200 dark:bg-neutral-700 rounded" />
          <div className="h-16 bg-neutral-200 dark:bg-neutral-700 rounded" />
        </div>
      </div>
    );
  }

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '-';
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: locale === 'tr' ? tr : undefined });
    } catch { return '-'; }
  };

  const STATUS_LABELS = {
    'hazırlanıyor': { label: 'Hazırlanıyor', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
    'kargoda': { label: 'Kargoda', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
    'onaylandı': { label: 'Onaylandı', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
    'dağıtımda': { label: 'Dağıtımda', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
    'teslim edildi': { label: 'Teslim Edildi', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
    'iptal': { label: 'İptal', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  };

  const customFieldEntries = customer?.customFields ? Object.entries(customer.customFields).filter(([, v]) => v != null && v !== '') : [];
  const hasAnyData = customer || (orderStats && orderStats.orderCount > 0) || (tickets && tickets.length > 0);

  // Completely empty — no customer data, no orders, no tickets
  if (!hasAnyData) {
    return (
      <div className="w-[300px] min-w-[300px] border-l border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 hidden lg:flex flex-col">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
            <UserCircle className="h-4 w-4" />
            {locale === 'tr' ? 'Müşteri Bilgisi' : 'Customer Info'}
          </h3>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <UserCircle className="h-10 w-10 text-neutral-300 dark:text-neutral-600 mb-3" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-1">
            {locale === 'tr' ? 'CRM verisi bulunamadı' : 'No CRM data found'}
          </p>
          <p className="text-xs text-neutral-400 dark:text-neutral-500">
            {customerEmail}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[300px] min-w-[300px] border-l border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 hidden lg:flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
          <UserCircle className="h-4 w-4" />
          {locale === 'tr' ? 'Müşteri Bilgisi' : 'Customer Info'}
        </h3>
      </div>

      {/* Customer Info (from CustomerData table) */}
      {customer && (
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 space-y-2.5">
          {customer.companyName && (
            <div className="flex items-start gap-2.5">
              <Building2 className="h-3.5 w-3.5 mt-0.5 text-neutral-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] text-neutral-400">{locale === 'tr' ? 'Firma' : 'Company'}</p>
                <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">{customer.companyName}</p>
              </div>
            </div>
          )}
          {customer.contactName && (
            <div className="flex items-start gap-2.5">
              <UserCircle className="h-3.5 w-3.5 mt-0.5 text-neutral-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] text-neutral-400">{locale === 'tr' ? 'İletişim' : 'Contact'}</p>
                <p className="text-sm text-neutral-700 dark:text-neutral-300 truncate">{customer.contactName}</p>
              </div>
            </div>
          )}
          {customer.phone && (
            <div className="flex items-start gap-2.5">
              <Phone className="h-3.5 w-3.5 mt-0.5 text-neutral-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] text-neutral-400">{locale === 'tr' ? 'Telefon' : 'Phone'}</p>
                <p className="text-sm text-neutral-700 dark:text-neutral-300">{customer.phone}</p>
              </div>
            </div>
          )}
          {customer.email && (
            <div className="flex items-start gap-2.5">
              <AtSign className="h-3.5 w-3.5 mt-0.5 text-neutral-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] text-neutral-400">Email</p>
                <p className="text-sm text-neutral-700 dark:text-neutral-300 truncate">{customer.email}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Order Stats */}
      {orderStats && orderStats.orderCount > 0 && (
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2 mb-3">
            <Package className="h-3.5 w-3.5 text-neutral-400" />
            <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
              {locale === 'tr' ? 'Sipariş Özeti' : 'Order Summary'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white dark:bg-neutral-800 rounded-lg p-2.5 text-center">
              <p className="text-lg font-bold text-neutral-900 dark:text-white">{orderStats.orderCount}</p>
              <p className="text-[10px] text-neutral-500">{locale === 'tr' ? 'Sipariş' : 'Orders'}</p>
            </div>
            <div className="bg-white dark:bg-neutral-800 rounded-lg p-2.5 text-center">
              <p className="text-sm font-bold text-neutral-900 dark:text-white">{formatCurrency(orderStats.totalSpent)}</p>
              <p className="text-[10px] text-neutral-500">{locale === 'tr' ? 'Toplam' : 'Total'}</p>
            </div>
          </div>
          {orderStats.lastOrderDate && (
            <p className="text-[11px] text-neutral-400 mt-2">
              {locale === 'tr' ? 'Son sipariş: ' : 'Last order: '}{formatDate(orderStats.lastOrderDate)}
            </p>
          )}
        </div>
      )}

      {/* Recent Orders */}
      {recentOrders?.length > 0 && (
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingBag className="h-3.5 w-3.5 text-neutral-400" />
            <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
              {locale === 'tr' ? 'Son Siparişler' : 'Recent Orders'}
            </p>
          </div>
          <div className="space-y-2">
            {recentOrders.map((order) => {
              const statusCfg = STATUS_LABELS[order.status?.toLowerCase()] || { label: order.status, cls: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300' };
              return (
                <div key={order.id} className="bg-white dark:bg-neutral-800 rounded-lg p-2.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-mono font-medium text-neutral-700 dark:text-neutral-200 truncate">
                      {order.orderNumber}
                    </span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${statusCfg.cls}`}>
                      {statusCfg.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    {order.totalAmount != null && (
                      <span className="text-xs font-semibold text-neutral-900 dark:text-white">{formatCurrency(order.totalAmount)}</span>
                    )}
                    <span className="text-[10px] text-neutral-400">{formatDate(order.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tickets / Service Records */}
      {tickets?.length > 0 && (
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2 mb-2">
            <Wrench className="h-3.5 w-3.5 text-neutral-400" />
            <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
              {locale === 'tr' ? 'Servis Kayıtları' : 'Service Records'}
            </p>
          </div>
          <div className="space-y-2">
            {tickets.map((ticket) => (
              <div key={ticket.id} className="bg-white dark:bg-neutral-800 rounded-lg p-2.5">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-mono font-medium text-neutral-700 dark:text-neutral-200 truncate">
                    {ticket.ticketNumber}
                  </span>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                    {ticket.status}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-600 dark:text-neutral-400 truncate">{ticket.product}</p>
                {ticket.issue && <p className="text-[10px] text-neutral-400 truncate mt-0.5">{ticket.issue}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {customer?.tags?.length > 0 && (
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="h-3.5 w-3.5 text-neutral-400" />
            <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
              {locale === 'tr' ? 'Etiketler' : 'Tags'}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {customer.tags.map((tag, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-[11px] font-medium">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {customer?.notes && (
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2 mb-2">
            <StickyNote className="h-3.5 w-3.5 text-neutral-400" />
            <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
              {locale === 'tr' ? 'Notlar' : 'Notes'}
            </p>
          </div>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed whitespace-pre-wrap">
            {customer.notes}
          </p>
        </div>
      )}

      {/* Custom Fields */}
      {customFieldEntries.length > 0 && (
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-3.5 w-3.5 text-neutral-400" />
            <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
              {locale === 'tr' ? 'Özel Alanlar' : 'Custom Fields'}
            </p>
          </div>
          <div className="space-y-1.5">
            {customFieldEntries.map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-2">
                <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{key}</span>
                <span className="text-xs font-medium text-neutral-900 dark:text-white text-right">
                  {typeof value === 'number' ? value.toLocaleString('tr-TR') : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// MESSAGE CARD COMPONENT (Outlook-style full-width)
// ════════════════════════════════════════════════════════════

function MessageBubble({ msg, isInbound, mainContent, locale, customerName, customerEmail }) {

  const senderName = isInbound
    ? (msg.fromName || msg.fromEmail || customerName || customerEmail)
    : 'Telyx AI';

  const senderEmail = isInbound
    ? (msg.fromEmail || customerEmail)
    : null;

  const dateStr = (() => {
    const d = msg.receivedAt || msg.sentAt || msg.createdAt;
    if (!d) return '';
    try {
      return format(new Date(d), 'd MMM yyyy, HH:mm', { locale: locale === 'tr' ? tr : undefined });
    } catch { return ''; }
  })();

  return (
    <div className="w-full border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
      {/* Header bar */}
      <div className={`flex items-center gap-3 px-4 py-2.5 ${
        isInbound
          ? 'bg-neutral-50 dark:bg-neutral-800/80'
          : 'bg-blue-50/50 dark:bg-blue-950/20'
      }`}>
        {/* Avatar */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
          isInbound ? avatarColor(customerEmail) : 'bg-blue-500'
        }`}>
          {isInbound ? initials(customerName, customerEmail) : 'T'}
        </div>

        {/* Sender info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-neutral-900 dark:text-white truncate">{senderName}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${
              isInbound
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                : 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
            }`}>
              {isInbound
                ? (locale === 'tr' ? 'Gelen' : 'Inbound')
                : (locale === 'tr' ? 'Gönderilen' : 'Sent')}
            </span>
            {!isInbound && (
              <span className="flex items-center gap-0.5 text-[10px] text-purple-500 dark:text-purple-400 flex-shrink-0">
                <Sparkles className="h-2.5 w-2.5" />
                AI
              </span>
            )}
          </div>
          {senderEmail && (
            <p className="text-[11px] text-neutral-500 dark:text-neutral-500 truncate">{senderEmail}</p>
          )}
        </div>

        {/* Date */}
        <span className="text-[11px] text-neutral-400 dark:text-neutral-500 flex-shrink-0">{dateStr}</span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 bg-white dark:bg-neutral-900">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          {mainContent || msg.bodyText?.substring(0, 500)}
        </p>

        {/* Attachments */}
        {msg.attachments?.length > 0 && (
          <div className="mt-3 pt-2 border-t border-neutral-100 dark:border-neutral-800 flex flex-wrap gap-1.5">
            {msg.attachments.map((att, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800 text-[11px] text-neutral-600 dark:text-neutral-400">
                <Paperclip className="h-3 w-3" />
                {att.filename}
              </span>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
