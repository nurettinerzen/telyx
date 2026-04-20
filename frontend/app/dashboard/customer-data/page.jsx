'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import EmptyState from '@/components/EmptyState';
import {
  Users,
  Plus,
  Upload,
  FileSpreadsheet,
  Download,
  Search,
  Trash2,
  Pencil,
  Eye,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  X,
  Phone,
  Calculator,
  Wrench,
  Calendar,
  Package,
  HelpCircle,
  FileText,
  ArrowLeft,
  MoreVertical,
  Clock
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import PageIntro from '@/components/PageIntro';
import { getPageHelp } from '@/content/pageHelp';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useCustomerDataFiles,
  useCustomerDataRecords,
  useDeleteCustomerDataFile,
  useImportCustomerDataFile,
} from '@/hooks/useCustomerData';

// Data type options for inbound calls - labels resolved via t() at render time
const DATA_TYPE_OPTIONS_CONFIG = {
  accounting: {
    labelKey: 'dashboard.customerDataPage.dataTypeAccounting',
    descKey: 'dashboard.customerDataPage.dataTypeAccountingDesc',
    icon: Calculator,
    color: 'bg-neutral-100 text-neutral-600 dark:bg-white/8 dark:text-neutral-400'
  },
  support: {
    labelKey: 'dashboard.customerDataPage.dataTypeSupport',
    descKey: 'dashboard.customerDataPage.dataTypeSupportDesc',
    icon: Wrench,
    color: 'bg-neutral-100 text-neutral-600 dark:bg-white/8 dark:text-neutral-400'
  },
  appointment: {
    labelKey: 'dashboard.customerDataPage.dataTypeAppointment',
    descKey: 'dashboard.customerDataPage.dataTypeAppointmentDesc',
    icon: Calendar,
    color: 'bg-neutral-100 text-neutral-600 dark:bg-white/8 dark:text-neutral-400'
  },
  order: {
    labelKey: 'dashboard.customerDataPage.dataTypeOrder',
    descKey: 'dashboard.customerDataPage.dataTypeOrderDesc',
    icon: Package,
    color: 'bg-neutral-100 text-neutral-600 dark:bg-white/8 dark:text-neutral-400'
  },
  custom: {
    labelKey: 'dashboard.customerDataPage.dataTypeOther',
    descKey: 'dashboard.customerDataPage.dataTypeOtherDesc',
    icon: HelpCircle,
    color: 'bg-neutral-100 text-neutral-600 dark:bg-white/8 dark:text-neutral-400'
  }
};

// Format date for display
const formatDateDisplay = (dateValue, locale = 'tr') => {
  if (!dateValue) return '-';
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return dateValue;
    return date.toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return dateValue;
  }
};

export default function CustomerDataPage() {
  const { t, locale } = useLanguage();
  const pageHelp = getPageHelp('customerData', locale);

  // View mode: 'files' or 'records'
  const [viewMode, setViewMode] = useState('files');
  const [selectedFile, setSelectedFile] = useState(null);

  // Records pagination state
  const [recordsPagination, setRecordsPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  });

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Modals
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDeleteFileModal, setShowDeleteFileModal] = useState(false);
  const [showRecordDetailModal, setShowRecordDetailModal] = useState(false);
  const [fileToDelete, setFileToDelete] = useState(null);
  const [currentRecord, setCurrentRecord] = useState(null);

  // Upload state
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [uploadStep, setUploadStep] = useState(1);
  const [selectedDataType, setSelectedDataType] = useState('');

  const fileInputRef = useRef(null);

  // Records view state (for bulk operations, edit, add)
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [addFormData, setAddFormData] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  // Inline editing removed - was causing data sync issues

  // React Query hooks
  const { data: files = [], isLoading: loadingFiles } = useCustomerDataFiles();
  const {
    data: recordsData,
    isLoading: loadingRecords,
    refetch: refetchRecords
  } = useCustomerDataRecords(
    selectedFile?.id,
    {
      page: recordsPagination.page,
      limit: recordsPagination.limit,
      search: debouncedSearch || undefined
    }
  );

  const deleteFile = useDeleteCustomerDataFile();
  const importFile = useImportCustomerDataFile();

  const records = recordsData?.records || [];

  // Update pagination when records data changes
  useEffect(() => {
    if (recordsData?.pagination) {
      setRecordsPagination(prev => ({
        ...prev,
        ...recordsData.pagination
      }));
    }
  }, [recordsData]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Open file to view records
  const openFile = (file) => {
    setSelectedFile(file);
    setViewMode('records');
    setSearchQuery('');
    setDebouncedSearch('');
    setRecordsPagination(prev => ({ ...prev, page: 1 }));
  };

  // Go back to file list
  const goBackToFiles = () => {
    setViewMode('files');
    setSelectedFile(null);
    setRecords([]);
    setSearchQuery('');
    setDebouncedSearch('');
  };

  // Delete file
  const handleDeleteFile = async () => {
    if (!fileToDelete) return;

    try {
      await deleteFile.mutateAsync(fileToDelete.id);
      toast.success(t('dashboard.customerDataPage.fileDeleted'));
      setShowDeleteFileModal(false);
      setFileToDelete(null);
    } catch (error) {
      console.error('Error deleting file:', error);
      toast.error(t('dashboard.customerDataPage.deleteFailed'));
    }
  };

  // Download template based on selected data type
  const handleDownloadTemplate = async () => {
    try {
      const res = await apiClient.customerData.downloadTemplate(selectedDataType || 'custom');
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = url;
      // Use data type specific filename
      const fileNames = {
        accounting: 'muhasebe-sablon.xlsx',
        support: 'ariza-takip-sablon.xlsx',
        appointment: 'randevu-sablon.xlsx',
        order: 'siparis-sablon.xlsx',
        custom: 'musteri-verileri-sablon.xlsx'
      };
      link.download = fileNames[selectedDataType] || 'musteri-verileri-sablon.xlsx';
      document.body.appendChild(link);
      link.click();
      // Clean up after a delay to ensure download starts
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);
      toast.success(t('dashboard.customerDataPage.templateDownloaded'));
    } catch (error) {
      console.error('Error downloading template:', error);
      toast.error(t('dashboard.customerDataPage.failedToDownloadTemplate'));
    }
  };

  // File select for upload
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (!allowedTypes.includes(file.type) && !file.name.endsWith('.csv') && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.error(t('dashboard.customerDataPage.onlyCsvExcelAllowed'));
      return;
    }

    setUploadFile(file);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await apiClient.customerData.parseFile(formData);
      setUploadPreview(res.data);
      setUploadStep(3);
    } catch (error) {
      console.error('Error parsing file:', error);
      toast.error(error.response?.data?.error || t('dashboard.customerDataPage.failedToParseFile'));
      setUploadFile(null);
    } finally {
      setUploading(false);
    }
  };

  // Import file
  const handleImport = async () => {
    if (!uploadFile) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('dataType', selectedDataType);

      const res = await importFile.mutateAsync(formData);
      setImportResult(res.data.results);
      setUploadStep(4);
      // importFile.mutateAsync already invalidates the query, so no need to call loadFiles()
    } catch (error) {
      console.error('Error importing file:', error);
      toast.error(error.response?.data?.error || t('dashboard.customerDataPage.importFailed'));
    } finally {
      setUploading(false);
    }
  };

  // Reset upload modal
  const resetUploadModal = () => {
    setUploadFile(null);
    setUploadPreview(null);
    setImportResult(null);
    setUploadStep(1);
    setSelectedDataType('');
    setShowUploadModal(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Get data type info
  const getDataTypeInfo = (dataType) => {
    return DATA_TYPE_OPTIONS_CONFIG[dataType] || DATA_TYPE_OPTIONS_CONFIG.custom;
  };

  // Pagination
  const goToPage = (page) => {
    setRecordsPagination(prev => ({ ...prev, page }));
  };

  // ============================================================
  // FILE LIST VIEW
  // ============================================================
  if (viewMode === 'files') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <PageIntro
          title={pageHelp?.title || t('dashboard.customerDataPage.title')}
          subtitle={pageHelp?.subtitle}
          locale={locale}
          help={pageHelp ? { tooltipTitle: pageHelp.tooltipTitle, tooltipBody: pageHelp.tooltipBody, quickSteps: pageHelp.quickSteps } : undefined}
          actions={
            <Button onClick={() => setShowUploadModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {t('dashboard.customerDataPage.uploadNewData')}
            </Button>
          }
        />

        {/* File List */}
        {loadingFiles ? (
          <div className="bg-white dark:bg-[#081224]/95 rounded-xl border border-neutral-200 dark:border-white/10 p-12 flex items-center justify-center shadow-sm">
            <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          </div>
        ) : files.length === 0 ? (
          <EmptyState
            icon={FileSpreadsheet}
            title={t('dashboard.customerDataPage.noFilesYet')}
            description={t('dashboard.customerDataPage.noFilesDescription')}
            action={
              <Button onClick={() => setShowUploadModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                {t('dashboard.customerDataPage.uploadFile')}
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {files.map((file) => {
              const typeInfo = getDataTypeInfo(file.dataType);
              const TypeIcon = typeInfo.icon;

              return (
                <div
                  key={file.id}
                  className="bg-white dark:bg-[#081224]/95 rounded-xl border border-neutral-200 dark:border-white/10 p-4 hover:border-primary-300 dark:hover:border-cyan-500/40 transition-colors cursor-pointer group shadow-sm"
                  onClick={() => openFile(file)}
                >
                  <div className="flex items-start justify-between">
                    <TypeIcon className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFileToDelete(file);
                            setShowDeleteFileModal(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {t('common.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="mt-3">
                    <h3 className="font-medium text-neutral-900 dark:text-white truncate">
                      {file.fileName}
                    </h3>
                    <p className="text-sm text-neutral-500 mt-1">
                      {t(typeInfo.labelKey)}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 mt-4 text-sm text-neutral-500">
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      <span>{file.recordCount} {t('dashboard.customerDataPage.records')}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>{formatDateDisplay(file.createdAt, locale)}</span>
                    </div>
                  </div>

                  {file.status === 'PROCESSING' && (
                    <Badge variant="secondary" className="mt-3">
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      {t('dashboard.customerDataPage.processing')}
                    </Badge>
                  )}
                  {file.status === 'FAILED' && (
                    <Badge variant="destructive" className="mt-3">
                      <XCircle className="h-3 w-3 mr-1" />
                      {t('dashboard.customerDataPage.failed')}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Upload Modal */}
        <Dialog open={showUploadModal} onOpenChange={(open) => !open && resetUploadModal()}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary-600" />
                {t('dashboard.customerDataPage.uploadCustomerData')}
              </DialogTitle>
              <DialogDescription>
                {uploadStep === 1 && t('dashboard.customerDataPage.selectDataType')}
                {uploadStep === 2 && t('dashboard.customerDataPage.uploadFileStep')}
                {uploadStep === 3 && t('dashboard.customerDataPage.previewData')}
                {uploadStep === 4 && t('dashboard.customerDataPage.importResult')}
              </DialogDescription>
            </DialogHeader>

            {/* Progress Steps */}
            <div className="flex items-center justify-center gap-2 py-4">
              {[1, 2, 3, 4].map((step) => (
                <React.Fragment key={step}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    uploadStep >= step
                      ? 'bg-primary-600 text-white'
                      : 'bg-neutral-200 dark:bg-[#0B1730]/88 text-neutral-600 dark:text-neutral-400'
                  }`}>
                    {step}
                  </div>
                  {step < 4 && (
                    <div className={`w-12 h-1 rounded-full transition-colors ${
                      uploadStep > step
                        ? 'bg-primary-600'
                        : 'bg-neutral-200 dark:bg-[#0B1730]/88'
                    }`} />
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Step 1: Select Data Type */}
            {uploadStep === 1 && (
              <div className="space-y-4 py-4">
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  {t('dashboard.customerDataPage.whatTypeOfData')}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(DATA_TYPE_OPTIONS_CONFIG).map(([key, option]) => {
                    const Icon = option.icon;
                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedDataType(key)}
                        className={`p-4 border-2 rounded-xl text-left transition-colors ${
                          selectedDataType === key
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-950'
                            : 'border-neutral-200 dark:border-white/10 hover:border-neutral-300 dark:hover:border-cyan-500/30'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
                          <div>
                            <p className="font-medium text-neutral-900 dark:text-white">
                              {t(option.labelKey)}
                            </p>
                            <p className="text-sm text-neutral-500">
                              {t(option.descKey)}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 2: Upload File */}
            {uploadStep === 2 && (
              <div className="space-y-6 py-4">
                {/* Template Download */}
                <div className="bg-neutral-50 dark:bg-[#0B1730]/88 rounded-lg p-4 flex items-center justify-between border dark:border-white/10">
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-white">
                      {t('dashboard.customerDataPage.sampleTemplate')}
                    </p>
                    <p className="text-sm text-neutral-500">
                      {t('dashboard.customerDataPage.downloadTemplateDesc')}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                    <Download className="h-4 w-4 mr-2" />
                    {t('common.download')}
                  </Button>
                </div>

                {/* File Upload Area */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
                    ${uploadFile ? 'border-primary-300 bg-primary-50 dark:bg-primary-950' : 'border-neutral-300 hover:border-primary-400 dark:border-white/10 dark:bg-[#081224]/50'}
                  `}
                >
                  {uploading ? (
                    <div className="flex flex-col items-center">
                      <Loader2 className="h-12 w-12 text-primary-600 animate-spin mb-3" />
                      <p className="text-neutral-600 dark:text-neutral-400">
                        {t('dashboard.customerDataPage.readingFile')}
                      </p>
                    </div>
                  ) : uploadFile ? (
                    <div className="flex flex-col items-center">
                      <FileSpreadsheet className="h-12 w-12 text-primary-600 mb-3" />
                      <p className="font-medium text-neutral-900 dark:text-white">{uploadFile.name}</p>
                      <p className="text-sm text-neutral-500 mb-2">
                        {(uploadFile.size / 1024).toFixed(1)} KB
                      </p>
                      <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setUploadFile(null); }}>
                        <X className="h-4 w-4 mr-1" />
                        {t('dashboard.customerDataPage.remove')}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <Upload className="h-12 w-12 text-neutral-400 mb-3" />
                      <p className="font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                        {t('dashboard.customerDataPage.clickToUpload')}
                      </p>
                      <p className="text-sm text-neutral-500">
                        CSV, XLS, XLSX (max 5MB)
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 3: Preview */}
            {uploadStep === 3 && uploadPreview && (
              <div className="space-y-4 py-4">
                <div className="p-3 bg-white dark:bg-[#081224]/95 border border-neutral-200 dark:border-white/10 rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
                  <span className="text-neutral-700 dark:text-neutral-300">
                    {t('dashboard.customerDataPage.rowsFound', { count: uploadPreview.totalRows })}
                  </span>
                </div>

                <div className="max-h-64 overflow-auto border dark:border-white/10 rounded-lg dark:bg-[#081224]/70">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 dark:bg-[#0B1730]/88 sticky top-0">
                      <tr>
                        {uploadPreview.columns.slice(0, 6).map((col, i) => (
                          <th key={i} className="px-3 py-2 text-left font-medium text-neutral-600 dark:text-neutral-300 truncate max-w-[120px]">
                            {col}
                          </th>
                        ))}
                        {uploadPreview.columns.length > 6 && (
                          <th className="px-3 py-2 text-left font-medium text-neutral-400">
                            +{uploadPreview.columns.length - 6}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-white/10">
                      {uploadPreview.preview.map((row, i) => (
                        <tr key={i}>
                          {uploadPreview.columns.slice(0, 6).map((col, j) => (
                            <td key={j} className="px-3 py-2 text-neutral-700 dark:text-neutral-300 truncate max-w-[120px]">
                              {String(row[col] || '').substring(0, 20)}
                            </td>
                          ))}
                          {uploadPreview.columns.length > 6 && (
                            <td className="px-3 py-2 text-neutral-400">...</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Phone Matching Info */}
                <div className="bg-neutral-50 dark:bg-[#0B1730]/88 border border-neutral-200 dark:border-white/10 rounded-lg p-4">
                  <div className="flex gap-2">
                    <AlertCircle className="h-5 w-5 text-neutral-600 dark:text-neutral-400 flex-shrink-0" />
                    <p className="text-sm text-neutral-700 dark:text-neutral-300">
                      {t('dashboard.customerDataPage.phoneMatchingInfo')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Result */}
            {uploadStep === 4 && importResult && (
              <div className="space-y-4 py-4">
                {importResult.success > 0 && (
                  <div className="p-3 bg-white dark:bg-[#081224]/95 border border-neutral-200 dark:border-white/10 rounded-lg flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
                    <span className="text-neutral-700 dark:text-neutral-300">
                      {t('dashboard.customerDataPage.newRecordsCreated', { count: importResult.success })}
                    </span>
                  </div>
                )}
                {importResult.updated > 0 && (
                  <div className="p-3 bg-white dark:bg-[#081224]/95 border border-neutral-200 dark:border-white/10 rounded-lg flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
                    <span className="text-neutral-700 dark:text-neutral-300">
                      {t('dashboard.customerDataPage.recordsUpdated', { count: importResult.updated })}
                    </span>
                  </div>
                )}
                {importResult.failed > 0 && (
                  <div className="p-3 bg-white dark:bg-[#081224]/95 border border-neutral-200 dark:border-white/10 rounded-lg">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
                      <span className="text-neutral-700 dark:text-neutral-300">
                        {t('dashboard.customerDataPage.recordsFailed', { count: importResult.failed })}
                      </span>
                    </div>
                    {importResult.errors && importResult.errors.length > 0 && (
                      <ul className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 list-disc list-inside max-h-32 overflow-auto">
                        {importResult.errors.slice(0, 10).map((err, i) => (
                          <li key={i}>
                            {t('dashboard.customerDataPage.rowError', { row: err.row, error: err.error })}
                          </li>
                        ))}
                        {importResult.errors.length > 10 && (
                          <li>...{t('dashboard.customerDataPage.andMoreErrors', { count: importResult.errors.length - 10 })}</li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex justify-between pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  if (uploadStep === 1) {
                    resetUploadModal();
                  } else if (uploadStep === 4) {
                    setUploadFile(null);
                    setUploadPreview(null);
                    setImportResult(null);
                    setUploadStep(2);
                  } else {
                    setUploadStep(uploadStep - 1);
                    if (uploadStep === 3) {
                      setUploadFile(null);
                      setUploadPreview(null);
                    }
                  }
                }}
              >
                {uploadStep === 1
                  ? t('common.close')
                  : t('common.back')
                }
              </Button>

              {uploadStep === 1 && (
                <Button
                  onClick={() => setUploadStep(2)}
                  disabled={!selectedDataType}
                >
                  {t('common.continue')}
                </Button>
              )}

              {uploadStep === 2 && (
                <Button disabled>
                  {t('dashboard.customerDataPage.uploadFile')}
                </Button>
              )}

              {uploadStep === 3 && (
                <Button onClick={handleImport} disabled={uploading}>
                  {uploading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {t('common.import')}
                </Button>
              )}

              {uploadStep === 4 && (
                <Button onClick={resetUploadModal}>
                  {t('dashboard.customerDataPage.done')}
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete File Confirmation Modal */}
        <Dialog open={showDeleteFileModal} onOpenChange={setShowDeleteFileModal}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-red-600">
                {t('dashboard.customerDataPage.deleteFile')}
              </DialogTitle>
              <DialogDescription>
                {t('dashboard.customerDataPage.deleteFileConfirm', { fileName: fileToDelete?.fileName })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteFileModal(false)}>
                {t('common.cancel')}
              </Button>
              <Button variant="destructive" onClick={handleDeleteFile}>
                <Trash2 className="w-4 h-4 mr-2" />
                {t('common.delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ============================================================
  // RECORDS VIEW (when a file is selected)
  // ============================================================
  const typeInfo = selectedFile ? getDataTypeInfo(selectedFile.dataType) : null;
  const fileColumns = selectedFile?.columns || [];

  // Toggle single record selection
  const toggleRecordSelection = (recordId) => {
    setSelectedRecords(prev =>
      prev.includes(recordId)
        ? prev.filter(id => id !== recordId)
        : [...prev, recordId]
    );
  };

  // Toggle all records selection
  const toggleAllRecords = () => {
    if (selectedRecords.length === records.length) {
      setSelectedRecords([]);
    } else {
      setSelectedRecords(records.map(r => r.id));
    }
  };


  // Delete single record
  const handleDeleteRecord = async (recordId) => {
    try {
      await apiClient.customerData.delete(recordId);
      toast.success(t('dashboard.customerDataPage.recordDeleted'));
      refetchRecords();
    } catch (error) {
      console.error('Error deleting record:', error);
      toast.error(t('dashboard.customerDataPage.deleteFailed'));
    }
  };

  // Bulk delete selected records
  const handleBulkDelete = async () => {
    if (selectedRecords.length === 0) return;

    try {
      await apiClient.customerData.bulkDelete(selectedRecords);
      toast.success(t('dashboard.customerDataPage.recordsDeleted', { count: selectedRecords.length }));
      setSelectedRecords([]);
      setShowDeleteConfirmModal(false);
      refetchRecords();
    } catch (error) {
      console.error('Error bulk deleting:', error);
      toast.error(t('dashboard.customerDataPage.deleteFailed'));
    }
  };

  // Add new record manually - dynamic based on file columns
  const handleAddRecord = async () => {
    // Find phone column dynamically
    const phoneColNames = ['Telefon', 'Telefon No', 'Tel', 'Phone', 'Numara', 'GSM', 'Cep'];
    const nameColNames = ['Müşteri Adı', 'İşletme/Müşteri Adı', 'Firma', 'İsim', 'Ad Soyad', 'İsim Soyisim', 'Şirket', 'Company', 'Name'];

    // Get column names from file
    const columnNames = fileColumns.map(c => c.name);

    // Find which columns exist for phone and name
    const phoneCol = columnNames.find(col => phoneColNames.some(p => col.toLowerCase().includes(p.toLowerCase())));
    const nameCol = columnNames.find(col => nameColNames.some(n => col.toLowerCase().includes(n.toLowerCase())));

    // Get values from form data
    const phoneValue = phoneCol ? addFormData[phoneCol] : addFormData.phone;
    const nameValue = nameCol ? addFormData[nameCol] : addFormData.companyName;

    if (!nameValue || !phoneValue) {
      toast.error(t('dashboard.customerDataPage.namePhoneRequired'));
      return;
    }

    setIsSaving(true);
    try {
      // Build customFields from all form data
      const customFields = { ...addFormData };

      // Extract standard fields and keep rest in customFields
      const companyName = nameValue;
      const phone = phoneValue;

      await apiClient.customerData.create({
        companyName,
        phone,
        customFields,
        fileId: selectedFile?.id
      });
      toast.success(t('dashboard.customerDataPage.recordAdded'));
      setShowAddModal(false);
      setAddFormData({});
      refetchRecords();
    } catch (error) {
      console.error('Error adding record:', error);
      const errorMsg = error.response?.data?.error || t('dashboard.customerDataPage.addFailed');
      toast.error(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  // Get value for a column from record
  const getRecordValue = (record, columnName) => {
    // First check customFields - this is where most imported data goes
    if (record.customFields) {
      // Direct match in customFields
      if (record.customFields[columnName] !== undefined && record.customFields[columnName] !== null) {
        const value = record.customFields[columnName];
        // Format date values
        if (typeof value === 'string' && value.includes('T') && value.includes('Z')) {
          return formatDateDisplay(value, locale);
        }
        // Format currency values
        if (typeof value === 'number') {
          return value.toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-US');
        }
        return String(value);
      }
    }

    // Map common column names to record fields (for standard fields)
    const fieldMapping = {
      'İşletme/Müşteri Adı': 'companyName',
      'Müşteri Adı': 'companyName',
      'Firma': 'companyName',
      'Şirket': 'companyName',
      'İsim Soyisim': 'companyName',
      'İsim': 'companyName',
      'Ad Soyad': 'companyName',
      'Yetkili': 'contactName',
      'Telefon': 'phone',
      'Telefon No': 'phone',
      'Tel': 'phone',
      'Numara': 'phone',
      'Email': 'email',
      'E-mail': 'email',
      'E-posta': 'email',
      'VKN': 'vkn',
      'TC No': 'tcNo',
      'Notlar': 'notes',
      'Not': 'notes',
      'Etiketler': 'tags'
    };

    const fieldName = fieldMapping[columnName];
    if (fieldName) {
      const value = record[fieldName];
      if (fieldName === 'tags' && Array.isArray(value)) {
        return value.join(', ');
      }
      if (value !== undefined && value !== null) {
        return String(value);
      }
    }

    // Direct field match on record
    if (record[columnName] !== undefined && record[columnName] !== null) {
      return String(record[columnName]);
    }

    return '-';
  };

  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={goBackToFiles}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('common.back')}
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {typeInfo && (
              <typeInfo.icon className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
            )}
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
              {selectedFile?.fileName}
            </h1>
          </div>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            {selectedFile?.recordCount} {t('dashboard.customerDataPage.records')} - {t('dashboard.customerDataPage.uploaded')}: {formatDateDisplay(selectedFile?.createdAt, locale)}
          </p>
        </div>
      </div>

      {/* Search and Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <Input
            placeholder={t('dashboard.customerDataPage.searchRecords')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          {selectedRecords.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteConfirmModal(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t('dashboard.customerDataPage.deleteCount', { count: selectedRecords.length })}
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => {
              setAddFormData({});
              setShowAddModal(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('dashboard.customerDataPage.addManually')}
          </Button>
        </div>
      </div>

      {/* Records Table */}
      {loadingRecords ? (
        <div className="bg-white dark:bg-[#081224]/95 rounded-xl border border-neutral-200 dark:border-white/10 p-12 flex items-center justify-center shadow-sm">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        </div>
      ) : records.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('dashboard.customerDataPage.noRecordsFound')}
          description={t('dashboard.customerDataPage.noRecordsDescription')}
          action={
            <Button onClick={() => setShowAddModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {t('dashboard.customerDataPage.addRecordManually')}
            </Button>
          }
        />
      ) : (
        <div className="bg-white dark:bg-[#081224]/95 rounded-xl border border-neutral-200 dark:border-white/10 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-50 dark:bg-[#0B1730]/88 border-b border-neutral-200 dark:border-white/10">
                <tr>
                  {/* Checkbox column */}
                  <th className="px-4 py-3 w-12">
                    <input
                      type="checkbox"
                      checked={selectedRecords.length === records.length && records.length > 0}
                      onChange={toggleAllRecords}
                      className="w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                    />
                  </th>
                  {/* Dynamic columns from file */}
                  {fileColumns.map((col, i) => (
                    <th key={i} className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap">
                      {col.name}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider w-24">
                    {t('dashboard.customerDataPage.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-white/10">
                {records.map((record) => (
                  <tr
                    key={record.id}
                    className={`hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors ${
                      selectedRecords.includes(record.id) ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedRecords.includes(record.id)}
                        onChange={() => toggleRecordSelection(record.id)}
                        className="w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                      />
                    </td>
                    {/* Dynamic column values - read only */}
                    {fileColumns.map((col, i) => (
                      <td key={i} className="px-4 py-3">
                        <div className="text-neutral-700 dark:text-neutral-300 max-w-[200px] truncate">
                          {getRecordValue(record, col.name)}
                        </div>
                      </td>
                    ))}
                    {/* Actions - only delete */}
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteRecord(record.id)}
                        className=""
                        title={t('common.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {recordsPagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 dark:border-white/10">
              <p className="text-sm text-neutral-500">
                {selectedRecords.length > 0 ? (
                  <span className="font-medium text-primary-600">
                    {selectedRecords.length} {t('dashboard.customerDataPage.selected')} -
                  </span>
                ) : null}
                {' '}{t('dashboard.customerDataPage.totalRecords', { total: recordsPagination.total })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={recordsPagination.page <= 1}
                  onClick={() => goToPage(recordsPagination.page - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-neutral-700 dark:text-neutral-300">
                  {recordsPagination.page} / {recordsPagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={recordsPagination.page >= recordsPagination.totalPages}
                  onClick={() => goToPage(recordsPagination.page + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Record Modal - Dynamic based on file columns */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              {t('dashboard.customerDataPage.addRecordManually')}
            </DialogTitle>
            <DialogDescription>
              {t('dashboard.customerDataPage.createNewRecord')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Dynamic fields based on file columns */}
            <div className="grid grid-cols-2 gap-4">
              {fileColumns.map((col, index) => {
                // Determine if this is a required field (phone or name)
                const phoneColNames = ['telefon', 'telefon no', 'tel', 'phone', 'numara', 'gsm', 'cep'];
                const nameColNames = ['müşteri adı', 'işletme/müşteri adı', 'firma', 'isim', 'ad soyad', 'isim soyisim', 'şirket', 'company', 'name'];
                const colNameLower = col.name.toLowerCase();
                const isPhoneField = phoneColNames.some(p => colNameLower.includes(p));
                const isNameField = nameColNames.some(n => colNameLower.includes(n));
                const isRequired = isPhoneField || isNameField;

                return (
                  <div key={col.name || index}>
                    <Label>
                      {col.name}
                      {isRequired && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    <Input
                      value={addFormData[col.name] || ''}
                      onChange={(e) => setAddFormData({ ...addFormData, [col.name]: e.target.value })}
                      placeholder={col.name}
                    />
                  </div>
                );
              })}
            </div>

            {/* If no columns, show fallback fields */}
            {fileColumns.length === 0 && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('dashboard.customerDataPage.customerName')} *</Label>
                  <Input
                    value={addFormData.companyName || ''}
                    onChange={(e) => setAddFormData({ ...addFormData, companyName: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{t('dashboard.customerDataPage.phone')} *</Label>
                  <Input
                    value={addFormData.phone || ''}
                    onChange={(e) => setAddFormData({ ...addFormData, phone: e.target.value })}
                    placeholder="5XX XXX XX XX"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleAddRecord} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('common.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Modal */}
      <Dialog open={showDeleteConfirmModal} onOpenChange={setShowDeleteConfirmModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">
              {t('dashboard.customerDataPage.deleteRecords')}
            </DialogTitle>
            <DialogDescription>
              {t('dashboard.customerDataPage.deleteRecordsConfirm', { count: selectedRecords.length })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirmModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
