/**
 * Pure rules of the admin pending desk (/dashboard/payments/pending):
 * its URL state, how a queue row reads and what an action may send.
 * Dependency-free (type imports only) so `node --test` runs it as is:
 * see queue-format.test.mjs.
 */
import type { TransferQueueFilter, TransferQueueRow } from '@/lib/types';

/** The tabs, in order (the backend's TRANSFER_QUEUE_FILTERS). */
export const QUEUE_TABS: readonly TransferQueueFilter[] = [
  'nouveau',
  'a_verifier',
  'valide',
  'refuse',
];

/** The tab an address without ?filter= opens. */
export const DEFAULT_QUEUE_TAB: TransferQueueFilter = 'a_verifier';

/** Rows per page (the backend caps at 100). */
export const QUEUE_PAGE_SIZE = 25;

/** Validé / Refusé cover this many days (backend TRANSFER_QUEUE_RECENT_DAYS). */
export const QUEUE_RECENT_DAYS = 30;

/** Free-text bounds of a refusal reason or an override note (backend validReason). */
export const REASON_MIN = 3;
export const REASON_MAX = 500;

/** Upper bound of a subject key (backend SUBJECT_KEY_MAX_LENGTH). */
const SUBJECT_KEY_MAX = 160;

export interface QueueUrlState {
  filter: TransferQueueFilter;
  page: number;
  /**
   * A transfer to open on arrival (?review=<subjectKey>): the link of an
   * admin's notification. Cleared once handled.
   */
  review: string | null;
}

function isQueueTab(value: unknown): value is TransferQueueFilter {
  return typeof value === 'string' && (QUEUE_TABS as readonly string[]).includes(value);
}

/**
 * A subject key as the address may carry it: `installment:<id>` or
 * `treatment_fee:<id>:<epoch ms>` (backend notification-subject.ts).
 * Anything else is ignored, never sent anywhere.
 */
export function isSubjectKeyLike(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= SUBJECT_KEY_MAX &&
    /^(installment:[A-Za-z0-9_-]{1,64}|treatment_fee:[A-Za-z0-9_-]{1,64}:\d{1,15})$/.test(value)
  );
}

/** The desk's state read from the address; anything unknown falls back. */
export function readQueueUrl(search: string | URLSearchParams): QueueUrlState {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const filter = params.get('filter');
  const page = Number(params.get('page'));
  const review = params.get('review');
  return {
    filter: isQueueTab(filter) ? filter : DEFAULT_QUEUE_TAB,
    page: Number.isInteger(page) && page > 1 ? page : 1,
    review: isSubjectKeyLike(review) ? review : null,
  };
}

/**
 * The address search for a state, other params kept: the default tab and
 * the first page stay implicit, so a plain link reads clean.
 */
export function queueUrlSearch(state: QueueUrlState, current: string): string {
  const params = new URLSearchParams(current);
  if (state.filter === DEFAULT_QUEUE_TAB) params.delete('filter');
  else params.set('filter', state.filter);
  if (state.page > 1) params.set('page', String(state.page));
  else params.delete('page');
  if (state.review) params.set('review', state.review);
  else params.delete('review');
  const search = params.toString();
  return search ? `?${search}` : '';
}

/**
 * Where a ?review= link resolves: the row on screen to open, or why it
 * cannot be (the transfer left the queue: processed, withdrawn, replaced).
 * `pending` while the tab that would hold it is still loading.
 */
export function resolveReviewTarget(
  review: string | null,
  rows: readonly Pick<TransferQueueRow, 'subjectKey'>[] | undefined,
): { kind: 'none' } | { kind: 'pending' } | { kind: 'found'; index: number } | { kind: 'gone' } {
  if (!review) return { kind: 'none' };
  if (!rows) return { kind: 'pending' };
  const index = rows.findIndex((row) => row.subjectKey === review);
  return index >= 0 ? { kind: 'found', index } : { kind: 'gone' };
}

/**
 * A ?review= link searches its tab from the first page: the queue is
 * newest first, so the page the address names says nothing about where
 * that transfer sits. Without a review the state is kept as it is.
 */
export function reviewStartState(state: QueueUrlState): QueueUrlState {
  return state.review && state.page !== 1 ? { ...state, page: 1 } : state;
}

/**
 * The desk's state after the address changed under it, or null to keep
 * its own. Next reuses the mounted page when only the query changes, so a
 * notification's link clicked while the desk is open arrives here, not in
 * a fresh mount: a NEW subject in ?review= (not the one last seen in the
 * address, not the one already being opened) is adopted with the link's
 * tab, searched from page 1. Anything else is the desk's own
 * history.replaceState coming back through useSearchParams (the desk never
 * writes a subject it did not read from the address), so following it can
 * never loop.
 */
export function adoptAddressReview(
  seenReview: string | null,
  address: QueueUrlState,
  state: QueueUrlState,
): QueueUrlState | null {
  if (!address.review) return null;
  if (address.review === seenReview || address.review === state.review) return null;
  return reviewStartState(address);
}

/** What a ?review= link does next, on the loaded page of its tab. */
export type ReviewStep =
  | { kind: 'none' }
  | { kind: 'pending' }
  | { kind: 'found'; index: number }
  | { kind: 'next_page'; page: number }
  | { kind: 'gone'; final: boolean };

/**
 * Open the row when it is on this page; otherwise look on the next page
 * (an older transfer still awaiting sits further down: 25 rows a page and
 * one row per installment); past the last page it is not in the tab.
 * `final` when that tab is À vérifier (searched from page 1, see
 * reviewStartState): the transfer is no longer awaiting, and only then may
 * the desk say so and mark its notifications read. In any other tab it is
 * only "not in this tab".
 */
export function reviewStep(
  review: string | null,
  filter: TransferQueueFilter,
  page:
    | {
        page: number;
        totalPages: number;
        data: readonly Pick<TransferQueueRow, 'subjectKey'>[];
      }
    | undefined,
): ReviewStep {
  const target = resolveReviewTarget(review, page?.data);
  if (target.kind !== 'gone') return target;
  // 'gone' implies rows, hence a page; kept for the type.
  if (!page) return { kind: 'pending' };
  if (page.page < page.totalPages) return { kind: 'next_page', page: page.page + 1 };
  return { kind: 'gone', final: filter === 'a_verifier' };
}

/** A row still waits on an admin (Confirm / Refuse are offered). */
export function isAwaiting(row: Pick<TransferQueueRow, 'status'>): boolean {
  return row.status === 'awaiting_confirmation';
}

/** The ids the review routes need. */
export function transferRefOf(
  row: Pick<TransferQueueRow, 'kind' | 'orderId' | 'paymentId'>,
): { kind: TransferQueueRow['kind']; orderId: string; paymentId: string | null } {
  return { kind: row.kind, orderId: row.orderId, paymentId: row.paymentId };
}

/** The instant a row is dated by: its declaration, else when it was processed. */
export function rowInstant(
  row: Pick<TransferQueueRow, 'declaredAt' | 'processedAt'>,
): string | null {
  return row.declaredAt ?? row.processedAt ?? null;
}

/**
 * What a row is for, as a dictionary key and its variables: "Échéance
 * n°2", "Échéance de forfait" (rank unknown), "Honoraires de traitement".
 */
export function rowSubjectLabel(
  row: Pick<TransferQueueRow, 'kind' | 'installmentNumber'>,
): { key: string; vars?: Record<string, number> } {
  if (row.kind === 'treatment_fee') return { key: 'pendingDesk.kind.treatment_fee' };
  return row.installmentNumber !== null
    ? { key: 'pendingDesk.kind.installment', vars: { n: row.installmentNumber } }
    : { key: 'pendingDesk.kind.installmentNoRank' };
}

/**
 * The split of a row in the shape the payments lists show (withholding.tsx
 * RecordedSplit): null when neither a stamp nor a retenue applies, so the
 * cell shows the cash alone.
 */
export function rowSplit(row: Pick<TransferQueueRow, 'amounts'>): {
  due: number;
  stamp: number;
  withheld: number;
  cash: number;
  rate: number | null;
} | null {
  const { due, stamp, withholding, cash, withholdingRate } = row.amounts;
  if (withholding <= 0 && stamp <= 0) return null;
  return {
    due,
    stamp,
    withheld: withholding,
    cash,
    rate: withholding > 0 && withholdingRate !== null && withholdingRate > 0 ? withholdingRate : null,
  };
}

/** Why a reason cannot be sent yet (trimmed length), or null when it can. */
export function reasonProblem(text: string): 'empty' | 'short' | 'long' | null {
  const length = text.trim().length;
  if (length === 0) return 'empty';
  if (length < REASON_MIN) return 'short';
  if (length > REASON_MAX) return 'long';
  return null;
}

/**
 * Whether Confirm may be sent: a transfer without a receipt needs the
 * admin's justification note (DECISIONS §1); the optional internal note
 * stays within the bound.
 */
export function confirmProblem(args: {
  hasProof: boolean;
  overrideNote: string;
  notes: string;
}): 'override' | 'notes' | null {
  if (!args.hasProof && reasonProblem(args.overrideNote) !== null) return 'override';
  if (args.notes.trim().length > REASON_MAX) return 'notes';
  return null;
}

/**
 * The refusals that mean "someone got there first": another admin
 * processed the transfer, the doctor withdrew or replaced it, or the
 * installment was paid meanwhile. The desk says « déjà traité » and
 * refreshes instead of showing a raw error.
 */
const ALREADY_DONE = new Set([
  'TRANSFER_ALREADY_PROCESSED',
  'INSTALLMENT_ALREADY_PAID',
  'TRANSFER_NOT_WITHDRAWABLE',
]);

export function isAlreadyProcessed(error: {
  status: number | null;
  errorCode: string | null;
}): boolean {
  return error.status === 409 && error.errorCode !== null && ALREADY_DONE.has(error.errorCode);
}

const EXTENSION_OF: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** A download name for a receipt: "recu-ORD-12-echeance-2.pdf". No path ever reaches the client. */
export function receiptFileName(
  orderCode: string,
  installmentNumber: number | null,
  mimeType: string | null | undefined,
): string {
  const essence = (mimeType ?? '').split(';', 1)[0].trim().toLowerCase();
  const extension = EXTENSION_OF[essence] ?? 'bin';
  const safeCode = orderCode.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'transfer';
  const rank = installmentNumber !== null ? `-echeance-${installmentNumber}` : '-honoraires';
  return `recu-${safeCode}${rank}.${extension}`;
}

/** How a receipt is shown, from the type the server sent. */
export function receiptDisplayKind(mimeType: string | null | undefined): 'image' | 'pdf' | 'other' {
  const essence = (mimeType ?? '').split(';', 1)[0].trim().toLowerCase();
  if (essence === 'application/pdf') return 'pdf';
  if (essence === 'image/jpeg' || essence === 'image/png' || essence === 'image/webp') {
    return 'image';
  }
  return 'other';
}
