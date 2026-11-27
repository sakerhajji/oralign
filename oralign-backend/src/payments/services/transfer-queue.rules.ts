import {
  PaymentMethod,
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
} from '@prisma/client';
import { dec, toAmount } from '../../common/billing/tax-split';
import type { TransferKind } from '../../notifications/events/notification-events';
import {
  installmentSubjectKey,
  parseSubjectKey,
  treatmentFeeSubjectKey,
} from '../../notifications/notification-subject';
import { compareIds } from './payment-list-query';
import { paymentSettled, toRate, treatmentFeeSettled } from './payment-rules';
import {
  type TransferState,
  transferStateOf,
  treatmentFeeTransferState,
} from './transfer-state';

/**
 * The rules of the admin "Paiements en attente" desk (CONTRACT.md §2.4),
 * pure: which rows each tab holds, how the two kinds merge into one page,
 * and how a row reads. The queries run in transfer-queue.query.ts and the
 * service; this file never touches the database.
 *
 * Two kinds, one queue:
 *   • installment   = a Payment row (bank_transfer, purpose installment);
 *   • treatment_fee = the DentalOrder fee columns (no Payment row).
 * Archived orders (deletedAt set) are never listed, like paymentListWhere.
 */

// ─── Contract (frozen in P0; mirrored in frontend lib/types/billing.ts) ──

/** ?filter= values, in tab order. */
export const TRANSFER_QUEUE_FILTERS = [
  'nouveau',
  'a_verifier',
  'valide',
  'refuse',
] as const;
export type TransferQueueFilter = (typeof TRANSFER_QUEUE_FILTERS)[number];

/** Validé and Refusé only show the bank transfers of the last N days. */
export const TRANSFER_QUEUE_RECENT_DAYS = 30;

/** Money of a row: JSON numbers, 3 decimals (TND millimes). */
export interface TransferQueueAmounts {
  /** What the transfer settles: the installment, or the fee + CBCT (TTC). */
  due: number;
  /** Droit de timbre added on top. */
  stamp: number;
  /** Retenue rate (%) the practitioner applied; null = none. */
  withholdingRate: number | null;
  withholding: number;
  /** due + stamp - withholding: what the admin finds on the statement. */
  cash: number;
  currency: string;
}

/** One declaration of the queue, whichever its kind. */
export interface TransferQueueRow {
  kind: TransferKind;
  /** notification-subject.ts key: the row's identity for "Nouveau / Consulté". */
  subjectKey: string;
  /** installment: the Payment; treatment_fee: null. */
  paymentId: string | null;
  orderId: string;
  orderCode: string;
  quotationId: string | null;
  installmentNumber: number | null;
  doctor: { id: string; fullName: string } | null;
  patient: { id: string; fullName: string } | null;
  amounts: TransferQueueAmounts;
  status: PaymentRecordStatus;
  state: TransferState;
  /** Whether a receipt is attached; read it through the authenticated proof route. */
  hasProof: boolean;
  /** ISO 8601 instants; null when not reached. */
  declaredAt: string | null;
  reviewOpenedAt: string | null;
  /** paidAt (validé) or rejectedAt (refusé). */
  processedAt: string | null;
  rejectionReason: string | null;
  /** false = "Nouveau" for the calling admin (his subject row is unread). */
  seenByMe: boolean;
}

export interface TransferQueuePage {
  data: TransferQueueRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  /** Live count of every tab, for the segmented control. */
  counts: Record<TransferQueueFilter, number>;
}

export interface TransferQueueQuery {
  filter?: TransferQueueFilter;
  page?: number;
  limit?: number;
}

/** The tab an absent ?filter= opens: everything still to verify. */
export const DEFAULT_TRANSFER_QUEUE_FILTER: TransferQueueFilter = 'a_verifier';
export const DEFAULT_TRANSFER_QUEUE_LIMIT = 25;
export const MAX_TRANSFER_QUEUE_LIMIT = 100;

/** A fee has no currency column: the merchant's (as on every fee screen). */
export const TREATMENT_FEE_CURRENCY = 'TND';

const DAY_MS = 86_400_000;

/** Start of the Validé / Refusé window. */
export function recentSince(
  now: Date,
  days: number = TRANSFER_QUEUE_RECENT_DAYS,
): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

/** page / limit clamped like every list (limit 1-100, page ≥ 1). */
export function queuePaging(query: TransferQueueQuery): {
  filter: TransferQueueFilter;
  page: number;
  limit: number;
  skip: number;
} {
  const limit = Math.min(
    Math.max(Math.trunc(query.limit ?? DEFAULT_TRANSFER_QUEUE_LIMIT), 1),
    MAX_TRANSFER_QUEUE_LIMIT,
  );
  const page = Math.max(Math.trunc(query.page ?? 1), 1);
  return {
    filter: query.filter ?? DEFAULT_TRANSFER_QUEUE_FILTER,
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

// ─── My unread subjects ────────────────────────────────────────────────

/** My unread transfer subjects, decoded by kind. */
export interface UnreadSubjects {
  keys: ReadonlySet<string>;
  /** installment subjects: their Payment ids. */
  paymentIds: string[];
  /** treatment-fee subjects: one declaration each (order + declaredAt). */
  fees: { orderId: string; declaredAt: Date }[];
}

export const NO_UNREAD_SUBJECTS: UnreadSubjects = {
  keys: new Set<string>(),
  paymentIds: [],
  fees: [],
};

/** Decode keys (unparsable ones are dropped). */
export function splitSubjectKeys(keys: Iterable<string>): UnreadSubjects {
  const kept = new Set<string>();
  const paymentIds: string[] = [];
  const fees: UnreadSubjects['fees'] = [];
  for (const key of keys) {
    const subject = parseSubjectKey(key);
    if (!subject || kept.has(key)) continue;
    kept.add(key);
    if (subject.kind === 'installment') paymentIds.push(subject.paymentId);
    else {
      fees.push({
        orderId: subject.orderId,
        declaredAt: new Date(subject.declaredAtMs),
      });
    }
  }
  return { keys: kept, paymentIds, fees };
}

// ─── Which rows a tab holds ────────────────────────────────────────────

export interface QueueWhereContext {
  /** recentSince(now): Validé / Refusé start. */
  since: Date;
  unread: UnreadSubjects;
}

/** Pack-installment bank transfers of live orders. */
const INSTALLMENT_BASE = {
  paymentMethod: PaymentMethod.bank_transfer,
  purpose: PaymentPurpose.installment,
  order: { deletedAt: null },
} satisfies Prisma.PaymentWhereInput;

/** Treatment fees declared by bank transfer, on live orders. */
const TREATMENT_FEE_BASE = {
  deletedAt: null,
  treatmentFeePaymentMethod: PaymentMethod.bank_transfer,
} satisfies Prisma.DentalOrderWhereInput;

/**
 * The Payment rows of a tab; null = none can match (Nouveau with nothing
 * unread), so the caller skips the query.
 *   nouveau    awaiting_confirmation AND my subject row unread
 *   a_verifier every awaiting_confirmation
 *   valide     success, paid in the window
 *   refuse     rejected, refused in the window
 */
export function installmentQueueWhere(
  filter: TransferQueueFilter,
  ctx: QueueWhereContext,
): Prisma.PaymentWhereInput | null {
  switch (filter) {
    case 'nouveau':
      return ctx.unread.paymentIds.length > 0
        ? {
            ...INSTALLMENT_BASE,
            status: PaymentRecordStatus.awaiting_confirmation,
            id: { in: ctx.unread.paymentIds },
          }
        : null;
    case 'a_verifier':
      return {
        ...INSTALLMENT_BASE,
        status: PaymentRecordStatus.awaiting_confirmation,
      };
    case 'valide':
      return {
        ...INSTALLMENT_BASE,
        status: PaymentRecordStatus.success,
        paidAt: { gte: ctx.since },
      };
    case 'refuse':
      return {
        ...INSTALLMENT_BASE,
        status: PaymentRecordStatus.rejected,
        rejectedAt: { gte: ctx.since },
      };
  }
}

/** The DentalOrder rows of a tab (same tab rules); null = none can match. */
export function treatmentFeeQueueWhere(
  filter: TransferQueueFilter,
  ctx: QueueWhereContext,
): Prisma.DentalOrderWhereInput | null {
  switch (filter) {
    case 'nouveau':
      // A subject names ONE declaration: the order AND its declaredAt. A
      // re-upload (new declaredAt) is another subject.
      return ctx.unread.fees.length > 0
        ? {
            ...TREATMENT_FEE_BASE,
            treatmentFeePaymentStatus:
              PaymentRecordStatus.awaiting_confirmation,
            OR: ctx.unread.fees.map((fee) => ({
              id: fee.orderId,
              treatmentFeeDeclaredAt: fee.declaredAt,
            })),
          }
        : null;
    case 'a_verifier':
      return {
        ...TREATMENT_FEE_BASE,
        treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
      };
    case 'valide':
      return {
        ...TREATMENT_FEE_BASE,
        treatmentFeePaymentStatus: PaymentRecordStatus.success,
        treatmentFeePaidAt: { gte: ctx.since },
      };
    case 'refuse':
      return {
        ...TREATMENT_FEE_BASE,
        treatmentFeePaymentStatus: PaymentRecordStatus.rejected,
        treatmentFeeRejectedAt: { gte: ctx.since },
      };
  }
}

/**
 * The three tabs a status partitions (Nouveau is a subset of À vérifier,
 * counted apart): one groupBy per kind counts them all.
 */
export const STATUS_TAB: Partial<
  Record<PaymentRecordStatus, Exclude<TransferQueueFilter, 'nouveau'>>
> = {
  [PaymentRecordStatus.awaiting_confirmation]: 'a_verifier',
  [PaymentRecordStatus.success]: 'valide',
  [PaymentRecordStatus.rejected]: 'refuse',
};

/** The tabs a status partitions, in the order the groupBy ORs them. */
export const STATUS_TABS = ['a_verifier', 'valide', 'refuse'] as const;

/** A zero for every tab. */
export function emptyCounts(): Record<TransferQueueFilter, number> {
  return { nouveau: 0, a_verifier: 0, valide: 0, refuse: 0 };
}

// ─── One page out of two sorted runs ───────────────────────────────────

/** Newest declaration first; the id ends the sort so pages never overlap. */
export const INSTALLMENT_QUEUE_ORDER = [
  { declaredAt: { sort: 'desc', nulls: 'last' } },
  { id: 'desc' },
] satisfies Prisma.PaymentOrderByWithRelationInput[];

export const TREATMENT_FEE_QUEUE_ORDER = [
  { treatmentFeeDeclaredAt: { sort: 'desc', nulls: 'last' } },
  { id: 'desc' },
] satisfies Prisma.DentalOrderOrderByWithRelationInput[];

/** A row of a run as the merge reads it. */
export interface QueueRunItem {
  kind: TransferKind;
  id: string;
  declaredAt: Date | null;
}

/**
 * The order of the merged queue: the run orders above, read across both
 * kinds (declaredAt desc, undated last, then installments before fees,
 * then the id desc). Consistent with each run's own order, which is what
 * makes the window cut below exact.
 */
export function compareQueueItems(a: QueueRunItem, b: QueueRunItem): number {
  const at = (item: QueueRunItem) => item.declaredAt?.getTime() ?? -1;
  const byDate = at(b) - at(a);
  if (byDate !== 0) return byDate;
  if (a.kind !== b.kind) return a.kind === 'installment' ? -1 : 1;
  return compareIds(b.id, a.id);
}

/**
 * The page [skip, skip + take) of the merge of two runs, each the first
 * skip + take rows of its kind in queue order: the page's rows are always
 * among them (the two-run idiom of findPageByEventDate).
 */
export function mergeQueuePage(
  installments: readonly QueueRunItem[],
  fees: readonly QueueRunItem[],
  skip: number,
  take: number,
): QueueRunItem[] {
  return [...installments, ...fees]
    .sort(compareQueueItems)
    .slice(skip, skip + take);
}

// ─── How a row reads ───────────────────────────────────────────────────

type NumLike = Prisma.Decimal | number | string | null | undefined;

const iso = (value: Date | null | undefined): string | null =>
  value ? value.toISOString() : null;

const person = (
  value: { id: string; fullName: string } | null | undefined,
): { id: string; fullName: string } | null =>
  value ? { id: value.id, fullName: value.fullName } : null;

/** The split a row shows: due (settled), stamp, retenue, cash. */
function amountsOf(args: {
  cash: NumLike;
  withholding: NumLike;
  rate: NumLike;
  stamp: NumLike;
  due: Prisma.Decimal;
  currency: string;
}): TransferQueueAmounts {
  const withholding = dec(args.withholding);
  return {
    due: toAmount(args.due),
    stamp: toAmount(args.stamp),
    // A rate is only meaningful when a retenue was really applied.
    withholdingRate:
      args.rate !== null && args.rate !== undefined && withholding.gt(0)
        ? toRate(args.rate)
        : null,
    withholding: toAmount(withholding),
    cash: toAmount(args.cash),
    currency: args.currency,
  };
}

/** The Payment columns a queue row reads (proofUrl only for hasProof). */
export const INSTALLMENT_QUEUE_SELECT = {
  id: true,
  orderId: true,
  quotationId: true,
  amount: true,
  withholdingAmount: true,
  withholdingRate: true,
  stampAmount: true,
  currency: true,
  status: true,
  proofUrl: true,
  declaredAt: true,
  reviewOpenedAt: true,
  paidAt: true,
  confirmedAt: true,
  rejectedAt: true,
  rejectionReason: true,
  installment: { select: { installmentNumber: true } },
  order: {
    select: {
      orderCode: true,
      doctor: { select: { id: true, fullName: true } },
      patient: { select: { id: true, fullName: true } },
    },
  },
} satisfies Prisma.PaymentSelect;

export type InstallmentQueueSource = Prisma.PaymentGetPayload<{
  select: typeof INSTALLMENT_QUEUE_SELECT;
}>;

/** The DentalOrder columns a queue row reads (the path only for hasProof). */
export const TREATMENT_FEE_QUEUE_SELECT = {
  id: true,
  orderCode: true,
  updatedAt: true,
  treatmentFeeAmount: true,
  treatmentFeeWithholdingAmount: true,
  treatmentFeeWithholdingRate: true,
  treatmentFeeStampAmount: true,
  treatmentFeePaymentStatus: true,
  treatmentFeeProofPath: true,
  treatmentFeePaidAt: true,
  treatmentFeeDeclaredAt: true,
  treatmentFeeReviewOpenedAt: true,
  treatmentFeeRejectedAt: true,
  treatmentFeeRejectionReason: true,
  doctor: { select: { id: true, fullName: true } },
  patient: { select: { id: true, fullName: true } },
} satisfies Prisma.DentalOrderSelect;

export type TreatmentFeeQueueSource = Prisma.DentalOrderGetPayload<{
  select: typeof TREATMENT_FEE_QUEUE_SELECT;
}>;

/** A pack-installment transfer as a queue row. Never a file path. */
export function installmentQueueRow(
  payment: InstallmentQueueSource,
  unreadKeys: ReadonlySet<string>,
): TransferQueueRow {
  const subjectKey = installmentSubjectKey(payment.id);
  const processedAt =
    payment.status === PaymentRecordStatus.success
      ? (payment.paidAt ?? payment.confirmedAt)
      : payment.status === PaymentRecordStatus.rejected
        ? payment.rejectedAt
        : null;
  return {
    kind: 'installment',
    subjectKey,
    paymentId: payment.id,
    orderId: payment.orderId,
    orderCode: payment.order.orderCode,
    quotationId: payment.quotationId,
    installmentNumber: payment.installment?.installmentNumber ?? null,
    doctor: person(payment.order.doctor),
    patient: person(payment.order.patient),
    amounts: amountsOf({
      cash: payment.amount,
      withholding: payment.withholdingAmount,
      rate: payment.withholdingRate,
      stamp: payment.stampAmount,
      due: paymentSettled(payment),
      currency: payment.currency || TREATMENT_FEE_CURRENCY,
    }),
    status: payment.status,
    state: transferStateOf(payment),
    hasProof: Boolean(payment.proofUrl),
    declaredAt: iso(payment.declaredAt),
    reviewOpenedAt: iso(payment.reviewOpenedAt),
    processedAt: iso(processedAt),
    rejectionReason:
      payment.status === PaymentRecordStatus.rejected
        ? payment.rejectionReason
        : null,
    seenByMe: !unreadKeys.has(subjectKey),
  };
}

/**
 * The subject of a fee row. A declaration is named by its declaredAt; a
 * fee processed before 2026-11-27 had none (the backfill only dated the
 * transfers still awaiting), so its key falls back to the instant it was
 * processed: no notification row carries it, nothing is ever resolved by
 * it, it only names the row.
 */
export function treatmentFeeRowSubjectKey(
  order: TreatmentFeeQueueSource,
): string {
  return treatmentFeeSubjectKey(
    order.id,
    order.treatmentFeeDeclaredAt ??
      order.treatmentFeePaidAt ??
      order.treatmentFeeRejectedAt ??
      order.updatedAt,
  );
}

/** A treatment-fee transfer as a queue row. Never a file path. */
export function treatmentFeeQueueRow(
  order: TreatmentFeeQueueSource,
  unreadKeys: ReadonlySet<string>,
): TransferQueueRow {
  const subjectKey = treatmentFeeRowSubjectKey(order);
  const status =
    order.treatmentFeePaymentStatus ??
    PaymentRecordStatus.awaiting_confirmation;
  const processedAt =
    status === PaymentRecordStatus.success
      ? order.treatmentFeePaidAt
      : status === PaymentRecordStatus.rejected
        ? order.treatmentFeeRejectedAt
        : null;
  return {
    kind: 'treatment_fee',
    subjectKey,
    paymentId: null,
    orderId: order.id,
    orderCode: order.orderCode,
    quotationId: null,
    installmentNumber: null,
    doctor: person(order.doctor),
    patient: person(order.patient),
    amounts: amountsOf({
      cash: order.treatmentFeeAmount,
      withholding: order.treatmentFeeWithholdingAmount,
      rate: order.treatmentFeeWithholdingRate,
      stamp: order.treatmentFeeStampAmount,
      due: treatmentFeeSettled(order),
      currency: TREATMENT_FEE_CURRENCY,
    }),
    status,
    state: treatmentFeeTransferState(order),
    hasProof: Boolean(order.treatmentFeeProofPath),
    declaredAt: iso(order.treatmentFeeDeclaredAt),
    reviewOpenedAt: iso(order.treatmentFeeReviewOpenedAt),
    processedAt: iso(processedAt),
    rejectionReason:
      status === PaymentRecordStatus.rejected
        ? order.treatmentFeeRejectionReason
        : null,
    seenByMe: !unreadKeys.has(subjectKey),
  };
}
