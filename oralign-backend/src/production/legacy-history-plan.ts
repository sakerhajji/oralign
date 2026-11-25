import type { ProductionArch } from '@prisma/client';
import { batchCoverageNeeds, coverageDeclarations } from './batch-coverage';
import {
  resolvePlannedTotals,
  treatedArches,
  type PlannedTotalsInput,
} from './kernel';

/**
 * The go-live import's per-order plan (D5, scripts/import-production-history.ts),
 * kept pure so the rules that decide which legacy rows exist are tested.
 *
 *   • A batch stands for the steps batchCoverageNeeds gives (CONC-02): its
 *     range clipped per arch to the APPROVED total, so a pack-max range on
 *     a 20 / 14 plan never imports "lower 1-20".
 *   • An unlimited-step pack is skipped whole (CONC-01): its batch ranges
 *     are payment placeholders ([1,1], [2,2]…), not aligner steps.
 *   • Arches that share a range share one declaration (coverageDeclarations),
 *     as the legacy "Marquer livré" path declares them.
 *   • A batch arch already imported (cancelled rows included) is done. Its
 *     unclipped range counts too, so a run made before the clipping existed
 *     is never imported twice.
 */

/** A delivered batch the production module did not flip. */
export interface LegacyBatch {
  batchNumber: number;
  fromStep: number;
  toStep: number;
  deliveredAt: Date | null;
  updatedAt: Date;
}

export interface LegacyHistoryInput {
  planned: PlannedTotalsInput;
  /** In batch order. */
  batches: readonly LegacyBatch[];
  /** The order's legacy_batch rows already there, CANCELLED ones included. */
  imported: readonly {
    arch: ProductionArch;
    stepFrom: number;
    stepTo: number;
  }[];
}

/** One legacy declaration to write: one row per arch, all on the same steps. */
export interface LegacyDeclaration {
  batchNumber: number;
  arches: ProductionArch[];
  fromStep: number;
  toStep: number;
  performedAt: Date;
}

export interface LegacyHistoryPlan {
  declarations: LegacyDeclaration[];
  /** Batches with nothing (left) to import: done, beyond the plan, or an unlimited pack's. */
  skipped: number;
  /** Batch numbers whose stored range is not a range. */
  invalid: number[];
  /** True when the whole order was skipped as an unlimited-step pack. */
  unlimitedSteps: boolean;
}

const rangeKey = (arch: ProductionArch, from: number, to: number): string =>
  `${arch}:${from}:${to}`;

export function planLegacyHistory(
  input: LegacyHistoryInput,
): LegacyHistoryPlan {
  if (input.planned.quotation?.isUnlimitedSteps) {
    return {
      declarations: [],
      skipped: input.batches.length,
      invalid: [],
      unlimitedSteps: true,
    };
  }
  const arches = treatedArches(input.planned);
  const planned = resolvePlannedTotals(input.planned);
  const done = new Set(
    input.imported.map((row) => rangeKey(row.arch, row.stepFrom, row.stepTo)),
  );

  const declarations: LegacyDeclaration[] = [];
  const invalid: number[] = [];
  let skipped = 0;
  for (const batch of input.batches) {
    if (batch.fromStep < 0 || batch.toStep < batch.fromStep) {
      invalid.push(batch.batchNumber);
      continue;
    }
    const missing = batchCoverageNeeds(batch, arches, planned).filter(
      (need) =>
        !done.has(rangeKey(need.arch, need.fromStep, need.toStep)) &&
        !done.has(rangeKey(need.arch, batch.fromStep, batch.toStep)),
    );
    if (missing.length === 0) {
      skipped += 1;
      continue;
    }
    const performedAt = batch.deliveredAt ?? batch.updatedAt;
    for (const declaration of coverageDeclarations(missing)) {
      declarations.push({
        batchNumber: batch.batchNumber,
        ...declaration,
        performedAt,
      });
    }
  }
  return { declarations, skipped, invalid, unlimitedSteps: false };
}
