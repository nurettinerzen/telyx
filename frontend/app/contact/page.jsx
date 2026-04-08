'use client';

import { useState, useEffect, useCallback } from 'react';
import Navigation from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import {
  Mail, Clock, Send, Check, MessageSquare, Shield,
  Zap, Headphones, Sparkles,
} from 'lucide-react';

export default function ContactPage() {
  const { t, locale } = useLanguage();
  const isTR = locale === 'tr';
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    businessType: '',
    message: '',
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Rotating testimonials
  const testimonials = [
    {
      quote: isTR
        ? 'Telyx sayesinde müşteri hizmetlerimiz 7/24 aktif. Ekibimiz artık daha stratejik işlere odaklanabiliyor.'
        : 'Thanks to Telyx, our customer service is active 24/7. Our team can now focus on more strategic tasks.',
      name: 'Mehmet Yılmaz',
      role: isTR ? 'E-ticaret Müdürü, incehesap.com' : 'E-commerce Director, incehesap.com',
      initials: 'İH',
      gradient: 'from-[#000ACF] to-[#00C4E6]',
    },
    {
      quote: isTR
        ? 'Sipariş takibi ve müşteri sorularında %70 daha hızlı yanıt veriyoruz. Entegrasyon süreci çok kolaydı.'
        : 'We respond 70% faster on order tracking and customer inquiries. The integration process was very easy.',
      name: 'Ayşe Kara',
      role: isTR ? 'Operasyon Yöneticisi, Oksid' : 'Operations Manager, Oksid',
      initials: 'OK',
      gradient: 'from-[#000ACF] to-[#051752]',
    },
    {
      quote: isTR
        ? 'Randevu yönetimi tamamen otomatik hale geldi. Müşterilerimiz WhatsApp üzerinden anında randevu alabiliyor.'
        : 'Appointment management has become fully automated. Our customers can instantly book via WhatsApp.',
      name: 'Nurettin Erzen',
      role: isTR ? 'Kurucu, Selenly' : 'Founder, Selenly',
      initials: 'SE',
      gradient: 'from-[#051752] to-[#006FEB]',
    },
    {
      quote: isTR
        ? 'Tahsilat hatırlatmalarında Telyx kullanıyoruz. Süreç daha düzenli ilerliyor, müşteriye hatırlatma yapmak da çok daha kolaylaştı.'
        : 'We use Telyx for payment reminder workflows. The process is much more organized now, and reminding customers has become far easier.',
      name: 'Fatih Altıntaş',
      role: 'Faal Denetim',
      initials: 'FD',
      gradient: 'from-[#006FEB] to-[#000ACF]',
    },
    {
      quote: isTR
        ? 'Telyx ile gelen aramaları ve mesajları aynı sistemden yönetiyoruz. Hem hız hem de müşteri memnuniyeti tarafında gerçekten çok memnunuz.'
        : 'With Telyx, we manage incoming calls and messages from the same system. We are genuinely very happy with both the speed and customer experience.',
      name: 'Dicle Yıldız',
      role: 'Moda Hasen',
      initials: 'MH',
      gradient: 'from-[#00C4E6] to-[#006FEB]',
    },
  ];

  const [activeTestimonial, setActiveTestimonial] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [testimonials.length]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setSubmitted(true);
        toast.success(t('contact.successMessage'));
        setFormData({ name: '', email: '', company: '', phone: '', businessType: '', message: '' });
      } else {
        toast.error(t('contact.errorMessage'));
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error(t('contact.errorMessage'));
    } finally {
      setLoading(false);
    }
  };

  const highlights = [
    { icon: Zap, titleKey: 'contact.highlights.setup.title', descKey: 'contact.highlights.setup.desc', color: 'from-[#051752] to-[#000ACF]' },
    { icon: MessageSquare, titleKey: 'contact.highlights.channels.title', descKey: 'contact.highlights.channels.desc', color: 'from-[#000ACF] to-[#00C4E6]' },
    { icon: Shield, titleKey: 'contact.highlights.security.title', descKey: 'contact.highlights.security.desc', color: 'from-[#051752] to-[#006FEB]' },
    { icon: Headphones, titleKey: 'contact.highlights.support.title', descKey: 'contact.highlights.support.desc', color: 'from-[#006FEB] to-[#00C4E6]' },
  ];

  const stats = [
    { value: '%85', label: t('contact.trust.stat1') },
    { value: '7/24', label: t('contact.trust.stat2') },
    { value: '1.8s', label: t('contact.trust.stat3') },
    { value: '4x', label: t('contact.trust.stat4') },
  ];

  const inputClass =
    'mt-2 w-full px-4 py-2.5 border border-gray-200 dark:border-white/[0.08] rounded-xl bg-white/60 dark:bg-white/[0.06] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 backdrop-blur-sm transition-colors';

  const current = testimonials[activeTestimonial];

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 overflow-hidden">
      <Navigation />

      {/* ── Hero ── */}
      <section className="relative pt-28 md:pt-36 pb-12 md:pb-16">
        {/* Glow blobs — isolated on own GPU layer to prevent paint lag */}
        <div className="absolute inset-0 pointer-events-none" style={{ contain: 'strict', willChange: 'transform', transform: 'translateZ(0)' }}>
          <div
            className="absolute rounded-full"
            style={{ width: 500, height: 500, top: -120, left: '5%', background: '#006FEB', filter: 'blur(120px)', opacity: 0.12 }}
          />
          <div
            className="absolute rounded-full"
            style={{ width: 400, height: 400, top: 20, right: '8%', background: '#00C4E6', filter: 'blur(120px)', opacity: 0.1 }}
          />
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-3xl mx-auto">
            <div>
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium bg-primary-50 text-primary-700 border border-primary-200 mb-6 dark:bg-primary-950/50 dark:text-primary-300 dark:border-primary-800/60">
                <Sparkles className="w-4 h-4" />
                {isTR ? 'İletişim' : 'Contact'}
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6 text-gray-900 dark:text-white">
              {t('contact.hero.title')}
            </h1>

            <p className="text-lg sm:text-xl text-gray-600 dark:text-neutral-400">
              {t('contact.hero.subtitle')}
            </p>
          </div>
        </div>
      </section>

      {/* ── Highlight Cards ── */}
      <section className="pb-16 md:pb-20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
            {highlights.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.titleKey}
                  className="group relative rounded-2xl p-6 text-center border border-transparent dark:border-transparent bg-gray-50 dark:bg-white/[0.04] hover:bg-gray-100 dark:hover:bg-white/[0.07] hover:shadow-lg dark:hover:shadow-black/20 hover:-translate-y-1"
                  style={{ transition: 'background-color .1s, box-shadow .1s, transform .1s', willChange: 'transform', transform: 'translateZ(0)' }}
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center mx-auto mb-4 shadow-lg group-hover:scale-110`} style={{ transition: 'transform .1s', willChange: 'transform' }}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1.5">
                    {t(item.titleKey)}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-neutral-400 leading-relaxed">
                    {t(item.descKey)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Contact Form + Info ── */}
      <section className="py-8 md:py-12 pb-20">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-10 max-w-6xl mx-auto">

            {/* Form */}
            <div className="relative rounded-3xl p-8 md:p-10 border border-transparent dark:border-transparent bg-gray-50 dark:bg-white/[0.04]">
              <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
                {t('contact.form.title')}
              </h2>
              <p className="text-sm text-gray-500 dark:text-neutral-400 mb-8">
                {t('contact.hero.subtitle')}
              </p>

              {submitted && (
                <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl text-emerald-700 dark:text-emerald-300 flex items-center gap-2 text-sm">
                  <Check className="h-5 w-5 flex-shrink-0" />
                  <span>{t('contact.form.success')}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name" className="text-sm font-medium text-gray-700 dark:text-neutral-300">{t('contact.form.name')} *</Label>
                    <Input
                      id="name"
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className={inputClass}
                      placeholder={t('contact.form.namePlaceholder')}
                    />
                  </div>
                  <div>
                    <Label htmlFor="email" className="text-sm font-medium text-gray-700 dark:text-neutral-300">{t('contact.form.email')} *</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className={inputClass}
                      placeholder={t('contact.form.emailPlaceholder')}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="company" className="text-sm font-medium text-gray-700 dark:text-neutral-300">{t('contact.form.company')}</Label>
                    <Input
                      id="company"
                      type="text"
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      className={inputClass}
                      placeholder={t('contact.form.companyPlaceholder')}
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone" className="text-sm font-medium text-gray-700 dark:text-neutral-300">{t('contact.form.phone')}</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className={inputClass}
                      placeholder={t('contact.form.phonePlaceholder')}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="businessType" className="text-sm font-medium text-gray-700 dark:text-neutral-300">{t('contact.form.businessType')}</Label>
                  <select
                    id="businessType"
                    value={formData.businessType}
                    onChange={(e) => setFormData({ ...formData, businessType: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">{t('contact.form.selectType')}</option>
                    <option value="ecommerce">{t('contact.form.types.ecommerce')}</option>
                    <option value="restaurant">{t('contact.form.types.restaurant')}</option>
                    <option value="salon">{t('contact.form.types.salon')}</option>
                    <option value="service">{t('contact.form.types.service')}</option>
                    <option value="other">{t('contact.form.types.other')}</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="message" className="text-sm font-medium text-gray-700 dark:text-neutral-300">{t('contact.form.message')} *</Label>
                  <textarea
                    id="message"
                    required
                    rows={4}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className={`${inputClass} resize-none`}
                    placeholder={t('contact.form.messagePlaceholder')}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl h-12 bg-primary text-white hover:bg-primary/90 font-medium text-base shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all duration-300 hover:scale-[1.01]"
                  size="lg"
                >
                  {loading ? (
                    t('common.loading')
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      {t('contact.form.submit')}
                    </>
                  )}
                </Button>
              </form>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Contact Info */}
              <div className="rounded-3xl p-8 border border-transparent dark:border-transparent bg-gray-50 dark:bg-white/[0.04]">
                <h3 className="text-xl font-bold mb-6 text-gray-900 dark:text-white">{t('contact.info.title')}</h3>
                <div className="space-y-6">
                  <div className="flex items-start gap-4 group">
                    <div className="w-12 h-12 rounded-xl bg-primary-50 dark:bg-primary-950/50 flex items-center justify-center flex-shrink-0 group-hover:bg-primary group-hover:scale-105 transition-[background-color,transform] duration-150">
                      <Mail className="w-5 h-5 text-primary-700 dark:text-primary-300 group-hover:text-white transition-colors" />
                    </div>
                    <div>
                      <h4 className="font-semibold mb-1 text-gray-900 dark:text-white">{t('contact.info.email')}</h4>
                      <a href="mailto:info@telyx.ai" className="text-gray-600 dark:text-neutral-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors">
                        info@telyx.ai
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 group">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500 group-hover:scale-105 transition-[background-color,transform] duration-150">
                      <Clock className="w-5 h-5 text-emerald-500 group-hover:text-white transition-colors" />
                    </div>
                    <div>
                      <h4 className="font-semibold mb-1 text-gray-900 dark:text-white">{t('contact.info.hours')}</h4>
                      <p className="text-gray-600 dark:text-neutral-400">{t('contact.info.hoursValue')}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Trust Stats */}
              <div className="relative rounded-3xl p-8 border border-transparent dark:border-transparent bg-gradient-to-br from-primary/5 to-primary/[0.02] dark:from-primary/10 dark:to-primary/[0.02] overflow-hidden">
                <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-primary/20 blur-[60px] pointer-events-none" />

                <h3 className="text-xl font-bold mb-6 text-gray-900 dark:text-white relative z-10">{t('contact.trust.title')}</h3>
                <div className="grid grid-cols-2 gap-4 relative z-10">
                  {stats.map((stat) => (
                    <div
                      key={stat.value}
                      className="text-center p-4 rounded-2xl bg-white/60 dark:bg-white/[0.06] border border-transparent hover:bg-white/80 dark:hover:bg-white/10 transition-colors duration-150"
                    >
                      <div className="text-2xl font-bold text-primary-700 dark:text-primary-300 mb-1">{stat.value}</div>
                      <p className="text-xs text-gray-500 dark:text-neutral-400">{stat.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rotating Testimonials */}
              <div className="rounded-3xl p-6 border border-transparent dark:border-transparent bg-gray-50 dark:bg-white/[0.04]">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>

                {/* Testimonial content with crossfade */}
                <div className="relative min-h-[120px]">
                  {testimonials.map((item, i) => (
                    <div
                      key={i}
                      className="transition-all duration-500 ease-out"
                      style={{
                        position: i === 0 ? 'relative' : 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        opacity: i === activeTestimonial ? 1 : 0,
                        transform: i === activeTestimonial ? 'translateY(0)' : 'translateY(8px)',
                        pointerEvents: i === activeTestimonial ? 'auto' : 'none',
                      }}
                    >
                      <p className="text-sm italic text-gray-600 dark:text-neutral-300 leading-relaxed mb-5">
                        &ldquo;{item.quote}&rdquo;
                      </p>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${item.gradient} flex items-center justify-center text-white font-bold text-xs`}>
                          {item.initials}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.name}</p>
                          <p className="text-xs text-gray-500 dark:text-neutral-500">{item.role}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Dots indicator */}
                <div className="flex gap-2 justify-center mt-5">
                  {testimonials.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveTestimonial(i)}
                      className={`w-2 h-2 rounded-full transition-all duration-300 ${
                        i === activeTestimonial
                          ? 'bg-primary-700 dark:bg-primary-300 w-6'
                          : 'bg-gray-300 dark:bg-white/20 hover:bg-gray-400 dark:hover:bg-white/30'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
