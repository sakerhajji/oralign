import {
  InstallmentStatus,
  OrderStatus,
  Prisma,
  type Quotation,
  QuotationPaymentStatus,
  QuotationStatus,
  UserRole,
} from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
} from '../common/exceptions/app.exception';
import {
  dec,
  percentOf,
  round3,
  spreadProportionally,
  toAmount,
  type Money,
} from '../common/billing/tax-split';
import {
  DEAD_PAYMENT_STATUSES,
  IN_FLIGHT_PAYMENT_STATUSES,
  RECEIVED_PAYMENT_STATUSES,
} from '../payments/services/payment-rules';

/**
 * Money state of a devis: what was received, what is still in flight, and
 * the rules that decide which edits that state allows (owner decision 5:
 * everything is editable except installments already paid, and a quote
 * may be deleted while no money was received).
 *
 * Kept free of Nest so QuotationService, QuotationPaymentPlanService and
 * PaymentsService can share one definition of "settled" and "in flight"
 * (and QuotationPdfService the one of a TTC-priced quote).
 */

// The payment status groups are defined once, with the payment rules,
// and re-exported here for the quote services.
export {
  DEAD_PAYMENT_STATUSES,
  IN_FLIGHT_PAYMENT_STATUSES,
  RECEIVED_PAYMENT_STATUSES,
};

/**
 * Same tolerance as the plan validator and PaymentsService.handleSuccess:
 * a plan one millime short of a fractional loyalty net still settles.
 */
export const MONEY_EPSILON = new Prisma.Decimal('0.001');

/**
 * Order statuses that only describe the quote / payment phase. Deleting
 * or recalling the quote sends such an order back to treatment_approved;
 * a quote that becomes fully paid moves it on to fabrication. An order
 * already past them (fabrication, shipped, ...) is never moved back.
 */
export const QUOTE_PHASE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.quotation_sent,
  OrderStatus.payment_plan_selected,
  OrderStatus.payment_pending,
  OrderStatus.payment_review,
  OrderStatus.paid,
];

/** Quote statuses at which the admin may still edit fees, pack or plan. */
export const EDITABLE_QUOTE_STATUSES: QuotationStatus[] = [
  QuotationStatus.draft,
  QuotationStatus.sent,
  QuotationStatus.approved,
];

export const QUOTE_ERROR = {
  NOT_EDITABLE: 'QUOTE_NOT_EDITABLE',
  TOTAL_BELOW_PAID: 'QUOTE_TOTAL_BELOW_PAID',
  PAYMENT_IN_FLIGHT: 'QUOTE_PAYMENT_IN_FLIGHT',
  PAYMENT_RECEIVED: 'QUOTE_PAYMENT_RECEIVED',
  PLAN_REQUIRED: 'QUOTE_PLAN_REQUIRED',
} as const;

/** Audit action written when a quote already shown to the doctor changes. */
export const QUOTE_UPDATED_AUDIT_ACTION = 'quotation_updated';

/** The quote fields whose value moves its amounts. */
export const QUOTE_MONEY_FIELDS = [
  'treatmentFees',
  'fabricationFees',
  'deliveryFees',
  'discountAmount',
  'tvaRate',
] as const;

type QuoteMoneyField = (typeof QUOTE_MONEY_FIELDS)[number];

/**
 * True when an edit carries a money field whose value differs from the
 * stored one, to the millime. The quote editor posts every field on each
 * save, so a field being present says nothing: a notes, language or
 * message save must leave the amounts, the plan and the settlement as
 * they are (and must not re-price a legacy HT quote, see isTtcPriced).
 */
export function quoteMoneyEdited(
  edit: Partial<Record<QuoteMoneyField, number | null>>,
  stored: Record<QuoteMoneyField, number>,
): boolean {
  return QUOTE_MONEY_FIELDS.some((field) => {
    const value = edit[field];
    return (
      value !== undefined &&
      value !== null &&
      !round3(value).equals(round3(stored[field]))
    );
  });
}

/** What a remise edit resolves to (see resolveQuoteDiscount). */
export interface ResolvedQuoteDiscount {
  /** The remise amount to apply, or undefined when the edit leaves it as is. */
  amount: number | undefined;
  /** The percentage to store: a value, null (typed as an amount) or undefined (unchanged). */
  percent: Prisma.Decimal | null | undefined;
}

/**
 * Turn a remise typed as a percentage into its amount, on the gross the
 * edit leaves (pack price / treatment fees + fabrication + delivery,
 * TTC), so every money rule downstream works on one figure.
 *
 *   - discountPercent sent (a number)  -> amount = that % of the gross;
 *   - discountPercent sent as null, or only a NEW discountAmount sent
 *                                      -> typed as an amount, percent cleared
 *                                         (the editor may echo the stored
 *                                         amount: that is not a change);
 *   - neither sent, but the quote holds a percentage
 *                                      -> the remise follows the new gross
 *                                         (a fee edit keeps "10 %" true).
 */
export function resolveQuoteDiscount(
  edit: {
    treatmentFees?: number;
    fabricationFees?: number;
    deliveryFees?: number;
    discountAmount?: number;
    discountPercent?: number | null;
  },
  stored: Pick<
    Quotation,
    'treatmentFees' | 'fabricationFees' | 'deliveryFees' | 'discountAmount'
  > & { discountPercent?: Prisma.Decimal | null },
): ResolvedQuoteDiscount {
  const newAmount =
    edit.discountAmount !== undefined &&
    !round3(edit.discountAmount).equals(round3(stored.discountAmount));
  const typedAsAmount =
    edit.discountPercent === null ||
    (edit.discountPercent === undefined && newAmount);
  if (typedAsAmount) return { amount: undefined, percent: null };

  const percent =
    edit.discountPercent !== undefined
      ? edit.discountPercent
      : (stored.discountPercent ?? null);
  if (percent === null) return { amount: undefined, percent: undefined };

  const positive = (n: number) => dec(Math.max(0, Number(n) || 0));
  const gross = positive(edit.treatmentFees ?? stored.treatmentFees)
    .plus(positive(edit.fabricationFees ?? stored.fabricationFees))
    .plus(positive(edit.deliveryFees ?? stored.deliveryFees));
  const rate = dec(percent).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return {
    amount: toAmount(percentOf(gross, rate)),
    percent: edit.discountPercent !== undefined ? rate : undefined,
  };
}

/**
 * True when a quote's line amounts include TVA, i.e. their net IS the
 * stored total: every pack quote, and every quote priced since prices
 * became TTC (QuotationService.computeTotals). A packless quote priced
 * before that was computed forward from HT fees (total = fees + TVA on
 * top) and is not: its devis keeps the HT layout, and an edit of its
 * money keeps the HT maths so it never silently loses its TVA. The one
 * definition the devis renderer and QuotationService.update share.
 */
export function isTtcPriced(
  quote: Pick<
    Quotation,
    | 'treatmentFees'
    | 'fabricationFees'
    | 'deliveryFees'
    | 'discountAmount'
    | 'totalTtc'
  > & { packId?: string | null },
): boolean {
  if (quote.packId) return true;
  const gross = dec(quote.treatmentFees)
    .plus(dec(quote.fabricationFees))
    .plus(dec(quote.deliveryFees));
  const net = gross.minus(Prisma.Decimal.min(dec(quote.discountAmount), gross));
  return net.minus(dec(quote.totalTtc)).abs().lessThanOrEqualTo(MONEY_EPSILON);
}

/**
 * Installment statuses a re-plan keeps, step batch included: paid rows,
 * and cancelled ones (a total edit cancels a row once nothing more is
 * owed on it and releases its aligners, so its batch may already be
 * unlocked or delivered). configurePaymentPlan replaces every other row.
 */
export const KEPT_INSTALLMENT_STATUSES: InstallmentStatus[] = [
  InstallmentStatus.paid,
  InstallmentStatus.cancelled,
];

export const isKeptInstallment = (row: { status: InstallmentStatus }) =>
  KEPT_INSTALLMENT_STATUSES.includes(row.status);

export interface StepRange {
  fromStep: number;
  toStep: number;
}

/** The pack step limit of a quote (its snapshot). */
export interface QuoteStepLimits {
  packId?: string | null;
  isUnlimitedSteps?: boolean | null;
  maxStepsPerArch?: number | null;
}

/**
 * True when a re-plan can still place a new installment: some step of
 * 1..maxStepsPerArch lies outside every kept batch. Always true for an
 * unlimited pack. False for a quote without a pack (it has no plan), and
 * for a pack snapshot without its step limit (configurePaymentPlan
 * refuses both).
 */
export function hasFreeStepForReplan(
  limits: QuoteStepLimits,
  kept: StepRange[],
): boolean {
  if (!limits.packId) return false;
  if (limits.isUnlimitedSteps) return true;
  const max = limits.maxStepsPerArch ?? 0;
  if (max < 1) return false;
  // Lowest step not covered by the ranges seen so far, scanning by start.
  let next = 1;
  for (const range of [...kept].sort((a, b) => a.fromStep - b.fromStep)) {
    if (range.fromStep > next) return true;
    next = Math.max(next, range.toStep + 1);
    if (next > max) return false;
  }
  return true;
}

export interface QuoteMoney {
  /**
   * TTC settled: Σ (amount + withholdingAmount - stampAmount) of successful
   * payments, i.e. Σ of the installments they paid.
   */
  received: Money;
  receivedCount: number;
  inFlightCount: number;
}

export const emptyQuoteMoney = (): QuoteMoney => ({
  received: new Prisma.Decimal(0),
  receivedCount: 0,
  inFlightCount: 0,
});

type PaymentReader = Pick<Prisma.TransactionClient, 'payment'>;

/**
 * One grouped read for any number of quotes. A payment settles
 * amount + withholdingAmount - stampAmount: the cash plus what the
 * practitioner kept back as retenue à la source, minus the droit de
 * timbre charged on top (its facture's, not the devis'), i.e. the
 * installment amount. Payments made before the stamp was added carry
 * stampAmount 0. Same rule as PaymentsService.settledTotal.
 */
export async function readQuoteMoney(
  db: PaymentReader,
  quotationIds: string[],
): Promise<Map<string, QuoteMoney>> {
  const result = new Map<string, QuoteMoney>();
  for (const id of quotationIds) result.set(id, emptyQuoteMoney());
  if (quotationIds.length === 0) return result;

  const groups = await db.payment.groupBy({
    by: ['quotationId', 'status'],
    where: { quotationId: { in: quotationIds } },
    _sum: { amount: true, withholdingAmount: true, stampAmount: true },
    _count: { _all: true },
  });
  for (const group of groups) {
    if (!group.quotationId) continue;
    const money = result.get(group.quotationId);
    if (!money) continue;
    const count = group._count?._all ?? 0;
    if (RECEIVED_PAYMENT_STATUSES.includes(group.status)) {
      money.received = money.received
        .plus(dec(group._sum?.amount))
        .plus(dec(group._sum?.withholdingAmount))
        .minus(dec(group._sum?.stampAmount));
      money.receivedCount += count;
    } else if (IN_FLIGHT_PAYMENT_STATUSES.includes(group.status)) {
      money.inFlightCount += count;
    }
  }
  return result;
}

export async function readOneQuoteMoney(
  db: PaymentReader,
  quotationId: string,
): Promise<QuoteMoney> {
  return (
    (await readQuoteMoney(db, [quotationId])).get(quotationId) ??
    emptyQuoteMoney()
  );
}

export interface QuoteSettlement {
  paidAmount: Money;
  remainingAmount: Money;
  paymentStatus: QuotationPaymentStatus;
}

/**
 * paidAmount / remainingAmount / paymentStatus of a quote from what was
 * settled. Same rule as PaymentsService.handleSuccess, tolerance included,
 * so an edit and a settlement can never disagree on "paid". `received` is
 * the settled figure (QuoteMoney.received: stamps taken out), never the
 * cash: the stamps a practitioner paid on top would otherwise overpay the
 * devis by one stamp per installment.
 */
export function settleQuote(
  totalPrice: Prisma.Decimal | number | string | null | undefined,
  received: Prisma.Decimal | number | string | null | undefined,
): QuoteSettlement {
  const total = round3(totalPrice);
  const paid = round3(received);
  const settled = paid.greaterThanOrEqualTo(total.minus(MONEY_EPSILON));
  const remaining = settled
    ? new Prisma.Decimal(0)
    : Prisma.Decimal.max(total.minus(paid), new Prisma.Decimal(0));
  const paymentStatus = paid.isZero()
    ? QuotationPaymentStatus.pending
    : settled
      ? QuotationPaymentStatus.paid
      : QuotationPaymentStatus.partially_paid;
  return { paidAmount: paid, remainingAmount: remaining, paymentStatus };
}

/** Fields every quote response carries next to the row (API contract). */
export interface QuoteActionFlags {
  /** A payment attempt that may still settle exists on the quote. */
  hasPaymentInFlight: boolean;
  /** TTC settled so far (= paidAmount). */
  receivedAmount: number;
  /** No money received and nothing in flight: the quote may be deleted. */
  canDelete: boolean;
  /** Sent or approved, nothing received, nothing in flight. */
  canRecall: boolean;
  /**
   * A re-plan (PUT quotations/:id/payment-plan) can still place a new
   * installment: some pack step is outside the batches of the kept (paid
   * or cancelled) installments. See hasFreeStepForReplan.
   */
  freeStepsForReplan: boolean;
}

export type QuotationView<T> = T & QuoteActionFlags;

export function quoteActionFlags(
  status: QuotationStatus,
  money: QuoteMoney,
  freeStepsForReplan: boolean,
): QuoteActionFlags {
  const untouched = money.receivedCount === 0 && money.inFlightCount === 0;
  return {
    hasPaymentInFlight: money.inFlightCount > 0,
    receivedAmount: toAmount(money.received),
    canDelete: untouched,
    canRecall:
      untouched &&
      (status === QuotationStatus.sent || status === QuotationStatus.approved),
    freeStepsForReplan,
  };
}

type QuoteReader = Pick<Prisma.TransactionClient, 'payment' | 'quoteStepBatch'>;

type PresentableQuote = {
  id: string;
  status: QuotationStatus;
} & QuoteStepLimits;

/** A quote with a step limit, whose kept batches decide the free steps. */
const isLimitedPack = (quote: PresentableQuote): boolean =>
  !!quote.packId && !quote.isUnlimitedSteps && (quote.maxStepsPerArch ?? 0) > 0;

/**
 * The step ranges of the kept installments' batches, per quote. One read
 * for any number of quotes, and none when no quote has a step limit (the
 * answer does not depend on batches then).
 */
async function readKeptStepRanges(
  db: Pick<Prisma.TransactionClient, 'quoteStepBatch'>,
  quotes: PresentableQuote[],
): Promise<Map<string, StepRange[]>> {
  const result = new Map<string, StepRange[]>();
  const ids = quotes.filter(isLimitedPack).map((quote) => quote.id);
  if (ids.length === 0) return result;
  const batches = await db.quoteStepBatch.findMany({
    where: {
      quotationId: { in: ids },
      installment: { status: { in: KEPT_INSTALLMENT_STATUSES } },
    },
    select: { quotationId: true, fromStep: true, toStep: true },
  });
  for (const batch of batches) {
    const ranges = result.get(batch.quotationId) ?? [];
    ranges.push({ fromStep: batch.fromStep, toStep: batch.toStep });
    result.set(batch.quotationId, ranges);
  }
  return result;
}

export async function presentQuote<T extends PresentableQuote>(
  db: QuoteReader,
  quote: T,
): Promise<QuotationView<T>> {
  return (await presentQuotes(db, [quote]))[0];
}

export async function presentQuotes<T extends PresentableQuote>(
  db: QuoteReader,
  quotes: T[],
): Promise<Array<QuotationView<T>>> {
  // One after the other: `db` may be a transaction client, which runs a
  // single query at a time.
  const money = await readQuoteMoney(
    db,
    quotes.map((q) => q.id),
  );
  const kept = await readKeptStepRanges(db, quotes);
  return quotes.map((quote) => ({
    ...quote,
    ...quoteActionFlags(
      quote.status,
      money.get(quote.id) ?? emptyQuoteMoney(),
      hasFreeStepForReplan(quote, kept.get(quote.id) ?? []),
    ),
  }));
}

/**
 * Lock a quote for an edit inside a transaction. Installment rows first,
 * in the order PaymentsService.handleSuccess and the ClicToPay attempt
 * take them, then the quote row: one lock order everywhere means an edit
 * and a settlement queue up instead of deadlocking, and money read after
 * this call cannot change before the commit.
 */
export async function lockQuoteForEdit(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  quotationId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "QuoteInstallment" WHERE "quotationId" = ${quotationId} ORDER BY id FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "Quotation" WHERE id = ${quotationId} FOR UPDATE`;
}

type OrderWriter = Pick<Prisma.TransactionClient, 'dentalOrder'>;

/**
 * PaymentsService.handleSuccess's rule for a quote that becomes fully
 * paid: its order moves on to fabrication. Only from a quote / payment
 * phase status, so an order already further along is never moved back.
 */
export async function advanceOrderWhenPaid(
  tx: OrderWriter,
  orderId: string,
): Promise<boolean> {
  const order = await tx.dentalOrder.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  if (!order || !QUOTE_PHASE_ORDER_STATUSES.includes(order.status)) {
    return false;
  }
  await tx.dentalOrder.update({
    where: { id: orderId },
    data: { status: OrderStatus.fabrication },
  });
  return true;
}

/**
 * Back to the state right before a quote was issued, when the quote is
 * recalled or deleted. Same guard as above: an order past the payment
 * phase keeps its status.
 */
export async function resetOrderBeforeQuote(
  tx: OrderWriter,
  orderId: string,
): Promise<boolean> {
  const order = await tx.dentalOrder.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  if (!order || !QUOTE_PHASE_ORDER_STATUSES.includes(order.status)) {
    return false;
  }
  await tx.dentalOrder.update({
    where: { id: orderId },
    data: { status: OrderStatus.treatment_approved },
  });
  return true;
}

export function assertQuoteEditable(status: QuotationStatus): void {
  if (!EDITABLE_QUOTE_STATUSES.includes(status)) {
    throw new BadRequestException(
      `A "${status}" quotation can no longer be edited.`,
      QUOTE_ERROR.NOT_EDITABLE,
    );
  }
}

/** Refuse when money was received or an attempt may still settle. */
export function assertNoMoneyMoved(money: QuoteMoney, action: string): void {
  if (money.receivedCount > 0) {
    throw new ConflictException(
      `Cannot ${action}: a payment has already been received on this quotation.`,
      QUOTE_ERROR.PAYMENT_RECEIVED,
    );
  }
  if (money.inFlightCount > 0) {
    throw new ConflictException(
      `Cannot ${action}: a payment is in progress on this quotation. Wait until it is settled or has failed.`,
      QUOTE_ERROR.PAYMENT_IN_FLIGHT,
    );
  }
}

export interface PlanInstallment {
  id: string;
  installmentNumber: number;
  amount: Prisma.Decimal;
  status: InstallmentStatus;
  /** An attempt on this installment may still settle. */
  inFlight: boolean;
}

export interface InstallmentChange {
  id: string;
  installmentNumber: number;
  from: Money;
  to: Money;
}

/** What an edit of the total does to the installment plan. */
export interface PlanRebalance {
  /** Unpaid rows whose amount changes. */
  changes: InstallmentChange[];
  /**
   * Unpaid rows that no longer carry anything to pay (the new total is
   * already settled): they become `cancelled` at 0 and their aligners are
   * released, since nothing more is owed for them.
   */
  cancelled: InstallmentChange[];
  /**
   * The amount of a NEW installment to add when every row is paid (or
   * cancelled) and the new total asks for more. It carries no step batch:
   * it bills an extra on aligners the plan already covers. Null = none.
   */
  extra: Money | null;
}

/**
 * The installment plan after a quote's total changes.
 *
 * Paid installments (and their step batches) never move; cancelled ones
 * stay cancelled. What is left to pay, newTotal - Σ paid installments, is
 * spread over the OPEN rows (pending / overdue) in proportion to their
 * current amounts, keeping their count, dates and step ranges. Every new
 * total at or above what was settled therefore has a plan:
 *   - nothing left and open rows → those rows are cancelled;
 *   - something left and no open row → one extra installment is added;
 *   - a remainder too small to spread → it all goes on the first open row
 *     and the other open rows are cancelled.
 *
 * Refuses:
 *   - 400 QUOTE_TOTAL_BELOW_PAID when the total goes below what was settled;
 *   - 409 QUOTE_PAYMENT_IN_FLIGHT when an open row has an attempt that may
 *     still settle (its amount was copied from the row).
 */
export function planRebalance(args: {
  newTotal: Prisma.Decimal;
  received: Prisma.Decimal;
  installments: PlanInstallment[];
}): PlanRebalance {
  const none: PlanRebalance = { changes: [], cancelled: [], extra: null };
  const paid = args.installments.filter(
    (row) => row.status === InstallmentStatus.paid,
  );
  const open = args.installments.filter(
    (row) =>
      row.status !== InstallmentStatus.paid &&
      row.status !== InstallmentStatus.cancelled,
  );
  const paidSum = paid.reduce(
    (acc, row) => acc.plus(row.amount),
    new Prisma.Decimal(0),
  );
  const floor = Prisma.Decimal.max(round3(args.received), paidSum);
  if (args.newTotal.lessThan(floor.minus(MONEY_EPSILON))) {
    throw new BadRequestException(
      `The new total (${args.newTotal.toFixed(3)}) cannot be lower than what has already been paid (${floor.toFixed(3)}).`,
      QUOTE_ERROR.TOTAL_BELOW_PAID,
    );
  }
  // No plan yet (a draft pack quote): nothing to spread, the plan is
  // configured later against the new total.
  if (args.installments.length === 0) return none;

  if (open.some((row) => row.inFlight)) {
    throw new ConflictException(
      'A payment is in progress on an unpaid installment. Wait until it is settled or has failed before changing the total.',
      QUOTE_ERROR.PAYMENT_IN_FLIGHT,
    );
  }

  const zero = new Prisma.Decimal(0);
  const remaining = round3(args.newTotal.minus(paidSum));
  const nothingLeft = remaining.lessThanOrEqualTo(MONEY_EPSILON);
  const cancel = (rows: PlanInstallment[]): InstallmentChange[] =>
    rows.map((row) => ({
      id: row.id,
      installmentNumber: row.installmentNumber,
      from: row.amount,
      to: zero,
    }));

  if (open.length === 0) {
    return nothingLeft
      ? none
      : { changes: [], cancelled: [], extra: remaining };
  }
  if (nothingLeft) {
    return { changes: [], cancelled: cancel(open), extra: null };
  }

  const shares = spreadProportionally(
    remaining,
    open.map((row) => row.amount),
  );
  if (shares.some((share) => !share.greaterThan(0))) {
    const [first, ...rest] = open;
    return {
      changes: first.amount.equals(remaining)
        ? []
        : [
            {
              id: first.id,
              installmentNumber: first.installmentNumber,
              from: first.amount,
              to: remaining,
            },
          ],
      cancelled: cancel(rest),
      extra: null,
    };
  }
  return {
    changes: open
      .map((row, i) => ({
        id: row.id,
        installmentNumber: row.installmentNumber,
        from: row.amount,
        to: shares[i],
      }))
      .filter((change) => !change.from.equals(change.to)),
    cancelled: [],
    extra: null,
  };
}

/** The OrderAuditLog row for an edit of a quote the doctor already saw. */
export function quoteUpdateAudit(args: {
  orderId: string;
  caller: { userId: string; role: UserRole };
  actorName: string | null;
  changes: Record<string, { from: unknown; to: unknown }>;
  metadata: Record<string, unknown>;
}): Prisma.OrderAuditLogUncheckedCreateInput {
  return {
    orderId: args.orderId,
    actorId: args.caller.userId,
    actorName: args.actorName,
    actorRole: args.caller.role,
    action: QUOTE_UPDATED_AUDIT_ACTION,
    ...(Object.keys(args.changes).length > 0
      ? { changes: args.changes as Prisma.InputJsonValue }
      : {}),
    metadata: args.metadata as Prisma.InputJsonValue,
  };
}

/** Plain JSON value for an audit diff (Decimals as 3-decimal strings). */
export function auditValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Prisma.Decimal) return value.toFixed(3);
  if (value instanceof Date) return value.toISOString();
  return value;
}

/** { field: { from, to } } for the fields whose value changed. */
export function auditDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [field, value] of Object.entries(after)) {
    const from = auditValue(before[field]);
    const to = auditValue(value);
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes[field] = { from, to };
    }
  }
  return changes;
}
