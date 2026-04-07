'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, UtensilsCrossed, Scissors, HeadphonesIcon, Package, Calendar, RotateCcw, HelpCircle } from 'lucide-react';
import { Card } from './ui/card';
import Link from 'next/link';
import { Button } from './ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

export const SectorsSection = () => {
  const { t } = useLanguage();

  const sectors = [
    {
      icon: ShoppingCart,
      titleKey: 'landing.sectors.ecommerce.title',
      features: [
        'landing.sectors.ecommerce.feature1',
        'landing.sectors.ecommerce.feature2',
        'landing.sectors.ecommerce.feature3'
      ],
      href: '/solutions/ecommerce',
      color: 'from-[#000ACF] to-[#00C4E6]'
    },
    {
      icon: UtensilsCrossed,
      titleKey: 'landing.sectors.restaurant.title',
      features: [
        'landing.sectors.restaurant.feature1',
        'landing.sectors.restaurant.feature2'
      ],
      href: '/solutions/restaurant',
      color: 'from-orange-500 to-red-500'
    },
    {
      icon: Scissors,
      titleKey: 'landing.sectors.salon.title',
      features: [
        'landing.sectors.salon.feature1'
      ],
      href: '/solutions/salon',
      color: 'from-[#006FEB] to-[#00C4E6]'
    },
    {
      icon: HeadphonesIcon,
      titleKey: 'landing.sectors.support.title',
      features: [
        'landing.sectors.support.feature1',
        'landing.sectors.support.feature2'
      ],
      href: '/solutions/support',
      color: 'from-[#051752] to-[#006FEB]'
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
            {t('landing.sectors.title')}
          </h2>
          <p className="text-xl text-muted-foreground dark:text-neutral-400 max-w-3xl mx-auto">
            {t('landing.sectors.subtitle')}
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {sectors.map((sector, index) => {
            const Icon = sector.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="p-6 h-full hover:shadow-lg transition-all duration-300 hover:-translate-y-1 bg-card dark:bg-neutral-800 border-border dark:border-neutral-700 flex flex-col">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${sector.color} flex items-center justify-center mb-4`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-medium text-foreground dark:text-white mb-3">
                    {t(sector.titleKey)}
                  </h3>
                  <ul className="space-y-2 mb-4 flex-1">
                    {sector.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start space-x-2 text-sm text-muted-foreground dark:text-neutral-400">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                        <span>{t(feature)}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href={sector.href}>
                    <Button variant="ghost" size="sm" className="w-full justify-start p-0 h-auto text-primary hover:text-primary/80">
                      {t('landing.sectors.learnMore')} &rarr;
                    </Button>
                  </Link>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
