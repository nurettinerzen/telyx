'use client';

import React, { useEffect, useState } from 'react';
import PageIntro from '@/components/PageIntro';
import EmptyState from '@/components/EmptyState';
import { getPageHelp } from '@/content/pageHelp';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Package,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useHepsiburadaStatus, useTrendyolStatus } from '@/hooks/useIntegrations';
import {
  useApproveMarketplaceQuestion,
  useEditMarketplaceQuestion,
  useMarketplaceQaSettings,
  useMarketplaceQaStats,
  useMarketplaceQuestions,
  useRejectMarketplaceQuestion,
  useSyncMarketplaceQuestions,
  useUpdateMarketplaceQaSettings,
} from '@/hooks/useMarketplaceQA';

function getMarketplaceQaCopy(locale) {
  const isTr = locale === 'tr';

  return {
    title: isTr ? 'Pazaryeri Q&A' : 'Marketplace Q&A',
    introSubtitle: isTr
      ? 'Soruları çekin, AI cevap taslakları üretin ve onaylayarak platforma gönderin.'
      : 'Pull questions, generate AI reply drafts, and send them after approval.',
    emptyTitle: isTr ? 'Aktif pazaryeri entegrasyonu bulunmuyor' : 'No active marketplace integration found',
    emptyDescription: isTr
      ? 'Bu ekranı kullanmak için önce Trendyol veya Hepsiburada entegrasyonunu aktifleştirin.'
      : 'Activate Trendyol or Hepsiburada integration first to use this screen.',
    goToIntegrations: isTr ? 'Entegrasyonlara Git' : 'Go to Integrations',
    stats: {
      todayQuestions: { title: isTr ? 'Bugünkü soru' : "Today's questions", hint: isTr ? 'Bugün oluşan toplam soru' : 'Total questions created today' },
      pendingQuestions: { title: isTr ? 'Onay bekleyen' : 'Pending approval', hint: isTr ? 'Gönderilmeyi bekleyen taslaklar' : 'Drafts waiting to be sent' },
      autoPostedQuestions: { title: isTr ? 'Otomatik gönderilen' : 'Auto-posted', hint: isTr ? 'AUTO mod ve env korumasıyla gönderilenler' : 'Posted by AUTO mode with env guard enabled' },
      rejectedQuestions: { title: isTr ? 'Reddedilen' : 'Rejected', hint: isTr ? 'Manuel reddedilen sorular' : 'Questions rejected manually' },
    },
    filters: {
      platform: isTr ? 'Platform' : 'Platform',
      status: isTr ? 'Durum' : 'Status',
      fromDate: isTr ? 'Başlangıç tarihi' : 'Start date',
      toDate: isTr ? 'Bitiş tarihi' : 'End date',
      search: isTr ? 'Arama' : 'Search',
      searchPlaceholder: isTr ? 'Ürün, müşteri veya soru metni' : 'Product, customer, or question text',
      all: isTr ? 'Tümü' : 'All',
      pending: isTr ? 'Bekleyen' : 'Pending',
      posted: isTr ? 'Gönderilen' : 'Posted',
      rejected: isTr ? 'Reddedilen' : 'Rejected',
      error: isTr ? 'Hata' : 'Error',
    },
    questionCard: {
      deadline: isTr ? 'Son tarih' : 'Deadline',
      productMissing: isTr ? 'Ürün bilgisi yok' : 'No product information',
      customerFallback: isTr ? 'Müşteri' : 'Customer',
      customerQuestion: isTr ? 'Müşteri sorusu' : 'Customer question',
      aiAnswer: isTr ? 'AI cevabı' : 'AI answer',
      noAnswerYet: isTr ? 'Henüz cevap üretilmedi' : 'No answer has been generated yet',
      approveAndSend: isTr ? 'Onayla ve Gönder' : 'Approve and Send',
      edit: isTr ? 'Düzenle' : 'Edit',
      reject: isTr ? 'Reddet' : 'Reject',
      activeConnection: isTr ? 'Bağlantı aktif' : 'Connection active',
    },
    settings: {
      connected: isTr ? 'Bağlı' : 'Connected',
      notConnected: isTr ? 'Bağlı değil' : 'Not connected',
      lastSync: isTr ? 'Son senkron' : 'Last sync',
      languageTurkish: isTr ? 'Türkçe' : 'Turkish',
      languageGerman: isTr ? 'Almanca' : 'German',
      autoSendTitle: isTr ? 'Otomatik gönderim' : 'Automatic posting',
      autoSendDescription: isTr
        ? 'Varsayılan akışta sorular yine panel onayından geçer. Env koruması açılırsa AUTO mod worker tarafında gönderim yapabilir.'
        : 'By default, questions still wait for panel approval. If the env guard is enabled, AUTO mode can post from the worker.',
      language: isTr ? 'Dil' : 'Language',
      tone: isTr ? 'Ton tercihi' : 'Tone preference',
      tonePlaceholder: isTr ? 'Nazik, kısa, iade koşullarını net vurgula...' : 'Polite, concise, and highlight return conditions clearly...',
      save: isTr ? 'Ayarları Kaydet' : 'Save Settings',
      saving: isTr ? 'Kaydediliyor' : 'Saving',
    },
    sync: {
      title: isTr ? 'Soru senkronu' : 'Question sync',
      description: isTr
        ? 'Bağlı pazaryeri hesaplarındaki yeni soruları şimdi çekin ve AI taslaklarını hazırlayın.'
        : 'Pull new questions from connected marketplaces now and prepare AI drafts.',
      action: isTr ? 'Senkronize Et' : 'Sync Now',
      syncing: isTr ? 'Senkronize ediliyor...' : 'Syncing...',
      neverSynced: isTr ? 'Henüz senkron yapılmadı' : 'No sync has run yet',
      lastSyncPrefix: isTr ? 'Son senkron' : 'Last sync',
    },
    states: {
      loading: isTr ? 'Sorular yükleniyor...' : 'Loading questions...',
      empty: isTr ? 'Henüz soru görünmüyor. Yeni soruları çekmek için senkron başlatabilirsiniz.' : 'No questions are visible yet. Run a sync to pull new marketplace questions.',
      page: isTr ? 'Sayfa' : 'Page',
      previous: isTr ? 'Önceki' : 'Previous',
      next: isTr ? 'Sonraki' : 'Next',
    },
    dialog: {
      title: isTr ? 'Cevabı düzenle' : 'Edit answer',
      description: isTr
        ? 'Düzenlenen cevap kaydedilir ve aynı adımda pazaryerine gönderilir.'
        : 'The edited answer is saved and sent to the marketplace in the same step.',
      cancel: isTr ? 'Vazgeç' : 'Cancel',
      saveAndSend: isTr ? 'Kaydet ve Gönder' : 'Save and Send',
      sending: isTr ? 'Gönderiliyor' : 'Sending',
      characterLimit: isTr ? 'karakter' : 'characters',
      limitWarning: isTr ? 'Cevap 2000 karakter sınırını aşıyor.' : 'The answer exceeds the 2000 character limit.',
    },
    toasts: {
      approveSuccess: isTr ? 'Cevap platforma gönderildi' : 'Answer sent to the platform',
      approveError: isTr ? 'Cevap gönderilemedi' : 'Failed to send the answer',
      editSuccess: isTr ? 'Düzenlenen cevap gönderildi' : 'Edited answer sent',
      editError: isTr ? 'Düzenlenen cevap gönderilemedi' : 'Failed to send the edited answer',
      rejectPromptTitle: isTr ? 'Reddetme nedeni' : 'Reason for rejection',
      rejectPromptDefault: isTr ? 'Soru bu aşamada yanıtlanmaya uygun değil.' : 'This question is not suitable to answer at this stage.',
      rejectSuccess: isTr ? 'Soru reddedildi' : 'Question rejected',
      rejectError: isTr ? 'Soru reddedilemedi' : 'Failed to reject the question',
      settingsSuccess: isTr ? 'Pazaryeri ayarları kaydedildi' : 'Marketplace settings saved',
      settingsError: isTr ? 'Ayarlar kaydedilemedi' : 'Failed to save settings',
      syncSuccess: isTr ? 'Pazaryeri soruları senkronize edildi' : 'Marketplace questions synced',
      syncError: isTr ? 'Pazaryeri soruları senkronize edilemedi' : 'Failed to sync marketplace questions',
    },
    statuses: {
      PENDING: isTr ? 'Onay bekliyor' : 'Pending approval',
      APPROVED: isTr ? 'Onaylandı' : 'Approved',
      POSTED: isTr ? 'Gönderildi' : 'Posted',
      REJECTED: isTr ? 'Reddedildi' : 'Rejected',
      EXPIRED: isTr ? 'Süresi doldu' : 'Expired',
      ERROR: isTr ? 'Hata' : 'Error',
    },
  };
}

function getStatusMeta(copy) {
  return {
    PENDING: { label: copy.statuses.PENDING, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
    APPROVED: { label: copy.statuses.APPROVED, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    POSTED: { label: copy.statuses.POSTED, className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
    REJECTED: { label: copy.statuses.REJECTED, className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
    EXPIRED: { label: copy.statuses.EXPIRED, className: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300' },
    ERROR: { label: copy.statuses.ERROR, className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
  };
}

function formatDate(value, locale) {
  if (!value) return '-';
  return new Date(value).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MarketplaceStatCard({ title, value, hint }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="text-sm text-neutral-500 dark:text-neutral-400">{title}</div>
      <div className="mt-2 text-3xl font-semibold text-neutral-900 dark:text-white">{value}</div>
      <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">{hint}</div>
    </div>
  );
}

function MarketplaceQuestionCard({ item, onApprove, onEdit, onReject, loading, copy, locale }) {
  const STATUS_META = getStatusMeta(copy);
  const statusMeta = STATUS_META[item.status] || STATUS_META.PENDING;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          <div className="h-16 w-16 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-900">
            {item.productImageUrl ? (
              <div
                aria-label={item.productName || copy.questionCard.productMissing}
                className="h-full w-full bg-cover bg-center"
                style={{ backgroundImage: `url(${item.productImageUrl})` }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-neutral-400 dark:text-neutral-500">
                <Package className="h-5 w-5" />
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={statusMeta.className}>{statusMeta.label}</Badge>
              <Badge variant="outline">{item.platform === 'TRENDYOL' ? 'Trendyol' : 'Hepsiburada'}</Badge>
              {item.expiresAt && (
                <span className="text-xs text-neutral-500 dark:text-neutral-400">{copy.questionCard.deadline}: {formatDate(item.expiresAt, locale)}</span>
              )}
            </div>

            <div>
              <div className="font-semibold text-neutral-900 dark:text-white">{item.productName || copy.questionCard.productMissing}</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                {item.customerName || copy.questionCard.customerFallback} • {formatDate(item.createdAt, locale)}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{copy.questionCard.customerQuestion}</div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-100">{item.questionText}</p>
            </div>

            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                <Sparkles className="h-3.5 w-3.5" />
                {copy.questionCard.aiAnswer}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-100">
                {item.finalAnswer || item.generatedAnswer || copy.questionCard.noAnswerYet}
              </p>
            </div>

            {item.errorMessage && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
                {item.errorMessage}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 lg:min-w-[240px] lg:flex-col">
          <Button
            onClick={() => onApprove(item)}
            disabled={loading || !item.generatedAnswer || item.status === 'POSTED' || item.status === 'EXPIRED'}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {copy.questionCard.approveAndSend}
          </Button>
          <Button
            variant="outline"
            onClick={() => onEdit(item)}
            disabled={loading || item.status === 'POSTED' || item.status === 'EXPIRED'}
          >
            {copy.questionCard.edit}
          </Button>
          <Button
            variant="outline"
            onClick={() => onReject(item)}
            disabled={loading || item.status === 'POSTED'}
          >
            <XCircle className="mr-2 h-4 w-4" />
            {copy.questionCard.reject}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function MarketplaceQaPage() {
  const { locale } = useLanguage();
  const copy = getMarketplaceQaCopy(locale);
  const pageHelp = getPageHelp('integrations', locale);
  const { data: trendyolStatus } = useTrendyolStatus();
  const { data: hepsiburadaStatus } = useHepsiburadaStatus();
  const hasConnectedIntegration = Boolean(trendyolStatus?.connected || hepsiburadaStatus?.connected);

  const [filters, setFilters] = useState({
    page: 1,
    limit: 20,
    platform: 'ALL',
    status: 'ALL',
    search: '',
    fromDate: '',
    toDate: '',
  });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [editedAnswer, setEditedAnswer] = useState('');
  const [settingsState, setSettingsState] = useState({});

  const questionsQuery = useMarketplaceQuestions(filters);
  const statsQuery = useMarketplaceQaStats();
  const settingsQuery = useMarketplaceQaSettings();
  const approveQuestion = useApproveMarketplaceQuestion();
  const editQuestion = useEditMarketplaceQuestion();
  const rejectQuestion = useRejectMarketplaceQuestion();
  const updateSettings = useUpdateMarketplaceQaSettings();
  const syncQuestions = useSyncMarketplaceQuestions();

  useEffect(() => {
    if (!settingsQuery.data?.settings) {
      return;
    }

    const nextState = {};
    for (const item of settingsQuery.data.settings) {
      nextState[item.platform] = {
        answerMode: item.qaSettings?.answerMode || 'MANUAL',
        language: item.qaSettings?.language || 'tr',
        toneInstructions: item.qaSettings?.toneInstructions || '',
      };
    }
    setSettingsState(nextState);
  }, [settingsQuery.data]);

  const items = questionsQuery.data?.items || [];
  const pagination = questionsQuery.data?.pagination || { page: 1, totalPages: 1 };
  const stats = statsQuery.data || {};
  const connectedSettings = settingsQuery.data?.settings || [];
  const latestSyncAt = connectedSettings
    .map((item) => item.lastSync)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

  const handleApprove = async (item) => {
    try {
      await approveQuestion.mutateAsync({
        id: item.id,
        answerText: item.finalAnswer || item.generatedAnswer,
      });
      toast.success(copy.toasts.approveSuccess);
    } catch (error) {
      toast.error(error.response?.data?.error || copy.toasts.approveError);
    }
  };

  const handleEditOpen = (item) => {
    setSelectedQuestion(item);
    setEditedAnswer(item.finalAnswer || item.generatedAnswer || '');
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!selectedQuestion) return;

    try {
      await editQuestion.mutateAsync({
        id: selectedQuestion.id,
        answerText: editedAnswer,
      });
      toast.success(copy.toasts.editSuccess);
      setEditDialogOpen(false);
      setSelectedQuestion(null);
      setEditedAnswer('');
    } catch (error) {
      toast.error(error.response?.data?.error || copy.toasts.editError);
    }
  };

  const handleReject = async (item) => {
    const rejectionReason = window.prompt(copy.toasts.rejectPromptTitle, copy.toasts.rejectPromptDefault);
    if (rejectionReason == null) return;

    try {
      await rejectQuestion.mutateAsync({ id: item.id, rejectionReason });
      toast.success(copy.toasts.rejectSuccess);
    } catch (error) {
      toast.error(error.response?.data?.error || copy.toasts.rejectError);
    }
  };

  const handleSettingsChange = (platform, patch) => {
    setSettingsState((prev) => ({
      ...prev,
      [platform]: {
        ...(prev[platform] || {}),
        ...patch,
      },
    }));
  };

  const handleSettingsSave = async (platform) => {
    try {
      await updateSettings.mutateAsync({
        platform,
        qaSettings: settingsState[platform],
      });
      toast.success(copy.toasts.settingsSuccess);
    } catch (error) {
      toast.error(error.response?.data?.error || copy.toasts.settingsError);
    }
  };

  const handleSync = async () => {
    try {
      const response = await syncQuestions.mutateAsync();
      const created = response.data?.result?.created || 0;
      const fetched = response.data?.result?.fetched || 0;
      toast.success(`${copy.toasts.syncSuccess}${fetched || created ? ` (${fetched} çekildi, ${created} yeni)` : ''}`);
    } catch (error) {
      toast.error(error.response?.data?.error || copy.toasts.syncError);
    }
  };

  if (!hasConnectedIntegration) {
    return (
      <div className="space-y-8">
        <PageIntro
          title={copy.title}
          subtitle={copy.introSubtitle}
          locale={locale}
          help={pageHelp ? { tooltipTitle: pageHelp.tooltipTitle, tooltipBody: pageHelp.tooltipBody, quickSteps: pageHelp.quickSteps } : undefined}
        />

        <EmptyState
          icon={ShoppingBag}
          title={copy.emptyTitle}
          description={copy.emptyDescription}
          actionLabel={copy.goToIntegrations}
          onAction={() => { window.location.href = '/dashboard/integrations'; }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageIntro
        title={copy.title}
        subtitle={copy.introSubtitle}
        locale={locale}
        help={pageHelp ? { tooltipTitle: pageHelp.tooltipTitle, tooltipBody: pageHelp.tooltipBody, quickSteps: pageHelp.quickSteps } : undefined}
      />

      <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-neutral-900 dark:text-white">{copy.sync.title}</div>
            <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {copy.sync.description}
            </div>
            <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              {latestSyncAt
                ? `${copy.sync.lastSyncPrefix}: ${formatDate(latestSyncAt, locale)}`
                : copy.sync.neverSynced}
            </div>
          </div>

          <Button onClick={handleSync} disabled={syncQuestions.isPending}>
            {syncQuestions.isPending ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                {copy.sync.syncing}
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                {copy.sync.action}
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MarketplaceStatCard title={copy.stats.todayQuestions.title} value={stats.todayQuestions || 0} hint={copy.stats.todayQuestions.hint} />
        <MarketplaceStatCard title={copy.stats.pendingQuestions.title} value={stats.pendingQuestions || 0} hint={copy.stats.pendingQuestions.hint} />
        <MarketplaceStatCard title={copy.stats.autoPostedQuestions.title} value={stats.autoPostedQuestions || 0} hint={copy.stats.autoPostedQuestions.hint} />
        <MarketplaceStatCard title={copy.stats.rejectedQuestions.title} value={stats.rejectedQuestions || 0} hint={copy.stats.rejectedQuestions.hint} />
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-2">
            <Label>{copy.filters.platform}</Label>
            <Select value={filters.platform} onValueChange={(value) => setFilters((prev) => ({ ...prev, platform: value, page: 1 }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{copy.filters.all}</SelectItem>
                <SelectItem value="TRENDYOL">Trendyol</SelectItem>
                <SelectItem value="HEPSIBURADA">Hepsiburada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{copy.filters.status}</Label>
            <Select value={filters.status} onValueChange={(value) => setFilters((prev) => ({ ...prev, status: value, page: 1 }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{copy.filters.all}</SelectItem>
                <SelectItem value="PENDING">{copy.filters.pending}</SelectItem>
                <SelectItem value="POSTED">{copy.filters.posted}</SelectItem>
                <SelectItem value="REJECTED">{copy.filters.rejected}</SelectItem>
                <SelectItem value="ERROR">{copy.filters.error}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{copy.filters.fromDate}</Label>
            <Input type="date" value={filters.fromDate} onChange={(event) => setFilters((prev) => ({ ...prev, fromDate: event.target.value, page: 1 }))} />
          </div>

          <div className="space-y-2">
            <Label>{copy.filters.toDate}</Label>
            <Input type="date" value={filters.toDate} onChange={(event) => setFilters((prev) => ({ ...prev, toDate: event.target.value, page: 1 }))} />
          </div>

          <div className="space-y-2">
            <Label>{copy.filters.search}</Label>
            <Input
              placeholder={copy.filters.searchPlaceholder}
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value, page: 1 }))}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {(settingsQuery.data?.settings || []).map((item) => {
          const platformState = settingsState[item.platform] || { answerMode: 'MANUAL', language: 'tr', toneInstructions: '' };
          return (
            <div key={item.platform} className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold text-neutral-900 dark:text-white">
                    {item.platform === 'TRENDYOL' ? 'Trendyol' : 'Hepsiburada'}
                  </div>
                  <div className="text-sm text-neutral-500 dark:text-neutral-400">
                    {item.connected ? copy.settings.connected : copy.settings.notConnected} • {copy.settings.lastSync}: {formatDate(item.lastSync, locale)}
                  </div>
                </div>
                <Badge variant="outline">{item.platform}</Badge>
              </div>

              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800">
                  <div>
                    <div className="font-medium text-neutral-900 dark:text-white">{copy.settings.autoSendTitle}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                      {copy.settings.autoSendDescription}
                    </div>
                  </div>
                  <Switch
                    checked={platformState.answerMode === 'AUTO'}
                    onCheckedChange={(checked) => handleSettingsChange(item.platform, { answerMode: checked ? 'AUTO' : 'MANUAL' })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{copy.settings.language}</Label>
                  <Select value={platformState.language} onValueChange={(value) => handleSettingsChange(item.platform, { language: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tr">{copy.settings.languageTurkish}</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="de">{copy.settings.languageGerman}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{copy.settings.tone}</Label>
                  <Textarea
                    rows={3}
                    placeholder={copy.settings.tonePlaceholder}
                    value={platformState.toneInstructions}
                    onChange={(event) => handleSettingsChange(item.platform, { toneInstructions: event.target.value })}
                  />
                </div>

                <Button
                  variant="outline"
                  onClick={() => handleSettingsSave(item.platform)}
                  disabled={updateSettings.isPending}
                >
                  {updateSettings.isPending ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />{copy.settings.saving}</> : copy.settings.save}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-4">
        {questionsQuery.isLoading ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-8 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
            {copy.states.loading}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
            <p>{copy.states.empty}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={handleSync}
              disabled={syncQuestions.isPending}
            >
              {syncQuestions.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  {copy.sync.syncing}
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {copy.sync.action}
                </>
              )}
            </Button>
          </div>
        ) : (
          items.map((item) => (
            <MarketplaceQuestionCard
              key={item.id}
              item={item}
              onApprove={handleApprove}
              onEdit={handleEditOpen}
              onReject={handleReject}
              loading={approveQuestion.isPending || editQuestion.isPending || rejectQuestion.isPending}
              copy={copy}
              locale={locale}
            />
          ))
        )}
      </div>

      <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-5 py-4 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="text-sm text-neutral-500 dark:text-neutral-400">
          {copy.states.page} {pagination.page} / {pagination.totalPages}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setFilters((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
            disabled={filters.page <= 1}
          >
            {copy.states.previous}
          </Button>
          <Button
            variant="outline"
            onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
            disabled={pagination.page >= pagination.totalPages}
          >
            {copy.states.next}
          </Button>
        </div>
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{copy.dialog.title}</DialogTitle>
            <DialogDescription>
              {copy.dialog.description}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea rows={8} value={editedAnswer} onChange={(event) => setEditedAnswer(event.target.value)} />
            <div className="text-right text-xs text-neutral-500 dark:text-neutral-400">
              {editedAnswer.length} / 2000 {copy.dialog.characterLimit}
            </div>
            {editedAnswer.length > 2000 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertCircle className="mr-2 inline h-4 w-4" />
                {copy.dialog.limitWarning}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>{copy.dialog.cancel}</Button>
            <Button onClick={handleEditSave} disabled={editQuestion.isPending || editedAnswer.length < 10 || editedAnswer.length > 2000}>
              {editQuestion.isPending ? <><Clock3 className="mr-2 h-4 w-4 animate-spin" />{copy.dialog.sending}</> : copy.dialog.saveAndSend}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
