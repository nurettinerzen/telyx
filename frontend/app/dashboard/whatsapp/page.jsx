'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import EmptyState from '@/components/EmptyState';
import { apiClient } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import {
  AlertCircle,
  Bot,
  Clock3,
  Hash,
  Headphones,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Phone,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  UserCircle2,
} from 'lucide-react';

function formatDateTime(value, locale) {
  if (!value) return '—';

  try {
    return new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-US', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return '—';
  }
}

function buildInboxPreview(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  const lastMessage = messages[messages.length - 1];
  return String(lastMessage?.content || '').trim();
}

function getMessageTimestamp(message = {}) {
  return message?.timestamp || message?.createdAt || null;
}

function getHandoffPriority(chat) {
  const mode = chat?.handoff?.mode;
  if (mode === 'REQUESTED') return 0;
  if (mode === 'ACTIVE') return 1;
  return 2;
}

function getConversationRecency(chat) {
  return new Date(chat?.updatedAt || chat?.createdAt || 0).getTime();
}

function dedupeWhatsAppConversations(chats = []) {
  const preferredByKey = new Map();

  for (const chat of chats) {
    if (chat?.channel !== 'WHATSAPP') continue;

    const conversationKey = chat.customerPhone || chat.sessionId || chat.id;
    const existing = preferredByKey.get(conversationKey);

    if (!existing) {
      preferredByKey.set(conversationKey, chat);
      continue;
    }

    const currentIsActive = chat?.status === 'active';
    const existingIsActive = existing?.status === 'active';

    if (currentIsActive !== existingIsActive) {
      preferredByKey.set(conversationKey, currentIsActive ? chat : existing);
      continue;
    }

    const currentTs = getConversationRecency(chat);
    const existingTs = getConversationRecency(existing);

    if (currentTs >= existingTs) {
      preferredByKey.set(conversationKey, chat);
    }
  }

  const keptIds = new Set(Array.from(preferredByKey.values()).map((chat) => chat.id));
  return chats.filter((chat) => keptIds.has(chat.id));
}

function getHandoffBadge(mode, assignedUserName, t) {
  if (mode === 'REQUESTED') {
    return (
      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
        <Headphones className="mr-1 h-3 w-3" />
        {t.liveRequested}
      </Badge>
    );
  }

  if (mode === 'ACTIVE') {
    return (
      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
        <Headphones className="mr-1 h-3 w-3" />
        {assignedUserName ? t.liveByName.replace('{name}', assignedUserName) : t.liveActive}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
      <Sparkles className="mr-1 h-3 w-3" />
      {t.aiManaged}
    </Badge>
  );
}

export default function WhatsAppInboxPage() {
  const { locale } = useLanguage();

  const t = locale === 'tr'
    ? {
        title: 'WhatsApp Inbox',
        subtitle: 'Canlı devralma, temsilci yanıtları ve müşteri bağlamı tek ekranda.',
        refresh: 'Yenile',
        refreshing: 'Yenileniyor...',
        searchPlaceholder: 'Telefon numarası veya oturum ara...',
        all: 'Tümü',
        waiting: 'Bekleyen',
        live: 'Canlı',
        ai: 'AI',
        noConversations: 'Henüz WhatsApp konuşması yok',
        noConversationsDesc: 'WhatsApp konuşmaları burada sıralanacak.',
        pendingQueue: 'Temsilci bekleyen konuşmalar',
        pendingQueueDesc: 'Müşteri gerçek bir kişi istediğinde burada en üste taşınır.',
        customer: 'Müşteri',
        assistant: 'Asistan',
        session: 'Oturum',
        messageCount: 'Mesaj',
        updatedAt: 'Son aktivite',
        createdAt: 'Başlangıç',
        liveRequested: 'Canlı destek istendi',
        liveActive: 'Canlı temsilci aktif',
        liveByName: '{name} canlı yanıt veriyor',
        aiManaged: 'Konuşmayı AI yönetiyor',
        takeOver: 'Konuşmayı devral',
        claiming: 'Devralınıyor...',
        returnToAi: "AI'a geri ver",
        returning: 'Geri veriliyor...',
        replyPlaceholder: 'Müşteriye gönderilecek mesajı yazın...',
        sendReply: 'Mesajı gönder',
        sendingReply: 'Gönderiliyor...',
        liveReplySent: 'Canlı yanıt gönderildi',
        liveReplyFailed: 'Canlı yanıt gönderilemedi',
        claimed: 'Konuşma devralındı',
        claimFailed: 'Konuşma devralınamadı',
        returned: "Konuşma AI'a geri verildi",
        returnFailed: "Konuşma AI'a geri verilemedi",
        noMessages: 'Bu konuşmada henüz mesaj yok',
        customerPanel: 'Müşteri paneli',
        customerData: 'Müşteri özeti',
        noCustomerData: 'Bu numarayla eşleşen müşteri kaydı bulunamadı.',
        tags: 'Etiketler',
        notes: 'Notlar',
        contact: 'İrtibat',
        company: 'Şirket',
        customFields: 'Özel alanlar',
        conversation: 'Konuşma',
        youOwnThis: 'Bu konuşma sende. AI yanıtları duraklatıldı.',
        claimedByOther: 'Bu konuşma başka bir ekip üyesinde aktif.',
        aiDescription: 'İstersen manuel olarak devralabilir, iş bitince AI’a geri verebilirsin.',
        stillWaiting: 'Bu konuşma canlı temsilci bekliyor.',
        threadEmpty: 'Soldan bir WhatsApp konuşması seçin.',
        loadingThread: 'Konuşma yükleniyor...',
        loadFailed: 'WhatsApp konuşmaları yüklenemedi',
        detailFailed: 'Konuşma detayları yüklenemedi',
      }
    : {
        title: 'WhatsApp Inbox',
        subtitle: 'Live takeover, teammate replies, and customer context in one workspace.',
        refresh: 'Refresh',
        refreshing: 'Refreshing...',
        searchPlaceholder: 'Search by phone or session...',
        all: 'All',
        waiting: 'Waiting',
        live: 'Live',
        ai: 'AI',
        noConversations: 'No WhatsApp conversations yet',
        noConversationsDesc: 'Incoming WhatsApp threads will appear here.',
        pendingQueue: 'Waiting for teammate',
        pendingQueueDesc: 'Threads move here when the customer asks for a real person.',
        customer: 'Customer',
        assistant: 'Assistant',
        session: 'Session',
        messageCount: 'Messages',
        updatedAt: 'Last activity',
        createdAt: 'Started',
        liveRequested: 'Live support requested',
        liveActive: 'Live teammate active',
        liveByName: '{name} is replying live',
        aiManaged: 'AI is handling this conversation',
        takeOver: 'Take over conversation',
        claiming: 'Claiming...',
        returnToAi: 'Return to AI',
        returning: 'Returning...',
        replyPlaceholder: 'Write the message that should be sent to the customer...',
        sendReply: 'Send message',
        sendingReply: 'Sending...',
        liveReplySent: 'Live reply sent',
        liveReplyFailed: 'Failed to send live reply',
        claimed: 'Conversation claimed',
        claimFailed: 'Failed to claim conversation',
        returned: 'Conversation returned to AI',
        returnFailed: 'Failed to return conversation to AI',
        noMessages: 'No messages in this conversation yet',
        customerPanel: 'Customer panel',
        customerData: 'Customer summary',
        noCustomerData: 'No customer record matched this phone number.',
        tags: 'Tags',
        notes: 'Notes',
        contact: 'Contact',
        company: 'Company',
        customFields: 'Custom fields',
        conversation: 'Conversation',
        youOwnThis: 'You own this conversation. AI replies are paused.',
        claimedByOther: 'Another teammate is actively handling this conversation.',
        aiDescription: 'You can take over manually and hand it back to AI when finished.',
        stillWaiting: 'This conversation is waiting for a live teammate.',
        threadEmpty: 'Select a WhatsApp conversation from the left.',
        loadingThread: 'Loading conversation...',
        loadFailed: 'Failed to load WhatsApp conversations',
        detailFailed: 'Failed to load conversation details',
      };

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterMode, setFilterMode] = useState('all');
  const [conversations, setConversations] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [selectedChat, setSelectedChat] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [replyDraft, setReplyDraft] = useState('');
  const [handoffAction, setHandoffAction] = useState(null);
  const [customerData, setCustomerData] = useState(null);
  const [customerLoading, setCustomerLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadConversations = async ({ silent = false } = {}) => {
    if (!silent) setListLoading(true);

    try {
      const response = await apiClient.get('/api/chat-logs', {
        params: {
          page: 1,
          limit: 100,
          channel: 'WHATSAPP',
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
        }
      });

      const rows = dedupeWhatsAppConversations(response.data?.chatLogs || []);
      rows.sort((left, right) => {
        const priorityDiff = getHandoffPriority(left) - getHandoffPriority(right);
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0);
      });

      setConversations(rows);
      setSelectedChatId((prev) => {
        if (prev && rows.some((row) => row.id === prev)) return prev;
        return rows[0]?.id || null;
      });
    } catch {
      if (!silent) toast.error(t.loadFailed);
    } finally {
      if (!silent) setListLoading(false);
    }
  };

  const loadChatDetails = async (chatId, { silent = false } = {}) => {
    if (!chatId) {
      setSelectedChat(null);
      return;
    }

    if (!silent) setDetailLoading(true);

    try {
      const response = await apiClient.get(`/api/chat-logs/${chatId}`);
      setSelectedChat(response.data);
    } catch {
      if (!silent) toast.error(t.detailFailed);
    } finally {
      if (!silent) setDetailLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, [debouncedSearch]);

  useEffect(() => {
    if (!selectedChatId) {
      setSelectedChat(null);
      return;
    }
    loadChatDetails(selectedChatId);
  }, [selectedChatId]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadConversations({ silent: true });
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [debouncedSearch]);

  useEffect(() => {
    if (!selectedChatId) return undefined;

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadChatDetails(selectedChatId, { silent: true });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedChatId]);

  useEffect(() => {
    if (!selectedChat?.customerPhone) {
      setCustomerData(null);
      return;
    }

    let cancelled = false;
    setCustomerLoading(true);

    apiClient.customerData.lookup(selectedChat.customerPhone)
      .then((response) => {
        if (!cancelled) {
          setCustomerData(response.data?.customer || null);
        }
      })
      .catch(() => {
        if (!cancelled) setCustomerData(null);
      })
      .finally(() => {
        if (!cancelled) setCustomerLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedChat?.customerPhone]);

  const filteredConversations = useMemo(() => {
    return conversations.filter((chat) => {
      if (filterMode === 'waiting') return chat?.handoff?.mode === 'REQUESTED';
      if (filterMode === 'live') return chat?.handoff?.mode === 'ACTIVE';
      if (filterMode === 'ai') return !chat?.handoff || chat?.handoff?.mode === 'AI';
      return true;
    });
  }, [conversations, filterMode]);

  const pendingCount = useMemo(() => (
    conversations.filter((chat) => chat?.handoff?.mode === 'REQUESTED').length
  ), [conversations]);

  const handleRefresh = async () => {
    await Promise.all([
      loadConversations(),
      selectedChatId ? loadChatDetails(selectedChatId) : Promise.resolve(),
    ]);
  };

  const refreshAfterAction = async () => {
    await Promise.all([
      loadConversations({ silent: true }),
      selectedChatId ? loadChatDetails(selectedChatId, { silent: true }) : Promise.resolve(),
    ]);
  };

  const handleClaimConversation = async () => {
    if (!selectedChat?.id) return;

    setHandoffAction('claim');
    try {
      await apiClient.post(`/api/chat-logs/${selectedChat.id}/handoff/claim`, {});
      toast.success(t.claimed);
      await refreshAfterAction();
    } catch (error) {
      toast.error(error.response?.data?.error || t.claimFailed);
    } finally {
      setHandoffAction(null);
    }
  };

  const handleReturnToAi = async () => {
    if (!selectedChat?.id) return;

    setHandoffAction('release');
    try {
      await apiClient.post(`/api/chat-logs/${selectedChat.id}/handoff/release`, {});
      toast.success(t.returned);
      await refreshAfterAction();
    } catch (error) {
      toast.error(error.response?.data?.error || t.returnFailed);
    } finally {
      setHandoffAction(null);
    }
  };

  const handleSendReply = async () => {
    if (!selectedChat?.id || !replyDraft.trim()) return;

    setHandoffAction('reply');
    try {
      const response = await apiClient.post(`/api/chat-logs/${selectedChat.id}/handoff/reply`, {
        message: replyDraft.trim(),
      });
      setSelectedChat(response.data?.chatLog || selectedChat);
      setReplyDraft('');
      toast.success(t.liveReplySent);
      await loadConversations({ silent: true });
    } catch (error) {
      toast.error(error.response?.data?.error || t.liveReplyFailed);
    } finally {
      setHandoffAction(null);
    }
  };

  const renderConversationItem = (chat) => {
    const isSelected = selectedChatId === chat.id;
    const preview = buildInboxPreview(chat.messages);

    return (
      <button
        key={chat.id}
        onClick={() => setSelectedChatId(chat.id)}
        className={`w-full rounded-xl border p-3 text-left transition ${
          isSelected
            ? 'border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/20'
            : 'border-transparent hover:border-neutral-200 hover:bg-white dark:hover:border-neutral-800 dark:hover:bg-neutral-900'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-neutral-400" />
              <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
                {chat.customerPhone || chat.sessionId?.slice(0, 10)}
              </p>
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">
              {preview || '—'}
            </p>
          </div>
          <span className="whitespace-nowrap text-[11px] text-neutral-400">
            {formatDateTime(chat.updatedAt || chat.createdAt, locale)}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          {getHandoffBadge(chat?.handoff?.mode, chat?.handoff?.assignedUserName, t)}
          <span className="inline-flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400">
            <Hash className="h-3 w-3" />
            {chat.messageCount || 0}
          </span>
        </div>
      </button>
    );
  };

  const renderMessage = (message, index) => {
    const isUser = message?.role === 'user';
    const isHuman = message?.role === 'human_agent';
    const isSystem = message?.role === 'system';

    const wrapperClass = isSystem
      ? 'mx-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200'
      : isUser
        ? 'ml-auto max-w-2xl rounded-2xl bg-emerald-600 px-4 py-3 text-sm text-white'
        : isHuman
          ? 'max-w-2xl rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-950 dark:bg-blue-950/30 dark:text-blue-100'
          : 'max-w-2xl rounded-2xl bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100';

    const label = isUser
      ? t.customer
      : isHuman
        ? (message?.metadata?.actorName || t.liveActive)
        : isSystem
          ? 'System'
          : 'AI';

    return (
      <div key={`${getMessageTimestamp(message) || 'msg'}-${index}`} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div className={wrapperClass}>
          <div className="mb-1 text-[11px] font-medium opacity-80">{label}</div>
          <div className="whitespace-pre-wrap break-words">{message?.content || '—'}</div>
          {getMessageTimestamp(message) && (
            <div className="mt-2 text-[10px] opacity-60">
              {formatDateTime(getMessageTimestamp(message), locale)}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-10 flex bg-white dark:bg-neutral-950 lg:left-60">
      <div className="flex w-[360px] min-w-[360px] flex-col border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="border-b border-neutral-200 p-4 dark:border-neutral-800">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-green-600" />
                <h1 className="text-lg font-bold text-neutral-900 dark:text-white">{t.title}</h1>
              </div>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{t.subtitle}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={listLoading || detailLoading}>
              <RefreshCw className={`h-4 w-4 ${listLoading || detailLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
              <Headphones className="h-4 w-4" />
              {t.pendingQueue}: {pendingCount}
            </div>
            <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-200/80">{t.pendingQueueDesc}</p>
          </div>

          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t.searchPlaceholder}
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: t.all },
              { key: 'waiting', label: t.waiting },
              { key: 'live', label: t.live },
              { key: 'ai', label: t.ai },
            ].map((item) => (
              <Button
                key={item.key}
                size="sm"
                variant={filterMode === item.key ? 'default' : 'outline'}
                onClick={() => setFilterMode(item.key)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {listLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((row) => (
                <div key={row} className="h-24 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
              ))}
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950">
              <EmptyState
                icon={MessageSquare}
                title={t.noConversations}
                description={t.noConversationsDesc}
              />
            </div>
          ) : (
            filteredConversations.map(renderConversationItem)
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col bg-white dark:bg-neutral-950">
        {selectedChat ? (
          <>
            <div className="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-neutral-400" />
                    <h2 className="truncate text-lg font-semibold text-neutral-900 dark:text-white">
                      {selectedChat.customerPhone || selectedChat.sessionId}
                    </h2>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {getHandoffBadge(selectedChat?.handoff?.mode, selectedChat?.handoff?.assignedUserName, t)}
                    <Badge variant="outline" className="gap-1">
                      <Hash className="h-3 w-3" />
                      {selectedChat.messageCount || selectedChat.messages?.length || 0}
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <Clock3 className="h-3 w-3" />
                      {formatDateTime(selectedChat.updatedAt || selectedChat.createdAt, locale)}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!selectedChat?.handoff?.currentUserIsAssignee && (
                    <Button
                      onClick={handleClaimConversation}
                      disabled={handoffAction === 'claim' || (selectedChat?.handoff?.mode === 'ACTIVE' && !selectedChat?.handoff?.canClaim)}
                    >
                      {handoffAction === 'claim' ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          {t.claiming}
                        </>
                      ) : (
                        <>
                          <Headphones className="mr-2 h-4 w-4" />
                          {t.takeOver}
                        </>
                      )}
                    </Button>
                  )}

                  {selectedChat?.handoff?.canReturnToAi && (
                    <Button variant="outline" onClick={handleReturnToAi} disabled={handoffAction === 'release'}>
                      {handoffAction === 'release' ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          {t.returning}
                        </>
                      ) : (
                        <>
                          <Bot className="mr-2 h-4 w-4" />
                          {t.returnToAi}
                        </>
                      )}
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSidebarOpen((prev) => !prev)}
                    title={t.customerPanel}
                  >
                    {sidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
                {selectedChat?.handoff?.currentUserIsAssignee
                  ? t.youOwnThis
                  : selectedChat?.handoff?.mode === 'ACTIVE'
                    ? t.claimedByOther
                    : selectedChat?.handoff?.mode === 'REQUESTED'
                      ? t.stillWaiting
                      : t.aiDescription}
              </div>
            </div>

            <div className="flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
                  {detailLoading && !selectedChat?.messages?.length ? (
                    <div className="flex h-full items-center justify-center text-sm text-neutral-500">{t.loadingThread}</div>
                  ) : selectedChat?.messages?.length ? (
                    selectedChat.messages.map(renderMessage)
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
                      {t.noMessages}
                    </div>
                  )}
                </div>

                <div className="border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
                  {selectedChat?.handoff?.canReply ? (
                    <div className="space-y-3">
                      <Textarea
                        value={replyDraft}
                        onChange={(event) => setReplyDraft(event.target.value)}
                        rows={4}
                        placeholder={t.replyPlaceholder}
                      />
                      <div className="flex justify-end">
                        <Button onClick={handleSendReply} disabled={!replyDraft.trim() || handoffAction === 'reply'}>
                          {handoffAction === 'reply' ? (
                            <>
                              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                              {t.sendingReply}
                            </>
                          ) : (
                            <>
                              <Send className="mr-2 h-4 w-4" />
                              {t.sendReply}
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-4 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
                      {selectedChat?.handoff?.mode === 'AI'
                        ? t.aiDescription
                        : selectedChat?.handoff?.mode === 'REQUESTED'
                          ? t.stillWaiting
                          : t.claimedByOther}
                    </div>
                  )}
                </div>
              </div>

              {sidebarOpen && (
                <aside className="w-[320px] min-w-[320px] border-l border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
                  <div className="space-y-4 p-4">
                    <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
                      <div className="flex items-center gap-2">
                        <UserCircle2 className="h-4 w-4 text-neutral-400" />
                        <h3 className="font-medium text-neutral-900 dark:text-white">{t.customerData}</h3>
                      </div>

                      <div className="mt-4 space-y-3 text-sm">
                        <div>
                          <div className="text-xs uppercase tracking-wide text-neutral-400">{t.contact}</div>
                          <div className="mt-1 font-medium text-neutral-900 dark:text-white">{selectedChat.customerPhone || '—'}</div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-neutral-400">{t.assistant}</div>
                          <div className="mt-1 text-neutral-700 dark:text-neutral-300">{selectedChat.assistant?.name || '—'}</div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-neutral-400">{t.session}</div>
                          <div className="mt-1 break-all font-mono text-xs text-neutral-700 dark:text-neutral-300">{selectedChat.sessionId}</div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-neutral-400">{t.createdAt}</div>
                          <div className="mt-1 text-neutral-700 dark:text-neutral-300">{formatDateTime(selectedChat.createdAt, locale)}</div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-neutral-400">{t.updatedAt}</div>
                          <div className="mt-1 text-neutral-700 dark:text-neutral-300">{formatDateTime(selectedChat.updatedAt, locale)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-neutral-400" />
                        <h3 className="font-medium text-neutral-900 dark:text-white">{t.customer}</h3>
                      </div>

                      {customerLoading ? (
                        <div className="mt-4 space-y-2">
                          {[1, 2, 3].map((row) => (
                            <div key={row} className="h-4 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                          ))}
                        </div>
                      ) : customerData ? (
                        <div className="mt-4 space-y-4 text-sm">
                          <div>
                            <div className="text-xs uppercase tracking-wide text-neutral-400">{t.company}</div>
                            <div className="mt-1 font-medium text-neutral-900 dark:text-white">
                              {customerData.companyName || customerData.contactName || selectedChat.customerPhone}
                            </div>
                          </div>

                          {customerData.contactName && (
                            <div>
                              <div className="text-xs uppercase tracking-wide text-neutral-400">{t.contact}</div>
                              <div className="mt-1 text-neutral-700 dark:text-neutral-300">{customerData.contactName}</div>
                            </div>
                          )}

                          {Array.isArray(customerData.tags) && customerData.tags.length > 0 && (
                            <div>
                              <div className="text-xs uppercase tracking-wide text-neutral-400">{t.tags}</div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {customerData.tags.map((tag) => (
                                  <Badge key={tag} variant="secondary">{tag}</Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {customerData.notes && (
                            <div>
                              <div className="text-xs uppercase tracking-wide text-neutral-400">{t.notes}</div>
                              <div className="mt-1 whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">{customerData.notes}</div>
                            </div>
                          )}

                          {customerData.customFields && Object.keys(customerData.customFields).length > 0 && (
                            <div>
                              <div className="text-xs uppercase tracking-wide text-neutral-400">{t.customFields}</div>
                              <div className="mt-2 space-y-2">
                                {Object.entries(customerData.customFields).slice(0, 8).map(([key, value]) => (
                                  <div key={key} className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
                                    <div className="text-[11px] uppercase tracking-wide text-neutral-400">{key}</div>
                                    <div className="mt-1 break-words text-neutral-700 dark:text-neutral-300">{String(value)}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">{t.noCustomerData}</div>
                      )}
                    </div>
                  </div>
                </aside>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-8">
            <EmptyState
              icon={MessageSquare}
              title={t.noConversations}
              description={t.threadEmpty}
            />
          </div>
        )}
      </div>
    </div>
  );
}
