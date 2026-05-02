import runtimeConfig from '@/lib/runtime-config';
import { KB_MANIFEST } from '@/lib/kb/loader';

const STATIC_ROUTES = [
  { path: '/', changeFrequency: 'weekly', priority: 1.0 },
  { path: '/pricing', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/features', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/integrations', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/solutions', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/solutions/ecommerce', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/solutions/restaurant', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/solutions/salon', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/solutions/support', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/kaynak', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/sss', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/whatsapp', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/telefon', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/web-sohbet', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/e-posta', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/contact', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/blog', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/help', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/changelog', changeFrequency: 'weekly', priority: 0.5 },
  { path: '/guides/netgsm-setup', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/guides/bulutfon-setup', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/login', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/signup', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/security', changeFrequency: 'yearly', priority: 0.4 },
];

const BLOG_POST_SLUGS = [
  { slug: 'whatsapp-canli-destek-ai-handoff', date: '2026-04-08' },
  { slug: 'tahsilat-hatirlatma-otomasyonu', date: '2026-04-04' },
  { slug: 'cok-kanalli-destek-operasyonlari', date: '2026-03-27' },
  { slug: 'ai-musteri-hizmetleri-gelecegi', date: '2026-03-15' },
  { slug: 'whatsapp-business-api-rehberi', date: '2026-03-01' },
  { slug: 'e-ticaret-chatbot-karsilastirma', date: '2026-02-15' },
];

export default function sitemap() {
  if (runtimeConfig.isBetaApp) {
    return [];
  }

  const baseUrl = runtimeConfig.siteUrl;
  const now = new Date();

  const staticEntries = STATIC_ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: `${baseUrl}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
    alternates: {
      languages: {
        'tr-TR': `${baseUrl}${path}`,
        'en-US': `${baseUrl}${path}`,
      },
    },
  }));

  const blogEntries = BLOG_POST_SLUGS.map(({ slug, date }) => ({
    url: `${baseUrl}/blog/${slug}`,
    lastModified: new Date(date),
    changeFrequency: 'monthly',
    priority: 0.6,
    alternates: {
      languages: {
        'tr-TR': `${baseUrl}/blog/${slug}`,
        'en-US': `${baseUrl}/blog/${slug}`,
      },
    },
  }));

  const kbEntries = KB_MANIFEST.map(({ slug }) => ({
    url: `${baseUrl}/kaynak/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.7,
    alternates: {
      languages: {
        'tr-TR': `${baseUrl}/kaynak/${slug}`,
      },
    },
  }));

  return [...staticEntries, ...blogEntries, ...kbEntries];
}
