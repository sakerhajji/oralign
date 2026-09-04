import type { Metadata } from 'next';
import { ErrorScreen } from '@/components/error-pages/error-screen';

/**
 * 401 — same reasoning as /403: a real route instead of the
 * experimental `unauthorized.tsx` convention.
 *
 * The usual expired-session path stays the proxy redirect to /login
 * (which preserves `?from=`); this page is for the cases that need to
 * SAY the session expired before sending the user back to sign in.
 */
export const metadata: Metadata = {
  title: 'Session expirée',
  robots: { index: false, follow: false },
};

export default function UnauthorizedPage() {
  return (
    <ErrorScreen
      kind="unauthorized"
      homeHref="/login"
      homeLabel="login"
      langSource="app"
      extraAction={{
        labels: { fr: 'Retour au site', en: 'Back to the site', ar: 'العودة إلى الموقع' },
        href: '/',
      }}
    />
  );
}
