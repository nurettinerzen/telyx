'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import Navigation from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  ChevronDown,
  HelpCircle,
  Mail,
  Sparkles,
  Rocket,
  BookOpen,
  Link2,
  PlayCircle,
  Shield,
  CreditCard,
  Layers,
  ArrowRight,
} from 'lucide-react';

/* -- Animation helpers (matches changelog pattern) -- */
const fadeUp = { opacity: 0, y: 24 };
const visible = { opacity: 1, y: 0 };
const transition = { duration: 0.55, ease: [0.22, 1, 0.36, 1] };
const vp = { once: true, margin: '-60px' };

/* -- Quick Start steps data -- */
const quickStartSteps = [
  {
    icon: Rocket,
    color: 'from-[#000ACF] to-[#00C4E6]',
    titleTR: 'Asistan Olustur',
    titleEN: 'Create Assistant',
    descTR: '10 dakikada ilk asistanınızı oluşturun',
    descEN: 'Create your first assistant in 10 minutes',
  },
  {
    icon: BookOpen,
    color: 'from-[#051752] to-[#006FEB]',
    titleTR: 'Bilgi Tabanı Ekle',
    titleEN: 'Add Knowledge Base',
    descTR: 'Dokümanlarınızı yükleyin, AI öğrensin',
    descEN: 'Upload your documents and let AI learn',
  },
  {
    icon: Link2,
    color: 'from-[#000ACF] to-[#051752]',
    titleTR: 'Kanalları Bağla',
    titleEN: 'Connect Channels',
    descTR: 'WhatsApp, email, web chat entegre edin',
    descEN: 'Integrate WhatsApp, email, web chat',
  },
  {
    icon: PlayCircle,
    color: 'from-[#006FEB] to-[#00C4E6]',
    titleTR: 'Yayına Alın',
    titleEN: 'Go Live',
    descTR: 'Müşterilerinize hizmet vermeye başlayın',
    descEN: 'Start serving your customers',
  },
];

/* -- Popular Topics data -- */
const popularTopics = [
  {
    icon: Link2,
    titleTR: 'Entegrasyonlar',
    titleEN: 'Integrations',
    descTR: 'E-ticaret, CRM ve kanal entegrasyonları',
    descEN: 'E-commerce, CRM and channel integrations',
    href: '/integrations',
  },
  {
    icon: Shield,
    titleTR: 'Güvenlik & Uyumluluk',
    titleEN: 'Security & Compliance',
    descTR: 'Veri güvenliği, KVKK ve GDPR uyumluluğu',
    descEN: 'Data security, KVKK and GDPR compliance',
    href: '/security',
  },
  {
    icon: CreditCard,
    titleTR: 'Fiyatlandırma',
    titleEN: 'Pricing',
    descTR: 'Planlar, özellikler ve fiyat karşılaştırması',
    descEN: 'Plans, features and price comparison',
    href: '/pricing',
  },
  {
    icon: Layers,
    titleTR: 'Özellikler',
    titleEN: 'Features',
    descTR: 'Tüm platform özellikleri ve yetenekleri',
    descEN: 'All platform features and capabilities',
    href: '/features',
  },
];

export default function HelpPage() {
  const { locale, t } = useLanguage();
  const isTR = locale === 'tr';
  const [openIndex, setOpenIndex] = useState(null);

  const faqs = [
    { questionKey: 'help.faq.q1', answerKey: 'help.faq.a1' },
    { questionKey: 'help.faq.q2', answerKey: 'help.faq.a2' },
    { questionKey: 'help.faq.q3', answerKey: 'help.faq.a3' },
    { questionKey: 'help.faq.q4', answerKey: 'help.faq.a4' },
    { questionKey: 'help.faq.q5', answerKey: 'help.faq.a5' },
    { questionKey: 'help.faq.q6', answerKey: 'help.faq.a6' },
    { questionKey: 'help.faq.q7', answerKey: 'help.faq.a7' },
    { questionKey: 'help.faq.q8', answerKey: 'help.faq.a8' },
    { questionKey: 'help.faq.q9', answerKey: 'help.faq.a9' },
  ];

  const toggleFaq = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="features-page min-h-screen bg-white dark:bg-neutral-950 overflow-hidden">
      <Navigation />

      {/* ═══ Hero ═══ */}
      <section className="relative pt-28 md:pt-36 pb-16 md:pb-24">
        {/* Glow blobs */}
        <div className="ft-glow-blob" style={{ width: 600, height: 600, top: -200, left: '8%', background: '#006FEB' }} />
        <div className="ft-glow-blob" style={{ width: 450, height: 450, top: -40, right: '5%', background: '#00C4E6' }} />

        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-3xl mx-auto">
            <motion.div initial={fadeUp} whileInView={visible} viewport={{ once: true }} transition={{ ...transition, delay: 0 }}>
              <span className="ft-badge-shimmer inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold text-white mb-6">
                <HelpCircle className="w-4 h-4" />
                {t('help.badge')}
              </span>
            </motion.div>
            <motion.h1
              initial={fadeUp}
              whileInView={visible}
              viewport={{ once: true }}
              transition={{ ...transition, delay: 0.06 }}
              className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-5"
              style={{ color: 'var(--ft-text-primary)' }}
            >
              {t('help.hero.title')}
            </motion.h1>
            <motion.p
              initial={fadeUp}
              whileInView={visible}
              viewport={{ once: true }}
              transition={{ ...transition, delay: 0.12 }}
              className="text-lg sm:text-xl max-w-2xl mx-auto"
              style={{ color: 'var(--ft-text-secondary)' }}
            >
              {t('help.hero.subtitle')}
            </motion.p>
          </div>
        </div>
      </section>

      {/* ═══ Quick Start ═══ */}
      <section className="py-12 md:py-20">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <motion.h2
              initial={fadeUp}
              whileInView={visible}
              viewport={vp}
              transition={transition}
              className="text-3xl md:text-4xl font-bold tracking-tight mb-4"
              style={{ color: 'var(--ft-text-primary)' }}
            >
              {t('help.quickStartTitle')}
            </motion.h2>
            <motion.p
              initial={fadeUp}
              whileInView={visible}
              viewport={vp}
              transition={{ ...transition, delay: 0.06 }}
              style={{ color: 'var(--ft-text-secondary)' }}
              className="text-lg"
            >
              {t('help.quickStartSubtitle')}
            </motion.p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {quickStartSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={index}
                  initial={fadeUp}
                  whileInView={visible}
                  viewport={vp}
                  transition={{ ...transition, delay: index * 0.08 }}
                  className="ft-card ft-card-sm text-center"
                >
                  <div className="relative z-10">
                    <div className="ft-step-number mx-auto">{index + 1}</div>
                    <div className={`ft-icon bg-gradient-to-br ${step.color} mx-auto`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <h3
                      className="text-lg font-bold mb-2"
                      style={{ color: 'var(--ft-text-primary)' }}
                    >
                      {isTR ? step.titleTR : step.titleEN}
                    </h3>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: 'var(--ft-text-secondary)' }}
                    >
                      {isTR ? step.descTR : step.descEN}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section className="py-12 md:py-20">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <motion.h2
              initial={fadeUp}
              whileInView={visible}
              viewport={vp}
              transition={transition}
              className="text-3xl md:text-4xl font-bold tracking-tight mb-4"
              style={{ color: 'var(--ft-text-primary)' }}
            >
              {t('help.faqTitle')}
            </motion.h2>
            <motion.p
              initial={fadeUp}
              whileInView={visible}
              viewport={vp}
              transition={{ ...transition, delay: 0.06 }}
              style={{ color: 'var(--ft-text-secondary)' }}
              className="text-lg"
            >
              {t('help.faqSubtitle')}
            </motion.p>
          </div>

          <div className="max-w-3xl mx-auto space-y-4">
            {faqs.map((faq, index) => (
              <motion.div
                key={index}
                initial={fadeUp}
                whileInView={visible}
                viewport={vp}
                transition={{ ...transition, delay: index * 0.04 }}
              >
                <div
                  className="rounded-2xl border backdrop-blur-xl overflow-hidden transition-all duration-300"
                  style={{
                    background: 'var(--ft-card-bg)',
                    borderColor: 'var(--ft-border)',
                  }}
                >
                  <button
                    onClick={() => toggleFaq(index)}
                    className="w-full px-6 py-5 text-left flex items-center justify-between transition-colors"
                    style={{ color: 'var(--ft-text-primary)' }}
                  >
                    <span className="font-semibold pr-4">{t(faq.questionKey)}</span>
                    <ChevronDown
                      className={`w-5 h-5 flex-shrink-0 transition-transform duration-300 ${
                        openIndex === index ? 'rotate-180' : ''
                      }`}
                      style={{ color: 'var(--ft-text-muted)' }}
                    />
                  </button>
                  <AnimatePresence>
                    {openIndex === index && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <div
                          className="px-6 pb-5 pt-4 text-sm leading-relaxed"
                          style={{
                            color: 'var(--ft-text-secondary)',
                            borderTop: '1px solid var(--ft-border)',
                          }}
                        >
                          {t(faq.answerKey)}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Popular Topics ═══ */}
      <section className="py-12 md:py-20">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <motion.h2
              initial={fadeUp}
              whileInView={visible}
              viewport={vp}
              transition={transition}
              className="text-3xl md:text-4xl font-bold tracking-tight mb-4"
              style={{ color: 'var(--ft-text-primary)' }}
            >
              {t('help.topicsTitle')}
            </motion.h2>
            <motion.p
              initial={fadeUp}
              whileInView={visible}
              viewport={vp}
              transition={{ ...transition, delay: 0.06 }}
              style={{ color: 'var(--ft-text-secondary)' }}
              className="text-lg"
            >
              {t('help.topicsSubtitle')}
            </motion.p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {popularTopics.map((topic, index) => {
              const Icon = topic.icon;
              return (
                <motion.div
                  key={index}
                  initial={fadeUp}
                  whileInView={visible}
                  viewport={vp}
                  transition={{ ...transition, delay: index * 0.08 }}
                >
                  <Link href={topic.href} className="block">
                    <div className="ft-card ft-card-sm group cursor-pointer">
                      <div className="relative z-10">
                        <div className="ft-icon bg-gradient-to-br from-[var(--ft-accent)] to-[var(--ft-accent-light)]">
                          <Icon className="w-5 h-5 text-white" />
                        </div>
                        <h3
                          className="text-lg font-bold mb-2"
                          style={{ color: 'var(--ft-text-primary)' }}
                        >
                          {isTR ? topic.titleTR : topic.titleEN}
                        </h3>
                        <p
                          className="text-sm leading-relaxed mb-3"
                          style={{ color: 'var(--ft-text-secondary)' }}
                        >
                          {isTR ? topic.descTR : topic.descEN}
                        </p>
                        <span
                          className="inline-flex items-center gap-1 text-sm font-medium transition-all duration-200 group-hover:gap-2"
                          style={{ color: 'var(--ft-accent)' }}
                        >
                          {t('help.topicExplore')}
                          <ArrowRight className="w-4 h-4" />
                        </span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ CTA / Contact ═══ */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial={fadeUp}
            whileInView={visible}
            viewport={vp}
            transition={transition}
          >
            <div className="ft-cta text-center max-w-4xl mx-auto">
              <div className="relative z-10">
                <div className="w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Mail className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-white">
                  {t('help.contact.title')}
                </h2>
                <p className="text-lg text-blue-100 dark:text-neutral-400 mb-8 max-w-2xl mx-auto">
                  {t('help.contact.text')}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <a href="mailto:info@telyx.ai">
                    <Button
                      size="lg"
                      className="ft-glow-btn w-full sm:w-auto rounded-full bg-white text-slate-900 hover:bg-gray-100 px-8 font-semibold shadow-lg"
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      info@telyx.ai
                    </Button>
                  </a>
                  <Link href="/contact">
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full sm:w-auto rounded-full border-white/30 text-white hover:bg-white/10 px-8 transition-all duration-200"
                    >
                      {t('help.contact.formButton')}
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
