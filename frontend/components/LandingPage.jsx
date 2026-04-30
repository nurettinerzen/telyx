'use client';

import { useEffect, useRef, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { trackCtaClick, trackPageView, trackScrollMilestone } from '@/lib/marketingAnalytics';
import ChatDemoSection from '@/components/ChatDemoSection';
import '@/styles/landing.css';

export function LandingPage() {
  const { t, locale } = useLanguage();
  const pageRef = useRef(null);
  const scrollTracked = useRef(false);

  /* ── Manifesto: split text into words, mark emphasis ── */
  const manifestoWords = useMemo(() => {
    const text = t('landing.manifesto.text');
    const emphasisRaw = t('landing.manifesto.emphasisWords') || '';
    const emphasisSet = new Set(emphasisRaw.split(',').map((w) => w.trim().toLowerCase()));
    return text.split(/\s+/).map((word) => ({
      word,
      em: emphasisSet.has(word.toLowerCase()),
    }));
  }, [t]);

  useEffect(() => {
    trackPageView({
      pageType: 'homepage',
      locale,
    });

    const onScrollMilestone = () => {
      if (scrollTracked.current) return;

      const scrollTop = window.scrollY || window.pageYOffset || 0;
      const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (documentHeight <= 0) return;

      const progress = scrollTop / documentHeight;
      if (progress >= 0.5) {
        scrollTracked.current = true;
        trackScrollMilestone({
          pageType: 'homepage',
          milestone: '50',
          locale,
        });
      }
    };

    window.addEventListener('scroll', onScrollMilestone, { passive: true });
    onScrollMilestone();

    return () => window.removeEventListener('scroll', onScrollMilestone);
  }, [locale]);

  useEffect(() => {
    const root = pageRef.current;
    if (!root) return;

    const cleanups = [];
    const isCompactViewport = () => {
      const widths = [
        window.innerWidth,
        document.documentElement.clientWidth,
        root.getBoundingClientRect().width,
      ].filter((width) => Number.isFinite(width) && width > 0);

      return Math.min(...widths) <= 700;
    };

    // ─── 1. Hero scroll-driven text ───
    {
      const lines = root.querySelectorAll('.hero-line');
      const tagline = root.querySelector('.hero-tagline');
      const heroBottom = root.querySelector('.hero-bottom');
      let ticking = false;

      function updateHero() {
        const scrolled = window.scrollY;
        const isCompact = isCompactViewport();
        const thresholds = isCompact ? [0, 32, 64, 96] : [0, 64, 128, 192];
        const taglineAt = isCompact ? 116 : 220;
        const ctaAt = isCompact ? 132 : 248;
        for (let i = 0; i < lines.length; i++) {
          lines[i].classList.toggle('active', scrolled >= thresholds[i]);
        }
        tagline?.classList.toggle('active', scrolled >= taglineAt);
        heroBottom?.classList.toggle('visible', scrolled >= ctaAt);
        ticking = false;
      }

      const heroScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(updateHero); } };
      window.addEventListener('scroll', heroScroll, { passive: true });
      updateHero();
      cleanups.push(() => window.removeEventListener('scroll', heroScroll));
    }

    // ─── 2. Word-by-word manifesto reveal ───
    {
      const section = root.querySelector('.manifesto');
      const words = root.querySelectorAll('.mw');
      if (section && words.length) {
        let ticking = false;

        function updateManifesto() {
          const rect = section.getBoundingClientRect();
          const viewH = window.innerHeight;
          const isCompact = isCompactViewport();
          const revealStartScroll = isCompact ? 150 : 280;
          const start = viewH * (isCompact ? 0.5 : 0.62);
          const end = -rect.height * 0.3;
          const rawProgress = Math.max(0, Math.min(1, (start - rect.top) / (start - end)));
          const progress = window.scrollY < revealStartScroll ? 0 : rawProgress;
          const total = words.length;
          for (let i = 0; i < total; i++) {
            const threshold = (i + 1) / (total + 1);
            words[i].classList.toggle('lit', progress >= threshold);
          }
          ticking = false;
        }

        const manifestoScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(updateManifesto); } };
        window.addEventListener('scroll', manifestoScroll, { passive: true });
        updateManifesto();
        cleanups.push(() => window.removeEventListener('scroll', manifestoScroll));
      }
    }

    // ─── 3. Scroll reveal (bidirectional) ───
    {
      const all = root.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');

      const observer = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          e.isIntersecting ? e.target.classList.add('visible') : e.target.classList.remove('visible');
        });
      }, { threshold: 0.15, rootMargin: isCompactViewport() ? '0px 0px 24px 0px' : '0px 0px -90px 0px' });

      const lateObserver = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          e.isIntersecting ? e.target.classList.add('visible') : e.target.classList.remove('visible');
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -170px 0px' });

      const dashboardObserver = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          e.isIntersecting ? e.target.classList.add('visible') : e.target.classList.remove('visible');
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -32px 0px' });

      const chatSyncObserver = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          e.isIntersecting ? e.target.classList.add('visible') : e.target.classList.remove('visible');
        });
      }, { threshold: 0.15, rootMargin: isCompactViewport() ? '0px 0px 120px 0px' : '0px 0px -220px 0px' });

      all.forEach((el) => {
        if (el.classList.contains('dashboard-reveal')) {
          dashboardObserver.observe(el);
        } else if (el.classList.contains('reveal-late')) {
          lateObserver.observe(el);
        } else {
          observer.observe(el);
        }
      });

      const chatGrid = root.querySelector('#chatDemoGrid');
      if (chatGrid) chatSyncObserver.observe(chatGrid);

      cleanups.push(() => {
        observer.disconnect();
        lateObserver.disconnect();
        dashboardObserver.disconnect();
        chatSyncObserver.disconnect();
      });
    }

    // ─── 3b. Scroll-driven staggered cards ───
    {
      const grids = [
        { id: 'channelsGrid', start: 110, gap: 80 },
        { id: 'proofGrid', start: 110, gap: 80 },
        { id: 'stepsGrid', start: 110, gap: 80 },
      ];
      let ticking = false;

      function updateCards() {
        const viewH = window.innerHeight;
        grids.forEach(({ id, start, gap }) => {
          const grid = root.querySelector(`#${id}`);
          if (!grid) return;
          const isCompact = isCompactViewport();
          const revealStart = isCompact ? 24 : start;
          const revealGap = isCompact ? 48 : gap;
          const cards = grid.querySelectorAll('.scroll-card');
          const scrolled = viewH - grid.getBoundingClientRect().top;
          for (let i = 0; i < cards.length; i++) {
            cards[i].classList.toggle('visible', scrolled >= revealStart + i * revealGap);
          }
        });
        ticking = false;
      }

      const cardsScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(updateCards); } };
      window.addEventListener('scroll', cardsScroll, { passive: true });
      updateCards();
      cleanups.push(() => window.removeEventListener('scroll', cardsScroll));
    }

    // ─── 4. Animated counters (bidirectional) ───
    {
      const counters = root.querySelectorAll('[data-count]');
      if (counters.length) {
        const observer = new IntersectionObserver((entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              if (e.target.dataset.counting) return;
              e.target.dataset.counting = '1';

              const target = parseFloat(e.target.dataset.count);
              const decimals = parseInt(e.target.dataset.decimal || '0', 10);
              const suffix = e.target.dataset.suffix || '';
              const prefix = e.target.dataset.prefix || '';
              const duration = 1400;
              const startTime = performance.now();

              function tick(now) {
                const elapsed = now - startTime;
                const p = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - p, 3);
                const current = target * eased;
                e.target.textContent = prefix + (decimals > 0 ? current.toFixed(decimals) : Math.round(current).toLocaleString('tr-TR')) + suffix;
                if (p < 1) requestAnimationFrame(tick);
                else delete e.target.dataset.counting;
              }
              requestAnimationFrame(tick);
            } else {
              const prefix = e.target.dataset.prefix || '';
              e.target.textContent = prefix + '0';
              delete e.target.dataset.counting;
            }
          });
        }, { threshold: 0.5, rootMargin: '0px 0px -50px 0px' });

        counters.forEach((c) => observer.observe(c));
        cleanups.push(() => observer.disconnect());
      }
    }

    // ─── 5. Dashboard channel bars (bidirectional) ───
    {
      const bars = root.querySelectorAll('.channel-bar-fill');
      if (bars.length) {
        const observer = new IntersectionObserver((entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.style.width = e.target.dataset.width + '%';
            } else {
              e.target.style.width = '0';
            }
          });
        }, { threshold: 0.3, rootMargin: '0px 0px -50px 0px' });

        bars.forEach((b) => observer.observe(b));
        cleanups.push(() => observer.disconnect());
      }
    }

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [t]);

  return (
    <div className="landing-page" ref={pageRef}>
      <div className="lp-page">
        <div className="glow glow-l" aria-hidden="true" />
        <div className="glow glow-r" aria-hidden="true" />

        {/* ═══ Hero ═══ */}
        <section className="hero" id="hero">
          <div className="hero-grid-bg" aria-hidden="true" />
          <div className="hero-text-stack">
            <span className="hero-line" data-index="0">{t('landing.scrollHero.line1')}</span>
            <span className="hero-line" data-index="1">{t('landing.scrollHero.line2')}</span>
            <span className="hero-line" data-index="2">{t('landing.scrollHero.line3')}</span>
            <span className="hero-line" data-index="3">{t('landing.scrollHero.line4')}</span>
            <span className="hero-tagline">{t('landing.scrollHero.tagline')}</span>
          </div>
          <div className="hero-bottom">
            <p className="hero-sub">{t('landing.scrollHero.sub')}</p>
            <div className="hero-actions">
              <a
                href="/signup"
                className="lp-btn"
                onClick={() => trackCtaClick({
                  ctaName: 'scroll_hero_primary',
                  ctaLocation: 'landing_scroll_hero',
                  destination: '/signup',
                  locale,
                })}
              >
                {t('landing.scrollHero.cta')}
              </a>
              <a href="#workflow" className="lp-btn-ghost">{t('landing.scrollHero.howItWorks')}</a>
            </div>
          </div>
          <div className="hero-scroll-cue" aria-hidden="true">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 5v14m0 0l-6-6m6 6l6-6" />
            </svg>
          </div>
        </section>

        {/* ═══ Manifesto ═══ */}
        <section className="manifesto" id="manifesto">
          <div className="shell">
            <p className="manifesto-text" id="manifestoText">
              {manifestoWords.map((w, i) => (
                <span key={i}>
                  <span className={`mw${w.em ? ' em' : ''}`}>{w.word}</span>
                  {i < manifestoWords.length - 1 ? ' ' : ''}
                </span>
              ))}
            </p>
          </div>
        </section>

        {/* ═══ Dashboard mockup ═══ */}
        <section className="dashboard-section">
          <div className="shell">
            <div className="dashboard-frame reveal-scale dashboard-reveal">
              <div className="dashboard-topbar">
                <span className="dashboard-topbar-title">{t('landing.dashboardSection.title')}</span>
                <div className="dashboard-topbar-pills">
                  <span>{t('landing.dashboardSection.today')}</span>
                  <span className="active-pill">{t('landing.dashboardSection.week')}</span>
                  <span>{t('landing.dashboardSection.month')}</span>
                </div>
              </div>
              <div className="metrics-row">
                <div className="metric-card reveal reveal-delay-1">
                  <div className="metric-label">{t('landing.dashboardSection.conversations')}</div>
                  <div className="metric-value" data-color="primary" data-count="1247">0</div>
                  <div className="metric-trend">{t('landing.dashboardSection.conversationsTrend')}</div>
                </div>
                <div className="metric-card reveal reveal-delay-2">
                  <div className="metric-label">{t('landing.dashboardSection.resolutionRate')}</div>
                  <div className="metric-value" data-color="accent" data-count="94.2" data-suffix="%" data-decimal="1">0</div>
                  <div className="metric-trend">{t('landing.dashboardSection.resolutionTrend')}</div>
                </div>
                <div className="metric-card reveal reveal-delay-3">
                  <div className="metric-label">{t('landing.dashboardSection.avgResponse')}</div>
                  <div className="metric-value" data-color="info" data-count="1.8" data-suffix="s" data-decimal="1">0</div>
                  <div className="metric-trend">{t('landing.dashboardSection.avgResponseTrend')}</div>
                </div>
                <div className="metric-card reveal reveal-delay-4">
                  <div className="metric-label">{t('landing.dashboardSection.satisfaction')}</div>
                  <div className="metric-value" data-color="warning" data-count="4.7" data-suffix="/5" data-decimal="1">0</div>
                  <div className="metric-trend">{t('landing.dashboardSection.satisfactionTrend')}</div>
                </div>
              </div>
              <div className="dashboard-body">
                <div className="channel-bars">
                  <div className="channel-bar-item">
                    <span className="channel-bar-name">Web Chat</span>
                    <div className="channel-bar-track"><div className="channel-bar-fill" data-color="accent" data-width="42" /></div>
                    <span className="channel-bar-pct">42%</span>
                  </div>
                  <div className="channel-bar-item">
                    <span className="channel-bar-name">WhatsApp</span>
                    <div className="channel-bar-track"><div className="channel-bar-fill" data-color="info" data-width="31" /></div>
                    <span className="channel-bar-pct">31%</span>
                  </div>
                  <div className="channel-bar-item">
                    <span className="channel-bar-name">Email</span>
                    <div className="channel-bar-track"><div className="channel-bar-fill" data-color="warning" data-width="18" /></div>
                    <span className="channel-bar-pct">18%</span>
                  </div>
                  <div className="channel-bar-item">
                    <span className="channel-bar-name">{t('landing.channelCards.phoneTitle')}</span>
                    <div className="channel-bar-track"><div className="channel-bar-fill" data-color="primary" data-width="9" /></div>
                    <span className="channel-bar-pct">9%</span>
                  </div>
                </div>
                <div className="activity-feed">
                  <div className="activity-item">
                    <span className="activity-dot" style={{ background: 'var(--lp-accent)' }} />
                    <span className="activity-text">{t('landing.dashboardSection.activity1')}</span>
                    <span className="activity-time">{t('landing.dashboardSection.activity1Time')}</span>
                  </div>
                  <div className="activity-item">
                    <span className="activity-dot" style={{ background: 'var(--lp-info)' }} />
                    <span className="activity-text">{t('landing.dashboardSection.activity2')}</span>
                    <span className="activity-time">{t('landing.dashboardSection.activity2Time')}</span>
                  </div>
                  <div className="activity-item">
                    <span className="activity-dot" style={{ background: 'var(--lp-warning)' }} />
                    <span className="activity-text">{t('landing.dashboardSection.activity3')}</span>
                    <span className="activity-time">{t('landing.dashboardSection.activity3Time')}</span>
                  </div>
                  <div className="activity-item">
                    <span className="activity-dot" style={{ background: 'var(--lp-primary)' }} />
                    <span className="activity-text">{t('landing.dashboardSection.activity4')}</span>
                    <span className="activity-time">{t('landing.dashboardSection.activity4Time')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ Channels ═══ */}
        <section className="channels" id="channels">
          <div className="shell">
            <div className="channels-header reveal">
              <span className="kicker">{t('landing.channelCards.kicker')}</span>
              <h2 className="section-title">{t('landing.channelCards.title')}</h2>
              <p className="section-sub" style={{ margin: '0 auto' }}>{t('landing.channelCards.subtitle')}</p>
            </div>
            <div className="channels-grid" id="channelsGrid">
              <div className="channel-card ch-2 scroll-card">
                <div className="channel-icon">{'\u{1F4DE}'}</div>
                <h3>{t('landing.channelCards.phoneTitle')}</h3>
                <p>{t('landing.channelCards.phoneDesc')}</p>
              </div>
              <div className="channel-card ch-1 scroll-card">
                <div className="channel-icon">{'\u{1F4AC}'}</div>
                <h3>{t('landing.channelCards.whatsappTitle')}</h3>
                <p>{t('landing.channelCards.whatsappDesc')}</p>
              </div>
              <div className="channel-card ch-3 scroll-card">
                <div className="channel-icon">{'\u{1F310}'}</div>
                <h3>{t('landing.channelCards.chatTitle')}</h3>
                <p>{t('landing.channelCards.chatDesc')}</p>
              </div>
              <div className="channel-card ch-4 scroll-card">
                <div className="channel-icon">{'\u{1F4E7}'}</div>
                <h3>{t('landing.channelCards.emailTitle')}</h3>
                <p>{t('landing.channelCards.emailDesc')}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ Chat demo ═══ */}
        <ChatDemoSection />

        {/* ═══ Proof stats ═══ */}
        <section className="proof" id="impact">
          <div className="shell">
            <div className="proof-grid" id="proofGrid">
              <div className="proof-card scroll-card">
                <p className="proof-value" data-color="primary" data-count={t('landing.proofSection.stat1Value')} data-prefix="%">0</p>
                <h2>{t('landing.proofSection.stat1Title')}</h2>
                <p>{t('landing.proofSection.stat1Desc')}</p>
              </div>
              <div className="proof-card scroll-card">
                <p className="proof-value" data-color="accent">{t('landing.proofSection.stat2Value')}</p>
                <h2>{t('landing.proofSection.stat2Title')}</h2>
                <p>{t('landing.proofSection.stat2Desc')}</p>
              </div>
              <div className="proof-card scroll-card">
                <p className="proof-value" data-color="info" data-count={t('landing.proofSection.stat3Value')} data-suffix="x">0</p>
                <h2>{t('landing.proofSection.stat3Title')}</h2>
                <p>{t('landing.proofSection.stat3Desc')}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ Workflow ═══ */}
        <section className="workflow" id="workflow">
          <div className="shell">
            <div className="workflow-header reveal">
              <span className="kicker">{t('landing.workflowSection.kicker')}</span>
              <h2 className="section-title">{t('landing.workflowSection.title')}</h2>
              <p className="section-sub" style={{ margin: '0 auto' }}>{t('landing.workflowSection.subtitle')}</p>
            </div>
            <div className="steps-grid" id="stepsGrid">
              <div className="step-card scroll-card">
                <span className="step-num">01</span>
                <h3>{t('landing.workflowSection.step1Title')}</h3>
                <p>{t('landing.workflowSection.step1Desc')}</p>
              </div>
              <div className="step-card scroll-card">
                <span className="step-num">02</span>
                <h3>{t('landing.workflowSection.step2Title')}</h3>
                <p>{t('landing.workflowSection.step2Desc')}</p>
              </div>
              <div className="step-card scroll-card">
                <span className="step-num">03</span>
                <h3>{t('landing.workflowSection.step3Title')}</h3>
                <p>{t('landing.workflowSection.step3Desc')}</p>
              </div>
              <div className="step-card scroll-card">
                <span className="step-num">04</span>
                <h3>{t('landing.workflowSection.step4Title')}</h3>
                <p>{t('landing.workflowSection.step4Desc')}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ Features ═══ */}
        <section className="features" id="features">
          <div className="shell">
            <div className="feature-row">
              <div className="reveal-left reveal-late">
                <span className="kicker">{t('landing.integrationsFeature.kicker')}</span>
                <h2 className="section-title">{t('landing.integrationsFeature.title')}</h2>
                <p className="section-sub">{t('landing.integrationsFeature.desc')}</p>
              </div>
              <div className="feature-visual reveal-right reveal-late">
                <div className="feature-visual-title">{t('landing.integrationsFeature.visualTitle')}</div>
                <div className="integration-logos-grid">
                  <div className="integration-logo-card">
                    <img src="/assets/integrations/shopify.svg" alt="Shopify" className="integration-logo-img" />
                    <span>Shopify</span>
                  </div>
                  <div className="integration-logo-card">
                    <img src="/assets/integrations/gmail.svg" alt="Gmail" className="integration-logo-img" />
                    <span>Gmail</span>
                  </div>
                  <div className="integration-logo-card">
                    <img src="/assets/integrations/outlook.png" alt="Outlook" className="integration-logo-img" />
                    <span>Outlook</span>
                  </div>
                  <div className="integration-logo-card">
                    <img src="/assets/integrations/webhook.png" alt="CRM Webhook" className="integration-logo-img" />
                    <span>CRM Webhook</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="feature-row reverse">
              <div className="reveal-right reveal-late">
                <span className="kicker">{t('landing.securityFeature.kicker')}</span>
                <h2 className="section-title">{t('landing.securityFeature.title')}</h2>
                <p className="section-sub">{t('landing.securityFeature.desc')}</p>
              </div>
              <div className="feature-visual reveal-left reveal-late">
                <div className="feature-visual-title">{t('landing.securityFeature.visualTitle')}</div>
                <div className="shield-grid">
                  <div className="shield-item">
                    <strong>{'\u{1F510}'} {t('landing.securityFeature.auth')}</strong>
                    <span>{t('landing.securityFeature.authDesc')}</span>
                  </div>
                  <div className="shield-item">
                    <strong>{'\u{1F6E1}\u{FE0F}'} {t('landing.securityFeature.guardrail')}</strong>
                    <span>{t('landing.securityFeature.guardrailDesc')}</span>
                  </div>
                  <div className="shield-item">
                    <strong>{'\u{1F512}'} {t('landing.securityFeature.masking')}</strong>
                    <span>{t('landing.securityFeature.maskingDesc')}</span>
                  </div>
                  <div className="shield-item">
                    <strong>{'\u{1F4CB}'} {t('landing.securityFeature.kvkk')}</strong>
                    <span>{t('landing.securityFeature.kvkkDesc')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ CTA ═══ */}
        <section className="cta" id="cta">
          <div className="shell">
            <div className="cta-panel reveal-scale">
              <span className="kicker">{t('landing.ctaSection.kicker')}</span>
              <h2 className="section-title">{t('landing.ctaSection.title')}</h2>
              <p className="section-sub">{t('landing.ctaSection.subtitle')}</p>
              <div className="cta-actions">
                <a
                  href="/signup"
                  className="lp-btn"
                  onClick={() => trackCtaClick({
                    ctaName: 'bottom_cta_primary',
                    ctaLocation: 'landing_bottom_cta',
                    destination: '/signup',
                    locale,
                  })}
                >
                  {t('landing.ctaSection.btn2')}
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default LandingPage;
