import {
  BatchStatus,
  OrderStatus,
  ProductionArch,
  ProductionEventType,
  QuotationPaymentStatus,
} from '@prisma/client';
import type { PlannedTotals } from './production.contract';
import { nextStepFromOf, toReleasedRanges } from './production.mapper';
import { releasedSteps } from './production.rules';
import {
  releaseSummaryOf,
  trimmedBatchSpan,
  type OrderFacts,
} from './production-state';

/**
 * The release read model (spec §3, CONTRACT §2.5): releaseSummaryOf, the
 * trimmed batch ranges of the case sheet and the next RELEASED steps.
 * Pure: facts are built here exactly as orderFactsOf() builds them.
 */

const { upper, lower } = ProductionArch;

const approved = (total: number) => ({
  total,
  source: 'approved_plan' as const,
  provisional: false,
});
const fromPack = (total: number) => ({
  total,
  source: 'pack' as const,
  provisional: true,
});

let seq = 0;
const batch = (fromStep: number, toStep: number, status: BatchStatus) => {
  seq += 1;
  return {
    id: `b${seq}`,
    fromStep,
    toStep,
    status,
    deliveredByProduction: false,
  };
};

type Batch = ReturnType<typeof batch>;

/** OrderFacts of a case, the way orderFactsOf() derives them. */
function facts(input: {
  planned: PlannedTotals;
  batches?: Batch[];
  status?: OrderStatus;
  unlimited?: boolean;
  paymentStatus?: QuotationPaymentStatus;
  noQuote?: boolean;
}): Pick<OrderFacts, 'quote' | 'batches' | 'planned' | 'treated' | 'released'> {
  const stepBatches = input.batches ?? [];
  const unlimited = input.unlimited ?? false;
  const paymentStatus =
    input.paymentStatus ?? QuotationPaymentStatus.partially_paid;
  const treated = [upper, lower].filter((arch) => input.planned[arch] !== null);
  return {
    quote: input.noQuote
      ? null
      : ({
          isUnlimitedSteps: unlimited,
          paymentStatus,
          stepBatches,
        } as unknown as OrderFacts['quote']),
    batches: unlimited ? [] : stepBatches,
    planned: input.planned,
    treated,
    released: releasedSteps({
      status: input.status ?? OrderStatus.payment_pending,
      quotation: input.noQuote
        ? null
        : { paymentStatus, isUnlimitedSteps: unlimited, batches: stepBatches },
    }),
  };
}

describe('releaseSummaryOf', () => {
  it('the spec example: plan 1→7, batch 1→4 paid, 5→7 locked = « Débloquées 1→4 · Prochaine tranche 5→7 »', () => {
    const summary = releaseSummaryOf(
      facts({
        planned: { upper: approved(7), lower: approved(7) },
        batches: [
          batch(1, 4, BatchStatus.unlocked),
          batch(5, 7, BatchStatus.locked),
        ],
      }),
    );
    const arch = {
      total: { from: 1, to: 7 },
      provisional: false,
      unlocked: [{ from: 1, to: 4 }],
      workableTo: 4,
    };
    expect(summary).toEqual({
      state: 'partial',
      arches: { upper: arch, lower: arch },
      next: { from: 5, to: 7 },
    });
  });

  it('… then 5→7 is paid: everything, no next tranche', () => {
    const summary = releaseSummaryOf(
      facts({
        planned: { upper: approved(7), lower: approved(7) },
        batches: [
          batch(1, 4, BatchStatus.delivered),
          batch(5, 7, BatchStatus.unlocked),
        ],
      }),
    );
    expect(summary.state).toBe('all');
    expect(summary.next).toBeNull();
    expect(summary.arches.upper).toMatchObject({
      unlocked: [{ from: 1, to: 7 }],
      workableTo: 7,
    });
  });

  it('all batches locked, even in a production status: « Aucune tranche débloquée », the first tranche next', () => {
    const summary = releaseSummaryOf(
      facts({
        status: OrderStatus.fabrication,
        planned: { upper: approved(7), lower: null },
        batches: [
          batch(5, 7, BatchStatus.locked),
          batch(1, 4, BatchStatus.locked),
        ],
      }),
    );
    expect(summary).toEqual({
      state: 'none',
      arches: {
        upper: {
          total: { from: 1, to: 7 },
          provisional: false,
          unlocked: [],
          workableTo: null,
        },
        lower: null,
      },
      next: { from: 1, to: 4 },
    });
  });

  it('trims to each arch’s APPROVED total: pack batches 1→10, 11→20 on a 20 / 14 plan', () => {
    const summary = releaseSummaryOf(
      facts({
        planned: { upper: approved(20), lower: approved(14) },
        batches: [
          batch(1, 10, BatchStatus.unlocked),
          batch(11, 20, BatchStatus.unlocked),
          batch(21, 30, BatchStatus.locked),
        ],
      }),
    );
    expect(summary.arches.upper?.unlocked).toEqual([{ from: 1, to: 20 }]);
    expect(summary.arches.lower?.unlocked).toEqual([{ from: 1, to: 14 }]);
    expect(summary.arches.lower?.workableTo).toBe(14);
    // 21→30 holds no aligner of the plan: nothing is left to release.
    expect(summary.next).toBeNull();
    expect(summary.state).toBe('all');
  });

  it('a next tranche ends at the highest approved total', () => {
    const summary = releaseSummaryOf(
      facts({
        planned: { upper: approved(16), lower: approved(14) },
        batches: [
          batch(1, 10, BatchStatus.unlocked),
          batch(11, 20, BatchStatus.locked),
        ],
      }),
    );
    expect(summary.next).toEqual({ from: 11, to: 16 });
    expect(summary.state).toBe('partial');
  });

  it('a provisional total never trims, and is marked provisional', () => {
    const summary = releaseSummaryOf(
      facts({
        planned: { upper: fromPack(20), lower: null },
        batches: [
          batch(1, 10, BatchStatus.unlocked),
          batch(11, 20, BatchStatus.locked),
        ],
      }),
    );
    expect(summary.arches.upper).toEqual({
      total: { from: 1, to: 20 },
      provisional: true,
      unlocked: [{ from: 1, to: 10 }],
      workableTo: 10,
    });
    expect(summary.next).toEqual({ from: 11, to: 20 });
  });

  it('a plan longer than its batches stays partial with no next tranche (the extra steps are not released)', () => {
    const summary = releaseSummaryOf(
      facts({
        planned: { upper: approved(22), lower: null },
        batches: [batch(1, 20, BatchStatus.unlocked)],
      }),
    );
    expect(summary).toMatchObject({ state: 'partial', next: null });
    expect(summary.arches.upper?.unlocked).toEqual([{ from: 1, to: 20 }]);
  });

  it('merges adjacent released tranches; a gap stays a gap', () => {
    const summary = releaseSummaryOf(
      facts({
        planned: { upper: approved(12), lower: null },
        batches: [
          batch(1, 4, BatchStatus.delivered),
          batch(5, 8, BatchStatus.locked),
          batch(9, 12, BatchStatus.unlocked),
        ],
      }),
    );
    expect(summary.arches.upper).toMatchObject({
      unlocked: [
        { from: 1, to: 4 },
        { from: 9, to: 12 },
      ],
      workableTo: 12,
    });
    expect(summary.next).toEqual({ from: 5, to: 8 });
  });

  it('no batches in a production status: unscheduled (legacy, everything released)', () => {
    const summary = releaseSummaryOf(
      facts({
        noQuote: true,
        status: OrderStatus.fabrication,
        planned: {
          upper: approved(9),
          lower: { total: null, source: null, provisional: true },
        },
      }),
    );
    expect(summary).toEqual({
      state: 'unscheduled',
      arches: {
        upper: {
          total: { from: 1, to: 9 },
          provisional: false,
          unlocked: [{ from: 1, to: 9 }],
          workableTo: 9,
        },
        // Unknown total: nothing to show, the state says everything.
        lower: {
          total: null,
          provisional: true,
          unlocked: [],
          workableTo: null,
        },
      },
      next: null,
    });
  });

  it('unlimited pack: everything once one placeholder is paid, nothing before, never a next tranche', () => {
    const paid = releaseSummaryOf(
      facts({
        unlimited: true,
        planned: { upper: approved(30), lower: null },
        batches: [
          batch(1, 1, BatchStatus.unlocked),
          batch(2, 2, BatchStatus.locked),
        ],
      }),
    );
    expect(paid).toMatchObject({
      state: 'all',
      next: null,
      arches: { upper: { unlocked: [{ from: 1, to: 30 }], workableTo: 30 } },
    });
    const unpaid = releaseSummaryOf(
      facts({
        unlimited: true,
        status: OrderStatus.fabrication,
        planned: { upper: approved(30), lower: null },
        batches: [batch(1, 1, BatchStatus.locked)],
      }),
    );
    expect(unpaid).toMatchObject({ state: 'none', next: null });
    expect(unpaid.arches.upper?.unlocked).toEqual([]);
  });

  it('carries no batch id, amount or installment: only spans and a state', () => {
    const summary = releaseSummaryOf(
      facts({
        planned: { upper: approved(7), lower: null },
        batches: [
          batch(1, 4, BatchStatus.unlocked),
          batch(5, 7, BatchStatus.locked),
        ],
      }),
    );
    expect(JSON.stringify(summary)).not.toMatch(
      /"b\d+"|amount|install|payment/i,
    );
  });
});

describe('trimmedBatchSpan / toReleasedRanges (case sheet chips)', () => {
  const planned: PlannedTotals = { upper: approved(14), lower: approved(12) };

  it('ends a range at the highest approved total, drops a batch beyond it', () => {
    expect(
      trimmedBatchSpan({ fromStep: 11, toStep: 20 }, [upper, lower], planned),
    ).toEqual({
      from: 11,
      to: 14,
    });
    expect(
      trimmedBatchSpan({ fromStep: 15, toStep: 20 }, [upper, lower], planned),
    ).toBeNull();
    expect(
      toReleasedRanges(
        [
          batch(11, 20, BatchStatus.locked),
          batch(1, 10, BatchStatus.unlocked),
          batch(21, 30, BatchStatus.locked),
        ],
        { treated: [upper, lower], planned },
      ),
    ).toEqual([
      { from: 1, to: 10, state: 'released' },
      { from: 11, to: 14, state: 'locked' },
    ]);
  });

  it('null without batches', () => {
    expect(toReleasedRanges(null, { treated: [upper], planned })).toBeNull();
    expect(toReleasedRanges([], { treated: [upper], planned })).toBeNull();
  });
});

describe('nextStepFromOf: the form never proposes a locked step', () => {
  const planned: PlannedTotals = { upper: approved(7), lower: null };
  const printed = (stepFrom: number, stepTo: number) => ({
    type: ProductionEventType.model_printed,
    arch: upper,
    stepFrom,
    stepTo,
    cancelledAt: null,
  });

  it('the first uncovered RELEASED step; null once the released steps are done', () => {
    const released = [{ from: 1, to: 4 }];
    expect(
      nextStepFromOf([printed(1, 2)], planned, released).model_printed,
    ).toEqual({
      upper: 3,
      lower: null,
    });
    expect(
      nextStepFromOf([printed(1, 4)], planned, released).model_printed,
    ).toEqual({
      upper: null,
      lower: null,
    });
    expect(
      nextStepFromOf([printed(1, 4)], planned, released).aligner_thermoformed
        .upper,
    ).toBe(1);
  });

  it('skips a locked gap to the next released tranche', () => {
    expect(
      nextStepFromOf([printed(1, 4)], { upper: approved(12), lower: null }, [
        { from: 1, to: 4 },
        { from: 9, to: 12 },
      ]).model_printed.upper,
    ).toBe(9);
  });

  it('nothing released: null everywhere; everything released: as before', () => {
    expect(nextStepFromOf([], planned, []).model_printed.upper).toBeNull();
    const everything = releasedSteps({
      status: OrderStatus.fabrication,
      quotation: null,
    });
    expect(
      nextStepFromOf([printed(1, 4)], planned, everything).model_printed.upper,
    ).toBe(5);
    expect(
      nextStepFromOf(
        [printed(1, 4)],
        {
          upper: { total: null, source: null, provisional: true },
          lower: null,
        },
        everything,
      ).model_printed.upper,
    ).toBe(5);
  });
});
