import runtimeConfig from '@/lib/runtime-config';

export const SITE_NAME = 'Telyx';
export const SITE_LEGAL_NAME = 'Telyx AI';
export const SITE_TAGLINE_TR = 'Yapay Zeka Destekli Çok Kanallı Müşteri Hizmetleri';
export const SITE_TAGLINE_EN = 'AI-Powered Multi-Channel Customer Service';

export const SITE_DESCRIPTION_TR =
  'Telyx; telefon, WhatsApp, web sohbeti ve e-postayı tek yapay zeka platformunda birleştirir. KOBİ\'ler için 7/24 otomatik müşteri hizmetleri.';
export const SITE_DESCRIPTION_EN =
  'Telyx unifies phone, WhatsApp, web chat and email in a single AI platform. 24/7 automated customer service built for SMBs.';

export const DEFAULT_OG_IMAGE = {
  url: '/opengraph-image',
  width: 1200,
  height: 630,
  alt: 'Telyx — AI-powered multi-channel customer service',
};

export const SUPPORT_EMAIL = 'info@telyx.ai';

export const SOCIAL_PROFILES = [
  'https://www.linkedin.com/company/telyx-ai',
  'https://x.com/telyxai',
  'https://www.instagram.com/telyx.ai',
];

export const KEYWORDS_TR = [
  'yapay zeka müşteri hizmetleri',
  'ai müşteri hizmetleri',
  'whatsapp chatbot',
  'çağrı merkezi otomasyonu',
  'ai çağrı merkezi',
  'müşteri hizmetleri otomasyonu',
  'otomatik müşteri destek',
  'sesli yapay zeka',
  'çok kanallı müşteri iletişimi',
  'whatsapp business api',
  'web sohbet botu',
  'e-posta otomasyonu',
  'KOBİ müşteri hizmetleri',
  'türkçe ai asistan',
];

export const KEYWORDS_EN = [
  'ai customer service',
  'ai call center',
  'whatsapp ai chatbot',
  'multi channel customer support',
  'omnichannel customer service',
  'voice ai agent',
  'customer service automation',
  'whatsapp business api',
  'sms chatbot',
  'email ai automation',
  'small business customer support',
];

export function siteUrl() {
  return runtimeConfig.siteUrl || 'https://telyx.ai';
}

export function absoluteUrl(path = '/') {
  const base = siteUrl();
  if (!path || path === '/') return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function languageAlternates(path = '/') {
  const url = absoluteUrl(path);
  return {
    canonical: url,
    languages: {
      'tr-TR': url,
      'x-default': url,
    },
  };
}

export function buildOpenGraph({
  title,
  description,
  path = '/',
  type = 'website',
  locale = 'tr_TR',
  images,
} = {}) {
  return {
    type,
    locale,
    siteName: SITE_NAME,
    url: absoluteUrl(path),
    title,
    description,
    images: images || [DEFAULT_OG_IMAGE],
  };
}

export function buildTwitter({ title, description, images } = {}) {
  return {
    card: 'summary_large_image',
    site: '@telyxai',
    creator: '@telyxai',
    title,
    description,
    images: images || [DEFAULT_OG_IMAGE.url],
  };
}
