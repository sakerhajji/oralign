import { redirect } from 'next/navigation';

/**
 * Legacy `/dashboard/payments/mine` route — kept as a permanent
 * redirect to `/dashboard/payments/history` (the canonical
 * role-aware Payment History page). The history page automatically
 * surfaces only the dentist's own payments when the caller is a
 * dentist, so a dedicated "mine" route is redundant.
 */
export default function MyPaymentsPage() {
  redirect('/dashboard/payments/history');
}
