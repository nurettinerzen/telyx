'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import EmptyState from '@/components/EmptyState';
import { apiClient } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import { formatSessionHandle } from '@/lib/utils';
import { publishLiveHandoffSync, subscribeLiveHandoffSync } from '@/lib/liveHandoffSync';
import { resolveConversationSystemMessage } from '@/lib/conversationSystemMessages';
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
  History,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  UserCircle2,
} from 'lucide-react';
import {
  DashboardFlowBackdrop,
  getDashboardFlowPageStyle,
  getDashboardFlowSurfaceStyle,
} from '@/components/dashboard/DashboardFlowBackdrop';

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

function formatMessageTime(value, locale) {
  if (!value) return '—';

  try {
    return new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return '—';
  }
}

function buildInboxPreview(messages = [], resolveMessageContent = null) {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  const lastMessage = messages[messages.length - 1];
  const preview = typeof resolveMessageContent === 'function'
    ? resolveMessageContent(lastMessage)
    : lastMessage?.content;

  return String(preview || '').trim();
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

function normalizePhoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function buildOperationalConversations(chats = []) {
  const preferredByKey = new Map();
  const preservedChats = [];

  for (const chat of chats) {
    if (chat?.channel !== 'WHATSAPP') {
      preservedChats.push(chat);
      continue;
    }

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
  return [
    ...preservedChats,
    ...chats.filter((chat) => chat?.channel === 'WHATSAPP' && keptIds.has(chat.id)),
  ];
}

function getChannelLabel(channel, t) {
  return channel === 'WHATSAPP' ? t.whatsapp : t.chat;
}

function getChannelIcon(channel) {
  return channel === 'WHATSAPP' ? Phone : MessageSquare;
}

function getHandoffBadge(mode, assignedUserName, t, status = 'active') {
  if (status !== 'active') {
    return (
      <Badge variant="outline" className="border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-300">
        {t.completedShort}
      </Badge>
    );
  }

  if (mode === 'REQUESTED') {
    return (
      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
        <Headphones className="mr-1 h-3 w-3" />
        {t.liveRequested}
      </Badge>
    );
  }

  if (mode === 'ACTIVE') {
    return (
      <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-200">
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

function getCompactStatusLabel(chat, t) {
  if (chat?.status !== 'active') return t.completedShort;
  if (chat?.handoff?.currentUserIsAssignee) return t.liveOwnedShort;
  if (chat?.handoff?.mode === 'REQUESTED') return t.liveRequestedShort;
  if (chat?.handoff?.mode === 'ACTIVE') return t.liveActiveShort;
  return t.aiManagedShort;
}

function getCompactStatusClasses(chat) {
  if (chat?.status !== 'active') {
    return 'border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-300';
  }

  if (chat?.handoff?.currentUserIsAssignee) {
    return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-200';
  }

  if (chat?.handoff?.mode === 'REQUESTED') {
    return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200';
  }

  if (chat?.handoff?.mode === 'ACTIVE') {
    return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200';
  }

  return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300';
}

export default function WhatsAppInboxPage() {
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const { locale, t: translate } = useLanguage();
  const searchParams = useSearchParams();
  const requestedChatId = searchParams.get('chatId');
  const isUnifiedInbox = pathname === '/dashboard/chats' || pathname === '/dashboard/conversations';
  const liveHandoffEnabled = process.env.NEXT_PUBLIC_WHATSAPP_LIVE_HANDOFF_V2 === 'true';
  const chatLiveHandoffEnabled = process.env.NEXT_PUBLIC_CHAT_LIVE_HANDOFF_V1 === 'true';
  const pageEnabled = isUnifiedInbox
    ? liveHandoffEnabled || chatLiveHandoffEnabled
    : liveHandoffEnabled;

  const t = {
    title: translate(isUnifiedInbox ? 'dashboard.conversationsPage.title' : 'dashboard.whatsappInboxPage.title'),
    subtitle: translate(isUnifiedInbox ? 'dashboard.conversationsPage.subtitle' : 'dashboard.whatsappInboxPage.subtitle'),
    refresh: translate('dashboard.whatsappInboxPage.refresh'),
    refreshing: translate('dashboard.whatsappInboxPage.refreshing'),
    searchPlaceholder: translate(isUnifiedInbox ? 'dashboard.conversationsPage.searchPlaceholder' : 'dashboard.whatsappInboxPage.searchPlaceholder'),
    all: translate(isUnifiedInbox ? 'dashboard.conversationsPage.allChannels' : 'dashboard.whatsappInboxPage.all'),
    whatsapp: translate(isUnifiedInbox ? 'dashboard.conversationsPage.whatsapp' : 'dashboard.whatsappInboxPage.title'),
    chat: translate(isUnifiedInbox ? 'dashboard.conversationsPage.chat' : 'dashboard.chatHistoryPage.chat'),
    waiting: translate('dashboard.whatsappInboxPage.waiting'),
    live: translate('dashboard.whatsappInboxPage.live'),
    ai: translate('dashboard.whatsappInboxPage.ai'),
    noConversations: translate('dashboard.whatsappInboxPage.noConversations'),
    noConversationsDesc: translate(isUnifiedInbox ? 'dashboard.conversationsPage.noConversationsDesc' : 'dashboard.whatsappInboxPage.noConversationsDesc'),
    pendingQueue: translate('dashboard.whatsappInboxPage.pendingQueue'),
    pendingQueueDesc: translate('dashboard.whatsappInboxPage.pendingQueueDesc'),
    pendingShort: translate(isUnifiedInbox ? 'dashboard.conversationsPage.pendingShort' : 'dashboard.whatsappInboxPage.pendingShort'),
    customer: translate('dashboard.whatsappInboxPage.customer'),
    assistant: translate('dashboard.whatsappInboxPage.assistant'),
    session: translate('dashboard.whatsappInboxPage.session'),
    messageCount: translate('dashboard.whatsappInboxPage.messageCount'),
    updatedAt: translate('dashboard.whatsappInboxPage.updatedAt'),
    createdAt: translate('dashboard.whatsappInboxPage.createdAt'),
    liveRequested: translate('dashboard.whatsappInboxPage.liveRequested'),
    liveActive: translate('dashboard.whatsappInboxPage.liveActive'),
    liveByName: translate('dashboard.whatsappInboxPage.liveByName'),
    aiManaged: translate('dashboard.whatsappInboxPage.aiManaged'),
    takeOver: translate('dashboard.whatsappInboxPage.takeOver'),
    takeOverShort: translate('dashboard.whatsappInboxPage.takeOverShort'),
    claiming: translate('dashboard.whatsappInboxPage.claiming'),
    returnToAi: translate('dashboard.whatsappInboxPage.returnToAi'),
    backToAiShort: translate('dashboard.whatsappInboxPage.backToAiShort'),
    returning: translate('dashboard.whatsappInboxPage.returning'),
    replyPlaceholder: translate('dashboard.whatsappInboxPage.replyPlaceholder'),
    sendReply: translate('dashboard.whatsappInboxPage.sendReply'),
    sendingReply: translate('dashboard.whatsappInboxPage.sendingReply'),
    liveReplySent: translate('dashboard.whatsappInboxPage.liveReplySent'),
    liveReplyFailed: translate('dashboard.whatsappInboxPage.liveReplyFailed'),
    claimed: translate('dashboard.whatsappInboxPage.claimed'),
    claimFailed: translate('dashboard.whatsappInboxPage.claimFailed'),
    returned: translate('dashboard.whatsappInboxPage.returned'),
    returnFailed: translate('dashboard.whatsappInboxPage.returnFailed'),
    noMessages: translate('dashboard.whatsappInboxPage.noMessages'),
    customerPanel: translate('dashboard.whatsappInboxPage.customerPanel'),
    showDetails: translate('dashboard.whatsappInboxPage.showDetails'),
    hideDetails: translate('dashboard.whatsappInboxPage.hideDetails'),
    customerData: translate('dashboard.whatsappInboxPage.customerData'),
    noCustomerData: translate('dashboard.whatsappInboxPage.noCustomerData'),
    tags: translate('dashboard.whatsappInboxPage.tags'),
    notes: translate('dashboard.whatsappInboxPage.notes'),
    contact: translate('dashboard.whatsappInboxPage.contact'),
    company: translate('dashboard.whatsappInboxPage.company'),
    customFields: translate('dashboard.whatsappInboxPage.customFields'),
    conversation: translate('dashboard.whatsappInboxPage.conversation'),
    youOwnThis: translate('dashboard.whatsappInboxPage.youOwnThis'),
    claimedByOther: translate('dashboard.whatsappInboxPage.claimedByOther'),
    aiDescription: translate('dashboard.whatsappInboxPage.aiDescription'),
    stillWaiting: translate('dashboard.whatsappInboxPage.stillWaiting'),
    liveRequestedShort: translate('dashboard.whatsappInboxPage.liveRequestedShort'),
    liveActiveShort: translate('dashboard.whatsappInboxPage.liveActiveShort'),
    liveOwnedShort: translate('dashboard.whatsappInboxPage.liveOwnedShort'),
    aiManagedShort: translate('dashboard.whatsappInboxPage.aiManagedShort'),
    completedShort: translate('dashboard.whatsappInboxPage.completedShort'),
    details: translate('dashboard.whatsappInboxPage.details'),
    noCustomerDataShort: translate('dashboard.whatsappInboxPage.noCustomerDataShort'),
    noPhoneAvailable: translate('dashboard.whatsappInboxPage.noPhoneAvailable'),
    activeWorkspaceHint: translate(isUnifiedInbox ? 'dashboard.conversationsPage.activeWorkspaceHint' : 'dashboard.whatsappInboxPage.activeWorkspaceHint'),
    recentSessions: translate('dashboard.whatsappInboxPage.recentSessions'),
    recentSessionsHint: translate('dashboard.whatsappInboxPage.recentSessionsHint'),
    noRecentSessions: translate('dashboard.whatsappInboxPage.noRecentSessions'),
    threadEmpty: translate(isUnifiedInbox ? 'dashboard.conversationsPage.threadEmpty' : 'dashboard.whatsappInboxPage.threadEmpty'),
    loadingThread: translate('dashboard.whatsappInboxPage.loadingThread'),
    loadFailed: translate(isUnifiedInbox ? 'dashboard.conversationsPage.loadFailed' : 'dashboard.whatsappInboxPage.loadFailed'),
    detailFailed: translate(isUnifiedInbox ? 'dashboard.conversationsPage.detailFailed' : 'dashboard.whatsappInboxPage.detailFailed'),
    systemLabel: translate('dashboard.whatsappInboxPage.systemLabel'),
    aiLabel: translate('dashboard.whatsappInboxPage.aiLabel'),
    featureDisabledTitle: translate(isUnifiedInbox ? 'dashboard.conversationsPage.featureDisabledTitle' : 'dashboard.whatsappInboxPage.featureDisabledTitle'),
    featureDisabledDescription: translate(isUnifiedInbox ? 'dashboard.conversationsPage.featureDisabledDescription' : 'dashboard.whatsappInboxPage.featureDisabledDescription'),
    completedDescription: translate('dashboard.whatsappInboxPage.completedDescription'),
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
  const [sidebarPreferenceReady, setSidebarPreferenceReady] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const [handoffAction, setHandoffAction] = useState(null);
  const [customerData, setCustomerData] = useState(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [relatedSessions, setRelatedSessions] = useState([]);
  const [relatedSessionsLoading, setRelatedSessionsLoading] = useState(false);
  const threadScrollRef = useRef(null);
  const requestedChatIdHandledRef = useRef(null);
  const SelectedChannelIcon = selectedChat ? getChannelIcon(selectedChat.channel) : MessageSquare;
  const sidebarPreferenceKey = isUnifiedInbox
    ? 'telyx:conversations:sidebar-open'
    : 'telyx:whatsapp-inbox:sidebar-open';
  const sidebarPanelStyle = dark
    ? {
        ...getDashboardFlowSurfaceStyle(dark, 'sidebar'),
        borderRight: '1px solid rgba(255,255,255,0.08)',
      }
    : {
        borderRight: '1px solid #e5e7eb',
        background: '#f9fafb',
      };
  const mainPanelStyle = dark
    ? getDashboardFlowSurfaceStyle(dark, 'main')
    : { background: '#ffffff' };
  const detailPanelStyle = dark
    ? {
        ...getDashboardFlowSurfaceStyle(dark, 'sidebar'),
        borderLeft: '1px solid rgba(255,255,255,0.08)',
      }
    : {
        borderLeft: '1px solid #e5e7eb',
        background: '#f9fafb',
      };
  const detailCardStyle = dark
    ? getDashboardFlowSurfaceStyle(dark, 'panel')
    : { background: '#ffffff' };

  // Prevent background scroll — this page uses fixed positioning,
  // but the parent layout's overflow-auto container still scrolls behind it.
  useEffect(() => {
    const mainContent = document.querySelector('.flex-1.lg\\:ml-60');
    if (mainContent) mainContent.style.overflow = 'hidden';
    return () => {
      if (mainContent) mainContent.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedPreference = window.localStorage.getItem(sidebarPreferenceKey);
    if (savedPreference === 'true' || savedPreference === 'false') {
      setSidebarOpen(savedPreference === 'true');
      setSidebarPreferenceReady(true);
      return;
    }

    setSidebarOpen(window.matchMedia('(min-width: 1024px)').matches);
    setSidebarPreferenceReady(true);
  }, [sidebarPreferenceKey]);

  useEffect(() => {
    if (!sidebarPreferenceReady || typeof window === 'undefined') return;
    window.localStorage.setItem(sidebarPreferenceKey, String(sidebarOpen));
  }, [sidebarOpen, sidebarPreferenceKey, sidebarPreferenceReady]);

  const loadConversations = async ({ silent = false } = {}) => {
    if (!pageEnabled) {
      setConversations([]);
      setSelectedChatId(null);
      setSelectedChat(null);
      setListLoading(false);
      return;
    }

    if (!silent) setListLoading(true);

    try {
      const response = await apiClient.get('/api/chat-logs', {
        params: {
          page: 1,
          limit: 100,
          ...(isUnifiedInbox ? {} : { channel: 'WHATSAPP' }),
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
        }
      });

      const rows = buildOperationalConversations(response.data?.chatLogs || [])
        .filter((chat) => (
          (chat?.channel === 'WHATSAPP' && liveHandoffEnabled) ||
          (chat?.channel === 'CHAT' && (isUnifiedInbox ? chatLiveHandoffEnabled : false))
        ));
      rows.sort((left, right) => {
        const priorityDiff = getHandoffPriority(left) - getHandoffPriority(right);
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0);
      });

      setConversations(rows);
      setSelectedChatId((prev) => {
        if (requestedChatId && requestedChatIdHandledRef.current !== requestedChatId && rows.some((row) => row.id === requestedChatId)) {
          return requestedChatId;
        }
        if (prev) return prev;
        return rows[0]?.id || null;
      });
    } catch {
      if (!silent) toast.error(t.loadFailed);
    } finally {
      if (!silent) setListLoading(false);
    }
  };

  const loadChatDetails = async (chatId, { silent = false } = {}) => {
    if (!pageEnabled || !chatId) {
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
    if (!requestedChatId) {
      requestedChatIdHandledRef.current = null;
      return;
    }

    if (!requestedChatId || conversations.length === 0) return;
    if (requestedChatIdHandledRef.current === requestedChatId) return;
    if (conversations.some((chat) => chat.id === requestedChatId)) {
      requestedChatIdHandledRef.current = requestedChatId;
      if (selectedChatId !== requestedChatId) {
        setSelectedChatId(requestedChatId);
      }
    }
  }, [requestedChatId, conversations, selectedChatId]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadConversations({ silent: true });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [debouncedSearch]);

  useEffect(() => {
    if (!selectedChatId) return undefined;

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadChatDetails(selectedChatId, { silent: true });
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedChatId]);

  useEffect(() => {
    return subscribeLiveHandoffSync((event) => {
      if (!event?.type) return;

      loadConversations({ silent: true });

      if (selectedChatId && (!event.chatId || event.chatId === selectedChatId)) {
        loadChatDetails(selectedChatId, { silent: true });
      }
    });
  }, [selectedChatId]);

  useEffect(() => {
    if (selectedChat?.channel !== 'WHATSAPP' || !hasMeaningfulPhone(selectedChat?.customerPhone)) {
      setCustomerData(null);
      setCustomerLoading(false);
      return;
    }

    let cancelled = false;
    setCustomerLoading(true);

    apiClient.customerData.lookup(formatPhone(selectedChat.customerPhone, ''))
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

  useEffect(() => {
    if (selectedChat?.channel !== 'WHATSAPP' || !hasMeaningfulPhone(selectedChat?.customerPhone)) {
      setRelatedSessions([]);
      setRelatedSessionsLoading(false);
      return;
    }

    let cancelled = false;
    setRelatedSessionsLoading(true);

    apiClient.get('/api/chat-logs', {
      params: {
        page: 1,
        limit: 20,
          channel: 'WHATSAPP',
          search: formatPhone(selectedChat.customerPhone, ''),
        }
    })
      .then((response) => {
        if (cancelled) return;

        const targetPhoneDigits = normalizePhoneDigits(selectedChat.customerPhone);
        const sessions = (response.data?.chatLogs || [])
          .filter((chat) => normalizePhoneDigits(chat?.customerPhone) === targetPhoneDigits)
          .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0));

        setRelatedSessions(sessions);
      })
      .catch(() => {
        if (!cancelled) setRelatedSessions([]);
      })
      .finally(() => {
        if (!cancelled) setRelatedSessionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedChat?.customerPhone, selectedChat?.updatedAt]);

  useEffect(() => {
    if (!selectedChat) return;

    const frame = requestAnimationFrame(() => {
      if (threadScrollRef.current) {
        threadScrollRef.current.scrollTop = threadScrollRef.current.scrollHeight;
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [selectedChat?.id, selectedChat?.messages?.length, selectedChat?.updatedAt]);

  const filteredConversations = useMemo(() => {
    return conversations.filter((chat) => {
      if (filterMode === 'whatsapp') return chat?.channel === 'WHATSAPP';
      if (filterMode === 'chat') return chat?.channel === 'CHAT';
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
      publishLiveHandoffSync({
        type: 'handoff_claimed',
        chatId: selectedChat.id,
        channel: selectedChat.channel,
      });
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
      publishLiveHandoffSync({
        type: 'handoff_released',
        chatId: selectedChat.id,
        channel: selectedChat.channel,
      });
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
      await loadConversations({ silent: true });
    } catch (error) {
      toast.error(error.response?.data?.error || t.liveReplyFailed);
    } finally {
      setHandoffAction(null);
    }
  };

  const handleReplySubmit = (event) => {
    event.preventDefault();

    if (!replyDraft.trim() || handoffAction === 'reply') {
      return;
    }

    handleSendReply();
  };

  const handleReplyKeyDown = (event) => {
    const isEnter = event.key === 'Enter' || event.keyCode === 13;
    const isModified = event.shiftKey || event.altKey || event.ctrlKey || event.metaKey;
    const isComposing = event.isComposing || event.nativeEvent?.isComposing;

    if (!isEnter || isModified || isComposing) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (!replyDraft.trim() || handoffAction === 'reply') {
      return;
    }

    handleSendReply();
  };

  const renderConversationItem = (chat) => {
    const isSelected = selectedChatId === chat.id;
    const preview = buildInboxPreview(chat.messages, (message) => resolveConversationSystemMessage(message, translate));
    const ChannelIcon = getChannelIcon(chat.channel);
    const itemStyle = dark
      ? isSelected
        ? {
            background: 'linear-gradient(135deg, rgba(0,111,235,0.16), rgba(0,196,230,0.10))',
            borderColor: 'rgba(0,196,230,0.34)',
            boxShadow: '0 18px 35px rgba(2,6,23,0.24), inset 0 1px 0 rgba(255,255,255,0.04)',
          }
        : {
            background: 'rgba(255,255,255,0.035)',
            borderColor: 'rgba(255,255,255,0.06)',
          }
      : undefined;

    return (
      <button
        key={chat.id}
        onClick={() => setSelectedChatId(chat.id)}
        className={`w-full rounded-xl border p-3 text-left transition ${
          isSelected
            ? 'border-cyan-300 bg-cyan-50/70 dark:border-cyan-500/30 dark:bg-transparent'
            : 'hover:border-neutral-200 hover:bg-white dark:hover:border-white/10 dark:hover:bg-white/5'
        }`}
        style={itemStyle}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ChannelIcon className="h-3.5 w-3.5" style={{ color: dark ? '#7DD3FC' : undefined }} />
              <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
                {formatPhone(chat.customerPhone, formatSessionHandle(chat.sessionId))}
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
          <div className="flex min-w-0 items-center gap-2">
            {getHandoffBadge(chat?.handoff?.mode, chat?.handoff?.assignedUserName, t, chat?.status)}
            {isUnifiedInbox && (
              <Badge variant="outline" className="border-neutral-200 bg-white text-[10px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
                {getChannelLabel(chat.channel, t)}
              </Badge>
            )}
          </div>
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

    const renderedContent = isSystem
      ? resolveConversationSystemMessage(message, translate)
      : (message?.content || '—');

    const wrapperClass = isSystem
      ? 'w-full max-w-xl rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-sky-100'
      : isUser
        ? 'ml-auto max-w-2xl rounded-2xl bg-[#00C4E6] px-4 py-3 text-sm text-slate-950'
        : isHuman
          ? 'max-w-2xl rounded-2xl bg-sky-50 px-4 py-3 text-sm text-blue-950 dark:bg-[#006FEB]/18 dark:text-blue-50'
          : 'max-w-2xl rounded-2xl bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100';

    const label = isUser
      ? t.customer
      : isHuman
        ? (message?.metadata?.actorName || t.liveActive)
        : isSystem
          ? t.systemLabel
          : t.aiLabel;

    return (
      <div
        key={`${getMessageTimestamp(message) || 'msg'}-${index}`}
        className={`flex w-full min-w-0 ${isSystem ? 'justify-center' : isUser ? 'justify-end' : 'justify-start'}`}
      >
        <div className={wrapperClass}>
          <div className="mb-1 text-[11px] font-medium opacity-80">{label}</div>
          <div className="whitespace-pre-wrap break-words">{renderedContent}</div>
          {getMessageTimestamp(message) && (
            <div className="mt-2 text-[10px] opacity-60">
              {formatMessageTime(getMessageTimestamp(message), locale)}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (!pageEnabled) {
    return (
      <div className="fixed inset-0 z-10 flex overflow-hidden bg-white dark:bg-neutral-950 lg:left-60" style={getDashboardFlowPageStyle(dark)}>
        <DashboardFlowBackdrop dark={dark} />
        <div className="relative z-10 flex min-w-0 flex-1 items-center justify-center p-6">
          <div className="w-full max-w-xl rounded-2xl border border-dashed border-neutral-300 bg-white p-8 dark:border-white/10 dark:bg-[#09112a]/80" style={dark ? getDashboardFlowSurfaceStyle(dark, 'panel') : undefined}>
            <EmptyState
              icon={AlertCircle}
              title={t.featureDisabledTitle}
              description={t.featureDisabledDescription}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-10 flex overflow-hidden bg-white dark:bg-neutral-950 lg:left-60" style={getDashboardFlowPageStyle(dark)}>
      <DashboardFlowBackdrop dark={dark} />
      <div className="relative z-10 flex w-[340px] min-w-[340px] flex-col" style={sidebarPanelStyle}>
        <div className="p-4" style={dark ? { borderBottom: '1px solid rgba(255,255,255,0.08)' } : undefined}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="rounded-xl p-2" style={dark ? { background: 'rgba(0,196,230,0.14)', boxShadow: '0 0 30px rgba(0,196,230,0.12)' } : { background: '#ecfeff' }}>
                  <MessageSquare className="h-4 w-4" style={{ color: dark ? '#00C4E6' : '#0891b2' }} />
                </div>
                <h1 className="text-lg font-bold text-neutral-900 dark:text-white">{t.title}</h1>
              </div>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{t.activeWorkspaceHint}</p>
            </div>
            <div className="flex items-center gap-1">
              <Link href="/dashboard/chat-history">
                <Button variant="ghost" size="sm" title={translate('dashboard.sidebar.chatHistory')}>
                  <History className="h-4 w-4" />
                </Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={listLoading || detailLoading}>
                <RefreshCw className={`h-4 w-4 ${listLoading || detailLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          <div
            className="mb-3 flex items-center justify-between rounded-xl border px-3 py-2"
            style={dark
              ? { borderColor: 'rgba(0,111,235,0.32)', background: 'rgba(0,111,235,0.12)' }
              : undefined}
          >
            <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-sky-200">
              <Headphones className="h-4 w-4" />
              {t.pendingShort}
            </div>
            <span className="text-sm font-semibold text-amber-800 dark:text-sky-200">{pendingCount}</span>
          </div>

          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t.searchPlaceholder}
              className={`pl-9 ${dark ? 'border-white/10 bg-white/5 text-slate-100 placeholder:text-slate-500 focus:border-[#00C4E6]/40 focus:ring-[#00C4E6]/20' : ''}`}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: t.all },
              ...(isUnifiedInbox
                ? [
                    { key: 'whatsapp', label: t.whatsapp },
                    { key: 'chat', label: t.chat },
                  ]
                : []),
              { key: 'waiting', label: t.waiting },
              { key: 'live', label: t.live },
              { key: 'ai', label: t.ai },
            ].map((item) => (
              <Button
                key={item.key}
                size="sm"
                variant={filterMode === item.key ? 'default' : 'outline'}
                onClick={() => setFilterMode(item.key)}
                className={dark
                  ? filterMode === item.key
                    ? 'border-transparent bg-[#00C4E6]/18 text-[#7dd3fc] shadow-[0_0_18px_rgba(0,196,230,0.18)] hover:bg-[#00C4E6]/24'
                    : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:bg-white/10 hover:text-slate-100'
                  : ''}
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
                <div key={row} className="h-24 animate-pulse rounded-xl bg-neutral-200 dark:bg-white/5" />
              ))}
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 dark:border-white/10 dark:bg-[#09112a]/70" style={dark ? getDashboardFlowSurfaceStyle(dark, 'panel') : undefined}>
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

      <div className="relative z-10 flex min-w-0 flex-1 flex-col" style={mainPanelStyle}>
        {selectedChat ? (
          <>
            <div className="px-5 py-4" style={dark ? { borderBottom: '1px solid rgba(255,255,255,0.08)' } : undefined}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <SelectedChannelIcon className="h-4 w-4" style={{ color: dark ? '#7DD3FC' : undefined }} />
                    <h2 className="truncate text-lg font-semibold text-neutral-900 dark:text-white">
                      {formatPhone(selectedChat.customerPhone, formatSessionHandle(selectedChat.sessionId))}
                    </h2>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 font-medium ${getCompactStatusClasses(selectedChat)}`}>
                      {getCompactStatusLabel(selectedChat, t)}
                    </span>
                    <Badge variant="outline" className="gap-1 text-[11px]">
                      <Hash className="h-3 w-3" />
                      {selectedChat.messageCount || selectedChat.messages?.length || 0}
                    </Badge>
                    <Badge variant="outline" className="gap-1 text-[11px]">
                      <Clock3 className="h-3 w-3" />
                      {formatDateTime(selectedChat.updatedAt || selectedChat.createdAt, locale)}
                    </Badge>
                    {isUnifiedInbox && (
                      <Badge variant="outline" className="text-[11px]">
                        {getChannelLabel(selectedChat.channel, t)}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {selectedChat?.status === 'active' && !selectedChat?.handoff?.currentUserIsAssignee && (
                    <Button
                      onClick={handleClaimConversation}
                      disabled={handoffAction === 'claim' || selectedChat?.status !== 'active' || !selectedChat?.handoff?.canClaim}
                    >
                      {handoffAction === 'claim' ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          {t.claiming}
                        </>
                      ) : (
                        <>
                          <Headphones className="mr-2 h-4 w-4" />
                          {t.takeOverShort}
                        </>
                      )}
                    </Button>
                  )}

                  {selectedChat?.status === 'active' && selectedChat?.handoff?.canReturnToAi && (
                    <Button variant="outline" onClick={handleReturnToAi} disabled={handoffAction === 'release'}>
                      {handoffAction === 'release' ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          {t.returning}
                        </>
                      ) : (
                        <>
                          <Bot className="mr-2 h-4 w-4" />
                          {t.backToAiShort}
                        </>
                      )}
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSidebarOpen((prev) => !prev)}
                    title={sidebarOpen ? t.hideDetails : t.showDetails}
                    aria-label={sidebarOpen ? t.hideDetails : t.showDetails}
                  >
                    {sidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col">
                <div ref={threadScrollRef} className="flex-1 space-y-4 overflow-x-hidden overflow-y-auto px-5 py-5">
                  {detailLoading && !selectedChat?.messages?.length ? (
                    <div className="flex h-full items-center justify-center text-sm text-neutral-500">{t.loadingThread}</div>
                  ) : selectedChat?.messages?.length ? (
                    selectedChat.messages.map(renderMessage)
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 text-sm text-neutral-500 dark:border-white/10 dark:bg-white/5">
                      {t.noMessages}
                    </div>
                  )}
                </div>

                <div className="px-5 py-4" style={dark ? { borderTop: '1px solid rgba(255,255,255,0.08)' } : undefined}>
                  {selectedChat?.status === 'active' && selectedChat?.handoff?.canReply ? (
                    <form className="space-y-3" onSubmit={handleReplySubmit}>
                      <Textarea
                        value={replyDraft}
                        onChange={(event) => setReplyDraft(event.target.value)}
                        onKeyDown={handleReplyKeyDown}
                        onKeyDownCapture={handleReplyKeyDown}
                        rows={4}
                        placeholder={t.replyPlaceholder}
                        enterKeyHint="send"
                        className={dark ? 'border-white/10 bg-white/5 text-slate-100 placeholder:text-slate-500 focus:border-[#00C4E6]/40 focus:ring-[#00C4E6]/20' : ''}
                      />
                      <div className="flex justify-end">
                        <Button
                          type="submit"
                          disabled={!replyDraft.trim() || handoffAction === 'reply'}
                          className={dark ? 'bg-[#00C4E6] text-slate-950 hover:bg-[#33d6ee]' : ''}
                        >
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
                    </form>
                  ) : (
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                      {selectedChat?.status !== 'active'
                        ? t.completedDescription
                        : selectedChat?.handoff?.mode === 'AI'
                        ? t.aiDescription
                        : selectedChat?.handoff?.mode === 'REQUESTED'
                          ? t.stillWaiting
                          : t.claimedByOther}
                    </div>
                  )}
                </div>
              </div>

              {sidebarOpen && (
                <aside className="w-[280px] min-w-[280px]" style={detailPanelStyle}>
                  <div className="p-4">
                    <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-[#09112a]/72" style={detailCardStyle}>
                      <div className="flex items-center gap-2">
                        <UserCircle2 className="h-4 w-4" style={{ color: dark ? '#7DD3FC' : undefined }} />
                        <h3 className="font-medium text-neutral-900 dark:text-white">{t.details}</h3>
                      </div>

                      {selectedChat?.channel === 'WHATSAPP' && customerLoading ? (
                        <div className="mt-4 space-y-2">
                          {[1, 2, 3].map((row) => (
                            <div key={row} className="h-4 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                          ))}
                        </div>
                      ) : (
                        <div className="mt-4 space-y-4 text-sm">
                          <div>
                            <div className="text-lg font-semibold text-neutral-900 dark:text-white">
                              {selectedChat?.channel === 'WHATSAPP'
                                ? (customerData?.companyName || customerData?.contactName || formatPhone(selectedChat.customerPhone))
                                : formatSessionHandle(selectedChat?.sessionId, 'chat')}
                            </div>
                            <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                              {selectedChat?.channel === 'WHATSAPP'
                                ? (customerData?.contactName && customerData?.companyName
                                  ? customerData.contactName
                                  : formatPhone(selectedChat.customerPhone, t.noPhoneAvailable))
                                : getChannelLabel(selectedChat?.channel, t)}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-3">
                            <div>
                              <div className="text-[11px] uppercase tracking-wide text-neutral-400">
                                {selectedChat?.channel === 'WHATSAPP' ? t.contact : t.session}
                              </div>
                              <div className="mt-1 text-neutral-700 dark:text-neutral-300">
                                {selectedChat?.channel === 'WHATSAPP'
                                  ? formatPhone(selectedChat.customerPhone, t.noPhoneAvailable)
                                  : formatSessionHandle(selectedChat.sessionId, 'chat')}
                              </div>
                            </div>

                            <div>
                              <div className="text-[11px] uppercase tracking-wide text-neutral-400">{t.assistant}</div>
                              <div className="mt-1 text-neutral-700 dark:text-neutral-300">{selectedChat.assistant?.name || '—'}</div>
                            </div>

                            <div>
                              <div className="text-[11px] uppercase tracking-wide text-neutral-400">{t.updatedAt}</div>
                              <div className="mt-1 text-neutral-700 dark:text-neutral-300">{formatDateTime(selectedChat.updatedAt, locale)}</div>
                            </div>
                          </div>

                          {selectedChat?.channel === 'WHATSAPP' ? (
                            <>
                              {Array.isArray(customerData?.tags) && customerData.tags.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {customerData.tags.slice(0, 4).map((tag) => (
                                    <Badge key={tag} variant="secondary">{tag}</Badge>
                                  ))}
                                </div>
                              )}

                              {customerData?.notes && (
                                <div className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                                  {customerData.notes}
                                </div>
                              )}

                              {!customerData && (
                                <div className="text-xs text-neutral-500 dark:text-neutral-400">{t.noCustomerDataShort}</div>
                              )}

                              <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
                                <div>
                                  <div className="text-sm font-medium text-neutral-900 dark:text-white">{t.recentSessions}</div>
                                  <div className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">{t.recentSessionsHint}</div>
                                </div>

                                <div className="mt-3 space-y-2">
                                  {(() => {
                                    const otherSessions = relatedSessions.filter((chat) => chat.id !== selectedChat?.id);

                                    if (relatedSessionsLoading) {
                                      return [1, 2, 3].map((row) => (
                                        <div key={row} className="h-14 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800" />
                                      ));
                                    }

                                    if (otherSessions.length === 0) {
                                      return (
                                        <div className="rounded-xl border border-dashed border-neutral-200 px-3 py-3 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                                          {t.noRecentSessions}
                                        </div>
                                      );
                                    }

                                    return otherSessions.map((chat) => (
                                      <button
                                        key={chat.id}
                                        type="button"
                                        onClick={() => setSelectedChatId(chat.id)}
                                        className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left transition hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-700"
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="truncate text-xs font-medium text-neutral-900 dark:text-white">
                                            {formatDateTime(chat.updatedAt || chat.createdAt, locale)}
                                          </div>
                                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${getCompactStatusClasses(chat)}`}>
                                            {getCompactStatusLabel(chat, t)}
                                          </span>
                                        </div>
                                        <div className="mt-1 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">
                                          {buildInboxPreview(chat.messages) || '—'}
                                        </div>
                                      </button>
                                    ));
                                  })()}
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                              {formatSessionHandle(selectedChat.sessionId, 'chat')}
                            </div>
                          )}
                        </div>
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
