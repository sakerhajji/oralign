import type { Metadata } from 'next';
import { ErrorScreen } from '@/components/error-pages/error-screen';

/**
 * 403 — a REAL route rather than Next's `forbidden.tsx` convention.
 *
 * That convention (and the `forbidden()` API behind it) is gated on
 * `experimental.authInterrupts` in Next 16 and still unstable; turning
 * an experimental flag on for the whole production app to gain one
 * screen is a bad trade. A plain route works everywhere — a server
 * component, a route handler or a client guard can all `redirect('/403')`.
 */
export const metadata: Metadata = {
  title: 'Accès refusé',
  robots: { index: false, follow: false },
};

export default function ForbiddenPage() {
  return (
    <ErrorScreen
      kind="forbidden"
      homeHref="/dashboard"
      homeLabel="dashboard"
      langSource="app"
      extraAction={{
        labels: { fr: 'Nous contacter', en: 'Contact us', ar: 'اتصل بنا' },
        href: '/contact',
      }}
    />
  );
}
