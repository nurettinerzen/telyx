/**
 * Chat History Page
 * View chat and WhatsApp conversation history
 */

'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import EmptyState from '@/components/EmptyState';
import { GradientLoaderInline } from '@/components/GradientLoader';
import {
  MessageSquare,
  Search,
  Download,
  Filter,
  MessageCircle,
  Eye,
  User,
  Bot,
  Hash,
  Headphones,
  RefreshCw,
  Send,
  Sparkles
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { DateRangePicker } from '@/components/ui/date-range-picker';

// Simple cache for chats data
const chatsCache = {
  data: null,
  timestamp: null,
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes

  isValid() {
    return this.data && this.timestamp && (Date.now() - this.timestamp < this.CACHE_DURATION);
  },

  set(data) {
    this.data = data;
    this.timestamp = Date.now();
  },

  get() {
    return this.data;
  },

  clear() {
    this.data = null;
    this.timestamp = null;
  }
};

// Generate page numbers with ellipsis for pagination
function generatePageNumbers(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = [1];
  if (currentPage > 3) pages.push('...');
  for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
    pages.push(i);
  }
  if (currentPage < totalPages - 2) pages.push('...');
  pages.push(totalPages);
  return pages;
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

export default function ChatsPage() {
  const { t, locale } = useLanguage();
  const searchParams = useSearchParams();
  const whatsappLiveHandoffEnabled = process.env.NEXT_PUBLIC_WHATSAPP_LIVE_HANDOFF_V2 === 'true';
  const chatLiveHandoffEnabled = process.env.NEXT_PUBLIC_CHAT_LIVE_HANDOFF_V1 === 'true';
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ from: undefined, to: undefined });
  const [selectedChat, setSelectedChat] = useState(null);
  const [showChatModal, setShowChatModal] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [liveReply, setLiveReply] = useState('');
  const [handoffAction, setHandoffAction] = useState(null);
  const requestedChatId = searchParams.get('chatId');
  const requestedChatIdHandledRef = useRef(null);

  const handoffPriority = (chat) => {
    const mode = chat?.handoff?.mode;
    if (mode === 'REQUESTED') return 0;
    if (mode === 'ACTIVE') return 1;
    return 2;
  };

  const sortedChats = useMemo(() => {
    return [...chats].sort((left, right) => {
      const priorityDiff = handoffPriority(left) - handoffPriority(right);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(right.updatedAt || right.createdAt) - new Date(left.updatedAt || left.createdAt);
    });
  }, [chats]);

  const inboxChats = useMemo(() => {
    const latestActiveWhatsAppByPhone = new Map();

    for (const chat of chats) {
      if (chat?.channel !== 'WHATSAPP' || chat?.status !== 'active' || !chat?.customerPhone) {
        continue;
      }

      const existing = latestActiveWhatsAppByPhone.get(chat.customerPhone);
      const chatTimestamp = new Date(chat.updatedAt || chat.createdAt || 0).getTime();
      const existingTimestamp = existing ? new Date(existing.updatedAt || existing.createdAt || 0).getTime() : -1;

      if (!existing || chatTimestamp > existingTimestamp) {
        latestActiveWhatsAppByPhone.set(chat.customerPhone, chat);
      }
    }

    return sortedChats.filter((chat) => {
      if (chat?.channel !== 'WHATSAPP' || chat?.status !== 'active' || !chat?.customerPhone) {
        return true;
      }

      return latestActiveWhatsAppByPhone.get(chat.customerPhone)?.id === chat.id;
    });
  }, [chats, sortedChats]);

  const pendingLiveHandoffs = useMemo(() => {
    return inboxChats.filter((chat) => (
      chat?.status === 'active' &&
      chat?.handoff?.mode === 'REQUESTED' &&
      (
        (chat?.channel === 'WHATSAPP' && whatsappLiveHandoffEnabled) ||
        (chat?.channel === 'CHAT' && chatLiveHandoffEnabled)
      )
    ));
  }, [chatLiveHandoffEnabled, inboxChats, whatsappLiveHandoffEnabled]);

  const loadChatDetails = async (chatId, { openModal = false, silent = false } = {}) => {
    try {
      const response = await apiClient.get(`/api/chat-logs/${chatId}`);
      setSelectedChat(response.data);
      if (openModal) {
        setShowChatModal(true);
      }
    } catch (error) {
      if (!silent) {
        toast.error(t('dashboard.chatsPage.failedToLoadChat'));
      }
    }
  };

  // Initial load with cache
  useEffect(() => {
    const loadInitial = async () => {
      // Check cache first
      if (chatsCache.isValid()) {
        setChats(chatsCache.get());
        setLoading(false);
        setIsInitialLoad(false);
        // Background refresh
        refreshChats(true);
        return;
      }

      // No cache, load fresh
      await loadChats();
      setIsInitialLoad(false);
    };

    loadInitial();
  }, []);

  // Reload when filters change
  useEffect(() => {
    if (!isInitialLoad) {
      loadChats();
    }
  }, [pagination.page, channelFilter, statusFilter, dateRange]);

  // Debounced search
  useEffect(() => {
    if (isInitialLoad) return;

    const timer = setTimeout(() => {
      setPagination(prev => ({ ...prev, page: 1 }));
      loadChats();
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Real-time polling for new chats (every 30 seconds)
  useEffect(() => {
    if (isInitialLoad) return;

    const pollInterval = setInterval(() => {
      // Only poll if page is visible and no filters active
      if (document.visibilityState === 'visible' && statusFilter === 'all' && channelFilter === 'all' && !searchQuery && !dateRange.from) {
        refreshChats(true); // Silent refresh
      }
    }, 30000); // 30 seconds

    return () => clearInterval(pollInterval);
  }, [isInitialLoad, statusFilter, channelFilter, searchQuery, dateRange]);

  useEffect(() => {
    const liveHandoffChannel = (
      (selectedChat?.channel === 'WHATSAPP' && whatsappLiveHandoffEnabled) ||
      (selectedChat?.channel === 'CHAT' && chatLiveHandoffEnabled)
    );

    if (!showChatModal || !selectedChat?.id || selectedChat?.status !== 'active' || !liveHandoffChannel) {
      return undefined;
    }

    const interval = setInterval(() => {
      loadChatDetails(selectedChat.id, { silent: true });
    }, 5000);

    return () => clearInterval(interval);
  }, [chatLiveHandoffEnabled, selectedChat?.channel, selectedChat?.id, selectedChat?.status, showChatModal, whatsappLiveHandoffEnabled]);

  useEffect(() => {
    if (!requestedChatId) {
      requestedChatIdHandledRef.current = null;
      return;
    }

    if (!requestedChatId || loading || isInitialLoad) {
      return;
    }

    if (requestedChatIdHandledRef.current === requestedChatId) {
      return;
    }

    requestedChatIdHandledRef.current = requestedChatId;
    loadChatDetails(requestedChatId, { openModal: true, silent: true });
  }, [requestedChatId, loading, isInitialLoad, selectedChat?.id, showChatModal]);

  const loadChats = async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit
      };

      // All filters sent to backend (server-side filtering)
      if (statusFilter !== 'all') params.status = statusFilter;
      if (channelFilter !== 'all') params.channel = channelFilter;
      if (searchQuery) params.search = searchQuery;
      if (dateRange.from) params.startDate = dateRange.from.toISOString();
      if (dateRange.to) params.endDate = dateRange.to.toISOString();

      const response = await apiClient.get('/api/chat-logs', { params });
      const chatLogs = response.data.chatLogs || [];

      setChats(chatLogs);
      setPagination(prev => ({
        ...prev,
        total: response.data.pagination?.total || 0,
        totalPages: response.data.pagination?.totalPages || 0
      }));

      // Only cache if no filters active
      if (statusFilter === 'all' && channelFilter === 'all' && !searchQuery && !dateRange.from) {
        chatsCache.set(chatLogs);
      }
    } catch (error) {
      toast.error(t('dashboard.chatsPage.failedToLoadChats'));
    } finally {
      setLoading(false);
    }
  };

  const refreshChats = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await apiClient.get('/api/chat-logs', { params: { page: 1, limit: 20 } });
      const chatLogs = response.data.chatLogs || [];
      setChats(chatLogs);
      chatsCache.set(chatLogs);
    } catch (error) {
      if (!silent) toast.error(t('dashboard.chatsPage.failedToLoadChats'));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleViewChat = async (chatId) => {
    await loadChatDetails(chatId, { openModal: true });
  };

  const refreshConversationViews = async (chatId = null) => {
    await loadChats();
    if (chatId) {
      await loadChatDetails(chatId, { silent: true });
    }
  };

  const handleClaimConversation = async () => {
    if (!selectedChat?.id) return;

    setHandoffAction('claim');
    try {
      await apiClient.post(`/api/chat-logs/${selectedChat.id}/handoff/claim`, {});
      toast.success(t('dashboard.chatsPage.liveHandoffClaimed'));
      await refreshConversationViews(selectedChat.id);
    } catch (error) {
      toast.error(error.response?.data?.error || t('dashboard.chatsPage.failedToClaimLiveHandoff'));
    } finally {
      setHandoffAction(null);
    }
  };

  const handleReturnToAi = async () => {
    if (!selectedChat?.id) return;

    setHandoffAction('release');
    try {
      await apiClient.post(`/api/chat-logs/${selectedChat.id}/handoff/release`, {});
      toast.success(t('dashboard.chatsPage.liveHandoffReturnedToAi'));
      await refreshConversationViews(selectedChat.id);
    } catch (error) {
      toast.error(error.response?.data?.error || t('dashboard.chatsPage.failedToReturnToAi'));
    } finally {
      setHandoffAction(null);
    }
  };

  const handleSendLiveReply = async () => {
    if (!selectedChat?.id || !liveReply.trim()) return;

    setHandoffAction('reply');
    try {
      const response = await apiClient.post(`/api/chat-logs/${selectedChat.id}/handoff/reply`, {
        message: liveReply.trim(),
      });
      setSelectedChat(response.data.chatLog);
      setLiveReply('');
      toast.success(t('dashboard.chatsPage.liveReplySent'));
      await loadChats();
    } catch (error) {
      toast.error(error.response?.data?.error || t('dashboard.chatsPage.failedToSendLiveReply'));
    } finally {
      setHandoffAction(null);
    }
  };

  const handleExport = async () => {
    try {
      // Simple CSV export
      const csvContent = [
        [t('dashboard.chatsPage.date'), t('dashboard.chatsPage.channel'), t('dashboard.chatsPage.messages'), t('dashboard.chatsPage.status')].join(','),
        ...chats.map(chat => [
          new Date(chat.createdAt).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-US'),
          chat.channel === 'CHAT' ? t('dashboard.chatsPage.chat') : 'WhatsApp',
          chat.messageCount,
          chat.status === 'active' ? t('dashboard.chatsPage.active') : (chat.status === 'completed' || chat.status === 'ended') ? t('dashboard.chatsPage.completed') : chat.status
        ].join(','))
      ].join('\n');

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `chat-history-${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(t('dashboard.chatsPage.chatsExportedSuccess'));
    } catch (error) {
      toast.error(t('dashboard.chatsPage.failedToExportChats'));
    }
  };

  // Channel badge
  const getChannelBadge = (channel) => {
    if (channel === 'WHATSAPP') {
      return (
        <Badge variant="ghost" className="text-green-700 dark:text-green-400 text-xs">
          <MessageSquare className="h-3 w-3 mr-1" />
          WhatsApp
        </Badge>
      );
    }
    return (
      <Badge variant="ghost" className="text-blue-700 dark:text-blue-400 text-xs">
        <MessageCircle className="h-3 w-3 mr-1" />
        {t('dashboard.chatsPage.chat')}
      </Badge>
    );
  };

  // Status indicator
  const getStatusIndicator = (status) => {
    const statusConfig = {
      active: { color: 'bg-blue-500', label: t('dashboard.chatsPage.active') },
      completed: { color: 'bg-green-500', label: t('dashboard.chatsPage.completed') },
      ended: { color: 'bg-green-500', label: t('dashboard.chatsPage.ended') },
    };

    const config = statusConfig[status] || { color: 'bg-gray-400', label: t('dashboard.chatsPage.unknown') };

    return (
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${config.color}`} />
        <span className="text-sm text-gray-700 dark:text-gray-300">{config.label}</span>
      </div>
    );
  };

  const getHandoffBadge = (handoff, status = 'active') => {
    if (status !== 'active') {
      return (
        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
          {t('dashboard.chatsPage.completed')}
        </Badge>
      );
    }

    const mode = handoff?.mode || 'AI';

    if (mode === 'REQUESTED') {
      return (
        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300">
          <Headphones className="mr-1 h-3 w-3" />
          {t('dashboard.chatsPage.liveHandoffRequested')}
        </Badge>
      );
    }

    if (mode === 'ACTIVE') {
      return (
        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-300">
          <Headphones className="mr-1 h-3 w-3" />
          {handoff?.assignedUserName
            ? t('dashboard.chatsPage.liveHandoffActiveWithName', { name: handoff.assignedUserName })
            : t('dashboard.chatsPage.liveHandoffActive')}
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
        <Sparkles className="mr-1 h-3 w-3" />
        {t('dashboard.chatsPage.aiHandlingConversation')}
      </Badge>
    );
  };

  // Format date
  const formatChatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getMessagePresentation = (message = {}) => {
    if (message.role === 'user') {
      return {
        wrapperClass: 'bg-blue-50 dark:bg-blue-900/20',
        avatarClass: 'bg-blue-100 dark:bg-blue-800',
        icon: <User className="h-3 w-3 text-blue-600 dark:text-blue-400" />,
        label: t('dashboard.chatsPage.customerLabel'),
      };
    }

    if (message.role === 'human_agent') {
      return {
        wrapperClass: 'bg-emerald-50 dark:bg-emerald-900/20',
        avatarClass: 'bg-emerald-100 dark:bg-emerald-800',
        icon: <Headphones className="h-3 w-3 text-emerald-600 dark:text-emerald-300" />,
        label: message?.metadata?.actorName || t('dashboard.chatsPage.liveAgentLabel'),
      };
    }

    if (message.role === 'system') {
      return {
        wrapperClass: 'bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20',
        avatarClass: 'bg-amber-100 dark:bg-amber-800',
        icon: <RefreshCw className="h-3 w-3 text-amber-700 dark:text-amber-300" />,
        label: t('dashboard.chatsPage.systemLabel'),
      };
    }

    return {
      wrapperClass: 'bg-gray-50 dark:bg-gray-800',
      avatarClass: 'bg-gray-200 dark:bg-gray-700',
      icon: <Bot className="h-3 w-3 text-gray-600 dark:text-gray-400" />,
      label: t('dashboard.chatsPage.aiAssistantLabel'),
    };
  };

  if (loading && isInitialLoad) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {t('dashboard.chatsPage.title')}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {t('dashboard.chatsPage.description')}
            </p>
          </div>
        </div>
        <GradientLoaderInline text={t('dashboard.chatsPage.loadingChats')} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {t('dashboard.chatsPage.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('dashboard.chatsPage.description')}
          </p>
        </div>
        <Button onClick={handleExport} variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          {t('dashboard.chatsPage.exportCSV')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder={t('dashboard.chatsPage.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={channelFilter} onValueChange={(val) => { setChannelFilter(val); setPagination(prev => ({ ...prev, page: 1 })); }}>
          <SelectTrigger className="w-full sm:w-44">
            <Filter className="h-4 w-4 mr-2 text-gray-400" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('dashboard.chatsPage.allChannels')}</SelectItem>
            <SelectItem value="CHAT">{t('dashboard.chatsPage.chat')}</SelectItem>
            <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPagination(prev => ({ ...prev, page: 1 })); }}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('dashboard.chatsPage.allStatus')}</SelectItem>
            <SelectItem value="active">{t('dashboard.chatsPage.active')}</SelectItem>
            <SelectItem value="completed">{t('dashboard.chatsPage.completed')}</SelectItem>
          </SelectContent>
        </Select>
        <DateRangePicker
          dateRange={dateRange}
          onDateRangeChange={(range) => {
            setDateRange(range || { from: undefined, to: undefined });
            setPagination(prev => ({ ...prev, page: 1 }));
          }}
          locale={locale}
          className="w-full sm:w-auto"
        />
      </div>

      {pendingLiveHandoffs.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
                <Headphones className="h-4 w-4" />
                {t('dashboard.chatsPage.pendingLiveHandoffsTitle', { count: pendingLiveHandoffs.length })}
              </div>
              <p className="mt-1 text-sm text-amber-800/80 dark:text-amber-200/80">
                {t('dashboard.chatsPage.pendingLiveHandoffsDescription')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {pendingLiveHandoffs.slice(0, 4).map((chat) => (
                <Button
                  key={chat.id}
                  variant="outline"
                  size="sm"
                  className="border-amber-200 bg-white/80 text-amber-800 hover:bg-white dark:border-amber-900/40 dark:bg-transparent dark:text-amber-200"
                  onClick={() => handleViewChat(chat.id)}
                >
                  {formatPhone(chat.customerPhone, chat.sessionId.slice(0, 8))}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="bg-white dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-800 p-6">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            ))}
          </div>
        </div>
      ) : chats.length > 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-800 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('dashboard.chatsPage.date')}</TableHead>
                <TableHead>{t('dashboard.chatsPage.channel')}</TableHead>
                <TableHead>{t('dashboard.chatsPage.messages')}</TableHead>
                <TableHead>{t('dashboard.chatsPage.status')}</TableHead>
                <TableHead className="text-right">{t('dashboard.chatsPage.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inboxChats.map((chat) => (
                <TableRow key={chat.id}>
                  <TableCell>
                    <span className="text-sm text-gray-900 dark:text-white">
                      {formatChatDate(chat.createdAt)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {getChannelBadge(chat.channel)}
                      {chat.channel === 'WHATSAPP' && hasMeaningfulPhone(chat.customerPhone) && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">{formatPhone(chat.customerPhone)}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1">
                      <Hash className="h-3 w-3 text-gray-400" />
                      {chat.messageCount || 0}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      {getStatusIndicator(chat.status)}
                      {getHandoffBadge(chat.handoff, chat.status)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewChat(chat.id)}
                      className="h-8 w-8 p-0"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-800">
              <span className="text-sm text-gray-500">
                {t('dashboard.chatsPage.showingResults', {
                  from: (pagination.page - 1) * pagination.limit + 1,
                  to: Math.min(pagination.page * pagination.limit, pagination.total),
                  total: pagination.total
                })}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                >
                  {t('dashboard.chatsPage.previous')}
                </Button>
                {generatePageNumbers(pagination.page, pagination.totalPages).map((pageNum, idx) => (
                  pageNum === '...' ? (
                    <span key={`dots-${idx}`} className="px-2 text-sm text-gray-400">...</span>
                  ) : (
                    <Button
                      key={pageNum}
                      variant={pageNum === pagination.page ? 'default' : 'outline'}
                      size="sm"
                      className="w-8 h-8 p-0"
                      onClick={() => setPagination(prev => ({ ...prev, page: pageNum }))}
                    >
                      {pageNum}
                    </Button>
                  )
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                >
                  {t('dashboard.chatsPage.next')}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-800 p-8">
          <EmptyState
            icon={MessageCircle}
            title={searchQuery || channelFilter !== 'all' || statusFilter !== 'all' || dateRange.from
              ? t('dashboard.chatsPage.noChatsFound')
              : t('dashboard.chatsPage.noChatsYet')}
            description={searchQuery || channelFilter !== 'all' || statusFilter !== 'all' || dateRange.from
              ? t('dashboard.chatsPage.tryAdjustingFilters')
              : t('dashboard.chatsPage.chatsWillAppear')}
          />
        </div>
      )}

      {/* Chat Detail Modal */}
      <Dialog open={showChatModal} onOpenChange={setShowChatModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedChat?.channel === 'WHATSAPP' ? (
                <MessageSquare className="h-5 w-5 text-green-600" />
              ) : (
                <MessageCircle className="h-5 w-5 text-blue-600" />
              )}
              {t('dashboard.chatsPage.chatDetails')}
            </DialogTitle>
          </DialogHeader>

          {selectedChat && (
            <div className="space-y-4">
              {/* Chat Info */}
              <div className="grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4 text-sm dark:bg-gray-800">
                <div>
                  <span className="text-gray-500">{t('dashboard.chatsPage.channel')}</span>
                  <p className="font-medium">{selectedChat.channel === 'CHAT' ? t('dashboard.chatsPage.chat') : 'WhatsApp'}</p>
                </div>
                <div>
                  <span className="text-gray-500">{t('dashboard.chatsPage.date')}</span>
                  <p className="font-medium">{formatChatDate(selectedChat.createdAt)}</p>
                </div>
                <div>
                  <span className="text-gray-500">{t('dashboard.chatsPage.assistant')}</span>
                  <p className="font-medium">{selectedChat.assistant?.name || '-'}</p>
                </div>
                {((selectedChat.channel === 'WHATSAPP' && whatsappLiveHandoffEnabled) || (selectedChat.channel === 'CHAT' && chatLiveHandoffEnabled)) && (
                  <div>
                    <span className="text-gray-500">{t('dashboard.callbacksPage.customer')}</span>
                    <p className="font-medium">
                      {selectedChat.channel === 'WHATSAPP'
                        ? formatPhone(selectedChat.customerPhone)
                        : selectedChat.sessionId}
                    </p>
                  </div>
                )}
                {((selectedChat.channel === 'WHATSAPP' && whatsappLiveHandoffEnabled) || (selectedChat.channel === 'CHAT' && chatLiveHandoffEnabled)) && (
                  <div className="col-span-2">
                    <span className="text-gray-500">{t('dashboard.chatsPage.liveMode')}</span>
                    <div className="mt-2">{getHandoffBadge(selectedChat.handoff, selectedChat.status)}</div>
                  </div>
                )}
              </div>

              {((selectedChat.channel === 'WHATSAPP' && whatsappLiveHandoffEnabled) || (selectedChat.channel === 'CHAT' && chatLiveHandoffEnabled)) && (
                <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white">
                        {t('dashboard.chatsPage.liveHandoffPanelTitle')}
                      </h4>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {selectedChat.status !== 'active'
                          ? t('dashboard.chatsPage.completed')
                          : selectedChat.handoff?.mode === 'REQUESTED'
                          ? t('dashboard.chatsPage.liveHandoffWaitingDescription')
                          : selectedChat.handoff?.mode === 'ACTIVE'
                            ? (selectedChat.handoff?.currentUserIsAssignee
                              ? t('dashboard.chatsPage.liveHandoffClaimedByYou')
                              : t('dashboard.chatsPage.liveHandoffClaimedByOther', { name: selectedChat.handoff?.assignedUserName || t('dashboard.chatsPage.anotherTeammate') }))
                            : t('dashboard.chatsPage.liveHandoffAiDescription')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedChat.status === 'active' && selectedChat.handoff?.canClaim && (
                        <Button
                          size="sm"
                          onClick={handleClaimConversation}
                          disabled={handoffAction === 'claim'}
                        >
                          {handoffAction === 'claim' ? (
                            <>
                              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                              {t('dashboard.chatsPage.claiming')}
                            </>
                          ) : (
                            <>
                              <Headphones className="mr-2 h-4 w-4" />
                              {selectedChat.handoff?.mode === 'AI'
                                ? t('dashboard.chatsPage.takeOverConversation')
                                : t('dashboard.chatsPage.claimConversation')}
                            </>
                          )}
                        </Button>
                      )}

                      {selectedChat.status === 'active' && selectedChat.handoff?.canReturnToAi && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleReturnToAi}
                          disabled={handoffAction === 'release'}
                        >
                          {handoffAction === 'release' ? (
                            <>
                              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                              {t('dashboard.chatsPage.returningToAi')}
                            </>
                          ) : (
                            <>
                              <Sparkles className="mr-2 h-4 w-4" />
                              {t('dashboard.chatsPage.returnToAi')}
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  {selectedChat.status === 'active' && selectedChat.handoff?.canReply && (
                    <div className="mt-4 space-y-3">
                      <Textarea
                        value={liveReply}
                        onChange={(event) => setLiveReply(event.target.value)}
                        placeholder={t('dashboard.chatsPage.liveReplyPlaceholder')}
                        rows={4}
                      />
                      <div className="flex justify-end">
                        <Button onClick={handleSendLiveReply} disabled={!liveReply.trim() || handoffAction === 'reply'}>
                          {handoffAction === 'reply' ? (
                            <>
                              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                              {t('dashboard.chatsPage.sendingLiveReply')}
                            </>
                          ) : (
                            <>
                              <Send className="mr-2 h-4 w-4" />
                              {t('dashboard.chatsPage.sendLiveReply')}
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Messages */}
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900 dark:text-white">
                  {t('dashboard.chatsPage.messages')} ({selectedChat.messageCount || 0})
                </h4>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {selectedChat.messages && Array.isArray(selectedChat.messages) ? (
                    selectedChat.messages.map((msg, index) => (
                      (() => {
                        const presentation = getMessagePresentation(msg);
                        return (
                          <div
                            key={index}
                            className={`flex gap-2 rounded-lg p-3 ${presentation.wrapperClass}`}
                          >
                            <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${presentation.avatarClass}`}>
                              {presentation.icon}
                            </div>
                            <div className="flex-1">
                              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                {presentation.label}
                              </div>
                              <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-white">
                                {msg.content}
                              </p>
                              {msg.timestamp && (
                                <span className="mt-1 block text-xs text-gray-400">
                                  {new Date(msg.timestamp).toLocaleTimeString(locale === 'tr' ? 'tr-TR' : 'en-US')}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()
                    ))
                  ) : (
                    <p className="text-gray-500 text-sm">
                      {t('dashboard.chatsPage.noMessagesFound')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
