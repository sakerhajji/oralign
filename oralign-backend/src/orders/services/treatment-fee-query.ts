import {
  PaymentMethod,
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
} from '@prisma/client';
import { businessDayRange } from '../../common/time/business-day';
import { parseSearchAmount } from '../../common/utils/amount-search.util';
import { SortOrder } from '../dto/order.dto';
import { TreatmentFeeSortBy } from '../dto/treatment-fee.dto';

/**
 * The conditions of a treatment-fee list, shared by the history
 * (TreatmentFeeService) and the payments report (PaymentsReportService),
 * so a report always holds exactly the rows the desk lists for the same
 * filters. The fee is canonical on the order (DentalOrder.treatmentFee*).
 */
export interface TreatmentFeeListFilters {
  search?: string;
  /** Business days ('YYYY-MM-DD', Africa/Tunis) the fee was paid. */
  from?: string;
  to?: string;
  methods?: PaymentMethod[];
  statuses?: PaymentRecordStatus[];
  sortBy?: TreatmentFeeSortBy;
  sortOrder?: SortOrder;
}

/**
 * Orders whose fee has a payment on record (the welcome-gift orders have
 * none), archived ones left out. A paid-date period leaves out the fees
 * not paid yet: a transfer awaiting confirmation has no paid date.
 * `doctorId` is the caller's resolved scope (a dentist's own id, or the
 * dentist an admin picked).
 */
export function treatmentFeeWhere(
  filters: TreatmentFeeListFilters,
  doctorId: string | undefined,
): Prisma.DentalOrderWhereInput {
  const where: Prisma.DentalOrderWhereInput = {
    deletedAt: null,
    treatmentFeePaymentMethod: filters.methods?.length
      ? { in: filters.methods }
      : { not: null },
  };
  if (doctorId) where.doctorId = doctorId;
  if (filters.statuses?.length) {
    where.treatmentFeePaymentStatus = { in: filters.statuses };
  }
  const paid = businessDayRange(filters.from, filters.to);
  if (paid.gte || paid.lt) where.treatmentFeePaidAt = paid;
  // The search carries its own OR: it goes in an AND list, so it can
  // never overwrite another condition.
  const search = filters.search?.trim();
  if (search) where.AND = [{ OR: treatmentFeeSearch(search) }];
  return where;
}

/**
 * Newest payment first by default, and there the fees awaiting
 * confirmation (no paid date yet) come on top: they are the ones that
 * need an action. Oldest first puts them last. The id ends every sort so
 * rows sharing a value keep one stable order across pages.
 */
export function treatmentFeeOrderBy(
  filters: Pick<TreatmentFeeListFilters, 'sortBy' | 'sortOrder'>,
): Prisma.DentalOrderOrderByWithRelationInput[] {
  const direction = filters.sortOrder ?? SortOrder.desc;
  if (filters.sortBy === TreatmentFeeSortBy.amount) {
    return [{ treatmentFeeAmount: direction }, { id: direction }];
  }
  const nulls = direction === SortOrder.desc ? 'first' : 'last';
  return [
    { treatmentFeePaidAt: { sort: direction, nulls } },
    { updatedAt: direction },
    { id: direction },
  ];
}

/**
 * Order code, dentist and patient names, the receipt number (TF-…), the
 * transaction references of the fee's card payments (the gateway id and
 * our ClicToPay reference ORA-…), and the exact amount when the term
 * reads as one.
 */
function treatmentFeeSearch(term: string): Prisma.DentalOrderWhereInput[] {
  const text = { contains: term, mode: 'insensitive' } as const;
  const conditions: Prisma.DentalOrderWhereInput[] = [
    { orderCode: text },
    { doctor: { fullName: text } },
    { patient: { fullName: text } },
    { treatmentFeeInvoiceNumber: text },
    {
      payments: {
        some: {
          purpose: PaymentPurpose.treatment_fee,
          OR: [{ transactionId: text }, { merchantOrderNumber: text }],
        },
      },
    },
  ];
  const amount = parseSearchAmount(term);
  if (amount) conditions.push({ treatmentFeeAmount: amount });
  return conditions;
}
