import { cn } from '@/lib/utils';

export const DASHBOARD_BRAND = {
  cyan: {
    color: '#00C4E6',
    strong: '#00A8C7',
    light: '#E6FBFF',
    darkGlow: 'rgba(0,196,230,0.16)',
  },
  blue: {
    color: '#4F7CFF',
    strong: '#305CE5',
    light: '#EEF4FF',
    darkGlow: 'rgba(79,124,255,0.16)',
  },
  indigo: {
    color: '#000ACF',
    strong: '#1D4ED8',
    light: '#EEF2FF',
    darkGlow: 'rgba(0,10,207,0.18)',
  },
  emerald: {
    color: '#34D399',
    strong: '#10B981',
    light: '#ECFDF5',
    darkGlow: 'rgba(52,211,153,0.16)',
  },
  amber: {
    color: '#FBBF24',
    strong: '#F59E0B',
    light: '#FFFBEB',
    darkGlow: 'rgba(251,191,36,0.16)',
  },
  rose: {
    color: '#FB7185',
    strong: '#F43F5E',
    light: '#FFF1F2',
    darkGlow: 'rgba(251,113,133,0.16)',
  },
  neutral: {
    color: '#94A3B8',
    strong: '#64748B',
    light: '#F8FAFC',
    darkGlow: 'rgba(148,163,184,0.12)',
  },
};

export function getDashboardPanelClass(dark, className) {
  return cn(
    'rounded-xl border shadow-sm',
    dark
      ? 'border-white/10 bg-[#081224]/95 shadow-[0_24px_70px_rgba(2,6,23,0.32)]'
      : 'border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]',
    className
  );
}

export function getDashboardInsetClass(dark, className) {
  return cn(
    'rounded-lg border',
    dark ? 'border-white/10 bg-[#0B1730]/88' : 'border-slate-200 bg-slate-50/80',
    className
  );
}

export function getDashboardIconSurfaceClass(dark, className) {
  return cn(
    'rounded-lg border',
    dark ? 'border-white/10 bg-[#0B1730]/88 text-slate-300' : 'border-slate-200 bg-slate-50/80 text-slate-600',
    className
  );
}

export function getDashboardOverlaySurfaceClass(dark, className) {
  return cn(
    'rounded-xl border shadow-[0_24px_70px_rgba(15,23,42,0.16)] backdrop-blur-xl',
    dark
      ? 'border-white/10 bg-[#081224]/98 text-slate-100 shadow-[0_28px_80px_rgba(2,6,23,0.48)]'
      : 'border-slate-200 bg-white/98 text-slate-900',
    className
  );
}

export function getDashboardDropdownItemClass(dark, className) {
  return cn(
    dark
      ? 'text-slate-100 data-[highlighted]:bg-white/[0.06] data-[highlighted]:text-slate-100 focus:bg-white/[0.06] focus:text-slate-100'
      : 'text-slate-900 data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900 focus:bg-slate-100 focus:text-slate-900',
    className
  );
}

export function getDashboardConversationItemClass(dark, selected = false, className) {
  return cn(
    'w-full rounded-xl border p-3 text-left transition',
    selected
      ? dark
        ? 'border-emerald-500/35 bg-emerald-950/20 shadow-[0_18px_40px_rgba(16,185,129,0.08)]'
        : 'border-emerald-300 bg-emerald-50/70'
      : dark
        ? 'border-transparent bg-transparent hover:border-white/10 hover:bg-[#0B1730]/88'
        : 'border-transparent hover:border-neutral-200 hover:bg-white',
    className
  );
}

export function getDashboardMessageBubbleClass(dark, tone = 'assistant', className) {
  const styles = {
    system: dark
      ? 'w-full max-w-xl rounded-xl border border-amber-500/30 bg-amber-950/18 px-4 py-3 text-sm text-amber-100'
      : 'w-full max-w-xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800',
    user: 'ml-auto max-w-2xl rounded-2xl bg-emerald-600 px-4 py-3 text-sm text-white',
    human: dark
      ? 'max-w-2xl rounded-2xl border border-blue-500/20 bg-blue-950/24 px-4 py-3 text-sm text-blue-100'
      : 'max-w-2xl rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-950',
    assistant: dark
      ? 'max-w-2xl rounded-2xl border border-white/10 bg-[#0B1730]/88 px-4 py-3 text-sm text-neutral-100'
      : 'max-w-2xl rounded-2xl bg-neutral-100 px-4 py-3 text-sm text-neutral-900',
  };

  return cn(styles[tone] || styles.assistant, className);
}

export function getDashboardTableHeaderClass(dark, className) {
  return cn(
    dark
      ? '!bg-[#0B1730]/88 border-b border-white/10 [&_th]:!bg-[#0B1730]/88'
      : 'bg-slate-50/80 border-b border-slate-200 [&_th]:bg-slate-50/80',
    className
  );
}

export function getDashboardTableHeadCellClass(dark, className) {
  return cn(
    dark ? '!bg-[#0B1730]/88' : 'bg-slate-50/80',
    className
  );
}

export function getDashboardTableHeaderStyle(dark) {
  return {
    backgroundColor: dark ? 'rgba(11, 23, 48, 0.88)' : 'rgba(248, 250, 252, 0.8)',
  };
}

export function getDashboardTableHeadCellStyle(dark) {
  return {
    backgroundColor: dark ? 'rgba(11, 23, 48, 0.88)' : 'rgba(248, 250, 252, 0.8)',
  };
}

export function getDashboardProgressTrackClass(dark, className) {
  return cn(
    'overflow-hidden rounded-full',
    dark
      ? 'border border-white/10 !bg-[#0B1730]/88'
      : 'border border-slate-200 bg-slate-200/80',
    className
  );
}

export function getDashboardRowHoverClass(dark, className) {
  return cn(dark ? 'hover:bg-white/[0.03]' : 'hover:bg-slate-50/60', className);
}

export function getDashboardDividerClass(dark, className) {
  return cn(dark ? 'border-white/10 divide-white/10' : 'border-slate-200 divide-slate-200', className);
}

export function getDashboardSkeletonClass(dark, className) {
  return cn(
    dark
      ? 'bg-[linear-gradient(135deg,rgba(8,18,36,0.96),rgba(48,92,229,0.18),rgba(0,168,199,0.14))]'
      : 'bg-[linear-gradient(135deg,#EEF4FF,#E6FBFF)]',
    className
  );
}

export function getDashboardInputClass(dark, className) {
  return cn(
    dark
      ? 'border-white/10 bg-[#081224] text-slate-200 placeholder:text-cyan-200/45'
      : 'border-slate-200 bg-white text-slate-900 placeholder:text-sky-500/45',
    className
  );
}

export function getDashboardSelectTriggerClass(dark, className) {
  return cn(
    dark
      ? 'border-white/10 bg-[#081224] text-slate-200 data-[placeholder]:text-cyan-200/50 [&>svg]:text-cyan-300/60'
      : 'border-slate-200 bg-white text-slate-900 data-[placeholder]:text-sky-500/45',
    className
  );
}

export function getDashboardSelectContentClass(dark, className) {
  return cn(dark ? 'border-white/10 bg-[#081224] text-slate-200' : '', className);
}

export function getDashboardTabsListClass(dark, className) {
  return cn(
    dark ? 'bg-[#081224] text-slate-400 border border-white/10 rounded-xl p-1' : 'bg-slate-100 text-slate-500 border border-slate-200 rounded-xl p-1',
    className
  );
}

export function getDashboardTabsTriggerClass(dark, className) {
  return cn(
    dark
      ? 'rounded-lg data-[state=active]:bg-[#0D1A30] data-[state=active]:text-white data-[state=active]:shadow-none'
      : 'rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900',
    className
  );
}

export function getDashboardStatCardClass(dark, className) {
  return cn(
    'relative overflow-hidden rounded-lg border p-4',
    dark ? 'border-white/10 text-white' : 'border-slate-200 text-slate-900',
    className
  );
}

export function getDashboardStatCardStyle(dark, tone = 'cyan') {
  const accent = DASHBOARD_BRAND[tone] || DASHBOARD_BRAND.cyan;

  return {
    background: dark
      ? `linear-gradient(145deg, rgba(7,14,30,0.96) 12%, ${accent.darkGlow} 100%)`
      : `linear-gradient(145deg, ${accent.light} 0%, rgba(255,255,255,0.98) 72%)`,
  };
}

export function getDashboardBadgeClass(dark, tone = 'neutral', className) {
  const styles = {
    cyan: dark ? 'bg-cyan-500/10 text-cyan-300' : 'bg-cyan-50 text-cyan-700',
    blue: dark ? 'bg-blue-500/10 text-blue-300' : 'bg-blue-50 text-blue-700',
    indigo: dark ? 'bg-indigo-500/10 text-indigo-300' : 'bg-indigo-50 text-indigo-700',
    emerald: dark ? 'bg-emerald-500/10 text-emerald-300' : 'bg-emerald-50 text-emerald-700',
    amber: dark ? 'bg-amber-500/10 text-amber-300' : 'bg-amber-50 text-amber-700',
    rose: dark ? 'bg-rose-500/10 text-rose-300' : 'bg-rose-50 text-rose-700',
    neutral: dark ? 'bg-white/8 text-slate-300' : 'bg-slate-100 text-slate-600',
  };

  return cn('border-0 shadow-none', styles[tone] || styles.neutral, className);
}
