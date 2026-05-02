import '@/styles/features.css';
import JsonLd from '@/components/seo/JsonLd';
import {
  SITE_NAME,
  KEYWORDS_TR,
  buildOpenGraph,
  buildTwitter,
  languageAlternates,
  absoluteUrl,
  siteUrl,
} from '@/lib/seo/site';
import { breadcrumbSchema } from '@/lib/seo/schemas';
import runtimeConfig from '@/lib/runtime-config';

const TITLE = 'Blog — AI Müşteri Hizmetleri Rehberi ve İçgörüleri';
const DESCRIPTION =
  'Telyx Blog: yapay zeka destekli müşteri hizmetleri, WhatsApp Business API, çok kanallı destek operasyonları ve KOBİ verimlilik rehberleri. Türkçe ve İngilizce.';

const BLOG_KEYWORDS = [
  ...KEYWORDS_TR,
  'whatsapp blog',
  'ai müşteri hizmetleri blog',
  'çağrı merkezi rehberi',
  'kobi destek rehberi',
];

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: BLOG_KEYWORDS,
  alternates: languageAlternates('/blog'),
  openGraph: buildOpenGraph({
    title: TITLE,
    description: DESCRIPTION,
    path: '/blog',
    type: 'website',
  }),
  twitter: buildTwitter({ title: TITLE, description: DESCRIPTION }),
};

const blogJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Blog',
  '@id': `${siteUrl()}/blog#blog`,
  url: absoluteUrl('/blog'),
  name: `${SITE_NAME} Blog`,
  description: DESCRIPTION,
  inLanguage: ['tr-TR', 'en-US'],
  publisher: { '@id': `${siteUrl()}#organization` },
};

const breadcrumbs = breadcrumbSchema([
  { name: 'Ana Sayfa', path: '/' },
  { name: 'Blog', path: '/blog' },
]);

export default function BlogLayout({ children }) {
  const includeStructuredData = !runtimeConfig.isBetaApp;
  return (
    <>
      {includeStructuredData ? (
        <JsonLd id="blog" data={[blogJsonLd, breadcrumbs]} />
      ) : null}
      {children}
    </>
  );
}
