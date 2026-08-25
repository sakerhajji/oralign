'use client';

import { useEffect } from 'react';
import { ErrorScreen } from '@/components/error-pages/error-screen';

/**
 * Showcase-scoped boundary. Because Next renders a segment's `error.tsx`
 * INSIDE that segment's layout, the visitor keeps the site header, the
 * language switch and the footer — they can navigate away instead of
 * hitting a dead end. Failures of the showcase layout itself still fall
 * through to the root boundary.
 */
export default function ShowcaseError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[oralign/showcase] unhandled error', error.digest ?? '', error);
  }, [error]);

  return (
    <ErrorScreen kind="serverError" digest={error.digest} onRetry={reset} fill="section" />
  );
}
