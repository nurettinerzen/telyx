'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Badge } from '@/components/ui/badge';
import EmptyState from '@/components/EmptyState';
import {
  Megaphone,
  Plus,
  Upload,
  FileSpreadsheet,
  Download,
  Phone,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  Pause,
  ArrowUpCircle,
  AlertCircle,
  X,
  Search,
  Filter
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermissions } from '@/hooks/usePermissions';
import PageIntro from '@/components/PageIntro';
import { getPageHelp } from '@/content/pageHelp';
import Link from 'next/link';
import { useBatchCalls, useBatchCallsAccess } from '@/hooks/useBatchCalls';
import { useAssistants } from '@/hooks/useAssistants';
import { usePhoneNumbers } from '@/hooks/usePhoneNumbers';

const STATUS_CONFIG = {
  PENDING: {
    labelKey: 'dashboard.batchCallsPage.status.pending',
    color: 'text-neutral-700 dark:text-neutral-400',
    icon: Clock
  },
  IN_PROGRESS: {
    labelKey: 'dashboard.batchCallsPage.status.inProgress',
    color: 'text-neutral-700 dark:text-neutral-400',
    icon: Loader2
  },
  COMPLETED: {
    labelKey: 'dashboard.batchCallsPage.status.completed',
    color: 'text-neutral-700 dark:text-neutral-400',
    icon: CheckCircle2
  },
  FAILED: {
    labelKey: 'dashboard.batchCallsPage.status.failed',
    color: 'text-neutral-700 dark:text-neutral-400',
    icon: XCircle
  },
  CANCELLED: {
    labelKey: 'dashboard.batchCallsPage.status.cancelled',
    color: 'text-neutral-700 dark:text-neutral-400',
    icon: Pause
  }
};

// Call purpose keys
const CALL_PURPOSE_KEYS = {
  sales: 'dashboard.batchCallsPage.purpose.sales',
  collection: 'dashboard.batchCallsPage.purpose.collection',
  general: 'dashboard.batchCallsPage.purpose.general'
};

// Template variable label keys based on purpose
const TEMPLATE_VARIABLE_KEYS = {
  collection: {
    debt_amount: 'dashboard.batchCallsPage.templateVars.debtAmount',
    currency: 'dashboard.batchCallsPage.templateVars.currency',
    due_date: 'dashboard.batchCallsPage.templateVars.dueDate'
  },
  sales: {
    product_name: 'dashboard.batchCallsPage.templateVars.productName',
    product_price: 'dashboard.batchCallsPage.templateVars.productPrice',
    campaign_name: 'dashboard.batchCallsPage.templateVars.campaignName'
  },
  general: {
    info_type: 'dashboard.batchCallsPage.templateVars.infoType',
    custom_data: 'dashboard.batchCallsPage.templateVars.customData'
  }
};

export default function BatchCallsPage() {
  const { t, locale } = useLanguage();
  const { can } = usePermissions();
  const pageHelp = getPageHelp('campaigns', locale);

  // React Query hooks
  const { data: batchCalls = [], isLoading: batchCallsLoading, refetch: refetchBatchCalls } = useBatchCalls();
  const { data: accessData, isLoading: accessLoading } = useBatchCallsAccess();
  const { data: assistantsData, isLoading: assistantsLoading } = useAssistants();
  const { data: phoneNumbers = [], isLoading: phoneNumbersLoading } = usePhoneNumbers();

  const loading = batchCallsLoading || accessLoading || assistantsLoading || phoneNumbersLoading;
  const hasAccess = accessData?.hasAccess ?? true;
  const lockReasonCode = accessData?.reasonCode || null;
  const lockDescription = (locale === 'tr'
    ? accessData?.messageTR
    : accessData?.message) || t('dashboard.batchCallsPage.upgradePlanDesc');
  const upgradeEligibleLock = lockReasonCode === 'PLAN_UPGRADE_REQUIRED'
    || lockReasonCode === 'PLAN_DISABLED'
    || lockReasonCode === 'NO_SUBSCRIPTION';
  const lockTitle = upgradeEligibleLock
    ? t('dashboard.batchCallsPage.upgradePlan')
    : (locale === 'tr' ? 'Kampanya erişimi kilitli' : 'Campaign access is locked');
  const showUpgradeButton = upgradeEligibleLock;
  const assistants = (assistantsData?.data?.assistants || []).filter(
    a => a.callDirection?.startsWith('outbound')
  );

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createStep, setCreateStep] = useState(1);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [assistantFilter, setAssistantFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  // Form data
  const [formData, setFormData] = useState({
    name: '',
    assistantId: '',
    phoneNumberId: '',
    callPurpose: '',
    scheduledAt: null,
    startImmediately: true
  });

  // File data
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileData, setFileData] = useState({ columns: [], preview: [], totalRows: 0 });
  const [columnMapping, setColumnMapping] = useState({});
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef(null);

  // Filter batch calls based on search and filters
  const filteredBatchCalls = useMemo(() => {
    let filtered = [...batchCalls];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(call =>
        call.name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(call => call.status === statusFilter);
    }

    // Assistant filter
    if (assistantFilter !== 'all') {
      filtered = filtered.filter(call => call.assistantId === assistantFilter);
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      filtered = filtered.filter(call => {
        const callDate = new Date(call.createdAt);
        const daysDiff = Math.floor((now - callDate) / (1000 * 60 * 60 * 24));

        switch (dateFilter) {
          case 'today':
            return callDate >= today;
          case 'week':
            return daysDiff <= 7;
          case 'month':
            return daysDiff <= 30;
          case 'quarter':
            return daysDiff <= 90;
          default:
            return true;
        }
      });
    }

    return filtered;
  }, [batchCalls, searchQuery, statusFilter, assistantFilter, dateFilter]);

  // Auto-refresh when there are in-progress campaigns
  useEffect(() => {
    const hasInProgress = batchCalls.some(b => b.status === 'IN_PROGRESS' || b.status === 'PENDING');
    if (hasInProgress) {
      const interval = setInterval(() => {
        refetchBatchCalls();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [batchCalls, refetchBatchCalls]);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (!allowedTypes.includes(file.type) && !file.name.endsWith('.csv') && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.error(t('dashboard.batchCallsPage.onlyCsvExcel'));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('dashboard.batchCallsPage.fileSizeLimit'));
      return;
    }

    setSelectedFile(file);
    setColumnMapping({});
    setUploading(true);

    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);
      formDataUpload.append('callPurpose', formData.callPurpose);

      const response = await apiClient.post('/api/batch-calls/parse', formDataUpload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setFileData({
        columns: response.data.columns,
        preview: response.data.preview,
        totalRows: response.data.totalRows
      });

      const suggestedMapping = response.data.suggestedMapping || {};
      const nextMapping = { ...suggestedMapping };

      // Frontend fallback auto-detect (if backend suggestion is missing a key)
      if (!nextMapping.phone) {
        const phoneColumn = response.data.columns.find(col => {
          const normalized = String(col || '').toLowerCase();
          return (
            normalized.includes('phone') ||
            normalized.includes('telefon') ||
            normalized.includes('tel') ||
            normalized.includes('gsm')
          );
        });
        if (phoneColumn) {
          nextMapping.phone = phoneColumn;
        }
      }

      if (!nextMapping.customer_name) {
        const nameColumn = response.data.columns.find(col => {
          const normalized = String(col || '').toLowerCase().trim();
          return (
            normalized.includes('name') ||
            normalized.includes('isim') ||
            normalized.includes('müşteri') ||
            normalized.includes('musteri') ||
            normalized === 'ad' ||
            normalized.startsWith('ad ') ||
            normalized.includes('ad soyad')
          );
        });
        if (nameColumn) {
          nextMapping.customer_name = nameColumn;
        }
      }

      setColumnMapping(nextMapping);

    } catch (error) {
      console.error('Parse error:', error);
      toast.error(error.response?.data?.error || t('dashboard.batchCallsPage.fileReadError'));
      setSelectedFile(null);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.assistantId || !formData.phoneNumberId || !formData.callPurpose) {
      toast.error(t('dashboard.batchCallsPage.fillAllRequired'));
      return;
    }

    if (!selectedFile) {
      toast.error(t('dashboard.batchCallsPage.uploadFile'));
      return;
    }

    if (!columnMapping.phone) {
      toast.error(t('dashboard.batchCallsPage.selectPhoneColumn'));
      return;
    }

    setSubmitting(true);

    try {
      const submitFormData = new FormData();
      submitFormData.append('file', selectedFile);
      submitFormData.append('name', formData.name);
      submitFormData.append('assistantId', formData.assistantId);
      submitFormData.append('phoneNumberId', formData.phoneNumberId);
      submitFormData.append('columnMapping', JSON.stringify(columnMapping));
      submitFormData.append('callPurpose', formData.callPurpose);

      // Set dataType based on purpose for backend processing
      const dataType = ['collection', 'sales', 'general'].includes(formData.callPurpose)
        ? formData.callPurpose
        : 'custom';
      submitFormData.append('dataType', dataType);

      if (!formData.startImmediately && formData.scheduledAt) {
        submitFormData.append('scheduledAt', formData.scheduledAt);
      }

      const response = await apiClient.post('/api/batch-calls', submitFormData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success(
        `${t('dashboard.batchCallsPage.callCreatedSuccess')} (${response.data.batchCall.totalRecipients} ${t('dashboard.batchCallsPage.recipientsCount')})`
      );

      setShowCreateModal(false);
      resetForm();
      refetchBatchCalls();
    } catch (error) {
      console.error('Submit error:', error);
      toast.error(error.response?.data?.error || error.response?.data?.errorTR || t('errors.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (batchCallId) => {
    if (!confirm(t('dashboard.batchCallsPage.confirmCancel'))) {
      return;
    }

    try {
      await apiClient.post(`/api/batch-calls/${batchCallId}/cancel`);
      toast.success(t('dashboard.batchCallsPage.callCancelled'));
      refetchBatchCalls();
    } catch (error) {
      toast.error(error.response?.data?.error || t('errors.generic'));
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      assistantId: '',
      phoneNumberId: '',
      callPurpose: '',
      scheduledAt: null,
      startImmediately: true
    });
    setSelectedFile(null);
    setFileData({ columns: [], preview: [], totalRows: 0 });
    setColumnMapping({});
    setCreateStep(1);
  };

  const downloadTemplate = async (type = 'collection') => {
    try {
      const response = await apiClient.get(`/api/batch-calls/template?type=${type}`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const fileNameByType = {
        sales: 'satis-sablon.xlsx',
        collection: 'tahsilat-sablon.xlsx',
        general: 'bilgilendirme-sablon.xlsx'
      };
      link.setAttribute('download', fileNameByType[type] || 'kampanya-sablon.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Template download error:', error);
      toast.error(t('dashboard.batchCallsPage.templateDownloadError'));
    }
  };

  // Check if current purpose has template
  const hasTemplate = ['collection', 'sales', 'general'].includes(formData.callPurpose);

  const getTemplateTitle = () => {
    if (formData.callPurpose === 'sales') return t('dashboard.batchCallsPage.salesTemplate');
    if (formData.callPurpose === 'collection') return t('dashboard.batchCallsPage.collectionTemplate');
    return t('dashboard.batchCallsPage.purpose.general');
  };

  // Get template variable keys for current purpose
  const getTemplateVariableKeys = () => {
    return TEMPLATE_VARIABLE_KEYS[formData.callPurpose] || {};
  };

  // Render lock screen when outbound campaigns are not available
  if (!hasAccess && !loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="p-4 bg-primary-100 dark:bg-primary-900 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
            <ArrowUpCircle className="h-10 w-10 text-primary-600 dark:text-primary-400" />
          </div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-3">
            {lockTitle}
          </h2>
          <p className="text-neutral-600 dark:text-neutral-400 mb-6">
            {lockDescription}
          </p>
          {showUpgradeButton && (
            <Link href="/dashboard/subscription">
              <Button size="lg">
                <ArrowUpCircle className="h-4 w-4 mr-2" />
                {t('dashboard.batchCallsPage.upgradePlanBtn')}
              </Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageIntro
        title={pageHelp?.title || t('dashboard.batchCallsPage.title')}
        subtitle={pageHelp?.subtitle}
        locale={locale}
        help={pageHelp ? { tooltipTitle: pageHelp.tooltipTitle, tooltipBody: pageHelp.tooltipBody, quickSteps: pageHelp.quickSteps } : undefined}
        actions={can('campaigns:view') && (
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t('dashboard.batchCallsPage.createNewCall')}
          </Button>
        )}
      />

      {/* Filters */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-4">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <Input
              placeholder={t('dashboard.batchCallsPage.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t('dashboard.batchCallsPage.statusPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('dashboard.batchCallsPage.allStatuses')}</SelectItem>
              <SelectItem value="PENDING">{t('dashboard.batchCallsPage.status.pending')}</SelectItem>
              <SelectItem value="IN_PROGRESS">{t('dashboard.batchCallsPage.status.inProgress')}</SelectItem>
              <SelectItem value="COMPLETED">{t('dashboard.batchCallsPage.status.completed')}</SelectItem>
              <SelectItem value="FAILED">{t('dashboard.batchCallsPage.status.failed')}</SelectItem>
              <SelectItem value="CANCELLED">{t('dashboard.batchCallsPage.status.cancelled')}</SelectItem>
            </SelectContent>
          </Select>

          {/* Assistant Filter */}
          <Select value={assistantFilter} onValueChange={setAssistantFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t('dashboard.batchCallsPage.assistantPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('dashboard.batchCallsPage.allAssistants')}</SelectItem>
              {assistants.map((assistant) => (
                <SelectItem key={assistant.id} value={assistant.id}>
                  {assistant.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date Filter */}
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t('dashboard.batchCallsPage.datePlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('dashboard.batchCallsPage.allTime')}</SelectItem>
              <SelectItem value="today">{t('dashboard.batchCallsPage.today')}</SelectItem>
              <SelectItem value="week">{t('dashboard.batchCallsPage.last7Days')}</SelectItem>
              <SelectItem value="month">{t('dashboard.batchCallsPage.last30Days')}</SelectItem>
              <SelectItem value="quarter">{t('dashboard.batchCallsPage.last90Days')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Call History Table */}
      {loading ? (
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        </div>
      ) : filteredBatchCalls.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title={t('dashboard.batchCallsPage.noCallsYet')}
          description={t('dashboard.batchCallsPage.createBatchCallsDesc')}
          action={
            can('campaigns:view') && (
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {t('dashboard.batchCallsPage.createFirstCall')}
              </Button>
            )
          }
        />
      ) : (
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
              <tr>
                <th className="px-4 py-2.5 text-left text-sm font-medium text-neutral-600 dark:text-neutral-300">
                  {t('dashboard.batchCallsPage.callTableHeader')}
                </th>
                <th className="px-4 py-2.5 text-left text-sm font-medium text-neutral-600 dark:text-neutral-300">
                  {t('dashboard.batchCallsPage.assistantTableHeader')}
                </th>
                <th className="px-4 py-2.5 text-left text-sm font-medium text-neutral-600 dark:text-neutral-300">
                  {t('dashboard.batchCallsPage.statusTableHeader')}
                </th>
                <th className="px-4 py-2.5 text-left text-sm font-medium text-neutral-600 dark:text-neutral-300">
                  {t('dashboard.batchCallsPage.progressTableHeader')}
                </th>
                <th className="px-4 py-2.5 text-left text-sm font-medium text-neutral-600 dark:text-neutral-300">
                  {t('dashboard.batchCallsPage.dateTableHeader')}
                </th>
                <th className="px-4 py-2.5 text-center text-sm font-medium text-neutral-600 dark:text-neutral-300">
                  {t('dashboard.batchCallsPage.actionsTableHeader')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {filteredBatchCalls.map((batch) => {
                const statusConfig = STATUS_CONFIG[batch.status] || STATUS_CONFIG.PENDING;
                const StatusIcon = statusConfig.icon;
                const progress = batch.totalRecipients > 0
                  ? Math.round((batch.completedCalls / batch.totalRecipients) * 100)
                  : 0;

                return (
                  <tr key={batch.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center">
                        <div>
                          <div className="text-sm font-medium text-neutral-900 dark:text-white">{batch.name}</div>
                          <div className="text-xs text-neutral-500">
                            {batch.totalRecipients} {t('dashboard.batchCallsPage.recipients')}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-neutral-900 dark:text-white">{batch.assistant?.name || '-'}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge variant="ghost" className={`${statusConfig.color} flex items-center gap-1 w-fit`}>
                        <StatusIcon className={`h-3 w-3 ${batch.status === 'IN_PROGRESS' ? 'animate-spin' : ''}`} />
                        {t(statusConfig.labelKey)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-600 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-neutral-600 dark:text-neutral-400">
                          {batch.completedCalls}/{batch.totalRecipients}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-neutral-600 dark:text-neutral-400">
                        {formatDate(batch.createdAt, 'short', locale)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Link href={`/dashboard/batch-calls/${batch.id}`}>
                          <Button variant="outline" size="sm">
                            <Eye className="h-3 w-3 mr-1" />
                            {t('dashboard.batchCallsPage.details')}
                          </Button>
                        </Link>
                        {(batch.status === 'PENDING' || batch.status === 'IN_PROGRESS') && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCancel(batch.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            {t('common.cancel')}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal - Full Screen */}
      <Dialog
        open={showCreateModal}
        onOpenChange={(open) => {
          setShowCreateModal(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-primary-600" />
                {t('dashboard.batchCallsPage.createNewCall')}
              </DialogTitle>
            </div>
            <DialogDescription>
              {createStep === 1 && t('dashboard.batchCallsPage.enterCallInfo')}
              {createStep === 2 && t('dashboard.batchCallsPage.uploadAndMap')}
              {createStep === 3 && t('dashboard.batchCallsPage.setScheduleConfirm')}
            </DialogDescription>
          </DialogHeader>

          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-2 py-4">
            {[1, 2, 3].map((step) => (
              <React.Fragment key={step}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  createStep >= step
                    ? 'bg-primary-600 text-white'
                    : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
                }`}>
                  {step}
                </div>
                {step < 3 && (
                  <div className={`w-16 h-1 rounded-full transition-colors ${
                    createStep > step
                      ? 'bg-primary-600'
                      : 'bg-neutral-200 dark:bg-neutral-700'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>

          <div className="space-y-6 py-4">
            {/* Step 1: Basic Info */}
            {createStep === 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label>{t('dashboard.batchCallsPage.callName')} *</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder={t('dashboard.batchCallsPage.callNamePlaceholder')}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label>{t('dashboard.batchCallsPage.callPurpose')} *</Label>
                    <Select
                      value={formData.callPurpose}
                      onValueChange={(value) => setFormData({ ...formData, callPurpose: value, assistantId: '' })}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder={t('dashboard.batchCallsPage.selectCallPurpose')} />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CALL_PURPOSE_KEYS).map(([key, labelKey]) => (
                          <SelectItem key={key} value={key}>
                            {t(labelKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>{t('dashboard.batchCallsPage.phoneNumber')} *</Label>
                    <Select
                      value={formData.phoneNumberId}
                      onValueChange={(value) => setFormData({ ...formData, phoneNumberId: value })}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder={t('dashboard.batchCallsPage.selectNumber')} />
                      </SelectTrigger>
                      <SelectContent>
                        {phoneNumbers.map((phone) => (
                          <SelectItem key={phone.id} value={phone.id}>
                            {phone.phoneNumber}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>{t('dashboard.batchCallsPage.assistant')} *</Label>
                    <Select
                      value={formData.assistantId}
                      onValueChange={(value) => setFormData({ ...formData, assistantId: value })}
                      disabled={!formData.callPurpose}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder={
                          !formData.callPurpose
                            ? t('dashboard.batchCallsPage.selectPurposeFirst')
                            : t('dashboard.batchCallsPage.selectOutboundAssistant')
                        } />
                      </SelectTrigger>
                      <SelectContent>
                        {assistants
                          .filter(a => a.callPurpose === formData.callPurpose)
                          .map((assistant) => (
                            <SelectItem key={assistant.id} value={assistant.id}>
                              {assistant.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {formData.callPurpose && assistants.filter(a => a.callPurpose === formData.callPurpose).length === 0 && (
                      <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {t('dashboard.batchCallsPage.noAssistantForPurpose').replace('{{purpose}}', t(CALL_PURPOSE_KEYS[formData.callPurpose]))}
                      </p>
                    )}
                    {!formData.callPurpose && assistants.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {t('dashboard.batchCallsPage.createOutboundFirst')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: File Upload & Column Mapping */}
            {createStep === 2 && (
              <div className="space-y-6">
                {/* Template Download Section */}
                {hasTemplate && (
                  <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-neutral-900 dark:text-white">
                        {getTemplateTitle()}
                      </p>
                      <p className="text-sm text-neutral-500">
                        {t('dashboard.batchCallsPage.downloadFillTemplate')}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => downloadTemplate(formData.callPurpose)}>
                      <Download className="h-4 w-4 mr-2" />
                      {t('dashboard.batchCallsPage.downloadTemplate')}
                    </Button>
                  </div>
                )}

                {/* File Upload Area */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
                    ${selectedFile ? 'border-primary-300 bg-primary-50 dark:bg-primary-950' : 'border-neutral-300 hover:border-primary-400 dark:border-neutral-600'}
                  `}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {uploading ? (
                    <div className="flex flex-col items-center">
                      <Loader2 className="h-12 w-12 text-primary-600 animate-spin mb-3" />
                      <p className="text-neutral-600 dark:text-neutral-400">
                        {t('dashboard.batchCallsPage.readingFile')}
                      </p>
                    </div>
                  ) : selectedFile ? (
                    <div className="flex flex-col items-center">
                      <FileSpreadsheet className="h-12 w-12 text-primary-600 mb-3" />
                      <p className="font-medium text-neutral-900 dark:text-white">{selectedFile.name}</p>
                      <p className="text-sm text-neutral-500 mb-2">
                        {(selectedFile.size / 1024).toFixed(1)} KB • {fileData.totalRows} {t('dashboard.batchCallsPage.rows')}
                      </p>
                      <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setFileData({ columns: [], preview: [], totalRows: 0 }); setColumnMapping({}); }}>
                        <X className="h-4 w-4 mr-1" />
                        {t('dashboard.batchCallsPage.remove')}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <Upload className="h-12 w-12 text-neutral-400 mb-3" />
                      <p className="font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                        {t('dashboard.batchCallsPage.clickToUpload')}
                      </p>
                      <p className="text-sm text-neutral-500">
                        CSV, XLS, XLSX (max 5MB)
                      </p>
                    </div>
                  )}
                </div>

                {/* Column Mapping */}
                {fileData.columns.length > 0 && (
                  <div className="space-y-4">
                    <h4 className="font-medium text-neutral-900 dark:text-white">
                      {t('dashboard.batchCallsPage.columnMapping')}
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Phone column (required) */}
                      <div>
                        <Label className="flex items-center gap-1">
                          <Phone className="h-4 w-4" />
                          {t('dashboard.batchCallsPage.phoneNumberColumn')} *
                        </Label>
                        <Select
                          value={columnMapping.phone || ''}
                          onValueChange={(value) => setColumnMapping({ ...columnMapping, phone: value })}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder={t('dashboard.batchCallsPage.selectColumn')} />
                          </SelectTrigger>
                          <SelectContent>
                            {fileData.columns.map((col) => (
                              <SelectItem key={col} value={col}>{col}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Customer name column */}
                      <div>
                        <Label>{t('dashboard.batchCallsPage.customerName')}</Label>
                        <Select
                          value={columnMapping.customer_name || ''}
                          onValueChange={(value) => setColumnMapping({
                            ...columnMapping,
                            customer_name: value === '_none_' ? undefined : value
                          })}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder={t('dashboard.batchCallsPage.optional')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none_">{t('dashboard.batchCallsPage.noneOption')}</SelectItem>
                            {fileData.columns.map((col) => (
                              <SelectItem key={col} value={col}>{col}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Template-specific columns */}
                      {hasTemplate && Object.entries(getTemplateVariableKeys()).map(([key, labelKey]) => (
                        <div key={key}>
                          <Label>{t(labelKey)}</Label>
                          <Select
                            value={columnMapping[key] || ''}
                            onValueChange={(value) => setColumnMapping({
                              ...columnMapping,
                              [key]: value === '_none_' ? undefined : value
                            })}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder={t('dashboard.batchCallsPage.optional')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none_">{t('dashboard.batchCallsPage.noneOption')}</SelectItem>
                              {fileData.columns.map((col) => (
                                <SelectItem key={col} value={col}>{col}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>

                    {/* Preview table */}
                    {fileData.preview.length > 0 && (
                      <div className="mt-4">
                        <Label className="mb-2 block">{t('dashboard.batchCallsPage.previewRows')}</Label>
                        <div className="overflow-x-auto border dark:border-neutral-700 rounded-lg">
                          <table className="w-full text-sm">
                            <thead className="bg-neutral-50 dark:bg-neutral-800">
                              <tr>
                                {fileData.columns.map((col) => (
                                  <th key={col} className="px-3 py-2 text-left font-medium text-neutral-600 dark:text-neutral-400">
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {fileData.preview.map((row, idx) => (
                                <tr key={idx} className="border-t dark:border-neutral-700">
                                  {fileData.columns.map((col) => (
                                    <td key={col} className="px-3 py-2 text-neutral-900 dark:text-white">
                                      {String(row[col] || '')}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Scheduling & Confirm */}
            {createStep === 3 && (
              <div className="space-y-6">
                {/* Scheduling Options */}
                <div>
                  <Label className="mb-3 block">{t('dashboard.batchCallsPage.scheduling')}</Label>
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, startImmediately: true })}
                      className={`flex-1 p-4 border-2 rounded-xl text-left transition-colors ${
                        formData.startImmediately ? 'border-primary-500 bg-primary-50 dark:bg-primary-950' : 'border-neutral-200 dark:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Phone className="h-5 w-5 text-primary-600" />
                        <span className="font-medium text-neutral-900 dark:text-white">
                          {t('dashboard.batchCallsPage.startImmediately')}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-500">
                        {t('dashboard.batchCallsPage.callsStartImmediately')}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, startImmediately: false })}
                      className={`flex-1 p-4 border-2 rounded-xl text-left transition-colors ${
                        !formData.startImmediately ? 'border-primary-500 bg-primary-50 dark:bg-primary-950' : 'border-neutral-200 dark:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar className="h-5 w-5 text-primary-600" />
                        <span className="font-medium text-neutral-900 dark:text-white">
                          {t('dashboard.batchCallsPage.scheduleLater')}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-500">
                        {t('dashboard.batchCallsPage.chooseDateTime')}
                      </p>
                    </button>
                  </div>

                  {!formData.startImmediately && (
                    <div className="mt-4">
                      <Label>{t('dashboard.batchCallsPage.startTime')}</Label>
                      <Input
                        type="datetime-local"
                        value={formData.scheduledAt || ''}
                        onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                        min={new Date().toISOString().slice(0, 16)}
                        className="mt-1 max-w-xs"
                      />
                    </div>
                  )}
                </div>

                {/* Summary */}
                <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-4 space-y-3">
                  <h4 className="font-medium text-neutral-900 dark:text-white mb-3">
                    {t('dashboard.batchCallsPage.summary')}
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-neutral-500">{t('dashboard.batchCallsPage.callNameSummary')}</span>
                      <p className="font-medium text-neutral-900 dark:text-white">{formData.name}</p>
                    </div>
                    <div>
                      <span className="text-neutral-500">{t('dashboard.batchCallsPage.callPurposeSummary')}</span>
                      <p className="font-medium text-neutral-900 dark:text-white">
                        {CALL_PURPOSE_KEYS[formData.callPurpose] ? t(CALL_PURPOSE_KEYS[formData.callPurpose]) : '-'}
                      </p>
                    </div>
                    <div>
                      <span className="text-neutral-500">{t('dashboard.batchCallsPage.assistantSummary')}</span>
                      <p className="font-medium text-neutral-900 dark:text-white">
                        {assistants.find(a => a.id === formData.assistantId)?.name || '-'}
                      </p>
                    </div>
                    <div>
                      <span className="text-neutral-500">{t('dashboard.batchCallsPage.phoneSummary')}</span>
                      <p className="font-medium text-neutral-900 dark:text-white">
                        {phoneNumbers.find(p => p.id === formData.phoneNumberId)?.phoneNumber || '-'}
                      </p>
                    </div>
                    <div>
                      <span className="text-neutral-500">{t('dashboard.batchCallsPage.totalRecipients')}</span>
                      <p className="font-medium text-primary-600 dark:text-primary-400">{fileData.totalRows}</p>
                    </div>
                    <div>
                      <span className="text-neutral-500">{t('dashboard.batchCallsPage.schedulingSummary')}</span>
                      <p className="font-medium text-neutral-900 dark:text-white">
                        {formData.startImmediately
                          ? t('dashboard.batchCallsPage.startImmediatelyOption')
                          : formatDate(formData.scheduledAt, 'long', locale)
                        }
                      </p>
                    </div>
                  </div>
                </div>

                {/* Warning */}
                <div className="bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4">
                  <div className="flex gap-2">
                    <AlertCircle className="h-5 w-5 text-neutral-600 dark:text-neutral-400 flex-shrink-0" />
                    <p className="text-sm text-neutral-700 dark:text-neutral-300">
                      {t('dashboard.batchCallsPage.warningAutoCall').replace('{{count}}', fileData.totalRows)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="flex justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                if (createStep === 1) {
                  setShowCreateModal(false);
                  resetForm();
                } else {
                  setCreateStep(createStep - 1);
                }
              }}
            >
              {createStep === 1
                ? t('common.cancel')
                : t('common.back')
              }
            </Button>

            {createStep < 3 ? (
              <Button
                onClick={() => {
                  if (createStep === 1) {
                    if (!formData.name || !formData.assistantId || !formData.phoneNumberId || !formData.callPurpose) {
                      toast.error(t('dashboard.batchCallsPage.fillRequired'));
                      return;
                    }
                    setCreateStep(2);
                  } else if (createStep === 2) {
                    if (!selectedFile) {
                      toast.error(t('dashboard.batchCallsPage.uploadFileShort'));
                      return;
                    }
                    if (!columnMapping.phone) {
                      toast.error(t('dashboard.batchCallsPage.selectPhoneCol'));
                      return;
                    }
                    setCreateStep(3);
                  }
                }}
                disabled={uploading}
              >
                {t('common.continue')}
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('dashboard.batchCallsPage.creating')}
                  </>
                ) : (
                  <>
                    <Megaphone className="h-4 w-4 mr-2" />
                    {t('dashboard.batchCallsPage.startCall')}
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
