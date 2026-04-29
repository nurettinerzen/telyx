'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api';

function buildAdminAuthUrl(pathname) {
  const safePath = pathname?.startsWith('/dashboard/admin') ? pathname : '/dashboard/admin';
  return `/dashboard/admin-auth?returnTo=${encodeURIComponent(safePath)}`;
}

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const [status, setStatus] = useState('checking');
  const adminAuthUrl = useMemo(() => buildAdminAuthUrl(pathname), [pathname]);

  useEffect(() => {
    let cancelled = false;

    const verifyAdminAccess = async () => {
      try {
        const response = await apiClient.auth.adminRouteState({
          validateStatus: () => true,
          suppressExpected403: true,
        });

        if (cancelled) return;

        if (response.status === 200 || response.status === 204) {
          setStatus('allowed');
          return;
        }

        if (response.status === 401) {
          window.location.replace('/login');
          return;
        }

        if (response.status === 428) {
          window.location.replace(adminAuthUrl);
          return;
        }

        setStatus('denied');
      } catch (error) {
        console.error('Failed to verify admin route access:', error);
        if (!cancelled) setStatus('denied');
      }
    };

    verifyAdminAccess();

    return () => {
      cancelled = true;
    };
  }, [adminAuthUrl]);

  if (status === 'checking') {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary-600" />
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-lg border border-neutral-200 bg-white p-8 text-center dark:border-white/10 dark:bg-[#081224]/95">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Admin access required</h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          This area is only available to verified admin users.
        </p>
      </div>
    );
  }

  return children;
}
