'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Phone, MessageCircle, MessagesSquare, Mail } from 'lucide-react';
import { Card } from './ui/card';
import { useLanguage } from '@/contexts/LanguageContext';

export const ChannelsSection = () => {
  const { t } = useLanguage();

  const channels = [
    {
      icon: Phone,
      titleKey: 'landing.channels.phone.title',
      descKey: 'landing.channels.phone.desc',
      color: 'from-[#000ACF] to-[#00C4E6]'
    },
    {
      icon: MessageCircle,
      titleKey: 'landing.channels.whatsapp.title',
      descKey: 'landing.channels.whatsapp.desc',
      color: 'from-[#051752] to-[#006FEB]'
    },
    {
      icon: MessagesSquare,
      titleKey: 'landing.channels.chat.title',
      descKey: 'landing.channels.chat.desc',
      color: 'from-[#006FEB] to-[#00C4E6]'
    },
    {
      icon: Mail,
      titleKey: 'landing.channels.email.title',
      descKey: 'landing.channels.email.desc',
      color: 'from-orange-500 to-red-500'
    }
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
            {t('landing.channels.title')}
          </h2>
          <p className="text-xl text-muted-foreground dark:text-neutral-400 max-w-3xl mx-auto">
            {t('landing.channels.subtitle')}
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {channels.map((channel, index) => {
            const Icon = channel.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="p-8 h-full hover:shadow-lg transition-all duration-300 hover:-translate-y-1 bg-white dark:bg-neutral-800 border-border dark:border-neutral-700">
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${channel.color} flex items-center justify-center mb-6`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-xl font-medium text-foreground dark:text-white mb-3">
                    {t(channel.titleKey)}
                  </h3>
                  <p className="text-muted-foreground dark:text-neutral-400">
                    {t(channel.descKey)}
                  </p>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
