/**
 * Assistants Page
 * Manage AI assistants — Text (chat/WA/email) + Phone (inbound/outbound)
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
  useAssistants,
  useVoices,
  useBusiness,
  useCreateAssistant,
  useUpdateAssistant,
  useDeleteAssistant,
  useSyncAssistant
} from '@/hooks/useAssistants';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import EmptyState from '@/components/EmptyState';
import VoiceCard from '@/components/VoiceCard';
import { apiClient } from '@/lib/api';
import { Bot, Plus, Edit, Trash2, Search, PhoneIncoming, PhoneOutgoing, MessageSquare, Loader2, RefreshCw, ChevronDown, ChevronRight, Languages } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';
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

// Language code to accent name mapping
const LANGUAGE_TO_ACCENT = {
  'tr': 'Turkish',
  'en': 'American',
  'de': 'German',
  'fr': 'French',
  'es': 'Spanish',
  'it': 'Italian',
  'pt': 'Portuguese',
  'ru': 'Russian',
  'ar': 'Arabic',
  'ja': 'Japanese',
  'ko': 'Korean',
  'zh': 'Chinese',
  'hi': 'Hindi',
  'nl': 'Dutch',
  'pl': 'Polish',
  'sv': 'Swedish',
};

// Call purpose options for outbound calls
const CALL_PURPOSES = {
  common: [
    { value: 'sales', labelTr: 'Satış', labelEn: 'Sales' },
    { value: 'collection', labelTr: 'Tahsilat', labelEn: 'Collection' },
    { value: 'general', labelTr: 'Genel Bilgilendirme', labelEn: 'General Information' },
  ],
  definitions: {
    sales: { labelTr: 'Satış', labelEn: 'Sales' },
    collection: { labelTr: 'Tahsilat', labelEn: 'Collection' },
    general: { labelTr: 'Genel Bilgilendirme', labelEn: 'General Information' },
  }
};

// Default system prompts based on call purpose
const DEFAULT_SYSTEM_PROMPTS = {
  inbound: {
    tr: 'Müşteri sizi aradığında kısa, net ve yardım odaklı şekilde konuş. İhtiyacı anlamaya çalış, gerekirse bilgi topla ve çözüm üret.',
    en: 'When a customer calls, speak briefly, clearly, and helpfully. Understand the need first, gather details when needed, and guide toward a solution.'
  },
  sales: {
    tr: `Satış araması yap. Ürün veya hizmeti tanıt. Müşterinin ihtiyaçlarını dinle ve uygun çözümler sun.`,
    en: `Make a sales call. Introduce the product or service. Listen to customer needs and offer suitable solutions.`
  },
  collection: {
    tr: `Borç hatırlatma araması yap. Kibar ol. Ödeme ne zaman yapılacak diye sor.`,
    en: `Make a debt reminder call. Be polite. Ask when the payment will be made.`
  },
  general: {
    tr: `Müşteriye bilgilendirme araması yap. Yüklenen müşteri verilerini kullanarak kişiselleştirilmiş bilgi ver. Bilgi Bankası'ndaki içerikleri referans al.`,
    en: `Make an information call to the customer. Use uploaded customer data for personalized information. Reference Knowledge Base content.`
  }
};

const usesSilentStart = (direction) => typeof direction === 'string' && direction.startsWith('outbound');

const buildDefaultOutboundFirstMessage = ({
  language = 'tr',
  businessName = '',
  assistantName = '',
  purpose = 'sales'
} = {}) => {
  const lang = language === 'tr' ? 'tr' : 'en';
  const name = assistantName || (lang === 'tr' ? 'Asistan' : 'Assistant');
  const company = businessName || (lang === 'tr' ? 'İşletme' : 'the company');

  if (lang === 'tr') {
    if (purpose === 'sales') {
      return `Merhaba, ben ${name}. ${company} adına arıyorum. Uygunsanız arama sebebimi kısaca paylaşayım.`;
    }

    if (purpose === 'collection') {
      return `Merhaba, ben ${name}. ${company} adına arıyorum. Kısa bir bilgilendirme için uygun musunuz?`;
    }

    return `Merhaba, ben ${name}. ${company} adına arıyorum. Size kısa bir bilgilendirme aktarmak istiyorum. Uygunsanız hemen paylaşayım.`;
  }

  if (purpose === 'sales') {
    return `Hello, I'm ${name} calling on behalf of ${company}. If now is a good time, I can briefly explain why I'm calling.`;
  }

  if (purpose === 'collection') {
    return `Hello, I'm ${name} calling on behalf of ${company}. Is now a good time for a brief update?`;
  }

  return `Hello, I'm ${name} calling on behalf of ${company}. I have a brief update to share if now is a good time.`;
};

export default function AssistantsPage() {
  const { t, locale } = useLanguage();
  const { can, user } = usePermissions();
  const pageHelp = getPageHelp('assistants', locale);
  const [searchQuery, setSearchQuery] = useState('');
  const isOutboundDirection = (direction) => typeof direction === 'string' && direction.startsWith('outbound');

  // React Query hooks
  const { data: assistantsData, isLoading: assistantsLoading } = useAssistants();
  const { data: voicesData, isLoading: voicesLoading } = useVoices({ withSamples: true });
  const { data: businessData } = useBusiness(user?.businessId);
  const createAssistant = useCreateAssistant();
  const updateAssistant = useUpdateAssistant();
  const deleteAssistant = useDeleteAssistant();
  const syncAssistant = useSyncAssistant();

  // Extract data from queries
  const assistants = assistantsData?.data?.assistants || [];
  const loading = assistantsLoading || voicesLoading;

  // Process voices data
  const voiceData = voicesData?.data?.voices || {};
  const allVoices = [];
  Object.keys(voiceData).forEach(lang => {
    if (Array.isArray(voiceData[lang])) {
      allVoices.push(...voiceData[lang].map(v => ({ ...v, language: lang })));
    }
  });
  const voices = allVoices;

  // Business info
  const businessLanguage = businessData?.data?.language?.toLowerCase() || locale || 'tr';
  const businessName = businessData?.data?.name || '';
  const phoneInboundEnabled = Boolean(businessData?.data?.phoneInboundEnabled);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAssistant, setEditingAssistant] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    voiceId: '',
    systemPrompt: '',
    firstMessage: '',
    language: businessLanguage || locale || 'tr',
    tone: 'formal',
    customNotes: '',
    callDirection: 'outbound',
    callPurpose: 'collection',
    assistantType: 'phone',
  });
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [syncing, setSyncing] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isFirstMessageCustomized, setIsFirstMessageCustomized] = useState(false);

  // Business identity — business-level fields shown in assistant wizard
  const [bizIdentity, setBizIdentity] = useState({
    identitySummary: '',
    aliases: '',
  });

  // Populate business identity from businessData
  useEffect(() => {
    if (businessData?.data) {
      const biz = businessData.data;
      setBizIdentity({
        identitySummary: biz.identitySummary || '',
        aliases: Array.isArray(biz.aliases) ? biz.aliases.join(', ') : '',
      });
    }
  }, [businessData]);

  const isTextMode = formData.assistantType === 'text';
  const isSilentStartMode = !isTextMode && usesSilentStart(formData.callDirection);
  const isOutboundPhoneMode = !isTextMode && isOutboundDirection(formData.callDirection);

  // Handle "Yazı Asistanı" button click
  const handleNewTextAssistant = () => {
    // Check if text assistant already exists
    const existingText = assistants.find(a => a.assistantType === 'text');
    if (existingText) {
      // Open edit modal for existing text assistant
      handleEdit(existingText);
      return;
    }

    setFormData({
      name: '',
      voiceId: '',
      systemPrompt: '',
      firstMessage: '',
      language: businessLanguage || 'tr',
      tone: 'formal',
      customNotes: '',
      callDirection: 'outbound',
      callPurpose: '',
      assistantType: 'text',
    });
    setIsFirstMessageCustomized(false);
    setEditingAssistant(null);
    setShowCreateModal(true);
  };

  // Handle "Telefon Asistanı" button click
  const handleNewPhoneAssistant = () => {
    const defaultPurpose = 'collection';
    const preferredVoiceId = typeof window !== 'undefined'
      ? localStorage.getItem('onboarding_preferred_outbound_voice_id')
      : null;
    const preferredVoiceExists = preferredVoiceId && voices.some((voice) => voice.id === preferredVoiceId);
    const defaultVoiceId = preferredVoiceExists ? preferredVoiceId : '';

    setFormData({
      name: '',
      voiceId: defaultVoiceId,
      systemPrompt: getDefaultSystemPrompt('outbound', defaultPurpose),
      firstMessage: getDefaultFirstMessage('outbound', '', businessLanguage || 'tr', defaultPurpose),
      language: businessLanguage || 'tr',
      tone: 'formal',
      customNotes: '',
      callDirection: 'outbound',
      callPurpose: defaultPurpose,
      assistantType: 'phone',
    });
    setIsFirstMessageCustomized(false);
    setEditingAssistant(null);
    setShowCreateModal(true);
  };

  // Get available call purposes
  const getAvailablePurposes = () => {
    return CALL_PURPOSES.common.map(p => ({
      value: p.value,
    }));
  };

  // Get default first/response message based on call direction
  const getDefaultFirstMessage = (
    direction,
    assistantName,
    language = formData.language || businessLanguage,
    purpose = formData.callPurpose
  ) => {
    if (usesSilentStart(direction)) {
      return buildDefaultOutboundFirstMessage({
        language,
        businessName,
        assistantName,
        purpose
      });
    }

    const lang = language === 'tr' ? 'tr' : 'en';
    const name = assistantName || '';
    if (lang === 'tr') {
      if (name) return `Merhaba, ben ${name}. Size nasıl yardımcı olabilirim?`;
      return 'Merhaba, size nasıl yardımcı olabilirim?';
    }
    if (name) return `Hello, I'm ${name}. How can I help you today?`;
    return 'Hello, how can I help you today?';
  };

  // Get default system prompt for a call purpose
  const getDefaultSystemPrompt = (direction, purpose, language = formData.language || businessLanguage) => {
    const lang = language === 'tr' ? 'tr' : 'en';
    if (direction === 'inbound') {
      return DEFAULT_SYSTEM_PROMPTS.inbound?.[lang] || '';
    }
    return DEFAULT_SYSTEM_PROMPTS[purpose]?.[lang] || '';
  };

  const isDefaultFirstMessage = (message, direction, assistantName, language, purpose = formData.callPurpose) => {
    if (!message?.trim()) return true;
    return message === getDefaultFirstMessage(direction, assistantName, language, purpose);
  };

  // Handle call purpose change
  const handlePurposeChange = (purpose) => {
    setFormData(prev => ({
      ...prev,
      callPurpose: purpose,
      systemPrompt: getDefaultSystemPrompt(prev.callDirection, purpose, prev.language),
      firstMessage: prev.assistantType !== 'text' && (!isFirstMessageCustomized || !prev.firstMessage?.trim())
        ? getDefaultFirstMessage(prev.callDirection, prev.name, prev.language, purpose)
        : prev.firstMessage,
    }));
  };

  const handleDirectionChange = (direction) => {
    setFormData((prev) => ({
      ...prev,
      callDirection: direction,
      systemPrompt: getDefaultSystemPrompt(direction, prev.callPurpose, prev.language),
      firstMessage: !isFirstMessageCustomized || !prev.firstMessage?.trim()
        ? getDefaultFirstMessage(direction, prev.name, prev.language, prev.callPurpose)
        : prev.firstMessage,
    }));
  };

  // Save business identity fields (business-level, not per-assistant)
  const saveBizIdentity = async () => {
    try {
      const parsedAliases = bizIdentity.aliases
        .split(/[\n,;]+/g)
        .map((entry) => entry.trim())
        .filter(Boolean);
      await apiClient.settings.updateProfile({
        aliases: parsedAliases,
        identitySummary: bizIdentity.identitySummary,
      });
    } catch (err) {
      console.error('Business identity save failed:', err);
    }
  };

  const handleCreate = async () => {
    if (isTextMode) {
      // Text assistant: only name required
      if (!formData.name) {
        toast.error(t('dashboard.assistantsPage.fillAllRequired'));
        return;
      }

      setCreating(true);
      try {
        // Clean text payload — no phone fields
        const textPayload = {
          name: formData.name,
          assistantType: 'text',
          systemPrompt: formData.systemPrompt,
          language: formData.language,
          tone: formData.tone,
          customNotes: formData.customNotes,
        };
        await createAssistant.mutateAsync(textPayload);
        await saveBizIdentity();
        toast.success(t('dashboard.assistantsPage.createdSuccess'));
        setShowCreateModal(false);
        resetForm();
      } catch (error) {
        const errCode = error.response?.data?.error;
        if (errCode === 'ASSISTANT_LIMIT_REACHED') {
          const data = error.response?.data;
          const msg = locale === 'tr' ? data?.messageTR : data?.message;
          toast.error(msg || t('dashboard.assistantsPage.limitReached'));
        } else {
          toast.error(errCode || t('errors.generic'));
        }
      } finally {
        setCreating(false);
      }
    } else {
      // Phone assistant: name + voiceId required
      if (!formData.name || !formData.voiceId) {
        toast.error(t('dashboard.assistantsPage.fillAllRequired'));
        return;
      }

      setCreating(true);
      try {
        // Phone payload — includes all phone fields
        const phonePayload = {
          ...formData,
          assistantType: 'phone',
        };
        await createAssistant.mutateAsync(phonePayload);
        await saveBizIdentity();
        toast.success(t('dashboard.assistantsPage.createdSuccess'));
        setShowCreateModal(false);
        resetForm();
      } catch (error) {
        const errCode = error.response?.data?.error;
        if (errCode === 'ASSISTANT_LIMIT_REACHED') {
          const data = error.response?.data;
          const msg = locale === 'tr' ? data?.messageTR : data?.message;
          toast.error(msg || t('dashboard.assistantsPage.limitReached'));
        } else {
          toast.error(errCode || t('errors.generic'));
        }
      } finally {
        setCreating(false);
      }
    }
  };

  const handleEdit = (assistant) => {
    const isText = assistant.assistantType === 'text';

    setEditingAssistant(assistant);

    if (isText) {
      // Text assistant edit — show user's original instructions, NOT the auto-generated systemPrompt
      setFormData({
        name: assistant.name,
        voiceId: '',
        systemPrompt: assistant.userInstructions || '',
        firstMessage: '',
        language: assistant.language || businessLanguage || 'tr',
        tone: assistant.tone || 'formal',
        customNotes: assistant.customNotes || '',
        callDirection: 'outbound',
        callPurpose: '',
        assistantType: 'text',
      });
      setIsFirstMessageCustomized(false);
    } else {
      // Phone assistant edit
      const voice = voices.find(v => v.id === assistant.voiceId);
      const inferredLang = voice?.language || businessLanguage || 'en';
      const assistantDirection = assistant.callDirection || 'outbound';
      const initialFirstMessage = assistant.firstMessage || getDefaultFirstMessage(
        assistantDirection,
        assistant.name,
        assistant.language || inferredLang,
        assistant.callPurpose || 'sales'
      );

      let displayPrompt = '';
      if (assistant.callDirection === 'inbound') {
        displayPrompt = DEFAULT_SYSTEM_PROMPTS.inbound?.[inferredLang] || '';
      } else if (assistant.callPurpose) {
        displayPrompt = DEFAULT_SYSTEM_PROMPTS[assistant.callPurpose]?.[inferredLang] || '';
      }

      setFormData({
        name: assistant.name,
        voiceId: assistant.voiceId || '',
        systemPrompt: displayPrompt,
        firstMessage: initialFirstMessage,
        language: assistant.language || inferredLang,
        tone: assistant.tone || 'formal',
        customNotes: assistant.customNotes || '',
        callDirection: assistantDirection,
        callPurpose: assistant.callPurpose || 'collection',
        assistantType: 'phone',
      });
      setIsFirstMessageCustomized(
        !isDefaultFirstMessage(
          initialFirstMessage,
          assistantDirection,
          assistant.name,
          assistant.language || inferredLang,
          assistant.callPurpose || 'sales'
        )
      );
    }
    setShowCreateModal(true);
  };

  const handleUpdate = async () => {
    if (!editingAssistant) return;

    setUpdating(true);
    try {
      if (isTextMode) {
        // Text update — clean payload
        const textPayload = {
          name: formData.name,
          systemPrompt: formData.systemPrompt,
          language: formData.language,
          tone: formData.tone,
          customNotes: formData.customNotes,
        };
        await updateAssistant.mutateAsync({ id: editingAssistant.id, formData: textPayload });
      } else {
        await updateAssistant.mutateAsync({ id: editingAssistant.id, formData });
      }
      await saveBizIdentity();
      toast.success(t('dashboard.assistantsPage.updatedSuccess'));
      setShowCreateModal(false);
      resetForm();
    } catch (error) {
      toast.error(error.response?.data?.error || t('errors.generic'));
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (assistant) => {
    if (!confirm(t('dashboard.assistantsPage.confirmDelete'))) {
      return;
    }
    try {
      await deleteAssistant.mutateAsync(assistant.id);
      toast.success(t('dashboard.assistantsPage.deletedSuccess'));
    } catch (error) {
      toast.error(error.response?.data?.error || t('errors.generic'));
    }
  };

  const handleSync = async (assistant) => {
    setSyncing(assistant.id);
    try {
      await syncAssistant.mutateAsync(assistant.id);
      toast.success(t('dashboard.assistantsPage.syncSuccess'));
    } catch (error) {
      toast.error(error.response?.data?.error || t('errors.generic'));
    } finally {
      setSyncing(null);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      voiceId: '',
      systemPrompt: '',
      firstMessage: '',
      language: businessLanguage || 'tr',
      tone: 'formal',
      customNotes: '',
      callDirection: 'outbound',
      callPurpose: 'collection',
      assistantType: 'phone',
    });
    setIsFirstMessageCustomized(false);
    setEditingAssistant(null);
  };

  const filteredVoices = voices.filter(voice => {
    const selectedAccent = LANGUAGE_TO_ACCENT[formData.language];
    return voice.accent === selectedAccent;
  });

  const textAssistantCount = assistants.filter((assistant) => assistant.assistantType === 'text').length;
  const phoneAssistantCount = assistants.filter((assistant) => assistant.assistantType !== 'text').length;
  const activeLanguageCount = new Set(assistants.map((assistant) => assistant.language).filter(Boolean)).size;

  const filteredAssistants = assistants.filter((a) =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-12">
      <FlowPageShell className="mx-auto max-w-7xl">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <div className="space-y-6">
            <div className="space-y-4">
              <FlowBadge accent="lightBlue">{locale === 'tr' ? 'AI Studio' : 'AI Studio'}</FlowBadge>
              <PageIntro
                title={pageHelp?.title || t('dashboard.assistantsPage.title')}
                subtitle={pageHelp?.subtitle}
                locale={locale}
                titleClassName="text-3xl md:text-4xl font-semibold text-neutral-900 dark:text-white"
                subtitleClassName="text-base leading-7 text-neutral-600 dark:text-slate-300"
                help={pageHelp ? { tooltipTitle: pageHelp.tooltipTitle, tooltipBody: pageHelp.tooltipBody, quickSteps: pageHelp.quickSteps } : undefined}
                actions={can('assistants:create') && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button className="rounded-full shadow-sm dark:bg-white dark:text-[#051752] dark:hover:bg-slate-100">
                        <Plus className="h-4 w-4 mr-2" />
                        {t('dashboard.assistantsPage.create')}
                        <ChevronDown className="h-4 w-4 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleNewTextAssistant} className="gap-2 py-2">
                        <MessageSquare className="h-4 w-4 text-[#00C4E6]" />
                        <div>
                          <div className="font-medium">{t('dashboard.assistantsPage.textAssistant')}</div>
                          <div className="text-xs text-neutral-500">{t('dashboard.assistantsPage.textAssistantDesc')}</div>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleNewPhoneAssistant} className="gap-2 py-2">
                        <PhoneOutgoing className="h-4 w-4 text-[#006FEB]" />
                        <div>
                          <div className="font-medium">{t('dashboard.assistantsPage.phoneAssistant')}</div>
                          <div className="text-xs text-neutral-500">{t('dashboard.assistantsPage.phoneAssistantDesc')}</div>
                        </div>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              />
            </div>

            {assistants.length > 0 ? (
              <FlowPanel className="max-w-xl p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 dark:text-slate-500" />
                  <Input
                    placeholder={t('dashboard.assistantsPage.searchAssistants')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-11 rounded-xl border-neutral-200 bg-white/80 pl-10 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white"
                  />
                </div>
              </FlowPanel>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <FlowStatCard
              icon={Bot}
              value={assistants.length}
              label={locale === 'tr' ? 'Toplam asistan' : 'Total assistants'}
              hint={locale === 'tr' ? 'Tum sesli ve metin asistanlari' : 'All voice and text assistants'}
              accent="teal"
            />
            <FlowStatCard
              icon={PhoneOutgoing}
              value={phoneAssistantCount}
              label={locale === 'tr' ? 'Telefon asistani' : 'Phone assistants'}
              hint={locale === 'tr' ? 'Arama ve telefon akislarinda aktif' : 'Active for call flows and voice ops'}
              accent="lightBlue"
            />
            <FlowStatCard
              icon={Languages}
              value={activeLanguageCount || '-'}
              label={locale === 'tr' ? 'Aktif dil seti' : 'Active language sets'}
              hint={locale === 'tr' ? `${textAssistantCount} metin asistani, ${phoneAssistantCount} telefon asistani` : `${textAssistantCount} text assistants, ${phoneAssistantCount} phone assistants`}
              accent="deepBlue"
            />
          </div>
        </div>
      </FlowPageShell>

      {/* Assistants Table */}
      {loading ? (
        <FlowPanel className="mx-auto flex max-w-7xl items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        </FlowPanel>
      ) : filteredAssistants.length > 0 ? (
        <FlowPanel className="mx-auto max-w-7xl overflow-hidden p-0">
          <table className="w-full">
            <thead className="border-b border-neutral-200 dark:border-white/[0.08] bg-neutral-50/90 dark:bg-white/[0.04]">
              <tr>
                <th className="text-left p-4 text-sm font-medium text-neutral-600 dark:text-slate-300 w-auto">
                  {t('dashboard.assistantsPage.assistantNameCol')}
                </th>
                <th className="text-left p-4 text-sm font-medium text-neutral-600 dark:text-slate-300 w-40">
                  {t('dashboard.assistantsPage.typeCol')}
                </th>
                <th className="text-left p-4 text-sm font-medium text-neutral-600 dark:text-slate-300 w-48">
                  {t('dashboard.assistantsPage.purposeCol')}
                </th>
                <th className="text-left p-4 text-sm font-medium text-neutral-600 dark:text-slate-300 w-48">
                  {t('dashboard.assistantsPage.voiceCol')}
                </th>
                <th className="text-left p-4 text-sm font-medium text-neutral-600 dark:text-slate-300 w-48">
                  {t('dashboard.assistantsPage.createdCol')}
                </th>
                <th className="text-center p-4 text-sm font-medium text-neutral-600 dark:text-slate-300 w-48">
                  {t('dashboard.assistantsPage.actionsCol')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-white/[0.08]">
              {filteredAssistants.map((assistant) => {
                const voice = voices.find((v) => v.id === assistant.voiceId);
                const isText = assistant.assistantType === 'text';

                return (
                  <tr key={assistant.id} className="hover:bg-neutral-50/80 dark:hover:bg-white/[0.03]">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {isText ? (
                          <MessageSquare className="h-4 w-4 text-[#00C4E6]" />
                        ) : assistant.callDirection === 'inbound' ? (
                          <PhoneIncoming className="h-4 w-4 text-[#006FEB]" />
                        ) : (
                          <PhoneOutgoing className="h-4 w-4 text-[#000ACF]" />
                        )}
                        <span className="text-sm font-medium text-neutral-900 dark:text-white">
                          {assistant.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-neutral-600 dark:text-neutral-400">
                        {isText
                          ? t('dashboard.assistantsPage.textAssistant')
                          : t('dashboard.assistantsPage.phoneAssistant')
                        }
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-neutral-600 dark:text-neutral-400">
                        {!isText && assistant.callPurpose
                          ? t(`dashboard.assistantsPage.purpose${assistant.callPurpose.charAt(0).toUpperCase() + assistant.callPurpose.slice(1)}`) || assistant.callPurpose
                          : (!isText && assistant.callDirection === 'inbound'
                            ? t('dashboard.assistantsPage.inboundCall')
                            : '-')
                        }
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-neutral-600 dark:text-neutral-400">
                        {!isText ? (voice?.name || '-') : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-neutral-600 dark:text-neutral-400">
                        {formatDate(assistant.createdAt, 'short', locale)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <div className="grid grid-cols-3 gap-1 justify-center w-fit mx-auto">
                        {can('assistants:edit') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(assistant)}
                            className="h-8 w-8 px-0 dark:hover:bg-white/[0.06]"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {can('assistants:edit') && (
                          !isText ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSync(assistant)}
                              disabled={syncing === assistant.id}
                              title={t('dashboard.assistantsPage.syncWith11Labs')}
                              className="h-8 w-8 px-0 dark:hover:bg-white/[0.06]"
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${syncing === assistant.id ? 'animate-spin' : ''}`} />
                            </Button>
                          ) : (
                            <div
                              className="h-8 w-8 flex items-center justify-center text-neutral-300 dark:text-neutral-600"
                              title={t('dashboard.assistantsPage.syncNotRequired')}
                            >
                              <span className="text-sm leading-none">-</span>
                            </div>
                          )
                        )}
                        {can('assistants:delete') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(assistant)}
                            className="h-8 w-8 px-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </FlowPanel>
      ) : (
        <FlowPanel className="mx-auto max-w-7xl p-12">
          <EmptyState
            icon={Bot}
            title={t('dashboard.assistantsPage.noAssistants')}
            description={t('dashboard.assistantsPage.createFirstDesc')}
            actionLabel={t('dashboard.assistantsPage.create')}
            onAction={handleNewPhoneAssistant}
          />
        </FlowPanel>
      )}

      {/* Create/Edit modal */}
      <Dialog
        open={showCreateModal}
        onOpenChange={(open) => {
          setShowCreateModal(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto dark:border-white/[0.08] dark:bg-[#071224]/95 dark:text-white"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isTextMode ? (
                <>
                  <MessageSquare className="h-5 w-5 text-neutral-500" />
                  {editingAssistant ? t('common.edit') : t('common.create')} — {t('dashboard.assistantsPage.textAssistant')}
                </>
              ) : (
                <>
                  {formData.callDirection === 'inbound' ? (
                    <PhoneIncoming className="h-5 w-5 text-neutral-500" />
                  ) : (
                    <PhoneOutgoing className="h-5 w-5 text-neutral-500" />
                  )}
                  {editingAssistant ? t('common.edit') : t('common.create')} — {t('dashboard.assistantsPage.phoneAssistant')}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {t('dashboard.assistantsPage.configureSettings')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name */}
            <div>
              <div className="flex justify-between items-center">
                <Label htmlFor="name">{t('dashboard.assistantsPage.nameRequired')}</Label>
                <span className={`text-xs ${formData.name.length > 25 ? 'text-red-500' : 'text-neutral-500'}`}>
                  {formData.name.length}/25
                </span>
              </div>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => {
                  const nextName = e.target.value;
                  if (nextName.length <= 25) {
                    setFormData((prev) => ({
                      ...prev,
                      name: nextName,
                      firstMessage: prev.assistantType !== 'text' && (!isFirstMessageCustomized || !prev.firstMessage?.trim())
                        ? getDefaultFirstMessage(prev.callDirection, nextName, prev.language, prev.callPurpose)
                        : prev.firstMessage,
                    }));
                  }
                }}
                maxLength={25}
                placeholder={t('dashboard.assistantsPage.namePlaceholder')}
              />
            </div>

            {/* ===== PHONE-ONLY FIELDS ===== */}
            {!isTextMode && (
              <>
                {phoneInboundEnabled && (
                  <div>
                    <Label>{t('dashboard.assistantsPage.directionCol')}</Label>
                    <Select
                      value={formData.callDirection}
                      onValueChange={handleDirectionChange}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="outbound">{t('dashboard.assistantsPage.outboundCall')}</SelectItem>
                        <SelectItem value="inbound">{t('dashboard.assistantsPage.inboundCall')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Call Purpose */}
                {isOutboundDirection(formData.callDirection) && (
                <div>
                  <Label>{t('dashboard.assistantsPage.callPurpose')}</Label>
                  <Select
                    value={formData.callPurpose}
                    onValueChange={handlePurposeChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('dashboard.assistantsPage.selectPurpose')} />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailablePurposes().map((purpose) => (
                        <SelectItem key={purpose.value} value={purpose.value}>
                          {t(`dashboard.assistantsPage.purpose${purpose.value.charAt(0).toUpperCase() + purpose.value.slice(1)}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-neutral-500 mt-1">
                    {t('dashboard.assistantsPage.purposeAutoPromptHint')}
                  </p>
                </div>
                )}

                {/* Language */}
                <div>
                  <Label htmlFor="language">{t('dashboard.assistantsPage.assistantLanguage')}</Label>
                  <Select
                    value={formData.language}
                    onValueChange={(value) => setFormData((prev) => ({
                      ...prev,
                      language: value,
                      voiceId: '',
                      firstMessage: prev.assistantType !== 'text' && (!isFirstMessageCustomized || !prev.firstMessage?.trim())
                        ? getDefaultFirstMessage(prev.callDirection, prev.name, value, prev.callPurpose)
                        : prev.firstMessage,
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tr">{t('dashboard.assistantsPage.langTurkish')}</SelectItem>
                      <SelectItem value="en">{t('dashboard.assistantsPage.langEnglish')}</SelectItem>
                      <SelectItem value="de">{t('dashboard.assistantsPage.langGerman')}</SelectItem>
                      <SelectItem value="fr">{t('dashboard.assistantsPage.langFrench')}</SelectItem>
                      <SelectItem value="es">{t('dashboard.assistantsPage.langSpanish')}</SelectItem>
                      <SelectItem value="it">{t('dashboard.assistantsPage.langItalian')}</SelectItem>
                      <SelectItem value="pt">{t('dashboard.assistantsPage.langPortuguese')}</SelectItem>
                      <SelectItem value="ru">{t('dashboard.assistantsPage.langRussian')}</SelectItem>
                      <SelectItem value="ar">{t('dashboard.assistantsPage.langArabic')}</SelectItem>
                      <SelectItem value="ja">{t('dashboard.assistantsPage.langJapanese')}</SelectItem>
                      <SelectItem value="ko">{t('dashboard.assistantsPage.langKorean')}</SelectItem>
                      <SelectItem value="zh">{t('dashboard.assistantsPage.langChinese')}</SelectItem>
                      <SelectItem value="hi">{t('dashboard.assistantsPage.langHindi')}</SelectItem>
                      <SelectItem value="nl">{t('dashboard.assistantsPage.langDutch')}</SelectItem>
                      <SelectItem value="pl">{t('dashboard.assistantsPage.langPolish')}</SelectItem>
                      <SelectItem value="sv">{t('dashboard.assistantsPage.langSwedish')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-neutral-500 mt-1">
                    {t('dashboard.assistantsPage.voicesFilteredByLanguage')}
                  </p>
                </div>

                {/* Voice Selection Grid */}
                <div>
                  <Label>{t('dashboard.assistantsPage.voiceRequired')}</Label>
                  <p className="text-xs text-neutral-500 mb-3">
                    {t('dashboard.assistantsPage.voicePreviewHint')}
                  </p>
                  {filteredVoices.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-1">
                      {filteredVoices.map((voice) => (
                        <VoiceCard
                          key={voice.id}
                          voice={voice}
                          compact
                          isSelected={formData.voiceId === voice.id}
                          onSelect={(v) => setFormData({ ...formData, voiceId: v.id })}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-neutral-500 py-4 text-center border border-dashed border-neutral-200 dark:border-neutral-700 rounded-lg">
                      {t('dashboard.assistantsPage.noVoicesForLanguage')}
                    </div>
                  )}
                </div>

                {/* First Message */}
                <div>
                  <Label htmlFor="firstMessage">
                    {isOutboundPhoneMode
                      ? (locale === 'tr' ? 'İlk Yanıt Mesajı' : 'First Response Message')
                      : t('dashboard.assistantsPage.greetingMessage')}
                  </Label>
                  <Input
                    id="firstMessage"
                    value={formData.firstMessage}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setFormData({ ...formData, firstMessage: nextValue });
                      setIsFirstMessageCustomized(
                        !isDefaultFirstMessage(
                          nextValue,
                          formData.callDirection,
                          formData.name,
                          formData.language,
                          formData.callPurpose
                        )
                      );
                    }}
                    placeholder={
                      isOutboundPhoneMode
                        ? (locale === 'tr'
                          ? 'örn: Merhaba, ben Ali. ABC firması adına arıyorum...'
                          : 'e.g., Hello, I\'m Ali calling on behalf of ABC Company...')
                        : t('dashboard.assistantsPage.greetingPlaceholder')
                    }
                  />
                  {isSilentStartMode && (
                    <div className="mt-2 p-3 bg-neutral-50 border border-neutral-200 rounded-md text-sm text-neutral-700 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300">
                      {t('dashboard.assistantsPage.silentStartEnabled')}
                    </div>
                  )}
                  <p className="text-xs text-neutral-500 mt-1">
                    {isOutboundPhoneMode
                      ? (locale === 'tr'
                        ? 'Karşı taraf telefonu açıp konuştuğunda asistanın vereceği ilk yanıt. Sessiz başlangıçta ilk sözü yine karşı taraf söyler; bu metin o ilk cevabınız için kullanılır.'
                        : 'The first response the assistant gives after the other side answers and speaks. With silent start, the other side still speaks first; this text is used for your first reply.')
                      : t('dashboard.assistantsPage.greetingHint')}
                  </p>
                </div>
              </>
            )}

            {/* ===== TEXT-ONLY: Language selector ===== */}
            {isTextMode && (
              <div>
                <Label htmlFor="language">{t('dashboard.assistantsPage.assistantLanguage')}</Label>
                <Select
                  value={formData.language}
                  onValueChange={(value) => setFormData({ ...formData, language: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tr">{t('dashboard.assistantsPage.langTurkish')}</SelectItem>
                    <SelectItem value="en">{t('dashboard.assistantsPage.langEnglish')}</SelectItem>
                    <SelectItem value="de">{t('dashboard.assistantsPage.langGerman')}</SelectItem>
                    <SelectItem value="fr">{t('dashboard.assistantsPage.langFrench')}</SelectItem>
                    <SelectItem value="es">{t('dashboard.assistantsPage.langSpanish')}</SelectItem>
                    <SelectItem value="it">{t('dashboard.assistantsPage.langItalian')}</SelectItem>
                    <SelectItem value="pt">{t('dashboard.assistantsPage.langPortuguese')}</SelectItem>
                    <SelectItem value="ru">{t('dashboard.assistantsPage.langRussian')}</SelectItem>
                    <SelectItem value="ar">{t('dashboard.assistantsPage.langArabic')}</SelectItem>
                    <SelectItem value="ja">{t('dashboard.assistantsPage.langJapanese')}</SelectItem>
                    <SelectItem value="ko">{t('dashboard.assistantsPage.langKorean')}</SelectItem>
                    <SelectItem value="zh">{t('dashboard.assistantsPage.langChinese')}</SelectItem>
                    <SelectItem value="hi">{t('dashboard.assistantsPage.langHindi')}</SelectItem>
                    <SelectItem value="nl">{t('dashboard.assistantsPage.langDutch')}</SelectItem>
                    <SelectItem value="pl">{t('dashboard.assistantsPage.langPolish')}</SelectItem>
                    <SelectItem value="sv">{t('dashboard.assistantsPage.langSwedish')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Tone Selector (both modes) */}
            <div>
              <Label htmlFor="tone">{t('dashboard.assistantsPage.communicationTone')}</Label>
              <Select
                value={formData.tone}
                onValueChange={(value) => setFormData({ ...formData, tone: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="formal">
                    {t('dashboard.assistantsPage.toneProf')}
                  </SelectItem>
                  <SelectItem value="casual">
                    {t('dashboard.assistantsPage.toneFriendly')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* System Prompt / Instructions (both modes) */}
            <div>
              <Label htmlFor="prompt">
                {t('dashboard.assistantsPage.instructions')}
              </Label>
              <Textarea
                id="prompt"
                rows={isTextMode ? 5 : 3}
                value={formData.systemPrompt}
                onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                placeholder={t('dashboard.assistantsPage.instructionsPlaceholder')}
              />
              <p className="text-xs text-neutral-500 mt-1">
                {t('dashboard.assistantsPage.instructionsHint')}
              </p>
            </div>

            {/* Custom Notes (both modes) */}
            <div>
              <Label htmlFor="customNotes">
                {t('dashboard.assistantsPage.customNotes')}
              </Label>
              <Textarea
                id="customNotes"
                rows={4}
                value={formData.customNotes}
                onChange={(e) => setFormData({ ...formData, customNotes: e.target.value })}
                placeholder={t('dashboard.assistantsPage.customNotesPlaceholder')}
              />
              <p className="text-xs text-neutral-500 mt-1">
                {t('dashboard.assistantsPage.customNotesHint')}
              </p>
            </div>

            {/* ===== BUSINESS IDENTITY (business-level) ===== */}
            <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4 mt-2">
              <Label htmlFor="identitySummary">
                {locale === 'tr' ? 'İşletme Tanımı' : 'Business Description'}
              </Label>
              <Textarea
                id="identitySummary"
                rows={2}
                value={bizIdentity.identitySummary}
                onChange={(e) => setBizIdentity({ ...bizIdentity, identitySummary: e.target.value })}
                placeholder={locale === 'tr'
                  ? 'İşletmenizi 1-2 cümleyle tanımlayın. Örn: "ABC Lojistik, şehir içi kurye ve dağıtım hizmeti sunar."'
                  : 'Describe your business in 1-2 sentences.'
                }
              />
              <p className="text-xs text-neutral-500 mt-1">
                {locale === 'tr'
                  ? 'Asistanın müşteriyle konuşurken işletmenizi nasıl tanımlayacağını belirler.'
                  : 'Defines how the assistant describes your business during conversations.'
                }
              </p>
            </div>

            {/* Advanced: Aliases (collapsible) */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
              >
                {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {locale === 'tr' ? 'Gelişmiş Ayarlar' : 'Advanced Settings'}
              </button>

              {showAdvanced && (
                <div className="mt-2">
                  <Label htmlFor="aliases">
                    {locale === 'tr' ? 'Alternatif İsimler' : 'Alternative Names'}
                  </Label>
                  <Textarea
                    id="aliases"
                    rows={2}
                    value={bizIdentity.aliases}
                    onChange={(e) => setBizIdentity({ ...bizIdentity, aliases: e.target.value })}
                    placeholder={locale === 'tr'
                      ? 'Kısaltma, eski isim veya şube adı varsa ekleyin. Örn: ABC, ABC Teknoloji, ABC İstanbul'
                      : 'Add abbreviations, old names, or branch names. E.g.: ABC, ABC Tech'
                    }
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    {locale === 'tr'
                      ? 'Virgül, noktalı virgül veya yeni satır ile ayırın.'
                      : 'Separate with comma, semicolon, or new line.'
                    }
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowCreateModal(false)} disabled={creating || updating}>
              {t('common.cancel')}
            </Button>
            <Button onClick={editingAssistant ? handleUpdate : handleCreate} disabled={creating || updating}>
              {(creating || updating) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {creating
                ? t('dashboard.assistantsPage.creating')
                : updating
                  ? t('dashboard.assistantsPage.updating')
                  : editingAssistant ? t('dashboard.assistantsPage.updateBtn') : t('dashboard.assistantsPage.create')
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
