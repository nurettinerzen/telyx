'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackPageView } from '@/lib/marketingAnalytics';

export default function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    if (pathname === '/trial-landing') return;

    trackPageView({
      pageType: 'public',
      page_path: pathname,
    });
  }, [pathname]);

  return null;
}
