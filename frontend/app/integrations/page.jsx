'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import Navigation from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  CalendarDays,
  Database,
  Mail,
  MessagesSquare,
  Plug,
  ShoppingCart,
  Users2,
} from 'lucide-react';

const STATUS = {
  AVAILABLE: 'available',
  SOON: 'soon',
};

export default function IntegrationsPage() {
  const { t } = useLanguage();

  const categories = [
    {
      id: 'communication',
      titleKey: 'integrationsPage.categories.communication',
      icon: MessagesSquare,
      color: 'from-emerald-500 to-teal-500',
      integrations: [
        { name: 'WhatsApp Business', descKey: 'integrationsPage.whatsapp.desc', status: STATUS.AVAILABLE, cta: '/dashboard/integrations', logo: '/assets/integrations/whatsapp.svg' },
        { name: 'Gmail', descKey: 'integrationsPage.gmail.desc', status: STATUS.AVAILABLE, cta: '/dashboard/integrations', logo: '/assets/integrations/gmail.svg' },
        { name: 'Outlook', descKey: 'integrationsPage.outlook.desc', status: STATUS.AVAILABLE, cta: '/dashboard/integrations', logo: '/assets/integrations/outlook.png' },
      ]
    },
    {
      id: 'ecommerce',
      titleKey: 'integrationsPage.categories.ecommerce',
      icon: ShoppingCart,
      color: 'from-blue-500 to-cyan-500',
      integrations: [
        { name: 'Shopify', descKey: 'integrationsPage.shopify.desc', status: STATUS.AVAILABLE, cta: '/dashboard/integrations', logo: '/assets/integrations/shopify.svg' },
        { name: 'ikas', descKey: 'integrationsPage.ikas.desc', status: STATUS.AVAILABLE, cta: '/dashboard/integrations', logo: '/assets/integrations/ikas.ico' },
        { name: 'Ticimax', descKey: 'integrationsPage.ticimax.desc', status: STATUS.SOON, cta: '/contact', logo: '/assets/integrations/ticimax.svg' },
        { name: 'IdeaSoft', descKey: 'integrationsPage.ideasoft.desc', status: STATUS.SOON, cta: '/contact', logo: '/assets/integrations/ideasoft.svg' },
      ]
    },
    {
      id: 'crm',
      titleKey: 'integrationsPage.categories.crm',
      icon: Users2,
      color: 'from-violet-500 to-blue-500',
      integrations: [
        { name: 'Custom CRM', descKey: 'integrationsPage.customCrm.desc', status: STATUS.AVAILABLE, cta: '/dashboard/integrations/custom-crm', logo: '/assets/integrations/crm.png' },
        { name: 'HubSpot', descKey: 'integrationsPage.hubspot.desc', status: STATUS.SOON, cta: '/contact', logo: '/assets/integrations/hubspot.svg' },
      ]
    },
    {
      id: 'scheduling',
      titleKey: 'integrationsPage.categories.scheduling',
      icon: CalendarDays,
      color: 'from-orange-500 to-red-500',
      integrations: [
        { name: 'Google Calendar', descKey: 'integrationsPage.googleCalendar.desc', status: STATUS.AVAILABLE, cta: '/dashboard/integrations', logo: '/assets/integrations/googlecalendar.svg' },
      ]
    },
    {
      id: 'data',
      titleKey: 'integrationsPage.categories.data',
      icon: Database,
      color: 'from-green-500 to-emerald-500',
      integrations: [
        { name: 'Webhook API', descKey: 'integrationsPage.webhookApi.desc', status: STATUS.AVAILABLE, cta: '/dashboard/integrations', logo: '/assets/integrations/webhook.png' },
        { name: 'Paraşüt', descKey: 'integrationsPage.parasut.desc', status: STATUS.SOON, cta: '/contact', logo: '/assets/integrations/parasut.svg' },
      ]
    },
  ];

  const totalIntegrations = categories.reduce((sum, category) => sum + category.integrations.length, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-teal-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">
      <Navigation />

      <section className="pt-28 md:pt-32 pb-12 md:pb-16">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              className="w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-teal-500 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-6 md:mb-8"
            >
              <Plug className="w-8 h-8 md:w-10 md:h-10 text-white" />
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl sm:text-5xl md:text-6xl font-bold mb-5 text-gray-900 dark:text-white"
            >
              {t('integrationsPage.hero.title')}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-base sm:text-xl text-gray-600 dark:text-gray-300"
            >
              {t('integrationsPage.hero.subtitle')}
            </motion.p>
            <p className="mt-3 text-sm text-gray-500 dark:text-neutral-400">
              {t('integrationsPage.catalogCount', { count: totalIntegrations })}
            </p>
          </div>
        </div>
      </section>

      <section className="py-10 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto space-y-12">
            {categories.map((category, categoryIndex) => {
              const Icon = category.icon;
              return (
                <motion.div
                  key={category.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: categoryIndex * 0.08 }}
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className={`w-11 h-11 bg-gradient-to-br ${category.color} rounded-xl flex items-center justify-center`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
                      {t(category.titleKey)}
                    </h2>
                  </div>

                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
                    {category.integrations.map((integration, index) => {
                      const isAvailable = integration.status === STATUS.AVAILABLE;
                      return (
                        <motion.div
                          key={`${category.id}-${integration.name}`}
                          initial={{ opacity: 0, scale: 0.96 }}
                          whileInView={{ opacity: 1, scale: 1 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.35, delay: index * 0.04 }}
                          className="bg-white dark:bg-neutral-800 rounded-xl p-5 border border-gray-100 dark:border-neutral-700 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col"
                        >
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 relative flex-shrink-0">
                                <Image
                                  src={integration.logo}
                                  alt={integration.name}
                                  width={32}
                                  height={32}
                                  className="object-contain"
                                />
                              </div>
                              <h3 className="text-base font-semibold text-gray-900 dark:text-white leading-snug">
                                {integration.name}
                              </h3>
                            </div>
                            {!isAvailable && (
                              <span className="text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                {t('integrationsPage.status.soon')}
                              </span>
                            )}
                          </div>

                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-5 flex-grow">
                            {t(integration.descKey)}
                          </p>

                          <Link href={integration.cta} className="mt-auto">
                            <Button
                              size="sm"
                              variant={isAvailable ? 'default' : 'outline'}
                              className="w-full"
                            >
                              {isAvailable ? t('integrationsPage.cardCta.available') : t('integrationsPage.cardCta.soon')}
                            </Button>
                          </Link>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="glass rounded-3xl p-8 md:p-12 text-center max-w-4xl mx-auto dark:bg-neutral-800/50 dark:border dark:border-neutral-700">
            <h2 className="text-3xl md:text-4xl font-bold mb-6 text-gray-900 dark:text-white">
              {t('integrationsPage.cta.title')}
            </h2>
            <p className="text-base md:text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
              {t('integrationsPage.cta.subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signup">
                <Button size="lg" className="w-full sm:w-auto bg-gradient-to-r from-teal-600 to-blue-500 hover:from-teal-700 hover:to-blue-600">
                  {t('integrationsPage.cta.button')}
                </Button>
              </Link>
              <Link href="/contact">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  <Mail className="h-4 w-4 mr-2" />
                  {t('integrationsPage.cta.contact')}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
