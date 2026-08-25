'use client';

import { useEffect } from 'react';
import { ErrorScreen } from '@/components/error-pages/error-screen';

/**
 * Dashboard-scoped boundary — renders inside the dashboard layout, so
 * the sidebar and header survive and the practitioner can jump to
 * another section instead of losing the whole workspace.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[oralign/dashboard] unhandled error', error.digest ?? '', error);
  }, [error]);

  return (
    <div className="p-4 lg:p-6">
      <ErrorScreen
        kind="serverError"
        digest={error.digest}
        onRetry={reset}
        homeHref="/dashboard"
        homeLabel="dashboard"
        langSource="app"
        fill="panel"
      />
    </div>
  );
}
