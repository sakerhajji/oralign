'use client';

import { ErrorScreen } from '@/components/error-pages/error-screen';

/**
 * Last-resort boundary: it replaces the ROOT LAYOUT, so it must render
 * its own <html> and <body> — nothing above it survives, including
 * globals.css and every provider. That is exactly why the shared error
 * screen carries its own inline styles rather than relying on classes.
 *
 * Only the root-level file is ever used; Next ignores a `global-error`
 * placed in a nested segment or a route group.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr" dir="ltr">
      <head>
        {/* This document has no root layout above it, so nothing else
            emits these. Without the viewport meta, mobile browsers lay
            the page out at ~980px and render it zoomed out — the error
            screen would arrive broken on exactly the devices where it
            is hardest to recover. */}
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>Erreur · ORALIGN</title>
      </head>
      <body style={{ margin: 0 }}>
        {/* NOT Next's reset(): in 16.x that only clears the boundary
            state, so a root-layout failure re-throws instantly and the
            screen never changes — while the button says "Reload". A real
            document reload is the only thing that can recover here. */}
        <ErrorScreen
          kind="criticalError"
          digest={error.digest}
          onRetry={() => window.location.reload()}
        />
      </body>
    </html>
  );
}
