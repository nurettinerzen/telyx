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
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useSikayetvarStatus } from '@/hooks/useIntegrations';
import {
  useApproveComplaintThread,
  useComplaintSettings,
  useComplaintStats,
  useComplaintThreads,
  useEditComplaintThread,
  useRejectComplaintThread,
  useUpdateComplaintSettings,
} from '@/hooks/useComplaints';

const STATUS_META = {
  PENDING: { label: 'Onay bekliyor', className: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'Onaylandi', className: 'bg-blue-100 text-blue-700' },
  POSTED: { label: 'Gonderildi', className: 'bg-green-100 text-green-700' },
  REJECTED: { label: 'Reddedildi', className: 'bg-red-100 text-red-700' },
  CLOSED: { label: 'Kapandi', className: 'bg-neutral-200 text-neutral-700' },
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

function ComplaintStatCard({ title, value, hint }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="text-sm text-neutral-500 dark:text-neutral-400">{title}</div>
      <div className="mt-2 text-3xl font-semibold text-neutral-900 dark:text-white">{value}</div>
      <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">{hint}</div>
    </div>
  );
}

function ComplaintCard({ item, onApprove, onEdit, onReject, loading }) {
  const statusMeta = STATUS_META[item.status] || STATUS_META.PENDING;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={statusMeta.className}>{statusMeta.label}</Badge>
            <Badge variant="outline">Sikayetvar</Badge>
            {item.sourceCreatedAt && (
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Açılış: {formatDate(item.sourceCreatedAt)}
              </span>
            )}
          </div>

          <div>
            <div className="font-semibold text-neutral-900 dark:text-white">{item.title || 'Şikayet başlığı yok'}</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {item.customerName || 'Müşteri'} • {item.customerCity || 'Şehir bilgisi yok'}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Şikayet</div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-100">{item.complaintText}</p>
          </div>

          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              <Sparkles className="h-3.5 w-3.5" />
              AI taslagi
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-100">
              {item.finalReply || item.generatedReply || 'Henüz cevap üretilmedi'}
            </p>
          </div>

          {item.complaintUrl && (
            <a
              href={item.complaintUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-sm text-teal-700 underline dark:text-teal-300"
            >
              Şikayeti platformda aç
            </a>
          )}

          {item.errorMessage && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
              {item.errorMessage}
            </div>
          )}
        </div>

        <div className="flex gap-2 lg:min-w-[240px] lg:flex-col">
          <Button
            onClick={() => onApprove(item)}
            disabled={loading || !item.generatedReply || item.status === 'POSTED' || item.status === 'CLOSED'}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Onayla ve Gonder
          </Button>
          <Button
            variant="outline"
            onClick={() => onEdit(item)}
            disabled={loading || item.status === 'POSTED' || item.status === 'CLOSED'}
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

export default function ComplaintsPage() {
  const { locale } = useLanguage();
  const pageHelp = getPageHelp('integrations', locale);
  const { data: sikayetvarStatus } = useSikayetvarStatus();
  const hasConnectedIntegration = Boolean(sikayetvarStatus?.connected);

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
  const [selectedThread, setSelectedThread] = useState(null);
  const [editedReply, setEditedReply] = useState('');
  const [settingsState, setSettingsState] = useState({});

  const threadsQuery = useComplaintThreads(filters);
  const statsQuery = useComplaintStats();
  const settingsQuery = useComplaintSettings();
  const approveThread = useApproveComplaintThread();
  const editThread = useEditComplaintThread();
  const rejectThread = useRejectComplaintThread();
  const updateSettings = useUpdateComplaintSettings();

  useEffect(() => {
    if (!settingsQuery.data?.settings) {
      return;
    }

    const nextState = {};
    for (const item of settingsQuery.data.settings) {
      nextState[item.platform] = {
        language: item.complaintSettings?.language || 'tr',
        toneInstructions: item.complaintSettings?.toneInstructions || '',
        signature: item.complaintSettings?.signature || '',
        autoGenerate: item.complaintSettings?.autoGenerate !== false,
      };
    }
    setSettingsState(nextState);
  }, [settingsQuery.data]);

  const items = threadsQuery.data?.items || [];
  const pagination = threadsQuery.data?.pagination || { page: 1, totalPages: 1 };
  const stats = statsQuery.data || {};

  const handleApprove = async (item) => {
    try {
      await approveThread.mutateAsync({
        id: item.id,
        answerText: item.finalReply || item.generatedReply,
      });
      toast.success('Cevap platforma gönderildi');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Cevap gönderilemedi');
    }
  };

  const handleEditOpen = (item) => {
    setSelectedThread(item);
    setEditedReply(item.finalReply || item.generatedReply || '');
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!selectedThread) return;

    try {
      await editThread.mutateAsync({
        id: selectedThread.id,
        answerText: editedReply,
      });
      toast.success('Düzenlenen cevap gönderildi');
      setEditDialogOpen(false);
      setSelectedThread(null);
      setEditedReply('');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Düzenlenen cevap gönderilemedi');
    }
  };

  const handleReject = async (item) => {
    const rejectionReason = window.prompt('Reddetme nedeni', 'Bu şikayete şu aşamada platform üzerinden yanıt verilmeyecek.');
    if (rejectionReason == null) return;

    try {
      await rejectThread.mutateAsync({ id: item.id, rejectionReason });
      toast.success('Şikayet reddedildi');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Şikayet reddedilemedi');
    }
  };

  const handleSettingsChange = (platform, field, value) => {
    setSettingsState((prev) => ({
      ...prev,
      [platform]: {
        ...(prev[platform] || {}),
        [field]: value,
      },
    }));
  };

  const handleSettingsSave = async (platform) => {
    try {
      await updateSettings.mutateAsync({
        platform,
        complaintSettings: settingsState[platform],
      });
      toast.success('Şikayet ayarları güncellendi');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Şikayet ayarları güncellenemedi');
    }
  };

  return (
    <div className="space-y-8">
      <PageIntro
        title="Şikayet Yönetimi"
        subtitle={pageHelp?.subtitle}
        locale={locale}
        help={pageHelp ? {
          tooltipTitle: pageHelp.tooltipTitle,
          tooltipBody: pageHelp.tooltipBody,
          quickSteps: pageHelp.quickSteps,
        } : undefined}
      />

      {!hasConnectedIntegration && (
        <EmptyState
          icon={AlertTriangle}
          title="Şikayetvar entegrasyonu bağlı değil"
          description="Önce Entegrasyonlar sayfasından Şikayetvar tokenınızı bağlayın. Sistem açık şikayetleri çekip AI taslaklarını burada gösterecek."
        />
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ComplaintStatCard title="Toplam şikayet" value={stats.total || 0} hint="Sistemdeki tüm kayıtlar" />
        <ComplaintStatCard title="Bugün gelen" value={stats.todayTotal || 0} hint="Bugün açılan yeni kayıtlar" />
        <ComplaintStatCard title="Onay bekleyen" value={stats.pending || 0} hint="Gönderim öncesi sıradakiler" />
        <ComplaintStatCard title="Gönderilen" value={stats.posted || 0} hint="Platforma post edilen yanıtlar" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
            <div className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="flex-1">
                <Label>Ara</Label>
                <Input
                  placeholder="Başlık, müşteri adı veya şikayet metni"
                  value={filters.search}
                  onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value, page: 1 }))}
                />
              </div>

              <div className="w-full md:w-[180px]">
                <Label>Durum</Label>
                <Select
                  value={filters.status}
                  onValueChange={(value) => setFilters((prev) => ({ ...prev, status: value, page: 1 }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Durum" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tümü</SelectItem>
                    <SelectItem value="PENDING">Bekleyen</SelectItem>
                    <SelectItem value="POSTED">Gönderilen</SelectItem>
                    <SelectItem value="REJECTED">Reddedilen</SelectItem>
                    <SelectItem value="ERROR">Hatalı</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full md:w-[180px]">
                <Label>Başlangıç</Label>
                <Input
                  type="date"
                  value={filters.fromDate}
                  onChange={(event) => setFilters((prev) => ({ ...prev, fromDate: event.target.value, page: 1 }))}
                />
              </div>

              <div className="w-full md:w-[180px]">
                <Label>Bitiş</Label>
                <Input
                  type="date"
                  value={filters.toDate}
                  onChange={(event) => setFilters((prev) => ({ ...prev, toDate: event.target.value, page: 1 }))}
                />
              </div>
            </div>
          </div>

          {threadsQuery.isLoading ? (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center text-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-400">
              <RefreshCw className="mx-auto mb-3 h-5 w-5 animate-spin" />
              Şikayetler yükleniyor
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center text-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-400">
              Bu filtrelerde şikayet bulunamadı.
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <ComplaintCard
                  key={item.id}
                  item={item}
                  onApprove={handleApprove}
                  onEdit={handleEditOpen}
                  onReject={handleReject}
                  loading={approveThread.isPending || editThread.isPending || rejectThread.isPending}
                />
              ))}
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950">
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              Sayfa {pagination.page} / {pagination.totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setFilters((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                disabled={pagination.page <= 1}
              >
                Önceki
              </Button>
              <Button
                variant="outline"
                onClick={() => setFilters((prev) => ({ ...prev, page: Math.min(pagination.totalPages, prev.page + 1) }))}
                disabled={pagination.page >= pagination.totalPages}
              >
                Sonraki
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-white">
              <AlertCircle className="h-4 w-4" />
              Çalışma modeli
            </div>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
              Şikayetvar tarafında taslaklar otomatik üretilir. Platforma gönderim ise her zaman manuel onayla yapılır.
            </p>
          </div>

          {(settingsQuery.data?.settings || []).map((item) => {
            const settings = settingsState[item.platform] || {};

            return (
              <div key={item.platform} className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
                <div className="mb-4">
                  <div className="text-sm font-semibold text-neutral-900 dark:text-white">Şikayetvar ayarları</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">Empatik ton ve imza ayarları</div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-3 dark:border-neutral-800">
                    <div>
                      <div className="text-sm font-medium text-neutral-900 dark:text-white">Taslak üretimi açık</div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">Yeni şikayetler için AI taslak oluştur</div>
                    </div>
                    <Switch
                      checked={settings.autoGenerate !== false}
                      onCheckedChange={(checked) => handleSettingsChange(item.platform, 'autoGenerate', checked)}
                    />
                  </div>

                  <div>
                    <Label>Dil</Label>
                    <Select
                      value={settings.language || 'tr'}
                      onValueChange={(value) => handleSettingsChange(item.platform, 'language', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Dil seçin" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tr">Türkçe</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="de">Deutsch</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Ton talimatı</Label>
                    <Textarea
                      rows={4}
                      placeholder="Örn. Daha empatik ama çözüm odaklı yaz."
                      value={settings.toneInstructions || ''}
                      onChange={(event) => handleSettingsChange(item.platform, 'toneInstructions', event.target.value)}
                    />
                  </div>

                  <div>
                    <Label>İmza</Label>
                    <Textarea
                      rows={3}
                      placeholder="Örn. Saygılarımızla, Telyx Destek Ekibi"
                      value={settings.signature || ''}
                      onChange={(event) => handleSettingsChange(item.platform, 'signature', event.target.value)}
                    />
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => handleSettingsSave(item.platform)}
                    disabled={updateSettings.isPending}
                  >
                    Ayarları kaydet
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Şikayet cevabını düzenle</DialogTitle>
            <DialogDescription>
              Düzenlenen cevap kaydedildikten sonra platforma gönderilir.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>Cevap metni</Label>
            <Textarea
              rows={12}
              value={editedReply}
              onChange={(event) => setEditedReply(event.target.value)}
            />
            <div className="text-right text-xs text-neutral-500 dark:text-neutral-400">
              {editedReply.length} karakter
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Vazgeç
            </Button>
            <Button onClick={handleEditSave} disabled={editThread.isPending}>
              Kaydet ve Gönder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
