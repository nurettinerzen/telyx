'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Mail, MessageCircle, PhoneCall } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { createScrollDepthTracker, trackCtaClick, trackPageView } from '@/lib/marketingAnalytics';
import ChatDemoSection from '@/components/ChatDemoSection';
import '@/styles/landing.css';

function WhatsAppLineIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5.2 19.2l1.1-3.1a7.2 7.2 0 1 1 2.1 2.1l-3.2 1Z" />
      <path d="M9.2 8.4c.2-.4.4-.5.8-.5h.4c.3 0 .5.2.6.4l.5 1.2c.1.3.1.5-.1.7l-.4.5c.5 1 1.3 1.8 2.4 2.4l.5-.4c.2-.2.5-.2.7-.1l1.2.5c.3.1.4.3.4.6v.4c0 .4-.2.6-.5.8-.7.3-1.6.2-2.5-.2-1.2-.5-2.3-1.2-3.3-2.2-1-1-1.8-2.2-2.2-3.3-.3-.9-.4-1.8-.1-2.5Z" />
    </svg>
  );
}

const TRIAL_CHANNEL_ICONS = [PhoneCall, WhatsAppLineIcon, MessageCircle, Mail];

function getTrialLandingCopy(locale, variant = 'offer') {
  if (variant === 'ops') {
    if (locale === 'en') {
      return {
        hero: {
          lines: ['Bring every customer touchpoint', 'into one operating flow.'],
          tagline:
            'Phone, WhatsApp, email, and web chat run from the same AI workspace, so your team sees what matters first.',
          primaryCta: 'See the live flow',
          secondaryNote: '14-day trial. No credit card.',
          signals: ['Phone + WhatsApp + Email + Chat', 'AI triage and handoff', 'Setup without a card'],
        },
        manifesto:
          'Telyx is not another inbox. It is the operating layer between your customers, your channels, and your team.',
        manifestoEmphasis: ['operating', 'customers,', 'channels,'],
        dashboard: {
          title: 'Live operating layer',
          pills: ['Now', 'Today', 'This week'],
          metrics: [
            { label: 'Connected channels', value: '4', color: 'primary', trend: 'One shared customer view' },
            { label: 'First response', value: '5', color: 'accent', prefix: '< ', suffix: ' s', trend: 'Immediate triage' },
            { label: 'Human handoffs', value: '3', color: 'info', trend: 'Only when judgment is needed' },
            { label: 'Setup window', value: '14', color: 'warning', suffix: ' min', trend: 'To launch the first flow' },
          ],
          channelLoad: [
            { name: 'Phone', width: '72', color: 'primary' },
            { name: 'WhatsApp', width: '63', color: 'accent' },
            { name: 'Email', width: '54', color: 'info' },
            { name: 'Web Chat', width: '46', color: 'warning' },
          ],
          activities: [
            { text: 'A WhatsApp question was answered from order context', time: 'Now', color: 'var(--lp-accent)' },
            { text: 'A call was handed to the right team member', time: '2 min', color: 'var(--lp-info)' },
            { text: 'An email draft was prepared for approval', time: '5 min', color: 'var(--lp-warning)' },
            { text: 'A web chat lead entered the sales flow', time: '8 min', color: 'var(--lp-primary)' },
          ],
        },
        channels: {
          kicker: 'One operational surface',
          title: 'Every channel keeps the same context.',
          subtitle:
            'Instead of scattering customer conversations across tools, Telyx keeps the thread, the action, and the handoff in one place.',
          items: [
            { icon: '📞', title: 'Phone', description: 'Answer, qualify, summarize, and hand over urgent calls without losing context.' },
            { icon: '💬', title: 'WhatsApp', description: 'Handle order, support, and sales questions with consistent brand language.' },
            { icon: '🌐', title: 'Web Chat', description: 'Meet visitors immediately and route serious intent into the right next step.' },
            { icon: '📧', title: 'Email', description: 'Classify requests and prepare replies that your team can approve or adjust.' },
          ],
        },
        proof: [
          { count: '4', suffix: ' channels', title: 'One customer view', description: 'A single thread across phone, WhatsApp, email, and chat.', color: 'primary' },
          { count: '3', suffix: ' handoffs', title: 'Control stays human', description: 'AI handles repeatable work, your team handles judgment.', color: 'accent' },
          { count: '14', suffix: ' min', title: 'First flow setup', description: 'Start with a focused use case before connecting everything.', color: 'info' },
        ],
        workflow: {
          kicker: 'Operating rhythm',
          title: 'Start from one painful flow, then expand channel by channel.',
          subtitle:
            'The strongest trial is not a tour of features. It is one real workflow where the team can feel the load moving.',
          steps: [
            { step: '01', title: 'Pick the use case', description: 'Choose support, sales, callbacks, order status, or appointment handling.' },
            { step: '02', title: 'Add context', description: 'Connect the assistant to the knowledge, CRM, commerce, or calendar data it needs.' },
            { step: '03', title: 'Turn on one channel', description: 'Measure the first flow before adding WhatsApp, email, chat, or phone together.' },
            { step: '04', title: 'Review handoffs', description: 'See what AI resolved, what it escalated, and where your team should stay involved.' },
          ],
        },
        cta: {
          kicker: 'Ready to see the operating layer?',
          title: 'Start with one workflow your team already feels every day.',
          subtitle:
            'Use the trial to test real customer communication, not just screens. No card required.',
          button: 'See the live flow',
        },
      };
    }

    return {
      hero: {
        lines: ['Müşteri temaslarını', 'tek operasyon akışında toplayın.'],
        tagline:
          'Telefon, WhatsApp, e-posta ve web chat aynı AI çalışma alanında ilerler; ekibiniz önce gerçekten önemli olana bakar.',
        primaryCta: 'Canlı akışı görün',
        secondaryNote: '14 gün deneme. Kredi kartı yok.',
        signals: ['Telefon + WhatsApp + E-posta + Chat', 'AI triage ve insan devri', 'Kartsız kurulum'],
      },
      manifesto:
        'Telyx yeni bir gelen kutusu değil. Müşteriniz, kanallarınız ve ekibiniz arasındaki operasyon katmanıdır.',
      manifestoEmphasis: ['operasyon', 'Müşteriniz,', 'kanallarınız'],
      dashboard: {
        title: 'Canlı operasyon katmanı',
        pills: ['Şimdi', 'Bugün', 'Bu hafta'],
        metrics: [
          { label: 'Bağlı kanal', value: '4', color: 'primary', trend: 'Tek müşteri görünümü' },
          { label: 'İlk yanıt', value: '5', color: 'accent', prefix: '< ', suffix: ' sn', trend: 'Anında triage' },
          { label: 'İnsan devri', value: '3', color: 'info', trend: 'Yalnızca muhakeme gerektiğinde' },
          { label: 'İlk akış', value: '14', color: 'warning', suffix: ' dk', trend: 'Kuruluma başlamak için' },
        ],
        channelLoad: [
          { name: 'Telefon', width: '72', color: 'primary' },
          { name: 'WhatsApp', width: '63', color: 'accent' },
          { name: 'E-posta', width: '54', color: 'info' },
          { name: 'Web Chat', width: '46', color: 'warning' },
        ],
        activities: [
          { text: 'WhatsApp sorusu sipariş bağlamıyla yanıtlandı', time: 'Şimdi', color: 'var(--lp-accent)' },
          { text: 'Telefon görüşmesi doğru ekip üyesine devredildi', time: '2 dk', color: 'var(--lp-info)' },
          { text: 'E-posta taslağı onay için hazırlandı', time: '5 dk', color: 'var(--lp-warning)' },
          { text: 'Web chat lead’i satış akışına taşındı', time: '8 dk', color: 'var(--lp-primary)' },
        ],
      },
      channels: {
        kicker: 'Tek operasyon yüzeyi',
        title: 'Her kanal aynı müşteri bağlamını taşır.',
        subtitle:
          'Müşteri konuşmaları araçlara dağılmak yerine aynı yerde bağlam, aksiyon ve insan devriyle birlikte ilerler.',
        items: [
          { icon: '📞', title: 'Telefon', description: 'Aramaları karşılayın, özetleyin, nitelendirin ve acil olanları bağlamıyla ekibe devredin.' },
          { icon: '💬', title: 'WhatsApp', description: 'Sipariş, destek ve satış sorularını aynı marka diliyle hızlıca yanıtlayın.' },
          { icon: '🌐', title: 'Web Chat', description: 'Ziyaretçiyi bekletmeden karşılayın ve ciddi niyeti doğru sonraki adıma taşıyın.' },
          { icon: '📧', title: 'E-posta', description: 'Talepleri sınıflandırın, ekibin onaylayabileceği cevap taslakları hazırlayın.' },
        ],
      },
      proof: [
        { count: '4', suffix: ' kanal', title: 'Tek müşteri görünümü', description: 'Telefon, WhatsApp, e-posta ve chat aynı bağlamda ilerler.', color: 'primary' },
        { count: '3', suffix: ' devir', title: 'Kontrol insanda kalır', description: 'Tekrarlı işi AI alır, muhakeme isteyen iş ekibe kalır.', color: 'accent' },
        { count: '14', suffix: ' dk', title: 'İlk akış kurulumu', description: 'Her şeyi bağlamadan önce tek bir net senaryoyla başlayın.', color: 'info' },
      ],
      workflow: {
        kicker: 'Operasyon ritmi',
        title: 'Önce en ağrılı akışı seçin, sonra kanal kanal genişletin.',
        subtitle:
          'En güçlü deneme bir özellik turu değil; ekibin yükün azaldığını hissedeceği gerçek bir iş akışıdır.',
        steps: [
          { step: '01', title: 'Kullanım senaryosunu seçin', description: 'Destek, satış, geri arama, sipariş durumu veya randevu akışıyla başlayın.' },
          { step: '02', title: 'Bağlamı ekleyin', description: 'Asistanın ihtiyaç duyduğu bilgi tabanı, CRM, e-ticaret veya takvim verisini bağlayın.' },
          { step: '03', title: 'İlk kanalı açın', description: 'WhatsApp, e-posta, chat veya telefonu birlikte açmadan önce ilk akışı ölçün.' },
          { step: '04', title: 'Devirleri inceleyin', description: 'AI neyi çözdü, neyi devretti, ekip nerede kalmalı net biçimde görün.' },
        ],
      },
      cta: {
        kicker: 'Operasyon katmanını görmek ister misiniz?',
        title: 'Ekibinizin her gün hissettiği tek bir akıştan başlayın.',
        subtitle:
          'Denemeyi ekran gezisi için değil, gerçek müşteri iletişimini test etmek için kullanın. Kart gerekmez.',
        button: 'Canlı akışı görün',
      },
    };
  }

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
          { label: 'First response target', value: '5', color: 'accent', prefix: '< ', suffix: ' s', trend: 'Faster first touch' },
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
        { label: 'İlk yanıt hedefi', value: '5', color: 'accent', prefix: '< ', suffix: ' sn', trend: 'Hızlı ilk temas hissi' },
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
      title: 'Dört kanal, tek panel.',
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
        title: 'Aynı bağlam',
        description: 'Telefon, WhatsApp, e-posta ve web chat aynı operasyon ekranında buluşur.',
        color: 'warning',
      },
      {
        count: '3',
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

export default function TrialLandingPage({ variant = 'offer' }) {
  const { locale, t } = useLanguage();
  const pageRef = useRef(null);
  const copy = useMemo(() => getTrialLandingCopy(locale, variant), [locale, variant]);

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
    trackPageView({
      pageType: 'trial_landing',
      locale,
      landing_variant: variant,
    });

    const onScrollMilestone = createScrollDepthTracker({
      pageType: 'trial_landing',
      locale,
      landing_variant: variant,
    });

    window.addEventListener('scroll', onScrollMilestone, { passive: true });
    onScrollMilestone();

    return () => window.removeEventListener('scroll', onScrollMilestone);
  }, [locale, variant]);

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

    {
      let ticking = false;

      function updateHero() {
        const hero = root.querySelector('.hero');
        const lines = hero?.querySelectorAll('.hero-line') || [];
        const tagline = hero?.querySelector('.hero-tagline');
        const primaryCta = hero?.querySelector('.trial-hero-primary-cta');
        const scrolled = window.scrollY;
        const isCompact = isCompactViewport();
        const thresholds = isCompact ? [0, 32, 64, 96] : [0, 64, 128, 192];
        const taglineAt = isCompact ? 116 : 220;
        const ctaAt = isCompact ? 132 : 248;

        for (let i = 0; i < lines.length; i += 1) {
          lines[i].classList.toggle('active', scrolled >= thresholds[i]);
        }

        tagline?.classList.toggle('active', scrolled >= taglineAt);
        primaryCta?.classList.toggle('active', scrolled >= ctaAt);

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
      const initialHeroFrame = requestAnimationFrame(updateHero);
      cleanups.push(() => {
        cancelAnimationFrame(initialHeroFrame);
        window.removeEventListener('scroll', onScroll);
      });
    }

    {
      const section = root.querySelector('.manifesto');
      const words = root.querySelectorAll('.mw');

      if (section && words.length) {
        let ticking = false;

        function updateManifesto() {
          const rect = section.getBoundingClientRect();
          const viewHeight = window.innerHeight;
          const isCompact = isCompactViewport();
          const revealStartScroll = isCompact ? 150 : 280;
          const start = viewHeight * (isCompact ? 0.5 : 0.62);
          const end = -rect.height * 0.3;
          const rawProgress = Math.max(0, Math.min(1, (start - rect.top) / (start - end)));
          const progress = window.scrollY < revealStartScroll ? 0 : rawProgress;
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
            entry.target.classList.toggle('visible', entry.isIntersecting);
          });
        },
        { threshold: 0, rootMargin: '0px 0px -80px 0px' }
      );

      revealNodes.forEach((node) => observer.observe(node));
      cleanups.push(() => observer.disconnect());
    }

    {
      const gridIds = ['trialChannelsGrid', 'trialProofGrid', 'trialStepsGrid'];
      const cardObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            entry.target.classList.toggle('visible', entry.isIntersecting);
          });
        },
        { threshold: 0, rootMargin: '0px 0px -80px 0px' }
      );

      gridIds.forEach((id) => {
        const grid = root.querySelector(`#${id}`);
        if (!grid) return;
        const cards = grid.querySelectorAll('.scroll-card');
        cards.forEach((card, i) => {
          card.style.transitionDelay = `${i * 60}ms`;
          cardObserver.observe(card);
        });
      });

      cleanups.push(() => cardObserver.disconnect());
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
          { threshold: isCompactViewport() ? 0.12 : 0.5, rootMargin: isCompactViewport() ? '0px 0px 80px 0px' : '0px 0px -50px 0px' }
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
                entry.target.style.transform = `scaleX(${Number(entry.target.dataset.width || 0) / 100})`;
              } else {
                entry.target.style.transform = 'scaleX(0)';
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
    <div className={`landing-page trial-landing-page trial-landing-${variant}`} ref={pageRef}>
      <div className="lp-page">
          <div className="glow glow-l" aria-hidden="true" />
          <div className="glow glow-r" aria-hidden="true" />

          <ChatDemoSection
            variant="hero"
            cta={(
              <button
                type="button"
                className="lp-btn"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('telyx:open-chat'));
                  }
                  trackCtaClick({
                    ctaName: 'trial_landing_test_assistant',
                    ctaLocation: 'trial_landing_hero',
                    destination: 'chat-widget',
                    locale,
                    landing_variant: variant,
                  });
                }}
              >
                {t('landing.chatDemoSection.testButton')}
              </button>
            )}
          />

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
                {copy.channels.items.map((channel, index) => {
                  const ChannelIcon = TRIAL_CHANNEL_ICONS[index % TRIAL_CHANNEL_ICONS.length];

                  return (
                    <div key={channel.title} className={`channel-card ch-${(index % 4) + 1} scroll-card`}>
                      <div className="trial-channel-heading">
                        <span className="trial-channel-icon" aria-hidden="true">
                          <ChannelIcon />
                        </span>
                        <h3>{channel.title}</h3>
                      </div>
                      <p>{channel.description}</p>
                    </div>
                  );
                })}
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
                        landing_variant: variant,
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
