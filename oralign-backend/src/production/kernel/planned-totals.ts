import {
  ArchTreatment,
  Prisma,
  ProductionArch,
  TreatmentPlanStatus,
} from '@prisma/client';
import type { PlannedTotal, PlannedTotals } from '../production.contract';

/**
 * "Total prévu" per arch (owner decision D4), from the best reference the
 * case has, PER ARCH (finer than orders/supplemental alignerLimits, whose
 * order of sources it follows):
 *   1. the latest approved plan's total for that arch (final, not provisional);
 *   2. otherwise the pack snapshot on the quotation (maxStepsPerArch) unless
 *      the pack is unlimited;
 *   3. otherwise the case's totalAligners;
 *   4. otherwise unknown ({ total: null, source: null }).
 * 2-4 are provisional. An arch the case does not treat is null ("—"),
 * never a fallback value.
 */
export interface PlannedTotalsInput {
  archTreatment: ArchTreatment | null;
  treatBothArch: boolean;
  totalAligners: number | null;
  approvedPlan: {
    totalUpperAligners: number | null;
    totalLowerAligners: number | null;
  } | null;
  quotation: {
    maxStepsPerArch: number | null;
    isUnlimitedSteps: boolean;
    deletedAt: Date | null;
  } | null;
}

/**
 * The arches the case treats, never empty: archTreatment when set; else
 * both when treatBothArch; else the arches the approved plan gives a total
 * for; else both (the safe default: nothing is hidden from the lab).
 */
export function treatedArches(
  input: Pick<
    PlannedTotalsInput,
    'archTreatment' | 'treatBothArch' | 'approvedPlan'
  >,
): ProductionArch[] {
  switch (input.archTreatment) {
    case ArchTreatment.upper:
      return [ProductionArch.upper];
    case ArchTreatment.lower:
      return [ProductionArch.lower];
    case ArchTreatment.both:
      return [ProductionArch.upper, ProductionArch.lower];
    default:
      break;
  }
  if (input.treatBothArch) return [ProductionArch.upper, ProductionArch.lower];
  const plan = input.approvedPlan;
  const fromPlan: ProductionArch[] = [];
  if (plan?.totalUpperAligners != null) fromPlan.push(ProductionArch.upper);
  if (plan?.totalLowerAligners != null) fromPlan.push(ProductionArch.lower);
  return fromPlan.length > 0
    ? fromPlan
    : [ProductionArch.upper, ProductionArch.lower];
}

function plannedFor(
  arch: ProductionArch,
  input: PlannedTotalsInput,
): PlannedTotal {
  const planTotal =
    arch === ProductionArch.upper
      ? input.approvedPlan?.totalUpperAligners
      : input.approvedPlan?.totalLowerAligners;
  if (planTotal != null) {
    return { total: planTotal, source: 'approved_plan', provisional: false };
  }
  const quote = input.quotation;
  if (
    quote &&
    !quote.deletedAt &&
    !quote.isUnlimitedSteps &&
    quote.maxStepsPerArch
  ) {
    return { total: quote.maxStepsPerArch, source: 'pack', provisional: true };
  }
  if (input.totalAligners) {
    return { total: input.totalAligners, source: 'case', provisional: true };
  }
  return { total: null, source: null, provisional: true };
}

export function resolvePlannedTotals(input: PlannedTotalsInput): PlannedTotals {
  const treated = treatedArches(input);
  return {
    upper: treated.includes(ProductionArch.upper)
      ? plannedFor(ProductionArch.upper, input)
      : null,
    lower: treated.includes(ProductionArch.lower)
      ? plannedFor(ProductionArch.lower, input)
      : null,
  };
}

/**
 * The DentalOrder select that loads exactly the inputs above (nest it in a
 * list query: Prisma resolves each relation with one batched statement,
 * whatever the page size).
 */
export const PLANNED_TOTALS_ORDER_SELECT = {
  archTreatment: true,
  treatBothArch: true,
  totalAligners: true,
  treatmentPlans: {
    where: { status: TreatmentPlanStatus.approved, deletedAt: null },
    orderBy: [
      { approvedAt: { sort: 'desc', nulls: 'last' } },
      { version: 'desc' },
    ],
    take: 1,
    select: { totalUpperAligners: true, totalLowerAligners: true },
  },
  quotation: {
    select: { maxStepsPerArch: true, isUnlimitedSteps: true, deletedAt: true },
  },
} satisfies Prisma.DentalOrderSelect;

export type PlannedTotalsOrderRow = Prisma.DentalOrderGetPayload<{
  select: typeof PLANNED_TOTALS_ORDER_SELECT;
}>;

export function plannedTotalsInputOf(
  row: PlannedTotalsOrderRow,
): PlannedTotalsInput {
  return {
    archTreatment: row.archTreatment,
    treatBothArch: row.treatBothArch,
    totalAligners: row.totalAligners,
    approvedPlan: row.treatmentPlans[0] ?? null,
    quotation: row.quotation,
  };
}
