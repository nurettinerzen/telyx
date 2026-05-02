import { notFound } from 'next/navigation';
import MatrixLanding from '@/components/landings/MatrixLanding';
import JsonLd from '@/components/seo/JsonLd';
import { getMatrixLanding, MATRIX_SLUGS, getChannel, getIndustry } from '@/lib/seo/matrix';
import {
  buildOpenGraph,
  buildTwitter,
  languageAlternates,
} from '@/lib/seo/site';
import { breadcrumbSchema, serviceSchema } from '@/lib/seo/schemas';
import runtimeConfig from '@/lib/runtime-config';

export const dynamic = 'force-static';

export async function generateStaticParams() {
  return MATRIX_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const data = getMatrixLanding(params.slug);
  if (!data) return { title: 'Bulunamadı' };

  const path = `/cozumler/${data.slug}`;
  return {
    title: data.title,
    description: data.metaDescription,
    keywords: data.keywords,
    alternates: languageAlternates(path),
    openGraph: buildOpenGraph({
      title: data.title,
      description: data.metaDescription,
      path,
    }),
    twitter: buildTwitter({ title: data.title, description: data.metaDescription }),
  };
}

export default function CozumlerDetailPage({ params }) {
  const data = getMatrixLanding(params.slug);
  if (!data) notFound();

  const includeStructuredData = !runtimeConfig.isBetaApp;
  const path = `/cozumler/${data.slug}`;
  const channel = getChannel(data.channel);
  const industry = getIndustry(data.industry);

  const service = serviceSchema({
    name: data.title,
    description: data.metaDescription,
    serviceType: `${channel.label} AI for ${industry.label}`,
    path,
  });

  const breadcrumbs = breadcrumbSchema([
    { name: 'Ana Sayfa', path: '/' },
    { name: 'Çözüm Matrisi', path: '/cozumler' },
    { name: `${channel.label} × ${industry.label}`, path },
  ]);

  return (
    <>
      {includeStructuredData ? (
        <JsonLd id={`cozumler-${data.slug}`} data={[service, breadcrumbs]} />
      ) : null}
      <MatrixLanding data={data} />
    </>
  );
}
