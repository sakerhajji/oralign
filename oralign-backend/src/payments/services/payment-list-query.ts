import {
  PaymentMethod,
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
} from '@prisma/client';
import { BadRequestException } from '../../common/exceptions/app.exception';
import { businessDayRange } from '../../common/time/business-day';
import { parseSearchAmount } from '../../common/utils/amount-search.util';

/**
 * The conditions of a payment list, shared by every reader of the
 * Payment table that must agree row for row: the history and the
 * confirmation queue (PaymentsService) and the payments report
 * (PaymentsReportService). One builder, so a report always holds exactly
 * the rows the desk lists for the same filters.
 */
export interface PaymentListFilters {
  // status filter — legacy single + canonical multi
  status?: PaymentRecordStatus;
  statuses?: PaymentRecordStatus[];
  // method filter — legacy single + canonical multi
  paymentMethod?: PaymentMethod;
  methods?: PaymentMethod[];
  purpose?: PaymentPurpose;
  search?: string;
  patientId?: string;
  // business days ('YYYY-MM-DD', Africa/Tunis) of the date the payment happened
  from?: string;
  to?: string;
  // deprecated: UTC days of createdAt
  createdFrom?: string;
  createdTo?: string;
  /** Installment rank on its quote, both bounds included (1 = the first). */
  installmentMin?: number;
  installmentMax?: number;
}

/**
 * The Prisma where of a payment list. `doctorId` is the caller's resolved
 * scope (a dentist's own id, or the dentist an admin picked); payments of
 * archived orders are never listed — the admin trash view of orders is
 * where archived work is reviewed.
 */
export function paymentListWhere(
  filters: PaymentListFilters,
  doctorId: string | undefined,
): Prisma.PaymentWhereInput {
  const order: Prisma.DentalOrderWhereInput = { deletedAt: null };
  if (doctorId) order.doctorId = doctorId;
  if (filters.patientId) order.patientId = filters.patientId;
  const where: Prisma.PaymentWhereInput = { order };

  // Multi-value statuses — explicit list wins, legacy `status`
  // single-value falls back when no list is provided.
  if (filters.statuses && filters.statuses.length > 0) {
    where.status = { in: filters.statuses };
  } else if (filters.status) {
    where.status = filters.status;
  }

  // Multi-value methods — same precedence as statuses.
  if (filters.methods && filters.methods.length > 0) {
    where.paymentMethod = { in: filters.methods };
  } else if (filters.paymentMethod) {
    where.paymentMethod = filters.paymentMethod;
  }

  if (filters.purpose) where.purpose = filters.purpose;

  const installmentNumber = rankFilter(
    filters.installmentMin,
    filters.installmentMax,
  );
  if (installmentNumber) where.installment = { installmentNumber };

  const createdAt = legacyCreatedRange(filters.createdFrom, filters.createdTo);
  if (createdAt) where.createdAt = createdAt;

  // Conditions carrying their own OR go in an AND list, so the period
  // and the search can never overwrite each other.
  const and: Prisma.PaymentWhereInput[] = [];
  const period = eventDateFilter(filters.from, filters.to);
  if (period) and.push(period);
  const search = filters.search?.trim();
  if (search) and.push({ OR: paymentSearchConditions(search) });
  if (and.length > 0) where.AND = and;

  return where;
}

/**
 * The date a payment happened: when it was received if it was, otherwise
 * when it was made (an attempt, a transfer still awaiting confirmation).
 * The lists show it, sort on it (sortBy=eventAt) and the period filters
 * on it.
 */
export function paymentEventDate(payment: {
  paidAt: Date | null;
  createdAt: Date;
}): Date {
  return payment.paidAt ?? payment.createdAt;
}

/**
 * The id order the database gives a run sorted on the same date. Payment
 * ids are lowercase uuids, the hyphens at the same places, which the C
 * and the language collations all order like this.
 */
export function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * An installment-rank condition, or null when neither bound is set. A
 * range that ends before it starts is a 400 INVALID_INSTALLMENT_RANGE.
 */
function rankFilter(
  min: number | undefined,
  max: number | undefined,
): Prisma.IntFilter | null {
  if (min !== undefined && max !== undefined && min > max) {
    throw new BadRequestException(
      `The installment range cannot start (${min}) after it ends (${max}).`,
      'INVALID_INSTALLMENT_RANGE',
    );
  }
  const filter: Prisma.IntFilter = {};
  if (min !== undefined) filter.gte = min;
  if (max !== undefined) filter.lte = max;
  return filter.gte !== undefined || filter.lte !== undefined ? filter : null;
}

/**
 * Deprecated createdFrom/createdTo, kept exactly as they always worked:
 * whole UTC days of createdAt, [from 00:00, to 23:59:59.999] UTC. New
 * clients send from/to (business days of the date the payment happened).
 */
function legacyCreatedRange(
  from?: string,
  to?: string,
): Prisma.DateTimeFilter | undefined {
  const range: Prisma.DateTimeFilter = {};
  const start = from ? new Date(from.trim()) : null;
  if (start && !Number.isNaN(start.getTime())) range.gte = start;
  const end = to ? new Date(to.trim()) : null;
  if (end && !Number.isNaN(end.getTime())) {
    end.setUTCHours(23, 59, 59, 999);
    range.lte = end;
  }
  return range.gte || range.lte ? range : undefined;
}

/**
 * Business days of the date a payment happened: when it was received if
 * it was, otherwise when it was made (an attempt, a transfer still
 * awaiting confirmation). A transfer declared on Monday and confirmed on
 * Wednesday is Wednesday's money.
 */
function eventDateFilter(
  from?: string,
  to?: string,
): Prisma.PaymentWhereInput | null {
  const range = businessDayRange(from, to);
  if (!range.gte && !range.lt) return null;
  return { OR: [{ paidAt: range }, { paidAt: null, createdAt: range }] };
}

/**
 * Free-text search: the references a payment is known by (transactionId
 * holds the gateway id, the bank reference or the cash receipt; then the
 * receipt number FAC-… and the ClicToPay order reference ORA-…), the
 * order code, the doctor and patient names, and the exact amount when the
 * term reads as one. The caller's order scope stays on the outer where.
 */
function paymentSearchConditions(term: string): Prisma.PaymentWhereInput[] {
  const text = { contains: term, mode: 'insensitive' } as const;
  const conditions: Prisma.PaymentWhereInput[] = [
    { transactionId: text },
    { invoiceNumber: text },
    { merchantOrderNumber: text },
    {
      order: {
        OR: [
          { orderCode: text },
          { doctor: { fullName: text } },
          { patient: { fullName: text } },
        ],
      },
    },
  ];
  const amount = parseSearchAmount(term);
  if (amount) conditions.push({ amount });
  return conditions;
}
