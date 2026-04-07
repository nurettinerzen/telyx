'use client';

import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import Navigation from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  ArrowRight,
  Building2,
  Globe,
  Heart,
  Lightbulb,
  Mail,
  MapPin,
  Rocket,
  Sparkles,
  Target,
  Users,
  Zap,
} from 'lucide-react';

/* ── Animation helpers ── */
const fadeUp = { opacity: 0, y: 24 };
const visible = { opacity: 1, y: 0 };
const transition = { duration: 0.55, ease: [0.22, 1, 0.36, 1] };
const vp = { once: true, margin: '-60px' };

/* ── Mouse-glow tracker ── */
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

/* ── Animated counter ── */
function AnimatedNumber({ value, suffix = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          const start = performance.now();
          const duration = 1400;
          const tick = (now) => {
            const t = Math.min((now - start) / duration, 1);
            const ease = 1 - Math.pow(1 - t, 3);
            el.textContent = Math.round(value * ease) + suffix;
            if (t < 1) frame = requestAnimationFrame(tick);
          };
          frame = requestAnimationFrame(tick);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [value, suffix]);
  return <span ref={ref}>0{suffix}</span>;
}

export default function AboutPage() {
  const { t } = useLanguage();
  const gridRef = useRef(null);
  useMouseGlow(gridRef);

  const team = [
    {
      name: 'Nurettin Erzen',
      titleKey: 'about.team.nurettin.title',
      descKey: 'about.team.nurettin.desc',
      gradient: 'from-[#000ACF] to-[#00C4E6]',
      icon: Rocket,
    },
    {
      name: 'Miraç Öztürk',
      titleKey: 'about.team.mirac.title',
      descKey: 'about.team.mirac.desc',
      gradient: 'from-[#000ACF] to-[#051752]',
      icon: Zap,
    },
    {
      name: 'Davut Pehlivanlı',
      titleKey: 'about.team.davut.title',
      descKey: 'about.team.davut.desc',
      gradient: 'from-[#051752] to-[#006FEB]',
      icon: Globe,
    },
    {
      name: 'Eyüp Yorulmaz',
      titleKey: 'about.team.eyup.title',
      descKey: 'about.team.eyup.desc',
      gradient: 'from-[#006FEB] to-[#00C4E6]',
      icon: Lightbulb,
    },
    {
      name: 'Ramazan Badeli',
      titleKey: 'about.team.ramazan.title',
      descKey: 'about.team.ramazan.desc',
      gradient: 'from-[#000ACF] to-[#00C4E6]',
      icon: Target,
    },
    {
      name: 'Merve Çınar',
      titleKey: 'about.team.merve.title',
      descKey: 'about.team.merve.desc',
      gradient: 'from-[#00C4E6] to-[#006FEB]',
      icon: Heart,
    },
  ];

  const stats = [
    { value: 2023, suffix: '', labelKey: 'about.stats.founded' },
    { value: 15, suffix: '+', labelKey: 'about.stats.experience' },
    { value: 5, suffix: '+', labelKey: 'about.stats.channels' },
    { value: 16, suffix: '', labelKey: 'about.stats.languages' },
  ];

  const values = [
    { icon: Target, titleKey: 'about.values.mission.title', descKey: 'about.values.mission.desc', gradient: 'from-[#000ACF] to-[#00C4E6]' },
    { icon: Lightbulb, titleKey: 'about.values.vision.title', descKey: 'about.values.vision.desc', gradient: 'from-[#051752] to-[#000ACF]' },
    { icon: Heart, titleKey: 'about.values.culture.title', descKey: 'about.values.culture.desc', gradient: 'from-[#051752] to-[#006FEB]' },
  ];

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
                <Building2 className="w-4 h-4" />
                {t('about.hero.badge')}
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
              {t('about.hero.title')}
            </motion.h1>
            <motion.p
              initial={fadeUp}
              whileInView={visible}
              viewport={{ once: true }}
              transition={{ ...transition, delay: 0.12 }}
              className="text-lg sm:text-xl max-w-2xl mx-auto"
              style={{ color: 'var(--ft-text-secondary)' }}
            >
              {t('about.hero.subtitle')}
            </motion.p>
          </div>
        </div>
      </section>

      {/* ═══ Stats Bar ═══ */}
      <section className="py-6">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial={fadeUp}
              whileInView={visible}
              viewport={vp}
              transition={transition}
              className="ft-card"
              style={{ padding: '2rem 2.5rem' }}
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                {stats.map((stat, i) => (
                  <div key={i}>
                    <div className="text-3xl md:text-4xl font-bold" style={{ color: 'var(--ft-accent)' }}>
                      <AnimatedNumber value={stat.value} suffix={stat.suffix} />
                    </div>
                    <p className="text-sm mt-1" style={{ color: 'var(--ft-text-muted)' }}>
                      {t(stat.labelKey)}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══ Our Story ═══ */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <motion.div initial={fadeUp} whileInView={visible} viewport={vp} transition={transition} className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4" style={{ color: 'var(--ft-text-primary)' }}>
                {t('about.story.title')}
              </h2>
            </motion.div>

            <div className="grid md:grid-cols-2 gap-8">
              <motion.div
                initial={fadeUp}
                whileInView={visible}
                viewport={vp}
                transition={{ ...transition, delay: 0.06 }}
                className="ft-card"
                style={{ padding: '2rem' }}
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#000ACF] to-[#00C4E6] flex items-center justify-center mb-4 shadow-lg">
                  <Heart className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3" style={{ color: 'var(--ft-text-primary)' }}>
                  {t('about.story.originTitle')}
                </h3>
                <p className="leading-relaxed" style={{ color: 'var(--ft-text-secondary)' }}>
                  {t('about.story.originContent')}
                </p>
              </motion.div>

              <motion.div
                initial={fadeUp}
                whileInView={visible}
                viewport={vp}
                transition={{ ...transition, delay: 0.12 }}
                className="ft-card"
                style={{ padding: '2rem' }}
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#051752] to-[#000ACF] flex items-center justify-center mb-4 shadow-lg">
                  <MapPin className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3" style={{ color: 'var(--ft-text-primary)' }}>
                  {t('about.story.laTitle')}
                </h3>
                <p className="leading-relaxed" style={{ color: 'var(--ft-text-secondary)' }}>
                  {t('about.story.laContent')}
                </p>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Mission / Vision / Culture ═══ */}
      <section className="py-16 md:py-24" ref={gridRef}>
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <motion.div initial={fadeUp} whileInView={visible} viewport={vp} transition={transition} className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4" style={{ color: 'var(--ft-text-primary)' }}>
                {t('about.values.title')}
              </h2>
              <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--ft-text-secondary)' }}>
                {t('about.values.subtitle')}
              </p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-6">
              {values.map((item, i) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={i}
                    initial={fadeUp}
                    whileInView={visible}
                    viewport={vp}
                    transition={{ ...transition, delay: i * 0.08 }}
                  >
                    <div className="ft-card h-full" style={{ padding: '2rem' }}>
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center mb-4 shadow-lg`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--ft-text-primary)' }}>
                        {t(item.titleKey)}
                      </h3>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--ft-text-secondary)' }}>
                        {t(item.descKey)}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Team ═══ */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <motion.div initial={fadeUp} whileInView={visible} viewport={vp} transition={transition} className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4" style={{ color: 'var(--ft-text-primary)' }}>
                {t('about.team.title')}
              </h2>
              <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--ft-text-secondary)' }}>
                {t('about.team.subtitle')}
              </p>
            </motion.div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {team.map((member, i) => {
                const Icon = member.icon;
                return (
                  <motion.div
                    key={member.name}
                    initial={{ opacity: 0, scale: 0.96 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.35, delay: i * 0.06 }}
                  >
                    <div className="ft-card h-full" style={{ padding: '1.75rem' }}>
                      <div className="flex items-center gap-4 mb-4">
                        <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${member.gradient} flex items-center justify-center shadow-lg flex-shrink-0`}>
                          <Icon className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold" style={{ color: 'var(--ft-text-primary)' }}>
                            {member.name}
                          </h3>
                          <p className="text-sm font-medium" style={{ color: 'var(--ft-accent)' }}>
                            {t(member.titleKey)}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--ft-text-secondary)' }}>
                        {t(member.descKey)}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Company Info ═══ */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial={fadeUp}
              whileInView={visible}
              viewport={vp}
              transition={transition}
              className="ft-deep-card"
              style={{ padding: '2.5rem' }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#000ACF] to-[#00C4E6] flex items-center justify-center shadow-lg">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-2xl font-bold" style={{ color: 'var(--ft-text-primary)' }}>
                  {t('about.companyInfo.title')}
                </h2>
              </div>
              <p className="mb-6 leading-relaxed" style={{ color: 'var(--ft-text-secondary)' }}>
                {t('about.companyInfo.description')}
              </p>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="rounded-xl p-4" style={{ background: 'var(--ft-glass)', border: '1px solid var(--ft-border)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="w-4 h-4" style={{ color: 'var(--ft-accent)' }} />
                    <p className="font-semibold text-sm" style={{ color: 'var(--ft-text-primary)' }}>
                      {t('about.companyInfo.locationLabel')}
                    </p>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--ft-text-secondary)' }}>
                    Los Angeles, California
                  </p>
                </div>
                <div className="rounded-xl p-4" style={{ background: 'var(--ft-glass)', border: '1px solid var(--ft-border)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="w-4 h-4" style={{ color: 'var(--ft-accent)' }} />
                    <p className="font-semibold text-sm" style={{ color: 'var(--ft-text-primary)' }}>
                      {t('about.companyInfo.contactLabel')}
                    </p>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--ft-text-secondary)' }}>
                    info@telyx.ai
                  </p>
                </div>
                <div className="rounded-xl p-4" style={{ background: 'var(--ft-glass)', border: '1px solid var(--ft-border)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Globe className="w-4 h-4" style={{ color: 'var(--ft-accent)' }} />
                    <p className="font-semibold text-sm" style={{ color: 'var(--ft-text-primary)' }}>
                      {t('about.companyInfo.foundedLabel')}
                    </p>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--ft-text-secondary)' }}>
                    2023
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <motion.div initial={fadeUp} whileInView={visible} viewport={vp} transition={transition}>
            <div className="ft-cta text-center max-w-4xl mx-auto">
              <div className="relative z-10">
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-white">
                  {t('about.cta.title')}
                </h2>
                <p className="text-lg text-blue-100 dark:text-neutral-400 mb-8 max-w-2xl mx-auto">
                  {t('about.cta.subtitle')}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link href="/signup">
                    <Button
                      size="lg"
                      className="ft-glow-btn w-full sm:w-auto rounded-full bg-white text-slate-900 hover:bg-gray-100 px-8 font-semibold shadow-lg"
                    >
                      {t('about.cta.button')}
                      <ArrowRight className="w-4 h-4 ml-2" />
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
                      {t('navigation.contact')}
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
