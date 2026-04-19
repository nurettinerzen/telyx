'use client';

import { cn } from '@/lib/utils';

export const DASHBOARD_FLOW_PALETTE = {
  navy: '#051752',
  deepBlue: '#000ACF',
  lightBlue: '#006FEB',
  teal: '#00C4E6',
  ink: '#020817',
};

export function getDashboardFlowPageStyle(dark) {
  if (!dark) return undefined;

  return {
    background: 'linear-gradient(140deg, #030917 0%, #04122d 28%, #051752 52%, #021126 78%, #000814 100%)',
  };
}

export function getDashboardFlowSurfaceStyle(dark, tone = 'panel') {
  if (!dark) return undefined;

  const tones = {
    sidebar: 'linear-gradient(180deg, rgba(3,10,32,0.94), rgba(4,10,28,0.88))',
    main: 'linear-gradient(180deg, rgba(7,14,36,0.84), rgba(5,12,30,0.78))',
    panel: 'linear-gradient(180deg, rgba(9,17,39,0.78), rgba(7,14,33,0.72))',
    muted: 'rgba(255,255,255,0.04)',
    elevated: 'linear-gradient(180deg, rgba(13,23,51,0.82), rgba(7,13,31,0.74))',
  };

  return {
    background: tones[tone] || tones.panel,
    borderColor: 'rgba(148,163,184,0.12)',
    backdropFilter: 'blur(18px)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 24px 60px rgba(2,6,23,0.28)',
  };
}

export function getDashboardFlowDividerStyle(dark, side = 'bottom') {
  if (!dark) return undefined;
  return { [`border${side[0].toUpperCase()}${side.slice(1)}`]: '1px solid rgba(255,255,255,0.08)' };
}

export function DashboardFlowBackdrop({ dark, className }) {
  if (!dark) return null;

  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <div
        className="absolute -top-28 left-[5%] h-72 w-72 rounded-full blur-[110px] opacity-70"
        style={{ background: 'rgba(0,196,230,0.20)' }}
      />
      <div
        className="absolute top-[12%] right-[8%] h-80 w-80 rounded-full blur-[130px] opacity-55"
        style={{ background: 'rgba(0,111,235,0.20)' }}
      />
      <div
        className="absolute bottom-[-12%] left-[24%] h-96 w-96 rounded-full blur-[140px] opacity-50"
        style={{ background: 'rgba(0,10,207,0.18)' }}
      />
      <div
        className="absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage: [
            'radial-gradient(circle at top, rgba(255,255,255,0.18), transparent 32%)',
            'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          ].join(','),
          backgroundSize: '100% 100%, 34px 34px, 34px 34px',
          backgroundPosition: 'center center',
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.07),_transparent_38%)]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(180deg,transparent,rgba(2,6,23,0.45))]" />
    </div>
  );
}
