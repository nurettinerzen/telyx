import JsonLd from '@/components/seo/JsonLd';
import {
  KEYWORDS_TR,
  buildOpenGraph,
  buildTwitter,
  languageAlternates,
} from '@/lib/seo/site';
import { breadcrumbSchema, serviceSchema } from '@/lib/seo/schemas';
import runtimeConfig from '@/lib/runtime-config';

const TITLE = 'Restoranlar İçin AI — Rezervasyon ve WhatsApp Sipariş';
const DESCRIPTION =
  'Restoran ve cafe işletmeleri için Telyx: WhatsApp ve telefon üzerinden otomatik rezervasyon, paket sipariş, menü soruları ve müşteri yorumları. Tek panelden 7/24 yönetim.';

const RESTAURANT_KEYWORDS = [
  ...KEYWORDS_TR,
  'restoran rezervasyon otomasyonu',
  'whatsapp paket sipariş',
  'restoran chatbot',
  'cafe ai müşteri hizmetleri',
  'restoran çağrı yönetimi',
];

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: RESTAURANT_KEYWORDS,
  alternates: languageAlternates('/solutions/restaurant'),
  openGraph: buildOpenGraph({
    title: TITLE,
    description: DESCRIPTION,
    path: '/solutions/restaurant',
  }),
  twitter: buildTwitter({ title: TITLE, description: DESCRIPTION }),
};

const breadcrumbs = breadcrumbSchema([
  { name: 'Ana Sayfa', path: '/' },
  { name: 'Çözümler', path: '/solutions' },
  { name: 'Restoran', path: '/solutions/restaurant' },
]);

const service = serviceSchema({
  name: 'Restoran AI Müşteri Hizmetleri',
  description: DESCRIPTION,
  serviceType: 'Restaurant Reservation and Order Automation',
  path: '/solutions/restaurant',
});

export default function RestaurantSolutionLayout({ children }) {
  const includeStructuredData = !runtimeConfig.isBetaApp;
  return (
    <>
      {includeStructuredData ? (
        <JsonLd id="solutions-restaurant" data={[service, breadcrumbs]} />
      ) : null}
      {children}
    </>
  );
}
