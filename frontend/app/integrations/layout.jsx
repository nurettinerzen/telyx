import '@/styles/integrations.css';
import JsonLd from '@/components/seo/JsonLd';
import {
  KEYWORDS_TR,
  buildOpenGraph,
  buildTwitter,
  languageAlternates,
} from '@/lib/seo/site';
import { breadcrumbSchema } from '@/lib/seo/schemas';
import runtimeConfig from '@/lib/runtime-config';

const TITLE = 'Entegrasyonlar — WhatsApp, Shopify, ikas, Gmail, CRM';
const DESCRIPTION =
  'Telyx entegrasyonları: WhatsApp Business API, Gmail, Outlook, Shopify, ikas, Ticimax, IdeaSoft, HubSpot, Custom CRM, Google Calendar, Webhook API ve Paraşüt. KOBİ stack\'inize 5 dakikada bağlanır.';

const INTEGRATIONS_KEYWORDS = [
  ...KEYWORDS_TR,
  'whatsapp business api entegrasyonu',
  'shopify chatbot',
  'ikas chatbot',
  'gmail otomasyonu',
  'crm entegrasyonu',
  'google calendar entegrasyonu',
];

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: INTEGRATIONS_KEYWORDS,
  alternates: languageAlternates('/integrations'),
  openGraph: buildOpenGraph({
    title: TITLE,
    description: DESCRIPTION,
    path: '/integrations',
  }),
  twitter: buildTwitter({ title: TITLE, description: DESCRIPTION }),
};

const breadcrumbs = breadcrumbSchema([
  { name: 'Ana Sayfa', path: '/' },
  { name: 'Entegrasyonlar', path: '/integrations' },
]);

export default function IntegrationsLayout({ children }) {
  const includeStructuredData = !runtimeConfig.isBetaApp;
  return (
    <>
      {includeStructuredData ? (
        <JsonLd id="integrations" data={breadcrumbs} />
      ) : null}
      {children}
    </>
  );
}
