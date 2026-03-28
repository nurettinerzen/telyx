'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import Navigation from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  ShoppingCart,
  Package,
  Truck,
  RotateCcw,
  MessageCircle,
  ArrowRight,
  Check,
  Sparkles,
  Lightbulb,
  Bell,
  Globe,
} from 'lucide-react';

export default function EcommerceSolutionPage() {
  const { t } = useLanguage();

  const useCases = [
    { icon: Package, titleKey: 'solutions.ecommerce.useCase1.title', descKey: 'solutions.ecommerce.useCase1.desc' },
    { icon: Truck, titleKey: 'solutions.ecommerce.useCase2.title', descKey: 'solutions.ecommerce.useCase2.desc' },
    { icon: RotateCcw, titleKey: 'solutions.ecommerce.useCase3.title', descKey: 'solutions.ecommerce.useCase3.desc' },
    { icon: MessageCircle, titleKey: 'solutions.ecommerce.useCase4.title', descKey: 'solutions.ecommerce.useCase4.desc' },
  ];

  const integrations = ['ikas', 'Shopify', 'WooCommerce', 'Ticimax'];

  const stats = [
    { valueKey: 'solutions.ecommerce.stats.stat1.value', labelKey: 'solutions.ecommerce.stats.stat1.label' },
    { valueKey: 'solutions.ecommerce.stats.stat2.value', labelKey: 'solutions.ecommerce.stats.stat2.label' },
    { valueKey: 'solutions.ecommerce.stats.stat3.value', labelKey: 'solutions.ecommerce.stats.stat3.label' },
    { valueKey: 'solutions.ecommerce.stats.stat4.value', labelKey: 'solutions.ecommerce.stats.stat4.label' },
  ];

  const howItWorksSteps = [
    { key: 'step1', color: 'from-blue-500 to-cyan-500' },
    { key: 'step2', color: 'from-primary to-blue-500' },
    { key: 'step3', color: 'from-green-500 to-emerald-500' },
  ];

  const highlights = [
    { icon: Lightbulb, key: 'item1', color: 'from-yellow-500 to-orange-500' },
    { icon: Bell, key: 'item2', color: 'from-blue-500 to-primary' },
    { icon: Globe, key: 'item3', color: 'from-emerald-500 to-teal-500' },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <Navigation />

      {/* ═══ Hero ═══ */}
      <section className="pt-28 md:pt-36 pb-16 md:pb-20 relative overflow-hidden">
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/3 w-72 h-72 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 text-sm font-medium mb-6"
            >
              <ShoppingCart className="w-4 h-4" />
              {t('solutions.ecommerce.hero.badge')}
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05 }}
              className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight mb-5 text-gray-900 dark:text-white"
            >
              {t('solutions.ecommerce.hero.title')}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-lg sm:text-xl text-gray-600 dark:text-neutral-400 max-w-2xl mx-auto"
            >
              {t('solutions.ecommerce.hero.subtitle')}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="flex flex-col sm:flex-row gap-3 justify-center mt-8"
            >
              <Link href="/waitlist">
                <Button size="lg" className="rounded-full bg-primary text-white hover:bg-primary/90 px-8">
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
        </div>
      </section>

      {/* ═══ Stats ═══ */}
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
                <div className="text-3xl md:text-4xl font-bold text-blue-600 dark:text-blue-400 mb-1">
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

      {/* ═══ Use Cases ═══ */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-semibold tracking-tight text-gray-900 dark:text-white"
            >
              {t('solutions.ecommerce.useCases.title')}
            </motion.h2>
          </div>
          <div className="grid md:grid-cols-2 gap-5 max-w-5xl mx-auto">
            {useCases.map((useCase, index) => {
              const Icon = useCase.icon;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.08 }}
                >
                  <Card className="p-6 h-full rounded-2xl bg-white dark:bg-neutral-800/80 border-gray-100 dark:border-neutral-700/80 hover:shadow-lg transition-all duration-300 group">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                        <Icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                          {t(useCase.titleKey)}
                        </h3>
                        <p className="text-gray-600 dark:text-neutral-400 text-sm leading-relaxed">
                          {t(useCase.descKey)}
                        </p>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ How It Works ═══ */}
      <section className="py-16 md:py-20 bg-gray-50/70 dark:bg-neutral-900/40">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-semibold tracking-tight text-gray-900 dark:text-white"
            >
              {t('solutions.ecommerce.howItWorks.title')}
            </motion.h2>
            <p className="text-gray-600 dark:text-neutral-400 mt-3 text-lg">
              {t('solutions.ecommerce.howItWorks.subtitle')}
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto relative">
            {/* Connector line */}
            <div className="hidden md:block absolute top-10 left-[16%] right-[16%] h-0.5 bg-gradient-to-r from-blue-200 via-primary/30 to-green-200 dark:from-blue-800 dark:via-primary/20 dark:to-green-800" />

            {howItWorksSteps.map((step, index) => (
              <motion.div
                key={step.key}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.12 }}
                className="text-center relative"
              >
                <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${step.color} flex items-center justify-center mx-auto mb-4 shadow-lg relative z-10`}>
                  <span className="text-2xl font-bold text-white">{index + 1}</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {t(`solutions.ecommerce.howItWorks.${step.key}.title`)}
                </h3>
                <p className="text-sm text-gray-600 dark:text-neutral-400 leading-relaxed max-w-xs mx-auto">
                  {t(`solutions.ecommerce.howItWorks.${step.key}.desc`)}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Integrations ═══ */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-semibold tracking-tight text-gray-900 dark:text-white"
            >
              {t('solutions.ecommerce.integrations.title')}
            </motion.h2>
            <p className="text-gray-600 dark:text-neutral-400 mt-3 text-lg">
              {t('solutions.ecommerce.integrations.subtitle')}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-4 max-w-3xl mx-auto">
            {integrations.map((integration, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: index * 0.08 }}
                className="bg-white dark:bg-neutral-800 rounded-2xl px-8 py-5 shadow-sm border border-gray-100 dark:border-neutral-700 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
              >
                <span className="text-lg font-semibold text-gray-700 dark:text-neutral-300">{integration}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Highlights ═══ */}
      <section className="py-16 md:py-20 bg-gray-50/70 dark:bg-neutral-900/40">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-semibold tracking-tight text-gray-900 dark:text-white"
            >
              {t('solutions.ecommerce.highlights.title')}
            </motion.h2>
            <p className="text-gray-600 dark:text-neutral-400 mt-3 text-lg">
              {t('solutions.ecommerce.highlights.subtitle')}
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {highlights.map((highlight, index) => {
              const Icon = highlight.icon;
              return (
                <motion.div
                  key={highlight.key}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                >
                  <Card className="p-6 md:p-8 h-full rounded-2xl bg-white dark:bg-neutral-800/80 border-gray-100 dark:border-neutral-700/80 hover:shadow-lg transition-all duration-300">
                    <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${highlight.color} flex items-center justify-center mb-5`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      {t(`solutions.ecommerce.highlights.${highlight.key}.title`)}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-neutral-400 leading-relaxed">
                      {t(`solutions.ecommerce.highlights.${highlight.key}.desc`)}
                    </p>
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
          <div className="rounded-3xl p-8 md:p-14 text-center max-w-4xl mx-auto bg-gradient-to-br from-slate-900 to-blue-900 dark:from-neutral-800 dark:to-neutral-800 border border-white/5 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-1/4 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 w-48 h-48 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-4 text-white">
                {t('solutions.ecommerce.cta.title')}
              </h2>
              <p className="text-lg text-blue-100 dark:text-neutral-400 mb-8 max-w-2xl mx-auto">
                {t('solutions.ecommerce.cta.subtitle')}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/waitlist">
                  <Button size="lg" className="w-full sm:w-auto rounded-full bg-white text-slate-900 hover:bg-gray-100 px-8 font-semibold">
                    {t('solutions.startFree')}
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto rounded-full border-white/30 text-white hover:bg-white/10 px-8">
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
