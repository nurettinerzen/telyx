/**
 * Integrations Page
 * Manage third-party integrations with business type-based filtering
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import Image from 'next/image';
import EmptyState from '@/components/EmptyState';
import {
  Puzzle, Check, ExternalLink, Star, Copy, CheckCircle2, CreditCard, Zap,
  MessageSquare, Target, Cloud, Calendar, CalendarDays, Smartphone,
  ShoppingCart, Utensils, Scissors, Stethoscope, Package, Mail, Hash,
  Wallet, Eye, EyeOff, Inbox, RefreshCw, Lock, Info
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { toast, toastHelpers } from '@/lib/toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermissions } from '@/hooks/usePermissions';
import PageIntro from '@/components/PageIntro';
import { getPageHelp } from '@/content/pageHelp';
import UpgradeModal from '@/components/UpgradeModal';
import {
  getIntegrationFeatureInfo,
  LOCKED_INTEGRATIONS_FOR_BASIC,
  FEATURES
} from '@/lib/features';
import {
  useIntegrations,
  useUserPlan,
  useWhatsAppStatus,
  useIyzicoStatus,
  useEmailStatus,
  useShopifyStatus,
  useWebhookStatus,
  useIkasStatus,
  useConnectWhatsApp,
  useDisconnectWhatsApp,
  useConnectIyzico,
  useDisconnectIyzico,
  useDisconnectEmail,
  useDisconnectShopify,
  useConnectIkas,
  useDisconnectIkas,
  useSetupWebhook,
  useDisableWebhook,
  useRegenerateWebhook,
  useDisconnectGoogleCalendar,
  useTestGoogleCalendar,
  useTestIkas,
  useCrmWebhookStatus,
  useRefreshWhatsAppConnection,
} from '@/hooks/useIntegrations';
import { useWhatsAppEmbeddedSignup } from '@/hooks/useWhatsAppEmbeddedSignup';

// Integration logo paths
const INTEGRATION_LOGOS = {
  GOOGLE_CALENDAR: '/assets/integrations/googlecalendar.svg',
  WHATSAPP: '/assets/integrations/whatsapp.svg',
  SHOPIFY: '/assets/integrations/shopify.svg',
  IKAS: '/assets/integrations/ikas.ico',
  GMAIL: '/assets/integrations/gmail.svg',
  OUTLOOK: '/assets/integrations/outlook.png',
  CUSTOM: '/assets/integrations/crm.png',
  WEBHOOK: '/assets/integrations/webhook.png',
};

const IntegrationLogo = ({ type, className = 'h-6 w-6' }) => {
  const logo = INTEGRATION_LOGOS[type];
  if (logo) {
    return <Image src={logo} alt={type} width={24} height={24} className={className} />;
  }
  return <Hash className={className} />;
};

const INTEGRATION_ICONS = {
  GOOGLE_CALENDAR: ({ className }) => <IntegrationLogo type="GOOGLE_CALENDAR" className={className} />,
  WHATSAPP: ({ className }) => <IntegrationLogo type="WHATSAPP" className={className} />,
  SHOPIFY: ({ className }) => <IntegrationLogo type="SHOPIFY" className={className} />,
  IKAS: ({ className }) => <IntegrationLogo type="IKAS" className={className} />,
  CUSTOM: Hash
};

const INTEGRATION_DOCS = {
  GOOGLE_CALENDAR: 'https://developers.google.com/calendar',
  WHATSAPP: 'https://developers.facebook.com/docs/whatsapp',
  SHOPIFY: 'https://shopify.dev',
  IKAS: 'https://ikas.dev'
};

export default function IntegrationsPage() {
  const { t, locale } = useLanguage();
  const { can, user } = usePermissions();
  const pageHelp = getPageHelp('integrations', locale);

  // React Query hooks
  const { data: integrationsData, isLoading: loading } = useIntegrations();
  const { data: userPlan } = useUserPlan();
  const crmFeatureInfo = getIntegrationFeatureInfo('CUSTOM', userPlan);
  const hasCrmEntitlement = !crmFeatureInfo.isLocked && !crmFeatureInfo.isHidden;
  const { data: whatsappStatus } = useWhatsAppStatus();
  const { data: iyzicoStatus } = useIyzicoStatus();
  const { data: emailStatus } = useEmailStatus();
  const { data: shopifyStatus } = useShopifyStatus();
  const { data: webhookStatus } = useWebhookStatus();
  const { data: ikasStatus } = useIkasStatus();
  const { data: crmStatus } = useCrmWebhookStatus({ enabled: hasCrmEntitlement });

  const integrations = integrationsData?.integrations || [];
  const businessType = integrationsData?.businessType || 'OTHER';

  // Mutations
  const connectWhatsApp = useConnectWhatsApp();
  const disconnectWhatsApp = useDisconnectWhatsApp();
  const refreshWhatsAppConnection = useRefreshWhatsAppConnection();
  const connectIyzico = useConnectIyzico();
  const disconnectIyzico = useDisconnectIyzico();
  const disconnectEmail = useDisconnectEmail();
  const disconnectShopify = useDisconnectShopify();
  const connectIkas = useConnectIkas();
  const disconnectIkas = useDisconnectIkas();
  const setupWebhook = useSetupWebhook();
  const disableWebhook = useDisableWebhook();
  const regenerateWebhook = useRegenerateWebhook();
  const disconnectGoogleCalendar = useDisconnectGoogleCalendar();
  const testGoogleCalendar = useTestGoogleCalendar();
  const testIkas = useTestIkas();
  const isWhatsAppManualFallbackEnabled = process.env.NEXT_PUBLIC_WHATSAPP_MANUAL_FALLBACK === 'true' && user?.role === 'OWNER';

  // Upgrade modal state
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState(null);

  // WhatsApp state
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [whatsappForm, setWhatsappForm] = useState({ accessToken: '', phoneNumberId: '', verifyToken: '' });
  const [whatsappTestForm, setWhatsappTestForm] = useState({ recipientPhone: '', message: '' });
  const [whatsappTestSending, setWhatsappTestSending] = useState(false);
  const [whatsappTestResult, setWhatsappTestResult] = useState(null);
  const {
    flowState: whatsappEmbeddedSignupState,
    flowError: whatsappEmbeddedSignupError,
    isBusy: whatsappEmbeddedSignupBusy,
    startEmbeddedSignup,
  } = useWhatsAppEmbeddedSignup({
    onSuccess: () => {
      toast.success(t('dashboard.integrationsPage.whatsappConnected'));
    },
    onCancel: () => {
      toast.info(t('dashboard.integrationsPage.whatsappEmbeddedSignupCancelled'));
    },
    onError: (error) => {
      toast.error(error?.response?.data?.error || error?.message || t('dashboard.integrationsPage.whatsappConnectFailed'));
    },
  });

  // iyzico state
  const [iyzicoModalOpen, setIyzicoModalOpen] = useState(false);
  const [iyzicoLoading, setIyzicoLoading] = useState(false);
  const [iyzicoForm, setIyzicoForm] = useState({ apiKey: '', secretKey: '', environment: 'sandbox' });
  const [showIyzicoSecret, setShowIyzicoSecret] = useState(false);

  // Email state
  const [emailLoading, setEmailLoading] = useState(false);

  // Shopify state
  const [shopifyModalOpen, setShopifyModalOpen] = useState(false);
  const [shopifyLoading, setShopifyLoading] = useState(false);
  const [shopifyForm, setShopifyForm] = useState({ shopUrl: '' });

  // Webhook state
  const [webhookModalOpen, setWebhookModalOpen] = useState(false);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [copiedField, setCopiedField] = useState(null);

  // ikas state
  const [ikasModalOpen, setIkasModalOpen] = useState(false);
  const [ikasLoading, setIkasLoading] = useState(false);
  const [ikasForm, setIkasForm] = useState({ storeName: '', clientId: '', clientSecret: '' });

  useEffect(() => {
    // Handle OAuth callback results
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const shopifyResult = params.get('shopify');
      const shopName = params.get('shop');
      const errorMessage = params.get('message');
      const success = params.get('success');
      const error = params.get('error');

      if (shopifyResult === 'success') {
        toast.success(`${t('dashboard.integrationsPage.shopifyConnectedSuccess')}${shopName ? `: ${shopName}` : ''}!`);
        window.history.replaceState({}, '', window.location.pathname);
      } else if (shopifyResult === 'error') {
        toast.error(`${t('dashboard.integrationsPage.shopifyConnectFailed')}${errorMessage ? `: ${decodeURIComponent(errorMessage)}` : ''}`);
        window.history.replaceState({}, '', window.location.pathname);
      }

      // Google Calendar callback
      if (success === 'google-calendar') {
        toast.success(t('dashboard.integrationsPage.googleCalendarConnectedSuccess'));
        window.history.replaceState({}, '', window.location.pathname);
      } else if (error === 'google-calendar') {
        toast.error(t('dashboard.integrationsPage.googleCalendarConnectFailed'));
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, []);

  useEffect(() => {
    setWhatsappTestForm((prev) => {
      if (prev.message) {
        return prev;
      }

      return {
        ...prev,
        message: t('dashboard.integrationsPage.whatsappTestDefaultMessage'),
      };
    });
  }, [locale, t]);

  // Handler functions
  const handleGmailConnect = async () => {
    try {
      setEmailLoading(true);
      const response = await apiClient.get('/api/email/gmail/auth');
      window.location.href = response.data.authUrl;
    } catch (error) {
      toast.error(error.response?.data?.error || t('dashboard.integrationsPage.gmailConnectFailed'));
      setEmailLoading(false);
    }
  };

  const handleOutlookConnect = async () => {
    try {
      setEmailLoading(true);
      const response = await apiClient.get('/api/email/outlook/auth');
      window.location.href = response.data.authUrl;
    } catch (error) {
      toast.error(error.response?.data?.error || t('dashboard.integrationsPage.outlookConnectFailed'));
      setEmailLoading(false);
    }
  };

  const handleEmailDisconnect = async () => {
    if (!confirm(t('dashboard.integrationsPage.confirmDisconnectEmail'))) return;
    try {
      setEmailLoading(true);
      await disconnectEmail.mutateAsync();
      toast.success(t('dashboard.integrationsPage.emailDisconnected'));
    } catch (error) {
      toast.error(t('dashboard.integrationsPage.emailDisconnectFailed'));
    } finally {
      setEmailLoading(false);
    }
  };

  const handleWhatsAppConnect = async () => {
    if (!whatsappForm.accessToken || !whatsappForm.phoneNumberId || !whatsappForm.verifyToken) {
      toast.error(t('dashboard.integrationsPage.fillAllFields'));
      return;
    }
    setWhatsappLoading(true);
    try {
      const response = await connectWhatsApp.mutateAsync(whatsappForm);
      if (response.data.success) {
        toast.success(t('dashboard.integrationsPage.whatsappConnected'));
        setWhatsappModalOpen(false);
        setWhatsappForm({ accessToken: '', phoneNumberId: '', verifyToken: '' });
      }
    } catch (error) {
      toast.error(error.response?.data?.error || t('dashboard.integrationsPage.whatsappConnectFailed'));
    } finally {
      setWhatsappLoading(false);
    }
  };

  const handleWhatsAppDisconnect = async () => {
    if (!confirm(t('dashboard.integrationsPage.confirmDisconnectWhatsApp'))) return;
    try {
      await disconnectWhatsApp.mutateAsync();
      toast.success(t('dashboard.integrationsPage.whatsappDisconnected'));
    } catch (error) { toast.error(t('dashboard.integrationsPage.disconnectFailed')); }
  };

  const handleWhatsAppRefresh = async () => {
    try {
      const response = await refreshWhatsAppConnection.mutateAsync();
      if (response.data?.success) {
        toast.success(t('dashboard.integrationsPage.whatsappRefreshSuccess'));
      } else {
        toast.error(response.data?.error || t('dashboard.integrationsPage.whatsappRefreshFailed'));
      }
    } catch (error) {
      toast.error(error.response?.data?.error || t('dashboard.integrationsPage.whatsappRefreshFailed'));
    }
  };

  const handleSendWhatsAppTestMessage = async () => {
    if (!whatsappTestForm.recipientPhone.trim() || !whatsappTestForm.message.trim()) {
      toast.error(t('dashboard.integrationsPage.whatsappTestFillAllFields'));
      return;
    }

    try {
      setWhatsappTestSending(true);
      const response = await apiClient.integrations.sendWhatsAppTestMessage({
        recipientPhone: whatsappTestForm.recipientPhone.trim(),
        message: whatsappTestForm.message.trim(),
      });

      if (response.data?.success) {
        setWhatsappTestResult({
          recipientPhone: response.data?.result?.recipientPhone || whatsappTestForm.recipientPhone.trim(),
          connectedNumber: response.data?.result?.connectedNumber || whatsappStatus?.displayPhoneNumber || null,
          messageId: response.data?.result?.messageId || null,
          acceptedByMeta: Boolean(response.data?.result?.acceptedByMeta),
          deliveryMode: response.data?.result?.deliveryMode || 'text',
          templateInfo: response.data?.result?.templateInfo || null,
          sentAt: new Date().toISOString(),
        });
        toast.success(t('dashboard.integrationsPage.whatsappTestAcceptedSuccess'));
      } else {
        toast.error(t('dashboard.integrationsPage.whatsappTestSendFailed'));
      }
    } catch (error) {
      console.error('WhatsApp test send error:', error);
      toast.error(error.response?.data?.error || t('dashboard.integrationsPage.whatsappTestSendFailed'));
    } finally {
      setWhatsappTestSending(false);
    }
  };


  const handleIyzicoConnect = async () => {
    if (!iyzicoForm.apiKey || !iyzicoForm.secretKey) {
      toast.error(t('dashboard.integrationsPage.fillApiAndSecret'));
      return;
    }
    setIyzicoLoading(true);
    try {
      const response = await connectIyzico.mutateAsync(iyzicoForm);
      if (response.data.success) {
        toast.success(t('dashboard.integrationsPage.iyzicoConnected'));
        setIyzicoModalOpen(false);
        setIyzicoForm({ apiKey: '', secretKey: '', environment: 'sandbox' });
      }
    } catch (error) {
      toast.error(error.response?.data?.error || t('dashboard.integrationsPage.iyzicoConnectFailed'));
    } finally {
      setIyzicoLoading(false);
    }
  };

  const handleIyzicoDisconnect = async () => {
    if (!confirm(t('dashboard.integrationsPage.confirmDisconnectIyzico'))) return;
    try {
      await disconnectIyzico.mutateAsync();
      toast.success(t('dashboard.integrationsPage.iyzicoDisconnected'));
    } catch (error) { toast.error(t('dashboard.integrationsPage.disconnectFailed')); }
  };

const handleShopifyConnect = async () => {
  if (!shopifyForm.shopUrl) {
    toast.error(t('dashboard.integrationsPage.enterShopUrl'));
    return;
  }

  setShopifyLoading(true);

  try {
    // Normalize shop URL
    let shopUrl = shopifyForm.shopUrl.trim().toLowerCase();
    shopUrl = shopUrl.replace(/^https?:\/\//, '').split('/')[0];
   if (!shopUrl.includes('.myshopify.com')) {
  shopUrl = shopUrl + '.myshopify.com';
}

    // Get auth URL from backend (with token)
    const response = await apiClient.get(`/api/shopify/auth?shop=${encodeURIComponent(shopUrl)}`);

    if (response.data.authUrl) {
      window.location.href = response.data.authUrl;
    } else {
      toast.error(response.data.error || t('dashboard.integrationsPage.oauthStartFailed'));
    }
  } catch (error) {
    toast.error(error.response?.data?.error || t('dashboard.integrationsPage.connectFailed'));
  } finally {
    setShopifyLoading(false);
  }
};

  const handleShopifyDisconnect = async () => {
    if (!confirm(t('dashboard.integrationsPage.confirmDisconnectShopify'))) return;
    try {
      await disconnectShopify.mutateAsync();
      toast.success(t('dashboard.integrationsPage.shopifyDisconnected'));
    } catch (error) { toast.error(t('dashboard.integrationsPage.disconnectFailed')); }
  };

  // WooCommerce handlers removed - platform no longer supported

  const handleWebhookSetup = async () => {
    setWebhookLoading(true);
    try {
      const response = await setupWebhook.mutateAsync();
      if (response.data.success) {
        toast.success(t('dashboard.integrationsPage.webhookActivated'));
      }
    } catch (error) {
      toast.error(error.response?.data?.error || t('dashboard.integrationsPage.webhookSetupFailed'));
    } finally {
      setWebhookLoading(false);
    }
  };

  const handleWebhookDisable = async () => {
    if (!confirm(t('dashboard.integrationsPage.confirmDisableWebhook'))) return;
    try {
      await disableWebhook.mutateAsync();
      toast.success(t('dashboard.integrationsPage.webhookDisabled'));
    } catch (error) { toast.error(t('dashboard.integrationsPage.disableFailed')); }
  };

  const handleWebhookRegenerate = async () => {
    if (!confirm(t('dashboard.integrationsPage.confirmRegenerateWebhook'))) return;
    setWebhookLoading(true);
    try {
      const response = await regenerateWebhook.mutateAsync();
      if (response.data.success) {
        toast.success(t('dashboard.integrationsPage.webhookRegenerated'));
      }
    } catch (error) {
      toast.error(t('dashboard.integrationsPage.regenerateFailed'));
    } finally {
      setWebhookLoading(false);
    }
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success(t('dashboard.integrationsPage.copied'));
    setTimeout(() => setCopiedField(null), 2000);
  };

  const copyWebhookUrl = () => {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.telyx.ai';
    // Always use production URL, ignore old database values
    const webhookUrl = `${backendUrl}/api/whatsapp/webhook`;
    navigator.clipboard.writeText(webhookUrl);
    toast.success(t('dashboard.integrationsPage.webhookUrlCopied'));
  };

  // ikas handlers
  const handleIkasConnect = async () => {
    if (!ikasForm.storeName || !ikasForm.clientId || !ikasForm.clientSecret) {
      toast.error(t('dashboard.integrationsPage.fillAllFields'));
      return;
    }
    setIkasLoading(true);
    try {
      const response = await connectIkas.mutateAsync(ikasForm);
      if (response.data.success) {
        toast.success(t('dashboard.integrationsPage.ikasConnected'));
        setIkasModalOpen(false);
        setIkasForm({ storeName: '', clientId: '', clientSecret: '' });
      }
    } catch (error) {
      toast.error(error.response?.data?.error || t('dashboard.integrationsPage.connectFailed'));
    } finally {
      setIkasLoading(false);
    }
  };

  // Ideasoft handlers removed - platform no longer supported

  // Ticimax handlers removed - platform no longer supported

  const handleConnect = async (integration) => {
    try {
      if (integration.type === 'WHATSAPP') {
        await startEmbeddedSignup();
        return;
      }
      if (integration.type === 'IYZICO') { setIyzicoModalOpen(true); return; }
      if (integration.type === 'SHOPIFY') { setShopifyModalOpen(true); return; }
      if (integration.type === 'ZAPIER') {
        if (!webhookStatus?.configured) await handleWebhookSetup();
        setWebhookModalOpen(true);
        return;
      }
      if (integration.type === 'GOOGLE_CALENDAR') {
        const response = await apiClient.get('/api/calendar/google/auth');
        window.location.href = response.data.authUrl;
        return;
      }
      if (integration.type === 'IKAS') { setIkasModalOpen(true); return; }
      toast.info(`${integration.name} ${t('dashboard.integrationsPage.comingSoonIntegration')}`);
    } catch (error) {
      toast.error(t('dashboard.integrationsPage.connectFailed'));
    }
  };

  const handleDisconnect = async (integration) => {
  if (!confirm(t('dashboard.integrationsPage.confirmDisconnectIntegration'))) return;
  try {
    if (integration.type === 'WHATSAPP') await handleWhatsAppDisconnect();
    else if (integration.type === 'IYZICO') await handleIyzicoDisconnect();
    else if (integration.type === 'SHOPIFY') await handleShopifyDisconnect();
    else if (integration.type === 'ZAPIER') await handleWebhookDisable();
    else if (integration.type === 'GOOGLE_CALENDAR') {
      await disconnectGoogleCalendar.mutateAsync();
      toast.success(t('dashboard.integrationsPage.googleCalendarDisconnected'));
    }
    else if (integration.type === 'IKAS') {
      await disconnectIkas.mutateAsync();
      toast.success(t('dashboard.integrationsPage.ikasDisconnected'));
    }
  } catch (error) {
    toast.error(t('dashboard.integrationsPage.disconnectFailed'));
  }
};

  const handleTest = async (integration) => {
  try {
    if (integration.type === 'WHATSAPP') {
      await handleWhatsAppRefresh();
      return;
    }
    if (integration.type === 'GOOGLE_CALENDAR') {
      const response = await testGoogleCalendar.mutateAsync();
      if (response.data.success) toast.success(t('dashboard.integrationsPage.googleCalendarActive'));
      else toast.error(t('dashboard.integrationsPage.testFailed'));
      return;
    }
    if (integration.type === 'IKAS') {
      const response = await testIkas.mutateAsync();
      if (response.data.success) toast.success(t('dashboard.integrationsPage.ikasActive'));
      else toast.error(t('dashboard.integrationsPage.testFailed'));
      return;
    }
    toast.info(t('dashboard.integrationsPage.testNotAvailable'));
  } catch (error) {
    toast.error(t('dashboard.integrationsPage.testFailed'));
  }
};

  const getIntegrationIcon = (type) => INTEGRATION_ICONS[type] || Hash;
  const getCategoryColors = () => ({ icon: 'text-neutral-600 dark:text-neutral-400', bg: 'bg-neutral-100 dark:bg-neutral-800' });
  const getDocsUrl = (type) => INTEGRATION_DOCS[type] || '#';
  const formatWhatsAppTimestamp = (value) => {
    if (!value) return null;

    try {
      return new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value));
    } catch {
      return null;
    }
  };
  const getBusinessTypeDisplay = (type) => {
    const typeMap = { RESTAURANT: 'Restaurant', SALON: 'Salon/Spa', ECOMMERCE: 'E-commerce', CLINIC: 'Clinic/Healthcare', SERVICE: 'Service Business', OTHER: 'General' };
    return typeMap[type] || type;
  };

  const groupedIntegrations = {
    ESSENTIAL: integrations.filter(i => i.priority === 'ESSENTIAL'),
    RECOMMENDED: integrations.filter(i => i.priority === 'RECOMMENDED'),
    OPTIONAL: integrations.filter(i => i.priority === 'OPTIONAL')
  };

  const getCategoryDescription = (type) => {
    const descriptions = {
      GOOGLE_CALENDAR: t('dashboard.integrationsPage.syncAppointments'),
      WHATSAPP: t('dashboard.integrationsPage.whatsappConversations'),
      NETGSM_SMS: t('dashboard.integrationsPage.netgsmDesc'),
      SHOPIFY: t('dashboard.integrationsPage.shopifyConnect'),
      WOOCOMMERCE: t('dashboard.integrationsPage.woocommerceConnect'),
      IYZICO: t('dashboard.integrationsPage.iyzicoConnect'),
      ZAPIER: t('dashboard.integrationsPage.zapierConnect'),
      IKAS: t('dashboard.integrationsPage.ikasConnect'),
      IDEASOFT: t('dashboard.integrationsPage.ideasoftConnect'),
      TICIMAX: t('dashboard.integrationsPage.ticimaxConnect')
    };
    return descriptions[type] || t('dashboard.integrationsPage.title');
  };

  // E-commerce platforms list (only active ones)
  const ECOMMERCE_PLATFORMS = ['SHOPIFY', 'IKAS'];

  // Check which e-commerce platform is connected
  const getConnectedEcommercePlatform = () => {
    if (shopifyStatus?.connected) return 'SHOPIFY';
    if (ikasStatus?.connected) return 'IKAS';
    return null;
  };

  const connectedEcommerce = getConnectedEcommercePlatform();

  // Check if a platform should be disabled (another e-commerce is connected)
  const isEcommerceDisabled = (type) => {
    if (!ECOMMERCE_PLATFORMS.includes(type)) return false;
    return connectedEcommerce && connectedEcommerce !== type;
  };

  // Get platform name for display
  const getEcommercePlatformName = (type) => {
    const names = {
      SHOPIFY: 'Shopify',
      IKAS: 'ikas'
    };
    return names[type] || type;
  };

  // Integrations to hide (removed from platform)
  const HIDDEN_INTEGRATIONS = [];

  // Integration Categories - new structure without sector filter
  const INTEGRATION_CATEGORIES = [
    {
      id: 'ecommerce',
      title: t('dashboard.integrationsPage.categoryEcommerce'),
      icon: ShoppingCart,
      types: ['SHOPIFY', 'IKAS']
    },
    {
      id: 'calendar',
      title: t('dashboard.integrationsPage.categoryCalendar'),
      icon: CalendarDays,
      types: ['GOOGLE_CALENDAR']
    },
    {
      id: 'messaging',
      title: t('dashboard.integrationsPage.categoryMessaging'),
      icon: Smartphone,
      types: ['WHATSAPP']
    },
    {
      id: 'crm',
      title: 'CRM',
      icon: Hash,
      types: ['CUSTOM']
    },
    {
      id: 'email',
      title: t('dashboard.integrationsPage.categoryEmail'),
      icon: Mail,
      types: ['EMAIL']
    }
  ];

  // Filter out hidden integrations and group by category
  const filteredIntegrations = integrations.filter(i => !HIDDEN_INTEGRATIONS.includes(i.type));

  const getCategoryIntegrations = (categoryTypes) => {
    return filteredIntegrations.filter(i => categoryTypes.includes(i.type));
  };

  // Handle locked integration click
  const handleLockedIntegrationClick = (integration, feature) => {
    setSelectedFeature(feature);
    setUpgradeModalOpen(true);
  };

  const renderIntegrationCard = (integration) => {
    const Icon = getIntegrationIcon(integration.type);
    const isWhatsApp = integration.type === 'WHATSAPP';
    const disabled = isEcommerceDisabled(integration.type);
    const whatsappConnected = isWhatsApp ? Boolean(whatsappStatus?.connected ?? integration.connected) : integration.connected;
    const whatsappNeedsReconnect = isWhatsApp ? Boolean(whatsappStatus?.needsReconnect) : false;
    const shouldShowWhatsappDetails = isWhatsApp && (whatsappConnected || whatsappNeedsReconnect);
    const isEffectivelyConnected = isWhatsApp
      ? (whatsappConnected || whatsappNeedsReconnect)
      : integration.connected;
    const whatsappNumberLabel = shouldShowWhatsappDetails
      ? (whatsappStatus?.displayPhoneNumber || whatsappStatus?.phoneNumberId || null)
      : null;
    const whatsappExpiryLabel = formatWhatsAppTimestamp(whatsappStatus?.tokenExpiresAt);
    const whatsappActionLabel = whatsappEmbeddedSignupState === 'awaiting_completion'
      ? t('dashboard.integrationsPage.whatsappWaitingForMeta')
      : (whatsappNeedsReconnect ? t('dashboard.integrationsPage.whatsappReconnect') : t('dashboard.integrationsPage.connect'));
    const whatsappRefreshLabel = refreshWhatsAppConnection.isPending
      ? t('dashboard.integrationsPage.whatsappRefreshing')
      : (whatsappNeedsReconnect ? t('dashboard.integrationsPage.whatsappReconnect') : t('dashboard.integrationsPage.whatsappRefresh'));

    // Check if this integration is locked based on user's plan
    const featureInfo = getIntegrationFeatureInfo(integration.type, userPlan);
    const isLocked = featureInfo.isLocked && !isEffectivelyConnected;

    return (
      <div key={integration.type} className={`bg-white dark:bg-neutral-900 rounded-xl border p-6 transition-shadow ${disabled || isLocked ? 'opacity-70 bg-neutral-50 dark:bg-neutral-800' : 'hover:shadow-md'} border-neutral-200 dark:border-neutral-700`}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <Icon className={`h-6 w-6 ${isLocked ? 'text-neutral-400 dark:text-neutral-500' : 'text-neutral-600 dark:text-neutral-400'}`} />
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`font-semibold ${disabled || isLocked ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-900 dark:text-white'}`}>{integration.name}</h3>
                {isLocked && (
                  <Badge variant="secondary" className="bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 text-xs">
                    <Lock className="h-3 w-3 mr-1" />
                    Pro
                  </Badge>
                )}
                {disabled && !isLocked && (
                  <div className="group relative">
                    <Info className="h-4 w-4 text-neutral-400 dark:text-neutral-500 cursor-help" />
                    <div className="absolute left-0 top-6 hidden group-hover:block z-10 w-48 px-2 py-1 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs rounded shadow-lg">
                      {getEcommercePlatformName(connectedEcommerce)} {t('dashboard.integrationsPage.platformAlreadyConnected')}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          {whatsappConnected && (
            <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
              {t('dashboard.integrationsPage.connected')}
            </Badge>
          )}
        </div>

        {isWhatsApp && !whatsappConnected && whatsappNeedsReconnect && (
          <div className="mb-3 px-2 py-1 bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 text-xs rounded-md inline-flex items-center gap-1">
            <RefreshCw className="h-3 w-3" />
            {t('dashboard.integrationsPage.whatsappReconnectRequired')}
          </div>
        )}

        {isLocked && (
          <div className="mb-3 px-2 py-1 bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 text-xs rounded-md inline-flex items-center gap-1">
            <Lock className="h-3 w-3" />
            {t('dashboard.integrationsPage.requiresProPlan')}
          </div>
        )}

        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4 line-clamp-2">{getCategoryDescription(integration.type)}</p>

        {isWhatsApp && shouldShowWhatsappDetails && (
          <div className="space-y-2 mb-4">
            {whatsappNumberLabel && (
              <p className="text-xs text-neutral-700 dark:text-neutral-300">
                {t('dashboard.integrationsPage.whatsappConnectedNumber')}: <span className="font-medium">{whatsappNumberLabel}</span>
              </p>
            )}
            {whatsappStatus?.tokenExpired ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {t('dashboard.integrationsPage.whatsappTokenExpired')}
              </p>
            ) : whatsappExpiryLabel ? (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {t('dashboard.integrationsPage.whatsappTokenExpires')}: {whatsappExpiryLabel}
              </p>
            ) : null}
            {whatsappEmbeddedSignupState === 'awaiting_completion' && (
              <p className="text-xs text-blue-700 dark:text-blue-300">
                {t('dashboard.integrationsPage.whatsappEmbeddedSignupInProgress')}
              </p>
            )}
            {whatsappEmbeddedSignupState === 'error' && whatsappEmbeddedSignupError && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {whatsappEmbeddedSignupError?.response?.data?.error || whatsappEmbeddedSignupError?.message}
              </p>
            )}
          </div>
        )}

        {isWhatsApp && whatsappConnected && !whatsappNeedsReconnect && can('integrations:connect') && (
          <div className="mb-4 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 p-4 space-y-4">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">
                {t('dashboard.integrationsPage.whatsappTestPanelTitle')}
              </h4>
            </div>

            <div className="grid grid-cols-1 gap-2 text-xs text-neutral-600 dark:text-neutral-400 sm:grid-cols-2">
              {whatsappStatus?.phoneNumberId && (
                <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white/80 dark:bg-neutral-900/40 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-500">
                    {t('dashboard.integrationsPage.whatsappPhoneNumberIdLabel')}
                  </div>
                  <div className="mt-1 font-medium text-neutral-900 dark:text-white break-all">{whatsappStatus.phoneNumberId}</div>
                </div>
              )}
              {whatsappStatus?.wabaId && (
                <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white/80 dark:bg-neutral-900/40 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-500">
                    {t('dashboard.integrationsPage.whatsappBusinessAccountLabel')}
                  </div>
                  <div className="mt-1 font-medium text-neutral-900 dark:text-white break-all">{whatsappStatus.wabaId}</div>
                </div>
              )}
            </div>

            {whatsappTestResult?.acceptedByMeta && (
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white/80 dark:bg-neutral-900/40 px-3 py-2 text-xs text-neutral-600 dark:text-neutral-300">
                {t('dashboard.integrationsPage.whatsappTestAcceptedHint')}
                {whatsappTestResult.templateInfo?.name === 'hello_world' && (
                  <div className="mt-1 text-neutral-500 dark:text-neutral-400">
                    {t('dashboard.integrationsPage.whatsappTestTemplateFallbackHint')}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor={`whatsapp-test-recipient-${integration.type}`}>
                {t('dashboard.integrationsPage.whatsappTestRecipientLabel')}
              </Label>
              <Input
                id={`whatsapp-test-recipient-${integration.type}`}
                type="tel"
                value={whatsappTestForm.recipientPhone}
                placeholder={t('dashboard.integrationsPage.whatsappTestRecipientPlaceholder')}
                onChange={(event) => setWhatsappTestForm((prev) => ({ ...prev, recipientPhone: event.target.value }))}
              />
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {t('dashboard.integrationsPage.whatsappTestRecipientHint')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`whatsapp-test-message-${integration.type}`}>
                {t('dashboard.integrationsPage.whatsappTestMessageLabel')}
              </Label>
              <Textarea
                id={`whatsapp-test-message-${integration.type}`}
                rows={4}
                value={whatsappTestForm.message}
                placeholder={t('dashboard.integrationsPage.whatsappTestMessagePlaceholder')}
                onChange={(event) => setWhatsappTestForm((prev) => ({ ...prev, message: event.target.value }))}
              />
            </div>

            <Button
              size="sm"
              className="w-full"
              onClick={handleSendWhatsAppTestMessage}
              disabled={whatsappTestSending}
            >
              {whatsappTestSending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  {t('dashboard.integrationsPage.whatsappTestSending')}
                </>
              ) : (
                t('dashboard.integrationsPage.whatsappTestSendButton')
              )}
            </Button>

            {whatsappTestResult && (
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white/80 dark:bg-neutral-900/40 px-3 py-3 text-xs text-neutral-700 dark:text-neutral-300 space-y-2">
                <div className="font-medium text-neutral-900 dark:text-white">{t('dashboard.integrationsPage.whatsappTestLastResult')}</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-500">
                      {t('dashboard.integrationsPage.whatsappTestSentTo')}
                    </div>
                    <div className="mt-1 font-medium text-neutral-900 dark:text-white break-words">{whatsappTestResult.recipientPhone}</div>
                  </div>
                  {whatsappTestResult.deliveryMode && (
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-500">
                        {t('dashboard.integrationsPage.whatsappTestDeliveryMode')}
                      </div>
                      <div className="mt-1 font-medium text-neutral-900 dark:text-white">
                        {whatsappTestResult.deliveryMode === 'template' ? t('dashboard.integrationsPage.whatsappTestDeliveryModeTemplate') : t('dashboard.integrationsPage.whatsappTestDeliveryModeText')}
                      </div>
                    </div>
                  )}
                </div>
                {whatsappTestResult.templateInfo?.name && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-500">
                      {t('dashboard.integrationsPage.whatsappTestTemplateUsed')}
                    </div>
                    <div className="mt-1 font-medium text-neutral-900 dark:text-white break-words">
                      {whatsappTestResult.templateInfo.name}{whatsappTestResult.templateInfo.language ? ` (${whatsappTestResult.templateInfo.language})` : ''}
                    </div>
                  </div>
                )}
                {whatsappTestResult.messageId && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-500">
                      {t('dashboard.integrationsPage.whatsappTestMessageId')}
                    </div>
                    <div className="mt-1 break-all font-medium text-neutral-900 dark:text-white">{whatsappTestResult.messageId}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          {isLocked ? (
            <Button
              size="sm"
              className="flex-1"
              variant="outline"
              onClick={() => handleLockedIntegrationClick(integration, featureInfo.feature)}
            >
              <Lock className="h-4 w-4 mr-2" />
              {t('dashboard.integrationsPage.unlock')}
            </Button>
          ) : isWhatsApp ? (
            <>
              {can('integrations:connect') && (
                <>
                  <Button
                    size="sm"
                    className="flex-1"
                    variant={whatsappConnected && !whatsappNeedsReconnect ? 'outline' : 'default'}
                    onClick={() => (whatsappConnected && !whatsappNeedsReconnect ? handleWhatsAppRefresh() : handleConnect(integration))}
                    disabled={disabled || whatsappEmbeddedSignupBusy || refreshWhatsAppConnection.isPending}
                  >
                    {(whatsappEmbeddedSignupBusy || refreshWhatsAppConnection.isPending) && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                    {whatsappConnected && !whatsappNeedsReconnect ? whatsappRefreshLabel : whatsappActionLabel}
                  </Button>
                  {whatsappConnected && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDisconnect(integration)}
                      disabled={whatsappEmbeddedSignupBusy || refreshWhatsAppConnection.isPending}
                    >
                      {t('dashboard.integrationsPage.disconnect')}
                    </Button>
                  )}
                </>
              )}
            </>
          ) : whatsappConnected ? (
            <>
              <Button variant="outline" size="sm" className="flex-1" onClick={() => handleTest(integration)}>{t('dashboard.integrationsPage.testIntegration')}</Button>
              {can('integrations:connect') && (
              <Button variant="outline" size="sm" onClick={() => handleDisconnect(integration)}>{t('dashboard.integrationsPage.disconnect')}</Button>
              )}
            </>
          ) : (
            can('integrations:connect') && (
            <Button size="sm" className="flex-1" onClick={() => handleConnect(integration)} disabled={disabled}>
              {disabled ? t('dashboard.integrationsPage.disabledIntegration') : t('dashboard.integrationsPage.connect')}
            </Button>
            )
          )}
        </div>

        {isWhatsApp && !isLocked && isWhatsAppManualFallbackEnabled && can('integrations:connect') && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            onClick={() => setWhatsappModalOpen(true)}
            disabled={whatsappEmbeddedSignupBusy}
          >
            {t('dashboard.integrationsPage.whatsappManualFallback')}
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <PageIntro
        title={pageHelp?.title || t('dashboard.integrationsPage.title')}
        subtitle={pageHelp?.subtitle}
        locale={locale}
        help={pageHelp ? { tooltipTitle: pageHelp.tooltipTitle, tooltipBody: pageHelp.tooltipBody, quickSteps: pageHelp.quickSteps } : undefined}
      />

      {/* All Integrations Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6 animate-pulse">
              <div className="h-12 w-12 bg-neutral-200 dark:bg-neutral-700 rounded-lg mb-4"></div>
              <div className="h-6 w-32 bg-neutral-200 dark:bg-neutral-700 rounded mb-2"></div>
              <div className="h-4 w-full bg-neutral-200 dark:bg-neutral-700 rounded mb-4"></div>
              <div className="h-10 w-full bg-neutral-200 dark:bg-neutral-700 rounded"></div>
            </div>
          ))}
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Custom CRM Integration - Only for ECOMMERCE - Moved to top */}
          {businessType === 'ECOMMERCE' && (() => {
            const isCRMLocked = crmFeatureInfo.isLocked || crmStatus?.isLockedByAccess;
            const isCrmConnected = !isCRMLocked && crmStatus?.hasWebhook && crmStatus?.isActive;

            return (
            <div className={`bg-white dark:bg-neutral-900 rounded-xl border p-6 transition-shadow ${isCRMLocked ? 'opacity-70 bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700' : isCrmConnected ? 'border-neutral-400 dark:border-neutral-600 hover:shadow-md' : 'border-neutral-200 dark:border-neutral-700 hover:shadow-md'}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <IntegrationLogo type="CUSTOM" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className={`font-semibold ${isCRMLocked ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-900 dark:text-white'}`}>
                        {t('dashboard.integrationsPage.customCrmWebhook')}
                      </h3>
                      {isCRMLocked && (
                        <Badge variant="secondary" className="bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 text-xs">
                          <Lock className="h-3 w-3 mr-1" />
                          Pro
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                {isCrmConnected && (
                  <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
                    {t('dashboard.integrationsPage.connected')}
                  </Badge>
                )}
              </div>

              {isCRMLocked && (
                <div className="mb-4 px-2 py-1 bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 text-xs rounded-md inline-flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  {t('dashboard.integrationsPage.requiresProPlan')}
                </div>
              )}

              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                {t('dashboard.integrationsPage.sendDataFromSystem')}
              </p>

              {isCRMLocked ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setSelectedFeature(crmFeatureInfo.feature);
                    setUpgradeModalOpen(true);
                  }}
                >
                  <Lock className="h-4 w-4 mr-2" />
                  {t('dashboard.integrationsPage.unlock')}
                </Button>
              ) : isCrmConnected ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => window.location.href = '/dashboard/integrations/custom-crm'}
                  >
                    {t('dashboard.integrationsPage.manage')}
                  </Button>
                  {can('integrations:connect') && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      if (!confirm(t('dashboard.integrationsPage.confirmDisconnectIntegration'))) return;
                      try {
                        await apiClient.patch('/api/crm/webhook/toggle');
                        toast.success(t('dashboard.integrationsPage.crmDisconnected') || 'CRM bağlantısı kesildi');
                        window.location.reload();
                      } catch (error) {
                        toast.error(t('dashboard.integrationsPage.disconnectFailed'));
                      }
                    }}
                  >
                    {t('dashboard.integrationsPage.disconnect')}
                  </Button>
                  )}
                </div>
              ) : (
              <Button
                size="sm"
                className="w-full"
                onClick={() => window.location.href = '/dashboard/integrations/custom-crm'}
              >
                {t('dashboard.integrationsPage.connect')}
              </Button>
              )}
            </div>
            );
          })()}

          {/* Gmail Card */}
          <div className={`bg-white dark:bg-neutral-900 rounded-xl border p-6 hover:shadow-md transition-shadow ${emailStatus?.connected && emailStatus?.provider === 'GMAIL' ? 'border-neutral-400 dark:border-neutral-600' : 'border-neutral-200 dark:border-neutral-700'}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <IntegrationLogo type="GMAIL" />
                <div>
                  <h3 className="font-semibold text-neutral-900 dark:text-white">Gmail</h3>
                </div>
              </div>
              {emailStatus?.connected && emailStatus?.provider === 'GMAIL' && (
                <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
                  {t('dashboard.integrationsPage.connected')}
                </Badge>
              )}
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">{t('dashboard.integrationsPage.gmailDesc')}</p>
            {emailStatus?.connected && emailStatus?.provider === 'GMAIL' ? (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => window.location.href = '/dashboard/email'}>
                  <Inbox className="h-4 w-4 mr-1" />{t('dashboard.integrationsPage.openInbox')}
                </Button>
                {can('integrations:connect') && (
                <Button variant="outline" size="sm" onClick={handleEmailDisconnect} disabled={emailLoading}>{t('dashboard.integrationsPage.disconnect')}</Button>
                )}
              </div>
            ) : (
              can('integrations:connect') && (
              <Button size="sm" className="w-full" onClick={handleGmailConnect} disabled={emailLoading || (emailStatus?.connected && emailStatus?.provider !== 'GMAIL')}>
                {emailLoading ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />{t('dashboard.integrationsPage.connectingText')}</> : t('dashboard.integrationsPage.connect')}
              </Button>
              )
            )}
          </div>

          {/* Outlook Card */}
          <div className={`bg-white dark:bg-neutral-900 rounded-xl border p-6 hover:shadow-md transition-shadow ${emailStatus?.connected && emailStatus?.provider === 'OUTLOOK' ? 'border-neutral-400 dark:border-neutral-600' : 'border-neutral-200 dark:border-neutral-700'}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <IntegrationLogo type="OUTLOOK" />
                <div>
                  <h3 className="font-semibold text-neutral-900 dark:text-white">Microsoft 365</h3>
                </div>
              </div>
              {emailStatus?.connected && emailStatus?.provider === 'OUTLOOK' && (
                <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
                  {t('dashboard.integrationsPage.connected')}
                </Badge>
              )}
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">{t('dashboard.integrationsPage.outlookDesc')}</p>
            {emailStatus?.connected && emailStatus?.provider === 'OUTLOOK' ? (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => window.location.href = '/dashboard/email'}>
                  <Inbox className="h-4 w-4 mr-1" />{t('dashboard.integrationsPage.openInbox')}
                </Button>
                {can('integrations:connect') && (
                <Button variant="outline" size="sm" onClick={handleEmailDisconnect} disabled={emailLoading}>{t('dashboard.integrationsPage.disconnect')}</Button>
                )}
              </div>
            ) : (
              can('integrations:connect') && (
              <Button size="sm" className="w-full" onClick={handleOutlookConnect} disabled={emailLoading || (emailStatus?.connected && emailStatus?.provider !== 'OUTLOOK')}>
                {emailLoading ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />{t('dashboard.integrationsPage.connectingText')}</> : t('dashboard.integrationsPage.connect')}
              </Button>
              )
            )}
          </div>

          {/* Other Integrations */}
          {filteredIntegrations.map(renderIntegrationCard)}
      </div>
      )}

      {isWhatsAppManualFallbackEnabled && (
        <Dialog open={whatsappModalOpen} onOpenChange={setWhatsappModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t('dashboard.integrationsPage.whatsappModalTitle')}</DialogTitle>
              <DialogDescription>{t('dashboard.integrationsPage.whatsappModalDesc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t('dashboard.integrationsPage.accessToken')}</Label>
                <Input type="password" placeholder={t('dashboard.integrationsPage.accessTokenPlaceholder')} value={whatsappForm.accessToken} onChange={(e) => setWhatsappForm({ ...whatsappForm, accessToken: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('dashboard.integrationsPage.phoneNumberId')}</Label>
                <Input type="text" placeholder={t('dashboard.integrationsPage.phoneNumberIdPlaceholder')} value={whatsappForm.phoneNumberId} onChange={(e) => setWhatsappForm({ ...whatsappForm, phoneNumberId: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('dashboard.integrationsPage.verifyToken')}</Label>
                <Input type="text" placeholder={t('dashboard.integrationsPage.verifyTokenPlaceholder')} value={whatsappForm.verifyToken} onChange={(e) => setWhatsappForm({ ...whatsappForm, verifyToken: e.target.value })} />
                <p className="text-xs text-neutral-500">
                  {t('dashboard.integrationsPage.verifyTokenHint')}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <div className="flex gap-2">
                  <Input type="text" readOnly value={`${process.env.NEXT_PUBLIC_API_URL || 'https://api.telyx.ai'}/api/whatsapp/webhook`} className="bg-neutral-50" />
                  <Button type="button" variant="outline" size="icon" onClick={copyWebhookUrl}><Copy className="h-4 w-4" /></Button>
                </div>
                <p className="text-xs text-neutral-500">
                  {t('dashboard.integrationsPage.webhookUrlPasteHint')}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setWhatsappModalOpen(false)} disabled={whatsappLoading}>{t('common.cancel')}</Button>
              <Button onClick={handleWhatsAppConnect} disabled={whatsappLoading}>{whatsappLoading ? t('dashboard.integrationsPage.connectingText') : t('dashboard.integrationsPage.connectWhatsApp')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* iyzico Modal */}
      <Dialog open={iyzicoModalOpen} onOpenChange={setIyzicoModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('dashboard.integrationsPage.iyzicoModalTitle')}</DialogTitle>
            <DialogDescription>{t('dashboard.integrationsPage.iyzicoModalDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('dashboard.integrationsPage.apiKeyLabel')}</Label>
              <Input type="text" placeholder={t('dashboard.integrationsPage.apiKeyPlaceholder')} value={iyzicoForm.apiKey} onChange={(e) => setIyzicoForm({ ...iyzicoForm, apiKey: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('dashboard.integrationsPage.secretKeyLabel')}</Label>
              <div className="relative">
                <Input type={showIyzicoSecret ? 'text' : 'password'} placeholder={t('dashboard.integrationsPage.secretKeyPlaceholder')} value={iyzicoForm.secretKey} onChange={(e) => setIyzicoForm({ ...iyzicoForm, secretKey: e.target.value })} className="pr-10" />
                <button type="button" onClick={() => setShowIyzicoSecret(!showIyzicoSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500">
                  {showIyzicoSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('dashboard.integrationsPage.environmentLabel')}</Label>
              <select className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm" value={iyzicoForm.environment} onChange={(e) => setIyzicoForm({ ...iyzicoForm, environment: e.target.value })}>
                <option value="sandbox">{t('dashboard.integrationsPage.sandboxTesting')}</option>
                <option value="production">{t('dashboard.integrationsPage.productionLive')}</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIyzicoModalOpen(false)} disabled={iyzicoLoading}>{t('common.cancel')}</Button>
            <Button onClick={handleIyzicoConnect} disabled={iyzicoLoading}>{iyzicoLoading ? t('dashboard.integrationsPage.connectingText') : t('dashboard.integrationsPage.connectIyzico')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shopify Modal */}
      <Dialog open={shopifyModalOpen} onOpenChange={(open) => { setShopifyModalOpen(open); if (!open) setShopifyLoading(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-green-600" />
              {t('dashboard.integrationsPage.shopifyModalTitle')}
            </DialogTitle>
            <DialogDescription>{t('dashboard.integrationsPage.shopifyModalDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('dashboard.integrationsPage.shopUrlLabel')}</Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder={t('dashboard.integrationsPage.shopUrlPlaceholder')}
                  value={shopifyForm.shopUrl}
                  onChange={(e) => setShopifyForm({ ...shopifyForm, shopUrl: e.target.value })}
                  className="flex-1"
                />
                <span className="flex items-center text-sm text-neutral-500">.myshopify.com</span>
              </div>
              <p className="text-xs text-neutral-500">{t('dashboard.integrationsPage.shopUrlHint')}</p>
            </div>

            {shopifyStatus?.connected && (
              <div className="flex items-center gap-2 p-3 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
                <p className="text-sm font-medium text-neutral-900 dark:text-white">{t('dashboard.integrationsPage.connectedLabel')}: {shopifyStatus.shopName || shopifyStatus.shopDomain}</p>
              </div>
            )}

            <div className="bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4">
              <h4 className="text-sm font-medium text-neutral-900 dark:text-white mb-2">{t('dashboard.integrationsPage.howItWorks')}</h4>
              <ol className="text-sm text-neutral-700 dark:text-neutral-300 space-y-1 list-decimal list-inside">
                <li>{t('dashboard.integrationsPage.shopifyStep1')}</li>
                <li>{t('dashboard.integrationsPage.shopifyStep2')}</li>
                <li>{t('dashboard.integrationsPage.shopifyStep3')}</li>
              </ol>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShopifyModalOpen(false)} disabled={shopifyLoading}>{t('common.cancel')}</Button>
            <Button onClick={handleShopifyConnect} disabled={shopifyLoading || !shopifyForm.shopUrl}>
              {shopifyLoading ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />{t('dashboard.integrationsPage.connectingText')}</>
              ) : (
                <><ExternalLink className="h-4 w-4 mr-2" />{t('dashboard.integrationsPage.connectWithShopify')}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WooCommerce Modal - REMOVED (platform no longer supported) */}

      {/* Webhook Modal */}
      <Dialog open={webhookModalOpen} onOpenChange={setWebhookModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('dashboard.integrationsPage.webhookModalTitle')}</DialogTitle>
            <DialogDescription>{t('dashboard.integrationsPage.webhookModalDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {webhookStatus?.configured ? (
              <>
                <div className="space-y-2">
                  <Label>{t('dashboard.integrationsPage.yourWebhookUrl')}</Label>
                  <div className="flex gap-2">
                    <Input type="text" readOnly value={webhookStatus.webhookUrl || ''} className="bg-neutral-50 font-mono text-sm" />
                    <Button type="button" variant="outline" size="icon" onClick={() => copyToClipboard(webhookStatus.webhookUrl, 'url')}>
                      {copiedField === 'url' ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleWebhookRegenerate} disabled={webhookLoading} className="flex-1">
                    {webhookLoading ? t('dashboard.integrationsPage.regeneratingUrl') : t('dashboard.integrationsPage.regenerateUrl')}
                  </Button>
                  <Button variant="destructive" onClick={handleWebhookDisable} disabled={webhookLoading} className="flex-1">{t('dashboard.integrationsPage.disableWebhook')}</Button>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-neutral-600 mb-4">{t('dashboard.integrationsPage.clickToGetWebhookUrl')}</p>
                <Button onClick={handleWebhookSetup} disabled={webhookLoading}>{webhookLoading ? t('dashboard.integrationsPage.activatingWebhook') : t('dashboard.integrationsPage.activateWebhook')}</Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWebhookModalOpen(false)}>{t('common.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ikas Modal */}
      <Dialog open={ikasModalOpen} onOpenChange={setIkasModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-orange-600" />
              {t('dashboard.integrationsPage.ikasModalTitle')}
            </DialogTitle>
            <DialogDescription>{t('dashboard.integrationsPage.ikasModalDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('dashboard.integrationsPage.storeNameLabel')}</Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder={t('dashboard.integrationsPage.storeNamePlaceholder')}
                  value={ikasForm.storeName}
                  onChange={(e) => setIkasForm({ ...ikasForm, storeName: e.target.value })}
                  className="flex-1"
                />
                <span className="flex items-center text-sm text-neutral-500">.myikas.com</span>
              </div>
              <p className="text-xs text-neutral-500">{t('dashboard.integrationsPage.storeNameHint')}</p>
            </div>
            <div className="space-y-2">
              <Label>{t('dashboard.integrationsPage.clientIdLabel')}</Label>
              <Input
                type="text"
                placeholder={t('dashboard.integrationsPage.clientIdPlaceholder')}
                value={ikasForm.clientId}
                onChange={(e) => setIkasForm({ ...ikasForm, clientId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('dashboard.integrationsPage.clientSecretLabel')}</Label>
              <Input
                type="password"
                placeholder={t('dashboard.integrationsPage.clientSecretPlaceholder')}
                value={ikasForm.clientSecret}
                onChange={(e) => setIkasForm({ ...ikasForm, clientSecret: e.target.value })}
              />
            </div>
            {ikasStatus?.connected && (
              <div className="flex items-center gap-2 p-3 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
                <p className="text-sm font-medium text-neutral-900 dark:text-white">{t('dashboard.integrationsPage.connectedLabel')}: {ikasStatus.storeName}</p>
              </div>
            )}
            <div className="bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4">
              <h4 className="text-sm font-medium text-neutral-900 dark:text-white mb-2">{t('dashboard.integrationsPage.ikasApiInfoTitle')}</h4>
              <ol className="text-sm text-neutral-700 dark:text-neutral-300 space-y-1 list-decimal list-inside">
                <li>{t('dashboard.integrationsPage.ikasStep1')}</li>
                <li>{t('dashboard.integrationsPage.ikasStep2')}</li>
                <li>{t('dashboard.integrationsPage.ikasStep3')}</li>
                <li>{t('dashboard.integrationsPage.ikasStep4')}</li>
                <li>{t('dashboard.integrationsPage.ikasStep5')}
                  <ul>
                    <li>{t('dashboard.integrationsPage.ikasPermission1')}</li>
                    <li>{t('dashboard.integrationsPage.ikasPermission2')}</li>
                    <li>{t('dashboard.integrationsPage.ikasPermission3')}</li>
                  </ul>
                </li>
                <li>{t('dashboard.integrationsPage.ikasStep6')}</li>
                <li>{t('dashboard.integrationsPage.ikasStep7')}</li>
              </ol>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIkasModalOpen(false)} disabled={ikasLoading}>{t('common.cancel')}</Button>
            <Button onClick={handleIkasConnect} disabled={ikasLoading}>
              {ikasLoading ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />{t('dashboard.integrationsPage.connectingText')}</> : t('dashboard.integrationsPage.connectIkas')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ideasoft Modal - REMOVED (platform no longer supported) */}
      {/* Ticimax Modal - REMOVED (platform no longer supported) */}

      {/* Upgrade Modal for locked integrations */}
      <UpgradeModal
        isOpen={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        featureId={selectedFeature?.id}
        requiredPlan="Pro"
      />
    </div>
  );
}
