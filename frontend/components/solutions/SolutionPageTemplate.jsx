'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import Navigation from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  MessageSquare,
  Globe,
  Mail,
  Phone,
} from 'lucide-react';
import AnimatedCounter from './AnimatedCounter';
import SolutionChatDemo from './SolutionChatDemo';
import AutoRotateTabs from './AutoRotateTabs';
import BentoGrid from './BentoGrid';

const channelIcons = {
  whatsapp: MessageSquare,
  webchat: Globe,
  email: Mail,
  voice: Phone,
};

function getStatParts(val) {
  // Check if value is a simple numeric pattern like "%60", "85%", "<3sn"
  // vs non-numeric like "7/24", "24/7"
  const numericMatch = val.match(/^([^0-9]*)([0-9]+(?:[.,][0-9]+)?)([^0-9]*)$/);
  if (!numericMatch) {
    return { raw: val };
  }
  return {
    prefix: numericMatch[1],
    numeric: parseFloat(numericMatch[2].replace(',', '.')) || 0,
    suffix: numericMatch[3],
  };
}

export default function SolutionPageTemplate({
  sector,
  accentColor = '#006FEB',
  accentLight = '#00C4E6',
  heroIcon: HeroIcon,
  badgeColorClasses,
  statColorClasses,
  useCaseIconBgClasses,
  useCaseIconClasses,
  ctaGradient,
  ctaGlowColors,
  ctaTextColor,
  howItWorksLineGradient,
  howItWorksSteps,
  useCases,
  highlights,
}) {
  const { t } = useLanguage();

  const stats = [1, 2, 3, 4].map((n) => ({
    key: `stat${n}`,
    ...getStatParts(t(`solutions.${sector}.stats.stat${n}.value`)),
    label: t(`solutions.${sector}.stats.stat${n}.label`),
  }));

  const chatMessages = [
    { type: 'customer', text: t(`solutions.${sector}.chatDemo.msg1`) },
    { type: 'bot', text: t(`solutions.${sector}.chatDemo.msg2`) },
    { type: 'customer', text: t(`solutions.${sector}.chatDemo.msg3`) },
    { type: 'bot', text: t(`solutions.${sector}.chatDemo.msg4`) },
  ];

  const tabsData = ['tab1', 'tab2', 'tab3'].map((tabKey, i) => {
    const tabData = {
      key: tabKey,
      icon: howItWorksSteps[i]?.icon,
      title: t(`solutions.${sector}.tabs.${tabKey}.title`),
      contentTitle: t(`solutions.${sector}.tabs.${tabKey}.contentTitle`),
      contentDesc: t(`solutions.${sector}.tabs.${tabKey}.contentDesc`),
      contentBullets: [
        t(`solutions.${sector}.tabs.${tabKey}.bullet1`),
        t(`solutions.${sector}.tabs.${tabKey}.bullet2`),
        t(`solutions.${sector}.tabs.${tabKey}.bullet3`),
      ],
      visual: (
        <div className="flex flex-col items-center gap-3">
          <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${howItWorksSteps[i]?.color || 'from-[#000ACF] to-[#00C4E6]'} flex items-center justify-center shadow-lg`}>
            <span className="text-2xl font-bold text-white">{i + 1}</span>
          </div>
          <span className="text-sm font-medium text-[var(--sol-text-secondary)]">
            {t(`solutions.${sector}.howItWorks.step${i + 1}.title`)}
          </span>
          <p className="text-xs text-[var(--sol-text-muted)] text-center max-w-[200px]">
            {t(`solutions.${sector}.howItWorks.step${i + 1}.desc`)}
          </p>
        </div>
      ),
    };
    return tabData;
  });

  const bentoItems = useCases.map((uc) => {
    const Icon = uc.icon;
    return {
      key: uc.key,
      icon: Icon,
      title: t(uc.titleKey),
      desc: t(uc.descKey),
      color: uc.color,
    };
  });

  const channels = ['whatsapp', 'webchat', 'email', 'voice'];

  return (
    <div className="solutions-page min-h-screen bg-white dark:bg-neutral-950"
      style={{
        '--sol-accent': accentColor,
        '--sol-accent-light': accentLight,
        '--sol-accent-glow': `${accentColor}40`,
      }}
    >
      <Navigation />

      {/* ═══ Hero (Split Layout) ═══ */}
      <section className="pt-28 md:pt-36 pb-16 md:pb-20 relative overflow-hidden">
        <div className="sol-glow-blob w-96 h-96 top-20 left-1/4" style={{ background: accentColor }} />
        <div className="sol-glow-blob w-72 h-72 bottom-0 right-1/3" style={{ background: accentLight }} />

        <div className="container mx-auto px-4 relative z-10">
          <div className="sol-hero-grid">
            {/* Left: Text */}
            <div className="flex flex-col justify-center">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-sm font-medium mb-6 w-fit ${badgeColorClasses}`}
              >
                {HeroIcon && <HeroIcon className="w-4 h-4" />}
                {t(`solutions.${sector}.hero.badge`)}
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.05 }}
                className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight mb-5 text-gray-900 dark:text-white"
              >
                {t(`solutions.${sector}.hero.title`)}
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="text-lg sm:text-xl text-gray-600 dark:text-neutral-400 max-w-xl"
              >
                {t(`solutions.${sector}.hero.subtitle`)}
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.15 }}
                className="flex flex-col sm:flex-row gap-3 mt-8"
              >
                <Link href="/waitlist">
                  <Button size="lg" className="rounded-full bg-primary text-white hover:bg-primary/90 px-8 sol-glow-btn">
                    {t('solutions.startFree')}
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button size="lg" variant="outline" className="rounded-full px-8">
                    {t('solutions.contactSales')}
                  </Button>
                </Link>
              </motion.div>
            </div>

            {/* Right: Chat Demo */}
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="flex justify-center md:justify-end"
            >
              <SolutionChatDemo
                messages={chatMessages}
                botName="Telyx AI"
                botInitials="AI"
                statusText="Online"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══ Stats Bar (Animated Counters) ═══ */}
      <section className="py-10 bg-gray-50/70 dark:bg-neutral-900/40 border-y border-gray-100 dark:border-neutral-800">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-5xl mx-auto">
            {stats.map((stat) => {
              if (stat.raw) {
                return (
                  <motion.div
                    key={stat.key}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    className="text-center"
                  >
                    <div className={`sol-counter-value text-4xl md:text-5xl font-bold ${statColorClasses}`}>
                      {stat.raw}
                    </div>
                    <div className="text-sm mt-1 text-gray-600 dark:text-neutral-400">
                      {stat.label}
                    </div>
                  </motion.div>
                );
              }
              return (
                <AnimatedCounter
                  key={stat.key}
                  value={stat.numeric}
                  prefix={stat.prefix}
                  suffix={stat.suffix}
                  label={stat.label}
                  className="text-center"
                  valueClassName={statColorClasses}
                  labelClassName="text-gray-600 dark:text-neutral-400"
                />
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ How It Works (Auto-Rotating Tabs) ═══ */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-semibold tracking-tight text-gray-900 dark:text-white"
            >
              {t(`solutions.${sector}.howItWorks.title`)}
            </motion.h2>
            <p className="text-gray-600 dark:text-neutral-400 mt-3 text-lg">
              {t(`solutions.${sector}.howItWorks.subtitle`)}
            </p>
          </div>

          <div className="max-w-5xl mx-auto">
            <AutoRotateTabs tabs={tabsData} />
          </div>
        </div>
      </section>

      {/* ═══ Use Cases (Bento Grid) ═══ */}
      <section className="py-16 md:py-20 bg-gray-50/70 dark:bg-neutral-900/40">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-semibold tracking-tight text-gray-900 dark:text-white"
            >
              {t(`solutions.${sector}.useCases.title`)}
            </motion.h2>
          </div>
          <div className="max-w-5xl mx-auto">
            <BentoGrid items={bentoItems} />
          </div>
        </div>
      </section>

      {/* ═══ Highlights ═══ */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-semibold tracking-tight text-gray-900 dark:text-white"
            >
              {t(`solutions.${sector}.highlights.title`)}
            </motion.h2>
            <p className="text-gray-600 dark:text-neutral-400 mt-3 text-lg">
              {t(`solutions.${sector}.highlights.subtitle`)}
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {highlights.map((highlight, index) => {
              const Icon = highlight.icon;
              return (
                <motion.div
                  key={highlight.key}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.12 }}
                >
                  <Card className="p-6 md:p-8 h-full rounded-2xl bg-white dark:bg-neutral-800/80 border-gray-100 dark:border-neutral-700/80 hover:shadow-lg transition-all duration-300">
                    <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${highlight.color} flex items-center justify-center mb-5`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      {t(`solutions.${sector}.highlights.${highlight.key}.title`)}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-neutral-400 leading-relaxed">
                      {t(`solutions.${sector}.highlights.${highlight.key}.desc`)}
                    </p>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ Channels ═══ */}
      <section className="py-16 md:py-20 bg-gray-50/70 dark:bg-neutral-900/40">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-semibold tracking-tight text-gray-900 dark:text-white"
            >
              {t('solutions.channels.title')}
            </motion.h2>
            <p className="text-gray-600 dark:text-neutral-400 mt-3 text-lg">
              {t('solutions.channels.subtitle')}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 max-w-4xl mx-auto">
            {channels.map((ch, i) => {
              const Icon = channelIcons[ch];
              return (
                <motion.div
                  key={ch}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                >
                  <Card className="p-5 text-center rounded-2xl bg-white dark:bg-neutral-800/80 border-gray-100 dark:border-neutral-700/80 hover:shadow-lg transition-all duration-300 group">
                    <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-neutral-700/50 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300">
                      <Icon className="w-6 h-6 text-gray-600 dark:text-neutral-300" />
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-neutral-300">
                      {t(`solutions.channels.${ch}`)}
                    </span>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className={`rounded-3xl p-8 md:p-14 text-center max-w-4xl mx-auto ${ctaGradient} border border-white/5 shadow-2xl relative overflow-hidden`}>
            <div className={`absolute top-0 left-1/4 w-64 h-64 rounded-full blur-3xl pointer-events-none ${ctaGlowColors?.[0] || 'bg-blue-500/20'}`} />
            <div className={`absolute bottom-0 right-1/4 w-48 h-48 rounded-full blur-3xl pointer-events-none ${ctaGlowColors?.[1] || 'bg-cyan-500/15'}`} />

            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-4 text-white">
                {t(`solutions.${sector}.cta.title`)}
              </h2>
              <p className={`text-lg mb-8 max-w-2xl mx-auto ${ctaTextColor || 'text-blue-100 dark:text-neutral-400'}`}>
                {t(`solutions.${sector}.cta.subtitle`)}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/waitlist">
                  <Button size="lg" className="w-full sm:w-auto rounded-full bg-white text-slate-900 hover:bg-gray-100 px-8 font-semibold sol-glow-btn">
                    {t('solutions.startFree')}
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto rounded-full border-white/30 text-white hover:bg-white/10 px-8" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'transparent' }}>
                    {t('solutions.contactSales')}
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
