import JsonLd from '@/components/seo/JsonLd';
import {
  KEYWORDS_TR,
  buildOpenGraph,
  buildTwitter,
  languageAlternates,
} from '@/lib/seo/site';
import { breadcrumbSchema, serviceSchema } from '@/lib/seo/schemas';
import runtimeConfig from '@/lib/runtime-config';

const TITLE = 'Güzellik Salonu İçin AI — Otomatik Randevu ve WhatsApp';
const DESCRIPTION =
  'Güzellik salonları, kuaförler ve estetik klinikleri için Telyx: WhatsApp üzerinden otomatik randevu, hatırlatma, iptal yönetimi ve hizmet bilgisi. Google Calendar entegre.';

const SALON_KEYWORDS = [
  ...KEYWORDS_TR,
  'güzellik salonu randevu otomasyonu',
  'kuaför whatsapp randevu',
  'estetik klinik chatbot',
  'salon ai randevu sistemi',
  'whatsapp randevu hatırlatma',
];

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: SALON_KEYWORDS,
  alternates: languageAlternates('/solutions/salon'),
  openGraph: buildOpenGraph({
    title: TITLE,
    description: DESCRIPTION,
    path: '/solutions/salon',
  }),
  twitter: buildTwitter({ title: TITLE, description: DESCRIPTION }),
};

const breadcrumbs = breadcrumbSchema([
  { name: 'Ana Sayfa', path: '/' },
  { name: 'Çözümler', path: '/solutions' },
  { name: 'Güzellik Salonu', path: '/solutions/salon' },
]);

const service = serviceSchema({
  name: 'Güzellik Salonu AI Müşteri Hizmetleri',
  description: DESCRIPTION,
  serviceType: 'Beauty Salon Appointment Automation',
  path: '/solutions/salon',
});

export default function SalonSolutionLayout({ children }) {
  const includeStructuredData = !runtimeConfig.isBetaApp;
  return (
    <>
      {includeStructuredData ? (
        <JsonLd id="solutions-salon" data={[service, breadcrumbs]} />
      ) : null}
      {children}
    </>
  );
}
