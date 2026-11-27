/**
 * Query keys of the admin pending desk (GET admin/payments/transfer-queue),
 * in a module of their own with no import, so the notification hooks (a
 * bell row marked read changes "Nouveau") and payment-keys can both use
 * them without importing each other.
 *
 * The receipt bytes live under their OWN root, keyed by the declaration's
 * subject (a new fee receipt is a new subject): invalidating the lists
 * never re-downloads a receipt.
 */
export const transferQueueKeys = {
  all: ['transfer-queue'] as const,
  lists: () => [...transferQueueKeys.all, 'list'] as const,
  list: (params: Record<string, unknown>) =>
    [...transferQueueKeys.lists(), params] as const,
  proof: (subjectKey: string) => ['transfer-proof', subjectKey] as const,
};
