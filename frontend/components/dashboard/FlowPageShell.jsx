'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import {
  DashboardFlowBackdrop,
  getDashboardFlowPageStyle,
  getDashboardFlowSurfaceStyle,
} from '@/components/dashboard/DashboardFlowBackdrop';

export const FLOW_ACCENTS = {
  navy: {
    hex: '#051752',
    darkFill: 'rgba(5, 23, 82, 0.38)',
    lightFill: 'rgba(5, 23, 82, 0.08)',
    darkGlow: 'rgba(5, 23, 82, 0.28)',
  },
  deepBlue: {
    hex: '#000ACF',
    darkFill: 'rgba(0, 10, 207, 0.34)',
    lightFill: 'rgba(0, 10, 207, 0.08)',
    darkGlow: 'rgba(0, 10, 207, 0.22)',
  },
  lightBlue: {
    hex: '#006FEB',
    darkFill: 'rgba(0, 111, 235, 0.32)',
    lightFill: 'rgba(0, 111, 235, 0.08)',
    darkGlow: 'rgba(0, 111, 235, 0.22)',
  },
  teal: {
    hex: '#00C4E6',
    darkFill: 'rgba(0, 196, 230, 0.28)',
    lightFill: 'rgba(0, 196, 230, 0.08)',
    darkGlow: 'rgba(0, 196, 230, 0.2)',
  },
};

export function useFlowTheme() {
  const { resolvedTheme } = useTheme();
  return { dark: resolvedTheme === 'dark' };
}

export function FlowPageShell({ children, className, contentClassName, backdropClassName }) {
  const { dark } = useFlowTheme();

  return (
    <section
      className={cn(
        'relative isolate overflow-hidden rounded-[28px] border p-5 md:p-6 lg:p-7',
        dark
          ? 'border-white/[0.08] shadow-[0_28px_90px_rgba(2,6,23,0.48)]'
          : 'border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,245,255,0.94))] shadow-[0_22px_60px_rgba(15,23,42,0.08)]',
        className,
      )}
      style={dark ? getDashboardFlowPageStyle(dark) : undefined}
    >
      <DashboardFlowBackdrop dark={dark} className={cn('opacity-95', backdropClassName)} />
      <div className={cn('relative z-10 space-y-6', contentClassName)}>{children}</div>
    </section>
  );
}

export function FlowPanel({ children, className, tone = 'panel', style }) {
  const { dark } = useFlowTheme();

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border p-5',
        dark
          ? 'border-white/[0.08]'
          : 'border-slate-200/80 bg-white/90 shadow-[0_16px_40px_rgba(15,23,42,0.06)]',
        className,
      )}
      style={{
        ...(dark ? getDashboardFlowSurfaceStyle(dark, tone) : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function FlowBadge({ children, accent = 'teal', className }) {
  const { dark } = useFlowTheme();
  const tone = FLOW_ACCENTS[accent] || FLOW_ACCENTS.teal;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium tracking-[0.12em] uppercase',
        className,
      )}
      style={{
        color: tone.hex,
        backgroundColor: dark ? tone.darkFill : tone.lightFill,
        borderColor: dark ? `${tone.hex}55` : `${tone.hex}25`,
      }}
    >
      {children}
    </span>
  );
}

export function FlowStatCard({ icon: Icon, value, label, hint, accent = 'teal', className }) {
  const { dark } = useFlowTheme();
  const tone = FLOW_ACCENTS[accent] || FLOW_ACCENTS.teal;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border p-4',
        dark
          ? 'border-white/[0.08]'
          : 'border-slate-200/80 bg-white/88 shadow-[0_14px_40px_rgba(15,23,42,0.06)]',
        className,
      )}
      style={
        dark
          ? {
              ...getDashboardFlowSurfaceStyle(dark, 'panel'),
              background: `linear-gradient(145deg, ${tone.darkFill} 0%, rgba(7,14,33,0.74) 100%)`,
            }
          : {
              background: `linear-gradient(145deg, ${tone.lightFill} 0%, rgba(255,255,255,0.98) 100%)`,
            }
      }
    >
      {dark ? (
        <div
          aria-hidden
          className="absolute -right-8 -top-8 h-24 w-24 rounded-full blur-3xl"
          style={{ background: tone.darkGlow }}
        />
      ) : null}

      <div className="relative flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <p className={cn('text-2xl font-semibold tracking-tight', dark ? 'text-white' : 'text-slate-900')}>
            {value}
          </p>
          <p className={cn('text-sm font-medium', dark ? 'text-slate-300' : 'text-slate-700')}>{label}</p>
          {hint ? <p className={cn('text-xs', dark ? 'text-slate-400' : 'text-slate-500')}>{hint}</p> : null}
        </div>

        {Icon ? (
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border"
            style={{
              color: tone.hex,
              borderColor: dark ? `${tone.hex}45` : `${tone.hex}20`,
              backgroundColor: dark ? tone.darkFill : tone.lightFill,
            }}
          >
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
