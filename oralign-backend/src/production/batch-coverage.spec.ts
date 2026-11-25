import { ProductionArch } from '@prisma/client';
import { batchCoverageNeeds, coverageDeclarations } from './batch-coverage';
import type { PlannedTotal, PlannedTotals } from './production.contract';

const { upper, lower } = ProductionArch;
const both = [upper, lower];

const approved = (total: number): PlannedTotal => ({
  total,
  source: 'approved_plan',
  provisional: false,
});
const totals = (
  up: PlannedTotal | null,
  low: PlannedTotal | null,
): PlannedTotals => ({ upper: up, lower: low });

describe('batchCoverageNeeds (CONC-02)', () => {
  it('clips the batch to each arch approved total: a pack-max range on a 20 / 14 plan', () => {
    expect(
      batchCoverageNeeds(
        { fromStep: 1, toStep: 20 },
        both,
        totals(approved(20), approved(14)),
      ),
    ).toEqual([
      { arch: upper, fromStep: 1, toStep: 20 },
      { arch: lower, fromStep: 1, toStep: 14 },
    ]);
  });

  it('an arch whose clipped range is empty needs nothing', () => {
    expect(
      batchCoverageNeeds(
        { fromStep: 15, toStep: 20 },
        both,
        totals(approved(20), approved(14)),
      ),
    ).toEqual([{ arch: upper, fromStep: 15, toStep: 20 }]);
    // Wholly beyond both approved totals: nothing at all.
    expect(
      batchCoverageNeeds(
        { fromStep: 21, toStep: 30 },
        both,
        totals(approved(20), approved(14)),
      ),
    ).toEqual([]);
  });

  it('provisional and unknown totals never clip', () => {
    const provisional: PlannedTotal = {
      total: 14,
      source: 'pack',
      provisional: true,
    };
    const unknown: PlannedTotal = {
      total: null,
      source: null,
      provisional: true,
    };
    expect(
      batchCoverageNeeds(
        { fromStep: 1, toStep: 20 },
        both,
        totals(provisional, unknown),
      ),
    ).toEqual([
      { arch: upper, fromStep: 1, toStep: 20 },
      { arch: lower, fromStep: 1, toStep: 20 },
    ]);
  });

  it('only the arches asked for, in their order', () => {
    expect(
      batchCoverageNeeds(
        { fromStep: 1, toStep: 5 },
        [lower],
        totals(approved(20), approved(14)),
      ),
    ).toEqual([{ arch: lower, fromStep: 1, toStep: 5 }]);
  });
});

describe('coverageDeclarations', () => {
  it('one declaration when both arches need the same steps', () => {
    expect(
      coverageDeclarations([
        { arch: upper, fromStep: 1, toStep: 10 },
        { arch: lower, fromStep: 1, toStep: 10 },
      ]),
    ).toEqual([{ arches: [upper, lower], fromStep: 1, toStep: 10 }]);
  });

  it('one per distinct range otherwise, none for no need', () => {
    expect(
      coverageDeclarations([
        { arch: upper, fromStep: 1, toStep: 20 },
        { arch: lower, fromStep: 1, toStep: 14 },
      ]),
    ).toEqual([
      { arches: [upper], fromStep: 1, toStep: 20 },
      { arches: [lower], fromStep: 1, toStep: 14 },
    ]);
    expect(coverageDeclarations([])).toEqual([]);
  });
});
