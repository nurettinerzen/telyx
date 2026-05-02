import JsonLd from '@/components/seo/JsonLd';
import {
  KEYWORDS_TR,
  buildOpenGraph,
  buildTwitter,
  languageAlternates,
} from '@/lib/seo/site';
import { breadcrumbSchema, serviceSchema } from '@/lib/seo/schemas';
import runtimeConfig from '@/lib/runtime-config';

const TITLE = 'Klinik & Sağlık İçin AI — Otomatik Randevu ve Hasta İletişimi';
const DESCRIPTION =
  'Estetik klinikleri, doktor muayenehaneleri ve sağlık merkezleri için AI müşteri hizmetleri. WhatsApp, telefon, web sohbet, e-posta ve Instagram\'dan otomatik randevu, hatırlatma. KVKK uyumlu.';

const KLINIK_KEYWORDS = [
  ...KEYWORDS_TR,
  'klinik ai müşteri hizmetleri',
  'doktor randevu otomasyonu',
  'estetik klinik chatbot',
  'sağlık merkezi otomasyon',
  'kvkk uyumlu hasta iletişimi',
  'tıbbi randevu sistemi',
];

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: KLINIK_KEYWORDS,
  alternates: languageAlternates('/solutions/klinik'),
  openGraph: buildOpenGraph({
    title: TITLE,
    description: DESCRIPTION,
    path: '/solutions/klinik',
  }),
  twitter: buildTwitter({ title: TITLE, description: DESCRIPTION }),
};

const breadcrumbs = breadcrumbSchema([
  { name: 'Ana Sayfa', path: '/' },
  { name: 'Çözümler', path: '/solutions' },
  { name: 'Klinik & Sağlık', path: '/solutions/klinik' },
]);

const service = serviceSchema({
  name: 'Klinik & Sağlık AI Müşteri Hizmetleri',
  description: DESCRIPTION,
  serviceType: 'Healthcare and Clinic Customer Service Automation',
  path: '/solutions/klinik',
});

export default function KlinikSolutionLayout({ children }) {
  const includeStructuredData = !runtimeConfig.isBetaApp;
  return (
    <>
      {includeStructuredData ? (
        <JsonLd id="solutions-klinik" data={[service, breadcrumbs]} />
      ) : null}
      {children}
    </>
  );
}
