import JsonLd from '@/components/seo/JsonLd';
import {
  buildOpenGraph,
  buildTwitter,
  languageAlternates,
} from '@/lib/seo/site';
import { breadcrumbSchema, faqSchema, serviceSchema } from '@/lib/seo/schemas';
import { getChannelLanding } from '@/lib/seo/channels';
import runtimeConfig from '@/lib/runtime-config';

const data = getChannelLanding('e-posta');

export const metadata = {
  title: data.title,
  description: data.metaDescription,
  keywords: data.keywords,
  alternates: languageAlternates(`/${data.slug}`),
  openGraph: buildOpenGraph({
    title: data.title,
    description: data.metaDescription,
    path: `/${data.slug}`,
  }),
  twitter: buildTwitter({ title: data.title, description: data.metaDescription }),
};

const breadcrumbs = breadcrumbSchema([
  { name: 'Ana Sayfa', path: '/' },
  { name: 'E-posta AI', path: '/e-posta' },
]);

const service = serviceSchema({
  name: data.title,
  description: data.metaDescription,
  serviceType: data.serviceType,
  path: `/${data.slug}`,
});

const faq = faqSchema(data.faqs);

export default function EPostaLayout({ children }) {
  const includeStructuredData = !runtimeConfig.isBetaApp;
  return (
    <>
      {includeStructuredData ? (
        <JsonLd id="e-posta" data={[service, faq, breadcrumbs]} />
      ) : null}
      {children}
    </>
  );
}
