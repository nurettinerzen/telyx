/**
 * Knowledge Base Page - Retell.ai inspired
 * Manage documents and FAQs for AI training
 */

'use client';

import React, { useState, useEffect, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import EmptyState from '@/components/EmptyState';
import { Upload, FileText, MessageSquare, Plus, Trash2, Eye, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useDocuments,
  useFaqs,
  useDocument,
  useUploadDocument,
  useDeleteDocument,
  useCreateFaq,
  useDeleteFaq
} from '@/hooks/useKnowledge';
import { toast } from 'sonner';
import { formatDate, formatFileSize } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermissions } from '@/hooks/usePermissions';
import PageIntro from '@/components/PageIntro';
import { getPageHelp } from '@/content/pageHelp';
import {
  FlowBadge,
  FlowPageShell,
  FlowPanel,
  FlowStatCard,
} from '@/components/dashboard/FlowPageShell';

function KnowledgeBaseContent() {
  const { t, locale } = useLanguage();
  const { can } = usePermissions();
  const pageHelp = getPageHelp('knowledgeBase', locale);
  const searchParams = useSearchParams();
  const router = useRouter();

  // Get active tab from URL or default to 'documents'
  // CRITICAL: Initialize directly from URL param to prevent flash on refresh
  const urlTab = searchParams.get('tab');
  const validTabs = ['documents', 'faqs'];
  const initialTab = validTabs.includes(urlTab) ? urlTab : 'documents';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Sync activeTab with URL when URL changes (e.g., browser back/forward)
  useEffect(() => {
    const currentUrlTab = searchParams.get('tab');
    if (currentUrlTab && validTabs.includes(currentUrlTab) && currentUrlTab !== activeTab) {
      setActiveTab(currentUrlTab);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // React Query hooks
  const { data: documentsData, isLoading: docsLoading } = useDocuments();
  const { data: faqsData, isLoading: faqsLoading } = useFaqs();
  const uploadDocument = useUploadDocument();
  const deleteDocument = useDeleteDocument();
  const createFaq = useCreateFaq();
  const deleteFaq = useDeleteFaq();

  // Map backend fields to frontend expected fields
  const documents = (documentsData?.documents || []).map(doc => ({
    ...doc,
    name: doc.title || doc.name || '',
    size: doc.fileSize || doc.size || 0,
    uploadedAt: doc.createdAt || doc.uploadedAt
  }));
  const faqs = faqsData?.faqs || [];
  const loading = docsLoading || faqsLoading;

  const [uploadingFile, setUploadingFile] = useState(false);

  // Modal states
  const [showDocModal, setShowDocModal] = useState(false);
  const [showFaqModal, setShowFaqModal] = useState(false);

  // Form states
  const [docName, setDocName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [faqForm, setFaqForm] = useState({ question: '', answer: '', category: '' });
  const fileInputRef = useRef(null);

  // Content viewer modal states
  const [showContentModal, setShowContentModal] = useState(false);
  const [contentModalData, setContentModalData] = useState(null);
  const [loadingContent, setLoadingContent] = useState(false);

  const allowedExtensions = ['pdf', 'docx', 'txt', 'csv'];
  const maxUploadSizeBytes = 10 * 1024 * 1024;

  const resetFilePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearDocumentUploadState = () => {
    setDocName('');
    setSelectedFile(null);
    setIsDragActive(false);
    resetFilePicker();
  };

  const handleDocModalOpenChange = (nextOpen) => {
    setShowDocModal(nextOpen);
    if (!nextOpen) {
      clearDocumentUploadState();
    }
  };

  const getUploadValidationError = (file) => {
    if (!file) {
      return locale === 'tr' ? 'Dosya seçilemedi.' : 'Could not read the selected file.';
    }

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !allowedExtensions.includes(extension)) {
      return locale === 'tr'
        ? 'Yalnızca PDF, DOCX, TXT veya CSV dosyaları yükleyebilirsiniz.'
        : 'Only PDF, DOCX, TXT, or CSV files can be uploaded.';
    }

    if (file.size > maxUploadSizeBytes) {
      return locale === 'tr'
        ? 'Dosya boyutu 10 MB sınırını aşıyor.'
        : 'The file exceeds the 10 MB size limit.';
    }

    return null;
  };

  const applySelectedFile = (file) => {
    const validationError = getUploadValidationError(file);
    if (validationError) {
      toast.error(validationError);
      resetFilePicker();
      return false;
    }

    setSelectedFile(file);
    if (!docName) {
      setDocName(file.name.replace(/\.[^/.]+$/, ''));
    }

    return true;
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      applySelectedFile(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragActive) {
      setIsDragActive(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const nextTarget = e.relatedTarget;
    if (nextTarget && e.currentTarget.contains(nextTarget)) {
      return;
    }
    setIsDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const droppedFiles = Array.from(e.dataTransfer?.files || []);
    if (droppedFiles.length === 0) {
      return;
    }

    if (droppedFiles.length > 1) {
      toast.error(t('dashboard.knowledgeBasePage.dropSingleFile'));
    }

    applySelectedFile(droppedFiles[0]);
  };

  const handleSaveDocument = async () => {
    if (!docName) {
      toast.error(t('dashboard.knowledgeBasePage.enterKnowledgeBaseName'));
      return;
    }

    if (!selectedFile) {
      toast.error(t('dashboard.knowledgeBasePage.selectFileToUpload'));
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('name', docName);

    setUploadingFile(true);
    const uploadToast = toast.loading(t('dashboard.knowledgeBasePage.uploadingText'));

    try {
      await uploadDocument.mutateAsync(formData);
      toast.success(t('dashboard.knowledgeBasePage.documentUploadedSuccess'), { id: uploadToast });
      setShowDocModal(false);
      clearDocumentUploadState();
    } catch (error) {
      toast.error(error.response?.data?.error || t('dashboard.knowledgeBasePage.uploadFailed'), { id: uploadToast });
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDeleteDocument = async (id) => {
    try {
      const deleteToast = toast.loading(t('dashboard.knowledgeBasePage.deletingText'));
      await deleteDocument.mutateAsync(id);
      toast.success(t('dashboard.knowledgeBasePage.documentDeleted'), { id: deleteToast });
    } catch (error) {
      toast.error(t('dashboard.knowledgeBasePage.failedToDeleteDocument'));
    }
  };

  const handleCreateFaq = async () => {
    if (!faqForm.question || !faqForm.answer) {
      toast.error(t('dashboard.knowledgeBasePage.fillQuestionAnswer'));
      return;
    }

    try {
      const createToast = toast.loading(t('dashboard.knowledgeBasePage.creatingFaq'));
      await createFaq.mutateAsync(faqForm);
      toast.success(t('dashboard.knowledgeBasePage.faqCreated'), { id: createToast });
      setShowFaqModal(false);
      setFaqForm({ question: '', answer: '', category: '' });
    } catch (error) {
      toast.error(t('dashboard.knowledgeBasePage.failedToCreateFaq'));
    }
  };

  const handleDeleteFaq = async (id) => {
    try {
      const deleteToast = toast.loading(t('dashboard.knowledgeBasePage.deletingText'));
      await deleteFaq.mutateAsync(id);
      toast.success(t('dashboard.knowledgeBasePage.faqDeleted'), { id: deleteToast });
    } catch (error) {
      toast.error(t('dashboard.knowledgeBasePage.failedToDeleteFaq'));
    }
  };

  // View document content
  const handleViewDocument = async (doc) => {
    setLoadingContent(true);
    setShowContentModal(true);
    setContentModalData({ type: 'document', title: doc.name || doc.title, content: null });

    // Content is already available from the list query (Prisma returns all fields)
    if (doc.content) {
      setContentModalData({
        type: 'document',
        title: doc.name || doc.title,
        content: doc.content
      });
      setLoadingContent(false);
      return;
    }

    // Fallback: fetch from API if content wasn't in list data
    try {
      const response = await apiClient.knowledge.getDocument(doc.id);
      setContentModalData({
        type: 'document',
        title: response.data.document?.title || doc.name,
        content: response.data.document?.content || t('dashboard.knowledgeBasePage.noContent')
      });
    } catch (error) {
      console.error('Failed to load document content:', error);
      setContentModalData({
        type: 'document',
        title: doc.name || doc.title,
        content: t('dashboard.knowledgeBasePage.failedToLoadContent')
      });
    } finally {
      setLoadingContent(false);
    }
  };

  // Skeleton loader for initial loading state
  const KnowledgeBaseSkeleton = () => (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div>
        <div className="h-9 w-48 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse" />
        <div className="h-5 w-96 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse mt-2" />
      </div>

      {/* Tabs skeleton */}
      <div className="border-b border-neutral-200 dark:border-neutral-700">
        <div className="flex gap-4 pb-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-9 w-24 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse" />
          ))}
        </div>
      </div>

      {/* Content skeleton */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700">
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
              <div className="h-10 w-10 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse" />
                <div className="h-3 w-24 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse" />
              </div>
              <div className="h-6 w-16 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Show skeleton while loading initial data
  if (loading) {
    return <KnowledgeBaseSkeleton />;
  }

  const readyDocuments = documents.filter((doc) => doc.status === 'ACTIVE' || doc.status === 'ready').length;
  const pendingDocuments = documents.filter((doc) => doc.status === 'PROCESSING' || doc.status === 'processing').length;

  return (
    <div className="space-y-6 pb-12">
      <FlowPageShell className="mx-auto max-w-7xl">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <div className="space-y-4">
            <FlowBadge accent="teal">{locale === 'tr' ? 'Bilgi Katmani' : 'Knowledge Layer'}</FlowBadge>
            <PageIntro
              title={pageHelp?.title || t('dashboard.knowledgeBasePage.title')}
              subtitle={pageHelp?.subtitle}
              locale={locale}
              titleClassName="text-3xl md:text-4xl font-semibold text-neutral-900 dark:text-white"
              subtitleClassName="text-base leading-7 text-neutral-600 dark:text-slate-300"
              help={pageHelp ? { tooltipTitle: pageHelp.tooltipTitle, tooltipBody: pageHelp.tooltipBody, quickSteps: pageHelp.quickSteps } : undefined}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <FlowStatCard
              icon={FileText}
              value={documents.length}
              label={locale === 'tr' ? 'Dokuman havuzu' : 'Document pool'}
              hint={locale === 'tr' ? `${readyDocuments} hazir, ${pendingDocuments} isleniyor` : `${readyDocuments} ready, ${pendingDocuments} processing`}
              accent="teal"
            />
            <FlowStatCard
              icon={MessageSquare}
              value={faqs.length}
              label={locale === 'tr' ? 'SSS kaydi' : 'FAQ entries'}
              hint={locale === 'tr' ? 'Hizli ve tekrar eden yanitlar icin' : 'For fast and repeatable responses'}
              accent="lightBlue"
            />
            <FlowStatCard
              icon={Upload}
              value={locale === 'tr' ? 'Canli' : 'Live'}
              label={locale === 'tr' ? 'Icerik akisi' : 'Content flow'}
              hint={locale === 'tr' ? 'Yeni icerigi yukleyip asistanlara baglayin' : 'Upload new content and wire it to assistants'}
              accent="deepBlue"
            />
          </div>
        </div>
      </FlowPageShell>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value);
          router.replace(`/dashboard/knowledge?tab=${value}`, { scroll: false });
        }}
        className="mx-auto max-w-7xl space-y-6"
      >
        <FlowPanel className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TabsList className="w-full justify-start rounded-full bg-neutral-100 p-1 dark:bg-white/[0.05] lg:w-auto">
            <TabsTrigger value="documents">{t('dashboard.knowledgeBasePage.documentsTab')} ({documents.length})</TabsTrigger>
            <TabsTrigger value="faqs">{t('dashboard.knowledgeBasePage.faqsTab')} ({faqs.length})</TabsTrigger>
          </TabsList>

          {activeTab === 'documents' && can('knowledge:edit') && (
            <Button onClick={() => setShowDocModal(true)} className="rounded-full">
              <Plus className="h-4 w-4 mr-2" />
              {t('dashboard.knowledgeBasePage.addDocument')}
            </Button>
          )}

          {activeTab === 'faqs' && can('knowledge:edit') && (
            <Button onClick={() => setShowFaqModal(true)} className="rounded-full">
              <Plus className="h-4 w-4 mr-2" />
              {t('dashboard.knowledgeBasePage.addFaqButton')}
            </Button>
          )}
          </div>
        </FlowPanel>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-4">

          {documents.length > 0 ? (
            <FlowPanel className="overflow-hidden p-0">
              <table className="w-full">
                <thead className="border-b border-neutral-200 dark:border-white/[0.08] bg-neutral-50/90 dark:bg-white/[0.04]">
                  <tr>
                    <th className="text-left p-4 text-sm font-medium text-neutral-600 dark:text-slate-300">{t('dashboard.knowledgeBasePage.nameTableHeader')}</th>
                    <th className="text-left p-4 text-sm font-medium text-neutral-600 dark:text-slate-300">{t('dashboard.knowledgeBasePage.typeTableHeader')}</th>
                    <th className="text-left p-4 text-sm font-medium text-neutral-600 dark:text-slate-300">{t('dashboard.knowledgeBasePage.sizeTableHeader')}</th>
                    <th className="text-left p-4 text-sm font-medium text-neutral-600 dark:text-slate-300">{t('dashboard.knowledgeBasePage.statusTableHeader')}</th>
                    <th className="text-left p-4 text-sm font-medium text-neutral-600 dark:text-slate-300">{t('dashboard.knowledgeBasePage.errorReasonHeader') || 'Hata Nedeni'}</th>
                    <th className="text-left p-4 text-sm font-medium text-neutral-600 dark:text-slate-300">{t('dashboard.knowledgeBasePage.uploadedTableHeader')}</th>
                    <th className="text-left p-4 text-sm font-medium text-neutral-600 dark:text-slate-300">{t('dashboard.knowledgeBasePage.actionsTableHeader')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-white/[0.08]">
                  {documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-neutral-50/80 dark:hover:bg-white/[0.03]">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleViewDocument(doc)}
                          className="flex items-center gap-2 text-left hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                        >
                          <FileText className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
                          <span className="text-sm font-medium text-neutral-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400">{doc.name}</span>
                          <Eye className="h-3 w-3 text-neutral-400 dark:text-neutral-500 opacity-0 group-hover:opacity-100" />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">{doc.type}</td>
                      <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">{formatFileSize(doc.size)}</td>
                      <td className="px-4 py-3">
                        <Badge
                          className={
                            doc.status === 'ACTIVE' || doc.status === 'ready'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                          : doc.status === 'PROCESSING' || doc.status === 'processing'
                            ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                          }
                        >
                          {t((doc.status === 'ACTIVE' || doc.status === 'ready') ? 'dashboard.knowledgeBasePage.ready' : (doc.status === 'PROCESSING' || doc.status === 'processing') ? 'dashboard.knowledgeBasePage.processing' : 'dashboard.knowledgeBasePage.failed')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">
                        {doc.status === 'FAILED' && doc.content?.startsWith('Error:') ? (
                          <span className="text-red-600 dark:text-red-400 text-xs">{doc.content.replace('Error: ', '')}</span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">
                        {formatDate(doc.uploadedAt, 'short', locale)}
                      </td>
                      <td className="px-4 py-3">
                        {can('knowledge:delete') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteDocument(doc.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </FlowPanel>
          ) : (
            <FlowPanel className="p-12">
              <EmptyState
                icon={FileText}
                title={t('dashboard.knowledgeBasePage.noDocumentsTitle')}
                description={t('dashboard.knowledgeBasePage.uploadDocumentsDesc')}
              />
            </FlowPanel>
          )}
        </TabsContent>

        {/* FAQs Tab */}
        <TabsContent value="faqs" className="space-y-4">
          {faqs.length > 0 ? (
            <div className="space-y-3">
              {faqs.map((faq) => (
                <FlowPanel key={faq.id} className="p-6">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-semibold text-neutral-900 dark:text-white">{faq.question}</h3>
                    {can('knowledge:delete') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteFaq(faq.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                    )}
                  </div>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">{faq.answer}</p>
                  {faq.category && (
                    <Badge variant="secondary" className="text-xs">{faq.category}</Badge>
                  )}
                </FlowPanel>
              ))}
            </div>
          ) : (
            <FlowPanel className="p-12">
              <EmptyState
                icon={MessageSquare}
                title={t('dashboard.knowledgeBasePage.noFaqsTitle')}
                description={t('dashboard.knowledgeBasePage.addFaqsDesc')}
              />
            </FlowPanel>
          )}
        </TabsContent>
      </Tabs>

      {/* Document Upload Modal */}
      <Dialog open={showDocModal} onOpenChange={handleDocModalOpenChange}>
        <DialogContent className="dark:border-white/[0.08] dark:bg-[#071224]/95 dark:text-white">
          <DialogHeader>
            <DialogTitle>{t('dashboard.knowledgeBasePage.addKnowledgeBase')}</DialogTitle>
            <DialogDescription>{t('dashboard.knowledgeBasePage.uploadDocumentsLabel')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="doc-name">{t('dashboard.knowledgeBasePage.knowledgeBaseName')}</Label>
              <Input
                id="doc-name"
                placeholder={t('dashboard.knowledgeBasePage.knowledgeBaseNamePlaceholder')}
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
              />
            </div>

            <div>
              <Label>{t('dashboard.knowledgeBasePage.documentsLabel')}</Label>
              <div
                className={`mt-2 border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                  isDragActive
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20'
                    : 'border-neutral-200 hover:border-primary-300'
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={handleDragOver}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
              >
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.csv"
                  className="hidden"
                  id="file-input"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                />
                <label htmlFor="file-input" className="cursor-pointer">
                  <Upload className="h-8 w-8 mx-auto text-neutral-400 mb-2" />
                  {selectedFile ? (
                    <>
                      <p className="text-sm text-neutral-900 font-medium mb-1">
                        {selectedFile.name}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {formatFileSize(selectedFile.size)} • {t('dashboard.knowledgeBasePage.clickToChange')}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-neutral-600 mb-1">
                        {isDragActive
                          ? (locale === 'tr' ? 'Dosyayi birakabilirsiniz' : 'Drop the file here')
                          : t('dashboard.knowledgeBasePage.clickToUpload')}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {t('dashboard.knowledgeBasePage.pdfDocxTxtCsv')}
                      </p>
                      <p className="text-xs text-neutral-400 mt-2">
                        {locale === 'tr' ? 'Isterseniz dosyayi buraya surukleyip birakabilirsiniz' : 'You can also drag and drop a file here'}
                      </p>
                    </>
                  )}
                </label>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t dark:border-white/[0.08]">
            <Button
              variant="outline"
              onClick={() => handleDocModalOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSaveDocument}
              disabled={uploadingFile}
            >
              {uploadingFile ? t('dashboard.knowledgeBasePage.uploadingText') : t('dashboard.knowledgeBasePage.saveBtn')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* FAQ Modal */}
      <Dialog open={showFaqModal} onOpenChange={setShowFaqModal}>
        <DialogContent className="dark:border-white/[0.08] dark:bg-[#071224]/95 dark:text-white">
          <DialogHeader>
            <DialogTitle>{t('dashboard.knowledgeBasePage.addFaqTitle')}</DialogTitle>
            <DialogDescription>{t('dashboard.knowledgeBasePage.createFaqDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="question">{t('dashboard.knowledgeBasePage.questionRequired')}</Label>
              <Input
                id="question"
                value={faqForm.question}
                onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })}
                placeholder={t('dashboard.knowledgeBasePage.questionPlaceholder')}
              />
            </div>
            <div>
              <Label htmlFor="answer">{t('dashboard.knowledgeBasePage.answerRequired')}</Label>
              <Textarea
                id="answer"
                rows={4}
                value={faqForm.answer}
                onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })}
                placeholder={t('dashboard.knowledgeBasePage.answerPlaceholder')}
              />
            </div>
            <div>
              <Label htmlFor="category">{t('dashboard.knowledgeBasePage.categoryOptional')}</Label>
              <Input
                id="category"
                value={faqForm.category}
                onChange={(e) => setFaqForm({ ...faqForm, category: e.target.value })}
                placeholder={t('dashboard.knowledgeBasePage.categoryPlaceholder')}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t dark:border-white/[0.08]">
            <Button variant="outline" onClick={() => setShowFaqModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreateFaq}>{t('dashboard.knowledgeBasePage.createFaqBtn')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Content Viewer Modal */}
      <Dialog open={showContentModal} onOpenChange={setShowContentModal}>
        <DialogContent className="max-w-3xl max-h-[80vh] dark:border-white/[0.08] dark:bg-[#071224]/95 dark:text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary-600" />
              {contentModalData?.title || t('dashboard.knowledgeBasePage.contentViewer')}
            </DialogTitle>
            <DialogDescription>
              {t('dashboard.knowledgeBasePage.documentContentDesc')}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[50vh] mt-4">
            {loadingContent ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
              </div>
            ) : (
              <div className="bg-neutral-50 dark:bg-white/[0.04] rounded-lg p-4">
                <pre className="whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300 font-mono">
                  {(() => {
                    const content = contentModalData?.content || t('dashboard.knowledgeBasePage.noContent');
                    const lines = content.split('\n');
                    const MAX_LINES = 50;
                    if (lines.length > MAX_LINES) {
                      return lines.slice(0, MAX_LINES).join('\n') + '\n\n... ' + (lines.length - MAX_LINES) + ' ' + t('dashboard.knowledgeBasePage.moreLines').replace('{{total}}', lines.length);
                    }
                    return content;
                  })()}
                </pre>
              </div>
            )}
          </ScrollArea>
          <div className="flex justify-end pt-4 border-t dark:border-white/[0.08]">
            <Button variant="outline" onClick={() => setShowContentModal(false)}>
              {t('common.close')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

// Wrap with Suspense for useSearchParams
export default function KnowledgeBasePage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <div className="h-8 w-64 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse"></div>
        <div className="h-12 w-full bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse"></div>
        <div className="h-64 w-full bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse"></div>
      </div>
    }>
      <KnowledgeBaseContent />
    </Suspense>
  );
}
