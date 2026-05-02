import JsonLd from '@/components/seo/JsonLd';
import {
  KEYWORDS_TR,
  buildOpenGraph,
  buildTwitter,
  languageAlternates,
} from '@/lib/seo/site';
import { breadcrumbSchema, contactPageSchema } from '@/lib/seo/schemas';
import runtimeConfig from '@/lib/runtime-config';

const TITLE = 'İletişim — Demo Talep Edin, Satışla Konuşun';
const DESCRIPTION =
  'Telyx ekibiyle iletişime geçin. Demo talep edin, satış ekibimizle konuşun veya destek alın. info@telyx.ai üzerinden 7/24 ulaşabilirsiniz.';

const CONTACT_KEYWORDS = [
  ...KEYWORDS_TR,
  'telyx iletişim',
  'telyx demo',
  'ai müşteri hizmetleri demo',
];

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: CONTACT_KEYWORDS,
  alternates: languageAlternates('/contact'),
  openGraph: buildOpenGraph({
    title: TITLE,
    description: DESCRIPTION,
    path: '/contact',
  }),
  twitter: buildTwitter({ title: TITLE, description: DESCRIPTION }),
};

const breadcrumbs = breadcrumbSchema([
  { name: 'Ana Sayfa', path: '/' },
  { name: 'İletişim', path: '/contact' },
]);
const contact = contactPageSchema({ path: '/contact' });

export default function ContactLayout({ children }) {
  const includeStructuredData = !runtimeConfig.isBetaApp;
  return (
    <>
      {includeStructuredData ? (
        <JsonLd id="contact" data={[contact, breadcrumbs]} />
      ) : null}
      {children}
    </>
  );
}
