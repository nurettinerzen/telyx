'use client';

import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import {
  DashboardFlowBackdrop,
  getDashboardFlowPageStyle,
  getDashboardFlowSurfaceStyle,
} from '@/components/dashboard/DashboardFlowBackdrop';

export function AuthFlowShell({ children, containerClassName = 'max-w-md', className }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={getDashboardFlowPageStyle(dark)}
    >
      <DashboardFlowBackdrop dark={dark} />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
        <div className={cn('w-full', containerClassName, className)}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function AuthFlowCard({ children, className }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  return (
    <div
      className={cn(
        'rounded-[28px] border p-8 shadow-[0_28px_90px_rgba(5,23,82,0.12)] sm:p-10',
        className
      )}
      style={getDashboardFlowSurfaceStyle(dark, 'elevated')}
    >
      {children}
    </div>
  );
}
