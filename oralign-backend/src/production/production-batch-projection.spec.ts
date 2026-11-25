import {
  BatchStatus,
  OrderStatus,
  OrderType,
  ProductionArch,
  type Prisma,
} from '@prisma/client';
import {
  planBatchProjection,
  projectBatches,
  type BatchProjectionState,
  type ProjectionBatch,
  type ProjectionDelivery,
} from './production-batch-projection';
import type { PlannedTotal } from './production.contract';

const { upper, lower } = ProductionArch;
const T1 = new Date('2026-11-20T09:00:00.000Z');
const T2 = new Date('2026-11-22T09:00:00.000Z');

const batch = (
  id: string,
  fromStep: number,
  toStep: number,
  status: BatchStatus,
  deliveredByProduction = false,
): ProjectionBatch => ({ id, fromStep, toStep, status, deliveredByProduction });

const delivery = (
  arch: ProductionArch,
  stepFrom: number,
  stepTo: number,
  performedAt = T1,
  createdById: string | null = 'u-tech',
): ProjectionDelivery => ({ arch, stepFrom, stepTo, performedAt, createdById });

const approved = (total: number): PlannedTotal => ({
  total,
  source: 'approved_plan',
  provisional: false,
});

function state(over: Partial<BatchProjectionState> = {}): BatchProjectionState {
  return {
    status: OrderStatus.fabrication,
    orderType: OrderType.initial,
    coverageStartedAt: null,
    coverageExpiresAt: null,
    treatmentValidityMonths: 6,
    treatedArches: [upper, lower],
    planned: { upper: approved(20), lower: approved(20) },
    unlimitedSteps: false,
    batches: [
      batch('b1', 1, 5, BatchStatus.unlocked),
      batch('b2', 6, 10, BatchStatus.unlocked),
    ],
    deliveries: [],
    ...over,
  };
}

describe('planBatchProjection (pure, D2)', () => {
  it('flips an unlocked batch only once EVERY treated arch covers it', () => {
    expect(
      planBatchProjection(
        state({ deliveries: [delivery(upper, 1, 5)] }),
        'u-admin',
      ).flips,
    ).toEqual([]);

    const plan = planBatchProjection(
      state({ deliveries: [delivery(upper, 1, 5), delivery(lower, 1, 7, T2)] }),
      'u-admin',
    );
    // deliveredAt = the latest covering performedAt; attributed to the actor.
    expect(plan.flips).toEqual([
      { batchIds: ['b1'], deliveredAt: T2, deliveredById: 'u-admin' },
    ]);
    expect(plan.finish).toBe(false);
  });

  it('groups the flips by deliveredAt: one updateMany per distinct instant', () => {
    const plan = planBatchProjection(
      state({
        deliveries: [
          delivery(upper, 1, 10, T1),
          delivery(lower, 1, 5, T1),
          delivery(lower, 6, 10, T2),
        ],
      }),
      'u-admin',
    );
    expect(plan.flips.map((flip) => flip.batchIds)).toEqual([['b1'], ['b2']]);
    // Every batch is delivered now: the case is finished, the window starts at the first flip.
    expect(plan.finish).toBe(true);
    expect(plan.coverage?.coverageStartedAt).toEqual(T1);
  });

  it('attributes an unlock-hook flip to the author of the latest covering delivery', () => {
    const plan = planBatchProjection(
      state({
        treatedArches: [upper],
        deliveries: [
          delivery(upper, 1, 3, T1, 'u-a'),
          delivery(upper, 4, 5, T2, 'u-b'),
        ],
      }),
      null,
    );
    expect(plan.flips).toEqual([
      { batchIds: ['b1'], deliveredAt: T2, deliveredById: 'u-b' },
    ]);
  });

  it('never flips a locked batch', () => {
    const plan = planBatchProjection(
      state({
        batches: [batch('b1', 1, 5, BatchStatus.locked)],
        deliveries: [delivery(upper, 1, 5), delivery(lower, 1, 5)],
      }),
      'u-admin',
    );
    expect(plan.flips).toEqual([]);
  });

  it('reverts only production-flipped batches that lost coverage, never on a finished case', () => {
    const batches = [
      batch('b1', 1, 5, BatchStatus.delivered, true),
      batch('b2', 6, 10, BatchStatus.delivered, false),
    ];
    expect(planBatchProjection(state({ batches }), 'u-admin').reverts).toEqual([
      'b1',
    ]);
    expect(
      planBatchProjection(
        state({ batches, status: OrderStatus.finished }),
        'u-admin',
      ).reverts,
    ).toEqual([]);
  });

  it('starts no window on a supplemental child, and completes an expiry from the ORIGINAL start', () => {
    const covered = [delivery(upper, 1, 10), delivery(lower, 1, 10)];
    expect(
      planBatchProjection(
        state({ orderType: OrderType.replacement, deliveries: covered }),
        'u-admin',
      ).coverage,
    ).toBeNull();
    const started = new Date('2026-06-01T00:00:00.000Z');
    expect(
      planBatchProjection(
        state({ coverageStartedAt: started, deliveries: covered }),
        'u-admin',
      ).coverage,
    ).toEqual({ coverageExpiresAt: new Date('2026-12-01T00:00:00.000Z') });
  });
});

describe('planBatchProjection: the approved totals clip what a batch needs (CONC-02)', () => {
  // 'Modéré' pack (max 20 per arch), plan upper 20 / lower 14.
  const asymmetric = { upper: approved(20), lower: approved(14) };

  it('a pack-max batch [1,20] flips once upper 1-20 and lower 1-14 are delivered, and finishes the case', () => {
    const plan = planBatchProjection(
      state({
        planned: asymmetric,
        batches: [batch('b1', 1, 20, BatchStatus.unlocked)],
        deliveries: [delivery(upper, 1, 20, T1), delivery(lower, 1, 14, T2)],
      }),
      'u-tech',
    );
    expect(plan.flips).toEqual([
      { batchIds: ['b1'], deliveredAt: T2, deliveredById: 'u-tech' },
    ]);
    expect(plan.coverage?.coverageStartedAt).toEqual(T2);
    expect(plan.finish).toBe(true);
  });

  it('a batch [15,20] past the lower total flips on upper 15-20 alone', () => {
    const plan = planBatchProjection(
      state({
        planned: asymmetric,
        batches: [
          batch('b1', 1, 14, BatchStatus.delivered),
          batch('b2', 15, 20, BatchStatus.unlocked),
        ],
        deliveries: [delivery(upper, 15, 20, T2)],
      }),
      'u-tech',
    );
    expect(plan.flips).toEqual([
      { batchIds: ['b2'], deliveredAt: T2, deliveredById: 'u-tech' },
    ]);
    expect(plan.finish).toBe(true);
  });

  it('a batch wholly beyond both totals is covered by the case latest live delivery, never by nothing', () => {
    const beyond = [
      batch('b1', 1, 20, BatchStatus.unlocked),
      batch('b2', 21, 30, BatchStatus.unlocked),
    ];
    // No delivery at all: nothing flips (no reduce over an empty list).
    expect(
      planBatchProjection(
        state({ planned: asymmetric, batches: beyond }),
        'u-tech',
      ),
    ).toEqual({ flips: [], reverts: [], coverage: null, finish: false });

    const plan = planBatchProjection(
      state({
        planned: asymmetric,
        batches: beyond,
        deliveries: [delivery(upper, 1, 3, T1), delivery(lower, 1, 3, T2)],
      }),
      'u-tech',
    );
    expect(plan.flips).toEqual([
      { batchIds: ['b2'], deliveredAt: T2, deliveredById: 'u-tech' },
    ]);
    expect(plan.finish).toBe(false);
  });

  it('provisional totals never clip: lower 15-20 is still needed', () => {
    const plan = planBatchProjection(
      state({
        planned: {
          upper: approved(20),
          lower: { total: 14, source: 'pack', provisional: true },
        },
        batches: [batch('b1', 1, 20, BatchStatus.unlocked)],
        deliveries: [delivery(upper, 1, 20), delivery(lower, 1, 14)],
      }),
      'u-tech',
    );
    expect(plan.flips).toEqual([]);
  });

  it('reverts symmetrically: cancelling lower 1-14 uncovers the clipped batch', () => {
    const flippedBatch = [batch('b1', 1, 20, BatchStatus.delivered, true)];
    expect(
      planBatchProjection(
        state({
          planned: asymmetric,
          batches: flippedBatch,
          deliveries: [delivery(upper, 1, 20), delivery(lower, 1, 14)],
        }),
        'u-admin',
      ).reverts,
    ).toEqual([]);
    expect(
      planBatchProjection(
        state({
          planned: asymmetric,
          batches: flippedBatch,
          deliveries: [delivery(upper, 1, 20)],
        }),
        'u-admin',
      ).reverts,
    ).toEqual(['b1']);
  });
});

describe('planBatchProjection: unlimited-step packs are never projected (CONC-01)', () => {
  it('a [1,1] placeholder batch is neither flipped nor finished by a step-1 delivery', () => {
    const plan = planBatchProjection(
      state({
        unlimitedSteps: true,
        planned: { upper: approved(30), lower: approved(30) },
        batches: [batch('b1', 1, 1, BatchStatus.unlocked)],
        deliveries: [delivery(upper, 1, 1), delivery(lower, 1, 1)],
      }),
      'u-tech',
    );
    expect(plan).toEqual({
      flips: [],
      reverts: [],
      coverage: null,
      finish: false,
    });
  });

  it('nor reverted', () => {
    expect(
      planBatchProjection(
        state({
          unlimitedSteps: true,
          batches: [batch('b1', 1, 1, BatchStatus.delivered, true)],
        }),
        'u-admin',
      ).reverts,
    ).toEqual([]);
  });
});

describe('projectBatches (tx writes)', () => {
  function tx(over: Record<string, unknown> = {}) {
    return {
      $queryRaw: jest.fn().mockResolvedValue([]),
      quoteStepBatch: {
        updateMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
          Promise.resolve({ count: where.id.in.length }),
        ),
      },
      dentalOrder: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ id: 'o1' }),
      },
      productionEvent: { findMany: jest.fn().mockResolvedValue([]) },
      ...over,
    };
  }
  const asTx = (client: ReturnType<typeof tx>) =>
    client as unknown as Prisma.TransactionClient;

  it('with state: writes only (flip, coverage compare-and-set, finish), no lock, no read', async () => {
    const client = tx();
    const start = state({
      deliveries: [delivery(upper, 1, 10), delivery(lower, 1, 10)],
    });
    await projectBatches(asTx(client), {
      orderId: 'o1',
      actorId: 'u-admin',
      state: start,
    });

    expect(client.$queryRaw).not.toHaveBeenCalled();
    expect(client.dentalOrder.findUnique).not.toHaveBeenCalled();
    expect(client.quoteStepBatch.updateMany).toHaveBeenCalledTimes(1);
    expect(client.quoteStepBatch.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['b1', 'b2'] }, status: BatchStatus.unlocked },
      data: {
        status: BatchStatus.delivered,
        deliveredAt: T1,
        deliveredById: 'u-admin',
        deliveredByProduction: true,
      },
    });
    expect(client.dentalOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', coverageStartedAt: null, coverageExpiresAt: null },
      data: expect.objectContaining({ coverageStartedAt: T1 }) as unknown,
    });
    expect(client.dentalOrder.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { status: OrderStatus.finished },
      select: { id: true },
    });
  });

  it('never finishes the case when a racing re-plan left fewer rows than decided', async () => {
    const client = tx({
      quoteStepBatch: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    });
    await projectBatches(asTx(client), {
      orderId: 'o1',
      actorId: 'u-admin',
      state: state({
        deliveries: [delivery(upper, 1, 10), delivery(lower, 1, 10)],
      }),
    });
    expect(client.dentalOrder.update).not.toHaveBeenCalled();
  });

  it('reverts with one guarded updateMany', async () => {
    const client = tx();
    await projectBatches(asTx(client), {
      orderId: 'o1',
      actorId: 'u-admin',
      state: state({
        batches: [batch('b1', 1, 5, BatchStatus.delivered, true)],
      }),
    });
    expect(client.quoteStepBatch.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['b1'] },
        status: BatchStatus.delivered,
        deliveredByProduction: true,
      },
      data: {
        status: BatchStatus.unlocked,
        deliveredAt: null,
        deliveredById: null,
        deliveredByProduction: false,
      },
    });
    expect(client.dentalOrder.updateMany).not.toHaveBeenCalled();
  });

  it('without state (unlock hook): takes the ORDER lock first, then reads', async () => {
    const calls: string[] = [];
    const client = tx();
    client.$queryRaw.mockImplementation(() => {
      calls.push('lock');
      return Promise.resolve([]);
    });
    client.dentalOrder.findUnique.mockImplementation(() => {
      calls.push('order');
      return Promise.resolve({
        status: OrderStatus.payment_pending,
        orderType: OrderType.initial,
        coverageStartedAt: null,
        coverageExpiresAt: null,
        archTreatment: 'upper',
        treatBothArch: false,
        treatmentPlans: [],
        quotation: {
          deletedAt: null,
          treatmentValidityMonths: null,
          stepBatches: [batch('b1', 1, 5, BatchStatus.unlocked)],
        },
      });
    });
    client.productionEvent.findMany.mockImplementation(() => {
      calls.push('events');
      return Promise.resolve([delivery(upper, 1, 5, T2, 'u-admin')]);
    });

    await projectBatches(asTx(client), { orderId: 'o1', actorId: null });

    expect(calls).toEqual(['lock', 'order', 'events']);
    expect(client.quoteStepBatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deliveredById: 'u-admin',
          deliveredAt: T2,
        }) as unknown,
      }),
    );
  });

  it('without state: clips to the approved totals it reads in the SAME order call', async () => {
    const client = tx();
    client.dentalOrder.findUnique.mockResolvedValue({
      status: OrderStatus.payment_pending,
      orderType: OrderType.initial,
      coverageStartedAt: null,
      coverageExpiresAt: null,
      archTreatment: 'both',
      treatBothArch: false,
      totalAligners: null,
      treatmentPlans: [{ totalUpperAligners: 20, totalLowerAligners: 14 }],
      quotation: {
        deletedAt: null,
        maxStepsPerArch: 20,
        isUnlimitedSteps: false,
        treatmentValidityMonths: 6,
        stepBatches: [batch('b1', 1, 20, BatchStatus.unlocked)],
      },
    });
    client.productionEvent.findMany.mockResolvedValue([
      delivery(upper, 1, 20, T1, 'u-tech'),
      delivery(lower, 1, 14, T2, 'u-tech'),
    ]);

    await projectBatches(asTx(client), { orderId: 'o1', actorId: null });

    expect(client.dentalOrder.findUnique).toHaveBeenCalledTimes(1);
    const [{ select }] = client.dentalOrder.findUnique.mock.calls[0] as [
      {
        select: Record<string, unknown> & {
          quotation: { select: Record<string, unknown> };
        };
      },
    ];
    expect(select).toMatchObject({ totalAligners: true, archTreatment: true });
    expect(select.quotation.select).toMatchObject({
      maxStepsPerArch: true,
      isUnlimitedSteps: true,
    });
    expect(client.quoteStepBatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['b1'] }, status: BatchStatus.unlocked },
      }),
    );
    expect(client.dentalOrder.update).toHaveBeenCalledTimes(1);
  });

  it('without state: an unlimited-step pack reads no events and writes nothing', async () => {
    const client = tx();
    client.dentalOrder.findUnique.mockResolvedValue({
      status: OrderStatus.fabrication,
      orderType: OrderType.initial,
      coverageStartedAt: null,
      coverageExpiresAt: null,
      archTreatment: 'both',
      treatBothArch: false,
      totalAligners: null,
      treatmentPlans: [{ totalUpperAligners: 30, totalLowerAligners: 30 }],
      quotation: {
        deletedAt: null,
        maxStepsPerArch: null,
        isUnlimitedSteps: true,
        treatmentValidityMonths: 12,
        stepBatches: [batch('b1', 1, 1, BatchStatus.unlocked)],
      },
    });
    await projectBatches(asTx(client), { orderId: 'o1', actorId: null });
    expect(client.productionEvent.findMany).not.toHaveBeenCalled();
    expect(client.quoteStepBatch.updateMany).not.toHaveBeenCalled();
    expect(client.dentalOrder.update).not.toHaveBeenCalled();
  });

  it('spares the events read when no batch can move', async () => {
    const client = tx();
    client.dentalOrder.findUnique.mockResolvedValue({
      status: OrderStatus.fabrication,
      orderType: OrderType.initial,
      coverageStartedAt: null,
      coverageExpiresAt: null,
      archTreatment: null,
      treatBothArch: true,
      treatmentPlans: [],
      quotation: {
        deletedAt: null,
        treatmentValidityMonths: 6,
        stepBatches: [batch('b1', 1, 5, BatchStatus.locked)],
      },
    });
    await projectBatches(asTx(client), { orderId: 'o1', actorId: null });
    expect(client.productionEvent.findMany).not.toHaveBeenCalled();
    expect(client.quoteStepBatch.updateMany).not.toHaveBeenCalled();
  });
});
