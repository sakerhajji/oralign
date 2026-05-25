import { redirect } from 'next/navigation';

/**
 * Legacy `/account/billing` route — kept as a permanent redirect to
 * `/dashboard/payments/history` (the canonical Payment History page
 * for both roles). Lets old bookmarks and external links keep
 * working without rendering a duplicate surface.
 */
export default function AccountBillingPage() {
  redirect('/dashboard/payments/history');
}
