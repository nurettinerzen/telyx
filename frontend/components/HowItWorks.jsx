'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { UserPlus, Link2, Settings, Sparkles } from 'lucide-react';
import { Card } from './ui/card';
import { useLanguage } from '@/contexts/LanguageContext';

export const HowItWorks = () => {
  const { t } = useLanguage();

  const steps = [
    {
      number: '01',
      icon: UserPlus,
      titleKey: 'landing.howItWorks.step1.title',
      descKey: 'landing.howItWorks.step1.desc'
    },
    {
      number: '02',
      icon: Link2,
      titleKey: 'landing.howItWorks.step2.title',
      descKey: 'landing.howItWorks.step2.desc'
    },
    {
      number: '03',
      icon: Settings,
      titleKey: 'landing.howItWorks.step3.title',
      descKey: 'landing.howItWorks.step3.desc'
    },
    {
      number: '04',
      icon: Sparkles,
      titleKey: 'landing.howItWorks.step4.title',
      descKey: 'landing.howItWorks.step4.desc'
    }
  ];

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 bg-background dark:bg-neutral-950">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl sm:text-5xl font-normal tracking-tight text-foreground dark:text-white mb-4">
            {t('landing.howItWorks.title')}
          </h2>
          <p className="text-xl text-muted-foreground dark:text-neutral-400 max-w-3xl mx-auto">
            {t('landing.howItWorks.subtitle')}
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.15 }}
              >
                <Card className="p-8 h-full bg-card dark:bg-neutral-800 border-border dark:border-neutral-700 hover:border-primary/50 transition-all duration-300 hover:shadow-lg relative overflow-hidden">
                  {/* Step Number Background */}
                  <div className="absolute -top-4 -right-4 text-8xl font-bold text-primary/5 dark:text-primary/10">
                    {step.number}
                  </div>

                  <div className="relative">
                    <div className="w-14 h-14 rounded-xl bg-primary-50 dark:bg-primary-950/50 flex items-center justify-center mb-6">
                      <Icon className="w-7 h-7 text-primary-700 dark:text-primary-300" />
                    </div>

                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-sm font-medium text-primary-700 dark:text-primary-300">{step.number}</span>
                      <h3 className="text-xl font-medium text-foreground dark:text-white">
                        {t(step.titleKey)}
                      </h3>
                    </div>

                    <p className="text-muted-foreground dark:text-neutral-400 leading-relaxed">
                      {t(step.descKey)}
                    </p>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
