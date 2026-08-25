import type { Metadata } from 'next';
import { ErrorScreen } from '@/components/error-pages/error-screen';

/**
 * 404 inside the public site — reached when a showcase page calls
 * `notFound()` (an unpublished blog slug, most often). Rendering it here
 * rather than at the root keeps the header, footer and language switch,
 * so a dead link still leaves the visitor somewhere they can browse.
 */
export const metadata: Metadata = {
  title: 'Page introuvable',
  robots: { index: false, follow: false },
};

export default function ShowcaseNotFound() {
  return <ErrorScreen kind="notFound" fill="section" />;
}
