'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackMarketingEvent } from '@/lib/marketingAnalytics';

export default function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    trackMarketingEvent('page_view', { page_path: pathname });
  }, [pathname]);

  return null;
}
