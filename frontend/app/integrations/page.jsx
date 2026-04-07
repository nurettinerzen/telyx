'use client';

import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import Navigation from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  ArrowRight,
  CalendarDays,
  Database,
  Mail,
  MessagesSquare,
  Plug,
  ShoppingCart,
  Sparkles,
  Users2,
} from 'lucide-react';

/* ── Animation helpers ── */
const fadeUp = { opacity: 0, y: 24 };
const visible = { opacity: 1, y: 0 };
const transition = { duration: 0.55, ease: [0.22, 1, 0.36, 1] };
const vp = { once: true, margin: '-60px' };

const STATUS = {
  AVAILABLE: 'available',
  SOON: 'soon',
};

/* ── Mouse-glow tracker for cards ── */
function useMouseGlow(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleMove = (e) => {
      const cards = el.querySelectorAll('.int-card');
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

export default function IntegrationsPage() {
  const { t } = useLanguage();
  const gridRef = useRef(null);
  useMouseGlow(gridRef);

  const categories = [
    {
      id: 'communication',
      titleKey: 'integrationsPage.categories.communication',
      icon: MessagesSquare,
      color: 'from-[#051752] to-[#00C4E6]',
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
      color: 'from-[#000ACF] to-[#00C4E6]',
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
      color: 'from-[#051752] to-[#006FEB]',
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
      color: 'from-[#051752] to-[#006FEB]',
      integrations: [
        { name: 'Webhook API', descKey: 'integrationsPage.webhookApi.desc', status: STATUS.AVAILABLE, cta: '/dashboard/integrations', logo: '/assets/integrations/webhook.png' },
        { name: 'Paraşüt', descKey: 'integrationsPage.parasut.desc', status: STATUS.SOON, cta: '/contact', logo: '/assets/integrations/parasut.svg' },
      ]
    },
  ];

  const totalIntegrations = categories.reduce((sum, category) => sum + category.integrations.length, 0);

  return (
    <div className="integrations-page min-h-screen bg-white dark:bg-neutral-950 overflow-hidden">
      <Navigation />

      {/* ═══ Hero ═══ */}
      <section className="relative pt-28 md:pt-36 pb-16 md:pb-24">
        {/* Glow blobs — GPU-isolated */}
        <div className="int-glow-blob" style={{ width: 600, height: 600, top: -200, left: '8%', background: '#006FEB' }} />
        <div className="int-glow-blob" style={{ width: 450, height: 450, top: -40, right: '5%', background: '#00C4E6' }} />

        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-3xl mx-auto">
            <motion.div initial={fadeUp} whileInView={visible} viewport={{ once: true }} transition={{ ...transition, delay: 0 }}>
              <span className="int-badge-shimmer inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold text-white mb-6">
                <Sparkles className="w-4 h-4" />
                {t('integrationsPage.hero.badge')}
              </span>
            </motion.div>
            <motion.h1
              initial={fadeUp}
              whileInView={visible}
              viewport={{ once: true }}
              transition={{ ...transition, delay: 0.06 }}
              className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-5"
              style={{ color: 'var(--int-text-primary)' }}
            >
              {t('integrationsPage.hero.title')}
            </motion.h1>
            <motion.p
              initial={fadeUp}
              whileInView={visible}
              viewport={{ once: true }}
              transition={{ ...transition, delay: 0.12 }}
              className="text-lg sm:text-xl max-w-2xl mx-auto"
              style={{ color: 'var(--int-text-secondary)' }}
            >
              {t('integrationsPage.hero.subtitle')}
            </motion.p>
            <motion.p
              initial={fadeUp}
              whileInView={visible}
              viewport={{ once: true }}
              transition={{ ...transition, delay: 0.18 }}
              className="mt-3 text-sm"
              style={{ color: 'var(--int-text-muted)' }}
            >
              {t('integrationsPage.catalogCount', { count: totalIntegrations })}
            </motion.p>
          </div>
        </div>
      </section>

      {/* ═══ Integration Cards — Glassmorphic Grid with Mouse-Tracking Glow ═══ */}
      <section className="py-10 md:py-20" ref={gridRef}>
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto space-y-16">
            {categories.map((category, categoryIndex) => {
              const CatIcon = category.icon;
              return (
                <motion.div
                  key={category.id}
                  initial={fadeUp}
                  whileInView={visible}
                  viewport={vp}
                  transition={{ ...transition, delay: categoryIndex * 0.06 }}
                >
                  {/* Category Header */}
                  <div className="int-category-badge">
                    <div className={`int-cat-icon bg-gradient-to-br ${category.color}`}>
                      <CatIcon className="w-5 h-5 text-white" />
                    </div>
                    <h2
                      className="text-xl md:text-2xl font-bold"
                      style={{ color: 'var(--int-text-primary)' }}
                    >
                      {t(category.titleKey)}
                    </h2>
                  </div>

                  {/* Integration Cards Grid */}
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {category.integrations.map((integration, index) => {
                      const isAvailable = integration.status === STATUS.AVAILABLE;
                      return (
                        <motion.div
                          key={`${category.id}-${integration.name}`}
                          initial={{ opacity: 0, scale: 0.96 }}
                          whileInView={{ opacity: 1, scale: 1 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.35, delay: index * 0.05 }}
                        >
                          <div className="int-card h-full">
                            <div className="relative z-10 flex flex-col h-full">
                              {/* Top: Logo + Name + Status */}
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 relative flex-shrink-0">
                                    <Image
                                      src={integration.logo}
                                      alt={integration.name}
                                      width={40}
                                      height={40}
                                      className="object-contain"
                                    />
                                  </div>
                                  <h3
                                    className="text-base font-semibold leading-snug"
                                    style={{ color: 'var(--int-text-primary)' }}
                                  >
                                    {integration.name}
                                  </h3>
                                </div>
                                {/* Status Badge */}
                                <div className="flex items-center gap-1.5 flex-shrink-0 mt-1">
                                  <span
                                    className={`int-status-dot ${isAvailable ? 'int-status-dot--active' : 'int-status-dot--soon'}`}
                                  />
                                  <span
                                    className="text-xs font-medium"
                                    style={{ color: isAvailable ? '#22c55e' : '#f59e0b' }}
                                  >
                                    {isAvailable
                                      ? t('integrationsPage.status.available')
                                      : t('integrationsPage.status.soon')}
                                  </span>
                                </div>
                              </div>

                              {/* Description */}
                              <p
                                className="text-sm leading-relaxed mb-5 flex-grow"
                                style={{ color: 'var(--int-text-secondary)' }}
                              >
                                {t(integration.descKey)}
                              </p>

                              {/* CTA Button */}
                              <Link href={integration.cta} className="mt-auto">
                                {isAvailable ? (
                                  <Button
                                    size="sm"
                                    className="w-full rounded-full bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/15"
                                  >
                                    {t('integrationsPage.cardCta.available')}
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full rounded-full hover:bg-primary hover:text-white hover:border-primary hover:shadow-lg hover:shadow-primary/15 transition-all duration-200"
                                  >
                                    {t('integrationsPage.cardCta.soon')}
                                  </Button>
                                )}
                              </Link>
                            </div>
                          </div>
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

      {/* ═══ Integration Request — Shimmer Card ═══ */}
      <section className="py-10 md:py-16">
        <div className="container mx-auto px-4">
          <motion.div
            initial={fadeUp}
            whileInView={visible}
            viewport={vp}
            transition={transition}
            className="max-w-2xl mx-auto"
          >
            <div className="int-request-card text-center">
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#051752] via-[#000ACF] to-[#00C4E6] flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <Plug className="w-6 h-6 text-white" />
                </div>
                <h3
                  className="text-xl font-bold mb-2"
                  style={{ color: 'var(--int-text-primary)' }}
                >
                  {t('integrationsPage.request.title')}
                </h3>
                <p
                  className="text-sm leading-relaxed mb-5 max-w-md mx-auto"
                  style={{ color: 'var(--int-text-secondary)' }}
                >
                  {t('integrationsPage.request.desc')}
                </p>
                <Link href="/contact">
                  <Button
                    variant="outline"
                    className="rounded-full hover:bg-primary hover:text-white hover:border-primary hover:shadow-lg hover:shadow-primary/15 transition-all duration-200"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    {t('integrationsPage.request.button')}
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
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
            <div className="int-cta text-center max-w-4xl mx-auto">
              <div className="relative z-10">
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-white">
                  {t('integrationsPage.cta.title')}
                </h2>
                <p className="text-lg text-blue-100 dark:text-neutral-400 mb-8 max-w-2xl mx-auto">
                  {t('integrationsPage.cta.subtitle')}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link href="/signup">
                    <Button
                      size="lg"
                      className="int-glow-btn w-full sm:w-auto rounded-full bg-white text-slate-900 hover:bg-gray-100 px-8 font-semibold shadow-lg"
                    >
                      {t('integrationsPage.cta.button')}
                    </Button>
                  </Link>
                  <Link href="/contact">
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full sm:w-auto rounded-full border-white/30 text-white hover:bg-white/10 px-8 transition-all duration-200"
                      style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'transparent' }}
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      {t('integrationsPage.cta.contact')}
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
