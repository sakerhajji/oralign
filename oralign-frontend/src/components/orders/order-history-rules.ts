/**
 * Pure reading rules of the order History tab (order-history.tsx), for the
 * rows the transfer flows and the batch unlocks journal since 2026-11-27
 * (CONTRACT §5) beside the entries the server still derives from Payment
 * rows and batches. Type imports only, so `node --test` runs it as is:
 * see order-history-rules.test.mjs.
 */
import type { OrderHistoryEntry } from '@/lib/types';

type EntryLike = Pick<OrderHistoryEntry, 'source' | 'action' | 'metadata'>;

/**
 * Actions whose `metadata.reason` is a note, not a refusal: a withdrawn
 * transfer's optional note, a manual unlock's reason (staff only). It
 * reads in grey, not in the red of a refusal.
 */
export const NOTE_REASON_ACTIONS: ReadonlySet<string> = new Set([
  'payment_transfer_withdrawn',
  'treatment_fee_proof_removed',
  'batch_unlocked',
]);

/**
 * The persisted rows of the transfer flows and of the batch unlocks come
 * back with source `order` (OrderAuditLog); they read under the source
 * their derived siblings use, so a payment's story sits under « Paiement »
 * whether it was journaled or derived.
 */
export function displaySource(entry: EntryLike): OrderHistoryEntry['source'] {
  if (entry.source !== 'order') return entry.source;
  if (entry.action.startsWith('payment_') || entry.action.startsWith('treatment_fee_')) {
    return 'payment';
  }
  if (entry.action === 'batch_unlocked') return 'delivery';
  return entry.source;
}

/**
 * The dictionary key of an entry's action: a journaled batch unlock says
 * what released it (`batch_unlocked_payment`, `_installment_cancelled`,
 * `_manual`); an older derived one has no source and keeps the plain key.
 */
export function actionKeyOf(entry: EntryLike): string {
  const source = entry.metadata?.source;
  if (entry.action === 'batch_unlocked' && typeof source === 'string' && /^[a-z_]+$/.test(source)) {
    return `batch_unlocked_${source}`;
  }
  return entry.action;
}

/** A trimmed, non-blank string from metadata, else null. */
export function textOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** A finite number from a JSON number or a decimal string, else null. */
export function amountOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * The cash of a transfer row, only when it says something the amount does
 * not (a stamp added, a retenue kept back): null otherwise.
 */
export function distinctCash(metadata: Record<string, unknown>): number | null {
  const cash = amountOf(metadata.cashAmount);
  if (cash === null) return null;
  const amount = amountOf(metadata.amount);
  return amount !== null && Math.abs(cash - amount) < 0.0005 ? null : cash;
}
