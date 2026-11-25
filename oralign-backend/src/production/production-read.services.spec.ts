import {
  BatchStatus,
  OrderStatus,
  OrderType,
  ProductionArch,
  ProductionEventOrigin,
  ProductionEventType,
  QuotationPaymentStatus,
  UserRole,
} from '@prisma/client';
import type { Caller } from '../common/access/caller';
import { OrderAccessPolicy } from '../common/access/order-access.policy';
import { businessInstant } from '../common/time/business-day';
import type { PrismaService } from '../prisma/prisma.service';
import { ProductionMyDayParam, ProductionQueueTabParam } from './dto';
import { ProductionDossierService } from './production-dossier.service';
import { ProductionMyDayService } from './production-my-day.service';
import { ProductionOrderGate } from './production-order-gate';
import { ProductionQueueService } from './production-queue.service';
import { ProductionSheetService } from './production-sheet.service';
import { PRODUCTION_ERROR } from './production.contract';

const technician: Caller = { userId: 'u-tech', role: UserRole.technician };
const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const dentist: Caller = { userId: 'u-doc', role: UserRole.dentist };
const NOW = businessInstant('2026-11-25', '10:00');

/** The first argument of a mock's first call. */
const firstArg = (fn: jest.Mock): unknown =>
  (fn.mock.calls as unknown[][])[0][0];

function summaryRow(over: Record<string, unknown> = {}) {
  return {
    id: 'o1',
    orderCode: 'ORD-1',
    orderType: OrderType.initial,
    parentOrderId: null,
    status: OrderStatus.fabrication,
    parentOrder: null,
    patient: { fullName: 'Ines' },
    doctor: { fullName: 'Dr Salma', dentistProfile: { clinicName: 'Lac' } },
    productionProgress: null,
    archTreatment: 'upper',
    treatBothArch: false,
    totalAligners: null,
    treatmentPlans: [{ totalUpperAligners: 12, totalLowerAligners: null }],
    quotation: null,
    createdAt: businessInstant('2026-11-01', '09:00'),
    deletedAt: null,
    ...over,
  };
}

const event = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  orderId: 'o1',
  declarationId: 'd1',
  type: ProductionEventType.model_printed,
  arch: ProductionArch.upper,
  stepFrom: 1,
  stepTo: 4,
  quantity: 4,
  performedAt: NOW,
  createdAt: NOW,
  createdById: technician.userId,
  createdByName: 'Tech',
  createdByRole: UserRole.technician,
  deliveredTo: null,
  deliveredToName: null,
  note: null,
  warnings: [],
  origin: ProductionEventOrigin.declared,
  notifiedAt: null,
  cancelledAt: null,
  cancelledById: null,
  cancelledByName: null,
  cancelReason: null,
  ...over,
});

function makePrisma() {
  const prisma = {
    dentalOrder: {
      count: jest.fn().mockResolvedValue(41),
      findMany: jest.fn().mockResolvedValue([summaryRow()]),
      findUnique: jest.fn().mockResolvedValue(summaryRow()),
      findFirst: jest.fn(),
    },
    productionEvent: { findMany: jest.fn().mockResolvedValue([event()]) },
  };
  const asPrisma = prisma as unknown as PrismaService;
  return { prisma, asPrisma, policy: new OrderAccessPolicy(asPrisma) };
}

describe('ProductionQueueService', () => {
  it('two calls whatever the page size, paged with a stable order', async () => {
    const { prisma, asPrisma, policy } = makePrisma();
    const page = await new ProductionQueueService(asPrisma, policy).list(
      { page: 3, limit: 20, search: 'ines' },
      technician,
    );

    expect(prisma.dentalOrder.count).toHaveBeenCalledTimes(1);
    expect(prisma.dentalOrder.findMany).toHaveBeenCalledTimes(1);
    const args = firstArg(prisma.dentalOrder.findMany) as {
      skip: number;
      take: number;
      orderBy: unknown[];
      select: Record<string, unknown>;
    };
    expect(args).toMatchObject({ skip: 40, take: 20 });
    expect(args.orderBy).toEqual([
      { productionProgress: { lastActionAt: { sort: 'desc', nulls: 'last' } } },
      { createdAt: 'asc' },
      { id: 'asc' },
    ]);
    expect(args.select).not.toHaveProperty('files');
    expect(page).toMatchObject({
      total: 41,
      page: 3,
      limit: 20,
      totalPages: 3,
    });
    expect(page.data[0]).toMatchObject({
      orderId: 'o1',
      kind: 'main',
      treatedArches: [ProductionArch.upper],
      planned: {
        upper: { total: 12, source: 'approved_plan', provisional: false },
        lower: null,
      },
      deliveryComplete: false,
    });
  });

  it('a full page of varied rows still costs two calls: no per-row lookup (N+1 guard)', async () => {
    const { prisma, asPrisma, policy } = makePrisma();
    const progress = {
      printedUpper: 4,
      printedLower: 2,
      thermoformedUpper: 4,
      thermoformedLower: 2,
      cutUpper: 3,
      cutLower: 0,
      deliveredUpper: 2,
      deliveredLower: 0,
      firstActionAt: NOW,
      lastActionAt: NOW,
      updatedAt: NOW,
    };
    // Every shape the mapper branches on: supplemental child, progress row,
    // both arches, provisional totals from the pack, unlimited pack.
    const rows = Array.from({ length: 20 }, (_, i) =>
      summaryRow({
        id: `o${i}`,
        orderCode: `ORD-${i}`,
        orderType:
          i % 4 === 0 ? OrderType.additional_aligners : OrderType.initial,
        parentOrderId: i % 4 === 0 ? 'p1' : null,
        parentOrder: i % 4 === 0 ? { orderCode: 'ORD-P' } : null,
        productionProgress: i % 2 === 0 ? progress : null,
        archTreatment: i % 3 === 0 ? 'both' : 'upper',
        treatBothArch: i % 3 === 0,
        treatmentPlans:
          i % 5 === 0
            ? []
            : [{ totalUpperAligners: 12, totalLowerAligners: 10 }],
        quotation:
          i % 5 === 0
            ? {
                maxStepsPerArch: 20,
                isUnlimitedSteps: i % 10 === 0,
                deletedAt: null,
              }
            : null,
      }),
    );
    prisma.dentalOrder.findMany.mockResolvedValue(rows);
    prisma.dentalOrder.count.mockResolvedValue(57);

    const page = await new ProductionQueueService(asPrisma, policy).list(
      { page: 1, limit: 20 },
      admin,
    );

    expect(page.data).toHaveLength(20);
    expect(prisma.dentalOrder.count).toHaveBeenCalledTimes(1);
    expect(prisma.dentalOrder.findMany).toHaveBeenCalledTimes(1);
    // Any other Prisma call would throw (unmocked); these are the mocked ones
    // an N+1 would most likely reach for.
    expect(prisma.dentalOrder.findUnique).not.toHaveBeenCalled();
    expect(prisma.dentalOrder.findFirst).not.toHaveBeenCalled();
    expect(prisma.productionEvent.findMany).not.toHaveBeenCalled();
  });

  it('the technician\'s "Terminés" only lists cases declared through the module', async () => {
    const { prisma, asPrisma, policy } = makePrisma();
    const queue = new ProductionQueueService(asPrisma, policy);
    await queue.list({ tab: ProductionQueueTabParam.done }, technician);
    await queue.list({ tab: ProductionQueueTabParam.done }, admin);
    const [mine, theirs] = prisma.dentalOrder.count.mock.calls.map((call) =>
      JSON.stringify((call as unknown as [{ where: unknown }])[0].where),
    );
    expect(mine).toContain('"origin":"declared"');
    expect(theirs).not.toContain('"origin":"declared"');
  });

  it('refuses a role without production access before reading', async () => {
    const { prisma, asPrisma, policy } = makePrisma();
    await expect(
      new ProductionQueueService(asPrisma, policy).list({}, dentist),
    ).rejects.toMatchObject({ status: 403 });
    expect(prisma.dentalOrder.count).not.toHaveBeenCalled();
  });
});

describe('ProductionSheetService', () => {
  it('two calls; the next steps, the window and the history', async () => {
    const { prisma, asPrisma, policy } = makePrisma();
    const sheet = await new ProductionSheetService(asPrisma, policy).get(
      'o1',
      technician,
      NOW,
    );
    expect(prisma.dentalOrder.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.productionEvent.findMany).toHaveBeenCalledTimes(1);
    expect(sheet.nextStepFrom.model_printed).toEqual({ upper: 5, lower: null });
    expect(sheet.nextStepFrom.aligner_thermoformed).toEqual({
      upper: 1,
      lower: null,
    });
    expect(sheet).toMatchObject({
      clinicName: 'Lac',
      canDeclare: true,
      cannotDeclareReason: null,
      releasedRanges: null,
      declareWindow: { earliestDay: '2026-11-18', latestDay: '2026-11-25' },
      sheetVersion: '0',
    });
    expect(sheet.history[0]).toMatchObject({ id: 'e1', canCancel: true });
  });

  it('a history case is readable but not declarable for her', async () => {
    const { prisma, asPrisma, policy } = makePrisma();
    prisma.dentalOrder.findUnique.mockResolvedValue(
      summaryRow({ status: OrderStatus.finished }),
    );
    const sheet = await new ProductionSheetService(asPrisma, policy).get(
      'o1',
      technician,
      NOW,
    );
    expect(sheet).toMatchObject({
      canDeclare: false,
      cannotDeclareReason: PRODUCTION_ERROR.ORDER_NOT_IN_PRODUCTION,
    });
  });

  it('a legacy-only case is a 403 for her and readable by an admin', async () => {
    const { prisma, asPrisma, policy } = makePrisma();
    prisma.dentalOrder.findUnique.mockResolvedValue(
      summaryRow({
        status: OrderStatus.finished,
        quotation: {
          maxStepsPerArch: 20,
          isUnlimitedSteps: false,
          deletedAt: null,
          paymentStatus: QuotationPaymentStatus.paid,
          treatmentValidityMonths: 6,
          stepBatches: [
            {
              id: 'b1',
              fromStep: 1,
              toStep: 12,
              status: BatchStatus.delivered,
              deliveredByProduction: false,
            },
          ],
        },
      }),
    );
    prisma.productionEvent.findMany.mockResolvedValue([
      event({
        type: ProductionEventType.aligner_delivered,
        origin: ProductionEventOrigin.legacy_batch,
        createdById: null,
      }),
    ]);
    const service = new ProductionSheetService(asPrisma, policy);
    await expect(service.get('o1', technician, NOW)).rejects.toMatchObject({
      status: 403,
    });
    await expect(service.get('o1', admin, NOW)).resolves.toMatchObject({
      releasedRanges: [{ from: 1, to: 12, state: 'delivered' }],
    });
  });

  it('404 for a missing or archived order', async () => {
    const { prisma, asPrisma, policy } = makePrisma();
    prisma.dentalOrder.findUnique.mockResolvedValue(
      summaryRow({ deletedAt: NOW }),
    );
    await expect(
      new ProductionSheetService(asPrisma, policy).get('o1', admin, NOW),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('ProductionOrderGate + dossier (the §1 access check)', () => {
  it('a readable order is ONE call: the scope rides in the dossier query', async () => {
    const { prisma, asPrisma, policy } = makePrisma();
    prisma.dentalOrder.findFirst.mockResolvedValue(null);
    const gate = new ProductionOrderGate(asPrisma, policy);
    const load = jest.fn().mockResolvedValue({ id: 'o1' });

    await expect(gate.requireReadable('o1', technician, load)).resolves.toEqual(
      {
        id: 'o1',
      },
    );
    const where = firstArg(load) as Record<string, unknown>;
    expect(where).toMatchObject({ id: 'o1', deletedAt: null });
    expect(JSON.stringify(where)).toContain('"origin":"declared"');
    expect(prisma.dentalOrder.findUnique).not.toHaveBeenCalled();
  });

  it('a miss tells 403 ORDER_NOT_IN_PRODUCTION from 404 with one more lookup (technician)', async () => {
    const { prisma, asPrisma, policy } = makePrisma();
    const gate = new ProductionOrderGate(asPrisma, policy);
    const miss = () => Promise.resolve(null);

    prisma.dentalOrder.findUnique.mockResolvedValueOnce({ deletedAt: null });
    await expect(
      gate.requireReadable('o1', technician, miss),
    ).rejects.toMatchObject({
      statusCode: 403,
      errorCode: PRODUCTION_ERROR.ORDER_NOT_IN_PRODUCTION,
    });
    prisma.dentalOrder.findUnique.mockResolvedValueOnce({ deletedAt: NOW });
    await expect(
      gate.requireReadable('o1', technician, miss),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("an admin's miss is a 404 straight away", async () => {
    const { prisma, asPrisma, policy } = makePrisma();
    const gate = new ProductionOrderGate(asPrisma, policy);
    await expect(
      gate.requireReadable('o1', admin, () => Promise.resolve(null)),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.dentalOrder.findUnique).not.toHaveBeenCalled();
  });

  it('the dossier is one findFirst with the whitelist select', async () => {
    const { prisma, asPrisma, policy } = makePrisma();
    prisma.dentalOrder.findFirst.mockResolvedValue({
      ...summaryRow(),
      submittedAt: null,
      patientStage: null,
      chiefComplaint: null,
      treatmentPlan: null,
      dontMoveOption: null,
      apRelationship: null,
      anteroposteriorRelationship: null,
      elastics: null,
      openBite: null,
      midline: null,
      ipr: null,
      biteRamps: null,
      expansion: null,
      crossbite: null,
      spaces: null,
      extractions: null,
      specialInstructions: null,
      additionalInstructions: null,
      materials: [],
      useCbctWithScans: false,
      wantsManufacturing: true,
      patient: { fullName: 'Ines', gender: null, dateOfBirth: null },
      toothInstructions: [],
      files: [],
      treatmentPlans: [],
      supplementalRequest: null,
    });
    const dossier = await new ProductionDossierService(
      asPrisma,
      new ProductionOrderGate(asPrisma, policy),
    ).get('o1', admin, NOW);

    expect(prisma.dentalOrder.findFirst).toHaveBeenCalledTimes(1);
    const { select } = firstArg(prisma.dentalOrder.findFirst) as {
      select: Record<string, unknown>;
    };
    for (const forbidden of [
      'treatmentFeeAmount',
      'treatmentFeeProofPath',
      'cbctFeeAmount',
      'welcomeGiftAppliedAt',
      'quotation',
      'payments',
      'invoices',
      'coverageStartedAt',
      'auditLogs',
    ]) {
      expect(select).not.toHaveProperty(forbidden);
    }
    expect(dossier).toMatchObject({
      patient: { fullName: 'Ines', gender: null, age: null },
      plan: null,
      supplementalRequest: null,
    });
  });
});

describe('ProductionMyDayService', () => {
  it("one call on the caller's rows of the Tunis day (by createdAt), totals of the live rows", async () => {
    const { prisma, asPrisma, policy } = makePrisma();
    prisma.productionEvent.findMany.mockResolvedValue([
      {
        ...event({ quantity: 4 }),
        order: {
          id: 'o1',
          orderCode: 'ORD-1',
          orderType: OrderType.initial,
          patient: { fullName: 'Ines' },
        },
      },
      {
        ...event({
          id: 'e2',
          quantity: 6,
          cancelledAt: NOW,
          cancelReason: 'x',
        }),
        order: {
          id: 'o1',
          orderCode: 'ORD-1',
          orderType: OrderType.initial,
          patient: { fullName: 'Ines' },
        },
      },
    ]);
    const day = await new ProductionMyDayService(asPrisma, policy).get(
      { day: ProductionMyDayParam.yesterday },
      technician,
      NOW,
    );

    expect(prisma.productionEvent.findMany).toHaveBeenCalledTimes(1);
    expect(firstArg(prisma.productionEvent.findMany)).toMatchObject({
      where: {
        createdById: technician.userId,
        createdAt: {
          gte: businessInstant('2026-11-24', '00:00'),
          lt: businessInstant('2026-11-25', '00:00'),
        },
      },
      orderBy: [{ createdAt: 'desc' }, { arch: 'asc' }, { id: 'asc' }],
    });
    expect(day.day).toBe('2026-11-24');
    expect(day.totals.model_printed).toEqual({ entries: 1, quantity: 4 });
    expect(day.events.map((row) => row.order.patientName)).toEqual([
      'Ines',
      'Ines',
    ]);
  });
});
