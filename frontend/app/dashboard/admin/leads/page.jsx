'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Flame,
  Loader2,
  Mail,
  Megaphone,
  MessageSquare,
  Phone,
  Save,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const STATUS_STYLES = {
  NEW: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200',
  EMAILED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  POSITIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  NOT_NOW: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300',
  CALL_QUEUED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  CALLED: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  WON: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  LOST: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
};

const TEMPERATURE_STYLES = {
  COLD: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300',
  WARM: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  HOT: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const CTA_STYLES = {
  YES: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  NO: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300',
};

const SOURCE_ORDER = ['ALL', 'META_INSTANT_FORM', 'WEBSITE_CONTACT', 'WEBSITE_DEMO', 'WEBSITE_WAITLIST', 'MANUAL'];
const STATUS_ORDER = ['ALL', 'NEW', 'EMAILED', 'POSITIVE', 'NOT_NOW', 'CALL_QUEUED', 'CALLED', 'WON', 'LOST'];
const TEMPERATURE_ORDER = ['ALL', 'COLD', 'WARM', 'HOT'];

function toDateTimeInputValue(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDateTime(value, locale) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getLeadCopy(locale) {
  const isTr = locale === 'tr';

  return {
    title: isTr ? 'Leadler' : 'Leads',
    description: isTr ? 'Meta ve site formlarından gelen lead akışını yönetin.' : 'Manage leads from Meta and website forms.',
    stats: {
      total: isTr ? 'Toplam Lead' : 'Total Leads',
      hot: isTr ? 'Sıcak Lead' : 'Hot Leads',
      new: isTr ? 'Yeni Bekleyen' : 'New Leads',
      emailed: isTr ? 'İlk Mail Giden' : 'Autoresponse Sent',
      positive: isTr ? 'Olumlu Dönüş' : 'Positive Response',
      calledToday: isTr ? 'Bugün Aranan' : 'Called Today',
    },
    filters: {
      searchPlaceholder: isTr ? 'İsim, email, telefon veya şirket ara...' : 'Search by name, email, phone, or company...',
      search: isTr ? 'Ara' : 'Search',
      allStatuses: isTr ? 'Tüm Durumlar' : 'All Statuses',
      allSources: isTr ? 'Tüm Kaynaklar' : 'All Sources',
      allTemperatures: isTr ? 'Tüm Sıcaklıklar' : 'All Temperatures',
    },
    table: {
      receivedAt: isTr ? 'Geliş Zamanı' : 'Received At',
      lead: isTr ? 'Lead' : 'Lead',
      source: isTr ? 'Kaynak' : 'Source',
      status: isTr ? 'Durum' : 'Status',
      temperature: isTr ? 'Sıcaklık' : 'Temperature',
      callback: isTr ? 'Arama' : 'Call',
      action: isTr ? 'İşlem' : 'Action',
      noData: isTr ? 'Henüz lead bulunmuyor.' : 'No leads yet.',
      detail: isTr ? 'Detay' : 'Details',
    },
    detail: {
      description: isTr ? 'Lead detayını, aktivite geçmişini ve follow-up durumunu yönetin.' : 'Manage lead details, timeline, and follow-up state.',
      contact: isTr ? 'İletişim Bilgileri' : 'Contact Information',
      sourceMeta: isTr ? 'Kaynak Bilgileri' : 'Source Details',
      timeline: isTr ? 'Aktivite Geçmişi' : 'Activity Timeline',
      edit: isTr ? 'Lead Yönetimi' : 'Lead Management',
      notes: isTr ? 'Notlar' : 'Notes',
      nextFollowUpAt: isTr ? 'Sonraki Follow-up' : 'Next Follow-up',
      save: isTr ? 'Kaydet' : 'Save',
      cancel: isTr ? 'Kapat' : 'Close',
      lastCallback: isTr ? 'Son Callback' : 'Latest Callback',
      noTimeline: isTr ? 'Aktivite kaydı yok.' : 'No activities yet.',
      company: isTr ? 'Şirket' : 'Company',
      businessType: isTr ? 'İşletme Türü' : 'Business Type',
      message: isTr ? 'Mesaj' : 'Message',
      campaign: isTr ? 'Kampanya' : 'Campaign',
      adset: isTr ? 'Ad Set' : 'Ad Set',
      ad: isTr ? 'Reklam' : 'Ad',
      form: isTr ? 'Form' : 'Form',
      cta: isTr ? 'CTA Yanıtı' : 'CTA Response',
      callbackQueued: isTr ? 'Callback Kuyruğunda' : 'Callback Queued',
      callbackCalled: isTr ? 'Arama Başlatıldı' : 'Call Started',
    },
    toasts: {
      loadFailed: isTr ? 'Leadler yüklenemedi.' : 'Failed to load leads.',
      detailFailed: isTr ? 'Lead detayı yüklenemedi.' : 'Failed to load lead detail.',
      saveSuccess: isTr ? 'Lead güncellendi.' : 'Lead updated.',
      saveFailed: isTr ? 'Lead güncellenemedi.' : 'Failed to update lead.',
    },
    statuses: {
      ALL: isTr ? 'Tümü' : 'All',
      NEW: isTr ? 'Yeni' : 'New',
      EMAILED: isTr ? 'İlk Mail Gönderildi' : 'Emailed',
      POSITIVE: isTr ? 'Olumlu' : 'Positive',
      NOT_NOW: isTr ? 'Şimdilik Hayır' : 'Not Now',
      CALL_QUEUED: isTr ? 'Arama Kuyruğunda' : 'Call Queued',
      CALLED: isTr ? 'Arandı' : 'Called',
      WON: isTr ? 'Kazanıldı' : 'Won',
      LOST: isTr ? 'Kaybedildi' : 'Lost',
    },
    temperatures: {
      ALL: isTr ? 'Tümü' : 'All',
      COLD: isTr ? 'Soğuk' : 'Cold',
      WARM: isTr ? 'Ilık' : 'Warm',
      HOT: isTr ? 'Sıcak' : 'Hot',
    },
    sources: {
      ALL: isTr ? 'Tümü' : 'All',
      META_INSTANT_FORM: isTr ? 'Meta Instant Form' : 'Meta Instant Form',
      WEBSITE_CONTACT: isTr ? 'Site İletişim Formu' : 'Website Contact',
      WEBSITE_DEMO: isTr ? 'Site Demo Formu' : 'Website Demo',
      WEBSITE_WAITLIST: isTr ? 'Bekleme Listesi' : 'Website Waitlist',
      MANUAL: isTr ? 'Manuel' : 'Manual',
    },
    cta: {
      YES: isTr ? 'Evet' : 'Yes',
      NO: isTr ? 'Hayır' : 'No',
      empty: isTr ? 'Yanıt yok' : 'No response',
    },
    activityLabels: {
      LEAD_CREATED: isTr ? 'Lead oluşturuldu' : 'Lead created',
      INTERNAL_NOTIFICATION_SENT: isTr ? 'İç bildirim gönderildi' : 'Internal notification sent',
      INTERNAL_NOTIFICATION_FAILED: isTr ? 'İç bildirim hatası' : 'Internal notification failed',
      INITIAL_EMAIL_SENT: isTr ? 'İlk email gönderildi' : 'Initial email sent',
      INITIAL_EMAIL_FAILED: isTr ? 'İlk email hatası' : 'Initial email failed',
      CTA_YES: isTr ? 'CTA: Evet' : 'CTA: Yes',
      CTA_NO: isTr ? 'CTA: Hayır' : 'CTA: No',
      STATUS_CHANGED: isTr ? 'Durum değişti' : 'Status changed',
      NOTE_UPDATED: isTr ? 'Not güncellendi' : 'Note updated',
      CALLBACK_QUEUED: isTr ? 'Callback kuyruğa alındı' : 'Callback queued',
      CALLBACK_QUEUE_FAILED: isTr ? 'Callback kuyruğu hatası' : 'Callback queue failed',
      DEMO_CALL_INITIATED: isTr ? 'Demo araması başlatıldı' : 'Demo call started',
      DEMO_CALL_FAILED: isTr ? 'Demo araması hatası' : 'Demo call failed',
    },
  };
}

export default function AdminLeadsPage() {
  const { locale } = useLanguage();
  const copy = useMemo(() => getLeadCopy(locale), [locale]);

  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [leads, setLeads] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, pageSize: 25 });
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [temperatureFilter, setTemperatureFilter] = useState('ALL');
  const [selectedLead, setSelectedLead] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formState, setFormState] = useState({
    status: 'NEW',
    temperature: 'COLD',
    notes: '',
    nextFollowUpAt: '',
  });

  const statCards = useMemo(() => ([
    { key: 'total', label: copy.stats.total, value: stats?.total ?? 0, tone: 'bg-slate-500' },
    { key: 'hot', label: copy.stats.hot, value: stats?.hot ?? 0, tone: 'bg-red-500' },
    { key: 'new', label: copy.stats.new, value: stats?.new ?? 0, tone: 'bg-blue-500' },
    { key: 'emailed', label: copy.stats.emailed, value: stats?.emailed ?? 0, tone: 'bg-cyan-500' },
    { key: 'positive', label: copy.stats.positive, value: stats?.positive ?? 0, tone: 'bg-emerald-500' },
    { key: 'calledToday', label: copy.stats.calledToday, value: stats?.calledToday ?? 0, tone: 'bg-amber-500' },
  ]), [copy, stats]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const response = await apiClient.admin.getLeadStats();
      setStats(response.data);
    } catch (error) {
      console.error('Failed to load lead stats:', error);
      toast.error(copy.toasts.loadFailed);
    } finally {
      setStatsLoading(false);
    }
  }, [copy.toasts.loadFailed]);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.pageSize,
      };

      if (searchQuery) params.search = searchQuery;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (sourceFilter !== 'ALL') params.source = sourceFilter;
      if (temperatureFilter !== 'ALL') params.temperature = temperatureFilter;

      const response = await apiClient.admin.getLeads(params);
      setLeads(response.data.items || []);
      setPagination((prev) => ({
        ...prev,
        total: response.data.total || 0,
        totalPages: response.data.totalPages || 1,
        pageSize: response.data.pageSize || prev.pageSize,
      }));
    } catch (error) {
      console.error('Failed to load leads:', error);
      toast.error(copy.toasts.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [copy.toasts.loadFailed, pagination.page, pagination.pageSize, searchQuery, sourceFilter, statusFilter, temperatureFilter]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const openLeadDetail = useCallback(async (leadId) => {
    setDetailOpen(true);
    setDetailLoading(true);

    try {
      const response = await apiClient.admin.getLead(leadId);
      const nextLead = response.data;
      setSelectedLead(nextLead);
      setShowVoicePreview(false);
      setFormState({
        status: nextLead.status || 'NEW',
        temperature: nextLead.temperature || 'COLD',
        notes: nextLead.notes || '',
        nextFollowUpAt: toDateTimeInputValue(nextLead.nextFollowUpAt),
      });
    } catch (error) {
      console.error('Failed to load lead detail:', error);
      toast.error(copy.toasts.detailFailed);
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }, [copy.toasts.detailFailed]);

  const handleSearch = (event) => {
    event.preventDefault();
    setPagination((prev) => ({ ...prev, page: 1 }));
    setSearchQuery(searchInput.trim());
  };

  const handleSave = async () => {
    if (!selectedLead) return;

    setSaving(true);
    try {
      await apiClient.admin.updateLead(selectedLead.id, {
        status: formState.status,
        temperature: formState.temperature,
        notes: formState.notes,
        nextFollowUpAt: formState.nextFollowUpAt
          ? new Date(formState.nextFollowUpAt).toISOString()
          : null,
      });

      toast.success(copy.toasts.saveSuccess);
      await Promise.all([loadLeads(), loadStats()]);
      await openLeadDetail(selectedLead.id);
    } catch (error) {
      console.error('Failed to save lead:', error);
      toast.error(copy.toasts.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{copy.title}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{copy.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {statCards.map((stat) => (
          <div
            key={stat.key}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#081224]/95"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{stat.label}</p>
                <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
                  {statsLoading ? '—' : Number(stat.value || 0).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-US')}
                </p>
              </div>
              <div className={`rounded-2xl p-3 ${stat.tone}`}>
                <Flame className="h-5 w-5 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#081224]/95 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <form onSubmit={handleSearch} className="flex flex-1 gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={copy.filters.searchPlaceholder}
                className="pl-10"
              />
            </div>
            <Button type="submit" variant="outline">{copy.filters.search}</Button>
          </form>

          <div className="flex flex-wrap gap-2">
            <Select value={statusFilter} onValueChange={(value) => {
              setStatusFilter(value);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={copy.filters.allStatuses} />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ORDER.map((status) => (
                  <SelectItem key={status} value={status}>
                    {copy.statuses[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sourceFilter} onValueChange={(value) => {
              setSourceFilter(value);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}>
              <SelectTrigger className="w-[190px]">
                <SelectValue placeholder={copy.filters.allSources} />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_ORDER.map((source) => (
                  <SelectItem key={source} value={source}>
                    {copy.sources[source]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={temperatureFilter} onValueChange={(value) => {
              setTemperatureFilter(value);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder={copy.filters.allTemperatures} />
              </SelectTrigger>
              <SelectContent>
                {TEMPERATURE_ORDER.map((temperature) => (
                  <SelectItem key={temperature} value={temperature}>
                    {copy.temperatures[temperature]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10">
          {loading ? (
            <div className="flex h-64 items-center justify-center bg-white dark:bg-[#081224]/95">
              <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
            </div>
          ) : leads.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center bg-white dark:bg-[#081224]/95">
              <Megaphone className="mb-4 h-12 w-12 text-gray-400" />
              <p className="text-gray-500">{copy.table.noData}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-[#0B1730]/88">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{copy.table.receivedAt}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{copy.table.lead}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{copy.table.source}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{copy.table.status}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{copy.table.temperature}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{copy.table.callback}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">{copy.table.action}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-white/10 dark:bg-[#081224]/95">
                  {leads.map((lead) => {
                    const latestCallback = lead.callbackRequests?.[0] || null;
                    return (
                      <tr key={lead.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.04]">
                        <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                          {formatDateTime(lead.receivedAtUtc, locale)}
                        </td>
                        <td className="px-4 py-4">
                          <div className="space-y-1">
                            <div className="font-medium text-gray-900 dark:text-white">{lead.name}</div>
                            {lead.company ? (
                              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                <Building2 className="h-4 w-4" />
                                <span>{lead.company}</span>
                              </div>
                            ) : null}
                            <div className="flex flex-wrap gap-3 text-sm text-gray-500 dark:text-gray-400">
                              {lead.email ? (
                                <span className="inline-flex items-center gap-1">
                                  <Mail className="h-4 w-4" />
                                  {lead.email}
                                </span>
                              ) : null}
                              {lead.phone ? (
                                <span className="inline-flex items-center gap-1">
                                  <Phone className="h-4 w-4" />
                                  {lead.phone}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="space-y-2">
                            <Badge variant="secondary" className="bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200">
                              {copy.sources[lead.source] || lead.source}
                            </Badge>
                            {lead.ctaResponse ? (
                              <Badge className={CTA_STYLES[lead.ctaResponse] || CTA_STYLES.NO}>
                                {copy.cta[lead.ctaResponse]}
                              </Badge>
                            ) : (
                              <div className="text-xs text-gray-400">{copy.cta.empty}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <Badge className={STATUS_STYLES[lead.status] || STATUS_STYLES.NEW}>
                            {copy.statuses[lead.status] || lead.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-4">
                          <Badge className={TEMPERATURE_STYLES[lead.temperature] || TEMPERATURE_STYLES.COLD}>
                            {copy.temperatures[lead.temperature] || lead.temperature}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                          {latestCallback ? (
                            <div className="space-y-1">
                              <div className="font-medium">{latestCallback.status}</div>
                              <div className="text-xs text-gray-500">{formatDateTime(latestCallback.createdAt, locale)}</div>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <Button variant="outline" size="sm" onClick={() => openLeadDetail(lead.id)}>
                            {copy.table.detail}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {pagination.total.toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-US')}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
              disabled={pagination.page <= 1 || loading}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {pagination.page} / {Math.max(1, pagination.totalPages)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination((prev) => ({ ...prev, page: Math.min(prev.totalPages, prev.page + 1) }))}
              disabled={pagination.page >= pagination.totalPages || loading}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{selectedLead?.name || copy.title}</DialogTitle>
            <DialogDescription>{copy.detail.description}</DialogDescription>
          </DialogHeader>

          {detailLoading || !selectedLead ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-6">
                <section className="rounded-2xl border border-gray-200 p-5 dark:border-white/10">
                  <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">{copy.detail.contact}</h3>
                  <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-gray-400" />
                      <span>{selectedLead.email || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-gray-400" />
                      <span>{selectedLead.phone || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-gray-400" />
                      <span>{selectedLead.company || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarClock className="h-4 w-4 text-gray-400" />
                      <span>{formatDateTime(selectedLead.receivedAtUtc, locale)}</span>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-gray-200 p-5 dark:border-white/10">
                  <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">{copy.detail.sourceMeta}</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-xs text-gray-500">{copy.table.source}</p>
                      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{copy.sources[selectedLead.source] || selectedLead.source}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">{copy.detail.cta}</p>
                      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{copy.cta[selectedLead.ctaResponse] || copy.cta.empty}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">{copy.detail.company}</p>
                      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{selectedLead.company || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">{copy.detail.businessType}</p>
                      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{selectedLead.businessType || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">{copy.detail.campaign}</p>
                      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{selectedLead.campaignName || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">{copy.detail.adset}</p>
                      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{selectedLead.adsetName || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">{copy.detail.ad}</p>
                      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{selectedLead.adName || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">{copy.detail.form}</p>
                      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{selectedLead.formName || '—'}</p>
                    </div>
                  </div>

                  {selectedLead.message ? (
                    <div className="mt-4 rounded-2xl bg-gray-50 p-4 dark:bg-white/[0.04]">
                      <p className="mb-2 text-xs text-gray-500">{copy.detail.message}</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{selectedLead.message}</p>
                    </div>
                  ) : null}

                  {selectedLead.callbackRequests?.[0] ? (
                    <div className="mt-4 rounded-2xl bg-gray-50 p-4 dark:bg-white/[0.04]">
                      <p className="mb-2 text-xs text-gray-500">{copy.detail.lastCallback}</p>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                          {selectedLead.callbackRequests[0].status}
                        </Badge>
                        <span>{formatDateTime(selectedLead.callbackRequests[0].createdAt, locale)}</span>
                      </div>
                    </div>
                  ) : null}
                </section>

                <section className="rounded-2xl border border-gray-200 p-5 dark:border-white/10">
                  <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">{copy.detail.timeline}</h3>
                  <div className="space-y-4">
                    {selectedLead.activities?.length ? selectedLead.activities.map((activity) => (
                      <div key={activity.id} className="rounded-2xl bg-gray-50 p-4 dark:bg-white/[0.04]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {copy.activityLabels[activity.type] || activity.type}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatDateTime(activity.createdAt, locale)}
                          </div>
                        </div>
                        {activity.message ? (
                          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{activity.message}</p>
                        ) : null}
                        {activity.actorLabel ? (
                          <p className="mt-2 text-xs text-gray-400">{activity.actorLabel}</p>
                        ) : null}
                      </div>
                    )) : (
                      <p className="text-sm text-gray-500">{copy.detail.noTimeline}</p>
                    )}
                  </div>
                </section>
              </div>

              <section className="rounded-2xl border border-gray-200 p-5 dark:border-white/10 space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{copy.detail.edit}</h3>

                <div className="space-y-2">
                  <Label>{copy.table.status}</Label>
                  <Select value={formState.status} onValueChange={(value) => setFormState((prev) => ({ ...prev, status: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_ORDER.filter((status) => status !== 'ALL').map((status) => (
                        <SelectItem key={status} value={status}>
                          {copy.statuses[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{copy.table.temperature}</Label>
                  <Select value={formState.temperature} onValueChange={(value) => setFormState((prev) => ({ ...prev, temperature: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEMPERATURE_ORDER.filter((temperature) => temperature !== 'ALL').map((temperature) => (
                        <SelectItem key={temperature} value={temperature}>
                          {copy.temperatures[temperature]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{copy.detail.nextFollowUpAt}</Label>
                  <Input
                    type="datetime-local"
                    value={formState.nextFollowUpAt}
                    onChange={(event) => setFormState((prev) => ({ ...prev, nextFollowUpAt: event.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{copy.detail.notes}</Label>
                  <Textarea
                    rows={8}
                    value={formState.notes}
                    onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))}
                    placeholder={copy.detail.notes}
                  />
                </div>

                <div className="rounded-2xl bg-gray-50 p-4 text-sm dark:bg-white/[0.04] space-y-2">
                  <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <MessageSquare className="h-4 w-4 text-gray-400" />
                    <span>
                      {selectedLead.firstEmailedAt
                        ? `${copy.statuses.EMAILED}: ${formatDateTime(selectedLead.firstEmailedAt, locale)}`
                        : copy.cta.empty}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <CalendarClock className="h-4 w-4 text-gray-400" />
                    <span>
                      {selectedLead.lastContactedAt
                        ? formatDateTime(selectedLead.lastContactedAt, locale)
                        : '—'}
                    </span>
                  </div>
                </div>

              </section>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              {copy.detail.cancel}
            </Button>
            <Button onClick={handleSave} disabled={saving || detailLoading || !selectedLead}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {copy.detail.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
