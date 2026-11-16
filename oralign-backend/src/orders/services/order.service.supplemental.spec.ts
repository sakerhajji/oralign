import {
  OrderStatus,
  OrderType,
  QuotationPaymentStatus,
  SupplementalCoverageStatus,
  SupplementalReviewStatus,
  ToothInstructionType,
  UserRole,
} from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrderAccessPolicy } from '../../common/access/order-access.policy';
import type { Caller } from '../../common/access/caller';
import type { UpdateOrderDto } from '../dto/order.dto';
import type { OrderAuditService } from './order-audit.service';
import type { WelcomeGiftService } from './welcome-gift.service';
import { startCoverageWindow } from '../coverage-window';
import { openChildrenOf, ORDER_KIND_ERROR } from '../order-kind';
import { SUPPLEMENTAL_ERROR } from '../supplemental/supplemental.constants';
import { OrderService } from './order.service';

jest.mock('./order-storage', () => ({
  purgeStoredMedia: jest.fn(),
  removeFileFromDisk: jest.fn(),
  purgeOrderDirectory: jest.fn(),
}));
// The mapper needs every relation of a real row; identity is enough here.
jest.mock('./order.mapper', () => ({
  orderInclude: {},
  mapOrderToDto: (order: unknown) => order,
}));
// The window rule is covered by coverage-window.spec.ts: only the wiring
// (which override starts it, in which transaction) is under test here.
jest.mock('../coverage-window', () => ({
  ...jest.requireActual<typeof import('../coverage-window')>(
    '../coverage-window',
  ),
  startCoverageWindow: jest.fn().mockResolvedValue(true),
}));
const startWindow = jest.mocked(startCoverageWindow);

const doctor: Caller = { userId: 'u-doc', role: UserRole.dentist };
const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const designer: Caller = { userId: 'u-des', role: UserRole.designer };

const caseOrder = (over: Record<string, unknown> = {}) => ({
  id: 'case-1',
  orderCode: 'CASE',
  orderType: OrderType.initial as OrderType,
  parentOrderId: null as string | null,
  doctorId: 'u-doc',
  patientId: 'p-1',
  status: OrderStatus.submitted as OrderStatus,
  submittedAt: new Date('2026-11-01T08:00:00.000Z') as Date | null,
  deletedAt: null as Date | null,
  treatmentFeePaidAt: null,
  cbctFeeAmount: null,
  welcomeGiftAppliedAt: null,
  useCbctWithScans: false,
  files: [],
  doctor: { fullName: 'Dr Test' },
  patient: { fullName: 'Patient' },
  ...over,
});
type Row = ReturnType<typeof caseOrder>;

const childOrder = (over: Record<string, unknown> = {}) =>
  caseOrder({
    id: 'child-1',
    orderCode: 'CASE-REP-01',
    orderType: OrderType.replacement,
    parentOrderId: 'case-1',
    ...over,
  });

const FIRST_SUBMISSION = new Date('2026-11-05T09:00:00.000Z');

/** An audit row as the service writes it (the fields asserted on). */
type AuditRow = { orderId: string; changes?: object; metadata?: object };

function makeWorld(current: Row, bulkRows: Row[] = []) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    dentalOrder: {
      update: jest.fn(({ data }: { data: object }) =>
        Promise.resolve({ ...current, ...data }),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn(() => Promise.resolve(current)),
      // The case's pack snapshot (loadPackAllowance).
      findUnique: jest.fn().mockResolvedValue({ quotation: null }),
      count: jest.fn().mockResolvedValue(0),
    },
    supplementalOrderRequest: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ submittedAt: FIRST_SUBMISSION }),
      update: jest.fn((_args: { where: object; data: object }) =>
        Promise.resolve({}),
      ),
      // The consumed corrections of the case: their count and numbers.
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    orderToothInstruction: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    orderAuditLog: {
      create: jest.fn(),
      createMany: jest.fn((args: { data: AuditRow[] }) =>
        Promise.resolve({ count: args.data.length }),
      ),
    },
  };
  const prisma = {
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
    dentalOrder: {
      findFirst: jest.fn().mockResolvedValue(current),
      findMany: jest.fn((_args: { where: object }) =>
        Promise.resolve(bulkRows),
      ),
    },
  };
  const applyOnSubmit = jest.fn().mockResolvedValue(true);
  const entry = jest.fn(
    (
      caller: Caller,
      action: string,
      _changes: unknown,
      metadata?: Record<string, unknown> | null,
    ) =>
      Promise.resolve({
        actorId: caller.userId,
        actorName: 'Actor',
        actorRole: caller.role,
        action,
        ...(metadata ? { metadata } : {}),
      }),
  );
  const service = new OrderService(
    prisma as unknown as PrismaService,
    {} as OrderAccessPolicy,
    { emit: jest.fn() } as unknown as EventEmitter2,
    {
      entry,
      diff: jest.fn().mockReturnValue({}),
    } as unknown as OrderAuditService,
    { applyOnSubmit } as unknown as WelcomeGiftService,
  );
  jest
    .spyOn(service, 'findAccessibleOrder')
    .mockResolvedValue(current as never);
  // The checks that need a database are not what is under test.
  const internals = service as unknown as Record<string, jest.Mock>;
  jest.spyOn(internals, 'ensureDentistExists').mockResolvedValue(undefined);
  jest
    .spyOn(internals, 'ensurePatientBelongsToDoctor')
    .mockResolvedValue(undefined);
  return { service, prisma, tx, applyOnSubmit };
}

const dedicatedFlow = {
  statusCode: 409,
  errorCode: ORDER_KIND_ERROR.DEDICATED_FLOW,
};

beforeEach(() => startWindow.mockClear());

describe('OrderService — generic endpoints refuse a supplemental child', () => {
  const draftChild = () => childOrder({ status: OrderStatus.draft });

  it('submit: 409, the welcome gift is never reached', async () => {
    const { service, prisma, applyOnSubmit } = makeWorld(draftChild());

    await expect(
      service.submitOrder('child-1', { termsAccepted: true }, doctor),
    ).rejects.toMatchObject(dedicatedFlow);
    expect(applyOnSubmit).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each<[string, (service: OrderService) => Promise<unknown>]>([
    [
      'update (even a patient move)',
      (s) =>
        s.updateOrder('child-1', { patientId: 'p-2' } as UpdateOrderDto, admin),
    ],
    ['archive', (s) => s.deleteOrder('child-1', doctor)],
    ['restore', (s) => s.restoreOrder('child-1', admin)],
    [
      "doctor's tooth instructions",
      (s) =>
        s.updateToothInstructions('child-1', [], doctor, [
          ToothInstructionType.do_not_move,
        ]),
    ],
  ])('%s: 409, nothing written', async (_label, call) => {
    const { service, prisma } = makeWorld(
      childOrder({ deletedAt: new Date('2026-11-06') }),
    );

    await expect(call(service)).rejects.toMatchObject(dedicatedFlow);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("still lets a planner replace a refinement plan's attachments", async () => {
    const { service, tx } = makeWorld(
      childOrder({ orderType: OrderType.additional_aligners }),
    );

    await service.updateToothInstructions(
      'child-1',
      [{ toothNumber: 13, type: ToothInstructionType.attachment }],
      designer,
      [ToothInstructionType.attachment],
    );

    expect(tx.orderToothInstruction.deleteMany).toHaveBeenCalledWith({
      where: {
        orderId: 'child-1',
        type: { in: [ToothInstructionType.attachment] },
      },
    });
  });

  it('refuses a planner write without a declared attachment scope', async () => {
    const { service, prisma } = makeWorld(
      childOrder({ orderType: OrderType.additional_aligners }),
    );

    await expect(
      service.updateToothInstructions('child-1', [], designer),
    ).rejects.toMatchObject(dedicatedFlow);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('OrderService.updateOrder — a case moves with its requests', () => {
  const children = [
    { id: 'child-1', doctorId: 'u-doc', patientId: 'p-1' },
    { id: 'child-2', doctorId: 'u-doc', patientId: 'p-1' },
  ];

  it('cascades a new doctor + patient to every child, one audit row each', async () => {
    const { service, tx } = makeWorld(caseOrder());
    tx.dentalOrder.findMany.mockResolvedValue(children);

    await service.updateOrder(
      'case-1',
      { doctorId: 'u-doc-2', patientId: 'p-9' } as UpdateOrderDto,
      admin,
    );

    expect(tx.dentalOrder.findMany).toHaveBeenCalledWith({
      where: { parentOrderId: 'case-1' },
      select: { id: true, doctorId: true, patientId: true },
    });
    expect(tx.dentalOrder.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['child-1', 'child-2'] } },
      data: { doctorId: 'u-doc-2', patientId: 'p-9' },
    });
    const [{ data: rows }] = tx.orderAuditLog.createMany.mock.calls[0];
    expect(rows.map((row) => row.orderId)).toEqual(['child-1', 'child-2']);
    for (const row of rows) {
      expect(row).toMatchObject({
        action: 'updated',
        metadata: { reassignedWithParent: 'CASE' },
        changes: {
          doctorId: { from: 'u-doc', to: 'u-doc-2' },
          patientId: { from: 'p-1', to: 'p-9' },
        },
      });
    }
  });

  it('audits only what moved: a dentist re-filing the case under another patient', async () => {
    const { service, tx } = makeWorld(caseOrder());
    tx.dentalOrder.findMany.mockResolvedValue(children.slice(0, 1));

    await service.updateOrder(
      'case-1',
      { patientId: 'p-2' } as UpdateOrderDto,
      doctor,
    );

    const [{ data: rows }] = tx.orderAuditLog.createMany.mock.calls[0];
    expect(rows[0].changes).toEqual({
      patientId: { from: 'p-1', to: 'p-2' },
    });
  });

  it('leaves the children alone when the owner does not change', async () => {
    const { service, tx } = makeWorld(caseOrder());

    await service.updateOrder(
      'case-1',
      { chiefComplaint: 'crowding' } as UpdateOrderDto,
      doctor,
    );

    expect(tx.dentalOrder.findMany).not.toHaveBeenCalled();
    expect(tx.dentalOrder.updateMany).not.toHaveBeenCalled();
  });
});

describe('OrderService — archiving a case with open requests', () => {
  it('refuses with 409 SUPPLEMENTAL_ACTIVE_CHILDREN under the case lock', async () => {
    const { service, tx } = makeWorld(caseOrder());
    tx.dentalOrder.count.mockResolvedValue(1);

    await expect(service.deleteOrder('case-1', doctor)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: ORDER_KIND_ERROR.ACTIVE_CHILDREN,
    });
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.dentalOrder.count).toHaveBeenCalledWith({
      where: openChildrenOf('case-1'),
    });
    expect(tx.dentalOrder.update).not.toHaveBeenCalled();
  });

  it('archives a case whose requests are all closed', async () => {
    const { service, tx } = makeWorld(caseOrder());

    await service.deleteOrder('case-1', doctor);

    expect(tx.dentalOrder.update).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: { deletedAt: expect.any(Date) as Date },
    });
  });

  it('bulk: skips children (never loaded) and cases with open requests', async () => {
    const { service, prisma, tx } = makeWorld(caseOrder(), [
      caseOrder({ id: 'case-1' }),
      caseOrder({ id: 'case-2' }),
    ]);
    tx.dentalOrder.count.mockImplementation(
      ({ where }: { where: { parentOrderId: string } }) =>
        Promise.resolve(where.parentOrderId === 'case-1' ? 2 : 0),
    );

    await expect(
      service.bulkDelete(['case-1', 'case-2', 'child-1'], admin),
    ).resolves.toEqual({ deleted: 1, skipped: 2 });
    expect(prisma.dentalOrder.findMany.mock.calls[0][0]).toMatchObject({
      where: { orderType: OrderType.initial, deletedAt: null },
    });
    expect(tx.dentalOrder.update).toHaveBeenCalledTimes(1);
    expect(tx.dentalOrder.update).toHaveBeenCalledWith({
      where: { id: 'case-2' },
      data: { deletedAt: expect.any(Date) as Date },
    });
  });

  it('bulk restore never brings a child back', async () => {
    const { service, prisma } = makeWorld(caseOrder());

    await service.bulkRestoreOrders(['case-1', 'child-1'], admin);

    expect(prisma.dentalOrder.findMany.mock.calls[0][0]).toMatchObject({
      where: { orderType: OrderType.initial, deletedAt: { not: null } },
    });
  });
});

describe('OrderService — admin status override', () => {
  it('→ submitted on a child: pending again, review cleared, same transaction', async () => {
    const { service, tx } = makeWorld(
      childOrder({ status: OrderStatus.under_review }),
    );

    await service.overrideStatus(
      'child-1',
      OrderStatus.submitted,
      'redo',
      admin,
    );

    expect(tx.supplementalOrderRequest.update).toHaveBeenCalledWith({
      where: { orderId: 'child-1' },
      data: {
        reviewStatus: SupplementalReviewStatus.pending,
        submittedAt: FIRST_SUBMISSION,
        reviewedAt: null,
        reviewedById: null,
        reviewedByName: null,
        reviewReason: null,
        correctionNumber: null,
      },
    });
    expect(startWindow).not.toHaveBeenCalled();
  });

  it('→ draft on a child: back to an untouched draft', async () => {
    const { service, tx } = makeWorld(childOrder());

    await service.overrideStatus(
      'child-1',
      OrderStatus.draft,
      undefined,
      admin,
    );

    expect(tx.dentalOrder.update).toHaveBeenCalledWith({
      where: { id: 'child-1' },
      data: { status: OrderStatus.draft, submittedAt: null },
    });
    expect(tx.supplementalOrderRequest.update.mock.calls[0][0]).toMatchObject({
      data: { reviewStatus: SupplementalReviewStatus.draft, submittedAt: null },
    });
  });

  it.each([OrderStatus.fabrication, OrderStatus.shipped])(
    '→ %s on a child: the review state is left as is, no coverage of its own',
    async (status) => {
      const { service, tx } = makeWorld(childOrder());

      await service.overrideStatus('child-1', status, undefined, admin);

      expect(tx.supplementalOrderRequest.update).not.toHaveBeenCalled();
      expect(startWindow).not.toHaveBeenCalled();
    },
  );

  it.each([OrderStatus.shipped, OrderStatus.finished])(
    '→ %s on a case: hands the aligners over, the coverage window starts now',
    async (status) => {
      const { service, tx } = makeWorld(
        caseOrder({ status: OrderStatus.fabrication }),
      );

      await service.overrideStatus('case-1', status, undefined, admin);

      expect(startWindow).toHaveBeenCalledWith(
        tx,
        'case-1',
        expect.any(Date) as Date,
      );
      expect(tx.supplementalOrderRequest.findUnique).not.toHaveBeenCalled();
    },
  );

  it('→ fabrication on a case: no coverage window yet', async () => {
    const { service } = makeWorld(caseOrder());

    await service.overrideStatus(
      'case-1',
      OrderStatus.fabrication,
      undefined,
      admin,
    );

    expect(startWindow).not.toHaveBeenCalled();
  });

  it('refuses to reopen a rejected child while a sibling of its kind is open (409)', async () => {
    const { service, tx } = makeWorld(
      childOrder({ status: OrderStatus.rejected }),
    );
    tx.dentalOrder.findFirst.mockResolvedValue({ id: 'child-2' });

    await expect(
      service.overrideStatus(
        'child-1',
        OrderStatus.submitted,
        undefined,
        admin,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: ORDER_KIND_ERROR.ACTIVE_REQUEST_EXISTS,
    });
    expect(tx.dentalOrder.findFirst).toHaveBeenCalledWith({
      where: {
        ...openChildrenOf('case-1'),
        orderType: OrderType.replacement,
        id: { not: 'child-1' },
      },
      select: { id: true },
    });
    expect(tx.dentalOrder.update).not.toHaveBeenCalled();
  });

  it('reopens a rejected child that has no open sibling', async () => {
    const { service, tx } = makeWorld(
      childOrder({ status: OrderStatus.rejected }),
    );

    await service.overrideStatus(
      'child-1',
      OrderStatus.submitted,
      undefined,
      admin,
    );

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.dentalOrder.update).toHaveBeenCalled();
  });

  describe('a cancelled refinement approved as included, taken back', () => {
    const cancelledCorrection = () =>
      childOrder({
        status: OrderStatus.canceled,
        orderType: OrderType.additional_aligners,
      });
    /** A 1-correction pack whose correction #1 a later refinement uses. */
    function usedUp(current: Row, bulkRows: Row[] = []) {
      const world = makeWorld(current, bulkRows);
      world.tx.supplementalOrderRequest.findUnique.mockResolvedValue({
        id: 'request-1',
        reviewStatus: SupplementalReviewStatus.approved,
        coverageStatus: SupplementalCoverageStatus.included,
        correctionNumber: 1,
        submittedAt: FIRST_SUBMISSION,
      });
      world.tx.dentalOrder.findUnique.mockResolvedValue({
        quotation: {
          paymentStatus: QuotationPaymentStatus.paid,
          treatmentValidityMonths: 12,
          includedCorrections: 1,
          isUnlimitedCorrections: false,
        },
      });
      world.tx.supplementalOrderRequest.count.mockResolvedValue(1);
      world.tx.supplementalOrderRequest.findMany.mockResolvedValue([
        { correctionNumber: 1 },
      ]);
      return world;
    }

    it('refuses (409) once the pack is used up, under the case lock, nothing written', async () => {
      const { service, tx } = usedUp(cancelledCorrection());

      await expect(
        service.overrideStatus(
          'child-1',
          OrderStatus.fabrication,
          'undo',
          admin,
        ),
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: SUPPLEMENTAL_ERROR.ALLOWANCE_EXHAUSTED,
      });
      expect((tx.$queryRaw.mock.calls as unknown[][])[0][1]).toBe('case-1');
      expect(tx.dentalOrder.update).not.toHaveBeenCalled();
      expect(tx.orderAuditLog.create).not.toHaveBeenCalled();
    });

    it('takes a fresh number when its own is held by a live correction', async () => {
      const { service, tx } = usedUp(cancelledCorrection());
      tx.dentalOrder.findUnique.mockResolvedValue({ quotation: null });

      await service.overrideStatus(
        'child-1',
        OrderStatus.fabrication,
        undefined,
        admin,
      );

      expect(tx.supplementalOrderRequest.update).toHaveBeenCalledWith({
        where: { orderId: 'child-1' },
        data: { correctionNumber: 2 },
      });
    });

    it('bulk: skips it and moves the rest', async () => {
      const { service, tx } = usedUp(caseOrder(), [
        cancelledCorrection(),
        caseOrder({ status: OrderStatus.submitted }),
      ]);

      await expect(
        service.bulkUpdateStatus(
          ['child-1', 'case-1'],
          OrderStatus.fabrication,
          undefined,
          admin,
        ),
      ).resolves.toEqual({ updated: 1, skipped: 1 });
      expect(tx.dentalOrder.update).toHaveBeenCalledTimes(1);
      expect(tx.dentalOrder.update).toHaveBeenCalledWith({
        where: { id: 'case-1' },
        data: { status: OrderStatus.fabrication },
      });
    });
  });

  it('bulk: the same side effects per row, a conflicting reopen skipped', async () => {
    const reopened = childOrder({
      id: 'child-9',
      status: OrderStatus.rejected,
      orderType: OrderType.warranty,
    });
    const { service, tx } = makeWorld(caseOrder(), [
      caseOrder({ status: OrderStatus.fabrication }),
      childOrder({ status: OrderStatus.under_review }),
      reopened,
    ]);
    tx.dentalOrder.findFirst.mockResolvedValue({ id: 'open-warranty' });

    await expect(
      service.bulkUpdateStatus(
        ['case-1', 'child-1', 'child-9'],
        OrderStatus.submitted,
        undefined,
        admin,
      ),
    ).resolves.toEqual({ updated: 2, skipped: 1 });

    // submitted is no hand-over: no window for the case.
    expect(startWindow).not.toHaveBeenCalled();
    expect(tx.supplementalOrderRequest.update).toHaveBeenCalledTimes(1);
    expect(tx.supplementalOrderRequest.update.mock.calls[0][0]).toMatchObject({
      where: { orderId: 'child-1' },
      data: { reviewStatus: SupplementalReviewStatus.pending },
    });
    expect(tx.dentalOrder.update).toHaveBeenCalledTimes(2);
  });

  it('bulk → finished starts the window of every case in the batch', async () => {
    const { service, tx } = makeWorld(caseOrder(), [
      caseOrder({ id: 'case-1', status: OrderStatus.fabrication }),
      caseOrder({ id: 'case-2', status: OrderStatus.shipped }),
    ]);

    await service.bulkUpdateStatus(
      ['case-1', 'case-2'],
      OrderStatus.finished,
      undefined,
      admin,
    );

    expect(startWindow.mock.calls.map(([client, id]) => [client, id])).toEqual([
      [tx, 'case-1'],
      [tx, 'case-2'],
    ]);
  });
});
