'use client';

import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import runtimeConfig from '@/lib/runtime-config';

export default function BetaEnvironmentBar() {
  const { locale } = useLanguage();

  if (!runtimeConfig.isBetaApp) {
    return null;
  }

  const isTr = locale === 'tr';

  return (
    <div className="border-b border-amber-300 bg-gradient-to-r from-amber-100 via-orange-100 to-amber-50 px-4 py-2.5 text-amber-950 shadow-sm dark:border-amber-900/40 dark:from-amber-950/80 dark:via-orange-950/70 dark:to-neutral-950 dark:text-amber-100">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-3 text-center text-sm font-medium">
        <span className="rounded-full bg-amber-900 px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.18em] text-amber-50 dark:bg-amber-300 dark:text-amber-950">
          BETA
        </span>
        <span>
          {isTr
            ? 'Beta ortamındasınız. Yeni özellikleri burada test edin; canlı müşteri verisi ve gerçek ödemelerde dikkatli olun.'
            : 'You are in the beta environment. Test new features here and be careful with live customer data and real payments.'}
        </span>
      </div>
    </div>
  );
}
