'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import runtimeConfig from '@/lib/runtime-config';

export function Providers({ children }) {
  const buildLogged = useRef(false);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Conservative config for better performance and less API load
            staleTime: 60000, // 1 minute - data stays fresh, no refetch
            cacheTime: 5 * 60 * 1000, // 5 minutes - keep in cache
            refetchOnMount: false, // Don't refetch on component mount if data is fresh
            refetchOnWindowFocus: false, // Don't refetch when window regains focus
            refetchOnReconnect: true, // Refetch when internet reconnects
            retry: 1, // Retry failed requests once
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
          },
        },
      })
  );

  useEffect(() => {
    if (buildLogged.current) return;
    buildLogged.current = true;

    const commitHash = process.env.NEXT_PUBLIC_COMMIT_HASH
      || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
      || 'unknown';
    const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || 'unknown';

    console.info(`[Frontend Build] env=${runtimeConfig.appEnv} version=${appVersion} commit=${commitHash}`);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
