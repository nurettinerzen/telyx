'use client';

import { useRef, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import Navigation from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  ArrowRight,
  Calendar,
  Clock,
  Sparkles,
  User,
  BookOpen,
} from 'lucide-react';

/* ── Animation helpers ── */
const fadeUp = { opacity: 0, y: 24 };
const visible = { opacity: 1, y: 0 };
const transition = { duration: 0.55, ease: [0.22, 1, 0.36, 1] };
const vp = { once: true, margin: '-60px' };

/* ── Mouse-glow tracker for cards ── */
function useMouseGlow(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleMove = (e) => {
      const cards = el.querySelectorAll('.ft-card');
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

/* ── Blog post data ── */
const blogPosts = [
  {
    slug: 'whatsapp-canli-destek-ai-handoff',
    category: { tr: 'WhatsApp', en: 'WhatsApp' },
    title: {
      tr: 'WhatsApp Desteğinde AI’dan Canlı Temsilciye Geçiş Nasıl Kurgulanır?',
      en: 'How to Design AI-to-Human Handoff in WhatsApp Support',
    },
    excerpt: {
      tr: 'Aynı konuşma içinde AI ile başlayıp gerektiğinde canlı ekibe devreden destek akışının en doğru kurgusunu anlatıyoruz.',
      en: 'We explain the cleanest way to start with AI and hand the same conversation over to a live support team when needed.',
    },
    date: '2026-04-08',
    readTime: { tr: '7 dk', en: '7 min' },
    author: 'Telyx Ekibi',
    color: 'from-[#051752] to-[#00C4E6]',
  },
  {
    slug: 'tahsilat-hatirlatma-otomasyonu',
    category: { tr: 'Operasyon', en: 'Operations' },
    title: {
      tr: 'Tahsilat Hatırlatmalarında Yapay Zeka ile Daha Nazik ve Sistemli Süreçler',
      en: 'Using AI for More Structured and More Polite Payment Reminder Flows',
    },
    excerpt: {
      tr: 'Tahsilat hatırlatmalarını manuel takipten çıkarıp daha düzenli, ölçülebilir ve müşteri dostu hale getirmenin yollarını inceliyoruz.',
      en: 'We explore how to move payment reminders out of manual follow-up and turn them into a measurable, customer-friendly workflow.',
    },
    date: '2026-04-04',
    readTime: { tr: '6 dk', en: '6 min' },
    author: 'Telyx Ekibi',
    color: 'from-[#000ACF] to-[#006FEB]',
  },
  {
    slug: 'cok-kanalli-destek-operasyonlari',
    category: { tr: 'Destek Operasyonları', en: 'Support Operations' },
    title: {
      tr: 'WhatsApp, Webchat ve E-postayı Tek Ekrandan Yönetmek Neden Fark Yaratır?',
      en: 'Why Managing WhatsApp, Webchat, and Email from One Screen Changes Operations',
    },
    excerpt: {
      tr: 'Kanallar ayrı ayrı yönetildiğinde ekipler zaman kaybediyor. Tek bir operasyon ekranının neden daha hızlı ve daha kontrollü çalıştığını anlatıyoruz.',
      en: 'Teams lose time when channels are managed separately. We explain why a unified operations workspace is faster and easier to control.',
    },
    date: '2026-03-27',
    readTime: { tr: '5 dk', en: '5 min' },
    author: 'Telyx Ekibi',
    color: 'from-[#006FEB] to-[#00C4E6]',
  },
  {
    slug: 'ai-musteri-hizmetleri-gelecegi',
    category: { tr: 'AI & Teknoloji', en: 'AI & Technology' },
    title: {
      tr: 'AI ile Müşteri Hizmetlerinin Geleceği: 2026 Trendleri',
      en: 'The Future of Customer Service with AI: 2026 Trends',
    },
    excerpt: {
      tr: 'Yapay zeka destekli müşteri hizmetleri hızla dönüşüyor. İşletmelerin bu değişime nasıl uyum sağlayabileceğini keşfedin.',
      en: 'AI-powered customer service is rapidly transforming. Discover how businesses can adapt to this change.',
    },
    date: '2026-03-15',
    readTime: { tr: '5 dk', en: '5 min' },
    author: 'Telyx Ekibi',
    color: 'from-[#000ACF] to-[#00C4E6]',
  },
  {
    slug: 'whatsapp-business-api-rehberi',
    category: { tr: 'Rehber', en: 'Guide' },
    title: {
      tr: 'WhatsApp Business API: Eksiksiz Başlangıç Rehberi',
      en: 'WhatsApp Business API: Complete Getting Started Guide',
    },
    excerpt: {
      tr: 'WhatsApp Business API nedir, nasıl entegre edilir ve işletmenize nasıl değer katar? Adım adım rehberimizle öğrenin.',
      en: 'What is WhatsApp Business API, how to integrate it, and how does it add value to your business? Learn with our step-by-step guide.',
    },
    date: '2026-03-01',
    readTime: { tr: '8 dk', en: '8 min' },
    author: 'Telyx Ekibi',
    color: 'from-[#051752] to-[#006FEB]',
  },
  {
    slug: 'e-ticaret-chatbot-karsilastirma',
    category: { tr: 'E-ticaret', en: 'E-commerce' },
    title: {
      tr: 'E-ticaret İçin En İyi Chatbot Çözümleri: 2026 Karşılaştırması',
      en: 'Best Chatbot Solutions for E-commerce: 2026 Comparison',
    },
    excerpt: {
      tr: 'E-ticaret siteniz için doğru chatbot çözümünü seçmek kritik. Piyasadaki seçenekleri ve Telyx\'in farkını karşılaştırıyoruz.',
      en: 'Choosing the right chatbot solution for your e-commerce site is critical. We compare market options and what sets Telyx apart.',
    },
    date: '2026-02-15',
    readTime: { tr: '6 dk', en: '6 min' },
    author: 'Telyx Ekibi',
    color: 'from-[#006FEB] to-[#00C4E6]',
  },
];

function formatDate(dateStr, isTR) {
  const date = new Date(dateStr);
  return date.toLocaleDateString(isTR ? 'tr-TR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function BlogPage() {
  const { locale, t } = useLanguage();
  const isTR = locale === 'tr';
  const gridRef = useRef(null);
  useMouseGlow(gridRef);

  return (
    <div className="features-page min-h-screen bg-white dark:bg-neutral-950 overflow-hidden">
      <Navigation />

      {/* ═══ Hero ═══ */}
      <section className="relative pt-28 md:pt-36 pb-16 md:pb-24">
        <div className="ft-glow-blob" style={{ width: 600, height: 600, top: -200, left: '8%', background: '#006FEB' }} />
        <div className="ft-glow-blob" style={{ width: 450, height: 450, top: -40, right: '5%', background: '#00C4E6' }} />

        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-3xl mx-auto">
            <motion.div initial={fadeUp} whileInView={visible} viewport={{ once: true }} transition={{ ...transition, delay: 0 }}>
              <span className="ft-badge-shimmer inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold text-white mb-6">
                <Sparkles className="w-4 h-4" />
                {t('blog.badge')}
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
              {t('blog.heroTitle')}
            </motion.h1>
            <motion.p
              initial={fadeUp}
              whileInView={visible}
              viewport={{ once: true }}
              transition={{ ...transition, delay: 0.12 }}
              className="text-lg sm:text-xl max-w-2xl mx-auto"
              style={{ color: 'var(--ft-text-secondary)' }}
            >
              {t('blog.heroSubtitle')}
            </motion.p>
          </div>
        </div>
      </section>

      {/* ═══ Blog Cards Grid ═══ */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div ref={gridRef} className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {blogPosts.map((post, index) => (
                <motion.div
                  key={post.slug}
                  initial={fadeUp}
                  whileInView={visible}
                  viewport={vp}
                  transition={{ ...transition, delay: index * 0.08 }}
                >
                  <Link href={`/blog/${post.slug}`}>
                    <div className="ft-card ft-card-lg h-full group cursor-pointer">
                      <div className="relative z-10 flex flex-col h-full">
                        {/* Category Tag */}
                        <div className="mb-4">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-semibold text-white bg-gradient-to-r ${post.color}`}
                          >
                            {isTR ? post.category.tr : post.category.en}
                          </span>
                        </div>

                        {/* Title */}
                        <h2
                          className="text-xl font-bold mb-3 group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors duration-200"
                          style={{ color: 'var(--ft-text-primary)' }}
                        >
                          {isTR ? post.title.tr : post.title.en}
                        </h2>

                        {/* Excerpt */}
                        <p
                          className="text-sm leading-relaxed mb-5 flex-1"
                          style={{ color: 'var(--ft-text-secondary)' }}
                        >
                          {isTR ? post.excerpt.tr : post.excerpt.en}
                        </p>

                        {/* Meta */}
                        <div className="flex items-center gap-4 text-xs pt-4" style={{ color: 'var(--ft-text-muted)', borderTop: '1px solid var(--ft-border)' }}>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {formatDate(post.date, isTR)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {isTR ? post.readTime.tr : post.readTime.en}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5" />
                            {post.author}
                          </span>
                        </div>

                        {/* Read more */}
                        <div className="mt-4">
                          <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 dark:text-primary-300">
                            {t('blog.readMore')}
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Newsletter / Waitlist CTA ═══ */}
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
                <div className="mb-6">
                  <BookOpen className="w-12 h-12 text-white/80 mx-auto" />
                </div>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-white">
                  {t('blog.ctaTitle')}
                </h2>
                <p className="text-lg text-blue-100 dark:text-neutral-400 mb-8 max-w-2xl mx-auto">
                  {t('blog.ctaSubtitle')}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link href="/waitlist">
                    <Button
                      size="lg"
                      className="ft-glow-btn w-full sm:w-auto rounded-full bg-white text-slate-900 hover:bg-gray-100 px-8 font-semibold shadow-lg"
                    >
                      {t('blog.ctaJoinList')}
                    </Button>
                  </Link>
                  <Link href="/contact">
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full sm:w-auto rounded-full border-white/30 text-white hover:bg-white/10 px-8 transition-all duration-200"
                      style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'transparent' }}
                    >
                      {t('blog.ctaContact')}
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
