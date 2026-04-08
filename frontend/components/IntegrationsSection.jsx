'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { useLanguage } from '@/contexts/LanguageContext';
import { ArrowRight } from 'lucide-react';

export const IntegrationsSection = () => {
  const { t } = useLanguage();

  // Integrations that are actually available in the product
  const integrations = [
    { name: 'WhatsApp Business', icon: '/assets/integrations/whatsapp.svg' },
    { name: 'Gmail', icon: '/assets/integrations/gmail.svg' },
    { name: 'Shopify', icon: '/assets/integrations/shopify.svg' },
    { name: 'ikas', icon: '/assets/integrations/ikas.ico' },
    { name: 'Google Calendar', icon: '/assets/integrations/googlecalendar.svg' },
  ];

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-neutral-900">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl sm:text-5xl font-normal tracking-tight text-foreground dark:text-white mb-4">
            {t('landing.integrations.title')}
          </h2>
          <p className="text-xl text-muted-foreground dark:text-neutral-400 max-w-3xl mx-auto">
            {t('landing.integrations.subtitle')}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 md:gap-6 items-center justify-items-center"
        >
          {integrations.map((integration, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.05 }}
              whileHover={{ scale: 1.05, y: -4 }}
              className="bg-white dark:bg-neutral-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-neutral-700 hover:shadow-lg hover:border-teal-100 dark:hover:border-teal-900 transition-all duration-300 w-full min-h-[96px] flex items-center justify-center group cursor-pointer"
            >
              <div className="flex flex-col items-center justify-center gap-2">
                <Image
                  src={integration.icon}
                  alt={integration.name}
                  width={30}
                  height={30}
                  className="h-[30px] w-[30px]"
                />
                <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-neutral-200 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors text-center">
                  {integration.name}
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-center mt-12"
        >
          <Link
            href="/integrations"
            className="inline-flex items-center gap-2 text-primary-700 dark:text-primary-300 hover:text-primary-600 dark:hover:text-primary-200 font-medium transition-colors group"
          >
            {t('landing.integrations.viewAll')}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
};
