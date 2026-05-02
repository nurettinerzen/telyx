import JsonLd from '@/components/seo/JsonLd';
import {
  KEYWORDS_TR,
  buildOpenGraph,
  buildTwitter,
  languageAlternates,
} from '@/lib/seo/site';
import { breadcrumbSchema, serviceSchema } from '@/lib/seo/schemas';
import runtimeConfig from '@/lib/runtime-config';

const TITLE = 'Destek Operasyonları İçin AI — Çoklu Kanal Tek Panelde';
const DESCRIPTION =
  'Müşteri destek operasyonları için Telyx: WhatsApp, web sohbet, e-posta ve telefonu tek panelde birleştirir. AI birinci basamak, gerektiğinde canlı temsilciye sorunsuz handoff.';

const SUPPORT_KEYWORDS = [
  ...KEYWORDS_TR,
  'destek otomasyonu',
  'çağrı merkezi ai',
  'tek panel müşteri destek',
  'omnichannel destek platformu',
  'ai canlı destek handoff',
];

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: SUPPORT_KEYWORDS,
  alternates: languageAlternates('/solutions/support'),
  openGraph: buildOpenGraph({
    title: TITLE,
    description: DESCRIPTION,
    path: '/solutions/support',
  }),
  twitter: buildTwitter({ title: TITLE, description: DESCRIPTION }),
};

const breadcrumbs = breadcrumbSchema([
  { name: 'Ana Sayfa', path: '/' },
  { name: 'Çözümler', path: '/solutions' },
  { name: 'Destek Operasyonları', path: '/solutions/support' },
]);

const service = serviceSchema({
  name: 'Destek Operasyonları AI Otomasyonu',
  description: DESCRIPTION,
  serviceType: 'Customer Support Operations Automation',
  path: '/solutions/support',
});

export default function SupportSolutionLayout({ children }) {
  const includeStructuredData = !runtimeConfig.isBetaApp;
  return (
    <>
      {includeStructuredData ? (
        <JsonLd id="solutions-support" data={[service, breadcrumbs]} />
      ) : null}
      {children}
    </>
  );
}
