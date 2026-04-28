/**
 * Integrations Page
 * Manage third-party integrations with business type-based filtering
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
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
  Target, Cloud, Calendar, CalendarDays, Smartphone,
  ShoppingCart, Utensils, Scissors, Stethoscope, Package, Mail, Hash,
  Wallet, Inbox, RefreshCw, Lock, Info, AlertTriangle
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { toast, toastHelpers } from '@/lib/toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermissions } from '@/hooks/usePermissions';
import PageIntro from '@/components/PageIntro';
import { getPageHelp } from '@/content/pageHelp';
import UpgradeModal from '@/components/UpgradeModal';
import runtimeConfig from '@/lib/runtime-config';
import {
  getIntegrationFeatureInfo,
  LOCKED_INTEGRATIONS_FOR_BASIC,
  FEATURES
} from '@/lib/features';
import {
  useIntegrations,
  useUserPlan,
  useWhatsAppStatus,
  useEmailStatus,
  useShopifyStatus,
  useWebhookStatus,
  useIkasStatus,
  useTrendyolStatus,
  useHepsiburadaStatus,
  useAmazonStatus,
  useSikayetvarStatus,
  useConnectWhatsApp,
  useDisconnectWhatsApp,
  useDisconnectEmail,
  useDisconnectShopify,
  useConnectIkas,
  useDisconnectIkas,
  useConnectTrendyol,
  useDisconnectTrendyol,
  useTestTrendyol,
  useConnectHepsiburada,
  useDisconnectHepsiburada,
  useTestHepsiburada,
  useDisconnectAmazon,
  useTestAmazon,
  useConnectSikayetvar,
  useDisconnectSikayetvar,
  useTestSikayetvar,
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
import { cn } from '@/lib/utils';
import {
  getDashboardInsetClass,
  getDashboardOverlaySurfaceClass,
} from '@/components/dashboard/dashboardSurfaceTheme';

// Integration logo paths
const INTEGRATION_LOGOS = {
  GOOGLE_CALENDAR: {
    src: '/assets/integrations/googlecalendar.svg',
    width: 24,
    height: 24,
    className: 'h-6 w-6 object-contain',
  },
  WHATSAPP: {
    src: '/assets/integrations/whatsapp.svg',
    width: 24,
    height: 24,
    className: 'h-6 w-6 object-contain',
  },
  SHOPIFY: {
    src: '/assets/integrations/shopify.svg',
    width: 24,
    height: 24,
    className: 'h-6 w-6 object-contain',
  },
  IKAS: {
    src: '/assets/integrations/ikas.ico',
    width: 24,
    height: 24,
    className: 'h-6 w-6 object-contain',
  },
  GMAIL: {
    src: '/assets/integrations/gmail.svg',
    width: 24,
    height: 24,
    className: 'h-6 w-6 object-contain',
  },
  OUTLOOK: {
    src: '/assets/integrations/outlook.png',
    width: 24,
    height: 24,
    className: 'h-6 w-6 object-contain',
  },
  WEBHOOK: {
    src: '/assets/integrations/webhook.png',
    width: 24,
    height: 24,
    className: 'h-6 w-6 object-contain',
  },
  TRENDYOL: {
    src: '/assets/integrations/trendyol.png',
    width: 28,
    height: 28,
    className: 'h-7 w-7 rounded-md object-cover',
    unoptimized: true,
  },
  AMAZON: {
    src: '/assets/integrations/amazon.svg',
    width: 32,
    height: 32,
    className: 'h-8 w-8 object-contain',
  },
  HEPSIBURADA: {
    src: '/assets/integrations/hepsiburada.png',
    width: 28,
    height: 28,
    className: 'h-7 w-7 rounded-md object-cover',
    unoptimized: true,
  },
};

const CARD_ICON_WRAPPER_CLASS = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white dark:border-white/10 dark:bg-[#0B1730]/88';
const STANDARD_CARD_CLASS = 'flex h-full min-h-[14rem] flex-col rounded-xl border p-6 transition-shadow';

const LockedPlanBadge = ({ text }) => (
  <div tabIndex={0} className="group relative inline-flex outline-none">
    <Badge
      variant="secondary"
      className="cursor-help bg-neutral-100 text-neutral-700 dark:bg-white/8 dark:text-neutral-400 text-xs focus-visible:ring-2 focus-visible:ring-neutral-300 dark:focus-visible:ring-cyan-500/20"
    >
      <Lock className="h-3 w-3 mr-1" />
      Pro
    </Badge>
    <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-56 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 dark:border-white/10 dark:bg-[#081224]/98 dark:text-neutral-200">
      {text}
    </div>
  </div>
);

const IntegrationLogo = ({ type, className }) => {
  if (type === 'CUSTOM') {
    return <Target className={cn('h-6 w-6 text-sky-500 dark:text-cyan-300', className)} />;
  }

  const logo = INTEGRATION_LOGOS[type];
  if (logo) {
    return (
      <Image
        src={logo.src}
        alt={type}
        width={logo.width}
        height={logo.height}
        className={className || logo.className}
        unoptimized={logo.unoptimized}
      />
    );
  }
  return <Hash className={className || 'h-6 w-6'} />;
};

const INTEGRATION_ICONS = {
  GOOGLE_CALENDAR: ({ className }) => <IntegrationLogo type="GOOGLE_CALENDAR" className={className} />,
  WHATSAPP: ({ className }) => <IntegrationLogo type="WHATSAPP" className={className} />,
  SHOPIFY: ({ className }) => <IntegrationLogo type="SHOPIFY" className={className} />,
  IKAS: ({ className }) => <IntegrationLogo type="IKAS" className={className} />,
  TRENDYOL: ({ className }) => <IntegrationLogo type="TRENDYOL" className={className} />,
  HEPSIBURADA: ({ className }) => <IntegrationLogo type="HEPSIBURADA" className={className} />,
  AMAZON: ({ className }) => <IntegrationLogo type="AMAZON" className={className} />,
  SIKAYETVAR: AlertTriangle,
  CUSTOM: Hash
};

const INTEGRATION_DOCS = {
  GOOGLE_CALENDAR: 'https://developers.google.com/calendar',
  WHATSAPP: 'https://developers.facebook.com/docs/whatsapp',
  SHOPIFY: 'https://shopify.dev',
  IKAS: 'https://ikas.dev',
  TRENDYOL: 'https://developers.trendyol.com/docs/musteri-sorularini-cekme',
  HEPSIBURADA: 'https://developers.hepsiburada.com/hepsiburada/reference/saticiya-sor',
  AMAZON: 'https://developer-docs.amazon.com/sp-api/docs/messaging-api',
  SIKAYETVAR: 'https://doc.sikayetplus.com/'
};

export default function IntegrationsPage() {
  const { resolvedTheme } = useTheme();
  const { t, locale } = useLanguage();
  const dark = resolvedTheme === 'dark';
  const isTr = locale === 'tr';
  const marketplaceCopy = {
    beta: 'Beta',
    marketplaceCategory: isTr ? 'Pazaryeri Q&A' : 'Marketplace Q&A',
    complaintsCategory: isTr ? 'Şikayet Yönetimi' : 'Complaint Management',
    crmCategory: 'CRM',
    connectionActive: isTr ? 'Bağlantı aktif' : 'Connection active',
    sellerId: 'Seller ID',
    merchantId: 'Merchant ID',
    sellingPartnerId: isTr ? 'Selling Partner ID' : 'Selling Partner ID',
    marketplaceId: isTr ? 'Marketplace ID' : 'Marketplace ID',
    apiKey: 'API Key',
    apiSecret: 'API Secret',
    company: isTr ? 'Şirket' : 'Company',
    companyPage: isTr ? 'Kurumsal sayfa' : 'Company page',
    lastSync: isTr ? 'Son senkron' : 'Last sync',
    marketplacePanel: isTr ? 'Soru paneli' : 'Question panel',
    marketplacePanelCta: isTr ? 'Pazaryeri Q&A' : 'Marketplace Q&A',
    complaintsPanel: isTr ? 'Şikayet paneli' : 'Complaint panel',
    complaintsPanelCta: isTr ? 'Şikayet Yönetimi' : 'Complaint Management',
    requiredTrendyolFields: isTr ? 'Seller ID, API key ve API secret gerekli' : 'Seller ID, API key, and API secret are required',
    trendyolConnectSuccess: isTr ? 'Trendyol bağlantısı başarılı' : 'Trendyol connected successfully',
    trendyolConnectError: isTr ? 'Trendyol bağlantısı başarısız' : 'Failed to connect Trendyol',
    requiredHepsiburadaFields: isTr ? 'Merchant ID ve servis anahtarı gerekli' : 'Merchant ID and service key are required',
    hepsiburadaConnectSuccess: isTr ? 'Hepsiburada bağlantısı başarılı' : 'Hepsiburada connected successfully',
    hepsiburadaConnectError: isTr ? 'Hepsiburada bağlantısı başarısız' : 'Failed to connect Hepsiburada',
    requiredSikayetvarFields: isTr ? 'Şikayetvar API token gerekli' : 'Sikayetvar API token is required',
    sikayetvarConnectSuccess: isTr ? 'Şikayetvar bağlantısı başarılı' : 'Sikayetvar connected successfully',
    sikayetvarConnectError: isTr ? 'Şikayetvar bağlantısı başarısız' : 'Failed to connect Sikayetvar',
    trendyolDisconnected: isTr ? 'Trendyol bağlantısı kesildi' : 'Trendyol disconnected',
    hepsiburadaDisconnected: isTr ? 'Hepsiburada bağlantısı kesildi' : 'Hepsiburada disconnected',
    sikayetvarDisconnected: isTr ? 'Şikayetvar bağlantısı kesildi' : 'Sikayetvar disconnected',
    trendyolActive: isTr ? 'Trendyol bağlantısı aktif' : 'Trendyol connection is active',
    hepsiburadaActive: isTr ? 'Hepsiburada bağlantısı aktif' : 'Hepsiburada connection is active',
    sikayetvarActive: isTr ? 'Şikayetvar bağlantısı aktif' : 'Sikayetvar connection is active',
    trendyolModalTitle: isTr ? 'Trendyol Q&A Bağlantısı' : 'Trendyol Q&A Connection',
    trendyolModalDescription: isTr ? 'Seller ID ve API bilgilerinizi girin. Sistem bağlantıyı test edip soru senkronizasyonunu aktif eder.' : 'Enter your Seller ID and API credentials. The system will test the connection and enable question sync.',
    trendyolHelper: isTr ? 'Soru taslakları çekilir, AI yanıtı oluşturulur ve Pazaryeri Q&A ekranında onaya düşer.' : 'Question drafts are pulled, AI replies are generated, and they appear in Marketplace Q&A for approval.',
    trendyolConnectButton: isTr ? 'Trendyol Bağla' : 'Connect Trendyol',
    sellerIdPlaceholder: isTr ? 'satıcı kimliği' : 'seller identifier',
    apiKeyPlaceholder: isTr ? 'API anahtarı' : 'API key',
    apiSecretPlaceholder: isTr ? 'API gizli anahtarı' : 'API secret',
    hepsiburadaModalTitle: isTr ? 'Hepsiburada Q&A Bağlantısı' : 'Hepsiburada Q&A Connection',
    hepsiburadaModalDescription: isTr ? 'Merchant ID, varsa entegratör kullanıcı adı ve servis anahtarını girin. Sistem bağlantıyı test eder.' : 'Enter the Merchant ID, optional integrator username, and service key. The system will test the connection.',
    hepsiburadaLegacyApiKey: isTr ? 'Eski Kullanıcı Adı / API Key (opsiyonel)' : 'Legacy Username / API Key (optional)',
    hepsiburadaServiceKey: isTr ? 'Servis Anahtarı / API Secret' : 'Service Key / API Secret',
    hepsiburadaLegacyPlaceholder: isTr ? 'entegratör kullanıcı adı' : 'integrator username',
    hepsiburadaSecretPlaceholder: isTr ? 'servis anahtarı' : 'service key',
    merchantIdPlaceholder: isTr ? 'mağaza kimliği' : 'merchant identifier',
    hepsiburadaHelper: isTr ? 'Hepsiburada soruları çekilir, AI yanıtı oluşturulur ve panelden onaylandığında platforma gönderilir.' : 'Hepsiburada questions are pulled, AI replies are generated, and posted after approval from the panel.',
    hepsiburadaConnectButton: isTr ? 'Hepsiburada Bağla' : 'Connect Hepsiburada',
    amazonConnectDescription: isTr ? 'Amazon mağazanızı bağlayın, buyer messaging akışlarını yönetin ve sipariş iletişimini panelden hızlandırın.' : 'Connect your Amazon store, manage buyer messaging flows, and speed up order-based communication from the dashboard.',
    amazonConnectSuccess: isTr ? 'Amazon yönlendirmesi başlatıldı' : 'Amazon authorization started',
    amazonConnectError: isTr ? 'Amazon bağlantısı başlatılamadı' : 'Failed to start Amazon authorization',
    amazonDisconnected: isTr ? 'Amazon bağlantısı kesildi' : 'Amazon disconnected',
    amazonActive: isTr ? 'Amazon bağlantısı aktif' : 'Amazon connection is active',
    amazonValidationWarning: isTr ? 'OAuth tamam, ancak test için SP-API rolü ve/veya gerçek sipariş verisi gerekebilir.' : 'OAuth is complete, but SP-API roles and/or real order data may still be required for validation.',
    amazonBuyerMessaging: isTr ? 'Buyer Messaging hazır' : 'Buyer Messaging ready',
    amazonProductQaUnsupported: isTr ? 'Ürün soru-cevap feedi Amazon SP-API içinde birebir sunulmuyor.' : 'Product Q&A feed is not exposed one-to-one in Amazon SP-API.',
    amazonSandbox: isTr ? 'Sandbox modu' : 'Sandbox mode',
    amazonAuthorizedMarketplaces: isTr ? 'Yetkili pazarlar' : 'Authorized marketplaces',
    amazonRolesHint: isTr ? 'Derin test için uygulamada en az Selling Partner Insights veya Product Listing rolü önerilir.' : 'For deeper validation, configure at least the Selling Partner Insights or Product Listing role in the app.',
    sikayetvarModalTitle: isTr ? 'Şikayetvar Bağlantısı' : 'Sikayetvar Connection',
    sikayetvarModalDescription: isTr ? 'Kurumsal üyelik tokenınızı girin. Sistem bağlantıyı test eder, açık şikayetleri çeker ve AI taslaklarını manuel onaya hazırlar.' : 'Enter your corporate membership token. The system will test the connection, pull open complaints, and prepare AI drafts for manual approval.',
    sikayetvarTokenLabel: isTr ? 'X-Auth-Key / API Token' : 'X-Auth-Key / API Token',
    sikayetvarTokenPlaceholder: isTr ? 'Şikayetvar API token' : 'Sikayetvar API token',
    sikayetvarHelper: isTr ? 'Sistem açık şikayetleri çeker, empatik AI cevap taslakları üretir ve yalnızca sizin onayınızdan sonra platforma gönderir.' : 'The system pulls open complaints, creates empathetic AI drafts, and sends them only after your approval.',
    sikayetvarConnectButton: isTr ? 'Şikayetvar Bağla' : 'Connect Sikayetvar',
  };
  const imapCopy = {
    title: isTr ? 'IMAP / SMTP' : 'IMAP / SMTP',
    description: isTr
      ? 'Kurumsal mail sunucuları için manuel bağlantı. OAuth olmayan şirket mailboxlarını IMAP ile okuyup SMTP ile yanıtlarız.'
      : 'Manual connection for corporate mail servers. We read non-OAuth company mailboxes via IMAP and send replies via SMTP.',
    modalTitle: isTr ? 'IMAP / SMTP Bağlantısı' : 'IMAP / SMTP Connection',
    modalDescription: isTr
      ? 'Mailbox bilgilerini girin. Sistem önce IMAP ve SMTP bağlantısını test eder, sonra hesabı bağlar.'
      : 'Enter your mailbox settings. The system verifies IMAP and SMTP access first, then saves the account.',
    helper: isTr
      ? 'Çoğu kurumsal hesap normal şifre yerine app password ister. İlk sürümde IMAP inbox senkronu ve SMTP gönderimi desteklenir.'
      : 'Most corporate accounts require an app password instead of a normal password. This first version supports IMAP inbox sync and SMTP sending.',
    email: isTr ? 'E-posta adresi' : 'Email address',
    username: isTr ? 'Kullanıcı adı' : 'Username',
    password: isTr ? 'Şifre / App password' : 'Password / app password',
    imapHost: 'IMAP Host',
    imapPort: 'IMAP Port',
    smtpHost: 'SMTP Host',
    smtpPort: 'SMTP Port',
    secureLabel: isTr ? 'Güvenli bağlantı' : 'Secure connection',
    secureTls: 'SSL / TLS',
    startTls: 'STARTTLS / Opportunistic TLS',
    connectButton: isTr ? 'IMAP Bağla' : 'Connect IMAP',
    connectSuccess: isTr ? 'IMAP / SMTP bağlantısı başarılı' : 'IMAP / SMTP connected successfully',
    connectError: isTr ? 'IMAP / SMTP bağlantısı kurulamadı' : 'Failed to connect IMAP / SMTP',
    fillRequired: isTr ? 'Tüm zorunlu alanları doldurun' : 'Fill in all required fields',
    emailPlaceholder: 'info@company.com',
    usernamePlaceholder: isTr ? 'çoğu zaman e-posta adresi ile aynı' : 'usually same as the email address',
    passwordPlaceholder: isTr ? 'mailbox app password' : 'mailbox app password',
    hostPlaceholder: 'mail.company.com',
  };
  const { can, user } = usePermissions();
  const pageHelp = getPageHelp('integrations', locale);
  const queryClient = useQueryClient();
  const [shopifyModalOpen, setShopifyModalOpen] = useState(false);
  const [webhookModalOpen, setWebhookModalOpen] = useState(false);
  const [ikasModalOpen, setIkasModalOpen] = useState(false);
  const [trendyolModalOpen, setTrendyolModalOpen] = useState(false);
  const [hepsiburadaModalOpen, setHepsiburadaModalOpen] = useState(false);
  const [sikayetvarModalOpen, setSikayetvarModalOpen] = useState(false);
  const [imapModalOpen, setImapModalOpen] = useState(false);

  // React Query hooks
  const { data: integrationsData, isLoading: loading } = useIntegrations();
  const { data: userPlan } = useUserPlan();
  const integrations = integrationsData?.integrations || [];
  const businessType = integrationsData?.businessType || 'OTHER';
  const integrationsLoaded = Array.isArray(integrationsData?.integrations);
  const hasIntegrationType = (type) => integrations.some((integration) => integration.type === type);
  const isIntegrationConnected = (type) => integrations.some((integration) => integration.type === type && integration.connected);
  const crmFeatureInfo = getIntegrationFeatureInfo('CUSTOM', userPlan);
  const hasCrmEntitlement = !crmFeatureInfo.isLocked && !crmFeatureInfo.isHidden;
  const { data: whatsappStatus } = useWhatsAppStatus({
    enabled: integrationsLoaded && hasIntegrationType('WHATSAPP'),
  });
  const { data: emailStatus } = useEmailStatus({
    enabled: integrationsLoaded,
  });
  const { data: shopifyStatus } = useShopifyStatus({
    enabled: integrationsLoaded && hasIntegrationType('SHOPIFY') && (isIntegrationConnected('SHOPIFY') || shopifyModalOpen),
  });
  const { data: webhookStatus } = useWebhookStatus({
    enabled: integrationsLoaded && hasIntegrationType('ZAPIER') && (isIntegrationConnected('ZAPIER') || webhookModalOpen),
  });
  const { data: ikasStatus } = useIkasStatus({
    enabled: integrationsLoaded && hasIntegrationType('IKAS') && (isIntegrationConnected('IKAS') || ikasModalOpen),
  });
  const { data: trendyolStatus } = useTrendyolStatus({
    enabled: integrationsLoaded && hasIntegrationType('TRENDYOL') && (isIntegrationConnected('TRENDYOL') || trendyolModalOpen),
  });
  const { data: hepsiburadaStatus } = useHepsiburadaStatus({
    enabled: integrationsLoaded && hasIntegrationType('HEPSIBURADA') && (isIntegrationConnected('HEPSIBURADA') || hepsiburadaModalOpen),
  });
  const { data: amazonStatus } = useAmazonStatus({
    enabled: integrationsLoaded && hasIntegrationType('AMAZON') && isIntegrationConnected('AMAZON'),
  });
  const { data: sikayetvarStatus } = useSikayetvarStatus({
    enabled: integrationsLoaded && hasIntegrationType('SIKAYETVAR') && (isIntegrationConnected('SIKAYETVAR') || sikayetvarModalOpen),
  });
  const { data: crmStatus } = useCrmWebhookStatus({
    enabled: integrationsLoaded && businessType === 'ECOMMERCE' && hasCrmEntitlement,
  });

  // Mutations
  const connectWhatsApp = useConnectWhatsApp();
  const disconnectWhatsApp = useDisconnectWhatsApp();
  const refreshWhatsAppConnection = useRefreshWhatsAppConnection();
  const disconnectEmail = useDisconnectEmail();
  const disconnectShopify = useDisconnectShopify();
  const connectIkas = useConnectIkas();
  const disconnectIkas = useDisconnectIkas();
  const connectTrendyol = useConnectTrendyol();
  const disconnectTrendyol = useDisconnectTrendyol();
  const testTrendyol = useTestTrendyol();
  const connectHepsiburada = useConnectHepsiburada();
  const disconnectHepsiburada = useDisconnectHepsiburada();
  const testHepsiburada = useTestHepsiburada();
  const disconnectAmazon = useDisconnectAmazon();
  const testAmazon = useTestAmazon();
  const connectSikayetvar = useConnectSikayetvar();
  const disconnectSikayetvar = useDisconnectSikayetvar();
  const testSikayetvar = useTestSikayetvar();
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
  const [whatsappTestModalOpen, setWhatsappTestModalOpen] = useState(false);
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

  // Email state
  const [emailLoading, setEmailLoading] = useState(false);
  const [imapForm, setImapForm] = useState({
    email: '',
    username: '',
    password: '',
    imapHost: '',
    imapPort: '993',
    imapSecure: 'true',
    smtpHost: '',
    smtpPort: '587',
    smtpSecure: 'false',
  });

  // Shopify state
  const [shopifyLoading, setShopifyLoading] = useState(false);
  const [shopifyForm, setShopifyForm] = useState({ shopUrl: '' });

  // Webhook state
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [copiedField, setCopiedField] = useState(null);

  // ikas state
  const [ikasLoading, setIkasLoading] = useState(false);
  const [ikasForm, setIkasForm] = useState({ storeName: '', clientId: '', clientSecret: '' });

  // Marketplace Q&A states
  const [trendyolLoading, setTrendyolLoading] = useState(false);
  const [trendyolForm, setTrendyolForm] = useState({
    sellerId: '',
    apiKey: '',
    apiSecret: '',
  });
  const [hepsiburadaLoading, setHepsiburadaLoading] = useState(false);
  const [hepsiburadaForm, setHepsiburadaForm] = useState({
    merchantId: '',
    apiKey: '',
    apiSecret: '',
  });
  const [sikayetvarLoading, setSikayetvarLoading] = useState(false);
  const [sikayetvarForm, setSikayetvarForm] = useState({
    apiKey: '',
  });

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
  }, [t]);

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

  useEffect(() => {
    const persistedLastTestSend = whatsappStatus?.lastTestSend;
    if (!persistedLastTestSend) {
      return;
    }

    setWhatsappTestResult((prev) => {
      if (!prev) {
        return persistedLastTestSend;
      }

      if (!prev.messageId || prev.messageId === persistedLastTestSend.messageId) {
        return {
          ...prev,
          ...persistedLastTestSend,
        };
      }

      return prev;
    });
  }, [whatsappStatus?.lastTestSend]);

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

  const handleImapConnect = async () => {
    const requiredFields = ['email', 'password', 'imapHost', 'smtpHost'];
    const hasMissingField = requiredFields.some((field) => !String(imapForm[field] || '').trim());

    if (hasMissingField) {
      toast.error(imapCopy.fillRequired);
      return;
    }

    try {
      setEmailLoading(true);
      await apiClient.post('/api/email/imap/connect', {
        email: imapForm.email,
        username: imapForm.username || imapForm.email,
        password: imapForm.password,
        imapHost: imapForm.imapHost,
        imapPort: Number.parseInt(imapForm.imapPort, 10) || 993,
        imapSecure: imapForm.imapSecure === 'true',
        smtpHost: imapForm.smtpHost,
        smtpPort: Number.parseInt(imapForm.smtpPort, 10) || 587,
        smtpSecure: imapForm.smtpSecure === 'true',
      });

      toast.success(imapCopy.connectSuccess);
      setImapModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['integrations', 'email', 'status'] });
      queryClient.invalidateQueries({ queryKey: ['email', 'status'] });
    } catch (error) {
      const serverError = error.response?.data;
      toast.error(
        serverError?.details ? `${serverError.error} Details: ${serverError.details}` : serverError?.error || imapCopy.connectError
      );
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
        const nextTestResult = response.data?.result?.testMessageStatus || {
          status: 'accepted',
          acceptedAt: new Date().toISOString(),
        };
        setWhatsappTestResult({
          recipientPhone: response.data?.result?.recipientPhone || whatsappTestForm.recipientPhone.trim(),
          connectedNumber: response.data?.result?.connectedNumber || whatsappStatus?.displayPhoneNumber || null,
          messageId: response.data?.result?.messageId || null,
          acceptedByMeta: Boolean(response.data?.result?.acceptedByMeta),
          deliveryMode: response.data?.result?.deliveryMode || 'text',
          templateInfo: response.data?.result?.templateInfo || null,
          sentAt: new Date().toISOString(),
          ...nextTestResult,
        });
        queryClient.invalidateQueries({ queryKey: ['integrations', 'whatsapp', 'status'] });
        toast.info(t('dashboard.integrationsPage.whatsappTestAcceptedSuccess'));
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

  const getWhatsAppTestStatusLabel = (status) => {
    const normalized = String(status || '').toLowerCase();
    const keyMap = {
      accepted: 'dashboard.integrationsPage.whatsappTestStatusAccepted',
      sent: 'dashboard.integrationsPage.whatsappTestStatusSent',
      delivered: 'dashboard.integrationsPage.whatsappTestStatusDelivered',
      read: 'dashboard.integrationsPage.whatsappTestStatusRead',
      failed: 'dashboard.integrationsPage.whatsappTestStatusFailed',
    };

    return t(keyMap[normalized] || 'dashboard.integrationsPage.whatsappTestStatusUnknown');
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
    const backendUrl = runtimeConfig.apiUrl;
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

  const handleTrendyolConnect = async () => {
    if (!trendyolForm.sellerId || !trendyolForm.apiKey || !trendyolForm.apiSecret) {
      toast.error(marketplaceCopy.requiredTrendyolFields);
      return;
    }

    setTrendyolLoading(true);
    try {
      const response = await connectTrendyol.mutateAsync(trendyolForm);
      if (response.data.success) {
        toast.success(marketplaceCopy.trendyolConnectSuccess);
        setTrendyolModalOpen(false);
        setTrendyolForm({ sellerId: '', apiKey: '', apiSecret: '' });
      }
    } catch (error) {
      toast.error(error.response?.data?.error || marketplaceCopy.trendyolConnectError);
    } finally {
      setTrendyolLoading(false);
    }
  };

  const handleHepsiburadaConnect = async () => {
    if (!hepsiburadaForm.merchantId || !hepsiburadaForm.apiSecret) {
      toast.error(marketplaceCopy.requiredHepsiburadaFields);
      return;
    }

    setHepsiburadaLoading(true);
    try {
      const response = await connectHepsiburada.mutateAsync(hepsiburadaForm);
      if (response.data.success) {
        toast.success(marketplaceCopy.hepsiburadaConnectSuccess);
        setHepsiburadaModalOpen(false);
        setHepsiburadaForm({ merchantId: '', apiKey: '', apiSecret: '' });
      }
    } catch (error) {
      toast.error(error.response?.data?.error || marketplaceCopy.hepsiburadaConnectError);
    } finally {
      setHepsiburadaLoading(false);
    }
  };

  const handleSikayetvarConnect = async () => {
    if (!sikayetvarForm.apiKey) {
      toast.error(marketplaceCopy.requiredSikayetvarFields);
      return;
    }

    setSikayetvarLoading(true);
    try {
      const response = await connectSikayetvar.mutateAsync(sikayetvarForm);
      if (response.data.success) {
        toast.success(marketplaceCopy.sikayetvarConnectSuccess);
        setSikayetvarModalOpen(false);
        setSikayetvarForm({ apiKey: '' });
      }
    } catch (error) {
      toast.error(error.response?.data?.error || marketplaceCopy.sikayetvarConnectError);
    } finally {
      setSikayetvarLoading(false);
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
      if (integration.type === 'AMAZON') {
        const response = await apiClient.get('/api/integrations/amazon/auth');
        window.location.href = response.data.authUrl;
        return;
      }
      if (integration.type === 'IKAS') { setIkasModalOpen(true); return; }
      if (integration.type === 'TRENDYOL') { setTrendyolModalOpen(true); return; }
      if (integration.type === 'HEPSIBURADA') { setHepsiburadaModalOpen(true); return; }
      if (integration.type === 'SIKAYETVAR') { setSikayetvarModalOpen(true); return; }
      toast.info(`${integration.name} ${t('dashboard.integrationsPage.comingSoonIntegration')}`);
    } catch (error) {
      if (integration.type === 'AMAZON') {
        toast.error(error.response?.data?.error || marketplaceCopy.amazonConnectError);
        return;
      }
      toast.error(t('dashboard.integrationsPage.connectFailed'));
    }
  };

  const handleDisconnect = async (integration) => {
  if (!confirm(t('dashboard.integrationsPage.confirmDisconnectIntegration'))) return;
  try {
    if (integration.type === 'WHATSAPP') await handleWhatsAppDisconnect();
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
    else if (integration.type === 'TRENDYOL') {
      await disconnectTrendyol.mutateAsync();
      toast.success(marketplaceCopy.trendyolDisconnected);
    }
    else if (integration.type === 'HEPSIBURADA') {
      await disconnectHepsiburada.mutateAsync();
      toast.success(marketplaceCopy.hepsiburadaDisconnected);
    }
    else if (integration.type === 'AMAZON') {
      await disconnectAmazon.mutateAsync();
      toast.success(marketplaceCopy.amazonDisconnected);
    }
    else if (integration.type === 'SIKAYETVAR') {
      await disconnectSikayetvar.mutateAsync();
      toast.success(marketplaceCopy.sikayetvarDisconnected);
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
    if (integration.type === 'TRENDYOL') {
      const response = await testTrendyol.mutateAsync();
      if (response.data.success) toast.success(marketplaceCopy.trendyolActive);
      else toast.error(t('dashboard.integrationsPage.testFailed'));
      return;
    }
    if (integration.type === 'HEPSIBURADA') {
      const response = await testHepsiburada.mutateAsync();
      if (response.data.success) toast.success(marketplaceCopy.hepsiburadaActive);
      else toast.error(t('dashboard.integrationsPage.testFailed'));
      return;
    }
    if (integration.type === 'AMAZON') {
      const response = await testAmazon.mutateAsync();
      if (response.data.success) {
        if (response.data.validationWarning) {
          toast.info(response.data.validationWarning);
        } else {
          toast.success(marketplaceCopy.amazonActive);
        }
      } else {
        toast.error(t('dashboard.integrationsPage.testFailed'));
      }
      return;
    }
    if (integration.type === 'SIKAYETVAR') {
      const response = await testSikayetvar.mutateAsync();
      if (response.data.success) toast.success(marketplaceCopy.sikayetvarActive);
      else toast.error(t('dashboard.integrationsPage.testFailed'));
      return;
    }
    toast.info(t('dashboard.integrationsPage.testNotAvailable'));
  } catch (error) {
    toast.error(t('dashboard.integrationsPage.testFailed'));
  }
};

  const getIntegrationIcon = (type) => INTEGRATION_ICONS[type] || Hash;
  const getCategoryColors = () => ({ icon: 'text-neutral-600 dark:text-neutral-400', bg: 'bg-neutral-100 dark:bg-white/8' });
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
      ZAPIER: t('dashboard.integrationsPage.zapierConnect'),
      IKAS: t('dashboard.integrationsPage.ikasConnect'),
      TRENDYOL: t('dashboard.integrationsPage.trendyolConnect'),
      HEPSIBURADA: t('dashboard.integrationsPage.hepsiburadaConnect'),
      AMAZON: marketplaceCopy.amazonConnectDescription,
      SIKAYETVAR: t('dashboard.integrationsPage.sikayetvarConnect'),
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
      id: 'marketplace',
      title: marketplaceCopy.marketplaceCategory,
      icon: Package,
      types: ['TRENDYOL', 'HEPSIBURADA', 'AMAZON']
    },
    {
      id: 'complaints',
      title: marketplaceCopy.complaintsCategory,
      icon: AlertTriangle,
      types: ['SIKAYETVAR']
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
      title: marketplaceCopy.crmCategory,
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
    const isTrendyol = integration.type === 'TRENDYOL';
    const isHepsiburada = integration.type === 'HEPSIBURADA';
    const isAmazon = integration.type === 'AMAZON';
    const isSikayetvar = integration.type === 'SIKAYETVAR';
    const isMarketplaceBeta = isTrendyol || isHepsiburada || isAmazon || isSikayetvar;
    const isMarketplaceImageIcon = isTrendyol || isHepsiburada;
    const disabled = isEcommerceDisabled(integration.type);
    const iconClassName = isAmazon
      ? 'h-8 w-8 object-contain'
      : isMarketplaceImageIcon
        ? 'h-7 w-7 rounded-md object-cover'
        : `h-6 w-6 ${disabled ? 'text-neutral-400 dark:text-neutral-500' : 'text-neutral-600 dark:text-neutral-400'}`;
    const marketplaceStatus = isTrendyol
      ? trendyolStatus
      : (isHepsiburada ? hepsiburadaStatus : (isAmazon ? amazonStatus : null));
    const complaintStatus = isSikayetvar ? sikayetvarStatus : null;
    const whatsappConnected = isWhatsApp ? Boolean(whatsappStatus?.connected ?? integration.connected) : integration.connected;
    const whatsappNeedsReconnect = isWhatsApp ? Boolean(whatsappStatus?.needsReconnect) : false;
    const shouldShowWhatsappDetails = isWhatsApp && (whatsappConnected || whatsappNeedsReconnect);
    const isEffectivelyConnected = isWhatsApp
      ? (whatsappConnected || whatsappNeedsReconnect)
      : (isTrendyol || isHepsiburada || isAmazon)
        ? Boolean(marketplaceStatus?.connected ?? integration.connected)
        : isSikayetvar
          ? Boolean(complaintStatus?.connected ?? integration.connected)
        : integration.connected;
    const whatsappNumberLabel = shouldShowWhatsappDetails
      ? (whatsappStatus?.displayPhoneNumber || whatsappStatus?.phoneNumberId || null)
      : null;
    const marketplaceIdentifier = isTrendyol
      ? marketplaceStatus?.sellerId
      : isHepsiburada
        ? marketplaceStatus?.merchantId
        : marketplaceStatus?.sellingPartnerId;
    const complaintIdentifier = complaintStatus?.companyName || complaintStatus?.companyId;
    const whatsappActionLabel = whatsappEmbeddedSignupState === 'awaiting_completion'
      ? t('dashboard.integrationsPage.whatsappWaitingForMeta')
      : (whatsappNeedsReconnect ? t('dashboard.integrationsPage.whatsappReconnect') : t('dashboard.integrationsPage.connect'));
    const whatsappReconnectLabel = refreshWhatsAppConnection.isPending
      ? t('dashboard.integrationsPage.whatsappRefreshing')
      : (whatsappNeedsReconnect ? t('dashboard.integrationsPage.whatsappReconnect') : t('dashboard.integrationsPage.whatsappRefresh'));

    // Check if this integration is locked based on user's plan
    const featureInfo = getIntegrationFeatureInfo(integration.type, userPlan);
    const isLocked = featureInfo.isLocked && !isEffectivelyConnected;

    return (
      <div
        key={integration.type}
        className={cn(
          STANDARD_CARD_CLASS,
          dark
            ? isLocked || disabled
              ? 'border-white/10 bg-[#0B1730]/88'
              : 'border-white/10 bg-[#081224]/95 hover:shadow-md'
            : isLocked || disabled
              ? 'border-neutral-200 bg-neutral-50'
              : 'border-neutral-200 bg-white hover:shadow-md'
        )}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex min-h-10 items-center gap-3">
            <div className={CARD_ICON_WRAPPER_CLASS}>
              <Icon className={iconClassName} />
            </div>
            <div className="min-h-10 flex items-center">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className={`font-semibold ${disabled ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-900 dark:text-white'}`}>{integration.name}</h3>
                {isMarketplaceBeta && (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs border border-amber-200 dark:border-amber-800/40">
                    {marketplaceCopy.beta}
                  </Badge>
                )}
                {isLocked && (
                  <LockedPlanBadge text={t('dashboard.integrationsPage.requiresProPlan')} />
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
          {isEffectivelyConnected && (
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

        <p className="min-h-10 text-sm text-neutral-600 dark:text-neutral-400 mb-4 line-clamp-2">{getCategoryDescription(integration.type)}</p>

        {(isTrendyol || isHepsiburada) && isEffectivelyConnected && (
          <div className="mb-2 space-y-1">
            {marketplaceIdentifier && (
              <p className="text-xs text-neutral-700 dark:text-neutral-300">
                {isTrendyol ? marketplaceCopy.sellerId : marketplaceCopy.merchantId}: <span className="font-medium">{marketplaceIdentifier}</span>
              </p>
            )}
          </div>
        )}

        {isAmazon && isEffectivelyConnected && (
          <div className="mb-4 space-y-1">
            {marketplaceIdentifier && (
              <p className="text-xs text-neutral-700 dark:text-neutral-300">
                {marketplaceCopy.sellingPartnerId}: <span className="font-medium">{marketplaceIdentifier}</span>
              </p>
            )}
            {marketplaceStatus?.marketplaceId && (
              <p className="text-xs text-neutral-700 dark:text-neutral-300">
                {marketplaceCopy.marketplaceId}: <span className="font-medium">{marketplaceStatus.marketplaceId}</span>
              </p>
            )}
            {marketplaceStatus?.useSandbox && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {marketplaceCopy.amazonSandbox}
              </p>
            )}
            {marketplaceStatus?.authorizedMarketplaces?.length > 0 && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {marketplaceCopy.amazonAuthorizedMarketplaces}: {marketplaceStatus.authorizedMarketplaces.map((item) => item.marketplaceName || item.marketplaceId).filter(Boolean).join(', ')}
              </p>
            )}
            {marketplaceStatus?.lastValidationError && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {marketplaceStatus.lastValidationError}
              </p>
            )}
            {marketplaceStatus?.lastSync && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {marketplaceCopy.lastSync}: {formatWhatsAppTimestamp(marketplaceStatus.lastSync)}
              </p>
            )}
          </div>
        )}

        {isSikayetvar && isEffectivelyConnected && (
          <div className="mb-4 space-y-1">
            {complaintIdentifier && (
              <p className="text-xs text-neutral-700 dark:text-neutral-300">
                {marketplaceCopy.company}: <span className="font-medium">{complaintIdentifier}</span>
              </p>
            )}
            {complaintStatus?.companyUrl && (
              <p className="break-all text-xs text-neutral-500 dark:text-neutral-400">
                {marketplaceCopy.companyPage}: <span className="font-medium">{complaintStatus.companyUrl}</span>
              </p>
            )}
            {complaintStatus?.lastSync && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {marketplaceCopy.lastSync}: {formatWhatsAppTimestamp(complaintStatus.lastSync)}
              </p>
            )}
          </div>
        )}

        {isWhatsApp && shouldShowWhatsappDetails && (
          <div className="mb-2 space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs text-neutral-600 dark:text-neutral-300">
              <span className="shrink-0 text-neutral-500 dark:text-cyan-200/55">
                {t('dashboard.integrationsPage.whatsappConnectedNumber')}:
              </span>
              <span className="truncate text-right font-medium text-neutral-900 dark:text-white">
                {whatsappNumberLabel}
              </span>
            </div>

            {whatsappStatus?.tokenExpired && (
              <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                {t('dashboard.integrationsPage.whatsappTokenExpired')}
              </span>
            )}

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

        <div className="mt-auto flex flex-wrap gap-2 pt-2">
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
                    onClick={() => {
                      if (whatsappConnected && !whatsappNeedsReconnect) {
                        setWhatsappTestModalOpen(true);
                        return;
                      }

                      if (whatsappNeedsReconnect) {
                        handleWhatsAppRefresh();
                        return;
                      }

                      handleConnect(integration);
                    }}
                    disabled={disabled || whatsappEmbeddedSignupBusy || refreshWhatsAppConnection.isPending}
                  >
                    {(whatsappEmbeddedSignupBusy || refreshWhatsAppConnection.isPending) && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                    {whatsappConnected && !whatsappNeedsReconnect ? t('dashboard.integrationsPage.testIntegration') : (whatsappNeedsReconnect ? whatsappReconnectLabel : whatsappActionLabel)}
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
          ) : (isTrendyol || isHepsiburada) && isEffectivelyConnected ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => { window.location.href = '/dashboard/marketplace-qa'; }}
              >
                {t('dashboard.integrationsPage.manage')}
              </Button>
              {can('integrations:connect') && (
                <Button variant="outline" size="sm" onClick={() => handleDisconnect(integration)}>
                  {t('dashboard.integrationsPage.disconnect')}
                </Button>
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

        {isWhatsApp && !isLocked && !shouldShowWhatsappDetails && !whatsappNeedsReconnect && isWhatsAppManualFallbackEnabled && can('integrations:connect') && (
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
            <div key={i} className="bg-white dark:bg-[#081224]/95 rounded-xl border border-neutral-200 dark:border-white/10 p-6 animate-pulse">
              <div className="h-12 w-12 bg-neutral-200 dark:bg-[linear-gradient(135deg,rgba(8,18,36,0.96),rgba(48,92,229,0.18),rgba(0,168,199,0.14))] rounded-lg mb-4"></div>
              <div className="h-6 w-32 bg-neutral-200 dark:bg-[linear-gradient(135deg,rgba(8,18,36,0.96),rgba(48,92,229,0.18),rgba(0,168,199,0.14))] rounded mb-2"></div>
              <div className="h-4 w-full bg-neutral-200 dark:bg-[linear-gradient(135deg,rgba(8,18,36,0.96),rgba(48,92,229,0.18),rgba(0,168,199,0.14))] rounded mb-4"></div>
              <div className="h-10 w-full bg-neutral-200 dark:bg-[linear-gradient(135deg,rgba(8,18,36,0.96),rgba(48,92,229,0.18),rgba(0,168,199,0.14))] rounded"></div>
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
            <div
              className={cn(
                STANDARD_CARD_CLASS,
                dark
                  ? isCRMLocked
                    ? 'border-white/10 bg-[#0B1730]/88'
                    : isCrmConnected
                      ? 'border-cyan-500/35 bg-[#081224]/95 hover:shadow-md'
                      : 'border-white/10 bg-[#081224]/95 hover:shadow-md'
                  : isCRMLocked
                    ? 'border-neutral-200 bg-neutral-50'
                    : isCrmConnected
                      ? 'border-neutral-400 bg-white hover:shadow-md'
                      : 'border-neutral-200 bg-white hover:shadow-md'
              )}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex min-h-10 items-center gap-3">
                  <div className={CARD_ICON_WRAPPER_CLASS}>
                    <IntegrationLogo type="CUSTOM" className="h-6 w-6 object-contain" />
                  </div>
                  <div className="min-h-10 flex items-center">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-neutral-900 dark:text-white">
                        {t('dashboard.integrationsPage.customCrmWebhook')}
                      </h3>
                      {isCRMLocked && (
                        <LockedPlanBadge text={t('dashboard.integrationsPage.requiresProPlan')} />
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

              <p className="min-h-10 text-sm text-neutral-600 dark:text-neutral-400 mb-4 line-clamp-2">
                {t('dashboard.integrationsPage.sendDataFromSystem')}
              </p>

              <div className="mt-auto pt-2">
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
                        toast.success(t('dashboard.integrationsPage.crmDisconnected'));
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
            </div>
            );
          })()}

          {/* Gmail Card */}
          <div className={`${STANDARD_CARD_CLASS} bg-white dark:bg-[#081224]/95 hover:shadow-md ${emailStatus?.connected && emailStatus?.provider === 'GMAIL' ? 'border-neutral-400 dark:border-cyan-500/35' : 'border-neutral-200 dark:border-white/10'}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex min-h-10 items-center gap-3">
                <div className={CARD_ICON_WRAPPER_CLASS}>
                  <IntegrationLogo type="GMAIL" className="h-6 w-6 object-contain" />
                </div>
                <div className="min-h-10 flex items-center">
                  <h3 className="font-semibold text-neutral-900 dark:text-white">Gmail</h3>
                </div>
              </div>
              {emailStatus?.connected && emailStatus?.provider === 'GMAIL' && (
                <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
                  {t('dashboard.integrationsPage.connected')}
                </Badge>
              )}
            </div>
            <p className="min-h-10 text-sm text-neutral-600 dark:text-neutral-400 mb-4 line-clamp-2">{t('dashboard.integrationsPage.gmailDesc')}</p>
            <div className="mt-auto pt-2">
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
          </div>

          {/* Outlook Card */}
          <div className={`${STANDARD_CARD_CLASS} bg-white dark:bg-[#081224]/95 hover:shadow-md ${emailStatus?.connected && emailStatus?.provider === 'OUTLOOK' ? 'border-neutral-400 dark:border-cyan-500/35' : 'border-neutral-200 dark:border-white/10'}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex min-h-10 items-center gap-3">
                <div className={CARD_ICON_WRAPPER_CLASS}>
                  <IntegrationLogo type="OUTLOOK" className="h-6 w-6 object-contain" />
                </div>
                <div className="min-h-10 flex items-center">
                  <h3 className="font-semibold text-neutral-900 dark:text-white">Microsoft 365</h3>
                </div>
              </div>
              {emailStatus?.connected && emailStatus?.provider === 'OUTLOOK' && (
                <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
                  {t('dashboard.integrationsPage.connected')}
                </Badge>
              )}
            </div>
            <p className="min-h-10 text-sm text-neutral-600 dark:text-neutral-400 mb-4 line-clamp-2">{t('dashboard.integrationsPage.outlookDesc')}</p>
            <div className="mt-auto pt-2">
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
          </div>

          {/* IMAP / SMTP Card */}
          <div className={`${STANDARD_CARD_CLASS} bg-white dark:bg-[#081224]/95 hover:shadow-md ${emailStatus?.connected && emailStatus?.provider === 'IMAP' ? 'border-neutral-400 dark:border-cyan-500/35' : 'border-neutral-200 dark:border-white/10'}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex min-h-10 items-center gap-3">
                <div className={CARD_ICON_WRAPPER_CLASS}>
                  <Mail className="h-5 w-5 text-sky-600 dark:text-cyan-300" />
                </div>
                <div className="min-h-10 flex items-center">
                  <h3 className="font-semibold text-neutral-900 dark:text-white">{imapCopy.title}</h3>
                </div>
              </div>
              {emailStatus?.connected && emailStatus?.provider === 'IMAP' && (
                <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
                  {t('dashboard.integrationsPage.connected')}
                </Badge>
              )}
            </div>
            <p className="min-h-10 text-sm text-neutral-600 dark:text-neutral-400 mb-4 line-clamp-3">{imapCopy.description}</p>
            <div className="mt-auto pt-2">
            {emailStatus?.connected && emailStatus?.provider === 'IMAP' ? (
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
              <Button size="sm" className="w-full" onClick={() => setImapModalOpen(true)} disabled={emailLoading || (emailStatus?.connected && emailStatus?.provider !== 'IMAP')}>
                {t('dashboard.integrationsPage.connect')}
              </Button>
              )
            )}
            </div>
          </div>

          {/* Other Integrations */}
          {filteredIntegrations.map(renderIntegrationCard)}
      </div>
      )}

      {isWhatsAppManualFallbackEnabled && (
        <Dialog open={whatsappModalOpen} onOpenChange={setWhatsappModalOpen}>
          <DialogContent className={getDashboardOverlaySurfaceClass(dark, 'max-w-2xl')}>
            <DialogHeader className={cn(dark && 'text-gray-100')}>
              <DialogTitle className={cn(dark && '!text-white')}>{t('dashboard.integrationsPage.whatsappModalTitle')}</DialogTitle>
              <DialogDescription className={cn(dark && '!text-neutral-300')}>
                {t('dashboard.integrationsPage.whatsappModalDesc')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className={cn(dark && 'text-slate-200')}>{t('dashboard.integrationsPage.accessToken')}</Label>
                <Input type="password" placeholder={t('dashboard.integrationsPage.accessTokenPlaceholder')} value={whatsappForm.accessToken} onChange={(e) => setWhatsappForm({ ...whatsappForm, accessToken: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className={cn(dark && 'text-slate-200')}>{t('dashboard.integrationsPage.phoneNumberId')}</Label>
                <Input type="text" placeholder={t('dashboard.integrationsPage.phoneNumberIdPlaceholder')} value={whatsappForm.phoneNumberId} onChange={(e) => setWhatsappForm({ ...whatsappForm, phoneNumberId: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className={cn(dark && 'text-slate-200')}>{t('dashboard.integrationsPage.verifyToken')}</Label>
                <Input type="text" placeholder={t('dashboard.integrationsPage.verifyTokenPlaceholder')} value={whatsappForm.verifyToken} onChange={(e) => setWhatsappForm({ ...whatsappForm, verifyToken: e.target.value })} />
                <p className={cn('text-xs', dark ? 'text-neutral-400' : 'text-neutral-500')}>
                  {t('dashboard.integrationsPage.verifyTokenHint')}
                </p>
              </div>
              <div className="space-y-2">
                <Label className={cn(dark && 'text-slate-200')}>Webhook URL</Label>
                <div className="flex gap-2">
                  <Input type="text" readOnly value={`${runtimeConfig.apiUrl}/api/whatsapp/webhook`} className={cn(dark ? '!border-white/10 !bg-[#0B1730]/88 !text-gray-100' : 'bg-neutral-50')} />
                  <Button type="button" variant="outline" size="icon" onClick={copyWebhookUrl}><Copy className="h-4 w-4" /></Button>
                </div>
                <p className={cn('text-xs', dark ? 'text-neutral-400' : 'text-neutral-500')}>
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

      <Dialog open={imapModalOpen} onOpenChange={setImapModalOpen}>
        <DialogContent className={getDashboardOverlaySurfaceClass(dark, 'max-w-2xl')}>
          <DialogHeader className={cn(dark && 'text-gray-100')}>
            <DialogTitle className={cn(dark && '!text-white')}>{imapCopy.modalTitle}</DialogTitle>
            <DialogDescription className={cn(dark && '!text-neutral-300')}>
              {imapCopy.modalDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300">
              {imapCopy.helper}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className={cn(dark && 'text-slate-200')}>{imapCopy.email}</Label>
                <Input
                  type="email"
                  placeholder={imapCopy.emailPlaceholder}
                  value={imapForm.email}
                  onChange={(e) => setImapForm({ ...imapForm, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className={cn(dark && 'text-slate-200')}>{imapCopy.username}</Label>
                <Input
                  type="text"
                  placeholder={imapCopy.usernamePlaceholder}
                  value={imapForm.username}
                  onChange={(e) => setImapForm({ ...imapForm, username: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className={cn(dark && 'text-slate-200')}>{imapCopy.password}</Label>
              <Input
                type="password"
                placeholder={imapCopy.passwordPlaceholder}
                value={imapForm.password}
                onChange={(e) => setImapForm({ ...imapForm, password: e.target.value })}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_120px_180px]">
              <div className="space-y-2">
                <Label className={cn(dark && 'text-slate-200')}>{imapCopy.imapHost}</Label>
                <Input
                  type="text"
                  placeholder={imapCopy.hostPlaceholder}
                  value={imapForm.imapHost}
                  onChange={(e) => setImapForm({ ...imapForm, imapHost: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className={cn(dark && 'text-slate-200')}>{imapCopy.imapPort}</Label>
                <Input
                  type="number"
                  value={imapForm.imapPort}
                  onChange={(e) => setImapForm({ ...imapForm, imapPort: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className={cn(dark && 'text-slate-200')}>{imapCopy.secureLabel}</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={imapForm.imapSecure}
                  onChange={(e) => setImapForm({
                    ...imapForm,
                    imapSecure: e.target.value,
                    imapPort: e.target.value === 'true' ? '993' : '143',
                  })}
                >
                  <option value="true">{imapCopy.secureTls}</option>
                  <option value="false">{imapCopy.startTls}</option>
                </select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_120px_180px]">
              <div className="space-y-2">
                <Label className={cn(dark && 'text-slate-200')}>{imapCopy.smtpHost}</Label>
                <Input
                  type="text"
                  placeholder={imapCopy.hostPlaceholder}
                  value={imapForm.smtpHost}
                  onChange={(e) => setImapForm({ ...imapForm, smtpHost: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className={cn(dark && 'text-slate-200')}>{imapCopy.smtpPort}</Label>
                <Input
                  type="number"
                  value={imapForm.smtpPort}
                  onChange={(e) => setImapForm({ ...imapForm, smtpPort: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className={cn(dark && 'text-slate-200')}>{imapCopy.secureLabel}</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={imapForm.smtpSecure}
                  onChange={(e) => setImapForm({
                    ...imapForm,
                    smtpSecure: e.target.value,
                    smtpPort: e.target.value === 'true' ? '465' : '587',
                  })}
                >
                  <option value="false">587 / {imapCopy.startTls}</option>
                  <option value="true">465 / {imapCopy.secureTls}</option>
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImapModalOpen(false)} disabled={emailLoading}>
              {isTr ? 'İptal' : 'Cancel'}
            </Button>
            <Button onClick={handleImapConnect} disabled={emailLoading}>
              {emailLoading ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />{t('dashboard.integrationsPage.connectingText')}</> : imapCopy.connectButton}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={whatsappTestModalOpen} onOpenChange={setWhatsappTestModalOpen}>
        <DialogContent className={getDashboardOverlaySurfaceClass(dark, 'max-w-xl')}>
          <DialogHeader className={cn(dark && 'text-gray-100')}>
            <DialogTitle className={cn(dark && '!text-white')}>
              {t('dashboard.integrationsPage.whatsappTestPanelTitle')}
            </DialogTitle>
            <DialogDescription className={cn(dark && '!text-neutral-300')}>
              {t('dashboard.integrationsPage.whatsappTestAcceptedHint')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {whatsappStatus?.displayPhoneNumber && (
              <div className={getDashboardInsetClass(dark, 'px-4 py-3')}>
                <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500 dark:text-cyan-200/55">
                  {t('dashboard.integrationsPage.whatsappConnectedNumber')}
                </div>
                <div className="mt-1 text-sm font-semibold text-neutral-900 dark:text-white">
                  {whatsappStatus.displayPhoneNumber}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="whatsapp-test-recipient" className={cn(dark && 'text-slate-200')}>
                {t('dashboard.integrationsPage.whatsappTestRecipientLabel')}
              </Label>
              <Input
                id="whatsapp-test-recipient"
                type="tel"
                value={whatsappTestForm.recipientPhone}
                placeholder={t('dashboard.integrationsPage.whatsappTestRecipientPlaceholder')}
                onChange={(event) => setWhatsappTestForm((prev) => ({ ...prev, recipientPhone: event.target.value }))}
              />
              <p className={cn('text-[11px]', dark ? 'text-neutral-400' : 'text-neutral-500')}>
                {t('dashboard.integrationsPage.whatsappTestRecipientHint')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="whatsapp-test-message" className={cn(dark && 'text-slate-200')}>
                {t('dashboard.integrationsPage.whatsappTestMessageLabel')}
              </Label>
              <Textarea
                id="whatsapp-test-message"
                rows={4}
                value={whatsappTestForm.message}
                placeholder={t('dashboard.integrationsPage.whatsappTestMessagePlaceholder')}
                onChange={(event) => setWhatsappTestForm((prev) => ({ ...prev, message: event.target.value }))}
              />
              <p className={cn('text-[11px]', dark ? 'text-neutral-400' : 'text-neutral-500')}>
                {t('dashboard.integrationsPage.whatsappTestTemplateFallbackHint')}
              </p>
            </div>

            {whatsappTestResult && (
              <div className={getDashboardInsetClass(dark, 'px-4 py-3 text-xs text-neutral-700 dark:text-neutral-300')}>
                <div className="font-medium text-neutral-900 dark:text-white">{t('dashboard.integrationsPage.whatsappTestLastResult')}</div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-500">
                      {t('dashboard.integrationsPage.whatsappTestSentTo')}
                    </div>
                    <div className="mt-1 break-words font-medium text-neutral-900 dark:text-white">{whatsappTestResult.recipientPhone}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-500">
                      {t('dashboard.integrationsPage.whatsappTestDeliveryStatus')}
                    </div>
                    <div className="mt-1 font-medium text-neutral-900 dark:text-white">
                      {getWhatsAppTestStatusLabel(whatsappTestResult.status)}
                    </div>
                  </div>
                </div>
                {whatsappTestResult.lastError?.message && (
                  <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
                    {whatsappTestResult.lastError.message}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWhatsappTestModalOpen(false)} disabled={whatsappTestSending}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSendWhatsAppTestMessage} disabled={whatsappTestSending}>
              {whatsappTestSending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  {t('dashboard.integrationsPage.whatsappTestSending')}
                </>
              ) : (
                t('dashboard.integrationsPage.whatsappTestSendButton')
              )}
            </Button>
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
              <div className="flex items-center gap-2 p-3 bg-neutral-100 dark:bg-white/8 border border-neutral-200 dark:border-white/10 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
                <p className="text-sm font-medium text-neutral-900 dark:text-white">{t('dashboard.integrationsPage.connectedLabel')}: {shopifyStatus.shopName || shopifyStatus.shopDomain}</p>
              </div>
            )}

            <div className="bg-neutral-50 dark:bg-[#0B1730]/88 border border-neutral-200 dark:border-white/10 rounded-lg p-4">
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
              <div className="flex items-center gap-2 p-3 bg-neutral-100 dark:bg-white/8 border border-neutral-200 dark:border-white/10 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
                <p className="text-sm font-medium text-neutral-900 dark:text-white">{t('dashboard.integrationsPage.connectedLabel')}: {ikasStatus.storeName}</p>
              </div>
            )}
            <div className="bg-neutral-50 dark:bg-[#0B1730]/88 border border-neutral-200 dark:border-white/10 rounded-lg p-4">
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

      <Dialog open={trendyolModalOpen} onOpenChange={setTrendyolModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-orange-600" />
              {marketplaceCopy.trendyolModalTitle}
            </DialogTitle>
            <DialogDescription>
              {marketplaceCopy.trendyolModalDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{marketplaceCopy.sellerId}</Label>
              <Input
                type="text"
                placeholder={marketplaceCopy.sellerIdPlaceholder}
                value={trendyolForm.sellerId}
                onChange={(event) => setTrendyolForm((prev) => ({ ...prev, sellerId: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{marketplaceCopy.apiKey}</Label>
              <Input
                type="text"
                placeholder={marketplaceCopy.apiKeyPlaceholder}
                value={trendyolForm.apiKey}
                onChange={(event) => setTrendyolForm((prev) => ({ ...prev, apiKey: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{marketplaceCopy.apiSecret}</Label>
              <Input
                type="password"
                placeholder={marketplaceCopy.apiSecretPlaceholder}
                value={trendyolForm.apiSecret}
                onChange={(event) => setTrendyolForm((prev) => ({ ...prev, apiSecret: event.target.value }))}
              />
            </div>
            <p className="text-xs text-neutral-500">
              {marketplaceCopy.trendyolHelper}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrendyolModalOpen(false)} disabled={trendyolLoading}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleTrendyolConnect} disabled={trendyolLoading}>
              {trendyolLoading ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />{t('dashboard.integrationsPage.connectingText')}</> : marketplaceCopy.trendyolConnectButton}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={hepsiburadaModalOpen} onOpenChange={setHepsiburadaModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-red-600" />
              {marketplaceCopy.hepsiburadaModalTitle}
            </DialogTitle>
            <DialogDescription>
              {marketplaceCopy.hepsiburadaModalDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{marketplaceCopy.merchantId}</Label>
              <Input
                type="text"
                placeholder={marketplaceCopy.merchantIdPlaceholder}
                value={hepsiburadaForm.merchantId}
                onChange={(event) => setHepsiburadaForm((prev) => ({ ...prev, merchantId: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{marketplaceCopy.hepsiburadaLegacyApiKey}</Label>
              <Input
                type="text"
                placeholder={marketplaceCopy.hepsiburadaLegacyPlaceholder}
                value={hepsiburadaForm.apiKey}
                onChange={(event) => setHepsiburadaForm((prev) => ({ ...prev, apiKey: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{marketplaceCopy.hepsiburadaServiceKey}</Label>
              <Input
                type="password"
                placeholder={marketplaceCopy.hepsiburadaSecretPlaceholder}
                value={hepsiburadaForm.apiSecret}
                onChange={(event) => setHepsiburadaForm((prev) => ({ ...prev, apiSecret: event.target.value }))}
              />
            </div>
            <p className="text-xs text-neutral-500">
              {marketplaceCopy.hepsiburadaHelper}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHepsiburadaModalOpen(false)} disabled={hepsiburadaLoading}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleHepsiburadaConnect} disabled={hepsiburadaLoading}>
              {hepsiburadaLoading ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />{t('dashboard.integrationsPage.connectingText')}</> : marketplaceCopy.hepsiburadaConnectButton}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sikayetvarModalOpen} onOpenChange={setSikayetvarModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              {marketplaceCopy.sikayetvarModalTitle}
            </DialogTitle>
            <DialogDescription>
              {marketplaceCopy.sikayetvarModalDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{marketplaceCopy.sikayetvarTokenLabel}</Label>
              <Input
                type="password"
                placeholder={marketplaceCopy.sikayetvarTokenPlaceholder}
                value={sikayetvarForm.apiKey}
                onChange={(event) => setSikayetvarForm((prev) => ({ ...prev, apiKey: event.target.value }))}
              />
            </div>
            <p className="text-xs text-neutral-500">
              {marketplaceCopy.sikayetvarHelper}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSikayetvarModalOpen(false)} disabled={sikayetvarLoading}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSikayetvarConnect} disabled={sikayetvarLoading}>
              {sikayetvarLoading ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />{t('dashboard.integrationsPage.connectingText')}</> : marketplaceCopy.sikayetvarConnectButton}
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
