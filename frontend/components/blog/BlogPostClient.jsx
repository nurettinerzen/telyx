'use client';

import { useRef, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import Navigation from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Clock,
  Sparkles,
  User,
} from 'lucide-react';

const fadeUp = { opacity: 0, y: 24 };
const visible = { opacity: 1, y: 0 };
const transition = { duration: 0.55, ease: [0.22, 1, 0.36, 1] };
const vp = { once: true, margin: '-60px' };

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

function formatDate(dateStr, isTR) {
  const date = new Date(dateStr);
  return date.toLocaleDateString(isTR ? 'tr-TR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function BlogPostClient({ post, relatedPosts }) {
  const { locale, t } = useLanguage();
  const isTR = locale === 'tr';
  const relatedRef = useRef(null);
  useMouseGlow(relatedRef);

  const content = isTR ? post.content.tr : post.content.en;

  return (
    <div className="features-page min-h-screen bg-white dark:bg-neutral-950 overflow-hidden">
      <Navigation />

      <section className="relative pt-28 md:pt-36 pb-16 md:pb-24">
        <div className="ft-glow-blob" style={{ width: 600, height: 600, top: -200, left: '8%', background: '#006FEB' }} />
        <div className="ft-glow-blob" style={{ width: 450, height: 450, top: -40, right: '5%', background: '#00C4E6' }} />

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl mx-auto">
            <motion.div initial={fadeUp} whileInView={visible} viewport={{ once: true }} transition={{ ...transition, delay: 0 }}>
              <Link
                href="/blog"
                className="inline-flex items-center gap-2 text-sm font-medium mb-8 hover:text-primary-700 dark:hover:text-primary-300 transition-colors duration-200"
                style={{ color: 'var(--ft-text-soft)' }}
              >
                <ArrowLeft className="w-4 h-4" />
                {t('blog.allPosts')}
              </Link>
            </motion.div>

            <motion.div initial={fadeUp} whileInView={visible} viewport={{ once: true }} transition={{ ...transition, delay: 0.04 }}>
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold text-white bg-gradient-to-r ${post.color} mb-5`}>
                {isTR ? post.category.tr : post.category.en}
              </span>
            </motion.div>

            <motion.h1
              initial={fadeUp}
              whileInView={visible}
              viewport={{ once: true }}
              transition={{ ...transition, delay: 0.08 }}
              className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-6"
              style={{ color: 'var(--ft-text-primary)' }}
            >
              {isTR ? post.title.tr : post.title.en}
            </motion.h1>

            <motion.div
              initial={fadeUp}
              whileInView={visible}
              viewport={{ once: true }}
              transition={{ ...transition, delay: 0.12 }}
              className="flex flex-wrap items-center gap-5 text-sm"
              style={{ color: 'var(--ft-text-soft)' }}
            >
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {formatDate(post.date, isTR)}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {isTR ? post.readTime.tr : post.readTime.en}
              </span>
              <span className="flex items-center gap-1.5">
                <User className="w-4 h-4" />
                {post.author}
              </span>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="pb-16 md:pb-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial={fadeUp}
            whileInView={visible}
            viewport={vp}
            transition={transition}
            className="max-w-3xl mx-auto"
          >
            <div className="ft-card" style={{ padding: '40px 32px' }}>
              <div className="relative z-10 prose-container">
                {content.map((block, i) => {
                  if (block.type === 'heading') {
                    return (
                      <h2
                        key={i}
                        className="text-xl md:text-2xl font-bold mt-8 mb-4"
                        style={{ color: 'var(--ft-text-primary)' }}
                      >
                        {block.text}
                      </h2>
                    );
                  }
                  return (
                    <p
                      key={i}
                      className="text-base leading-relaxed mb-5"
                      style={{ color: 'var(--ft-text-secondary)' }}
                    >
                      {block.text}
                    </p>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <motion.h2
              initial={fadeUp}
              whileInView={visible}
              viewport={vp}
              transition={transition}
              className="text-2xl md:text-3xl font-bold tracking-tight mb-8 text-center"
              style={{ color: 'var(--ft-text-primary)' }}
            >
              {t('blog.relatedPosts')}
            </motion.h2>

            <div ref={relatedRef} className="grid md:grid-cols-2 gap-6">
              {relatedPosts.map(({ slug: relSlug, post: relPost }, index) => (
                <motion.div
                  key={relSlug}
                  initial={fadeUp}
                  whileInView={visible}
                  viewport={vp}
                  transition={{ ...transition, delay: index * 0.08 }}
                >
                  <Link href={`/blog/${relSlug}`}>
                    <div className="ft-card ft-card-sm h-full group cursor-pointer">
                      <div className="relative z-10">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold text-white bg-gradient-to-r ${relPost.color} mb-3`}>
                          {isTR ? relPost.category.tr : relPost.category.en}
                        </span>
                        <h3
                          className="text-lg font-bold mb-2 group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors duration-200"
                          style={{ color: 'var(--ft-text-primary)' }}
                        >
                          {isTR ? relPost.title.tr : relPost.title.en}
                        </h3>
                        <p
                          className="text-sm leading-relaxed mb-3"
                          style={{ color: 'var(--ft-text-secondary)' }}
                        >
                          {isTR ? relPost.excerpt.tr : relPost.excerpt.en}
                        </p>
                        <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--ft-text-soft)' }}>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {formatDate(relPost.date, isTR)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {isTR ? relPost.readTime.tr : relPost.readTime.en}
                          </span>
                        </div>
                        <span className="inline-flex items-center gap-1 mt-3 text-sm font-semibold text-primary-700 dark:text-primary-300">
                          {t('blog.readMore')}
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
                        </span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <motion.div initial={fadeUp} whileInView={visible} viewport={vp} transition={transition}>
            <div className="ft-cta text-center max-w-4xl mx-auto">
              <div className="relative z-10">
                <div className="mb-6">
                  <Sparkles className="w-12 h-12 text-white/80 mx-auto" />
                </div>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-white">
                  {t('blog.postCtaTitle')}
                </h2>
                <p className="text-lg text-blue-100 dark:text-neutral-400 mb-8 max-w-2xl mx-auto">
                  {t('blog.postCtaSubtitle')}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link href="/signup">
                    <Button
                      size="lg"
                      className="ft-glow-btn w-full sm:w-auto rounded-full bg-white text-slate-900 hover:bg-gray-100 px-8 font-semibold shadow-lg"
                    >
                      {t('blog.postCtaApply')}
                    </Button>
                  </Link>
                  <Link href="/contact">
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full sm:w-auto rounded-full border-white/30 text-white hover:bg-white/10 px-8 transition-all duration-200"
                      style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'transparent' }}
                    >
                      {t('blog.postCtaContact')}
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
