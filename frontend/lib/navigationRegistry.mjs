export const SIDEBAR_SECTIONS = [
  {
    id: 'product',
    labelKey: 'dashboard.sidebar.product',
    itemKeys: ['guides', 'assistants', 'knowledgeBase', 'chatWidget'],
  },
  {
    id: 'operations',
    labelKey: 'dashboard.sidebar.operations',
    itemKeys: ['inbox', 'campaigns', 'email', 'conversations'],
  },
  {
    id: 'monitoring',
    labelKey: 'dashboard.sidebar.monitoring',
    itemKeys: ['analytics', 'callbacks', 'callHistory', 'chatHistory'],
  },
  {
    id: 'management',
    labelKey: 'dashboard.sidebar.management',
    itemKeys: ['integrations', 'team', 'phoneNumbers', 'subscription', 'account'],
  },
];

export const ADMIN_SIDEBAR_SECTION = {
  id: 'admin',
  labelKey: 'dashboard.sidebar.adminSection',
  itemKeys: [
    'adminPanel',
    'adminLeads',
    'redAlert',
    'adminUsers',
    'adminAssistants',
    'adminCalls',
    'adminSubscriptions',
    'adminEnterprise',
    'adminAuditLog',
  ],
};

export const NAVIGATION_ITEMS = {
  guides: {
    labelTr: 'Rehber',
    labelEn: 'Guide',
    descriptionTr: 'Panelin nasıl çalıştığını ve kurulum adımlarını öğrenin.',
    descriptionEn: 'Learn how the dashboard works and get setup steps.',
    href: '/dashboard/guides',
    group: 'product',
    permission: 'assistants:view',
    iconKey: 'guides',
  },
  assistants: {
    labelTr: 'Asistanlar',
    labelEn: 'Assistants',
    descriptionTr: 'Giden arama asistanlarınızı oluşturun ve yönetin.',
    descriptionEn: 'Create and manage your outbound call assistants.',
    href: '/dashboard/assistant',
    group: 'product',
    permission: 'assistants:view',
    iconKey: 'assistants',
  },
  knowledgeBase: {
    labelTr: 'Bilgi Bankası',
    labelEn: 'Knowledge Base',
    descriptionTr: 'Asistanın kullanacağı dokümanları ve SSS içeriklerini yönetin.',
    descriptionEn: 'Manage documents and FAQ content for your assistant.',
    href: '/dashboard/knowledge',
    group: 'product',
    permission: 'knowledge:view',
    iconKey: 'knowledgeBase',
  },
  chatWidget: {
    labelTr: 'Sohbet Aracı',
    labelEn: 'Chat Widget',
    descriptionTr: 'Web sitenize yerleştirilebilir sohbet widget\'ını yapılandırın.',
    descriptionEn: 'Configure embeddable chat widget for your website.',
    href: '/dashboard/chat-widget',
    group: 'product',
    permission: 'assistants:view',
    iconKey: 'chatWidget',
  },
  inbox: {
    labelTr: 'Özel Veriler',
    labelEn: 'Custom Data',
    descriptionTr: 'Özel veri dosyalarınızı yükleyin ve yönetin. Telefon ve yazılı kanallardan gelen sorularda bu veriler kullanılır.',
    descriptionEn: 'Upload and manage your custom data files. These are used to answer questions from phone and messaging channels.',
    href: '/dashboard/customer-data',
    group: 'operations',
    permission: 'campaigns:view',
    iconKey: 'inbox',
  },
  campaigns: {
    labelTr: 'Kampanyalar',
    labelEn: 'Campaigns',
    descriptionTr: 'Excel/CSV yükleyerek toplu arama kampanyaları oluşturun.',
    descriptionEn: 'Create batch calling campaigns by uploading Excel/CSV.',
    href: '/dashboard/batch-calls',
    group: 'operations',
    permission: 'campaigns:view',
    featureId: 'batch_calls',
    iconKey: 'campaigns',
  },
  email: {
    labelTr: 'E-posta',
    labelEn: 'Email',
    descriptionTr: 'Gelen e-postaları görüntüleyin ve AI destekli yanıtlar oluşturun.',
    descriptionEn: 'View incoming emails and generate AI-powered responses.',
    href: '/dashboard/email',
    group: 'operations',
    permission: 'campaigns:view',
    iconKey: 'email',
  },
  conversations: {
    labelTr: 'Sohbetler',
    labelEn: 'Conversations',
    descriptionTr: 'Chat ve WhatsApp konuşmalarını tek ekranda yönetin, devralın ve canlı yanıtlayın.',
    descriptionEn: 'Manage chat and WhatsApp conversations in one place, take them over, and reply live.',
    href: '/dashboard/chats',
    group: 'operations',
    permission: 'whatsapp:view',
    iconKey: 'conversations',
  },
  whatsappInbox: {
    labelTr: 'WhatsApp Inbox',
    labelEn: 'WhatsApp Inbox',
    descriptionTr: 'WhatsApp konuşmalarını tek ekranda görüntüleyin, devralın ve canlı yanıtlayın.',
    descriptionEn: 'View WhatsApp conversations in one place, take them over, and reply live.',
    href: '/dashboard/whatsapp',
    group: 'operations',
    iconKey: 'conversations',
  },
  emailSnippets: {
    labelTr: 'Hızlı Yanıtlar',
    labelEn: 'Quick Replies',
    descriptionTr: 'Hazır yanıt şablonlarını oluşturun ve yönetin.',
    descriptionEn: 'Create and manage reusable email reply snippets.',
    href: '/dashboard/email-snippets',
    group: 'operations',
    iconKey: 'email',
  },
  marketplaceQa: {
    labelTr: 'Pazaryeri Q&A',
    labelEn: 'Marketplace Q&A',
    descriptionTr: 'Trendyol ve Hepsiburada sorularını AI taslaklarıyla yönetin.',
    descriptionEn: 'Manage Trendyol and Hepsiburada questions with AI drafts.',
    href: '/dashboard/marketplace-qa',
    group: 'operations',
    iconKey: 'marketplaceQa',
  },
  complaints: {
    labelTr: 'Şikayet Yönetimi',
    labelEn: 'Complaints',
    descriptionTr: 'Şikayetvar kayıtlarını AI taslaklarıyla yönetin.',
    descriptionEn: 'Manage Sikayetvar complaints with AI drafts.',
    href: '/dashboard/complaints',
    group: 'operations',
    iconKey: 'complaints',
  },
  analytics: {
    labelTr: 'Analitik',
    labelEn: 'Analytics',
    descriptionTr: 'Performans metrikleri ve raporlar',
    descriptionEn: 'Performance metrics and reports',
    href: '/dashboard/analytics',
    group: 'monitoring',
    permission: 'analytics:view',
    iconKey: 'analytics',
  },
  callbacks: {
    labelTr: 'Geri Arama Talepleri',
    labelEn: 'Callback Requests',
    descriptionTr: 'Müşteri geri arama taleplerini görüntüleyin ve yönetin.',
    descriptionEn: 'View and manage customer callback requests.',
    href: '/dashboard/callbacks',
    group: 'monitoring',
    permission: 'campaigns:view',
    iconKey: 'callbacks',
  },
  callHistory: {
    labelTr: 'Arama Geçmişi',
    labelEn: 'Call History',
    descriptionTr: 'Geçmiş telefon görüşmelerini ve transkriptleri görüntüleyin.',
    descriptionEn: 'View past phone calls and transcripts.',
    href: '/dashboard/calls',
    group: 'monitoring',
    permission: 'analytics:view',
    iconKey: 'callHistory',
  },
  chatHistory: {
    labelTr: 'Sohbet Geçmişi',
    labelEn: 'Chat History',
    descriptionTr: 'Geçmiş sohbet oturumlarını ve mesajları görüntüleyin.',
    descriptionEn: 'View past chat sessions and messages.',
    href: '/dashboard/chat-history',
    group: 'monitoring',
    permission: 'analytics:view',
    iconKey: 'chatHistory',
  },
  integrations: {
    labelTr: 'Entegrasyonlar',
    labelEn: 'Integrations',
    descriptionTr: 'Üçüncü parti servisleri bağlayın ve yönetin.',
    descriptionEn: 'Connect and manage third-party services.',
    href: '/dashboard/integrations',
    group: 'management',
    permission: 'integrations:view',
    iconKey: 'integrations',
  },
  team: {
    labelTr: 'Ekip',
    labelEn: 'Team',
    descriptionTr: 'Ekip üyelerini ve izinleri yönetin.',
    descriptionEn: 'Manage team members and permissions.',
    href: '/dashboard/team',
    group: 'management',
    permission: 'team:view',
    iconKey: 'team',
  },
  phoneNumbers: {
    labelTr: 'Telefon Numaraları',
    labelEn: 'Phone Numbers',
    descriptionTr: 'Telefon numaralarınızı, ses dakikalarını ve kullanım limitlerini yönetin.',
    descriptionEn: 'Manage phone numbers, voice minutes, and usage limits.',
    href: '/dashboard/phone-numbers',
    group: 'management',
    permission: 'phone:view',
    iconKey: 'phoneNumbers',
  },
  subscription: {
    labelTr: 'Abonelik',
    labelEn: 'Subscription',
    descriptionTr: 'Plan ve fatura bilgileriniz.',
    descriptionEn: 'Your plan and billing information.',
    href: '/dashboard/subscription',
    group: 'management',
    permission: 'billing:view',
    iconKey: 'subscription',
  },
  account: {
    labelTr: 'Hesap',
    labelEn: 'Account',
    descriptionTr: 'Profil, bildirimler ve hesap ayarları.',
    descriptionEn: 'Profile, notifications, and account settings.',
    href: '/dashboard/settings',
    group: 'management',
    permission: 'settings:view',
    iconKey: 'account',
  },
};

export const ADMIN_NAVIGATION_ITEMS = {
  adminPanel: {
    labelTr: 'Admin Panel',
    labelEn: 'Admin Panel',
    href: '/dashboard/admin',
    iconKey: 'adminPanel',
  },
  adminLeads: {
    labelTr: 'Leadler',
    labelEn: 'Leads',
    href: '/dashboard/admin/leads',
    iconKey: 'adminLeads',
  },
  redAlert: {
    labelTr: 'Red Alert',
    labelEn: 'Red Alert',
    href: '/dashboard/admin/red-alert',
    iconKey: 'redAlert',
  },
  adminUsers: {
    labelTr: 'Kullanıcılar',
    labelEn: 'Users',
    href: '/dashboard/admin/users',
    iconKey: 'adminUsers',
  },
  adminAssistants: {
    labelTr: 'Asistanlar',
    labelEn: 'Assistants',
    href: '/dashboard/admin/assistants',
    iconKey: 'adminAssistants',
  },
  adminCalls: {
    labelTr: 'Aramalar',
    labelEn: 'Calls',
    href: '/dashboard/admin/calls',
    iconKey: 'adminCalls',
  },
  adminSubscriptions: {
    labelTr: 'Abonelikler',
    labelEn: 'Subscriptions',
    href: '/dashboard/admin/subscriptions',
    iconKey: 'adminSubscriptions',
  },
  adminEnterprise: {
    labelTr: 'Kurumsal',
    labelEn: 'Enterprise',
    href: '/dashboard/admin/enterprise',
    iconKey: 'adminEnterprise',
  },
  adminAuditLog: {
    labelTr: 'Audit Log',
    labelEn: 'Audit Log',
    href: '/dashboard/admin/audit-log',
    iconKey: 'adminAuditLog',
  },
};

function getLocalizedLabel(item, locale = 'en') {
  return locale === 'tr' ? item.labelTr : item.labelEn;
}

export function getNavigationItemByKey(key) {
  return NAVIGATION_ITEMS[key] || ADMIN_NAVIGATION_ITEMS[key] || null;
}

export function getNavigationItem(route, locale = 'en') {
  const item = Object.values({ ...NAVIGATION_ITEMS, ...ADMIN_NAVIGATION_ITEMS })
    .find((nav) => nav.href === route);

  if (!item) return null;

  return {
    label: getLocalizedLabel(item, locale),
    description: locale === 'tr' ? item.descriptionTr : item.descriptionEn,
    href: item.href,
  };
}

export function getNavigationLabel(key, locale = 'en') {
  const item = getNavigationItemByKey(key);
  return item ? getLocalizedLabel(item, locale) : '';
}

export function getPageLabel(route, locale = 'en') {
  const item = getNavigationItem(route, locale);
  return item?.label || '';
}

export function getPageDescription(route, locale = 'en') {
  const item = getNavigationItem(route, locale);
  return item?.description || '';
}
