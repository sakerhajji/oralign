import type { ArchTreatment, ProductionArch } from '@prisma/client';
import { treatedArches } from '../production/kernel';

/**
 * Owner decision D4: a plan is sent to the practitioner (mark-ready) only
 * with its planned aligners for EVERY arch the case treats, at least 1
 * each: the lab's "X sur Y, reste Z" reads them once the plan is approved.
 * The treated arches are the production kernel's rule (archTreatment,
 * else treatBothArch, else the arches this plan sizes, else both), so the
 * planner and the lab never disagree on which arch counts.
 *
 * Returns the arches still missing a total, upper first; [] = ready.
 */
export function missingPlanTotals(plan: {
  totalUpperAligners: number | null;
  totalLowerAligners: number | null;
  order: { archTreatment: ArchTreatment | null; treatBothArch: boolean };
}): ProductionArch[] {
  const totals: Record<ProductionArch, number | null> = {
    upper: plan.totalUpperAligners,
    lower: plan.totalLowerAligners,
  };
  return treatedArches({
    archTreatment: plan.order.archTreatment,
    treatBothArch: plan.order.treatBothArch,
    approvedPlan: plan,
  }).filter((arch) => {
    const total = totals[arch];
    return total == null || total < 1;
  });
}
