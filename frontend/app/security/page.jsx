'use client';

import { useRef, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import Navigation from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Shield,
  Lock,
  ShieldCheck,
  Eye,
  Server,
  FileCheck,
  Bot,
  Activity,
  Database,
  Clock,
  BarChart3,
  Zap,
  Globe,
  Key,
  UserCheck,
  AlertTriangle,
  Check,
  Sparkles,
  ArrowRight,
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

export default function SecurityPage() {
  const { locale, t } = useLanguage();
  const isTR = locale === 'tr';
  const gridRef = useRef(null);
  useMouseGlow(gridRef);

  /* ── Section A: Veri Güvenliği ── */
  const dataSecurityCards = [
    {
      id: 'encryption',
      icon: Lock,
      color: 'from-[#000ACF] to-[#00C4E6]',
      title: isTR ? 'Uçtan Uca Şifreleme' : 'End-to-End Encryption',
      desc: isTR
        ? 'AES-256 şifreleme standardı ile verileriniz hem aktarım sırasında (TLS 1.3) hem de depolama halinde şifrelenir. Üçüncü taraflar verilerinize erişemez.'
        : 'Your data is encrypted both in transit (TLS 1.3) and at rest using AES-256 encryption standard. Third parties cannot access your data.',
    },
    {
      id: 'access',
      icon: UserCheck,
      color: 'from-[#051752] to-[#006FEB]',
      title: isTR ? 'Erişim Kontrolü' : 'Access Control',
      desc: isTR
        ? 'Rol bazlı yetkilendirme (RBAC), çok faktörlü kimlik doğrulama (MFA) desteği ve gelişmiş oturum yönetimi ile yetkisiz erişimi önleyin.'
        : 'Prevent unauthorized access with role-based access control (RBAC), multi-factor authentication (MFA) support, and advanced session management.',
    },
    {
      id: 'infrastructure',
      icon: Server,
      color: 'from-[#000ACF] to-[#051752]',
      title: isTR ? 'Altyapı Güvenliği' : 'Infrastructure Security',
      desc: isTR
        ? 'Bulut altyapısı üzerinde çalışan sistemimiz otomatik yedekleme, DDoS koruması ve izole ağ mimarisi ile korunmaktadır.'
        : 'Our cloud infrastructure is protected with automatic backups, DDoS protection, and isolated network architecture.',
    },
  ];

  /* ── Section B: Yasal Uyumluluk ── */
  const complianceCards = [
    {
      id: 'kvkk',
      icon: FileCheck,
      color: 'from-[#051752] to-[#000ACF]',
      title: isTR ? 'KVKK Uyumluluğu' : 'KVKK Compliance',
      desc: isTR
        ? 'Kişisel Verilerin Korunması Kanunu\'na tam uyum sağlıyoruz.'
        : 'Full compliance with Turkey\'s Personal Data Protection Law (KVKK).',
      items: isTR
        ? [
            'Veri işleme sözleşmesi (VİS)',
            'Açık rıza yönetimi',
            'Veri saklama ve silme politikaları',
            'Veri sorumlusu / veri işleyen ayrımı',
            'VERBİS kaydı ve bildirim süreçleri',
          ]
        : [
            'Data processing agreement',
            'Explicit consent management',
            'Data retention and deletion policies',
            'Data controller / processor separation',
            'VERBIS registration and notification processes',
          ],
    },
    {
      id: 'gdpr',
      icon: Globe,
      color: 'from-[#006FEB] to-[#00C4E6]',
      title: isTR ? 'GDPR Uyumluluğu' : 'GDPR Compliance',
      desc: isTR
        ? 'Avrupa Birliği Genel Veri Koruma Yönetmeliği\'ne uyum sağlıyoruz.'
        : 'Compliance with the European Union General Data Protection Regulation.',
      items: isTR
        ? [
            'Veri taşınabilirliği hakkı',
            'Unutulma hakkı (silme talebi)',
            'DPA (Data Processing Agreement)',
            'Veri ihlali bildirim süreci (72 saat)',
            'Veri minimizasyonu ilkesi',
          ]
        : [
            'Right to data portability',
            'Right to be forgotten (deletion request)',
            'DPA (Data Processing Agreement)',
            'Data breach notification process (72 hours)',
            'Data minimization principle',
          ],
    },
  ];

  /* ── Section C: AI Güvenliği ── */
  const aiSecurityItems = [
    {
      icon: Database,
      title: isTR ? 'AI Modeli Veri İzolasyonu' : 'AI Model Data Isolation',
      desc: isTR
        ? 'Müşteri verileri AI model eğitiminde kullanılmaz. Verileriniz yalnızca sizin asistanınız için kullanılır ve üçüncü taraf modellerle paylaşılmaz.'
        : 'Customer data is never used for AI model training. Your data is only used for your assistant and is never shared with third-party models.',
    },
    {
      icon: ShieldCheck,
      title: isTR ? 'Guardrail Sistemi' : 'Guardrail System',
      desc: isTR
        ? 'AI yanıtları çoklu güvenlik katmanından geçer. Her yanıt politika kontrolü, içerik filtreleme ve doğrulama aşamalarından geçirilerek kullanıcıya iletilir.'
        : 'AI responses pass through multiple security layers. Every response is delivered after policy checks, content filtering, and validation stages.',
    },
    {
      icon: Eye,
      title: isTR ? 'Hassas Veri Maskeleme' : 'Sensitive Data Masking',
      desc: isTR
        ? 'Telefon numaraları, TC kimlik numaraları ve diğer hassas veriler otomatik olarak maskelenir. AI asistan bu verileri açığa çıkarmaz.'
        : 'Phone numbers, national ID numbers, and other sensitive data are automatically masked. The AI assistant never exposes this data.',
    },
    {
      icon: AlertTriangle,
      title: isTR ? 'Halüsinasyon Engelleme' : 'Hallucination Prevention',
      desc: isTR
        ? 'Anti-confabulation guard ile AI\'in doğrulanmamış bilgi üretmesi engellenir. Asistan yalnızca kanıtlanmış verilere dayanarak yanıt verir.'
        : 'Anti-confabulation guard prevents the AI from generating unverified information. The assistant only responds based on verified data.',
    },
  ];

  /* ── Section D: Operasyonel Güvenlik ── */
  const opsCards = [
    {
      icon: Clock,
      color: 'from-[#000ACF] to-[#00C4E6]',
      title: isTR ? '7/24 İzleme' : '24/7 Monitoring',
      desc: isTR ? 'Sistem sağlığı ve performans sürekli izlenir, anomaliler anında tespit edilir.' : 'System health and performance are continuously monitored, anomalies are detected instantly.',
    },
    {
      icon: BarChart3,
      color: 'from-[#051752] to-[#006FEB]',
      title: isTR ? 'Audit Log' : 'Audit Log',
      desc: isTR ? 'Tüm işlemler detaylı şekilde kayıt altına alınır. Kim, ne zaman, ne yaptı — her şey izlenebilir.' : 'All operations are logged in detail. Who, when, what — everything is traceable.',
    },
    {
      icon: Activity,
      color: 'from-[#006FEB] to-[#00C4E6]',
      title: isTR ? 'Otomatik Yedekleme' : 'Automatic Backup',
      desc: isTR ? 'Günlük otomatik yedekleme ile veri kaybı riskini minimuma indiriyoruz.' : 'We minimize data loss risk with daily automatic backups.',
    },
    {
      icon: Zap,
      color: 'from-[#000ACF] to-[#051752]',
      title: isTR ? 'Incident Response' : 'Incident Response',
      desc: isTR ? 'Detaylı olay müdahale planı ile güvenlik olaylarına hızlı ve etkin müdahale.' : 'Rapid and effective response to security incidents with a detailed incident response plan.',
    },
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
                <Shield className="w-4 h-4" />
                {t('security.badge')}
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
              {t('security.heroTitle')}
            </motion.h1>
            <motion.p
              initial={fadeUp}
              whileInView={visible}
              viewport={{ once: true }}
              transition={{ ...transition, delay: 0.12 }}
              className="text-lg sm:text-xl max-w-2xl mx-auto"
              style={{ color: 'var(--ft-text-secondary)' }}
            >
              {t('security.heroSubtitle')}
            </motion.p>
          </div>
        </div>
      </section>

      {/* ═══ Section A: Veri Güvenliği ═══ */}
      <section className="py-16 md:py-24" ref={gridRef}>
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <motion.h2
              initial={fadeUp}
              whileInView={visible}
              viewport={vp}
              transition={transition}
              className="text-3xl md:text-4xl font-bold tracking-tight"
              style={{ color: 'var(--ft-text-primary)' }}
            >
              {t('security.dataSecurityTitle')}
            </motion.h2>
            <p className="mt-3 text-lg" style={{ color: 'var(--ft-text-secondary)' }}>
              {t('security.dataSecuritySubtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5 md:gap-6 max-w-7xl mx-auto">
            {dataSecurityCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <motion.div
                  key={card.id}
                  initial={fadeUp}
                  whileInView={visible}
                  viewport={vp}
                  transition={{ ...transition, delay: index * 0.08 }}
                >
                  <div className="ft-card ft-card-lg h-full">
                    <div className="relative z-10">
                      <div className={`ft-icon bg-gradient-to-br ${card.color}`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--ft-text-primary)' }}>
                        {card.title}
                      </h3>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--ft-text-secondary)' }}>
                        {card.desc}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ Section B: Yasal Uyumluluk ═══ */}
      <section className="relative py-16 md:py-24">
        <div className="ft-glow-blob" style={{ width: 500, height: 500, bottom: -100, left: '50%', marginLeft: -250, background: '#006FEB', opacity: 0.06 }} />

        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <motion.h2
              initial={fadeUp}
              whileInView={visible}
              viewport={vp}
              transition={transition}
              className="text-3xl md:text-4xl font-bold tracking-tight"
              style={{ color: 'var(--ft-text-primary)' }}
            >
              {t('security.complianceTitle')}
            </motion.h2>
            <p className="mt-3 text-lg" style={{ color: 'var(--ft-text-secondary)' }}>
              {t('security.complianceSubtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {complianceCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <motion.div
                  key={card.id}
                  initial={fadeUp}
                  whileInView={visible}
                  viewport={vp}
                  transition={{ ...transition, delay: index * 0.1 }}
                >
                  <div className="ft-card ft-card-lg h-full">
                    <div className="relative z-10">
                      <div className={`ft-icon bg-gradient-to-br ${card.color}`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="text-xl md:text-2xl font-bold mb-2" style={{ color: 'var(--ft-text-primary)' }}>
                        {card.title}
                      </h3>
                      <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--ft-text-secondary)' }}>
                        {card.desc}
                      </p>
                      <ul className="space-y-2.5">
                        {card.items.map((item) => (
                          <li key={item} className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--ft-text-secondary)' }}>
                            <div className="ft-check mt-0.5">
                              <Check className="h-3 w-3 text-primary-700 dark:text-primary-300" />
                            </div>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ Section C: AI Güvenliği ═══ */}
      <section className="relative py-16 md:py-24">
        <div className="ft-glow-blob" style={{ width: 400, height: 400, top: '20%', right: '-3%', background: '#8b5cf6' }} />

        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <motion.h2
              initial={fadeUp}
              whileInView={visible}
              viewport={vp}
              transition={transition}
              className="text-3xl md:text-4xl font-bold tracking-tight"
              style={{ color: 'var(--ft-text-primary)' }}
            >
              {t('security.aiSecurityTitle')}
            </motion.h2>
            <p className="mt-3 text-lg" style={{ color: 'var(--ft-text-secondary)' }}>
              {t('security.aiSecuritySubtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {aiSecurityItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.title}
                  initial={fadeUp}
                  whileInView={visible}
                  viewport={vp}
                  transition={{ ...transition, delay: index * 0.08 }}
                >
                  <div className="ft-deep-card h-full">
                    <div className="relative z-10">
                      <div className="ft-icon bg-gradient-to-br from-[#00C4E6] to-[#006FEB]">
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--ft-text-primary)' }}>
                        {item.title}
                      </h3>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--ft-text-secondary)' }}>
                        {item.desc}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ Section D: Operasyonel Güvenlik ═══ */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <motion.h2
              initial={fadeUp}
              whileInView={visible}
              viewport={vp}
              transition={transition}
              className="text-3xl md:text-4xl font-bold tracking-tight"
              style={{ color: 'var(--ft-text-primary)' }}
            >
              {t('security.opsTitle')}
            </motion.h2>
            <p className="mt-3 text-lg" style={{ color: 'var(--ft-text-secondary)' }}>
              {t('security.opsSubtitle')}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6 max-w-7xl mx-auto">
            {opsCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <motion.div
                  key={card.title}
                  initial={fadeUp}
                  whileInView={visible}
                  viewport={vp}
                  transition={{ ...transition, delay: index * 0.06 }}
                >
                  <div className="ft-card ft-card-sm h-full">
                    <div className="relative z-10">
                      <div className={`ft-icon bg-gradient-to-br ${card.color}`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--ft-text-primary)' }}>
                        {card.title}
                      </h3>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--ft-text-secondary)' }}>
                        {card.desc}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
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
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-white">
                  {t('security.ctaTitle')}
                </h2>
                <p className="text-lg text-blue-100 dark:text-neutral-400 mb-8 max-w-2xl mx-auto">
                  {t('security.ctaSubtitle')}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link href="/contact">
                    <Button size="lg" className="ft-glow-btn w-full sm:w-auto rounded-full bg-white text-slate-900 hover:bg-gray-100 px-8 font-semibold shadow-lg">
                      {t('security.ctaContact')}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                  <Link href="/waitlist">
                    <Button size="lg" variant="outline" className="w-full sm:w-auto rounded-full border-white/30 text-white hover:bg-white/10 px-8 transition-all duration-200" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'transparent' }}>
                      {t('security.ctaApply')}
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
