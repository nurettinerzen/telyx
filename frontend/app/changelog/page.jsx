'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import Navigation from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  ArrowRight,
  Sparkles,
  Tag,
} from 'lucide-react';

/* ── Animation helpers ── */
const fadeUp = { opacity: 0, y: 24 };
const visible = { opacity: 1, y: 0 };
const transition = { duration: 0.55, ease: [0.22, 1, 0.36, 1] };
const vp = { once: true, margin: '-60px' };

/* ── Change type config ── */
const changeTypes = {
  new: {
    emoji: '\u2728',
    labelTR: 'Yeni',
    labelEN: 'New',
    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  improvement: {
    emoji: '\uD83D\uDD27',
    labelTR: '\u0130yile\u015Ftirme',
    labelEN: 'Improvement',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  fix: {
    emoji: '\uD83D\uDC1B',
    labelTR: 'D\u00FCzeltme',
    labelEN: 'Fix',
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
};

/* ── Changelog data ── */
const entries = [
  {
    version: 'v0.6.0',
    dateTR: 'Haziran 2026',
    dateEN: 'June 2026',
    titleTR: 'Arama Desteği & Yeni Diller',
    titleEN: 'Search Support & New Languages',
    descTR: 'Bilgi tabanı ve konuşma geçmişinde gelişmiş arama desteği eklendi. Portekizce, Almanca ve Fransızca dil destekleri ile global erişiminizi genişletin.',
    descEN: 'Added advanced search support across knowledge base and conversation history. Expand your global reach with Portuguese, German and French language support.',
    color: 'from-[#000ACF] to-[#00C4E6]',
    changes: [
      { type: 'new', textTR: 'Bilgi tabanında gelişmiş arama', textEN: 'Advanced knowledge base search' },
      { type: 'new', textTR: 'Konuşma geçmişi arama', textEN: 'Conversation history search' },
      { type: 'new', textTR: 'Portekizce dil desteği', textEN: 'Portuguese language support' },
      { type: 'new', textTR: 'Almanca dil desteği', textEN: 'German language support' },
      { type: 'new', textTR: 'Fransızca dil desteği', textEN: 'French language support' },
      { type: 'improvement', textTR: 'Arama sonuçları sıralama algoritması', textEN: 'Search results ranking algorithm' },
    ],
  },
  {
    version: 'v0.5.0',
    dateTR: 'Mart 2026',
    dateEN: 'March 2026',
    titleTR: '\u00C7ok Kanall\u0131 \u0130leti\u015Fim',
    titleEN: 'Multi-Channel Communication',
    descTR: 'WhatsApp, email ve web chat\u2019i tek platformda birle\u015Ftirdik. T\u00FCm kanallardan gelen m\u00FC\u015Fteri mesajlar\u0131n\u0131 tek bir panelden y\u00F6netin.',
    descEN: 'We unified WhatsApp, email and web chat on a single platform. Manage all customer messages from one dashboard.',
    color: 'from-[#006FEB] to-[#00C4E6]',
    changes: [
      { type: 'new', textTR: 'WhatsApp Business entegrasyonu', textEN: 'WhatsApp Business integration' },
      { type: 'new', textTR: 'Gmail ve Outlook email deste\u011Fi', textEN: 'Gmail and Outlook email support' },
      { type: 'new', textTR: 'Web chat widget', textEN: 'Web chat widget' },
      { type: 'improvement', textTR: 'AI yan\u0131t kalitesi iyile\u015Ftirmeleri', textEN: 'AI response quality improvements' },
    ],
  },
  {
    version: 'v0.4.0',
    dateTR: '\u015Eubat 2026',
    dateEN: 'February 2026',
    titleTR: 'E-ticaret Entegrasyonlar\u0131',
    titleEN: 'E-commerce Integrations',
    descTR: 'Shopify ve ikas entegrasyonlar\u0131 ile sipari\u015F takibi, iade y\u00F6netimi ve m\u00FC\u015Fteri do\u011Frulama s\u00FCre\u00E7lerini otomatikle\u015Ftirdik.',
    descEN: 'Automated order tracking, return management and customer verification with Shopify and ikas integrations.',
    color: 'from-[#051752] to-[#006FEB]',
    changes: [
      { type: 'new', textTR: 'Shopify entegrasyonu', textEN: 'Shopify integration' },
      { type: 'new', textTR: 'ikas entegrasyonu', textEN: 'ikas integration' },
      { type: 'new', textTR: 'Sipari\u015F takibi ve iade y\u00F6netimi', textEN: 'Order tracking and return management' },
      { type: 'improvement', textTR: 'M\u00FC\u015Fteri do\u011Frulama sistemi g\u00FC\u00E7lendirildi', textEN: 'Customer verification system strengthened' },
    ],
  },
  {
    version: 'v0.3.0',
    dateTR: 'Ocak 2026',
    dateEN: 'January 2026',
    titleTR: 'Sesli AI Asistan',
    titleEN: 'Voice AI Assistant',
    descTR: 'AI destekli sesli g\u00F6r\u00FC\u015Fme, takvim entegrasyonu ve toplu arama kampanyalar\u0131 ile m\u00FC\u015Fteri ileti\u015Fimini bir \u00FCst seviyeye ta\u015F\u0131d\u0131k.',
    descEN: 'Elevated customer communication with AI-powered voice calls, calendar integration and bulk call campaigns.',
    color: 'from-[#000ACF] to-[#051752]',
    changes: [
      { type: 'new', textTR: 'AI sesli g\u00F6r\u00FC\u015Fme deste\u011Fi', textEN: 'AI voice call support' },
      { type: 'new', textTR: 'Google Calendar entegrasyonu', textEN: 'Google Calendar integration' },
      { type: 'new', textTR: 'Toplu arama kampanyalar\u0131', textEN: 'Bulk call campaigns' },
      { type: 'fix', textTR: 'Randevu \u00E7ak\u0131\u015Fma sorunu giderildi', textEN: 'Appointment conflict issue resolved' },
    ],
  },
  {
    version: 'v0.2.0',
    dateTR: 'Aral\u0131k 2025',
    dateEN: 'December 2025',
    titleTR: 'Dashboard & Analitik',
    titleEN: 'Dashboard & Analytics',
    descTR: 'Ger\u00E7ek zamanl\u0131 analitik, m\u00FC\u015Fteri veri y\u00F6netimi ve tak\u0131m rolleri ile i\u015Fletmenizi daha yak\u0131ndan takip edin.',
    descEN: 'Monitor your business closely with real-time analytics, customer data management and team roles.',
    color: 'from-[#006FEB] to-[#051752]',
    changes: [
      { type: 'new', textTR: 'Ger\u00E7ek zamanl\u0131 analitik dashboard', textEN: 'Real-time analytics dashboard' },
      { type: 'new', textTR: 'M\u00FC\u015Fteri veri y\u00F6netimi', textEN: 'Customer data management' },
      { type: 'new', textTR: 'Tak\u0131m y\u00F6netimi ve roller', textEN: 'Team management and roles' },
      { type: 'improvement', textTR: 'Dark mode iyile\u015Ftirmeleri', textEN: 'Dark mode improvements' },
    ],
  },
  {
    version: 'v0.1.0',
    dateTR: 'Kas\u0131m 2025',
    dateEN: 'November 2025',
    titleTR: '\u0130lk Ad\u0131m',
    titleEN: 'First Step',
    descTR: 'Telyx\u2019in temelleri at\u0131ld\u0131. AI asistan olu\u015Fturma, bilgi taban\u0131, temel chat ve \u00E7oklu dil deste\u011Fi ile yolculu\u011Fa ba\u015Flad\u0131k.',
    descEN: 'The foundations of Telyx were laid. We started the journey with AI assistant creation, knowledge base, basic chat and multi-language support.',
    color: 'from-slate-500 to-slate-700',
    changes: [
      { type: 'new', textTR: 'AI asistan olu\u015Fturma', textEN: 'AI assistant creation' },
      { type: 'new', textTR: 'Bilgi taban\u0131 y\u00F6netimi', textEN: 'Knowledge base management' },
      { type: 'new', textTR: 'Temel chat deste\u011Fi', textEN: 'Basic chat support' },
      { type: 'new', textTR: '\u00C7oklu dil deste\u011Fi (15 dil)', textEN: 'Multi-language support (15 languages)' },
    ],
  },
];

export default function ChangelogPage() {
  const { locale, t } = useLanguage();
  const isTR = locale === 'tr';

  return (
    <div className="features-page min-h-screen bg-white dark:bg-neutral-950 overflow-hidden">
      <Navigation />

      {/* ═══ Hero ═══ */}
      <section className="relative pt-28 md:pt-36 pb-16 md:pb-24">
        {/* Glow blobs */}
        <div className="ft-glow-blob" style={{ width: 600, height: 600, top: -200, left: '8%', background: '#006FEB' }} />
        <div className="ft-glow-blob" style={{ width: 450, height: 450, top: -40, right: '5%', background: '#00C4E6' }} />

        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-3xl mx-auto">
            <motion.div initial={fadeUp} whileInView={visible} viewport={{ once: true }} transition={{ ...transition, delay: 0 }}>
              <span className="ft-badge-shimmer inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold text-white mb-6">
                <Sparkles className="w-4 h-4" />
                {t('changelog.badge')}
              </span>
            </motion.div>
            <motion.h1
              initial={fadeUp}
              whileInView={visible}
              viewport={{ once: true }}
              transition={{ ...transition, delay: 0.06 }}
              className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-5"
              style={{ color: 'var(--ft-text-primary)' }}
            >
              {t('changelog.title')}
            </motion.h1>
            <motion.p
              initial={fadeUp}
              whileInView={visible}
              viewport={{ once: true }}
              transition={{ ...transition, delay: 0.12 }}
              className="text-lg sm:text-xl max-w-2xl mx-auto"
              style={{ color: 'var(--ft-text-secondary)' }}
            >
              {t('changelog.subtitle')}
            </motion.p>
          </div>
        </div>
      </section>

      {/* ═══ Timeline ═══ */}
      <section className="py-8 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto relative">
            {/* Vertical timeline line */}
            <div
              className="absolute left-[19px] md:left-[23px] top-0 bottom-0 w-px"
              style={{ background: 'linear-gradient(180deg, var(--ft-accent), var(--ft-accent-light), transparent)' }}
            />

            <div className="space-y-10 md:space-y-14">
              {entries.map((entry, index) => (
                <motion.div
                  key={entry.version}
                  initial={fadeUp}
                  whileInView={visible}
                  viewport={vp}
                  transition={{ ...transition, delay: index * 0.06 }}
                  className="relative pl-12 md:pl-16"
                >
                  {/* Timeline dot */}
                  <div
                    className={`absolute left-2 md:left-3 top-1 w-[14px] h-[14px] md:w-[18px] md:h-[18px] rounded-full bg-gradient-to-br ${entry.color} ring-4 ring-white dark:ring-neutral-950 shadow-lg`}
                  />

                  {/* Date + version */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span
                      className="text-sm font-medium"
                      style={{ color: 'var(--ft-text-muted)' }}
                    >
                      {isTR ? entry.dateTR : entry.dateEN}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary">
                      <Tag className="w-3 h-3" />
                      {entry.version}
                    </span>
                  </div>

                  {/* Card */}
                  <div
                    className="rounded-2xl p-5 md:p-7 backdrop-blur-xl border transition-all duration-300 hover:shadow-lg"
                    style={{
                      background: 'var(--ft-card-bg)',
                      borderColor: 'var(--ft-border)',
                    }}
                  >
                    <h3
                      className="text-xl md:text-2xl font-bold mb-2"
                      style={{ color: 'var(--ft-text-primary)' }}
                    >
                      {isTR ? entry.titleTR : entry.titleEN}
                    </h3>
                    <p
                      className="text-sm leading-relaxed mb-5"
                      style={{ color: 'var(--ft-text-secondary)' }}
                    >
                      {isTR ? entry.descTR : entry.descEN}
                    </p>

                    {/* Changes list */}
                    <ul className="space-y-2.5">
                      {entry.changes.map((change, ci) => {
                        const ct = changeTypes[change.type];
                        return (
                          <li
                            key={ci}
                            className="flex items-start gap-2.5 text-sm"
                            style={{ color: 'var(--ft-text-secondary)' }}
                          >
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 mt-0.5 ${ct.color}`}
                            >
                              {ct.emoji} {t(`changelog.type${change.type.charAt(0).toUpperCase() + change.type.slice(1)}`)}
                            </span>
                            <span>{isTR ? change.textTR : change.textEN}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial={fadeUp}
            whileInView={visible}
            viewport={vp}
            transition={transition}
          >
            <div className="ft-cta text-center max-w-4xl mx-auto">
              <div className="relative z-10">
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-white">
                  {t('changelog.ctaTitle')}
                </h2>
                <p className="text-lg text-blue-100 dark:text-neutral-400 mb-8 max-w-2xl mx-auto">
                  {t('changelog.ctaSubtitle')}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link href="/waitlist">
                    <Button
                      size="lg"
                      className="ft-glow-btn w-full sm:w-auto rounded-full bg-white text-slate-900 hover:bg-gray-100 px-8 font-semibold shadow-lg"
                    >
                      {t('changelog.ctaApply')}
                    </Button>
                  </Link>
                  <Link href="/contact">
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full sm:w-auto rounded-full border-white/30 text-white hover:bg-white/10 px-8 transition-all duration-200"
                      style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'transparent' }}
                    >
                      {t('changelog.ctaContact')}
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
