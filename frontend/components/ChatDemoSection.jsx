'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

const SECTOR_ORDER = ['ecommerce', 'restaurant', 'clinic', 'services'];

export default function ChatDemoSection() {
  const { t } = useLanguage();

  const sectorsData = t('landing.chatDemoSection.sectors');
  const sectors = useMemo(() => {
    if (!sectorsData || typeof sectorsData !== 'object') return [];
    return SECTOR_ORDER
      .filter((id) => sectorsData[id])
      .map((id) => ({ id, ...sectorsData[id] }));
  }, [sectorsData]);

  const sectionRef = useRef(null);
  const messagesRef = useRef(null);
  const sectorIndexRef = useRef(0);
  const [activeSector, setActiveSector] = useState(SECTOR_ORDER[0]);
  const [messages, setMessages] = useState([]);
  const [hasStarted, setHasStarted] = useState(false);
  const [restartTick, setRestartTick] = useState(0);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setHasStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -180px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!hasStarted || sectors.length === 0) return;

    let cancelled = false;
    const timeouts = [];
    const wait = (ms) =>
      new Promise((resolve) => {
        const id = setTimeout(resolve, ms);
        timeouts.push(id);
      });

    const run = async () => {
      while (!cancelled) {
        const idx = sectorIndexRef.current % sectors.length;
        const sector = sectors[idx];
        if (!sector?.messages?.length) return;

        setActiveSector(sector.id);
        setMessages([]);
        await wait(450);
        if (cancelled) return;

        for (let i = 0; i < sector.messages.length; i++) {
          if (cancelled) return;
          const msg = sector.messages[i];

          if (msg.type === 'bot') {
            setMessages((prev) => [...prev, { type: 'bot', typing: true }]);
            await wait(550 + Math.random() * 250);
            if (cancelled) return;
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { type: 'bot', text: msg.text };
              return next;
            });
            await wait(750 + Math.random() * 250);
          } else {
            setMessages((prev) => [...prev, { type: 'customer', text: msg.text }]);
            await wait(800 + Math.random() * 300);
          }
        }

        if (cancelled) return;
        await wait(2400);
        if (cancelled) return;
        sectorIndexRef.current = (sectorIndexRef.current + 1) % sectors.length;
      }
    };

    run();

    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
    };
  }, [hasStarted, restartTick, sectors]);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleChipClick = (sectorId) => {
    const idx = SECTOR_ORDER.indexOf(sectorId);
    if (idx < 0 || sectorId === activeSector) return;
    sectorIndexRef.current = idx;
    setActiveSector(sectorId);
    setMessages([]);
    setHasStarted(true);
    setRestartTick((tick) => tick + 1);
  };

  if (sectors.length === 0) return null;

  return (
    <section className="chat-demo" ref={sectionRef}>
      <div className="shell">
        <div className="chat-demo-grid" id="chatDemoGrid">
          <div className="chat-demo-copy">
            <span className="kicker">{t('landing.chatDemoSection.kicker')}</span>
            <h2 className="section-title">{t('landing.chatDemoSection.title')}</h2>
            <p className="section-sub">{t('landing.chatDemoSection.desc')}</p>

            <div
              className="chat-demo-chips"
              role="tablist"
              aria-label={t('landing.chatDemoSection.sectorsLabel')}
            >
              {sectors.map((sector) => {
                const isActive = sector.id === activeSector;
                return (
                  <button
                    key={sector.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`chat-demo-chip${isActive ? ' active' : ''}`}
                    onClick={() => handleChipClick(sector.id)}
                  >
                    <span className="chat-demo-chip-icon" aria-hidden="true">
                      {sector.icon}
                    </span>
                    <span className="chat-demo-chip-label">{sector.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="chat-window">
            <div className="chat-header">
              <div className="chat-avatar">TX</div>
              <div className="chat-header-info">
                <strong>{t('landing.chatDemoSection.assistantName')}</strong>
                <span>&#9679; {t('landing.chatDemoSection.online')}</span>
              </div>
            </div>
            <div className="chat-messages" ref={messagesRef}>
              {messages.map((msg, i) => (
                <div key={i} className={`chat-msg ${msg.type}`}>
                  {msg.typing ? (
                    <div className="typing-dots">
                      <span />
                      <span />
                      <span />
                    </div>
                  ) : (
                    msg.text
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
