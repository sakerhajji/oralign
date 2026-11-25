import { ArchTreatment } from '@prisma/client';
import { missingPlanTotals } from './plan-totals';

const plan = (
  totals: { upper?: number | null; lower?: number | null },
  order: { archTreatment?: ArchTreatment | null; treatBothArch?: boolean } = {},
) => ({
  totalUpperAligners: totals.upper ?? null,
  totalLowerAligners: totals.lower ?? null,
  order: {
    archTreatment: order.archTreatment ?? null,
    treatBothArch: order.treatBothArch ?? false,
  },
});

describe('missingPlanTotals (D4: mark-ready needs a total per treated arch)', () => {
  it('both arches treated: both totals, at least 1 each', () => {
    const both = { archTreatment: ArchTreatment.both };
    expect(missingPlanTotals(plan({ upper: 24, lower: 20 }, both))).toEqual([]);
    expect(missingPlanTotals(plan({ upper: 24 }, both))).toEqual(['lower']);
    expect(missingPlanTotals(plan({}, both))).toEqual(['upper', 'lower']);
    // A legacy 0 (the old minimum) is not a total.
    expect(missingPlanTotals(plan({ upper: 0, lower: 20 }, both))).toEqual([
      'upper',
    ]);
  });

  it('one arch treated: only that total matters', () => {
    expect(
      missingPlanTotals(
        plan({ upper: 18 }, { archTreatment: ArchTreatment.upper }),
      ),
    ).toEqual([]);
    expect(
      missingPlanTotals(
        plan({ upper: 18 }, { archTreatment: ArchTreatment.lower }),
      ),
    ).toEqual(['lower']);
  });

  it('treatBothArch without archTreatment means both', () => {
    expect(
      missingPlanTotals(plan({ lower: 12 }, { treatBothArch: true })),
    ).toEqual(['upper']);
  });

  it('no arch information: the arches the plan sizes, else both', () => {
    expect(missingPlanTotals(plan({ lower: 12 }))).toEqual([]);
    expect(missingPlanTotals(plan({}))).toEqual(['upper', 'lower']);
  });
});
