'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import React, { useMemo } from 'react';
import { isRetryableApiError } from '@/lib/api/error';

interface QueryProviderProps {
  children: React.ReactNode;
}

/**
 * Retry policy for READS. Two more attempts, spaced out and jittered, ride
 * out a wobbly mobile connection or a 30-second deploy window; a 4xx would
 * fail the same way again and is not retried. Module scope: the jitter
 * must not be sampled during render.
 */
const retryReads = (failureCount: number, error: unknown): boolean =>
  failureCount < 2 && isRetryableApiError(error);

const retryDelayMs = (attempt: number): number =>
  Math.min(1000 * 2 ** attempt, 8000) + Math.random() * 500;

export function QueryProvider({ children }: QueryProviderProps) {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            gcTime: 1000 * 60 * 10, // 10 minutes (formerly cacheTime)
            retry: retryReads,
            retryDelay: retryDelayMs,
            refetchOnWindowFocus: false,
            refetchOnMount: true,
          },
          mutations: {
            // Never. A write that timed out may already have been applied;
            // replaying it is how duplicate records are born. Callers that
            // can prove safety (an idempotency key) retry explicitly.
            retry: 0,
          },
        },
      }),
    []
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
