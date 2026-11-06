import type { QueryClient } from '@tanstack/react-query';

/**
 * Query keys of everything that shows money: the payment lists and their
 * counts, the takings summary, the treatment-fee lists. Kept apart from
 * the hooks so `use-orders` (treatment-fee writes) and `use-payments`
 * (payment writes) share them without importing each other.
 */
export const paymentKeys = {
  all: ['payments'] as const,
  pending: (filters: Record<string, unknown>) =>
    [...paymentKeys.all, 'pending', filters] as const,
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
  pending: (params: Record<string, unknown>) =>
    [...treatmentFeeKeys.all, 'pending', params] as const,
  history: (params: Record<string, unknown>) =>
    [...treatmentFeeKeys.all, 'history', params] as const,
};

/**
 * After any payment or treatment-fee write: the takings, both lists, the
 * tab counts and the confirmation queues all refetch, so no figure on the
 * payments screens can disagree with another.
 */
export function invalidatePaymentViews(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: paymentKeys.all });
  void queryClient.invalidateQueries({ queryKey: treatmentFeeKeys.all });
}
