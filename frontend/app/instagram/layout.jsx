import JsonLd from '@/components/seo/JsonLd';
import {
  KEYWORDS_TR,
  buildOpenGraph,
  buildTwitter,
  languageAlternates,
} from '@/lib/seo/site';
import { breadcrumbSchema, serviceSchema } from '@/lib/seo/schemas';
import runtimeConfig from '@/lib/runtime-config';

const TITLE = 'Instagram DM AI — Otomatik Sosyal Medya Müşteri Hizmetleri';
const DESCRIPTION =
  'Instagram DM\'lerinizi AI ile yönetin: ürün soruları, sipariş takibi, randevu, sepet kurtarma. Story sticker\'larından gelen mesajlar otomatik yanıtlanır. Meta resmi entegrasyonu.';

const INSTAGRAM_KEYWORDS = [
  ...KEYWORDS_TR,
  'instagram dm chatbot',
  'instagram müşteri hizmetleri',
  'instagram ai yanıt',
  'meta dm otomasyonu',
  'instagram reklam dm yanıt',
  'instagram sepet kurtarma',
];

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: INSTAGRAM_KEYWORDS,
  alternates: languageAlternates('/instagram'),
  openGraph: buildOpenGraph({
    title: TITLE,
    description: DESCRIPTION,
    path: '/instagram',
  }),
  twitter: buildTwitter({ title: TITLE, description: DESCRIPTION }),
};

const breadcrumbs = breadcrumbSchema([
  { name: 'Ana Sayfa', path: '/' },
  { name: 'Instagram DM AI', path: '/instagram' },
]);

const service = serviceSchema({
  name: 'Instagram DM AI Müşteri Hizmetleri',
  description: DESCRIPTION,
  serviceType: 'Instagram Direct Message AI Automation',
  path: '/instagram',
});

export default function InstagramLayout({ children }) {
  const includeStructuredData = !runtimeConfig.isBetaApp;
  return (
    <>
      {includeStructuredData ? (
        <JsonLd id="instagram" data={[service, breadcrumbs]} />
      ) : null}
      {children}
    </>
  );
}
