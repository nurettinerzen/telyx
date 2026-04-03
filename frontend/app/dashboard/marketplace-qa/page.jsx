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
  useUpdateMarketplaceQaSettings,
} from '@/hooks/useMarketplaceQA';

const STATUS_META = {
  PENDING: { label: 'Onay bekliyor', className: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'Onaylandi', className: 'bg-blue-100 text-blue-700' },
  POSTED: { label: 'Gonderildi', className: 'bg-green-100 text-green-700' },
  REJECTED: { label: 'Reddedildi', className: 'bg-red-100 text-red-700' },
  EXPIRED: { label: 'Suresi doldu', className: 'bg-neutral-200 text-neutral-700' },
  ERROR: { label: 'Hata', className: 'bg-rose-100 text-rose-700' },
};

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MarketplaceStatCard({ title, value, hint }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="text-sm text-neutral-500">{title}</div>
      <div className="mt-2 text-3xl font-semibold text-neutral-900">{value}</div>
      <div className="mt-2 text-xs text-neutral-500">{hint}</div>
    </div>
  );
}

function MarketplaceQuestionCard({ item, onApprove, onEdit, onReject, loading }) {
  const statusMeta = STATUS_META[item.status] || STATUS_META.PENDING;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          <div className="h-16 w-16 overflow-hidden rounded-lg bg-neutral-100">
            {item.productImageUrl ? (
              <div
                aria-label={item.productName || 'Urun'}
                className="h-full w-full bg-cover bg-center"
                style={{ backgroundImage: `url(${item.productImageUrl})` }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-neutral-400">
                <Package className="h-5 w-5" />
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={statusMeta.className}>{statusMeta.label}</Badge>
              <Badge variant="outline">{item.platform === 'TRENDYOL' ? 'Trendyol' : 'Hepsiburada'}</Badge>
              {item.expiresAt && (
                <span className="text-xs text-neutral-500">Son tarih: {formatDate(item.expiresAt)}</span>
              )}
            </div>

            <div>
              <div className="font-semibold text-neutral-900">{item.productName || 'Urun bilgisi yok'}</div>
              <div className="text-xs text-neutral-500">
                {item.customerName || 'Musteri'} • {formatDate(item.createdAt)}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">Musteri sorusu</div>
              <p className="mt-1 text-sm text-neutral-800 whitespace-pre-wrap">{item.questionText}</p>
            </div>

            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                <Sparkles className="h-3.5 w-3.5" />
                AI cevabi
              </div>
              <p className="mt-1 text-sm text-neutral-800 whitespace-pre-wrap">
                {item.finalAnswer || item.generatedAnswer || 'Henuz cevap uretilmedi'}
              </p>
            </div>

            {item.errorMessage && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
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
            Onayla ve Gonder
          </Button>
          <Button
            variant="outline"
            onClick={() => onEdit(item)}
            disabled={loading || item.status === 'POSTED' || item.status === 'EXPIRED'}
          >
            Duzenle
          </Button>
          <Button
            variant="outline"
            onClick={() => onReject(item)}
            disabled={loading || item.status === 'POSTED'}
          >
            <XCircle className="mr-2 h-4 w-4" />
            Reddet
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function MarketplaceQaPage() {
  const { locale } = useLanguage();
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

  const handleApprove = async (item) => {
    try {
      await approveQuestion.mutateAsync({
        id: item.id,
        answerText: item.finalAnswer || item.generatedAnswer,
      });
      toast.success('Cevap platforma gonderildi');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Cevap gonderilemedi');
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
      toast.success('Duzenlenen cevap gonderildi');
      setEditDialogOpen(false);
      setSelectedQuestion(null);
      setEditedAnswer('');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Duzenlenen cevap gonderilemedi');
    }
  };

  const handleReject = async (item) => {
    const rejectionReason = window.prompt('Reddetme nedeni', 'Soru bu asamada yanitlanmaya uygun degil.');
    if (rejectionReason == null) return;

    try {
      await rejectQuestion.mutateAsync({ id: item.id, rejectionReason });
      toast.success('Soru reddedildi');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Soru reddedilemedi');
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
      toast.success('Pazaryeri ayarlari kaydedildi');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Ayarlar kaydedilemedi');
    }
  };

  if (!hasConnectedIntegration) {
    return (
      <div className="space-y-8">
        <PageIntro
          title="Pazaryeri Q&A"
          subtitle="Trendyol ve Hepsiburada sorularini AI ile yonetin."
          locale={locale}
          help={pageHelp ? { tooltipTitle: pageHelp.tooltipTitle, tooltipBody: pageHelp.tooltipBody, quickSteps: pageHelp.quickSteps } : undefined}
        />

        <EmptyState
          icon={ShoppingBag}
          title="Aktif pazaryeri entegrasyonu bulunmuyor"
          description="Bu ekrani kullanmak icin once Trendyol veya Hepsiburada entegrasyonunu aktiflestirin."
          action={{
            label: 'Entegrasyonlara Git',
            href: '/dashboard/integrations',
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageIntro
        title="Pazaryeri Q&A"
        subtitle="Sorulari cekin, AI cevap taslagi uretin ve onaylayarak platforma gonderin."
        locale={locale}
        help={pageHelp ? { tooltipTitle: pageHelp.tooltipTitle, tooltipBody: pageHelp.tooltipBody, quickSteps: pageHelp.quickSteps } : undefined}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MarketplaceStatCard title="Bugunku soru" value={stats.todayQuestions || 0} hint="Bugun olusan toplam soru" />
        <MarketplaceStatCard title="Onay bekleyen" value={stats.pendingQuestions || 0} hint="Post edilmeyi bekleyen taslaklar" />
        <MarketplaceStatCard title="Oto gonderilen" value={stats.autoPostedQuestions || 0} hint="AUTO mod + env guard ile post edilenler" />
        <MarketplaceStatCard title="Reddedilen" value={stats.rejectedQuestions || 0} hint="Manuel reddedilen sorular" />
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-2">
            <Label>Platform</Label>
            <Select value={filters.platform} onValueChange={(value) => setFilters((prev) => ({ ...prev, platform: value, page: 1 }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tumu</SelectItem>
                <SelectItem value="TRENDYOL">Trendyol</SelectItem>
                <SelectItem value="HEPSIBURADA">Hepsiburada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Durum</Label>
            <Select value={filters.status} onValueChange={(value) => setFilters((prev) => ({ ...prev, status: value, page: 1 }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tumu</SelectItem>
                <SelectItem value="PENDING">Bekleyen</SelectItem>
                <SelectItem value="POSTED">Gonderilen</SelectItem>
                <SelectItem value="REJECTED">Reddedilen</SelectItem>
                <SelectItem value="ERROR">Hata</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Baslangic tarihi</Label>
            <Input type="date" value={filters.fromDate} onChange={(event) => setFilters((prev) => ({ ...prev, fromDate: event.target.value, page: 1 }))} />
          </div>

          <div className="space-y-2">
            <Label>Bitis tarihi</Label>
            <Input type="date" value={filters.toDate} onChange={(event) => setFilters((prev) => ({ ...prev, toDate: event.target.value, page: 1 }))} />
          </div>

          <div className="space-y-2">
            <Label>Arama</Label>
            <Input
              placeholder="Urun, musteri veya soru metni"
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
            <div key={item.platform} className="rounded-xl border border-neutral-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold text-neutral-900">
                    {item.platform === 'TRENDYOL' ? 'Trendyol' : 'Hepsiburada'}
                  </div>
                  <div className="text-sm text-neutral-500">
                    {item.connected ? 'Bagli' : 'Bagli degil'} • Son sync: {formatDate(item.lastSync)}
                  </div>
                </div>
                <Badge variant="outline">{item.platform}</Badge>
              </div>

              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-4 py-3">
                  <div>
                    <div className="font-medium text-neutral-900">Otomatik gonderim</div>
                    <div className="text-xs text-neutral-500">
                      Varsayilan akista sorular yine panel onayindan gecer. Env guard acilirse AUTO mod worker tarafinda post edebilir.
                    </div>
                  </div>
                  <Switch
                    checked={platformState.answerMode === 'AUTO'}
                    onCheckedChange={(checked) => handleSettingsChange(item.platform, { answerMode: checked ? 'AUTO' : 'MANUAL' })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Dil</Label>
                  <Select value={platformState.language} onValueChange={(value) => handleSettingsChange(item.platform, { language: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tr">Turkce</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="de">Deutsch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Ton tercihi</Label>
                  <Textarea
                    rows={3}
                    placeholder="Nazik, kisa, iade kosullarini net vurgula..."
                    value={platformState.toneInstructions}
                    onChange={(event) => handleSettingsChange(item.platform, { toneInstructions: event.target.value })}
                  />
                </div>

                <Button
                  variant="outline"
                  onClick={() => handleSettingsSave(item.platform)}
                  disabled={updateSettings.isPending}
                >
                  {updateSettings.isPending ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Kaydediliyor</> : 'Ayarlari Kaydet'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-4">
        {questionsQuery.isLoading ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-8 text-sm text-neutral-500">
            Sorular yukleniyor...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-neutral-500">
            Secilen filtrelerle eslesen soru bulunamadi.
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
            />
          ))
        )}
      </div>

      <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-5 py-4">
        <div className="text-sm text-neutral-500">
          Sayfa {pagination.page} / {pagination.totalPages}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setFilters((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
            disabled={filters.page <= 1}
          >
            Onceki
          </Button>
          <Button
            variant="outline"
            onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
            disabled={pagination.page >= pagination.totalPages}
          >
            Sonraki
          </Button>
        </div>
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cevabi duzenle</DialogTitle>
            <DialogDescription>
              Duzenlenen cevap kaydedilir ve ayni adimda pazaryerine gonderilir.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea rows={8} value={editedAnswer} onChange={(event) => setEditedAnswer(event.target.value)} />
            <div className="text-right text-xs text-neutral-500">
              {editedAnswer.length} / 2000 karakter
            </div>
            {editedAnswer.length > 2000 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                <AlertCircle className="mr-2 inline h-4 w-4" />
                Cevap 2000 karakter sinirini asiyor.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Vazgec</Button>
            <Button onClick={handleEditSave} disabled={editQuestion.isPending || editedAnswer.length < 10 || editedAnswer.length > 2000}>
              {editQuestion.isPending ? <><Clock3 className="mr-2 h-4 w-4 animate-spin" />Gonderiliyor</> : 'Kaydet ve Gonder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
