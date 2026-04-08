'use client';

import { useEffect, useRef } from 'react';
import {
  Bot, MessageCircle, Mail, HeadphonesIcon, Brain, Shield,
  Gauge, BarChart3, Globe, Webhook, Network, ShieldCheck,
  Sparkles, MessagesSquare, Phone, ShoppingCart, Code2,
  Activity, Cpu, Zap, Lock, BookOpen,
} from 'lucide-react';

const ICONS = [
  Bot, MessageCircle, Mail, HeadphonesIcon, Brain, Shield,
  Gauge, BarChart3, Globe, Webhook, Network, ShieldCheck,
  Sparkles, MessagesSquare, Phone, ShoppingCart, Code2,
  Activity, Cpu, Zap, Lock, BookOpen,
];

const ITEM_WIDTH = 100;
const SINGLE_SET_WIDTH = ICONS.length * ITEM_WIDTH;

export const IconRibbon = () => {
  const listRef = useRef(null);
  const offsetRef = useRef(0);
  const lastScrollRef = useRef(0);

  useEffect(() => {
    lastScrollRef.current = window.scrollY;

    let raf;
    const items = listRef.current?.querySelectorAll('.icon-ribbon-item');

    function update() {
      const scrollDelta = window.scrollY - lastScrollRef.current;
      lastScrollRef.current = window.scrollY;

      offsetRef.current -= scrollDelta * 0.12;

      while (offsetRef.current < -SINGLE_SET_WIDTH) offsetRef.current += SINGLE_SET_WIDTH;
      while (offsetRef.current > 0) offsetRef.current -= SINGLE_SET_WIDTH;

      if (listRef.current) {
        listRef.current.style.transform = `translate3d(${offsetRef.current}px, 0, 0)`;
      }

      // Sine wave Y bounce
      const scrollPhase = window.scrollY / 800;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          const phase = (i / ICONS.length) * Math.PI * 4 + scrollPhase * Math.PI * 6;
          const yOff = Math.sin(phase) * 22;
          items[i].style.transform = `translate3d(0, ${yOff}px, 0)`;
        }
      }

      raf = requestAnimationFrame(update);
    }
    update();

    return () => cancelAnimationFrame(raf);
  }, []);

  // Render 3 copies for seamless loop
  const allIcons = [...ICONS, ...ICONS, ...ICONS];

  return (
    <div className="py-20 overflow-hidden relative">
      {/* Fade edges */}
      <div className="absolute top-0 bottom-0 left-0 w-24 z-10 pointer-events-none bg-gradient-to-r from-white dark:from-neutral-950 to-transparent" />
      <div className="absolute top-0 bottom-0 right-0 w-24 z-10 pointer-events-none bg-gradient-to-l from-white dark:from-neutral-950 to-transparent" />

      <div ref={listRef} className="flex will-change-transform">
        {allIcons.map((Icon, i) => (
          <div
            key={i}
            className="icon-ribbon-item flex-shrink-0 w-[100px] h-[100px] flex items-center justify-center will-change-transform"
          >
            <div className="w-[72px] h-[72px] rounded-full bg-gray-100 dark:bg-neutral-800 flex items-center justify-center text-gray-500 dark:text-neutral-400 transition-all duration-300 hover:bg-primary/10 dark:hover:bg-primary-950/50 hover:text-primary-700 dark:hover:text-primary-300 hover:scale-110">
              <Icon className="w-7 h-7" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
