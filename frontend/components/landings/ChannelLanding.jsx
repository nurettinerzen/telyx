import Link from 'next/link';
import { ArrowRight, Check, Sparkles, Phone, MessageSquare, MessageCircle, Mail } from 'lucide-react';
import Navigation from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';

const CHANNEL_ICON = {
  whatsapp: MessageSquare,
  telefon: Phone,
  'web-sohbet': MessageCircle,
  'e-posta': Mail,
};

const CHANNEL_GRADIENT = {
  whatsapp: 'from-emerald-500 to-green-600',
  telefon: 'from-[#051752] to-[#006FEB]',
  'web-sohbet': 'from-[#000ACF] to-[#00C4E6]',
  'e-posta': 'from-purple-600 to-indigo-600',
};

export default function ChannelLanding({ data }) {
  const Icon = CHANNEL_ICON[data.slug] || Sparkles;
  const gradient = CHANNEL_GRADIENT[data.slug] || 'from-primary to-primary/70';

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 overflow-hidden">
      <Navigation />

      {/* Hero */}
      <section className="relative pt-28 md:pt-36 pb-16 md:pb-20">
        <div
          className="absolute -top-40 left-1/4 w-[500px] h-[500px] rounded-full opacity-20 blur-3xl pointer-events-none"
          style={{ background: '#006FEB' }}
        />
        <div
          className="absolute top-20 right-1/4 w-[400px] h-[400px] rounded-full opacity-15 blur-3xl pointer-events-none"
          style={{ background: '#00C4E6' }}
        />

        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-3xl mx-auto">
            <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold text-white mb-6 bg-gradient-to-r ${gradient} shadow-lg`}>
              <Icon className="w-4 h-4" />
              {data.hero.eyebrow}
            </span>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6 text-gray-900 dark:text-white">
              {data.hero.title}
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 dark:text-neutral-400 max-w-2xl mx-auto mb-10">
              {data.hero.subtitle}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/signup">
                <Button size="lg" className="rounded-full bg-primary text-white hover:bg-primary/90 px-8 shadow-lg shadow-primary/20">
                  {data.hero.ctaPrimary}
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
              <Link href="/contact">
                <Button size="lg" variant="outline" className="rounded-full px-8">
                  {data.hero.ctaSecondary}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 text-gray-900 dark:text-white">
              Neden Telyx ile {data.hero.eyebrow}?
            </h2>
            <div className="grid sm:grid-cols-2 gap-6">
              {data.valueProps.map((vp, i) => (
                <div
                  key={i}
                  className="p-6 md:p-8 rounded-2xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/50 hover:shadow-lg transition-shadow"
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 shadow-md`}>
                    <Check className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
                    {vp.title}
                  </h3>
                  <p className="text-gray-600 dark:text-neutral-400 leading-relaxed">
                    {vp.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="py-16 md:py-20 bg-gray-50/70 dark:bg-neutral-900/40">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900 dark:text-white">
                Sektörünüze göre kullanım örnekleri
              </h2>
              <p className="text-lg text-gray-600 dark:text-neutral-400">
                {data.hero.eyebrow} kanalı her sektörde farklı işler — Telyx hepsine hazır.
              </p>
            </div>
            <div className="space-y-4">
              {data.useCases.map((uc, i) => (
                <div
                  key={i}
                  className="p-6 rounded-2xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/50"
                >
                  <h3 className="text-lg font-bold mb-2 text-gray-900 dark:text-white">
                    {uc.industry}
                  </h3>
                  <p className="text-gray-700 dark:text-neutral-300 leading-relaxed">
                    {uc.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-10 text-gray-900 dark:text-white">
              Sıkça sorulan sorular
            </h2>
            <div className="space-y-3">
              {data.faqs.map((faq, i) => (
                <details
                  key={i}
                  className="group rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/50 p-5"
                >
                  <summary className="flex items-center justify-between gap-3 cursor-pointer list-none">
                    <span className="text-base font-semibold text-gray-900 dark:text-white">
                      {faq.question}
                    </span>
                    <span className="text-primary-700 dark:text-primary-300 transition-transform group-open:rotate-45 text-2xl leading-none">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-gray-700 dark:text-neutral-300 leading-relaxed">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto rounded-3xl p-8 md:p-14 text-center bg-gradient-to-br from-slate-900 to-blue-900 dark:from-neutral-800 dark:to-neutral-800 border border-white/5 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-1/4 w-64 h-64 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 w-48 h-48 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white">
                {data.hero.eyebrow} ile başlamaya hazır mısınız?
              </h2>
              <p className="text-lg text-blue-100 dark:text-neutral-400 mb-8 max-w-2xl mx-auto">
                Ücretsiz deneme planıyla 15 dakika telefon görüşmesi ve 14 gün chat/WhatsApp erişimi kazanın. Kredi kartı gerekmez.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/signup">
                  <Button size="lg" className="rounded-full bg-white text-slate-900 hover:bg-gray-100 px-8 font-semibold shadow-lg">
                    Ücretsiz Deneyin
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-full border-white/30 text-white hover:bg-white/10 px-8"
                    style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'transparent' }}
                  >
                    Demo İsteyin
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
