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

export function getDashboardTableHeaderClass(dark, className) {
  return cn(
    dark ? 'bg-white/[0.03] border-b border-white/10' : 'bg-slate-50/80 border-b border-slate-200',
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
      ? 'border-white/10 bg-[#081224] text-slate-200 [&>svg]:text-cyan-300/60 [&_[data-placeholder]]:text-cyan-200/50'
      : 'border-slate-200 bg-white text-slate-900 [&_[data-placeholder]]:text-sky-500/45',
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
