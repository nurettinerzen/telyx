import JsonLd from '@/components/seo/JsonLd';
import {
  KEYWORDS_TR,
  buildOpenGraph,
  buildTwitter,
  languageAlternates,
} from '@/lib/seo/site';
import { breadcrumbSchema } from '@/lib/seo/schemas';
import runtimeConfig from '@/lib/runtime-config';

const TITLE = 'Çözüm Matrisi — Kanal × Sektör Kombinasyonları';
const DESCRIPTION =
  'Telyx kanal × sektör matrisi: 4 kanal (WhatsApp, telefon, web sohbet, e-posta) ve 4 sektör (e-ticaret, restoran, güzellik salonu, destek) için 16 adet özelleştirilmiş çözüm sayfası.';

const COZUMLER_KEYWORDS = [
  ...KEYWORDS_TR,
  'kanal sektör çözüm matrisi',
  'whatsapp sektör çözümleri',
  'telefon ai sektör çözümleri',
  'web chat sektör çözümleri',
  'e-posta otomasyonu sektör',
];

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: COZUMLER_KEYWORDS,
  alternates: languageAlternates('/cozumler'),
  openGraph: buildOpenGraph({
    title: TITLE,
    description: DESCRIPTION,
    path: '/cozumler',
  }),
  twitter: buildTwitter({ title: TITLE, description: DESCRIPTION }),
};

const breadcrumbs = breadcrumbSchema([
  { name: 'Ana Sayfa', path: '/' },
  { name: 'Çözüm Matrisi', path: '/cozumler' },
]);

export default function CozumlerLayout({ children }) {
  const includeStructuredData = !runtimeConfig.isBetaApp;
  return (
    <>
      {includeStructuredData ? <JsonLd id="cozumler" data={breadcrumbs} /> : null}
      {children}
    </>
  );
}
