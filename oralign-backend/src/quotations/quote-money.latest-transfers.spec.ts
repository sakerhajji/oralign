import {
  PaymentMethod,
  PaymentRecordStatus,
  type Prisma,
} from '@prisma/client';
import { readLatestTransfers, withLatestTransfers } from './quote-money';

type Db = Pick<Prisma.TransactionClient, 'payment'>;

const at = (iso: string) => new Date(iso);

/** Bank-transfer rows as the query returns them: newest first. */
const rows = [
  {
    id: 'p-3',
    installmentId: 'i-1',
    status: PaymentRecordStatus.rejected,
    declaredAt: at('2026-11-25T10:00:00.000Z'),
    reviewOpenedAt: at('2026-11-25T11:00:00.000Z'),
    rejectionReason: 'Reçu illisible',
    proofUrl: '/uploads/orders/o-1/payment-proofs/c.pdf',
  },
  {
    id: 'p-2',
    installmentId: 'i-2',
    status: PaymentRecordStatus.awaiting_confirmation,
    declaredAt: at('2026-11-24T10:00:00.000Z'),
    reviewOpenedAt: null,
    rejectionReason: null,
    proofUrl: '/uploads/payments/b.jpg',
  },
  {
    // An older declaration of i-1: ignored, p-3 is its latest.
    id: 'p-1',
    installmentId: 'i-1',
    status: PaymentRecordStatus.cancelled,
    declaredAt: at('2026-11-20T10:00:00.000Z'),
    reviewOpenedAt: null,
    rejectionReason: null,
    proofUrl: null,
  },
];

function db(found = rows) {
  return { payment: { findMany: jest.fn().mockResolvedValue(found) } };
}

describe('readLatestTransfers (one grouped query, CONTRACT §2.1)', () => {
  it('reads the bank transfers of every installment in one query, newest first', async () => {
    const reader = db();
    await readLatestTransfers(reader as unknown as Db, ['i-1', 'i-2', 'i-3']);
    expect(reader.payment.findMany).toHaveBeenCalledTimes(1);
    expect(reader.payment.findMany).toHaveBeenCalledWith({
      where: {
        installmentId: { in: ['i-1', 'i-2', 'i-3'] },
        paymentMethod: PaymentMethod.bank_transfer,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        installmentId: true,
        status: true,
        declaredAt: true,
        reviewOpenedAt: true,
        rejectionReason: true,
        proofUrl: true,
      },
    });
  });

  it('keeps the latest per installment, its derived state, and never the path', async () => {
    const latest = await readLatestTransfers(db() as unknown as Db, [
      'i-1',
      'i-2',
    ]);
    expect(latest.get('i-1')).toEqual({
      paymentId: 'p-3',
      status: PaymentRecordStatus.rejected,
      state: 'refused',
      declaredAt: rows[0].declaredAt,
      reviewOpenedAt: rows[0].reviewOpenedAt,
      rejectionReason: 'Reçu illisible',
      hasProof: true,
    });
    expect(latest.get('i-2')).toMatchObject({
      paymentId: 'p-2',
      state: 'receipt_sent',
      rejectionReason: null,
      hasProof: true,
    });
    expect(JSON.stringify([...latest.values()])).not.toMatch(
      /uploads|proofUrl/,
    );
  });

  it('no installment: no query', async () => {
    const reader = db();
    expect((await readLatestTransfers(reader as unknown as Db, [])).size).toBe(
      0,
    );
    expect(reader.payment.findMany).not.toHaveBeenCalled();
  });
});

describe('withLatestTransfers', () => {
  it('adds latestTransfer to each installment, null when it has none', async () => {
    const installments = [
      { id: 'i-1', installmentNumber: 1 },
      { id: 'i-2', installmentNumber: 2 },
      { id: 'i-3', installmentNumber: 3 },
    ];
    const shown = await withLatestTransfers(
      db() as unknown as Db,
      installments,
    );
    expect(shown.map((row) => row.latestTransfer?.paymentId ?? null)).toEqual([
      'p-3',
      'p-2',
      null,
    ]);
    expect(shown[0]).toMatchObject({ id: 'i-1', installmentNumber: 1 });
  });
});
