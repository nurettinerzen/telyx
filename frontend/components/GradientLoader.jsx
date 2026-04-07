/**
 * GradientLoader Component
 * Bland AI inspired gradient blob loading animation
 * Pastel color transitions with smooth pulse effect
 */

import React from 'react';
import { cn } from '@/lib/utils';

export default function GradientLoader({
  text = 'Yükleniyor...',
  size = 'default',
  className,
}) {
  const sizeClasses = {
    sm: 'w-16 h-16',
    default: 'w-24 h-24',
    lg: 'w-32 h-32',
  };

  return (
    <div className={cn('flex flex-col items-center justify-center gap-6', className)}>
      {/* Gradient blob container */}
      <div className={cn('relative', sizeClasses[size])}>
        {/* Primary blob */}
        <div
          className="absolute inset-0 rounded-full bg-gradient-to-r from-[#051752] via-[#000ACF] to-[#00C4E6] opacity-70 blur-xl animate-blob"
          style={{ animationDuration: '7s' }}
        />

        {/* Secondary blob */}
        <div
          className="absolute inset-2 rounded-full bg-gradient-to-r from-[#000ACF] via-[#006FEB] to-[#00C4E6] opacity-70 blur-lg animate-blob"
          style={{ animationDuration: '7s', animationDelay: '2s' }}
        />

        {/* Center glow */}
        <div
          className="absolute inset-4 rounded-full bg-gradient-to-r from-[#006FEB] to-[#00C4E6] opacity-80 blur-md animate-pulse-slow"
        />

        {/* Inner circle */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-1/3 h-1/3 rounded-full bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm" />
        </div>
      </div>

      {/* Loading text */}
      {text && (
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 animate-pulse">
          {text}
        </p>
      )}
    </div>
  );
}

/**
 * Full page loading overlay
 */
export function GradientLoaderOverlay({ text }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
      <GradientLoader text={text} size="lg" />
    </div>
  );
}

/**
 * Inline loading state for cards/sections
 */
export function GradientLoaderInline({ text, className }) {
  return (
    <div className={cn('flex items-center justify-center py-12', className)}>
      <GradientLoader text={text} size="default" />
    </div>
  );
}
