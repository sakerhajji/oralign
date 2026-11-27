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

/**
 * A sum of payments: the exact amount and how many were summed.
 *
 * `amount` is the NET, the cash that came in (stamps included, the
 * retenue kept back by the practitioner excluded): the one definition of
 * "collected". `withholding` is the retenue à la source those payments
 * kept back, so brut (the factures' Total TTC) = amount + withholding
 * (spec §4: brut / retenue / net, see grossOf).
 */
export interface Tally {
  amount: Prisma.Decimal;
  count: number;
  withholding: Prisma.Decimal;
}

export type MethodTallies = Record<PaymentMethod, Tally>;

/** One groupBy row, whichever table it came from. */
interface MethodGroup {
  method: PaymentMethod | null;
  amount: Prisma.Decimal | null;
  withholding: Prisma.Decimal | null;
  count: number;
}

/**
 * A summary bucket: the net cash and its count (the historic contract),
 * plus the brut / retenue split (spec §4). All three are TND strings with
 * 3 decimals, brut = net + retenue.
 */
export interface SummaryBucket extends PaymentBucketDto {
  /** Brut: what the factures totalled (TTC, stamps included). */
  gross: string;
  /** Retenue à la source kept back by the practitioners. */
  withholding: string;
}

export interface SummaryMethodBuckets extends PaymentMethodBucketsDto {
  cash: SummaryBucket;
  cheque: SummaryBucket;
  card: SummaryBucket;
  bank_transfer: SummaryBucket;
}

export interface SummaryPurpose extends PaymentPurposeSummaryDto {
  gross: string;
  withholding: string;
  methods: SummaryMethodBuckets;
}

/** PaymentsSummaryDto with every bucket split brut / retenue / net. */
export interface PaymentsSummary extends PaymentsSummaryDto {
  total: SummaryBucket;
  methods: SummaryMethodBuckets;
  purposes: { installment: SummaryPurpose; treatment_fee: SummaryPurpose };
}

/** Inclusive business days; null leaves that side open. */
export interface TakingsPeriod {
  from: string | null;
  to: string | null;
}

const ZERO: Tally = {
  amount: new Prisma.Decimal(0),
  count: 0,
  withholding: new Prisma.Decimal(0),
};

/** The payment methods, in the order every summary and report lists them. */
export const METHOD_ORDER: readonly PaymentMethod[] = [
  PaymentMethod.cash,
  PaymentMethod.cheque,
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
 * Each sum also carries the retenue those payments kept back (brut =
 * cash + retenue, spec §4), from the same groupBy.
 * The sums are CASH, the money that actually came in: Payment.amount and
 * DentalOrder.treatmentFeeAmount are both net of the retenue à la source
 * the practitioner kept back, and both INCLUDE the droit de timbre charged
 * on top of each payment (owner decision 2026-11-20). On purpose: takings
 * are what reached the till or the bank, not what the devis were settled
 * by (that is amount + retenue - stamp, see paymentSettled; the
 * dashboards' revenue uses it).
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
  ): Promise<PaymentsSummary> {
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
      _sum: { amount: true, withholdingAmount: true },
      _count: { _all: true },
    });
    return tallyByMethod(
      groups.map((group) => ({
        method: group.paymentMethod,
        amount: group._sum.amount,
        withholding: group._sum.withholdingAmount,
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
      _sum: { treatmentFeeAmount: true, treatmentFeeWithholdingAmount: true },
      _count: { _all: true },
    });
    return tallyByMethod(
      groups.map((group) => ({
        method: group.treatmentFeePaymentMethod,
        amount: group._sum.treatmentFeeAmount,
        withholding: group._sum.treatmentFeeWithholdingAmount,
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
    [PaymentMethod.cheque]: tally(PaymentMethod.cheque),
    [PaymentMethod.card]: tally(PaymentMethod.card),
    [PaymentMethod.bank_transfer]: tally(PaymentMethod.bank_transfer),
  };
}

export function addTallies(a: Tally, b: Tally): Tally {
  return {
    amount: a.amount.plus(b.amount),
    count: a.count + b.count,
    withholding: a.withholding.plus(b.withholding),
  };
}

/** Brut of a tally: the cash plus the retenue kept back (Total TTC). */
export function grossOf(tally: Tally): Prisma.Decimal {
  return tally.amount.plus(tally.withholding);
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
  for (const { method, amount, withholding, count } of groups) {
    if (!method) continue;
    tallies[method] = addTallies(tallies[method], {
      amount: amount ?? ZERO.amount,
      count,
      withholding: withholding ?? ZERO.withholding,
    });
  }
  return tallies;
}

function toBucket(tally: Tally): SummaryBucket {
  return {
    amount: tally.amount.toFixed(3),
    count: tally.count,
    gross: grossOf(tally).toFixed(3),
    withholding: tally.withholding.toFixed(3),
  };
}

function toMethodBuckets(tallies: MethodTallies): SummaryMethodBuckets {
  return {
    cash: toBucket(tallies.cash),
    cheque: toBucket(tallies.cheque),
    card: toBucket(tallies.card),
    bank_transfer: toBucket(tallies.bank_transfer),
  };
}

function toPurposeSummary(tallies: MethodTallies): SummaryPurpose {
  return {
    ...toBucket(sumTallies(tallies)),
    methods: toMethodBuckets(tallies),
  };
}

function toSummary(
  period: TakingsPeriod,
  installments: MethodTallies,
  treatmentFees: MethodTallies,
): PaymentsSummary {
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
