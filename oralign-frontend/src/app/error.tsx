'use client';

import { useEffect } from 'react';
import { ErrorScreen } from '@/components/error-pages/error-screen';

/**
 * Root error boundary — the catch-all for render/data failures anywhere
 * no closer `error.tsx` handles them (auth pages, onboarding, /qr, …).
 *
 * Error components MUST be client components: Next hands them `reset`,
 * a function prop, across the client boundary.
 *
 * Note it does NOT catch failures of the root layout itself — those go
 * to `global-error.tsx`.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is what correlates this screen with the server logs;
    // the message never reaches the visitor.
    console.error('[oralign] unhandled error', error.digest ?? '', error);
  }, [error]);

  return <ErrorScreen kind="serverError" digest={error.digest} onRetry={reset} />;
}
