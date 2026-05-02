import '@/styles/features.css';
import JsonLd from '@/components/seo/JsonLd';
import {
  buildOpenGraph,
  buildTwitter,
  languageAlternates,
} from '@/lib/seo/site';
import { breadcrumbSchema, faqSchema } from '@/lib/seo/schemas';
import { HOMEPAGE_FAQS_TR } from '@/lib/seo/faqs';
import runtimeConfig from '@/lib/runtime-config';

const TITLE = 'Yardım Merkezi — Sıkça Sorulan Sorular';
const DESCRIPTION =
  'Telyx yardım merkezi: hızlı başlangıç, sıkça sorulan sorular, fiyatlandırma, entegrasyon rehberleri ve teknik destek.';

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: languageAlternates('/help'),
  openGraph: buildOpenGraph({
    title: TITLE,
    description: DESCRIPTION,
    path: '/help',
  }),
  twitter: buildTwitter({ title: TITLE, description: DESCRIPTION }),
};

const breadcrumbs = breadcrumbSchema([
  { name: 'Ana Sayfa', path: '/' },
  { name: 'Yardım Merkezi', path: '/help' },
]);
const faq = faqSchema(HOMEPAGE_FAQS_TR);

export default function HelpLayout({ children }) {
  const includeStructuredData = !runtimeConfig.isBetaApp;
  return (
    <>
      {includeStructuredData ? <JsonLd id="help" data={[faq, breadcrumbs]} /> : null}
      {children}
    </>
  );
}
