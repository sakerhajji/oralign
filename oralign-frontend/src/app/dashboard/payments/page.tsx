import { redirect } from 'next/navigation';

/**
 * Index of the `/dashboard/payments` cluster. The cluster only has
 * sub-routes (history / pending / mine / [paymentId]/invoice), so hitting
 * the bare `/dashboard/payments` URL — by typing it, a stale link, or a
 * nav group header — used to 404 ("This page could not be found").
 *
 * Redirect to the canonical, role-aware Payment History page (admin sees
 * every payment, a dentist sees only their own). Admins reach the
 * bank-transfer confirmation queue via the "Pending payments" sidebar
 * item. Mirrors the redirect pattern in `mine/page.tsx` and
 * `account/billing/page.tsx`.
 */
export default function PaymentsIndexPage() {
  redirect('/dashboard/payments/history');
}
