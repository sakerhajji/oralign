import type { QueryClient } from '@tanstack/react-query';
import { dashboardKeys } from './use-dashboard';
import { notificationKeys } from './use-notifications';
import { transferQueueKeys } from './transfer-queue-keys';

export { transferQueueKeys };

/**
 * Query keys of everything that shows money: the payment lists and their
 * counts, the takings summary, the treatment-fee lists, the admin transfer
 * queue. Kept apart from the hooks so `use-orders` (treatment-fee writes),
 * `use-payments` (payment writes) and `use-transfer-queue` (the pending
 * desk) share them without importing each other.
 */
export const paymentKeys = {
  all: ['payments'] as const,
  history: (filters: Record<string, unknown>) =>
    [...paymentKeys.all, 'history', filters] as const,
  mine: (filters: Record<string, unknown>) =>
    [...paymentKeys.all, 'mine', filters] as const,
  summary: (params: Record<string, unknown>) =>
    [...paymentKeys.all, 'summary', params] as const,
  /** The dentists with a payment of that kind (the desk's practitioner filter). */
  practitioners: (purpose: string) =>
    [...paymentKeys.all, 'practitioners', purpose] as const,
  detail: (id: string) => [...paymentKeys.all, 'detail', id] as const,
  /** Rendered receipt PDF; `invoiceNumber` in the key re-fetches after an admin renumbers it. */
  invoicePdf: (id: string, lang: string, invoiceNumber?: string | null) =>
    [...paymentKeys.detail(id), 'invoice-pdf', lang, invoiceNumber ?? null] as const,
};

export const treatmentFeeKeys = {
  all: ['treatment-fees'] as const,
  history: (params: Record<string, unknown>) =>
    [...treatmentFeeKeys.all, 'history', params] as const,
};

/**
 * After any payment or treatment-fee write: the takings, both lists, the
 * tab counts, the confirmation queues, the admin's transfer badge and the
 * bell all refetch, so no figure on the payments screens can disagree with
 * another.
 */
export function invalidatePaymentViews(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: paymentKeys.all });
  void queryClient.invalidateQueries({ queryKey: treatmentFeeKeys.all });
  void queryClient.invalidateQueries({ queryKey: transferQueueKeys.lists() });
  void queryClient.invalidateQueries({ queryKey: dashboardKeys.adminSidebarBadges() });
  void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
}
