import {
  BatchStatus,
  DeliveryRecipient,
  OrderStatus,
  OrderType,
  Prisma,
  ProductionArch,
  ProductionEventOrigin,
  ProductionEventType,
  ProductionNoticeChannel,
  ProductionNoticeKind,
  ProductionNoticeStatus,
  QuotationPaymentStatus,
  UserRole,
} from '@prisma/client';
import type { Caller } from '../common/access/caller';
import { OrderAccessPolicy } from '../common/access/order-access.policy';
import { businessInstant } from '../common/time/business-day';
import type { PrismaService } from '../prisma/prisma.service';
import {
  ProductionArchChoiceParam,
  type CancelProductionEventDto,
  type DeclareProductionEventDto,
} from './dto';
import { ProductionEventsService } from './production-events.service';
import { PRODUCTION_ERROR, PRODUCTION_WARNING } from './production.contract';
import { LEGACY_DELIVERY_AUTO_CONFIRM } from './production.rules';

const { upper, lower } = ProductionArch;
const {
  model_printed: printed,
  aligner_cut: cut,
  aligner_delivered: delivered,
} = ProductionEventType;

const technician: Caller = { userId: 'u-tech', role: UserRole.technician };
const admin: Caller = { userId: 'u-admin', role: UserRole.admin };

const NOW = businessInstant('2026-11-25', '10:00');
const ORDER_CREATED = businessInstant('2026-10-01', '09:00');
const KEY = 'key-0001-abcd';

type EventRow = {
  id: string;
  orderId: string;
  declarationId: string;
  type: ProductionEventType;
  arch: ProductionArch;
  stepFrom: number;
  stepTo: number;
  quantity: number;
  performedAt: Date;
  createdAt: Date;
  createdById: string | null;
  createdByName: string | null;
  createdByRole: UserRole | null;
  deliveredTo: DeliveryRecipient | null;
  deliveredToName: string | null;
  note: string | null;
  warnings: string[];
  origin: ProductionEventOrigin;
  notifiedAt: Date | null;
  cancelledAt: Date | null;
  cancelledById: string | null;
  cancelledByName: string | null;
  cancelReason: string | null;
  idempotencyKey: string | null;
};

let seq = 0;
function eventRow(over: Partial<EventRow> = {}): EventRow {
  seq += 1;
  const type = over.type ?? cut;
  return {
    id: `e-${String(seq).padStart(3, '0')}`,
    orderId: 'o1',
    declarationId: `d-${seq}`,
    type,
    arch: upper,
    stepFrom: 1,
    stepTo: 5,
    quantity: 5,
    performedAt: new Date(NOW.getTime() - 3_600_000),
    createdAt: new Date(NOW.getTime() - 3_600_000),
    createdById: technician.userId,
    createdByName: 'Tech',
    createdByRole: UserRole.technician,
    deliveredTo: type === delivered ? DeliveryRecipient.practitioner : null,
    deliveredToName: null,
    note: null,
    warnings: [],
    origin: ProductionEventOrigin.declared,
    notifiedAt: null,
    cancelledAt: null,
    cancelledById: null,
    cancelledByName: null,
    cancelReason: null,
    idempotencyKey: null,
    ...over,
  };
}

interface WorldOptions {
  events?: EventRow[];
  status?: OrderStatus;
  batches?: {
    id: string;
    fromStep: number;
    toStep: number;
    status: BatchStatus;
    deliveredByProduction: boolean;
  }[];
  /** Fast-path rows (the replay lookup before the transaction). */
  prior?: EventRow[];
  notices?: {
    id: string;
    channel: ProductionNoticeChannel;
    status: ProductionNoticeStatus;
  }[];
  insertError?: Error;
  missingOrder?: boolean;
  /** The order is archived (soft-deleted): the cancel target filter misses. */
  orderDeleted?: boolean;
  /** Overrides of the live quotation (pack kind, payment state). */
  quotation?: Partial<{
    maxStepsPerArch: number | null;
    isUnlimitedSteps: boolean;
    paymentStatus: QuotationPaymentStatus;
  }>;
  /** The approved plan's totals (20 / 20 by default). */
  plan?: { totalUpperAligners: number; totalLowerAligners: number };
}

/**
 * Mocked Prisma like the repo's other service specs: every call is
 * recorded in `calls`, so a test asserts the query budget of §2.1 (#8 ≤ 12,
 * #9 ≤ 11) on the real service code, and reads what was written.
 */
function world(options: WorldOptions = {}) {
  const calls: string[] = [];
  const events: EventRow[] = [...(options.events ?? [])];
  const progress = { updatedAt: NOW };
  const order = {
    id: 'o1',
    status: options.status ?? OrderStatus.payment_pending,
    deletedAt: null,
    createdAt: ORDER_CREATED,
    orderType: OrderType.initial,
    coverageStartedAt: null,
    coverageExpiresAt: null,
    archTreatment: 'both',
    treatBothArch: false,
    totalAligners: null,
    treatmentPlans: [
      options.plan ?? { totalUpperAligners: 20, totalLowerAligners: 20 },
    ],
    quotation: {
      maxStepsPerArch: 20,
      isUnlimitedSteps: false,
      deletedAt: null,
      paymentStatus: QuotationPaymentStatus.partially_paid,
      treatmentValidityMonths: 6,
      ...options.quotation,
      stepBatches: options.batches ?? [
        {
          id: 'b1',
          fromStep: 1,
          toStep: 5,
          status: BatchStatus.unlocked,
          deliveredByProduction: false,
        },
      ],
    },
    productionProgress: null as null | Record<string, unknown>,
  };
  const counted =
    <A extends unknown[], R>(name: string, impl: (...args: A) => R) =>
    (...args: A): R => {
      calls.push(name);
      return impl(...args);
    };
  const progressRow = (name: string) =>
    jest.fn(
      counted(name, ({ where }: { where: { orderId: string } }) =>
        Promise.resolve(
          where.orderId === order.id ? order.productionProgress : null,
        ),
      ),
    );

  const tx = {
    $queryRaw: jest.fn(
      counted('$queryRaw', (strings: TemplateStringsArray) =>
        Promise.resolve(
          strings.join('?').includes('"ProductionNotice"')
            ? (options.notices ?? [])
            : [],
        ),
      ),
    ),
    dentalOrder: {
      findUnique: jest.fn(
        counted('dentalOrder.findUnique', () =>
          Promise.resolve(options.missingOrder ? null : structuredClone(order)),
        ),
      ),
      updateMany: jest.fn(
        counted('dentalOrder.updateMany', () => Promise.resolve({ count: 1 })),
      ),
      update: jest.fn(counted('dentalOrder.update', () => Promise.resolve({}))),
    },
    productionEvent: {
      // The cancel target, through the relation filter on its order.
      findFirst: jest.fn(
        counted(
          'productionEvent.findFirst',
          ({ where }: { where: { id: string; order?: unknown } }) => {
            const row = events.find((event) => event.id === where.id);
            return Promise.resolve(
              row && !(options.orderDeleted && where.order)
                ? { orderId: row.orderId }
                : null,
            );
          },
        ),
      ),
      findMany: jest.fn(
        counted(
          'productionEvent.findMany',
          ({
            where,
          }: {
            where: {
              orderId?: string;
              idempotencyKey?: string;
              type?: ProductionEventType;
              cancelledAt?: null;
            };
          }) =>
            Promise.resolve(
              where.idempotencyKey
                ? events.filter(
                    (event) => event.idempotencyKey === where.idempotencyKey,
                  )
                : events.filter(
                    (event) =>
                      event.orderId === where.orderId &&
                      (where.type === undefined || event.type === where.type) &&
                      (where.cancelledAt === undefined ||
                        event.cancelledAt === null),
                  ),
            ),
        ),
      ),
      createManyAndReturn: jest.fn(
        counted(
          'productionEvent.createManyAndReturn',
          ({ data }: { data: Omit<EventRow, 'id' | 'createdAt'>[] }) => {
            if (options.insertError) return Promise.reject(options.insertError);
            const created = data.map((row, index) => ({
              ...eventRow(),
              ...row,
              id: `n-${index + 1}`,
              createdAt: NOW,
            }));
            events.push(...created);
            return Promise.resolve(created);
          },
        ),
      ),
      updateMany: jest.fn(
        counted('productionEvent.updateMany', () =>
          Promise.resolve({ count: 1 }),
        ),
      ),
    },
    productionProgress: {
      upsert: jest.fn(
        counted('productionProgress.upsert', ({ update }: { update: object }) =>
          Promise.resolve({ ...update, ...progress }),
        ),
      ),
      findUnique: progressRow('productionProgress.findUnique'),
    },
    quoteStepBatch: {
      updateMany: jest.fn(
        counted(
          'quoteStepBatch.updateMany',
          ({ where }: { where: { id: { in: string[] } } }) =>
            Promise.resolve({ count: where.id.in.length }),
        ),
      ),
    },
    productionNotice: {
      createMany: jest.fn(
        counted('productionNotice.createMany', () =>
          Promise.resolve({ count: 2 }),
        ),
      ),
      updateMany: jest.fn(
        counted('productionNotice.updateMany', () =>
          Promise.resolve({ count: 1 }),
        ),
      ),
    },
  };
  const prisma = {
    productionEvent: {
      findMany: jest.fn(
        counted('fast.productionEvent.findMany', () =>
          Promise.resolve(options.prior ?? []),
        ),
      ),
    },
    productionProgress: {
      findUnique: progressRow('fast.productionProgress.findUnique'),
    },
    user: {
      findUnique: jest.fn(
        counted('user.findUnique', () => Promise.resolve({ fullName: 'Tech' })),
      ),
    },
    dentalOrder: { findUnique: jest.fn() },
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const service = new ProductionEventsService(
    prisma as unknown as PrismaService,
    new OrderAccessPolicy(prisma as unknown as PrismaService),
  );
  return { service, tx, prisma, calls, events, order };
}

function declareDto(
  over: Partial<DeclareProductionEventDto> = {},
): DeclareProductionEventDto {
  return {
    orderId: 'o1',
    type: delivered,
    arch: ProductionArchChoiceParam.both,
    stepFrom: 1,
    stepTo: 5,
    deliveredTo: DeliveryRecipient.practitioner,
    ...over,
  } as DeclareProductionEventDto;
}

/** Cut on both arches 1-5: a delivery of 1-5 has no previous_stage_missing. */
const cutBoth = () => [
  eventRow({ type: cut, arch: upper }),
  eventRow({ type: cut, arch: lower }),
];

describe('ProductionEventsService.declare', () => {
  it('a technician delivery on both arches: rows upper first, batch flipped, outbox, ≤ 12 calls', async () => {
    const { service, tx, calls } = world({ events: cutBoth() });

    const result = await service.declare(declareDto(), KEY, technician, NOW);

    expect(result.replayed).toBe(false);
    expect(result.events.map((event) => event.arch)).toEqual([upper, lower]);
    expect(result.events[0]).toMatchObject({
      type: delivered,
      stepFrom: 1,
      stepTo: 5,
      quantity: 5,
      performedAt: NOW.toISOString(),
      createdById: technician.userId,
      createdByName: 'Tech',
      createdByRole: UserRole.technician,
      deliveredTo: DeliveryRecipient.practitioner,
      origin: ProductionEventOrigin.declared,
      warnings: [],
      canCancel: true,
    });
    expect(result.counters.upper).toMatchObject({ cut: 5, delivered: 5 });
    expect(result.sheetVersion).toBe(NOW.toISOString());

    // One declaration, the client's key on both rows.
    const data = tx.productionEvent.createManyAndReturn.mock.calls[0][0].data;
    expect(new Set(data.map((row) => row.declarationId)).size).toBe(1);
    expect(data.every((row) => row.idempotencyKey === KEY)).toBe(true);

    // The batch is covered on both arches: flipped, window started, case finished.
    expect(tx.quoteStepBatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['b1'] }, status: BatchStatus.unlocked },
      }),
    );
    expect(tx.dentalOrder.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.dentalOrder.update).toHaveBeenCalledTimes(1);

    // The outbox: one pending row per channel, after the grace delay (D7).
    const notices = (
      tx.productionNotice.createMany.mock.calls[0] as unknown as [
        { data: Record<string, unknown>[] },
      ]
    )[0].data;
    expect(notices).toHaveLength(2);
    expect(notices[0]).toMatchObject({
      kind: ProductionNoticeKind.delivered,
      channel: ProductionNoticeChannel.in_app,
      status: ProductionNoticeStatus.pending,
      eventIds: ['n-1', 'n-2'],
      dedupeKey: `delivered:${data[0].declarationId}:in_app`,
      notBefore: new Date(NOW.getTime() + 10 * 60_000),
    });

    expect(calls).toHaveLength(12);
    expect(calls.slice(0, 2)).toEqual([
      'fast.productionEvent.findMany',
      'user.findUnique',
    ]);
    expect(calls[2]).toBe('$queryRaw'); // the order lock comes first in the transaction
  });

  it('a non-delivery act costs ≤ 9 calls and writes no notice', async () => {
    const { service, tx, calls } = world();

    await service.declare(
      declareDto({
        type: printed,
        arch: ProductionArchChoiceParam.upper,
        deliveredTo: undefined,
      }),
      KEY,
      technician,
      NOW,
    );

    expect(calls.length).toBeLessThanOrEqual(9);
    expect(tx.productionNotice.createMany).not.toHaveBeenCalled();
    expect(tx.quoteStepBatch.updateMany).not.toHaveBeenCalled();
    const row = tx.productionEvent.createManyAndReturn.mock.calls[0][0].data[0];
    expect(row).toMatchObject({ deliveredTo: null, deliveredToName: null });
  });

  it('400 PRODUCTION_IDEMPOTENCY_KEY_REQUIRED without a well-formed key, before any query', async () => {
    const { service, calls } = world();
    await expect(
      service.declare(declareDto(), undefined, technician, NOW),
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: PRODUCTION_ERROR.IDEMPOTENCY_KEY_REQUIRED,
    });
    expect(calls).toEqual([]);
  });

  it.each([
    ['2026-02-30', '09:30', 'INVALID_DATE'],
    ['2026-11-25', '25:00', 'INVALID_TIME'],
  ])(
    'a day or time that does not exist (%s %s) is the coded 400 %s, before any query',
    async (performedDay, performedTime, errorCode) => {
      const { service, calls } = world();
      await expect(
        service.declare(
          declareDto({ performedDay, performedTime }),
          KEY,
          technician,
          NOW,
        ),
      ).rejects.toMatchObject({ statusCode: 400, errorCode });
      expect(calls).toEqual([]);
    },
  );

  it('fast path: the same declaration replays without opening a transaction', async () => {
    const prior = [
      eventRow({ type: delivered, arch: upper, idempotencyKey: KEY }),
      eventRow({ type: delivered, arch: lower, idempotencyKey: KEY }),
    ];
    const { service, prisma, calls } = world({ prior });

    const result = await service.declare(declareDto(), KEY, technician, NOW);

    expect(result.replayed).toBe(true);
    expect(result.events.map((event) => event.id)).toEqual(
      prior.map((row) => row.id),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    // The actor name runs beside the lookup; a replay adds ONE progress read.
    expect(calls).toEqual([
      'fast.productionEvent.findMany',
      'user.findUnique',
      'fast.productionProgress.findUnique',
    ]);
  });

  it('the replay lookups select flat columns: a miss is one statement, no nested relation', async () => {
    const { service, prisma, tx } = world({ events: cutBoth() });

    await service.declare(declareDto(), KEY, technician, NOW);

    const fast = prisma.productionEvent.findMany.mock.calls[0] as unknown as [
      { select: Record<string, unknown> },
    ];
    expect(fast[0].select).not.toHaveProperty('order');
    const underLock = (
      tx.productionEvent.findMany.mock.calls as unknown as [
        { where: { idempotencyKey?: string }; select: Record<string, unknown> },
      ][]
    ).find(([args]) => args.where.idempotencyKey === KEY);
    expect(underLock?.[0].select).not.toHaveProperty('order');
    // A miss reads no counters: the declaration writes them.
    expect(tx.productionProgress.findUnique).not.toHaveBeenCalled();
    expect(prisma.productionProgress.findUnique).not.toHaveBeenCalled();
  });

  it('a replay under the lock returns the CURRENT counters from one progress read with the transaction', async () => {
    const mine = [
      eventRow({ type: delivered, arch: upper, idempotencyKey: KEY }),
      eventRow({ type: delivered, arch: lower, idempotencyKey: KEY }),
    ];
    const { service, tx, order } = world({ events: [...cutBoth(), ...mine] });
    order.productionProgress = {
      printedUpper: 0,
      printedLower: 0,
      thermoformedUpper: 0,
      thermoformedLower: 0,
      cutUpper: 5,
      cutLower: 5,
      deliveredUpper: 5,
      deliveredLower: 5,
      firstActionAt: NOW,
      lastActionAt: NOW,
      updatedAt: NOW,
    };

    const result = await service.declare(declareDto(), KEY, technician, NOW);

    expect(result.replayed).toBe(true);
    expect(tx.productionProgress.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.productionProgress.findUnique).toHaveBeenCalledWith({
      where: { orderId: 'o1' },
      select: expect.objectContaining({ deliveredUpper: true }) as unknown,
    });
    expect(result.counters.upper).toMatchObject({ cut: 5, delivered: 5 });
    expect(result.sheetVersion).toBe(NOW.toISOString());
  });

  it('409 PRODUCTION_IDEMPOTENCY_KEY_REUSED when the key named another declaration', async () => {
    const prior = [
      eventRow({ type: delivered, arch: upper, idempotencyKey: KEY }),
    ];
    const { service } = world({ prior });
    await expect(
      service.declare(declareDto(), KEY, technician, NOW),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: PRODUCTION_ERROR.IDEMPOTENCY_KEY_REUSED,
    });
  });

  it('replays under the lock, before any rule (a double submit is never already_declared)', async () => {
    const mine = [
      eventRow({ type: delivered, arch: upper, idempotencyKey: KEY }),
      eventRow({ type: delivered, arch: lower, idempotencyKey: KEY }),
    ];
    const { service, tx } = world({ events: [...cutBoth(), ...mine] });

    const result = await service.declare(declareDto(), KEY, technician, NOW);

    expect(result.replayed).toBe(true);
    expect(tx.dentalOrder.findUnique).not.toHaveBeenCalled();
    expect(tx.productionEvent.createManyAndReturn).not.toHaveBeenCalled();
  });

  it('P2002 (the key raced on another order): the same fingerprint comparison on a re-read', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { service, prisma } = world({
      events: cutBoth(),
      insertError: p2002,
    });
    const raced = [
      eventRow({
        type: delivered,
        arch: upper,
        orderId: 'o2',
        idempotencyKey: KEY,
      }),
    ];
    prisma.productionEvent.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(raced);

    await expect(
      service.declare(declareDto(), KEY, technician, NOW),
    ).rejects.toMatchObject({
      errorCode: PRODUCTION_ERROR.IDEMPOTENCY_KEY_REUSED,
    });
  });

  it.each(Object.values(ProductionEventType))(
    '409 STEPS_NOT_RELEASED for a technician declaring %s on locked steps, even confirmed; nothing written (spec §3)',
    async (type) => {
      // In the queue (batch 1 is paid) but steps 6-10 are still locked.
      const { service, tx } = world({
        events: [
          eventRow({ type: cut, arch: upper, stepFrom: 6, stepTo: 10 }),
          eventRow({ type: cut, arch: lower, stepFrom: 6, stepTo: 10 }),
        ],
        batches: [
          {
            id: 'b1',
            fromStep: 1,
            toStep: 5,
            status: BatchStatus.unlocked,
            deliveredByProduction: false,
          },
          {
            id: 'b2',
            fromStep: 6,
            toStep: 10,
            status: BatchStatus.locked,
            deliveredByProduction: false,
          },
        ],
      });
      await expect(
        service.declare(
          declareDto({
            type,
            stepFrom: 6,
            stepTo: 10,
            deliveredTo:
              type === delivered ? DeliveryRecipient.practitioner : undefined,
            // The pre-spec confirm-with-note path is gone for her.
            confirmWarnings: [PRODUCTION_WARNING.steps_not_released],
            note: 'Le cabinet a appelé',
          }),
          KEY,
          technician,
          NOW,
        ),
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: PRODUCTION_ERROR.STEPS_NOT_RELEASED,
      });
      expect(tx.productionEvent.createManyAndReturn).not.toHaveBeenCalled();
      expect(tx.productionProgress.upsert).not.toHaveBeenCalled();
    },
  );

  it('a case in a production status whose batches are all locked: readable, every act refused for her', async () => {
    const options = {
      status: OrderStatus.fabrication,
      batches: [
        {
          id: 'b1',
          fromStep: 1,
          toStep: 5,
          status: BatchStatus.locked,
          deliveredByProduction: false,
        },
      ],
    };
    await expect(
      world(options).service.declare(
        declareDto({
          type: printed,
          arch: ProductionArchChoiceParam.upper,
          stepFrom: 1,
          stepTo: 1,
          deliveredTo: undefined,
        }),
        KEY,
        technician,
        NOW,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: PRODUCTION_ERROR.STEPS_NOT_RELEASED,
    });
  });

  it('an admin prints locked steps once he confirms steps_not_released with a note (the journaled override)', async () => {
    const options = {
      events: [],
      batches: [
        {
          id: 'b1',
          fromStep: 1,
          toStep: 5,
          status: BatchStatus.locked,
          deliveredByProduction: false,
        },
      ],
    };
    const print = (over: Partial<DeclareProductionEventDto> = {}) =>
      declareDto({
        type: printed,
        arch: ProductionArchChoiceParam.upper,
        deliveredTo: undefined,
        ...over,
      });
    await expect(
      world(options).service.declare(print(), KEY, admin, NOW),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: PRODUCTION_ERROR.PRODUCTION_CONFIRM_REQUIRED,
      details: { warnings: [PRODUCTION_WARNING.steps_not_released] },
    });
    const { service, tx } = world(options);
    const result = await service.declare(
      print({
        confirmWarnings: [PRODUCTION_WARNING.steps_not_released],
        note: 'Impression anticipée, accord direction',
      }),
      KEY,
      admin,
      NOW,
    );
    expect(result.events[0]).toMatchObject({
      warnings: [PRODUCTION_WARNING.steps_not_released],
      note: 'Impression anticipée, accord direction',
      createdById: admin.userId,
    });
    expect(tx.quoteStepBatch.updateMany).not.toHaveBeenCalled();
  });

  it('an admin delivers locked steps once he confirms steps_not_released with a note; the batch stays locked', async () => {
    const options = {
      events: cutBoth(),
      batches: [
        {
          id: 'b1',
          fromStep: 1,
          toStep: 5,
          status: BatchStatus.locked,
          deliveredByProduction: false,
        },
      ],
    };
    await expect(
      world(options).service.declare(declareDto(), KEY, admin, NOW),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: PRODUCTION_ERROR.PRODUCTION_CONFIRM_REQUIRED,
      details: { warnings: [PRODUCTION_WARNING.steps_not_released] },
    });
    await expect(
      world(options).service.declare(
        declareDto({
          confirmWarnings: [PRODUCTION_WARNING.steps_not_released],
        }),
        KEY,
        admin,
        NOW,
      ),
    ).rejects.toMatchObject({ errorCode: PRODUCTION_ERROR.NOTE_REQUIRED });

    const { service, tx } = world(options);
    const result = await service.declare(
      declareDto({
        confirmWarnings: [PRODUCTION_WARNING.steps_not_released],
        note: 'Livré avant paiement, accord direction',
      }),
      KEY,
      admin,
      NOW,
    );
    expect(result.events[0].warnings).toEqual([
      PRODUCTION_WARNING.steps_not_released,
    ]);
    expect(tx.quoteStepBatch.updateMany).not.toHaveBeenCalled();
  });

  it('409 ORDER_NOT_IN_PRODUCTION for a technician outside the queue rule', async () => {
    const { service } = world({
      events: cutBoth(),
      batches: [
        {
          id: 'b1',
          fromStep: 1,
          toStep: 5,
          status: BatchStatus.locked,
          deliveredByProduction: false,
        },
      ],
    });
    await expect(
      service.declare(
        declareDto({ type: printed, deliveredTo: undefined }),
        KEY,
        technician,
        NOW,
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({
        error: PRODUCTION_ERROR.ORDER_NOT_IN_PRODUCTION,
      }) as unknown,
    });
  });

  it('404 for a missing order', async () => {
    const { service } = world({ missingOrder: true });
    await expect(
      service.declare(declareDto(), KEY, technician, NOW),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('declareWithin (legacy button): no key, auto-confirmed warnings only', async () => {
    // No cut yet: previous_stage_missing, which the button may vouch for.
    const { service, tx } = world();
    const declared = await service.declareWithin(
      tx as unknown as Prisma.TransactionClient,
      {
        orderId: 'o1',
        type: delivered,
        arches: [upper, lower],
        stepFrom: 1,
        stepTo: 5,
        deliveredTo: DeliveryRecipient.practitioner,
        note: 'Lot 1 marqué livré',
      },
      admin,
      {
        idempotencyKey: null,
        autoConfirm: LEGACY_DELIVERY_AUTO_CONFIRM,
        actorName: 'Admin',
        now: NOW,
      },
    );
    expect(declared.events.map((event) => event.arch)).toEqual([upper, lower]);
    expect(declared.events[0].warnings).toEqual([
      PRODUCTION_WARNING.previous_stage_missing,
    ]);
    const data = tx.productionEvent.createManyAndReturn.mock.calls[0][0].data;
    expect(data.every((row) => row.idempotencyKey === null)).toBe(true);
    expect(tx.productionNotice.createMany).toHaveBeenCalledTimes(1);
  });

  it('a finished case: an admin may still declare, a technician gets 409 ORDER_NOT_IN_PRODUCTION (ARCH-13)', async () => {
    const finished = {
      status: OrderStatus.finished,
      batches: [
        {
          id: 'b1',
          fromStep: 1,
          toStep: 5,
          status: BatchStatus.delivered,
          deliveredByProduction: true,
        },
      ],
    };
    const print = declareDto({
      type: printed,
      arch: ProductionArchChoiceParam.upper,
      stepFrom: 1,
      stepTo: 3,
      deliveredTo: undefined,
    });

    // Late admin entries on a finished case are what the reports
    // (batch_kept_after_cancel, finished_incomplete) rely on.
    const { service, tx } = world(finished);
    const result = await service.declare(print, KEY, admin, NOW);
    expect(result.replayed).toBe(false);
    expect(tx.productionEvent.createManyAndReturn).toHaveBeenCalledTimes(1);

    const forTechnician = world(finished);
    await expect(
      forTechnician.service.declare(print, KEY, technician, NOW),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({
        error: PRODUCTION_ERROR.ORDER_NOT_IN_PRODUCTION,
      }) as unknown,
    });
    expect(
      forTechnician.tx.productionEvent.createManyAndReturn,
    ).not.toHaveBeenCalled();
  });

  it('an unlimited-step pack, fully paid: a technician delivers 1-10 past the [1,1] placeholder batch, and the case is not finished (CONC-01)', async () => {
    const { service, tx } = world({
      status: OrderStatus.fabrication,
      quotation: {
        isUnlimitedSteps: true,
        maxStepsPerArch: null,
        paymentStatus: QuotationPaymentStatus.paid,
      },
      plan: { totalUpperAligners: 30, totalLowerAligners: 30 },
      batches: [
        {
          id: 'b1',
          fromStep: 1,
          toStep: 1,
          status: BatchStatus.unlocked,
          deliveredByProduction: false,
        },
      ],
      events: [
        eventRow({ type: cut, arch: upper, stepFrom: 1, stepTo: 10 }),
        eventRow({ type: cut, arch: lower, stepFrom: 1, stepTo: 10 }),
      ],
    });

    const result = await service.declare(
      declareDto({ stepFrom: 1, stepTo: 10 }),
      KEY,
      technician,
      NOW,
    );

    expect(result.events.map((event) => event.warnings)).toEqual([[], []]);
    // The placeholder is neither flipped nor the case finished; the notice goes out.
    expect(tx.quoteStepBatch.updateMany).not.toHaveBeenCalled();
    expect(tx.dentalOrder.update).not.toHaveBeenCalled();
    expect(tx.dentalOrder.updateMany).not.toHaveBeenCalled();
    expect(tx.productionNotice.createMany).toHaveBeenCalledTimes(1);
  });
});

describe('ProductionEventsService.declareBatchDelivery (legacy "Marquer livré", limited pack)', () => {
  const run = (
    options: WorldOptions,
    batch: { fromStep: number; toStep: number },
  ) => {
    const ctx = world({ status: OrderStatus.fabrication, ...options });
    const promise = ctx.service.declareBatchDelivery(
      ctx.tx as unknown as Prisma.TransactionClient,
      { orderId: 'o1', batch: { id: 'b1', batchNumber: 2, ...batch } },
      admin,
      { actorName: 'Admin', now: NOW },
    );
    return { ...ctx, promise };
  };
  const declared = (tx: ReturnType<typeof world>['tx']) =>
    tx.productionEvent.createManyAndReturn.mock.calls.map(([{ data }]) =>
      data.map((row) => [row.arch, row.stepFrom, row.stepTo]),
    );
  const unlocked = (fromStep: number, toStep: number) => [
    {
      id: 'b1',
      fromStep,
      toStep,
      status: BatchStatus.unlocked,
      deliveredByProduction: false,
    },
  ];
  /** The caller (deliverBatch) holds the order lock: nobody here takes it again. */
  const locks = (calls: string[]) =>
    calls.filter((call) => call === '$queryRaw').length;

  it('one declaration of both arches when they need the same steps, with the button note and no key', async () => {
    const { tx, promise, calls } = run(
      { events: cutBoth(), batches: unlocked(1, 5) },
      { fromStep: 1, toStep: 5 },
    );
    await promise;

    // The order is read once, in the core's shape, and reused by the core:
    // no second lock, no second order read (E5).
    expect(calls).toEqual([
      'dentalOrder.findUnique',
      'productionEvent.findMany',
      'productionEvent.createManyAndReturn',
      'productionProgress.upsert',
      'quoteStepBatch.updateMany',
      'dentalOrder.updateMany',
      'dentalOrder.update',
      'productionNotice.createMany',
    ]);

    expect(declared(tx)).toEqual([
      [
        [upper, 1, 5],
        [lower, 1, 5],
      ],
    ]);
    const row = tx.productionEvent.createManyAndReturn.mock.calls[0][0].data[0];
    expect(row).toMatchObject({
      idempotencyKey: null,
      deliveredTo: DeliveryRecipient.practitioner,
      note: 'Lot 2 marqué livré (bouton « Marquer livré »)',
    });
    expect(tx.quoteStepBatch.updateMany).toHaveBeenCalledTimes(1);
  });

  it('clips each arch to its approved total: a [1,20] batch on a 20 / 14 plan declares upper 1-20 and lower 1-14, never lower 15-20 (CONC-02)', async () => {
    const ctx = run(
      {
        plan: { totalUpperAligners: 20, totalLowerAligners: 14 },
        batches: unlocked(1, 20),
        events: [
          eventRow({ type: cut, arch: upper, stepFrom: 1, stepTo: 20 }),
          eventRow({ type: cut, arch: lower, stepFrom: 1, stepTo: 14 }),
        ],
      },
      { fromStep: 1, toStep: 20 },
    );
    const { tx } = ctx;
    await ctx.promise;

    expect(declared(tx)).toEqual([[[upper, 1, 20]], [[lower, 1, 14]]]);
    // The second declaration reads the order again (the first one wrote
    // to it), and still takes no lock of its own.
    expect(locks(ctx.calls)).toBe(0);
    expect(
      ctx.calls.filter((call) => call === 'dentalOrder.findUnique'),
    ).toHaveLength(2);
    // No beyond_planned_total: nothing past the plan was recorded.
    const rows = tx.productionEvent.createManyAndReturn.mock.calls.flatMap(
      ([{ data }]) => data,
    );
    expect(rows.every((row) => row.warnings.length === 0)).toBe(true);
    // The second declaration covers the batch: flipped once, case finished.
    expect(tx.quoteStepBatch.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.dentalOrder.update).toHaveBeenCalledTimes(1);
  });

  it('a batch wholly beyond the approved totals declares nothing: 409 while the case has no delivery', async () => {
    const { tx, promise } = run(
      {
        plan: { totalUpperAligners: 20, totalLowerAligners: 14 },
        batches: unlocked(21, 30),
        events: cutBoth(),
      },
      { fromStep: 21, toStep: 30 },
    );
    await expect(promise).rejects.toMatchObject({ statusCode: 409 });
    await expect(promise).rejects.toMatchObject({
      errorCode: PRODUCTION_ERROR.BATCH_NEEDS_NO_DELIVERY,
    });
    expect(tx.productionEvent.createManyAndReturn).not.toHaveBeenCalled();
    expect(tx.quoteStepBatch.updateMany).not.toHaveBeenCalled();
  });

  it('… and is delivered by the projection once the case has a live delivery', async () => {
    const { tx, promise, calls } = run(
      {
        plan: { totalUpperAligners: 20, totalLowerAligners: 14 },
        batches: unlocked(21, 30),
        events: [
          eventRow({ type: delivered, arch: upper, stepFrom: 1, stepTo: 3 }),
        ],
      },
      { fromStep: 21, toStep: 30 },
    );
    await promise;
    // The projection runs on the state read under the caller's lock.
    expect(locks(calls)).toBe(0);
    expect(calls.slice(0, 2)).toEqual([
      'dentalOrder.findUnique',
      'productionEvent.findMany',
    ]);
    expect(
      calls.filter((call) => call === 'dentalOrder.findUnique'),
    ).toHaveLength(1);
    expect(tx.productionEvent.createManyAndReturn).not.toHaveBeenCalled();
    expect(tx.quoteStepBatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['b1'] }, status: BatchStatus.unlocked },
        data: expect.objectContaining({
          deliveredById: admin.userId,
        }) as unknown,
      }),
    );
  });

  it('404 on an archived case, before anything is written', async () => {
    const ctx = world();
    ctx.tx.dentalOrder.findUnique.mockResolvedValueOnce({
      ...ctx.order,
      deletedAt: new Date(),
    } as never);
    await expect(
      ctx.service.declareBatchDelivery(
        ctx.tx as unknown as Prisma.TransactionClient,
        {
          orderId: 'o1',
          batch: { id: 'b1', batchNumber: 1, fromStep: 1, toStep: 5 },
        },
        admin,
        { actorName: 'Admin', now: NOW },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(ctx.tx.productionEvent.createManyAndReturn).not.toHaveBeenCalled();
  });
});

describe('ProductionEventsService.cancel', () => {
  const reason: CancelProductionEventDto = { reason: 'Mauvais lot' };

  /** A technician's delivery on both arches, 1 h ago, its batch flipped by production. */
  function deliveryWorld(options: Partial<WorldOptions> = {}) {
    const up = eventRow({
      type: delivered,
      arch: upper,
      declarationId: 'd-x',
      id: 'e-b',
    });
    const low = eventRow({
      type: delivered,
      arch: lower,
      declarationId: 'd-x',
      id: 'e-a',
    });
    return {
      up,
      low,
      ...world({
        events: [...cutBoth(), up, low],
        batches: [
          {
            id: 'b1',
            fromStep: 1,
            toStep: 5,
            status: BatchStatus.delivered,
            deliveredByProduction: true,
          },
        ],
        notices: [
          {
            id: 'nt-1',
            channel: ProductionNoticeChannel.in_app,
            status: ProductionNoticeStatus.sent,
          },
          {
            id: 'nt-2',
            channel: ProductionNoticeChannel.email,
            status: ProductionNoticeStatus.pending,
          },
        ],
        ...options,
      }),
    };
  }

  it('cancels her own delivery and its sibling: revert, skip, correction, ≤ 11 calls', async () => {
    const { service, tx, calls } = deliveryWorld();

    const result = await service.cancel(
      'e-b',
      { ...reason, alsoSibling: true },
      technician,
      NOW,
    );

    expect(result.events.map((event) => [event.id, event.arch])).toEqual([
      ['e-b', upper],
      ['e-a', lower],
    ]);
    expect(result.events[0]).toMatchObject({
      cancelledAt: NOW.toISOString(),
      cancelledById: technician.userId,
      cancelReason: 'Mauvais lot',
      canCancel: false,
    });
    expect(result.counters.upper.delivered).toBe(0);
    expect(tx.productionEvent.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['e-b', 'e-a'] }, cancelledAt: null },
      data: expect.objectContaining({
        cancelledAt: NOW,
        cancelReason: 'Mauvais lot',
      }) as unknown,
    });
    // The production-flipped batch goes back to unlocked.
    expect(tx.quoteStepBatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: BatchStatus.unlocked,
        }) as unknown,
      }),
    );
    // The pending e-mail is skipped; the in-app one was sent: one correction,
    // keyed on the LOWEST id this request cancelled (e-a, not the target).
    expect(tx.productionNotice.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['nt-2'] },
        status: {
          in: [ProductionNoticeStatus.pending, ProductionNoticeStatus.failed],
        },
      },
      data: {
        status: ProductionNoticeStatus.skipped,
        skipReason: 'cancelled_before_send',
      },
    });
    expect(tx.productionNotice.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          kind: ProductionNoticeKind.correction,
          channel: ProductionNoticeChannel.in_app,
          dedupeKey: 'correction:e-a:in_app',
          eventIds: ['e-a', 'e-b'],
          notBefore: NOW,
        }),
      ],
    });
    // The notices are locked BEFORE the events are written (the dispatcher's order).
    expect(calls.indexOf('productionEvent.updateMany')).toBeGreaterThan(
      calls.lastIndexOf('$queryRaw'),
    );
    expect(calls).toHaveLength(11);
  });

  it('one arch only: pending notices stay (they render the live rows), no correction for them', async () => {
    const { service, tx } = deliveryWorld({
      notices: [
        {
          id: 'nt-1',
          channel: ProductionNoticeChannel.in_app,
          status: ProductionNoticeStatus.pending,
        },
        {
          id: 'nt-2',
          channel: ProductionNoticeChannel.email,
          status: ProductionNoticeStatus.pending,
        },
      ],
    });
    await service.cancel('e-b', reason, technician, NOW);
    expect(tx.productionNotice.updateMany).not.toHaveBeenCalled();
    expect(tx.productionNotice.createMany).not.toHaveBeenCalled();
  });

  it('is idempotent on an already-cancelled row: the declaration as it is, nothing written', async () => {
    const cancelledAt = new Date(NOW.getTime() - 60_000);
    const up = eventRow({
      type: delivered,
      declarationId: 'd-y',
      createdById: technician.userId,
      cancelledAt,
      cancelReason: 'first reason',
    });
    const { service, tx } = world({ events: [up] });

    const result = await service.cancel(
      up.id,
      { reason: 'second' },
      technician,
      NOW,
    );

    expect(result.events[0]).toMatchObject({ cancelReason: 'first reason' });
    expect(tx.productionEvent.updateMany).not.toHaveBeenCalled();
    expect(tx.productionProgress.upsert).not.toHaveBeenCalled();
  });

  it('checks permissions BEFORE the idempotent answer (403 CANCEL_NOT_OWN_EVENT)', async () => {
    const other = eventRow({
      createdById: 'u-other',
      cancelledAt: NOW,
      cancelReason: 'private',
    });
    const { service } = world({ events: [other] });
    await expect(
      service.cancel(other.id, reason, technician, NOW),
    ).rejects.toMatchObject({
      statusCode: 403,
      errorCode: PRODUCTION_ERROR.CANCEL_NOT_OWN_EVENT,
    });
  });

  it('403 CANCEL_WINDOW_PASSED after 24 h from createdAt for her; an admin may', async () => {
    const old = eventRow({
      type: printed,
      createdAt: new Date(NOW.getTime() - 25 * 3_600_000),
      performedAt: new Date(NOW.getTime() - 25 * 3_600_000),
    });
    await expect(
      world({ events: [old] }).service.cancel(old.id, reason, technician, NOW),
    ).rejects.toMatchObject({
      errorCode: PRODUCTION_ERROR.CANCEL_WINDOW_PASSED,
    });
    await expect(
      world({ events: [old] }).service.cancel(old.id, reason, admin, NOW),
    ).resolves.toMatchObject({
      events: [expect.objectContaining({ id: old.id })],
    });
  });

  it('a technician cannot touch a legacy-only case (403 ORDER_NOT_IN_PRODUCTION); an admin cancels a legacy row', async () => {
    const legacy = eventRow({
      type: delivered,
      origin: ProductionEventOrigin.legacy_batch,
      createdById: null,
      createdByName: 'Historique',
    });
    const finished = {
      events: [legacy],
      status: OrderStatus.finished,
      batches: [],
    };
    await expect(
      world(finished).service.cancel(legacy.id, reason, technician, NOW),
    ).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({
        error: PRODUCTION_ERROR.ORDER_NOT_IN_PRODUCTION,
      }) as unknown,
    });
    const { service, tx } = world(finished);
    await service.cancel(legacy.id, reason, admin, NOW);
    expect(tx.productionEvent.updateMany).toHaveBeenCalledTimes(1);
  });

  it('404 for an unknown event', async () => {
    const { service } = world();
    await expect(
      service.cancel('e-404', reason, admin, NOW),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('finds the target through a relation filter on its order (one statement); an archived case is a 404', async () => {
    const { up, service, tx } = deliveryWorld();
    await service.cancel(up.id, reason, admin, NOW);
    expect(tx.productionEvent.findFirst).toHaveBeenCalledWith({
      where: { id: up.id, order: { deletedAt: null } },
      select: { orderId: true },
    });

    const archived = deliveryWorld({ orderDeleted: true });
    await expect(
      archived.service.cancel(archived.up.id, reason, admin, NOW),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(archived.tx.$queryRaw).not.toHaveBeenCalled();
    expect(archived.tx.productionEvent.updateMany).not.toHaveBeenCalled();
  });
});
