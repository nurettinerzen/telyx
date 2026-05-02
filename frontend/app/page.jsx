import Navigation from '@/components/Navigation';
import { LandingPage } from '@/components/LandingPage';
import { Footer } from '@/components/Footer';
import JsonLd from '@/components/seo/JsonLd';
import {
  SITE_NAME,
  SITE_TAGLINE_TR,
  SITE_DESCRIPTION_TR,
  KEYWORDS_TR,
  buildOpenGraph,
  buildTwitter,
  languageAlternates,
} from '@/lib/seo/site';
import { softwareApplicationSchema } from '@/lib/seo/schemas';
import runtimeConfig from '@/lib/runtime-config';

const HOMEPAGE_TITLE = `${SITE_NAME} — ${SITE_TAGLINE_TR}`;
const HOMEPAGE_DESCRIPTION = SITE_DESCRIPTION_TR;

export const metadata = {
  title: HOMEPAGE_TITLE,
  description: HOMEPAGE_DESCRIPTION,
  keywords: KEYWORDS_TR,
  alternates: languageAlternates('/'),
  openGraph: buildOpenGraph({
    title: HOMEPAGE_TITLE,
    description: HOMEPAGE_DESCRIPTION,
    path: '/',
    type: 'website',
  }),
  twitter: buildTwitter({
    title: HOMEPAGE_TITLE,
    description: HOMEPAGE_DESCRIPTION,
  }),
};

export default function Home() {
  const includeStructuredData = !runtimeConfig.isBetaApp;
  return (
    <div className="min-h-screen">
      {includeStructuredData ? (
        <JsonLd id="home" data={softwareApplicationSchema({ locale: 'tr' })} />
      ) : null}
      <Navigation />
      <LandingPage />
      <Footer />
    </div>
  );
}
