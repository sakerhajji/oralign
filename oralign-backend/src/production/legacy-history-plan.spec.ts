import { ArchTreatment, ProductionArch } from '@prisma/client';
import type { PlannedTotalsInput } from './kernel';
import { planLegacyHistory, type LegacyBatch } from './legacy-history-plan';

const { upper, lower } = ProductionArch;
const DELIVERED = new Date('2026-10-01T09:00:00Z');
const UPDATED = new Date('2026-10-02T09:00:00Z');

/** Both arches, approved 20 / 14 unless overridden; a 20-step pack. */
const input = (over: Partial<PlannedTotalsInput> = {}): PlannedTotalsInput => ({
  archTreatment: ArchTreatment.both,
  treatBothArch: true,
  totalAligners: null,
  approvedPlan: { totalUpperAligners: 20, totalLowerAligners: 14 },
  quotation: { maxStepsPerArch: 20, isUnlimitedSteps: false, deletedAt: null },
  ...over,
});
const batch = (
  n: number,
  from: number,
  to: number,
  over: Partial<LegacyBatch> = {},
): LegacyBatch => ({
  batchNumber: n,
  fromStep: from,
  toStep: to,
  deliveredAt: DELIVERED,
  updatedAt: UPDATED,
  ...over,
});

describe('planLegacyHistory (D5 import, CONC-01 / CONC-02)', () => {
  it('a symmetric range is one declaration on both arches', () => {
    const plan = planLegacyHistory({
      planned: input({
        approvedPlan: { totalUpperAligners: 20, totalLowerAligners: 20 },
      }),
      batches: [batch(1, 1, 10)],
      imported: [],
    });
    expect(plan).toEqual({
      declarations: [
        {
          batchNumber: 1,
          arches: [upper, lower],
          fromStep: 1,
          toStep: 10,
          performedAt: DELIVERED,
        },
      ],
      skipped: 0,
      invalid: [],
      unlimitedSteps: false,
    });
  });

  it('clips each arch to its approved total: a 1-20 batch on a 20 / 14 plan never imports lower 15-20', () => {
    const plan = planLegacyHistory({
      planned: input(),
      batches: [batch(1, 1, 20)],
      imported: [],
    });
    expect(plan.declarations).toEqual([
      {
        batchNumber: 1,
        arches: [upper],
        fromStep: 1,
        toStep: 20,
        performedAt: DELIVERED,
      },
      {
        batchNumber: 1,
        arches: [lower],
        fromStep: 1,
        toStep: 14,
        performedAt: DELIVERED,
      },
    ]);
  });

  it('a batch past one total imports the other arch only; past both, nothing', () => {
    const plan = planLegacyHistory({
      planned: input(),
      batches: [batch(2, 15, 20), batch(3, 21, 25)],
      imported: [],
    });
    expect(plan.declarations).toEqual([
      {
        batchNumber: 2,
        arches: [upper],
        fromStep: 15,
        toStep: 20,
        performedAt: DELIVERED,
      },
    ]);
    expect(plan.skipped).toBe(1);
  });

  it('provisional totals (no approved plan) do not clip', () => {
    const plan = planLegacyHistory({
      planned: input({ approvedPlan: null, totalAligners: 14 }),
      batches: [batch(1, 1, 20)],
      imported: [],
    });
    expect(plan.declarations).toEqual([
      {
        batchNumber: 1,
        arches: [upper, lower],
        fromStep: 1,
        toStep: 20,
        performedAt: DELIVERED,
      },
    ]);
  });

  it('an unlimited-step pack is skipped whole: its batch ranges are placeholders', () => {
    const plan = planLegacyHistory({
      planned: input({
        approvedPlan: null,
        quotation: {
          maxStepsPerArch: null,
          isUnlimitedSteps: true,
          deletedAt: null,
        },
      }),
      batches: [batch(1, 1, 1), batch(2, 2, 2)],
      imported: [],
    });
    expect(plan).toEqual({
      declarations: [],
      skipped: 2,
      invalid: [],
      unlimitedSteps: true,
    });
  });

  it('an arch already imported is done, on its clipped range or its raw range, cancelled rows included', () => {
    const plan = planLegacyHistory({
      planned: input(),
      batches: [batch(1, 1, 20), batch(2, 1, 20)],
      // Upper of the clipped plan, then a raw lower 1-20 from a run made before the clipping.
      imported: [
        { arch: upper, stepFrom: 1, stepTo: 20 },
        { arch: lower, stepFrom: 1, stepTo: 20 },
      ],
    });
    expect(plan.declarations).toEqual([]);
    expect(plan.skipped).toBe(2);

    const partial = planLegacyHistory({
      planned: input(),
      batches: [batch(1, 1, 20)],
      imported: [{ arch: upper, stepFrom: 1, stepTo: 20 }],
    });
    expect(partial.declarations).toEqual([
      {
        batchNumber: 1,
        arches: [lower],
        fromStep: 1,
        toStep: 14,
        performedAt: DELIVERED,
      },
    ]);
  });

  it('an untreated arch is never imported', () => {
    const plan = planLegacyHistory({
      planned: input({
        archTreatment: ArchTreatment.upper,
        treatBothArch: false,
        approvedPlan: { totalUpperAligners: 12, totalLowerAligners: null },
      }),
      batches: [batch(1, 1, 20)],
      imported: [],
    });
    expect(plan.declarations).toEqual([
      {
        batchNumber: 1,
        arches: [upper],
        fromStep: 1,
        toStep: 12,
        performedAt: DELIVERED,
      },
    ]);
  });

  it('an invalid stored range is reported, and the hand-over date falls back to updatedAt', () => {
    const plan = planLegacyHistory({
      planned: input(),
      batches: [batch(1, 5, 3), batch(2, 1, 4, { deliveredAt: null })],
      imported: [],
    });
    expect(plan.invalid).toEqual([1]);
    expect(plan.declarations).toEqual([
      {
        batchNumber: 2,
        arches: [upper, lower],
        fromStep: 1,
        toStep: 4,
        performedAt: UPDATED,
      },
    ]);
  });
});
