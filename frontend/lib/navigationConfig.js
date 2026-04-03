/**
 * Navigation Configuration
 * Single source of truth for all navigation labels, descriptions, and routes
 * Used in: Sidebar, Page Headers, Breadcrumbs
 */

export const NAVIGATION_ITEMS = {
  // Product
  guides: {
    labelTr: 'Rehber',
    labelEn: 'Guide',
    descriptionTr: 'Panelin nasıl çalıştığını ve kurulum adımlarını öğrenin.',
    descriptionEn: 'Learn how the dashboard works and get setup steps.',
    href: '/dashboard/guides',
    group: 'product',
  },
  assistants: {
    labelTr: 'Asistanlar',
    labelEn: 'Assistants',
    descriptionTr: 'Giden arama asistanlarınızı oluşturun ve yönetin.',
    descriptionEn: 'Create and manage your outbound call assistants.',
    href: '/dashboard/assistant',
    group: 'product',
  },
  knowledgeBase: {
    labelTr: 'Bilgi Bankası',
    labelEn: 'Knowledge Base',
    descriptionTr: 'Asistanın kullanacağı dokümanları ve SSS içeriklerini yönetin.',
    descriptionEn: 'Manage documents and FAQ content for your assistant.',
    href: '/dashboard/knowledge',
    group: 'product',
  },
  chatWidget: {
    labelTr: 'Sohbet Aracı',
    labelEn: 'Chat Widget',
    descriptionTr: 'Web sitenize yerleştirilebilir sohbet widget\'ını yapılandırın.',
    descriptionEn: 'Configure embeddable chat widget for your website.',
    href: '/dashboard/chat-widget',
    group: 'product',
  },

  // Operations
  inbox: {
    labelTr: 'Özel Veriler',
    labelEn: 'Custom Data',
    descriptionTr: 'Özel veri dosyalarınızı yükleyin ve yönetin. Telefon ve yazılı kanallardan gelen sorularda bu veriler kullanılır.',
    descriptionEn: 'Upload and manage your custom data files. These are used to answer questions from phone and messaging channels.',
    href: '/dashboard/customer-data',
    group: 'operations',
  },
  campaigns: {
    labelTr: 'Kampanyalar',
    labelEn: 'Campaigns',
    descriptionTr: 'Excel/CSV yükleyerek toplu arama kampanyaları oluşturun.',
    descriptionEn: 'Create batch calling campaigns by uploading Excel/CSV.',
    href: '/dashboard/batch-calls',
    group: 'operations',
  },
  email: {
    labelTr: 'E-posta',
    labelEn: 'Email',
    descriptionTr: 'Gelen e-postaları görüntüleyin ve AI destekli yanıtlar oluşturun.',
    descriptionEn: 'View incoming emails and generate AI-powered responses.',
    href: '/dashboard/email',
    group: 'operations',
  },
  emailSnippets: {
    labelTr: 'Hızlı Yanıtlar',
    labelEn: 'Quick Replies',
    descriptionTr: 'Hazır yanıt şablonlarını oluşturun ve yönetin.',
    descriptionEn: 'Create and manage reusable email reply snippets.',
    href: '/dashboard/email-snippets',
    group: 'operations',
  },
  marketplaceQa: {
    labelTr: 'Pazaryeri Q&A',
    labelEn: 'Marketplace Q&A',
    descriptionTr: 'Trendyol ve Hepsiburada sorularını AI taslaklarıyla yönetin.',
    descriptionEn: 'Manage Trendyol and Hepsiburada questions with AI drafts.',
    href: '/dashboard/marketplace-qa',
    group: 'operations',
  },
  complaints: {
    labelTr: 'Şikayet Yönetimi',
    labelEn: 'Complaints',
    descriptionTr: 'Şikayetvar kayıtlarını AI taslaklarıyla yönetin.',
    descriptionEn: 'Manage Sikayetvar complaints with AI drafts.',
    href: '/dashboard/complaints',
    group: 'operations',
  },

  // Monitoring
  analytics: {
    labelTr: 'Analitik',
    labelEn: 'Analytics',
    descriptionTr: 'Performans metrikleri ve raporlar',
    descriptionEn: 'Performance metrics and reports',
    href: '/dashboard/analytics',
    group: 'monitoring',
  },
  callbacks: {
    labelTr: 'Geri Arama Talepleri',
    labelEn: 'Callback Requests',
    descriptionTr: 'Müşteri geri arama taleplerini görüntüleyin ve yönetin.',
    descriptionEn: 'View and manage customer callback requests.',
    href: '/dashboard/callbacks',
    group: 'monitoring',
  },
  callHistory: {
    labelTr: 'Arama Geçmişi',
    labelEn: 'Call History',
    descriptionTr: 'Geçmiş telefon görüşmelerini ve transkriptleri görüntüleyin.',
    descriptionEn: 'View past phone calls and transcripts.',
    href: '/dashboard/calls',
    group: 'monitoring',
  },
  chatHistory: {
    labelTr: 'Sohbet Geçmişi',
    labelEn: 'Chat History',
    descriptionTr: 'Geçmiş sohbet oturumlarını ve mesajları görüntüleyin.',
    descriptionEn: 'View past chat sessions and messages.',
    href: '/dashboard/chat-history',
    group: 'monitoring',
  },

  // Management
  integrations: {
    labelTr: 'Entegrasyonlar',
    labelEn: 'Integrations',
    descriptionTr: 'Üçüncü parti servisleri bağlayın ve yönetin.',
    descriptionEn: 'Connect and manage third-party services.',
    href: '/dashboard/integrations',
    group: 'management',
  },
  team: {
    labelTr: 'Ekip',
    labelEn: 'Team',
    descriptionTr: 'Ekip üyelerini ve izinleri yönetin.',
    descriptionEn: 'Manage team members and permissions.',
    href: '/dashboard/team',
    group: 'management',
  },
  phoneNumbers: {
    labelTr: 'Telefon Numaraları',
    labelEn: 'Phone Numbers',
    descriptionTr: 'Telefon numaralarınızı, ses dakikalarını ve kullanım limitlerini yönetin.',
    descriptionEn: 'Manage phone numbers, voice minutes, and usage limits.',
    href: '/dashboard/phone-numbers',
    group: 'management',
  },
  subscription: {
    labelTr: 'Abonelik',
    labelEn: 'Subscription',
    descriptionTr: 'Plan ve fatura bilgileriniz.',
    descriptionEn: 'Your plan and billing information.',
    href: '/dashboard/subscription',
    group: 'management',
  },
  account: {
    labelTr: 'Hesap',
    labelEn: 'Account',
    descriptionTr: 'Profil, bildirimler ve hesap ayarları.',
    descriptionEn: 'Profile, notifications, and account settings.',
    href: '/dashboard/settings',
    group: 'management',
  },
};

/**
 * Get navigation item by route
 */
export function getNavigationItem(route, locale = 'en') {
  const item = Object.values(NAVIGATION_ITEMS).find(nav => nav.href === route);
  if (!item) return null;

  return {
    label: locale === 'tr' ? item.labelTr : item.labelEn,
    description: locale === 'tr' ? item.descriptionTr : item.descriptionEn,
    href: item.href,
  };
}

/**
 * Get label for a route
 */
export function getPageLabel(route, locale = 'en') {
  const item = getNavigationItem(route, locale);
  return item?.label || '';
}

/**
 * Get description for a route
 */
export function getPageDescription(route, locale = 'en') {
  const item = getNavigationItem(route, locale);
  return item?.description || '';
}
