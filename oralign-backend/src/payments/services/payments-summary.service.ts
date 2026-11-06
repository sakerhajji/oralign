import { Injectable } from '@nestjs/common';
import {
  PaymentMethod,
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
} from '@prisma/client';
import { isAdmin, type Caller } from '../../common/access/caller';
import {
  BUSINESS_TIME_ZONE,
  businessDayRange,
  businessToday,
  type BusinessDayRange,
} from '../../common/time/business-day';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  PaymentBucketDto,
  PaymentMethodBucketsDto,
  PaymentPurposeSummaryDto,
  PaymentSummaryQueryDto,
  PaymentsSummaryDto,
} from '../dto/payment.dto';

/** A sum of payments: the exact amount and how many were summed. */
export interface Tally {
  amount: Prisma.Decimal;
  count: number;
}

export type MethodTallies = Record<PaymentMethod, Tally>;

/** One groupBy row, whichever table it came from. */
interface MethodGroup {
  method: PaymentMethod | null;
  amount: Prisma.Decimal | null;
  count: number;
}

/** Inclusive business days; null leaves that side open. */
export interface TakingsPeriod {
  from: string | null;
  to: string | null;
}

const ZERO: Tally = { amount: new Prisma.Decimal(0), count: 0 };

/** The payment methods, in the order every summary and report lists them. */
export const METHOD_ORDER: readonly PaymentMethod[] = [
  PaymentMethod.cash,
  PaymentMethod.card,
  PaymentMethod.bank_transfer,
];

/**
 * The takings of a period: money actually received (status success), per
 * kind and per method, cut in Tunis business days.
 *
 * Two kinds, two sources, never mixed:
 *   • installments are Payment rows (purpose installment), dated by paidAt;
 *   • treatment fees live on the order (DentalOrder.treatmentFee*), dated
 *     by treatmentFeePaidAt. Their ClicToPay card attempts are ALSO Payment
 *     rows (purpose treatment_fee): summing those would count every card
 *     fee twice, so they never are.
 * Archived orders are left out, as the lists leave them out, so the
 * totals reconcile with the rows. A waived fee (amount 0) is not money.
 * Each kind is one groupBy: two queries whatever the period.
 *
 * The two "collected" queries are public: the payments report sums the
 * same way, narrowed by its own filters, so its totals and the desk's
 * figures can never follow two definitions of "received".
 */
@Injectable()
export class PaymentsSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async summarise(
    query: PaymentSummaryQueryDto,
    caller: Caller,
  ): Promise<PaymentsSummaryDto> {
    const period = resolveTakingsPeriod(query.from, query.to);
    const received = businessDayRange(period.from, period.to);
    const orders = ordersInScope(query.doctorId, caller);
    const [installments, treatmentFees] = await Promise.all([
      this.installmentsCollected(received, orders),
      this.treatmentFeesCollected(received, orders),
    ]);
    return toSummary(period, installments, treatmentFees);
  }

  /**
   * Installment money received over `received`, by method: successful
   * installment payments of `orders`, plus any `extra` condition (a
   * report's search, method, status… filters).
   */
  async installmentsCollected(
    received: BusinessDayRange,
    orders: Prisma.DentalOrderWhereInput,
    extra?: Prisma.PaymentWhereInput,
  ): Promise<MethodTallies> {
    const groups = await this.prisma.payment.groupBy({
      by: ['paymentMethod'],
      where: {
        purpose: PaymentPurpose.installment,
        status: PaymentRecordStatus.success,
        paidAt: received,
        amount: { gt: 0 },
        order: orders,
        ...(extra ? { AND: [extra] } : {}),
      },
      _sum: { amount: true },
      _count: { _all: true },
    });
    return tallyByMethod(
      groups.map((group) => ({
        method: group.paymentMethod,
        amount: group._sum.amount,
        count: group._count._all,
      })),
    );
  }

  /**
   * Treatment-fee money received over `received`, by method, read from
   * the orders (never from their card attempts), plus any `extra`
   * condition on the orders.
   */
  async treatmentFeesCollected(
    received: BusinessDayRange,
    orders: Prisma.DentalOrderWhereInput,
    extra?: Prisma.DentalOrderWhereInput,
  ): Promise<MethodTallies> {
    const groups = await this.prisma.dentalOrder.groupBy({
      by: ['treatmentFeePaymentMethod'],
      where: {
        ...orders,
        treatmentFeePaymentStatus: PaymentRecordStatus.success,
        treatmentFeePaidAt: received,
        treatmentFeeAmount: { gt: 0 },
        ...(extra ? { AND: [extra] } : {}),
      },
      _sum: { treatmentFeeAmount: true },
      _count: { _all: true },
    });
    return tallyByMethod(
      groups.map((group) => ({
        method: group.treatmentFeePaymentMethod,
        amount: group._sum.treatmentFeeAmount,
        count: group._count._all,
      })),
    );
  }
}

/** No date at all: today. One bound: the period is open on the other side. */
export function resolveTakingsPeriod(
  from?: string | null,
  to?: string | null,
): TakingsPeriod {
  if (!from && !to) {
    const today = businessToday();
    return { from: today, to: today };
  }
  return { from: from ?? null, to: to ?? null };
}

/**
 * A dentist sums their own orders, whatever doctorId they send; an admin
 * every order, or one dentist's. Archived orders never count.
 */
function ordersInScope(
  doctorId: string | undefined,
  caller: Caller,
): Prisma.DentalOrderWhereInput {
  const scopedDoctorId = isAdmin(caller) ? doctorId : caller.userId;
  return scopedDoctorId
    ? { deletedAt: null, doctorId: scopedDoctorId }
    : { deletedAt: null };
}

function eachMethod(tally: (method: PaymentMethod) => Tally): MethodTallies {
  return {
    [PaymentMethod.cash]: tally(PaymentMethod.cash),
    [PaymentMethod.card]: tally(PaymentMethod.card),
    [PaymentMethod.bank_transfer]: tally(PaymentMethod.bank_transfer),
  };
}

export function addTallies(a: Tally, b: Tally): Tally {
  return { amount: a.amount.plus(b.amount), count: a.count + b.count };
}

/** Every method of `tallies` summed. */
export function sumTallies(tallies: MethodTallies): Tally {
  return Object.values(tallies).reduce(addTallies, ZERO);
}

/** Both kinds, method by method. */
export function addMethodTallies(
  a: MethodTallies,
  b: MethodTallies,
): MethodTallies {
  return eachMethod((method) => addTallies(a[method], b[method]));
}

/** Every method present, zero when nothing was received that way. */
export function emptyMethodTallies(): MethodTallies {
  return eachMethod(() => ZERO);
}

/** Every method present, zero when nothing was received that way. */
function tallyByMethod(groups: MethodGroup[]): MethodTallies {
  const tallies = emptyMethodTallies();
  for (const { method, amount, count } of groups) {
    if (!method) continue;
    tallies[method] = addTallies(tallies[method], {
      amount: amount ?? ZERO.amount,
      count,
    });
  }
  return tallies;
}

function toBucket({ amount, count }: Tally): PaymentBucketDto {
  return { amount: amount.toFixed(3), count };
}

function toMethodBuckets(tallies: MethodTallies): PaymentMethodBucketsDto {
  return {
    cash: toBucket(tallies.cash),
    card: toBucket(tallies.card),
    bank_transfer: toBucket(tallies.bank_transfer),
  };
}

function toPurposeSummary(tallies: MethodTallies): PaymentPurposeSummaryDto {
  return {
    ...toBucket(sumTallies(tallies)),
    methods: toMethodBuckets(tallies),
  };
}

function toSummary(
  period: TakingsPeriod,
  installments: MethodTallies,
  treatmentFees: MethodTallies,
): PaymentsSummaryDto {
  const both = addMethodTallies(installments, treatmentFees);
  return {
    from: period.from,
    to: period.to,
    timeZone: BUSINESS_TIME_ZONE,
    currency: 'TND',
    total: toBucket(sumTallies(both)),
    methods: toMethodBuckets(both),
    purposes: {
      installment: toPurposeSummary(installments),
      treatment_fee: toPurposeSummary(treatmentFees),
    },
  };
}
