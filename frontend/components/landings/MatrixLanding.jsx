import Link from 'next/link';
import { ArrowRight, Check, Phone, MessageSquare, MessageCircle, Mail } from 'lucide-react';
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

const CHANNEL_HUB_PATH = {
  whatsapp: '/whatsapp',
  telefon: '/telefon',
  'web-sohbet': '/web-sohbet',
  'e-posta': '/e-posta',
};

const INDUSTRY_HUB_PATH = {
  'e-ticaret': '/solutions/ecommerce',
  restoran: '/solutions/restaurant',
  salon: '/solutions/salon',
  destek: '/solutions/support',
};

const INDUSTRY_LABEL = {
  'e-ticaret': 'E-ticaret',
  restoran: 'Restoran',
  salon: 'Güzellik Salonu',
  destek: 'Müşteri Desteği',
};

const CHANNEL_LABEL = {
  whatsapp: 'WhatsApp',
  telefon: 'Telefon',
  'web-sohbet': 'Web Sohbet',
  'e-posta': 'E-posta',
};

export default function MatrixLanding({ data }) {
  const Icon = CHANNEL_ICON[data.channel] || MessageSquare;
  const gradient = CHANNEL_GRADIENT[data.channel] || 'from-primary to-primary/70';
  const channelHub = CHANNEL_HUB_PATH[data.channel];
  const industryHub = INDUSTRY_HUB_PATH[data.industry];
  const channelLabel = CHANNEL_LABEL[data.channel];
  const industryLabel = INDUSTRY_LABEL[data.industry];

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 overflow-hidden">
      <Navigation />

      <section className="relative pt-28 md:pt-36 pb-12 md:pb-16">
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
            <div className="flex items-center justify-center gap-2 mb-6">
              <Link
                href={channelHub}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-gradient-to-r ${gradient} hover:opacity-90 transition-opacity`}
              >
                <Icon className="w-3.5 h-3.5" />
                {channelLabel}
              </Link>
              <span className="text-gray-400">×</span>
              <Link
                href={industryHub}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors"
              >
                {industryLabel}
              </Link>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-5 text-gray-900 dark:text-white">
              {data.heroTitle}
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 dark:text-neutral-400 max-w-2xl mx-auto mb-8">
              {data.heroSubtitle}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/signup">
                <Button size="lg" className="rounded-full bg-primary text-white hover:bg-primary/90 px-8 shadow-lg shadow-primary/20">
                  Ücretsiz Deneyin
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
              <Link href="/contact">
                <Button size="lg" variant="outline" className="rounded-full px-8">
                  Demo İsteyin
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center text-gray-900 dark:text-white">
              {channelLabel} kanalında {industryLabel.toLowerCase()} için kullanım örnekleri
            </h2>
            <div className="space-y-4">
              {data.useCases.map((uc, i) => (
                <div
                  key={i}
                  className="p-6 rounded-2xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/50"
                >
                  <h3 className="text-lg font-bold mb-2 text-gray-900 dark:text-white">
                    {uc.title}
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

      <section className="py-12 md:py-16 bg-gray-50/70 dark:bg-neutral-900/40">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center text-gray-900 dark:text-white">
              Neden Telyx?
            </h2>
            <ul className="space-y-3">
              {data.benefits.map((benefit, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 p-4 rounded-xl bg-white dark:bg-neutral-800/50 border border-gray-200 dark:border-neutral-700"
                >
                  <span className={`w-8 h-8 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0 shadow-md`}>
                    <Check className="w-4 h-4 text-white" />
                  </span>
                  <span className="text-gray-800 dark:text-neutral-200 leading-relaxed">
                    {benefit}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold mb-6 text-center text-gray-900 dark:text-white">
              Daha fazlasını keşfedin
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Link
                href={channelHub}
                className="block p-5 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/50 hover:border-primary-400 dark:hover:border-primary-500 transition-colors"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className={`w-8 h-8 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md`}>
                    <Icon className="w-4 h-4 text-white" />
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {channelLabel} kanalı
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-neutral-400">
                  Tüm sektörler için {channelLabel} AI özelliklerini ve fiyatlandırmayı görün.
                </p>
              </Link>
              <Link
                href={industryHub}
                className="block p-5 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/50 hover:border-primary-400 dark:hover:border-primary-500 transition-colors"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-neutral-700 flex items-center justify-center">
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-200">
                      {industryLabel.charAt(0)}
                    </span>
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {industryLabel}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-neutral-400">
                  {industryLabel} sektörü için tüm Telyx çözümlerini inceleyin.
                </p>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto rounded-3xl p-8 md:p-14 text-center bg-gradient-to-br from-slate-900 to-blue-900 dark:from-neutral-800 dark:to-neutral-800 border border-white/5 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-1/4 w-64 h-64 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 w-48 h-48 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white">
                Hemen başlayın
              </h2>
              <p className="text-lg text-blue-100 dark:text-neutral-400 mb-8 max-w-2xl mx-auto">
                15 dakika telefon görüşmesi ve 14 gün chat/WhatsApp erişimi. Kredi kartı gerekmez.
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
