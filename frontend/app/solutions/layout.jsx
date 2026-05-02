import '@/styles/solutions.css';
import JsonLd from '@/components/seo/JsonLd';
import {
  KEYWORDS_TR,
  buildOpenGraph,
  buildTwitter,
  languageAlternates,
} from '@/lib/seo/site';
import { breadcrumbSchema } from '@/lib/seo/schemas';
import runtimeConfig from '@/lib/runtime-config';

const TITLE = 'Sektörel Çözümler — E-ticaret, Restoran, Salon, Destek';
const DESCRIPTION =
  'Telyx sektörel çözümleri: e-ticaret, restoran, güzellik salonu ve müşteri destek operasyonları için sektöre özel hazır akışlar. KOBİ\'ler için tek panelde çok kanallı AI müşteri hizmetleri.';

const SOLUTIONS_KEYWORDS = [
  ...KEYWORDS_TR,
  'e-ticaret chatbot',
  'restoran rezervasyon ai',
  'güzellik salonu randevu otomasyonu',
  'destek operasyonları otomasyonu',
];

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: SOLUTIONS_KEYWORDS,
  alternates: languageAlternates('/solutions'),
  openGraph: buildOpenGraph({
    title: TITLE,
    description: DESCRIPTION,
    path: '/solutions',
  }),
  twitter: buildTwitter({ title: TITLE, description: DESCRIPTION }),
};

const breadcrumbs = breadcrumbSchema([
  { name: 'Ana Sayfa', path: '/' },
  { name: 'Çözümler', path: '/solutions' },
]);

export default function SolutionsLayout({ children }) {
  const includeStructuredData = !runtimeConfig.isBetaApp;
  return (
    <>
      {includeStructuredData ? (
        <JsonLd id="solutions" data={breadcrumbs} />
      ) : null}
      {children}
    </>
  );
}
