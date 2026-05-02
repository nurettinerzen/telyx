import '@/styles/features.css';
import JsonLd from '@/components/seo/JsonLd';
import {
  KEYWORDS_TR,
  buildOpenGraph,
  buildTwitter,
  languageAlternates,
} from '@/lib/seo/site';
import { breadcrumbSchema, faqSchema } from '@/lib/seo/schemas';
import { HOMEPAGE_FAQS_TR } from '@/lib/seo/faqs';
import runtimeConfig from '@/lib/runtime-config';

const TITLE = 'Özellikler — Çok Kanallı AI Müşteri Hizmetleri';
const DESCRIPTION =
  'Telyx özellikleri: telefon (sesli AI agent), WhatsApp Business API, web sohbet ve e-posta tek panelde. Bilgi tabanı, KVKK uyumlu, e-ticaret entegrasyonları, takvim, analitik ve çoklu asistan.';

const FEATURES_KEYWORDS = [
  ...KEYWORDS_TR,
  'whatsapp business api',
  'sesli yapay zeka agent',
  'ai çağrı asistanı',
  'bilgi tabanı yönetimi',
  'kvkk uyumlu chatbot',
  'çok dilli ai asistan',
];

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: FEATURES_KEYWORDS,
  alternates: languageAlternates('/features'),
  openGraph: buildOpenGraph({
    title: TITLE,
    description: DESCRIPTION,
    path: '/features',
  }),
  twitter: buildTwitter({ title: TITLE, description: DESCRIPTION }),
};

const breadcrumbs = breadcrumbSchema([
  { name: 'Ana Sayfa', path: '/' },
  { name: 'Özellikler', path: '/features' },
]);

const faq = faqSchema(HOMEPAGE_FAQS_TR);

export default function FeaturesLayout({ children }) {
  const includeStructuredData = !runtimeConfig.isBetaApp;
  return (
    <>
      {includeStructuredData ? (
        <JsonLd id="features" data={[breadcrumbs, faq]} />
      ) : null}
      {children}
    </>
  );
}
