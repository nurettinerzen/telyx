import Link from 'next/link';
import { ArrowRight, Grid3x3 } from 'lucide-react';
import Navigation from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { MATRIX_LANDINGS, MATRIX_SLUGS, CHANNELS, INDUSTRIES } from '@/lib/seo/matrix';

export const dynamic = 'force-static';

export default function CozumlerHubPage() {
  // Group landings by channel for cleaner display
  const groupedByChannel = Object.keys(CHANNELS).map((channelKey) => {
    const channel = CHANNELS[channelKey];
    const landings = MATRIX_SLUGS
      .filter((slug) => MATRIX_LANDINGS[slug].channel === channelKey)
      .map((slug) => MATRIX_LANDINGS[slug]);
    return { channelKey, channel, landings };
  });

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <Navigation />

      <section className="pt-28 md:pt-36 pb-12 md:pb-16">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium bg-primary-50 text-primary-700 border border-primary-200 mb-6 dark:bg-primary-950/50 dark:text-primary-300 dark:border-primary-800/60">
              <Grid3x3 className="w-4 h-4" />
              Çözüm Matrisi
            </span>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-5 text-gray-900 dark:text-white">
              Kanal × Sektör Çözümleri
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 dark:text-neutral-400 max-w-2xl mx-auto">
              4 kanal × 4 sektör = 16 özelleştirilmiş çözüm. İşletmenizin tam ihtiyacına göre en uygun kombinasyonu seçin.
            </p>
          </div>
        </div>
      </section>

      <section className="pb-20 md:pb-28">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto space-y-12">
            {groupedByChannel.map(({ channelKey, channel, landings }) => (
              <div key={channelKey}>
                <div className="flex items-center gap-3 mb-6">
                  <span className={`px-3 py-1.5 rounded-full text-sm font-bold text-white bg-gradient-to-r ${channel.gradient}`}>
                    {channel.label}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-neutral-400">
                    {channel.label} kanalında 4 sektör çözümü
                  </span>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  {landings.map((landing) => (
                    <Link
                      key={landing.slug}
                      href={`/cozumler/${landing.slug}`}
                      className="block p-5 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/50 hover:border-primary-400 dark:hover:border-primary-500 hover:shadow-lg transition-all group"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wider">
                          {INDUSTRIES[landing.industry].label}
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
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
