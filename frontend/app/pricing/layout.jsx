import '@/styles/pricing.css';
import JsonLd from '@/components/seo/JsonLd';
import {
  SITE_NAME,
  KEYWORDS_TR,
  buildOpenGraph,
  buildTwitter,
  languageAlternates,
  absoluteUrl,
  siteUrl,
} from '@/lib/seo/site';
import { breadcrumbSchema } from '@/lib/seo/schemas';
import runtimeConfig from '@/lib/runtime-config';

const TITLE = 'Fiyatlandırma — Yapay Zeka Müşteri Hizmetleri Planları';
const DESCRIPTION =
  'Telyx fiyatlandırma: Ücretsiz deneme, Kullandıkça Öde, 2.499₺/ay Başlangıç, 7.499₺/ay Profesyonel ve Kurumsal planlar. Telefon, WhatsApp, chat ve e-posta dahil.';

const PRICING_KEYWORDS = [
  ...KEYWORDS_TR,
  'telyx fiyat',
  'yapay zeka müşteri hizmetleri fiyat',
  'whatsapp chatbot fiyat',
  'çağrı merkezi fiyat',
  'ai asistan fiyat',
];

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: PRICING_KEYWORDS,
  alternates: languageAlternates('/pricing'),
  openGraph: buildOpenGraph({
    title: TITLE,
    description: DESCRIPTION,
    path: '/pricing',
  }),
  twitter: buildTwitter({ title: TITLE, description: DESCRIPTION }),
};

const productSchema = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Telyx — Yapay Zeka Müşteri Hizmetleri Platformu',
  description: DESCRIPTION,
  brand: { '@type': 'Brand', name: SITE_NAME },
  url: absoluteUrl('/pricing'),
  offers: {
    '@type': 'AggregateOffer',
    priceCurrency: 'TRY',
    lowPrice: '0',
    highPrice: '7499',
    offerCount: 5,
    offers: [
      {
        '@type': 'Offer',
        name: 'Deneme (Trial)',
        description: '15 dakika telefon görüşmesi ve 14 gün chat/WhatsApp erişimi. Kredi kartı gerekmez.',
        price: '0',
        priceCurrency: 'TRY',
        availability: 'https://schema.org/InStock',
        url: absoluteUrl('/signup'),
      },
      {
        '@type': 'Offer',
        name: 'Kullandıkça Öde (PAYG)',
        description: 'Aylık taahhüt yok. 23₺/dakika üzerinden kullandığınız kadar ödeyin.',
        price: '23',
        priceCurrency: 'TRY',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: '23',
          priceCurrency: 'TRY',
          unitText: 'minute',
        },
        availability: 'https://schema.org/InStock',
        url: absoluteUrl('/signup'),
      },
      {
        '@type': 'Offer',
        name: 'Başlangıç (Starter)',
        description: '500 yazılı etkileşim, 5 asistan, WhatsApp/chat/e-posta dahil. Telefon yok.',
        price: '2499',
        priceCurrency: 'TRY',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: '2499',
          priceCurrency: 'TRY',
          billingDuration: 'P1M',
          unitText: 'monthly',
        },
        availability: 'https://schema.org/InStock',
        url: absoluteUrl('/signup'),
      },
      {
        '@type': 'Offer',
        name: 'Profesyonel (Pro)',
        description: '2000 yazılı etkileşim + 500 dakika telefon, 10 asistan, tüm kanallar, API erişimi.',
        price: '7499',
        priceCurrency: 'TRY',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: '7499',
          priceCurrency: 'TRY',
          billingDuration: 'P1M',
          unitText: 'monthly',
        },
        availability: 'https://schema.org/InStock',
        url: absoluteUrl('/signup'),
      },
      {
        '@type': 'Offer',
        name: 'Kurumsal (Enterprise)',
        description: 'Özel paket: özel limitler, 5+ eşzamanlı çağrı, SLA, özel entegrasyonlar, adanmış destek.',
        priceCurrency: 'TRY',
        availability: 'https://schema.org/InStock',
        url: absoluteUrl('/contact'),
      },
    ],
  },
};

const breadcrumbs = breadcrumbSchema([
  { name: 'Ana Sayfa', path: '/' },
  { name: 'Fiyatlandırma', path: '/pricing' },
]);

export default function PricingLayout({ children }) {
  const includeStructuredData = !runtimeConfig.isBetaApp;
  return (
    <>
      {includeStructuredData ? (
        <JsonLd id="pricing" data={[productSchema, breadcrumbs]} />
      ) : null}
      {children}
    </>
  );
}
