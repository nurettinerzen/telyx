'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button } from './ui/button';
import { DotMorphCanvas } from './DotMorphCanvas';
import { useLanguage } from '@/contexts/LanguageContext';

export const CTASection = () => {
  const { t } = useLanguage();

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 bg-white dark:bg-neutral-950">
      <div className="max-w-[1280px] mx-auto grid md:grid-cols-2 gap-8">
        {/* Card 1 - Business */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <DotMorphCanvas
            shapeType="star"
            className="rounded-2xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          >
            <div className="p-12 sm:p-16 text-center">
              <span className="relative z-10 inline-block px-4 py-1.5 rounded-full border border-gray-200 dark:border-neutral-700 text-sm text-muted-foreground mb-5">
                {t('landing.cta.subtitle')}
              </span>
              <h3 className="relative z-10 text-2xl sm:text-3xl font-normal tracking-tight text-foreground dark:text-white mb-2">
                {t('landing.cta.title')}
              </h3>
              <p className="relative z-10 text-muted-foreground mb-8">{t('landing.cta.applyEarlyAccess')}</p>
              <Link href="/signup">
                <Button variant="pill" size="lg" className="relative z-10 px-8 py-6 text-base">
                  {t('landing.cta.applyEarlyAccess')}
                </Button>
              </Link>
            </div>
          </DotMorphCanvas>
        </motion.div>

        {/* Card 2 - Enterprise */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <DotMorphCanvas
            shapeType="building"
            className="rounded-2xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          >
            <div className="p-12 sm:p-16 text-center">
              <span className="relative z-10 inline-block px-4 py-1.5 rounded-full border border-gray-200 dark:border-neutral-700 text-sm text-muted-foreground mb-5">
                {t('pricing.enterprise.name')}
              </span>
              <h3 className="relative z-10 text-2xl sm:text-3xl font-normal tracking-tight text-foreground dark:text-white mb-2">
                {t('landing.cta.talkToSales')}
              </h3>
              <p className="relative z-10 text-muted-foreground mb-8">{t('pricing.enterprise.desc')}</p>
              <Link href="/contact">
                <Button variant="outline" size="lg" className="relative z-10 rounded-full px-8 py-6 text-base border-gray-300 dark:border-neutral-600">
                  {t('landing.cta.talkToSales')}
                </Button>
              </Link>
            </div>
          </DotMorphCanvas>
        </motion.div>
      </div>
    </section>
  );
};
