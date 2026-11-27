import { PaymentRecordStatus } from '@prisma/client';
import {
  countNewTransfers,
  countQueueTabs,
  type TransferQueueDb,
} from './transfer-queue.query';
import { recentSince, splitSubjectKeys } from './transfer-queue.rules';

/** The first argument of a mock's call, as the queries read it. */
interface CallArg {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
  take?: number;
}
const argOf = (fn: jest.Mock, call = 0): CallArg =>
  (fn.mock.calls as unknown[][])[call][0] as CallArg;

const FEE_KEY = 'treatment_fee:order-2:1795000000000';

function makeDb(unreadKeys: (string | null)[]) {
  const notificationFindMany = jest
    .fn()
    .mockResolvedValue(unreadKeys.map((subjectKey) => ({ subjectKey })));
  const paymentCount = jest.fn().mockResolvedValue(2);
  const orderCount = jest.fn().mockResolvedValue(1);
  const paymentGroupBy = jest.fn().mockResolvedValue([
    { status: PaymentRecordStatus.awaiting_confirmation, _count: { _all: 5 } },
    { status: PaymentRecordStatus.rejected, _count: { _all: 1 } },
  ]);
  const orderGroupBy = jest.fn().mockResolvedValue([
    {
      treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
      _count: { _all: 2 },
    },
    {
      treatmentFeePaymentStatus: PaymentRecordStatus.success,
      _count: { _all: 3 },
    },
    { treatmentFeePaymentStatus: null, _count: { _all: 9 } },
  ]);
  const db = {
    notification: { findMany: notificationFindMany },
    payment: { count: paymentCount, groupBy: paymentGroupBy },
    dentalOrder: { count: orderCount, groupBy: orderGroupBy },
  } as unknown as TransferQueueDb;
  return { db, paymentCount, orderCount, paymentGroupBy, orderGroupBy };
}

describe('countNewTransfers (the sidebar badge)', () => {
  it('counts my unread subjects still awaiting, both kinds', async () => {
    const { db, paymentCount, orderCount } = makeDb([
      'installment:pay-1',
      'installment:pay-1',
      FEE_KEY,
    ]);

    await expect(countNewTransfers(db, 'u-admin')).resolves.toBe(3);
    expect(argOf(paymentCount).where).toMatchObject({
      status: PaymentRecordStatus.awaiting_confirmation,
      id: { in: ['pay-1'] },
      order: { deletedAt: null },
    });
    expect(argOf(orderCount).where).toMatchObject({
      deletedAt: null,
      treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
      OR: [{ id: 'order-2', treatmentFeeDeclaredAt: new Date(1795000000000) }],
    });
  });

  it('answers 0 with no count query when nothing is unread', async () => {
    const { db, paymentCount, orderCount } = makeDb([]);

    await expect(countNewTransfers(db, 'u-admin')).resolves.toBe(0);
    expect(paymentCount).not.toHaveBeenCalled();
    expect(orderCount).not.toHaveBeenCalled();
  });
});

describe('countQueueTabs', () => {
  it('partitions the status groups into tabs and ignores unknown statuses', async () => {
    const { db, paymentGroupBy } = makeDb([]);
    const ctx = {
      since: recentSince(new Date('2026-11-27T00:00:00Z')),
      unread: splitSubjectKeys(['installment:pay-1']),
    };

    await expect(countQueueTabs(db, ctx)).resolves.toEqual({
      nouveau: 2,
      a_verifier: 7,
      valide: 3,
      refuse: 1,
    });
    const where = argOf(paymentGroupBy).where as { OR: unknown[] };
    expect(where.OR).toHaveLength(3);
  });
});
