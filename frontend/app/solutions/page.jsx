'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import Navigation from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import MarketingFAQ from '@/components/MarketingFAQ';
import {
  ShoppingCart,
  UtensilsCrossed,
  Scissors,
  HeadphonesIcon,
  ArrowRight,
  Sparkles,
  Zap,
  MessageSquare,
  Link2,
  ShieldCheck,
  Check,
} from 'lucide-react';

export default function SolutionsPage() {
  const { t } = useLanguage();

  const solutions = [
    {
      id: 'ecommerce',
      icon: ShoppingCart,
      titleKey: 'solutions.ecommerce.title',
      descKey: 'solutions.ecommerce.desc',
      href: '/solutions/ecommerce',
      color: 'from-blue-500 to-cyan-500',
      bgLight: 'bg-blue-50',
      bgDark: 'dark:bg-blue-950/20',
      features: [
        'solutions.ecommerce.feature1',
        'solutions.ecommerce.feature2',
        'solutions.ecommerce.feature3',
      ],
    },
    {
      id: 'restaurant',
      icon: UtensilsCrossed,
      titleKey: 'solutions.restaurant.title',
      descKey: 'solutions.restaurant.desc',
      href: '/solutions/restaurant',
      color: 'from-orange-500 to-red-500',
      bgLight: 'bg-orange-50',
      bgDark: 'dark:bg-orange-950/20',
      features: [
        'solutions.restaurant.feature1',
        'solutions.restaurant.feature2',
        'solutions.restaurant.feature3',
      ],
    },
    {
      id: 'salon',
      icon: Scissors,
      titleKey: 'solutions.salon.title',
      descKey: 'solutions.salon.desc',
      href: '/solutions/salon',
      color: 'from-pink-500 to-rose-500',
      bgLight: 'bg-pink-50',
      bgDark: 'dark:bg-pink-950/20',
      features: [
        'solutions.salon.feature1',
        'solutions.salon.feature2',
        'solutions.salon.feature3',
      ],
    },
    {
      id: 'support',
      icon: HeadphonesIcon,
      titleKey: 'solutions.support.title',
      descKey: 'solutions.support.desc',
      href: '/solutions/support',
      color: 'from-green-500 to-emerald-500',
      bgLight: 'bg-green-50',
      bgDark: 'dark:bg-green-950/20',
      features: [
        'solutions.support.feature1',
        'solutions.support.feature2',
        'solutions.support.feature3',
      ],
    },
  ];

  const benefits = [
    { icon: Zap, key: 'benefit1', color: 'from-yellow-500 to-orange-500' },
    { icon: MessageSquare, key: 'benefit2', color: 'from-blue-500 to-primary' },
    { icon: Link2, key: 'benefit3', color: 'from-emerald-500 to-teal-500' },
    { icon: ShieldCheck, key: 'benefit4', color: 'from-violet-500 to-primary' },
  ];

  const stats = [
    { valueKey: 'solutions.stats.conversationsValue', labelKey: 'solutions.stats.conversations' },
    { valueKey: 'solutions.stats.resolutionValue', labelKey: 'solutions.stats.resolution' },
    { valueKey: 'solutions.stats.responseValue', labelKey: 'solutions.stats.response' },
    { valueKey: 'solutions.stats.satisfactionValue', labelKey: 'solutions.stats.satisfaction' },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <Navigation />

      {/* ═══ Hero ═══ */}
      <section className="pt-28 md:pt-36 pb-16 md:pb-20 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-sm font-medium mb-6"
            >
              <Sparkles className="w-4 h-4" />
              {t('solutions.hero.badge')}
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05 }}
              className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight mb-5 text-gray-900 dark:text-white"
            >
              {t('solutions.hero.title')}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-lg sm:text-xl text-gray-600 dark:text-neutral-400 max-w-2xl mx-auto"
            >
              {t('solutions.hero.subtitle')}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="flex flex-col sm:flex-row gap-3 justify-center mt-8"
            >
              <Link href="#solutions-grid">
                <Button size="lg" className="rounded-full bg-primary text-white hover:bg-primary/90 px-8">
                  {t('solutions.hero.explore')}
                </Button>
              </Link>
              <Link href="/contact">
                <Button size="lg" variant="outline" className="rounded-full px-8">
                  {t('solutions.contactSales')}
                </Button>
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══ Stats Bar ═══ */}
      <section className="py-10 bg-gray-50/70 dark:bg-neutral-900/40 border-y border-gray-100 dark:border-neutral-800">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-5xl mx-auto">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.labelKey}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                className="text-center"
              >
                <div className="text-3xl md:text-4xl font-bold text-primary mb-1">
                  {t(stat.valueKey)}
                </div>
                <div className="text-sm text-gray-600 dark:text-neutral-400">
                  {t(stat.labelKey)}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Solutions Grid ═══ */}
      <section className="py-16 md:py-20" id="solutions-grid">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {solutions.map((solution, index) => {
              const Icon = solution.icon;
              return (
                <motion.div
                  key={solution.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                >
                  <Card className="p-6 md:p-8 h-full rounded-2xl hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-white dark:bg-neutral-800/80 border-gray-100 dark:border-neutral-700/80 group relative overflow-hidden">
                    {/* Subtle accent glow */}
                    <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full bg-gradient-to-br ${solution.color} opacity-10 group-hover:opacity-20 transition-opacity duration-300 blur-2xl`} />

                    <div className="relative z-10">
                      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${solution.color} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}>
                        <Icon className="w-7 h-7 text-white" />
                      </div>
                      <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2 group-hover:text-primary transition-colors">
                        {t(solution.titleKey)}
                      </h3>
                      <p className="text-gray-600 dark:text-neutral-400 mb-5 leading-relaxed">
                        {t(solution.descKey)}
                      </p>
                      <ul className="space-y-2.5 mb-6">
                        {solution.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-neutral-300">
                            <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                            </div>
                            <span>{t(feature)}</span>
                          </li>
                        ))}
                      </ul>
                      <Link href={solution.href}>
                        <Button variant="outline" className="rounded-full group/btn">
                          {t('solutions.learnMore')}
                          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                        </Button>
                      </Link>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ Why Telyx ═══ */}
      <section className="py-16 md:py-20 bg-gray-50/70 dark:bg-neutral-900/40">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-semibold tracking-tight text-gray-900 dark:text-white"
            >
              {t('solutions.whyTelyx.title')}
            </motion.h2>
            <p className="text-gray-600 dark:text-neutral-400 mt-3 text-lg">
              {t('solutions.whyTelyx.subtitle')}
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {benefits.map((benefit, index) => {
              const Icon = benefit.icon;
              return (
                <motion.div
                  key={benefit.key}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: index * 0.08 }}
                >
                  <Card className="p-6 h-full rounded-2xl bg-white dark:bg-neutral-800/80 border-gray-100 dark:border-neutral-700/80 hover:shadow-lg transition-all duration-300 text-center">
                    <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${benefit.color} flex items-center justify-center mx-auto mb-4`}>
                      <Icon className="w-7 h-7 text-white" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      {t(`solutions.whyTelyx.${benefit.key}.title`)}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-neutral-400 leading-relaxed">
                      {t(`solutions.whyTelyx.${benefit.key}.desc`)}
                    </p>
                  </Card>
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

      {/* ═══ CTA ═══ */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="rounded-3xl p-8 md:p-14 text-center max-w-4xl mx-auto bg-gradient-to-br from-slate-900 to-blue-900 dark:from-neutral-800 dark:to-neutral-800 border border-white/5 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-1/4 w-64 h-64 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 w-48 h-48 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-4 text-white">
                {t('solutions.cta.title')}
              </h2>
              <p className="text-lg text-blue-100 dark:text-neutral-400 mb-8 max-w-2xl mx-auto">
                {t('solutions.cta.subtitle')}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/contact">
                  <Button size="lg" className="w-full sm:w-auto rounded-full bg-white text-slate-900 hover:bg-gray-100 px-8 font-semibold">
                    {t('solutions.cta.contact')}
                  </Button>
                </Link>
                <Link href="/waitlist">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto rounded-full border-white/30 text-white hover:bg-white/10 px-8">
                    {t('solutions.startFree')}
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
