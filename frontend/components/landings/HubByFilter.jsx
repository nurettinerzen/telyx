import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import Navigation from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { MATRIX_LANDINGS, MATRIX_SLUGS, CHANNELS, INDUSTRIES } from '@/lib/seo/matrix';

const ICON_LABELS = {
  whatsapp: 'WhatsApp',
  telefon: 'Telefon',
  'web-sohbet': 'Web Sohbet',
  'e-posta': 'E-posta',
  instagram: 'Instagram DM',
};

export default function HubByFilter({ filterType, filterValue, eyebrow, heroTitle, heroSubtitle, IconComponent }) {
  const matches = MATRIX_SLUGS
    .filter((slug) => MATRIX_LANDINGS[slug][filterType] === filterValue)
    .map((slug) => MATRIX_LANDINGS[slug]);

  const getOtherLabel = (landing) =>
    filterType === 'channel'
      ? INDUSTRIES[landing.industry].label
      : ICON_LABELS[landing.channel];

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <Navigation />

      <section className="pt-28 md:pt-36 pb-12 md:pb-16">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium bg-primary-50 text-primary-700 border border-primary-200 mb-6 dark:bg-primary-950/50 dark:text-primary-300 dark:border-primary-800/60">
              {IconComponent ? <IconComponent className="w-4 h-4" /> : null}
              {eyebrow}
            </span>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-5 text-gray-900 dark:text-white">
              {heroTitle}
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 dark:text-neutral-400 max-w-2xl mx-auto">
              {heroSubtitle}
            </p>
          </div>
        </div>
      </section>

      <section className="pb-20 md:pb-28">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-2 gap-4">
              {matches.map((landing) => (
                <Link
                  key={landing.slug}
                  href={`/cozumler/${landing.slug}`}
                  className="block p-5 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/50 hover:border-primary-400 dark:hover:border-primary-500 hover:shadow-lg transition-all group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wider">
                      {getOtherLabel(landing)}
                    </span>
                    <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary-700 dark:group-hover:text-primary-300 group-hover:translate-x-1 transition-all" />
                  </div>
                  <h3 className="text-base font-bold mb-1.5 text-gray-900 dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">
                    {landing.heroTitle}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-neutral-400 line-clamp-2">
                    {landing.metaDescription}
                  </p>
                </Link>
              ))}
            </div>

            <div className="mt-12 text-center">
              <Link
                href="/cozumler"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-white hover:bg-primary/90 font-medium shadow-lg shadow-primary/20 transition-all"
              >
                Tüm çözüm matrisini görün
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
