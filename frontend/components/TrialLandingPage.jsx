'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { trackCtaClick } from '@/lib/marketingAnalytics';
import '@/styles/landing.css';

function getTrialLandingCopy(locale) {
  if (locale === 'en') {
    return {
    hero: {
      lines: ['One assistant.', '4 channels.', '14 days free.', 'No credit card required.'],
      tagline: 'See how speed, order, and consistency come together in your customer communication.',
        primaryCta: 'Try 14 days free',
        secondaryCta: 'See how it works',
      },
      manifesto:
        'Experience how scattered requests come together in a single operational flow.',
      manifestoEmphasis: [],
      dashboard: {
        title: 'Trial command center',
        pills: ['Today', 'First week', '14 days'],
        metrics: [
          { label: 'Active channels', value: '4', color: 'primary', trend: 'Phone, WhatsApp, chat, email' },
          { label: 'First response target', value: '1.8', color: 'accent', decimal: '1', suffix: ' s', trend: 'Faster first touch' },
          { label: 'Human handoff points', value: '3', color: 'info', trend: 'Control stays with your team' },
          { label: 'Setup time', value: '14', color: 'warning', suffix: ' min', trend: 'To launch the first flow' },
        ],
        channelLoad: [
          { name: 'Phone', width: '72', color: 'primary' },
          { name: 'WhatsApp', width: '63', color: 'accent' },
          { name: 'Email', width: '54', color: 'info' },
          { name: 'Web Chat', width: '46', color: 'warning' },
        ],
        activities: [
          { text: 'WhatsApp requests were answered automatically', time: 'Now', color: 'var(--lp-accent)' },
          { text: 'A phone call was handed to a human agent', time: '2 min', color: 'var(--lp-info)' },
          { text: 'An email draft was prepared for approval', time: '5 min', color: 'var(--lp-warning)' },
          { text: 'A new lead was captured via web chat', time: '8 min', color: 'var(--lp-primary)' },
        ],
      },
      channels: {
        kicker: 'One visual language during the trial',
        title: 'Four channels, one operational logic.',
        subtitle:
          'See how Telyx runs every customer touchpoint inside the same marketing system and the same operating rhythm.',
        items: [
          {
            icon: '📞',
            title: 'Phone',
            description: 'Answer inbound calls, manage callbacks, and hand over to your team intelligently when needed.',
          },
          {
            icon: '💬',
            title: 'WhatsApp',
            description: 'Respond to order, support, and sales questions quickly and consistently in your brand voice.',
          },
          {
            icon: '🌐',
            title: 'Web Chat',
            description: 'Meet visitors immediately and move potential customers into the right flow without delay.',
          },
          {
            icon: '📧',
            title: 'Email',
            description: 'Classify the inbox, create AI drafts, and build an approval rhythm for your team.',
          },
        ],
      },
      proof: [
        {
          count: '14',
          suffix: ' days',
          title: 'A real trial window',
          description: 'Try Telyx in an environment that feels close to going live, without entering a card.',
          color: 'primary',
        },
        {
          count: '4',
          suffix: ' channels',
          title: 'One panel',
          description: 'Phone, WhatsApp, email, and web chat come together in the same operational screen.',
          color: 'accent',
        },
        {
          count: '2',
          prefix: '< ',
          suffix: ' s',
          title: 'First-response feel',
          description: 'Your customers feel the speed, clarity, and consistency from the very first touch.',
          color: 'info',
        },
      ],
      workflow: {
        kicker: '14-day flow',
        title: 'A clear rhythm from setup to first measurable impact.',
        subtitle:
          'The trial is not just a static demo. It moves like a measurable rehearsal for your real customer operations.',
        steps: [
          {
            step: '01',
            title: 'Choose the assistant',
            description: 'Open your first trial flow and decide which use case you want to start with.',
          },
          {
            step: '02',
            title: 'Connect your data',
            description: 'Add CRM, commerce, calendar, or core customer context in a few steps.',
          },
          {
            step: '03',
            title: 'Activate the channels',
            description: 'See which load is handled by AI across phone, WhatsApp, email, and chat.',
          },
          {
            step: '04',
            title: 'Measure the result',
            description: 'Track response speed, operational load, and handoff points clearly during the trial.',
          },
        ],
      },
      cta: {
        kicker: 'If you are ready, let’s start',
        title: 'At the end of the trial, remember the impact, not just the screen.',
        subtitle:
          'Test Telyx across four channels before going live, see the load shift, and measure how your communication starts to simplify.',
        button: 'Try 14 days free',
      },
    };
  }

  return {
    hero: {
      lines: ['Tek asistan.', '4 kanal.', '14 gün ücretsiz.', 'Kredi kartı gerekmez.'],
      tagline: 'Müşteri iletişiminizde hızın, düzenin ve tutarlılığın nasıl kurulduğunu görün.',
      primaryCta: '14 gün ücretsiz deneyin',
      secondaryCta: 'Nasıl çalıştığını görün',
    },
    manifesto:
      'Dağınık taleplerin tek bir operasyon akışında nasıl toplandığını deneyimleyin.',
    manifestoEmphasis: [],
    dashboard: {
      title: 'Deneme komuta merkezi',
      pills: ['Bugün', 'İlk hafta', '14 gün'],
      metrics: [
        { label: 'Açık kanal', value: '4', color: 'primary', trend: 'Telefon, WhatsApp, chat, e-posta' },
        { label: 'İlk yanıt hedefi', value: '1.8', color: 'accent', decimal: '1', suffix: ' sn', trend: 'Hızlı ilk temas hissi' },
        { label: 'İnsan devri', value: '3', color: 'info', trend: 'Kontrol tamamen sizde' },
        { label: 'Kurulum süresi', value: '14', color: 'warning', suffix: ' dk', trend: 'İlk akışı başlatmak için' },
      ],
      channelLoad: [
        { name: 'Telefon', width: '72', color: 'primary' },
        { name: 'WhatsApp', width: '63', color: 'accent' },
        { name: 'E-posta', width: '54', color: 'info' },
        { name: 'Web Chat', width: '46', color: 'warning' },
      ],
      activities: [
        { text: 'WhatsApp talepleri otomatik yanıtlandı', time: 'Şimdi', color: 'var(--lp-accent)' },
        { text: 'Telefon görüşmesi temsilciye devredildi', time: '2 dk', color: 'var(--lp-info)' },
        { text: 'E-posta taslağı onaya hazırlandı', time: '5 dk', color: 'var(--lp-warning)' },
        { text: 'Web chat üzerinden yeni lead yakalandı', time: '8 dk', color: 'var(--lp-primary)' },
      ],
    },
    channels: {
      kicker: 'Deneme boyunca tek tasarım dili',
      title: 'Dört kanal, tek operasyon mantığı.',
      subtitle:
        'Telyx’in her temas noktasını aynı görsel aile ve aynı operasyon ritmi içinde nasıl yönettiğini deneme sürecinde görün.',
      items: [
        {
          icon: '📞',
          title: 'Telefon',
          description: 'Gelen aramaları karşılayın, geri aramaları yönetin ve gerektiğinde ekibinize akıllı şekilde devredin.',
        },
        {
          icon: '💬',
          title: 'WhatsApp',
          description: 'Sipariş, destek ve satış sorularını marka tonunuzla hızlı ve tutarlı biçimde yanıtlayın.',
        },
        {
          icon: '🌐',
          title: 'Web Chat',
          description: 'Ziyaretçinizi ilk saniyede karşılayın, potansiyel müşteriyi bekletmeden doğru akışa taşıyın.',
        },
        {
          icon: '📧',
          title: 'E-posta',
          description: 'Gelen kutusunu sınıflandırın, AI taslakları oluşturun ve ekibiniz için onay ritmi kurun.',
        },
      ],
    },
    proof: [
      {
        count: '14',
        suffix: ' gün',
        title: 'Gerçek deneme süresi',
        description: 'Kredi kartı istemeden canlı operasyona yakın bir ortamda Telyx’i deneyin.',
        color: 'primary',
      },
      {
        count: '4',
        suffix: ' kanal',
        title: 'Tek panel',
        description: 'Telefon, WhatsApp, e-posta ve web chat aynı operasyon ekranında buluşur.',
        color: 'accent',
      },
      {
        count: '2',
        prefix: '< ',
        suffix: ' sn',
        title: 'İlk yanıt hissi',
        description: 'Müşteriniz daha ilk temasta hız, tutarlılık ve netlik farkını görür.',
        color: 'info',
      },
    ],
    workflow: {
      kicker: '14 günlük akış',
      title: 'Kurulumdan ilk etkiye kadar net bir ritim.',
      subtitle:
        'Deneme süreci yalnızca ekrana bakılan bir demo değil; ölçülebilir bir operasyon provası gibi ilerler.',
      steps: [
        {
          step: '01',
          title: 'Asistanı seçin',
          description: 'İlk deneme akışınızı açın ve hangi kullanım senaryosuyla başlayacağınıza karar verin.',
        },
        {
          step: '02',
          title: 'Veriyi bağlayın',
          description: 'CRM, e-ticaret, takvim ya da temel müşteri bağlamınızı sisteme birkaç adımda ekleyin.',
        },
        {
          step: '03',
          title: 'Kanalları aktive edin',
          description: 'Telefon, WhatsApp, e-posta ve chat arasında hangi yükün AI tarafından alınacağını görün.',
        },
        {
          step: '04',
          title: 'Sonucu ölçün',
          description: 'Yanıt hızı, operasyon yükü ve insan devri noktalarını deneme sürecinde net biçimde takip edin.',
        },
      ],
    },
    cta: {
      kicker: 'Hazırsanız başlayalım',
      title: 'Deneme sonunda yalnızca ekranı değil, etkiyi hatırlayın.',
      subtitle:
        'Telyx’i canlıya geçmeden önce dört kanalda deneyin, ekip yükünü görün ve müşteri iletişiminizin nasıl sadeleştiğini ölçün.',
      button: '14 gün ücretsiz deneyin',
    },
  };
}

export default function TrialLandingPage() {
  const { locale } = useLanguage();
  const pageRef = useRef(null);
  const copy = useMemo(() => getTrialLandingCopy(locale), [locale]);

  const manifestoWords = useMemo(
    () => {
      const emphasisSet = new Set((copy.manifestoEmphasis || []).map((word) => word.toLowerCase()));
      return copy.manifesto.split(/\s+/).map((word) => ({
        word,
        em: emphasisSet.has(word.toLowerCase().replace(/[.,!?]/g, '')),
      }));
    },
    [copy.manifesto, copy.manifestoEmphasis]
  );

  useEffect(() => {
    const root = pageRef.current;
    if (!root) return;

    const cleanups = [];

    {
      const lines = root.querySelectorAll('.hero-line');
      const tagline = root.querySelector('.hero-tagline');
      const heroBottom = root.querySelector('.hero-bottom');
      const primaryCta = root.querySelector('.trial-hero-primary-cta');
      let ticking = false;
      let revealed = false;

      function updateHero() {
        const scrolled = window.scrollY;
        const thresholds = [0, 80, 150, 220];

        for (let i = 0; i < lines.length; i += 1) {
          lines[i].classList.toggle('active', scrolled >= thresholds[i]);
        }

        if (scrolled >= 300) {
          tagline?.classList.add('active');
          if (!revealed) {
            revealed = true;
            heroBottom?.classList.add('visible');
          }
        } else if (scrolled < 260) {
          tagline?.classList.remove('active');
          if (revealed) {
            revealed = false;
            heroBottom?.classList.remove('visible');
          }
        }

        if (scrolled >= 360) {
          primaryCta?.classList.add('active');
        } else if (scrolled < 320) {
          primaryCta?.classList.remove('active');
        }

        ticking = false;
      }

      const onScroll = () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(updateHero);
        }
      };

      window.addEventListener('scroll', onScroll, { passive: true });
      updateHero();
      cleanups.push(() => window.removeEventListener('scroll', onScroll));
    }

    {
      const section = root.querySelector('.manifesto');
      const words = root.querySelectorAll('.mw');

      if (section && words.length) {
        let ticking = false;

        function updateManifesto() {
          const rect = section.getBoundingClientRect();
          const viewHeight = window.innerHeight;
          const start = viewHeight * 0.55;
          const end = -rect.height * 0.3;
          const progress = Math.max(0, Math.min(1, (start - rect.top) / (start - end)));
          const total = words.length;

          for (let i = 0; i < total; i += 1) {
            const threshold = (i + 1) / (total + 1);
            words[i].classList.toggle('lit', progress >= threshold);
          }

          ticking = false;
        }

        const onScroll = () => {
          if (!ticking) {
            ticking = true;
            requestAnimationFrame(updateManifesto);
          }
        };

        window.addEventListener('scroll', onScroll, { passive: true });
        updateManifesto();
        cleanups.push(() => window.removeEventListener('scroll', onScroll));
      }
    }

    {
      const revealNodes = root.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('visible');
            } else {
              entry.target.classList.remove('visible');
            }
          });
        },
        { threshold: 0.15, rootMargin: '0px 0px -90px 0px' }
      );

      revealNodes.forEach((node) => observer.observe(node));
      cleanups.push(() => observer.disconnect());
    }

    {
      const grids = [
        { id: 'trialChannelsGrid', start: 110, gap: 80 },
        { id: 'trialProofGrid', start: 110, gap: 80 },
        { id: 'trialStepsGrid', start: 110, gap: 80 },
      ];
      let ticking = false;

      function updateCards() {
        const viewHeight = window.innerHeight;

        grids.forEach(({ id, start, gap }) => {
          const grid = root.querySelector(`#${id}`);
          if (!grid) return;

          const cards = grid.querySelectorAll('.scroll-card');
          const scrolled = viewHeight - grid.getBoundingClientRect().top;

          for (let i = 0; i < cards.length; i += 1) {
            cards[i].classList.toggle('visible', scrolled >= start + i * gap);
          }
        });

        ticking = false;
      }

      const onScroll = () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(updateCards);
        }
      };

      window.addEventListener('scroll', onScroll, { passive: true });
      updateCards();
      cleanups.push(() => window.removeEventListener('scroll', onScroll));
    }

    {
      const counters = root.querySelectorAll('[data-count]');
      if (counters.length) {
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                if (entry.target.dataset.counting) return;
                entry.target.dataset.counting = '1';

                const target = parseFloat(entry.target.dataset.count);
                const decimals = parseInt(entry.target.dataset.decimal || '0', 10);
                const suffix = entry.target.dataset.suffix || '';
                const prefix = entry.target.dataset.prefix || '';
                const duration = 1400;
                const startTime = performance.now();

                function tick(now) {
                  const elapsed = now - startTime;
                  const progress = Math.min(elapsed / duration, 1);
                  const eased = 1 - Math.pow(1 - progress, 3);
                  const current = target * eased;

                  entry.target.textContent =
                    prefix +
                    (decimals > 0 ? current.toFixed(decimals) : Math.round(current).toLocaleString('tr-TR')) +
                    suffix;

                  if (progress < 1) {
                    requestAnimationFrame(tick);
                  } else {
                    delete entry.target.dataset.counting;
                  }
                }

                requestAnimationFrame(tick);
              } else {
                const prefix = entry.target.dataset.prefix || '';
                entry.target.textContent = prefix + '0';
                delete entry.target.dataset.counting;
              }
            });
          },
          { threshold: 0.5, rootMargin: '0px 0px -50px 0px' }
        );

        counters.forEach((counter) => observer.observe(counter));
        cleanups.push(() => observer.disconnect());
      }
    }

    {
      const bars = root.querySelectorAll('.channel-bar-fill');
      if (bars.length) {
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.style.width = `${entry.target.dataset.width}%`;
              } else {
                entry.target.style.width = '0';
              }
            });
          },
          { threshold: 0.3, rootMargin: '0px 0px -50px 0px' }
        );

        bars.forEach((bar) => observer.observe(bar));
        cleanups.push(() => observer.disconnect());
      }
    }

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  return (
    <div className="landing-page trial-landing-page" ref={pageRef}>
      <div className="lp-page">
          <div className="glow glow-l" aria-hidden="true" />
          <div className="glow glow-r" aria-hidden="true" />

          <section className="hero" id="hero">
            <div className="hero-grid-bg" aria-hidden="true" />
            <div className="hero-text-stack">
              {copy.hero.lines.map((line) => (
                <span key={line} className="hero-line">
                  {line}
                </span>
              ))}
              <span className="hero-tagline">{copy.hero.tagline}</span>
            </div>

            <div className="hero-bottom">
              <div className="hero-actions">
                <a
                  href="/signup"
                  className="lp-btn trial-hero-primary-cta"
                  onClick={() =>
                    trackCtaClick({
                      ctaName: 'trial_landing_primary',
                      ctaLocation: 'trial_landing_hero',
                      destination: '/signup',
                      locale,
                    })
                  }
                >
                  {copy.hero.primaryCta}
                </a>
              </div>
            </div>

            <div className="hero-scroll-cue" aria-hidden="true">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M12 5v14m0 0l-6-6m6 6l6-6" />
              </svg>
            </div>
          </section>

          <section className="manifesto" id="manifesto">
            <div className="shell">
              <p className="manifesto-text">
                {manifestoWords.map((item, index) => (
                  <span key={`${item.word}-${index}`}>
                    <span className={`mw${item.em ? ' em' : ''}`}>{item.word}</span>
                    {index < manifestoWords.length - 1 ? ' ' : ''}
                  </span>
                ))}
              </p>
            </div>
          </section>

          <section className="channels" id="channels">
            <div className="shell">
              <div className="channels-header reveal">
                <span className="kicker">{copy.channels.kicker}</span>
                <h2 className="section-title">{copy.channels.title}</h2>
                <p className="section-sub" style={{ margin: '0 auto' }}>
                  {copy.channels.subtitle}
                </p>
              </div>

              <div className="channels-grid" id="trialChannelsGrid">
                {copy.channels.items.map((channel, index) => (
                  <div key={channel.title} className={`channel-card ch-${(index % 4) + 1} scroll-card`}>
                    <div className="channel-icon">{channel.icon}</div>
                    <h3>{channel.title}</h3>
                    <p>{channel.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="proof" id="impact">
            <div className="shell">
              <div className="proof-grid" id="trialProofGrid">
                {copy.proof.map((benefit) => (
                  <div key={benefit.title} className="proof-card scroll-card">
                    <p
                      className="proof-value"
                      data-color={benefit.color}
                      data-count={benefit.count}
                      data-prefix={benefit.prefix || ''}
                      data-suffix={benefit.suffix || ''}
                    >
                      0
                    </p>
                    <h2>{benefit.title}</h2>
                    <p>{benefit.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="workflow" id="workflow">
            <div className="shell">
              <div className="workflow-header reveal">
                <span className="kicker">{copy.workflow.kicker}</span>
                <h2 className="section-title">{copy.workflow.title}</h2>
                <p className="section-sub" style={{ margin: '0 auto' }}>
                  {copy.workflow.subtitle}
                </p>
              </div>

              <div className="steps-grid" id="trialStepsGrid">
                {copy.workflow.steps.map((step) => (
                  <div key={step.step} className="step-card scroll-card">
                    <span className="step-num">{step.step}</span>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="cta" id="cta">
            <div className="shell">
              <div className="cta-panel reveal-scale">
                <span className="kicker">{copy.cta.kicker}</span>
                <h2 className="section-title">{copy.cta.title}</h2>
                <p className="section-sub">{copy.cta.subtitle}</p>
                <div className="cta-actions">
                  <a
                    href="/signup"
                    className="lp-btn trial-hero-primary-cta active"
                    onClick={() =>
                      trackCtaClick({
                        ctaName: 'trial_landing_bottom',
                        ctaLocation: 'trial_landing_cta',
                        destination: '/signup',
                        locale,
                      })
                    }
                  >
                    {copy.cta.button}
                  </a>
                </div>
              </div>
            </div>
          </section>
        </div>
    </div>
  );
}
