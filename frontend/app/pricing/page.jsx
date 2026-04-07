'use client';

import { useRef, useEffect } from 'react';
import { Check, Zap, ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import Navigation from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  SHARED_REGIONAL_PRICING,
  SHARED_FEATURE_ORDER,
  SHARED_PLAN_META,
  LOCALE_TO_REGION,
  formatSharedPrice,
  getFeatureLabel,
} from '@shared/pricing';

/* ── Animation helpers ── */
const fadeUp = { opacity: 0, y: 24 };
const visible = { opacity: 1, y: 0 };
const transition = { duration: 0.6, ease: [0.22, 1, 0.36, 1] };
const vp = { once: true, margin: '-60px' };

/* ── Mouse-glow tracker for cards ── */
function useMouseGlow(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleMove = (e) => {
      const cards = el.querySelectorAll('.pr-plan-card');
      cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
        card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
      });
    };
    el.addEventListener('mousemove', handleMove);
    return () => el.removeEventListener('mousemove', handleMove);
  }, [ref]);
}

export default function PricingPage() {
  const { t, locale } = useLanguage();
  const cardsRef = useRef(null);
  useMouseGlow(cardsRef);

  // Region / locale
  const region = LOCALE_TO_REGION[locale] || 'US';
  const pricing = SHARED_REGIONAL_PRICING[region] || SHARED_REGIONAL_PRICING.US;
  const isTR = region === 'TR';
  const lang = isTR ? 'tr' : 'en';
  const period = isTR ? '/ay' : '/month';
  const popularBadge = isTR ? 'En Popüler' : 'Most Popular';

  // Build plan cards
  const planIds = ['TRIAL', 'STARTER', 'PRO', 'ENTERPRISE'];
  const plans = planIds.map((id) => {
    const meta = SHARED_PLAN_META[id];
    const planPricing = pricing.plans[id];
    return {
      id,
      name: isTR ? meta.nameTR : meta.nameEN,
      description: isTR ? meta.descTR : meta.descEN,
      price: planPricing.price,
      minutes: planPricing.minutes,
      writtenInteractions: planPricing.writtenInteractions,
      overageRate: planPricing.overageRate,
      concurrentLimit: planPricing.concurrentLimit,
      assistantsLimit: planPricing.assistantsLimit,
      chatDays: planPricing.chatDays,
      writtenUnitPrice: planPricing.writtenUnitPrice,
      pricePerMinute: planPricing.pricePerMinute,
      features: meta.features,
      period: id === 'ENTERPRISE' ? '' : (id === 'TRIAL' ? '' : period),
      popular: id === 'PRO',
      badge: id === 'PRO' ? popularBadge : null,
    };
  });

  const getPlanFeatures = (plan) => {
    return SHARED_FEATURE_ORDER
      .filter((key) => plan.features.includes(key))
      .map((key) => ({ key, text: getFeatureLabel(key, lang, plan) }));
  };

  // PAYG
  const payg = pricing.plans.PAYG;
  const writtenUnitRate = payg.writtenUnitPrice || 0;
  const voiceUnitRate = payg.pricePerMinute || 0;

  const overageRows = [
    {
      channel: isTR ? 'Destek etkileşimi' : 'Support interaction',
      unit: isTR ? '1 etkileşim' : '1 interaction',
      rate: `${formatSharedPrice(writtenUnitRate, region)}/${isTR ? 'etkileşim' : 'interaction'}`,
      note: isTR
        ? 'PAYG bakiyesinden düşer. Aylık planlarda önce dahil kullanım, sonra ek paket, ardından yazılı kullanım aşımı uygulanır.'
        : 'Deducted from the PAYG wallet. Monthly plans consume the included pool first, then add-ons, then written overage.'
    },
    {
      channel: isTR ? 'Ses dakikası' : 'Voice minute',
      unit: isTR ? '1 dk' : '1 min',
      rate: `${formatSharedPrice(voiceUnitRate, region)}/${isTR ? 'dk' : 'min'}`,
      note: isTR
        ? 'PAYG cüzdanından düşer. Pro ve Enterprise planlarında dahil dakikalar bittiğinde ses aşımı devreye girer.'
        : 'Deducted from the PAYG wallet. On Pro and Enterprise, voice overage applies after included minutes are exhausted.'
    },
  ];

  return (
    <div className="pricing-page min-h-screen bg-white dark:bg-neutral-950 overflow-hidden">
      <Navigation />

      {/* ── Hero ── */}
      <section className="relative pt-28 md:pt-36 pb-16 md:pb-20">
        {/* Glow blobs */}
        <div
          className="pr-glow-blob"
          style={{ width: 500, height: 500, top: -100, left: '10%', background: '#006FEB' }}
        />
        <div
          className="pr-glow-blob"
          style={{ width: 400, height: 400, top: 50, right: '5%', background: '#a855f7' }}
        />

        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-3xl mx-auto">
            <motion.div
              initial={fadeUp}
              whileInView={visible}
              viewport={{ once: true }}
              transition={{ ...transition, delay: 0 }}
            >
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium bg-primary/10 text-primary border border-primary/20 mb-6">
                <Sparkles className="w-4 h-4" />
                {isTR ? 'Şeffaf fiyatlandırma' : 'Transparent pricing'}
              </span>
            </motion.div>

            <motion.h1
              initial={fadeUp}
              whileInView={visible}
              viewport={{ once: true }}
              transition={{ ...transition, delay: 0.1 }}
              className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6 text-[var(--pr-text-primary)]"
            >
              {t('pricing.title')}
            </motion.h1>

            <motion.p
              initial={fadeUp}
              whileInView={visible}
              viewport={{ once: true }}
              transition={{ ...transition, delay: 0.2 }}
              className="text-lg sm:text-xl text-[var(--pr-text-secondary)] mb-4"
            >
              {t('pricing.subtitle')}
            </motion.p>

            <motion.p
              initial={fadeUp}
              whileInView={visible}
              viewport={{ once: true }}
              transition={{ ...transition, delay: 0.3 }}
              className="text-sm font-medium text-primary"
            >
              {isTR
                ? '15 dakika ücretsiz deneme — Kredi kartı gerekmez'
                : '15-minute free trial — No credit card required'}
            </motion.p>
          </div>
        </div>
      </section>

      {/* ── Plan Cards ── */}
      <section className="py-8 pb-24">
        <div className="container mx-auto px-4">
          <div
            ref={cardsRef}
            className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto items-stretch"
          >
            {plans.map((plan, i) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: i * 0.1 }}
                className={`pr-plan-card ${plan.popular ? 'popular' : ''}`}
              >
                {/* Popular badge */}
                {plan.badge && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                    <span className="pr-popular-badge text-white text-xs font-bold px-5 py-1.5 rounded-full shadow-lg">
                      {plan.badge}
                    </span>
                  </div>
                )}

                {/* Plan header */}
                <div className="text-center mb-6">
                  <h3 className="text-lg font-semibold text-[var(--pr-text-primary)] mb-2">
                    {plan.name}
                  </h3>
                  <p className="text-[var(--pr-text-muted)] text-sm mb-5 min-h-[40px]">
                    {plan.description}
                  </p>

                  {/* Price */}
                  <div className="flex items-baseline justify-center min-h-[48px]">
                    {plan.id === 'TRIAL' ? (
                      <span className="text-3xl font-bold text-emerald-500">
                        {isTR ? 'Ücretsiz' : 'Free'}
                      </span>
                    ) : plan.price !== null ? (
                      <>
                        <span className="text-4xl font-bold text-[var(--pr-text-primary)]">
                          {formatSharedPrice(plan.price, region)}
                        </span>
                        <span className="text-[var(--pr-text-muted)] ml-1 text-sm">{plan.period}</span>
                      </>
                    ) : (
                      <span className="text-2xl font-bold text-[var(--pr-text-primary)]">
                        {isTR ? 'İletişime Geçin' : 'Contact Us'}
                      </span>
                    )}
                  </div>

                  {/* Sub-price info */}
                  <div className="min-h-[20px] mt-2">
                    {plan.id === 'TRIAL' && plan.chatDays ? (
                      <p className="text-xs text-[var(--pr-text-muted)]">
                        {isTR ? `${plan.chatDays} gün chat/WhatsApp` : `${plan.chatDays}-day chat/WhatsApp`}
                      </p>
                    ) : plan.overageRate ? (
                      <p className="text-xs text-[var(--pr-text-muted)]">
                        {isTR ? `Aşım: ${formatSharedPrice(plan.overageRate, region)}/dk` : `Overage: ${formatSharedPrice(plan.overageRate, region)}/min`}
                      </p>
                    ) : plan.id === 'ENTERPRISE' ? (
                      <p className="text-xs text-[var(--pr-text-muted)]">
                        {isTR ? 'Özel fiyatlandırma' : 'Custom pricing'}
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Divider */}
                <div className="h-px bg-[var(--pr-border)] mb-5" />

                {/* Features */}
                <ul className="space-y-3 mb-8 flex-grow">
                  {getPlanFeatures(plan).map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-3">
                      <span className="pr-check-icon">
                        <Check className="h-3 w-3 text-primary" />
                      </span>
                      <span className="text-sm text-[var(--pr-text-secondary)] leading-snug">
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <div className="mt-auto">
                  <Link href={plan.id === 'ENTERPRISE' ? '/contact' : '/signup'} className="block">
                    <Button
                      className={`w-full rounded-xl h-11 font-medium transition-all duration-300 ${
                        plan.popular
                          ? 'bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:scale-[1.02]'
                          : 'hover:bg-primary hover:text-white hover:border-primary hover:shadow-lg hover:shadow-primary/15 hover:scale-[1.02]'
                      }`}
                      variant={plan.popular ? 'default' : 'outline'}
                      size="lg"
                    >
                      {plan.id === 'ENTERPRISE'
                        ? (isTR ? 'Bize Ulaşın' : 'Contact Us')
                        : plan.id === 'TRIAL'
                          ? (isTR ? 'Ücretsiz Deneyin' : 'Try Free')
                          : (isTR ? 'Hemen Başlayın' : 'Get Started')}
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>

          {/* ── PAYG Section ── */}
          <div className="mt-24 max-w-2xl mx-auto">
            <motion.div
              initial={fadeUp}
              whileInView={visible}
              viewport={vp}
              transition={transition}
              className="text-center mb-8"
            >
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 mb-4">
                <Zap className="w-4 h-4" />
                {isTR ? 'Esnek Kullanım' : 'Flexible Usage'}
              </div>
              <h2 className="text-3xl font-bold text-[var(--pr-text-primary)] mb-2">
                {isTR ? 'Kullandıkça Öde' : 'Pay As You Go'}
              </h2>
              <p className="text-[var(--pr-text-secondary)]">
                {isTR
                  ? 'Aylık taahhüt yok. Ses dakikaları ve yazılı etkileşimler kullanım bakiyesinden düşer.'
                  : 'No monthly commitment. Voice minutes and written interactions are deducted from the usage wallet.'}
              </p>
            </motion.div>

            <motion.div
              initial={fadeUp}
              whileInView={visible}
              viewport={vp}
              transition={{ ...transition, delay: 0.15 }}
              className="pr-payg-card text-center"
            >
              <div className="text-5xl font-bold text-primary mb-1">
                {formatSharedPrice(payg.pricePerMinute, region)}
                <span className="text-lg font-normal text-[var(--pr-text-muted)] ml-1">
                  /{isTR ? 'dk' : 'min'}
                </span>
              </div>
              <p className="text-sm text-[var(--pr-text-secondary)] mb-6">
                {isTR
                  ? `Minimum ${payg.minTopup} dk yükleme (${formatSharedPrice(payg.minTopup * payg.pricePerMinute, region)})`
                  : `Minimum ${payg.minTopup} min top-up (${formatSharedPrice(payg.minTopup * payg.pricePerMinute, region)})`}
              </p>

              <div className="flex flex-wrap justify-center gap-3 mb-8">
                {[
                  isTR ? 'Telefon + yazılı kanallar dahil' : 'Phone + written channels included',
                  isTR ? `${payg.assistantsLimit} asistan` : `${payg.assistantsLimit} assistants`,
                  isTR ? `${formatSharedPrice(payg.writtenUnitPrice, region)}/etkileşim` : `${formatSharedPrice(payg.writtenUnitPrice, region)}/interaction`,
                  isTR ? 'Bakiye süresi dolmaz' : 'Balance never expires',
                ].map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--pr-glass)] border border-[var(--pr-border)] text-[var(--pr-text-secondary)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <Link href="/signup">
                <Button variant="outline" size="lg" className="rounded-xl h-11 px-8 hover:border-primary/40">
                  {isTR ? 'Hemen Başlayın' : 'Get Started'}
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </motion.div>
          </div>

          {/* ── Overage Details ── */}
          <div className="mt-24 max-w-5xl mx-auto">
            <motion.div
              initial={fadeUp}
              whileInView={visible}
              viewport={vp}
              transition={transition}
              className="text-center mb-10"
            >
              <h2 className="text-3xl font-bold text-[var(--pr-text-primary)] mb-3">
                {isTR ? 'Paket aşım detayları' : 'Plan overage details'}
              </h2>
              <p className="text-[var(--pr-text-secondary)] max-w-3xl mx-auto">
                {isTR
                  ? 'Paket aşımı, planınızda tanımlı dakikaların bitmesinden sonra oluşan ek kullanımı ifade eder.'
                  : 'Plan overage means extra usage after the included plan minutes are exhausted.'}
              </p>
            </motion.div>

            <motion.div
              initial={fadeUp}
              whileInView={visible}
              viewport={vp}
              transition={{ ...transition, delay: 0.15 }}
              className="pr-table-wrap overflow-x-auto"
            >
              <table className="min-w-[680px]">
                <thead>
                  <tr>
                    <th>{isTR ? 'Kanal' : 'Channel'}</th>
                    <th>{isTR ? 'Birim' : 'Unit'}</th>
                    <th>{isTR ? 'Aşım ücreti' : 'Overage rate'}</th>
                    <th>{isTR ? 'Not' : 'Note'}</th>
                  </tr>
                </thead>
                <tbody>
                  {overageRows.map((row) => (
                    <tr key={row.channel}>
                      <td className="font-medium text-[var(--pr-text-primary)]">{row.channel}</td>
                      <td>{row.unit}</td>
                      <td>
                        {row.free ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <Check className="w-3 h-3" />
                            {row.rate}
                          </span>
                        ) : (
                          row.rate
                        )}
                      </td>
                      <td className="text-[var(--pr-text-muted)]">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </motion.div>
          </div>

          {/* ── CTA Section ── */}
          <motion.div
            initial={fadeUp}
            whileInView={visible}
            viewport={vp}
            transition={transition}
            className="mt-24 max-w-4xl mx-auto"
          >
            <div className="pr-cta-section text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-white dark:text-[var(--pr-text-primary)] mb-4">
                {isTR ? 'Hâlâ kararsız mısınız?' : 'Still undecided?'}
              </h2>
              <p className="text-lg text-blue-100 dark:text-[var(--pr-text-secondary)] mb-8 max-w-xl mx-auto">
                {isTR
                  ? 'İhtiyacınıza göre doğru paketi birlikte seçelim.'
                  : 'Let\'s choose the right package together for your needs.'}
              </p>
              <Link href="/waitlist">
                <Button
                  size="lg"
                  className="pr-glow-btn rounded-full bg-primary hover:bg-primary/90 text-white h-12 px-8 text-base font-medium shadow-lg shadow-primary/25"
                >
                  {isTR ? 'Demo Talep Edin' : 'Request Demo'}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </motion.div>

          {/* ── FAQ link ── */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={vp}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-16 text-center max-w-2xl mx-auto"
          >
            <p className="text-[var(--pr-text-secondary)]">
              {t('pricing.questions')}{' '}
              <Link href="/contact" className="text-primary font-medium hover:underline">
                {t('pricing.contactUs')}
              </Link>
            </p>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
