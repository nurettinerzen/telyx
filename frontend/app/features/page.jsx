'use client';

import { useRef, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import Navigation from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import MarketingFAQ from '@/components/MarketingFAQ';
import {
  ArrowRight,
  BarChart3,
  Bot,
  Calendar,
  Check,
  Globe,
  HeadphonesIcon,
  Link2,
  MessageSquare,
  Puzzle,
  Scissors,
  ShieldCheck,
  ShoppingCart,
  TestTube,
  Upload,
  UtensilsCrossed,
  Sparkles,
  Zap,
} from 'lucide-react';

/* ── Animation helpers ── */
const fadeUp = { opacity: 0, y: 24 };
const visible = { opacity: 1, y: 0 };
const transition = { duration: 0.55, ease: [0.22, 1, 0.36, 1] };
const vp = { once: true, margin: '-60px' };

/* ── Mouse-glow tracker for cards ── */
function useMouseGlow(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleMove = (e) => {
      const cards = el.querySelectorAll('.ft-card');
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

export default function FeaturesPage() {
  const { t } = useLanguage();
  const gridRef = useRef(null);
  useMouseGlow(gridRef);

  const features = [
    { id: 'multichannel', icon: MessageSquare, titleKey: 'features.multichannel.title', descKey: 'features.multichannel.desc', items: ['features.multichannel.item1', 'features.multichannel.item2', 'features.multichannel.item3', 'features.multichannel.item4'], color: 'from-[#000ACF] to-[#00C4E6]', big: true },
    { id: 'ai', icon: Bot, titleKey: 'features.ai.title', descKey: 'features.ai.desc', items: ['features.ai.item1', 'features.ai.item2', 'features.ai.item3', 'features.ai.item4'], color: 'from-[#051752] to-[#006FEB]', big: true },
    { id: 'ecommerce', icon: ShoppingCart, titleKey: 'features.ecommerce.title', descKey: 'features.ecommerce.desc', items: ['features.ecommerce.item1', 'features.ecommerce.item2', 'features.ecommerce.item3', 'features.ecommerce.item4'], color: 'from-[#051752] to-[#000ACF]', big: false },
    { id: 'calendar', icon: Calendar, titleKey: 'features.calendar.title', descKey: 'features.calendar.desc', items: ['features.calendar.item1', 'features.calendar.item2', 'features.calendar.item3'], color: 'from-[#006FEB] to-[#00C4E6]', big: false },
    { id: 'languages', icon: Globe, titleKey: 'features.languages.title', descKey: 'features.languages.desc', items: ['features.languages.item1', 'features.languages.item2', 'features.languages.item3'], color: 'from-[#00C4E6] to-[#006FEB]', big: false },
    { id: 'analytics', icon: BarChart3, titleKey: 'features.analytics.title', descKey: 'features.analytics.desc', items: ['features.analytics.item1', 'features.analytics.item2', 'features.analytics.item3'], color: 'from-[#000ACF] to-[#051752]', big: false },
  ];

  const deepDiveSections = [
    { id: 'dashboardKpi', icon: BarChart3, color: 'from-[#006FEB] to-[#00C4E6]', items: ['features.deepDive.dashboardKpi.item1', 'features.deepDive.dashboardKpi.item2', 'features.deepDive.dashboardKpi.item3', 'features.deepDive.dashboardKpi.item4'] },
    { id: 'securityKvkk', icon: ShieldCheck, color: 'from-[#051752] to-[#006FEB]', items: ['features.deepDive.securityKvkk.item1', 'features.deepDive.securityKvkk.item2', 'features.deepDive.securityKvkk.item3'] },
    { id: 'integrations', icon: Puzzle, color: 'from-[#000ACF] to-[#051752]', items: ['features.deepDive.integrations.item1', 'features.deepDive.integrations.item2', 'features.deepDive.integrations.item3'] },
  ];

  const setupSteps = [
    { step: 1, icon: Bot, key: 'step1', color: 'from-[#006FEB] to-[#051752]' },
    { step: 2, icon: Link2, key: 'step2', color: 'from-[#000ACF] to-[#00C4E6]' },
    { step: 3, icon: Upload, key: 'step3', color: 'from-[#051752] to-[#000ACF]' },
    { step: 4, icon: TestTube, key: 'step4', color: 'from-[#00C4E6] to-[#006FEB]' },
  ];

  const solutionCards = [
    { href: '/solutions/ecommerce', titleKey: 'features.solutions.ecommerce.title', descKey: 'features.solutions.ecommerce.desc', icon: ShoppingCart, color: 'from-[#000ACF] to-[#00C4E6]' },
    { href: '/solutions/restaurant', titleKey: 'features.solutions.restaurant.title', descKey: 'features.solutions.restaurant.desc', icon: UtensilsCrossed, color: 'from-[#051752] to-[#006FEB]' },
    { href: '/solutions/salon', titleKey: 'features.solutions.salon.title', descKey: 'features.solutions.salon.desc', icon: Scissors, color: 'from-[#006FEB] to-[#00C4E6]' },
    { href: '/solutions/support', titleKey: 'features.solutions.support.title', descKey: 'features.solutions.support.desc', icon: HeadphonesIcon, color: 'from-[#000ACF] to-[#051752]' },
  ];

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
            <motion.div initial={fadeUp} animate={visible} transition={{ ...transition, delay: 0 }}>
              <span className="ft-badge-shimmer inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold text-white mb-6">
                <Sparkles className="w-4 h-4" />
                {t('features.hero.badge')}
              </span>
            </motion.div>
            <motion.h1
              initial={fadeUp}
              animate={visible}
              transition={{ ...transition, delay: 0.06 }}
              className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-5"
              style={{ color: 'var(--ft-text-primary)' }}
            >
              {t('features.hero.title')}
            </motion.h1>
            <motion.p
              initial={fadeUp}
              animate={visible}
              transition={{ ...transition, delay: 0.12 }}
              className="text-lg sm:text-xl max-w-2xl mx-auto"
              style={{ color: 'var(--ft-text-secondary)' }}
            >
              {t('features.hero.subtitle')}
            </motion.p>
            <motion.div
              initial={fadeUp}
              animate={visible}
              transition={{ ...transition, delay: 0.18 }}
              className="flex flex-col sm:flex-row gap-3 justify-center mt-8"
            >
              <Link href="/waitlist">
                <Button size="lg" className="ft-glow-btn rounded-full bg-primary text-white hover:bg-primary/90 px-8 shadow-lg shadow-primary/20">
                  {t('features.cta.applyEarlyAccess')}
                </Button>
              </Link>
              <Link href="#features-grid">
                <Button size="lg" variant="outline" className="rounded-full px-8 hover:bg-primary hover:text-white hover:border-primary hover:shadow-lg hover:shadow-primary/15 transition-all duration-200">
                  {t('features.hero.explore')}
                </Button>
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══ Feature Cards — Bento Grid with Mouse-Tracking Glow ═══ */}
      <section className="py-16 md:py-24" id="features-grid">
        <div className="container mx-auto px-4">
          <div ref={gridRef} className="max-w-7xl mx-auto">
            {/* Row 1: 2 big cards */}
            <div className="grid md:grid-cols-2 gap-5 md:gap-6 mb-5 md:mb-6">
              {features.filter(f => f.big).map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <motion.div
                    key={feature.id}
                    initial={fadeUp}
                    whileInView={visible}
                    viewport={vp}
                    transition={{ ...transition, delay: index * 0.08 }}
                  >
                    <div className="ft-card ft-card-lg h-full">
                      <div className="relative z-10">
                        <div className={`ft-icon bg-gradient-to-br ${feature.color}`}>
                          <Icon className="w-6 h-6 text-white" />
                        </div>
                        <h3 className="text-xl md:text-2xl font-bold mb-2" style={{ color: 'var(--ft-text-primary)' }}>
                          {t(feature.titleKey)}
                        </h3>
                        <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--ft-text-secondary)' }}>
                          {t(feature.descKey)}
                        </p>
                        <ul className="space-y-2.5">
                          {feature.items.map((itemKey) => (
                            <li key={itemKey} className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--ft-text-secondary)' }}>
                              <div className="ft-check mt-0.5">
                                <Check className="h-3 w-3 text-primary" />
                              </div>
                              <span>{t(itemKey)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Row 2: 4 smaller cards */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
              {features.filter(f => !f.big).map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <motion.div
                    key={feature.id}
                    initial={fadeUp}
                    whileInView={visible}
                    viewport={vp}
                    transition={{ ...transition, delay: index * 0.06 }}
                  >
                    <div className="ft-card ft-card-sm h-full">
                      <div className="relative z-10">
                        <div className={`ft-icon bg-gradient-to-br ${feature.color}`}>
                          <Icon className="w-5 h-5 text-white" />
                        </div>
                        <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--ft-text-primary)' }}>
                          {t(feature.titleKey)}
                        </h3>
                        <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--ft-text-secondary)' }}>
                          {t(feature.descKey)}
                        </p>
                        <ul className="space-y-2">
                          {feature.items.map((itemKey) => (
                            <li key={itemKey} className="flex items-start gap-2 text-sm" style={{ color: 'var(--ft-text-secondary)' }}>
                              <div className="ft-check mt-0.5">
                                <Check className="h-3 w-3 text-primary" />
                              </div>
                              <span>{t(itemKey)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Deep Dive — Shimmer Top-Line Cards ═══ */}
      <section className="relative py-16 md:py-24">
        <div className="ft-glow-blob" style={{ width: 500, height: 500, bottom: -100, left: '50%', marginLeft: -250, background: '#006FEB', opacity: 0.06 }} />

        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <motion.h2
              initial={fadeUp}
              whileInView={visible}
              viewport={vp}
              transition={transition}
              className="text-3xl md:text-4xl font-bold tracking-tight"
              style={{ color: 'var(--ft-text-primary)' }}
            >
              {t('features.deepDive.title')}
            </motion.h2>
            <p className="mt-3 text-lg" style={{ color: 'var(--ft-text-secondary)' }}>
              {t('features.deepDive.subtitle')}
            </p>
          </div>
          <div className="grid lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
            {deepDiveSections.map((section, index) => {
              const Icon = section.icon;
              return (
                <motion.div
                  key={section.id}
                  initial={fadeUp}
                  whileInView={visible}
                  viewport={vp}
                  transition={{ ...transition, delay: index * 0.08 }}
                >
                  <div className="ft-deep-card h-full">
                    <div className="relative z-10">
                      <div className={`ft-icon bg-gradient-to-br ${section.color}`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--ft-text-primary)' }}>
                        {t(`features.deepDive.${section.id}.title`)}
                      </h3>
                      <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--ft-text-secondary)' }}>
                        {t(`features.deepDive.${section.id}.desc`)}
                      </p>
                      <ul className="space-y-2.5">
                        {section.items.map((itemKey) => (
                          <li key={itemKey} className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--ft-text-secondary)' }}>
                            <div className="ft-check mt-0.5">
                              <Check className="h-3 w-3 text-primary" />
                            </div>
                            <span>{t(itemKey)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ Easy Setup — Glowing Timeline ═══ */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <motion.h2
              initial={fadeUp}
              whileInView={visible}
              viewport={vp}
              transition={transition}
              className="text-3xl md:text-4xl font-bold tracking-tight"
              style={{ color: 'var(--ft-text-primary)' }}
            >
              {t('features.easySetup.title')}
            </motion.h2>
            <p className="mt-3 text-lg" style={{ color: 'var(--ft-text-secondary)' }}>
              {t('features.easySetup.subtitle')}
            </p>
          </div>
          <div className="grid md:grid-cols-4 gap-8 max-w-5xl mx-auto relative">
            {/* Connector line */}
            <div className="ft-connector hidden md:block" />

            {setupSteps.map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.key}
                  initial={fadeUp}
                  whileInView={visible}
                  viewport={vp}
                  transition={{ ...transition, delay: index * 0.1 }}
                  className="ft-step text-center relative"
                >
                  <div className={`ft-step-circle bg-gradient-to-br ${item.color}`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <div className="ft-step-number">{item.step}</div>
                  <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--ft-text-primary)' }}>
                    {t(`features.easySetup.${item.key}.title`)}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--ft-text-secondary)' }}>
                    {t(`features.easySetup.${item.key}.desc`)}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ Sector Flow — Glassmorphic Panel ═══ */}
      <section className="relative py-16 md:py-24">
        <div className="ft-glow-blob" style={{ width: 400, height: 400, top: '20%', right: '-3%', background: '#8b5cf6' }} />

        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <motion.h2
              initial={fadeUp}
              whileInView={visible}
              viewport={vp}
              transition={transition}
              className="text-3xl md:text-4xl font-bold tracking-tight"
              style={{ color: 'var(--ft-text-primary)' }}
            >
              {t('features.sectorFlows.title')}
            </motion.h2>
            <p className="mt-3 text-lg" style={{ color: 'var(--ft-text-secondary)' }}>
              {t('features.sectorFlows.subtitle')}
            </p>
          </div>

          <motion.div
            initial={fadeUp}
            whileInView={visible}
            viewport={vp}
            transition={transition}
            className="max-w-6xl mx-auto"
          >
            <div className="ft-sector-panel">
              <div className="grid lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-[var(--ft-border)]">
                {/* Left - Overview */}
                <div className="p-6 md:p-8">
                  <div className="flex items-center gap-2 text-xs mb-4" style={{ color: 'var(--ft-text-muted)' }}>
                    <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium">{t('features.sectorFlows.solutionLabel')}</span>
                    <span className="px-2.5 py-1 rounded-full" style={{ background: 'var(--ft-glass)' }}>{t('features.sectorFlows.ecommerceLabel')}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <ShoppingCart className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-xl font-bold" style={{ color: 'var(--ft-text-primary)' }}>
                      {t('features.sectorFlows.ecommerce.title')}
                    </h3>
                  </div>
                  <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--ft-text-secondary)' }}>
                    {t('features.sectorFlows.ecommerce.desc')}
                  </p>
                  <ul className="space-y-2">
                    {(t('features.sectorFlows.ecommerce.features') || []).map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--ft-text-secondary)' }}>
                        <div className="ft-check mt-0.5">
                          <Check className="h-3 w-3 text-primary" />
                        </div>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href="/solutions/ecommerce" className="inline-flex items-center gap-1 mt-5 text-sm font-semibold text-primary hover:underline">
                    {t('features.sectorFlows.detail')} <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>

                {/* Center - Sample Flow */}
                <div className="p-6 md:p-8">
                  <h4 className="text-lg font-bold mb-1" style={{ color: 'var(--ft-text-primary)' }}>
                    {t('features.sectorFlows.sampleFlow')}
                  </h4>
                  <p className="text-xs mb-5" style={{ color: 'var(--ft-text-muted)' }}>
                    {t('features.sectorFlows.sampleFlowDesc')}
                  </p>
                  <div className="space-y-3">
                    {['step1', 'step2', 'step3'].map((step, i) => (
                      <div key={step} className={i === 2 ? 'ft-flow-step-highlight' : 'ft-flow-step'}>
                        <div className={`text-sm font-semibold mb-1 ${i === 2 ? 'text-white' : ''}`} style={i !== 2 ? { color: 'var(--ft-text-primary)' } : undefined}>
                          {i + 1}) {t(`features.sectorFlows.ecommerce.flow.${step}`)}
                        </div>
                        <p className={`text-xs leading-relaxed ${i === 2 ? 'text-blue-100 dark:text-neutral-300' : ''}`} style={i !== 2 ? { color: 'var(--ft-text-muted)' } : undefined}>
                          {t(`features.sectorFlows.ecommerce.flow.${step}Desc`)}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs mt-4" style={{ color: 'var(--ft-text-muted)' }}>
                    {t('features.sectorFlows.ecommerce.flowNote')}
                  </p>
                </div>

                {/* Right - KPIs */}
                <div className="p-6 md:p-8">
                  <h4 className="text-lg font-bold mb-1" style={{ color: 'var(--ft-text-primary)' }}>
                    {t('features.sectorFlows.kpis')}
                  </h4>
                  <p className="text-xs mb-5" style={{ color: 'var(--ft-text-muted)' }}>
                    {t('features.sectorFlows.kpisDesc')}
                  </p>
                  <ul className="space-y-2 mb-6">
                    {(t('features.sectorFlows.ecommerce.kpiList') || []).map((kpi, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm" style={{ color: 'var(--ft-text-secondary)' }}>
                        <div className="ft-check">
                          <Check className="h-3 w-3 text-primary" />
                        </div>
                        <span>{kpi}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="pt-4" style={{ borderTop: '1px solid var(--ft-border)' }}>
                    <p className="text-xs mb-2" style={{ color: 'var(--ft-text-muted)' }}>{t('features.sectorFlows.suggestedIntegrations')}</p>
                    <div className="flex gap-2 flex-wrap">
                      {(t('features.sectorFlows.ecommerce.integrations') || []).map((integration) => (
                        <span key={integration} className="px-3 py-1 text-xs rounded-full" style={{ border: '1px solid var(--ft-border)', color: 'var(--ft-text-secondary)', background: 'var(--ft-glass)' }}>
                          {integration}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3 mt-6">
                    <Link href="/solutions">
                      <Button variant="outline" size="sm" className="rounded-full hover:bg-primary hover:text-white hover:border-primary transition-all duration-200">{t('features.sectorFlows.seeAll')}</Button>
                    </Link>
                    <Link href="/waitlist">
                      <Button size="sm" className="rounded-full bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/15">{t('features.sectorFlows.tryFree')}</Button>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ Solution Cards ═══ */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <motion.h2
              initial={fadeUp}
              whileInView={visible}
              viewport={vp}
              transition={transition}
              className="text-3xl md:text-4xl font-bold tracking-tight"
              style={{ color: 'var(--ft-text-primary)' }}
            >
              {t('features.solutions.title')}
            </motion.h2>
            <p className="mt-3 text-lg" style={{ color: 'var(--ft-text-secondary)' }}>
              {t('features.solutions.subtitle')}
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-5 max-w-5xl mx-auto">
            {solutionCards.map((solution, index) => {
              const Icon = solution.icon;
              return (
                <motion.div
                  key={solution.href}
                  initial={fadeUp}
                  whileInView={visible}
                  viewport={vp}
                  transition={{ ...transition, delay: index * 0.06 }}
                >
                  <Link href={solution.href}>
                    <div className="ft-solution-card h-full group">
                      <div className="flex items-start gap-4">
                        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${solution.color} flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                          <Icon className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-bold mb-1 group-hover:text-primary transition-colors duration-200" style={{ color: 'var(--ft-text-primary)' }}>
                            {t(solution.titleKey)}
                          </h3>
                          <p className="text-sm leading-relaxed" style={{ color: 'var(--ft-text-secondary)' }}>
                            {t(solution.descKey)}
                          </p>
                          <span className="inline-flex items-center gap-1 mt-3 text-sm font-semibold text-primary">
                            {t('features.solutions.link')} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section className="py-8 md:py-12">
        <div className="container mx-auto px-4">
          <MarketingFAQ />
        </div>
      </section>

      {/* ═══ CTA — Glow Section ═══ */}
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
                  {t('features.cta.title')}
                </h2>
                <p className="text-lg text-blue-100 dark:text-neutral-400 mb-8 max-w-2xl mx-auto">
                  {t('features.cta.subtitle')}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link href="/waitlist">
                    <Button size="lg" className="ft-glow-btn w-full sm:w-auto rounded-full bg-white text-slate-900 hover:bg-gray-100 px-8 font-semibold shadow-lg">
                      {t('features.cta.applyEarlyAccess')}
                    </Button>
                  </Link>
                  <Link href="/contact">
                    <Button size="lg" variant="outline" className="w-full sm:w-auto rounded-full border-white/30 text-white hover:bg-white/10 px-8 transition-all duration-200" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'transparent' }}>
                      {t('features.cta.contact')}
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
