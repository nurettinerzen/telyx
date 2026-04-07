'use client';

import { useRef, useCallback } from 'react';
import { motion } from 'framer-motion';

function BentoItem({ icon: Icon, title, desc, color, index }) {
  const itemRef = useRef(null);

  const handleMouseMove = useCallback((e) => {
    const rect = itemRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    itemRef.current.style.setProperty('--mouse-x', `${x}%`);
    itemRef.current.style.setProperty('--mouse-y', `${y}%`);
  }, []);

  return (
    <motion.div
      ref={itemRef}
      onMouseMove={handleMouseMove}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.08 }}
      className="sol-bento-item"
    >
      {Icon && (
        <div
          className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color || 'from-[#000ACF] to-[#00C4E6]'} flex items-center justify-center mb-4`}
        >
          <Icon className="w-6 h-6 text-white" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-[var(--sol-text-primary)] mb-2">{title}</h3>
      <p className="text-sm text-[var(--sol-text-secondary)] leading-relaxed">{desc}</p>
    </motion.div>
  );
}

export default function BentoGrid({ items = [], className = '' }) {
  return (
    <div className={`sol-bento ${className}`}>
      {items.map((item, i) => {
        const { key, ...rest } = item;
        return <BentoItem key={key || i} index={i} {...rest} />;
      })}
    </div>
  );
}
