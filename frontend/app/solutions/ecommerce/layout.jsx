import JsonLd from '@/components/seo/JsonLd';
import {
  KEYWORDS_TR,
  buildOpenGraph,
  buildTwitter,
  languageAlternates,
} from '@/lib/seo/site';
import { breadcrumbSchema, serviceSchema } from '@/lib/seo/schemas';
import runtimeConfig from '@/lib/runtime-config';

const TITLE = 'E-ticaret İçin AI Müşteri Hizmetleri — Sipariş, Kargo, İade';
const DESCRIPTION =
  'E-ticaret için Telyx: WhatsApp ve web sohbette sipariş takibi, kargo bilgisi, iade/değişim, ürün önerisi ve sepet kurtarma. Shopify, ikas ve diğer platformlarla entegre.';

const ECOMMERCE_KEYWORDS = [
  ...KEYWORDS_TR,
  'e-ticaret chatbot',
  'shopify whatsapp entegrasyonu',
  'ikas chatbot',
  'sipariş takibi otomasyonu',
  'sepet kurtarma whatsapp',
  'e-ticaret ai müşteri hizmetleri',
];

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ECOMMERCE_KEYWORDS,
  alternates: languageAlternates('/solutions/ecommerce'),
  openGraph: buildOpenGraph({
    title: TITLE,
    description: DESCRIPTION,
    path: '/solutions/ecommerce',
  }),
  twitter: buildTwitter({ title: TITLE, description: DESCRIPTION }),
};

const breadcrumbs = breadcrumbSchema([
  { name: 'Ana Sayfa', path: '/' },
  { name: 'Çözümler', path: '/solutions' },
  { name: 'E-ticaret', path: '/solutions/ecommerce' },
]);

const service = serviceSchema({
  name: 'E-ticaret AI Müşteri Hizmetleri',
  description: DESCRIPTION,
  serviceType: 'E-commerce Customer Support Automation',
  path: '/solutions/ecommerce',
});

export default function EcommerceSolutionLayout({ children }) {
  const includeStructuredData = !runtimeConfig.isBetaApp;
  return (
    <>
      {includeStructuredData ? (
        <JsonLd id="solutions-ecommerce" data={[service, breadcrumbs]} />
      ) : null}
      {children}
    </>
  );
}
