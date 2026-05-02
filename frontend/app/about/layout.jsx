import '@/styles/features.css';
import JsonLd from '@/components/seo/JsonLd';
import {
  KEYWORDS_TR,
  buildOpenGraph,
  buildTwitter,
  languageAlternates,
} from '@/lib/seo/site';
import { breadcrumbSchema } from '@/lib/seo/schemas';
import runtimeConfig from '@/lib/runtime-config';

const TITLE = 'Hakkımızda — Telyx Ekibi ve Hikayemiz';
const DESCRIPTION =
  'Telyx 2023 yılında Los Angeles\'ta kuruldu. Yapay zeka destekli müşteri hizmetlerinde KOBİ\'lere değer katmak için çalışan ekibimizi tanıyın.';

const ABOUT_KEYWORDS = [
  ...KEYWORDS_TR,
  'telyx hakkında',
  'telyx ekibi',
  'ai startup türkiye',
];

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ABOUT_KEYWORDS,
  alternates: languageAlternates('/about'),
  openGraph: buildOpenGraph({
    title: TITLE,
    description: DESCRIPTION,
    path: '/about',
  }),
  twitter: buildTwitter({ title: TITLE, description: DESCRIPTION }),
};

const breadcrumbs = breadcrumbSchema([
  { name: 'Ana Sayfa', path: '/' },
  { name: 'Hakkımızda', path: '/about' },
]);

export default function AboutLayout({ children }) {
  const includeStructuredData = !runtimeConfig.isBetaApp;
  return (
    <>
      {includeStructuredData ? <JsonLd id="about" data={breadcrumbs} /> : null}
      {children}
    </>
  );
}
