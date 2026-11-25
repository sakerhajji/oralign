import type { ProductionArch } from '@prisma/client';
import type { PlannedTotals } from './production.contract';

/**
 * Which aligner steps a quote step batch stands for, per arch (CONC-02).
 *
 * A batch range is cut from 1..the pack's max steps, and ONE range serves
 * both arches, while the approved plan usually stops below the pack max
 * and often differs per arch (upper 20, lower 14). A technician cannot
 * declare above an approved total (400 STEP_BEYOND_PLANNED_TOTAL), so the
 * steps past it never exist: a batch needs, on each treated arch, only
 * the part of its range up to that arch's APPROVED total. Provisional or
 * unknown totals do not clip, since steps beyond them may still be
 * declared (with a warning).
 *
 * Pure: the batch projection (flip and revert), the batch_kept_after_cancel
 * anomaly and the legacy "Marquer livré" all read the same answer.
 */

/** The steps of one arch a batch needs delivered. */
export interface BatchCoverageNeed {
  arch: ProductionArch;
  fromStep: number;
  toStep: number;
}

/**
 * Per arch of `arches` (in that order), the batch range clipped to the
 * arch's approved-plan total. An arch whose clipped range is empty needs
 * nothing and is left out, so [] = a batch wholly beyond the approved
 * totals (the callers decide what covers it).
 */
export function batchCoverageNeeds(
  batch: { fromStep: number; toStep: number },
  arches: readonly ProductionArch[],
  planned: PlannedTotals,
): BatchCoverageNeed[] {
  const needs: BatchCoverageNeed[] = [];
  for (const arch of arches) {
    const total = planned[arch];
    const toStep =
      total?.source === 'approved_plan' && total.total !== null
        ? Math.min(batch.toStep, total.total)
        : batch.toStep;
    if (toStep >= batch.fromStep) {
      needs.push({ arch, fromStep: batch.fromStep, toStep });
    }
  }
  return needs;
}

/** One declaration of the needs: the arches that share the same range. */
export interface CoverageDeclaration {
  arches: ProductionArch[];
  fromStep: number;
  toStep: number;
}

/**
 * The fewest declarations that deliver `needs`: arches with the same range
 * share one (one notice), different ranges get one each, in the needs'
 * order. A declaration's rows always share their steps: the case sheet
 * shows them once per declaration.
 */
export function coverageDeclarations(
  needs: readonly BatchCoverageNeed[],
): CoverageDeclaration[] {
  const byRange = new Map<string, CoverageDeclaration>();
  for (const need of needs) {
    const key = `${need.fromStep}-${need.toStep}`;
    const declaration = byRange.get(key);
    if (declaration) declaration.arches.push(need.arch);
    else
      byRange.set(key, {
        arches: [need.arch],
        fromStep: need.fromStep,
        toStep: need.toStep,
      });
  }
  return [...byRange.values()];
}
