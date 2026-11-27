import { PaymentRecordStatus, Prisma, UserRole } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import type { Caller } from '../../common/access/caller';
import type { PrismaService } from '../../prisma/prisma.service';
import { TransferQueueService } from './transfer-queue.service';

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const D = (iso: string) => new Date(iso);
const dec = (value: string) => new Prisma.Decimal(value);

const payment = (id: string, declaredAt: string) => ({
  id,
  orderId: `order-of-${id}`,
  quotationId: 'q-1',
  amount: dec('500.000'),
  withholdingAmount: dec('0'),
  withholdingRate: null,
  stampAmount: dec('1.000'),
  currency: 'TND',
  status: PaymentRecordStatus.awaiting_confirmation,
  proofUrl: '/uploads/orders/x/payment-proofs/y.png',
  declaredAt: D(declaredAt),
  reviewOpenedAt: null,
  paidAt: null,
  confirmedAt: null,
  rejectedAt: null,
  rejectionReason: null,
  installment: { installmentNumber: 1 },
  order: {
    orderCode: `ORD-${id}`,
    doctor: { id: 'u-doc', fullName: 'Amine' },
    patient: { id: 'pat', fullName: 'Sarah' },
  },
});

const fee = (id: string, declaredAt: string) => ({
  id,
  orderCode: `ORD-${id}`,
  updatedAt: D(declaredAt),
  treatmentFeeAmount: dec('301.000'),
  treatmentFeeWithholdingAmount: null,
  treatmentFeeWithholdingRate: null,
  treatmentFeeStampAmount: dec('1.000'),
  treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
  treatmentFeeProofPath: null,
  treatmentFeePaidAt: null,
  treatmentFeeDeclaredAt: D(declaredAt),
  treatmentFeeReviewOpenedAt: null,
  treatmentFeeRejectedAt: null,
  treatmentFeeRejectionReason: null,
  doctor: { id: 'u-doc', fullName: 'Amine' },
  patient: { id: 'pat', fullName: 'Lina' },
});

/** The Prisma arguments the mocks read. */
interface FindArgs {
  where?: { id?: { in?: string[] } };
  select?: Record<string, unknown>;
  take?: number;
}

function makeService(opts: {
  unreadKeys?: string[];
  payments?: ReturnType<typeof payment>[];
  fees?: ReturnType<typeof fee>[];
}) {
  const payments = opts.payments ?? [];
  const fees = opts.fees ?? [];
  const notificationFindMany = jest.fn(
    (_args: { where: { recipientId: string } }) =>
      Promise.resolve(
        (opts.unreadKeys ?? []).map((subjectKey) => ({ subjectKey })),
      ),
  );
  // Runs answer the light rows; hydration (where.id.in) the full ones.
  const paymentFindMany = jest.fn(({ where, select }: FindArgs) => {
    const ids = where?.id?.in;
    if (select?.declaredAt && !select?.order) {
      return Promise.resolve(
        payments.map((p) => ({ id: p.id, declaredAt: p.declaredAt })),
      );
    }
    return Promise.resolve(payments.filter((p) => !ids || ids.includes(p.id)));
  });
  const orderFindMany = jest.fn(({ where, select }: FindArgs) => {
    const ids = where?.id?.in;
    if (select?.treatmentFeeDeclaredAt && !select?.doctor) {
      return Promise.resolve(
        fees.map((o) => ({
          id: o.id,
          treatmentFeeDeclaredAt: o.treatmentFeeDeclaredAt,
        })),
      );
    }
    return Promise.resolve(fees.filter((o) => !ids || ids.includes(o.id)));
  });
  const paymentGroupBy = jest.fn().mockResolvedValue([
    {
      status: PaymentRecordStatus.awaiting_confirmation,
      _count: { _all: payments.length },
    },
    { status: PaymentRecordStatus.success, _count: { _all: 4 } },
  ]);
  const orderGroupBy = jest.fn().mockResolvedValue([
    {
      treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
      _count: { _all: fees.length },
    },
    {
      treatmentFeePaymentStatus: PaymentRecordStatus.rejected,
      _count: { _all: 2 },
    },
  ]);
  const paymentCount = jest.fn().mockResolvedValue(1);
  const orderCount = jest.fn().mockResolvedValue(0);
  const prisma = {
    notification: { findMany: notificationFindMany },
    payment: {
      findMany: paymentFindMany,
      groupBy: paymentGroupBy,
      count: paymentCount,
    },
    dentalOrder: {
      findMany: orderFindMany,
      groupBy: orderGroupBy,
      count: orderCount,
    },
  } as unknown as PrismaService;
  return {
    service: new TransferQueueService(prisma),
    paymentFindMany,
    orderFindMany,
    notificationFindMany,
    paymentCount,
    orderCount,
  };
}

describe('TransferQueueService.list', () => {
  it('is admin-only', async () => {
    const { service } = makeService({});
    const error: unknown = await service
      .list({ userId: 'u-doc', role: UserRole.dentist }, {})
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).statusCode).toBe(403);
  });

  it('merges installments and fees newest declaration first, with every tab count', async () => {
    const { service } = makeService({
      unreadKeys: ['installment:p-2'],
      payments: [
        payment('p-2', '2026-11-27T10:00:00Z'),
        payment('p-1', '2026-11-25T10:00:00Z'),
      ],
      fees: [fee('o-1', '2026-11-26T10:00:00Z')],
    });

    const page = await service.list(admin, { filter: 'a_verifier' });

    expect(page.data.map((row) => [row.kind, row.orderCode])).toEqual([
      ['installment', 'ORD-p-2'],
      ['treatment_fee', 'ORD-o-1'],
      ['installment', 'ORD-p-1'],
    ]);
    expect(page.data.map((row) => row.seenByMe)).toEqual([false, true, true]);
    expect(page.counts).toEqual({
      nouveau: 1,
      a_verifier: 3,
      valide: 4,
      refuse: 2,
    });
    expect(page).toMatchObject({ total: 3, page: 1, limit: 25, totalPages: 1 });
    expect(JSON.stringify(page)).not.toMatch(/uploads|payment-proofs/);
  });

  it('pages over the merged window (both runs read skip + limit rows)', async () => {
    const { service, paymentFindMany, orderFindMany } = makeService({
      payments: [
        payment('p-2', '2026-11-27T10:00:00Z'),
        payment('p-1', '2026-11-25T10:00:00Z'),
      ],
      fees: [fee('o-1', '2026-11-26T10:00:00Z')],
    });

    const page = await service.list(admin, { page: 2, limit: 2 });

    expect(paymentFindMany.mock.calls[0][0].take).toBe(4);
    expect(orderFindMany.mock.calls[0][0].take).toBe(4);
    expect(page.data.map((row) => row.orderCode)).toEqual(['ORD-p-1']);
    expect(page.totalPages).toBe(2);
  });

  it('runs no list query for Nouveau when nothing is unread', async () => {
    const {
      service,
      paymentFindMany,
      orderFindMany,
      paymentCount,
      orderCount,
    } = makeService({ payments: [payment('p-1', '2026-11-25T10:00:00Z')] });

    const page = await service.list(admin, { filter: 'nouveau' });

    expect(page.data).toEqual([]);
    expect(page.total).toBe(0);
    expect(paymentFindMany).not.toHaveBeenCalled();
    expect(orderFindMany).not.toHaveBeenCalled();
    expect(paymentCount).not.toHaveBeenCalled();
    expect(orderCount).not.toHaveBeenCalled();
  });

  it('reads my unread subjects for the caller only', async () => {
    const { service, notificationFindMany } = makeService({});

    await service.list(admin, {});

    expect(notificationFindMany.mock.calls[0][0].where.recipientId).toBe(
      'u-admin',
    );
  });
});
