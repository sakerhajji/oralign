import {
  BatchStatus,
  BatchUnlockSource,
  OrderStatus,
  OrderType,
  ProductionArch,
  ProductionEventOrigin,
  ProductionEventType,
  QuotationPaymentStatus,
  UserRole,
} from '@prisma/client';

// The D2 projection is specified on its own (production-batch-projection
// spec); here only the release path matters: no delivery is declared.
jest.mock('./production-batch-projection', () => {
  const actual: Record<string, unknown> = jest.requireActual(
    './production-batch-projection',
  );
  return {
    ...actual,
    projectBatches: jest.fn().mockResolvedValue({
      flips: [],
      reverts: [],
      coverage: null,
      finish: false,
    }),
  };
});

import type { Caller } from '../common/access/caller';
import { OrderAccessPolicy } from '../common/access/order-access.policy';
import { businessInstant } from '../common/time/business-day';
import type { PrismaService } from '../prisma/prisma.service';
import { unlockStepBatch } from './batch-unlock';
import {
  ProductionArchChoiceParam,
  type DeclareProductionEventDto,
} from './dto';
import { ProductionEventsService } from './production-events.service';
import { ProductionSheetService } from './production-sheet.service';
import { PRODUCTION_ERROR } from './production.contract';

/**
 * Spec §3 / §11 acceptance, end to end on the real services over one
 * in-memory case: plan 1→7, tranche 1→4 paid, tranche 5→7 locked.
 *   1. the card reads « Débloquées 1→4 · Prochaine tranche 5→7 »;
 *   2. the technician is refused 5→7 on every act (409 STEPS_NOT_RELEASED)
 *      and works on 1→4;
 *   3. the admin confirms the payment of tranche 2: the settlement's
 *      unlockStepBatch (source payment) releases 5→7 and journals it;
 *   4. the card reads 1→7 and the technician prints 5→7.
 */

const technician: Caller = { userId: 'u-tech', role: UserRole.technician };
const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const NOW = businessInstant('2026-11-27', '10:00');

function caseWorld() {
  const batches = [
    {
      id: 'b1',
      quotationId: 'q1',
      installmentId: 'i1',
      batchNumber: 1,
      fromStep: 1,
      toStep: 4,
      status: BatchStatus.unlocked as BatchStatus,
      deliveredByProduction: false,
    },
    {
      id: 'b2',
      quotationId: 'q1',
      installmentId: 'i2',
      batchNumber: 2,
      fromStep: 5,
      toStep: 7,
      status: BatchStatus.locked as BatchStatus,
      deliveredByProduction: false,
    },
  ];
  const events: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  let created = 0;

  const order = () => ({
    id: 'o1',
    orderCode: 'ORD-7',
    orderType: OrderType.initial,
    parentOrderId: null,
    parentOrder: null,
    status: OrderStatus.payment_pending,
    deletedAt: null,
    createdAt: businessInstant('2026-11-01', '09:00'),
    coverageStartedAt: null,
    coverageExpiresAt: null,
    patient: { fullName: 'Ines' },
    doctor: { fullName: 'Dr Salma', dentistProfile: { clinicName: 'Lac' } },
    productionProgress: null,
    archTreatment: 'both',
    treatBothArch: true,
    totalAligners: null,
    treatmentPlans: [{ totalUpperAligners: 7, totalLowerAligners: 7 }],
    quotation: {
      maxStepsPerArch: 20,
      isUnlimitedSteps: false,
      deletedAt: null,
      paymentStatus: QuotationPaymentStatus.partially_paid,
      treatmentValidityMonths: 12,
      stepBatches: batches.map((batch) => ({
        id: batch.id,
        fromStep: batch.fromStep,
        toStep: batch.toStep,
        status: batch.status,
        deliveredByProduction: batch.deliveredByProduction,
      })),
    },
  });

  const client = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    dentalOrder: { findUnique: jest.fn(() => Promise.resolve(order())) },
    productionEvent: {
      findMany: jest.fn(({ where }: { where: { idempotencyKey?: string } }) =>
        Promise.resolve(
          where.idempotencyKey
            ? events.filter(
                (row) => row.idempotencyKey === where.idempotencyKey,
              )
            : [...events],
        ),
      ),
      createManyAndReturn: jest.fn(
        ({ data }: { data: Record<string, unknown>[] }) => {
          const rows = data.map((row) => ({
            ...row,
            id: `e${++created}`,
            createdAt: NOW,
            notifiedAt: null,
            cancelledAt: null,
            cancelledById: null,
            cancelledByName: null,
            cancelReason: null,
          }));
          events.push(...rows);
          return Promise.resolve(rows);
        },
      ),
    },
    productionProgress: {
      upsert: jest.fn(({ update }: { update: object }) =>
        Promise.resolve({ ...update, updatedAt: NOW }),
      ),
    },
    quoteStepBatch: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) => {
        const batch = batches.find((row) => row.id === where.id);
        return Promise.resolve(
          batch
            ? {
                ...batch,
                quotation: { orderId: 'o1' },
                installment: { installmentNumber: batch.batchNumber },
              }
            : null,
        );
      }),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string; status: BatchStatus };
          data: { status: BatchStatus };
        }) => {
          const batch = batches.find(
            (row) => row.id === where.id && row.status === where.status,
          );
          if (batch) batch.status = data.status;
          return Promise.resolve({ count: batch ? 1 : 0 });
        },
      ),
    },
    orderAuditLog: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return Promise.resolve(data);
      }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ fullName: 'Admin One' }),
    },
  };
  const withTransaction = {
    ...client,
    $transaction: jest.fn((run: (tx: typeof client) => unknown) => run(client)),
  };
  const prisma = withTransaction as unknown as PrismaService;
  const policy = new OrderAccessPolicy(prisma);
  return {
    client,
    audits,
    production: new ProductionEventsService(prisma, policy),
    sheets: new ProductionSheetService(prisma, policy),
  };
}

let keys = 0;
const declare = (
  world: ReturnType<typeof caseWorld>,
  type: ProductionEventType,
  stepFrom: number,
  stepTo: number,
) =>
  world.production.declare(
    {
      orderId: 'o1',
      type,
      arch: ProductionArchChoiceParam.both,
      stepFrom,
      stepTo,
      ...(type === ProductionEventType.aligner_delivered
        ? { deliveredTo: 'practitioner' }
        : {}),
    } as DeclareProductionEventDto,
    `scenario-key-${++keys}`,
    technician,
    NOW,
  );

describe('spec §3 acceptance: tranche 1→4 paid on 1→7, then 5→7 paid', () => {
  it('locks 5→7 for the technician until its payment is confirmed, then releases 1→7', async () => {
    const world = caseWorld();

    // 1. The card: « Plan 1→7 · Débloquées 1→4 · Prochaine tranche 5→7 ».
    const before = await world.sheets.get('o1', technician, NOW);
    expect(before.release).toMatchObject({
      state: 'partial',
      next: { from: 5, to: 7 },
      arches: {
        upper: { total: { from: 1, to: 7 }, unlocked: [{ from: 1, to: 4 }] },
        lower: { total: { from: 1, to: 7 }, unlocked: [{ from: 1, to: 4 }] },
      },
    });
    expect(before.canDeclare).toBe(true);

    // 2. Every act on 5→7 is refused; 1→4 is workable.
    for (const type of Object.values(ProductionEventType)) {
      await expect(declare(world, type, 5, 7)).rejects.toMatchObject({
        statusCode: 409,
        errorCode: PRODUCTION_ERROR.STEPS_NOT_RELEASED,
      });
    }
    expect(
      world.client.productionEvent.createManyAndReturn,
    ).not.toHaveBeenCalled();
    const printed = await declare(
      world,
      ProductionEventType.model_printed,
      1,
      4,
    );
    expect(
      printed.events.map((row) => [row.arch, row.stepFrom, row.stepTo]),
    ).toEqual([
      [ProductionArch.upper, 1, 4],
      [ProductionArch.lower, 1, 4],
    ]);
    // Nothing released is left to print: the form proposes no locked step.
    const afterPrint = await world.sheets.get('o1', technician, NOW);
    expect(afterPrint.nextStepFrom.model_printed).toEqual({
      upper: null,
      lower: null,
    });

    // 3. The admin confirms tranche 2's transfer: settleWithin's unlock.
    const released = await unlockStepBatch(world.client as never, {
      batchId: 'b2',
      source: BatchUnlockSource.payment,
      actor: admin,
      paymentId: 'p2',
      at: NOW,
    });
    expect(released).toMatchObject({ id: 'b2', fromStep: 5, toStep: 7 });
    expect(world.audits).toEqual([
      expect.objectContaining({
        orderId: 'o1',
        action: 'batch_unlocked',
        paymentId: 'p2',
        actorId: admin.userId,
        metadata: expect.objectContaining({
          batchId: 'b2',
          source: BatchUnlockSource.payment,
          fromStep: 5,
          toStep: 7,
        }) as unknown,
      }),
    ]);

    // 4. The card reads 1→7; the technician prints 5→7.
    const after = await world.sheets.get('o1', technician, NOW);
    expect(after.release).toMatchObject({
      state: 'all',
      next: null,
      arches: { upper: { unlocked: [{ from: 1, to: 7 }], workableTo: 7 } },
    });
    expect(after.nextStepFrom.model_printed.upper).toBe(5);
    const rest = await declare(world, ProductionEventType.model_printed, 5, 7);
    expect(rest.events).toHaveLength(2);
    expect(rest.events[0].warnings).toEqual([]);
    expect(rest.events[0].origin).toBe(ProductionEventOrigin.declared);
  });
});
