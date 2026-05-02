import JsonLd from '@/components/seo/JsonLd';
import {
  KEYWORDS_TR,
  buildOpenGraph,
  buildTwitter,
  languageAlternates,
} from '@/lib/seo/site';
import { breadcrumbSchema, serviceSchema } from '@/lib/seo/schemas';
import runtimeConfig from '@/lib/runtime-config';

const TITLE = 'Eğitim Kurumları İçin AI — Kayıt, Öğrenci Destek, Veli İletişimi';
const DESCRIPTION =
  'Kurslar, dil okulları ve eğitim merkezleri için AI müşteri hizmetleri. Aday öğrenci kayıt, mevcut öğrenci destek, veli bilgilendirme — WhatsApp, telefon, web ve e-posta dahil tek panelde.';

const EGITIM_KEYWORDS = [
  ...KEYWORDS_TR,
  'eğitim ai müşteri hizmetleri',
  'kurs kayıt otomasyonu',
  'okul whatsapp chatbot',
  'eğitim çağrı merkezi',
  'öğrenci destek ai',
  'veli iletişimi otomasyonu',
];

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: EGITIM_KEYWORDS,
  alternates: languageAlternates('/solutions/egitim'),
  openGraph: buildOpenGraph({
    title: TITLE,
    description: DESCRIPTION,
    path: '/solutions/egitim',
  }),
  twitter: buildTwitter({ title: TITLE, description: DESCRIPTION }),
};

const breadcrumbs = breadcrumbSchema([
  { name: 'Ana Sayfa', path: '/' },
  { name: 'Çözümler', path: '/solutions' },
  { name: 'Eğitim', path: '/solutions/egitim' },
]);

const service = serviceSchema({
  name: 'Eğitim Kurumu AI Müşteri Hizmetleri',
  description: DESCRIPTION,
  serviceType: 'Education and Training Institution Automation',
  path: '/solutions/egitim',
});

export default function EgitimSolutionLayout({ children }) {
  const includeStructuredData = !runtimeConfig.isBetaApp;
  return (
    <>
      {includeStructuredData ? (
        <JsonLd id="solutions-egitim" data={[service, breadcrumbs]} />
      ) : null}
      {children}
    </>
  );
}
