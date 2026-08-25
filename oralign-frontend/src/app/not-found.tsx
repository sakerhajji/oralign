import type { Metadata } from 'next';
import { ErrorScreen } from '@/components/error-pages/error-screen';

/**
 * Global 404 — served with a real 404 status by Next, both for unknown
 * URLs and for `notFound()` calls that no closer boundary catches.
 *
 * A server component (Next passes no props to this convention), so it
 * can carry metadata; the visuals live in the shared client screen.
 */
export const metadata: Metadata = {
  title: 'Page introuvable',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return <ErrorScreen kind="notFound" />;
}
