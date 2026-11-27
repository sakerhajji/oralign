import {
  OrderStatus,
  PaymentMethod,
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import { AppException } from '../../common/exceptions/app.exception';
import { TRANSFER_ERROR } from '../../common/exceptions/domain-error-codes';
import {
  findDeclarationReplay,
  isUniqueViolation,
  lockInstallmentRow,
  paymentPhaseAfterPartialSettlement,
  releaseOrderFromReview,
  supersedeAwaitingDeclarations,
} from './transfer-transitions';

type Tx = Prisma.TransactionClient;
const doctor: Caller = { userId: 'u-doc', role: UserRole.dentist };

/** The SQL text of a tagged-template $queryRaw call. */
const sqlOf = (call: unknown[]): string =>
  (call[0] as TemplateStringsArray).join('?');

describe('lockInstallmentRow', () => {
  it('locks the installment row FOR UPDATE', async () => {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([]) };
    await lockInstallmentRow(tx as unknown as Tx, 'i-1');
    const call = tx.$queryRaw.mock.calls[0] as unknown[];
    expect(sqlOf(call)).toMatch(
      /FROM "QuoteInstallment" WHERE id = \? FOR UPDATE/,
    );
    expect(call[1]).toBe('i-1');
  });
});

describe('supersedeAwaitingDeclarations', () => {
  const at = new Date('2026-11-27T10:00:00.000Z');

  it('cancels the transfers still awaiting on the installment, stamped by the actor, newest first', async () => {
    const tx = {
      payment: {
        findMany: jest.fn().mockResolvedValue([{ id: 'p-2' }, { id: 'p-1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const ids = await supersedeAwaitingDeclarations(tx as unknown as Tx, {
      installmentId: 'i-1',
      actor: doctor,
      actorName: 'Dr Salma',
      at,
    });
    expect(ids).toEqual(['p-2', 'p-1']);
    expect(tx.payment.findMany).toHaveBeenCalledWith({
      where: {
        installmentId: 'i-1',
        paymentMethod: PaymentMethod.bank_transfer,
        status: PaymentRecordStatus.awaiting_confirmation,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    // Status-guarded: a row an admin processed meanwhile is left alone.
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['p-2', 'p-1'] },
        status: PaymentRecordStatus.awaiting_confirmation,
      },
      data: {
        status: PaymentRecordStatus.cancelled,
        cancelledAt: at,
        cancelledById: 'u-doc',
        cancelledByName: 'Dr Salma',
      },
    });
  });

  it('writes nothing when nothing awaits', async () => {
    const tx = {
      payment: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
    };
    await expect(
      supersedeAwaitingDeclarations(tx as unknown as Tx, {
        installmentId: 'i-1',
        actor: doctor,
        actorName: null,
        at,
      }),
    ).resolves.toEqual([]);
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
  });
});

describe('releaseOrderFromReview (a refusal / withdrawal ends payment_review)', () => {
  function txWith(stillAwaiting: number, moved: number) {
    const calls: string[] = [];
    const tx = {
      $queryRaw: jest.fn((...args: unknown[]) => {
        calls.push(`lock:${sqlOf(args)}`);
        return Promise.resolve([]);
      }),
      payment: {
        count: jest.fn(() => {
          calls.push('count');
          return Promise.resolve(stillAwaiting);
        }),
      },
      dentalOrder: {
        updateMany: jest.fn(() => {
          calls.push('update');
          return Promise.resolve({ count: moved });
        }),
      },
    };
    return { tx, calls };
  }

  it('locks the order, then moves it back to payment_pending when nothing else awaits', async () => {
    const { tx, calls } = txWith(0, 1);
    await expect(
      releaseOrderFromReview(tx as unknown as Tx, 'o-1'),
    ).resolves.toBe(true);
    expect(calls[0]).toMatch(/FROM "DentalOrder" WHERE id = \? FOR UPDATE/);
    expect(calls.slice(1)).toEqual(['count', 'update']);
    expect(tx.payment.count).toHaveBeenCalledWith({
      where: {
        orderId: 'o-1',
        purpose: PaymentPurpose.installment,
        paymentMethod: PaymentMethod.bank_transfer,
        status: PaymentRecordStatus.awaiting_confirmation,
      },
    });
    // Only from payment_review: a case already past it never moves back.
    expect(tx.dentalOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'o-1', status: OrderStatus.payment_review },
      data: { status: OrderStatus.payment_pending },
    });
  });

  it('leaves the order in review while another transfer of it awaits', async () => {
    const { tx } = txWith(1, 1);
    await expect(
      releaseOrderFromReview(tx as unknown as Tx, 'o-1'),
    ).resolves.toBe(false);
    expect(tx.dentalOrder.updateMany).not.toHaveBeenCalled();
  });

  it('answers false when the order was not in review', async () => {
    const { tx } = txWith(0, 0);
    await expect(
      releaseOrderFromReview(tx as unknown as Tx, 'o-1'),
    ).resolves.toBe(false);
  });
});

describe('paymentPhaseAfterPartialSettlement (confirming one transfer of several)', () => {
  function txWith(awaiting: number) {
    const calls: string[] = [];
    const tx = {
      $queryRaw: jest.fn((...args: unknown[]) => {
        calls.push(`lock:${sqlOf(args)}`);
        return Promise.resolve([]);
      }),
      payment: {
        count: jest.fn(() => {
          calls.push('count');
          return Promise.resolve(awaiting);
        }),
      },
    };
    return { tx, calls };
  }

  it('keeps payment_review while another installment transfer of the order awaits', async () => {
    const { tx, calls } = txWith(1);
    await expect(
      paymentPhaseAfterPartialSettlement(tx as unknown as Tx, 'o-1'),
    ).resolves.toBe(OrderStatus.payment_review);
    // The order row first (FOR NO KEY UPDATE: no deadlock with the key-share
    // locks of rows that reference it), then the count.
    expect(calls[0]).toMatch(
      /FROM "DentalOrder" WHERE id = \? FOR NO KEY UPDATE/,
    );
    expect(calls[1]).toBe('count');
    // The same count as a refusal's (releaseOrderFromReview).
    expect(tx.payment.count).toHaveBeenCalledWith({
      where: {
        orderId: 'o-1',
        purpose: PaymentPurpose.installment,
        paymentMethod: PaymentMethod.bank_transfer,
        status: PaymentRecordStatus.awaiting_confirmation,
      },
    });
  });

  it('is payment_pending when nothing else awaits', async () => {
    const { tx } = txWith(0);
    await expect(
      paymentPhaseAfterPartialSettlement(tx as unknown as Tx, 'o-1'),
    ).resolves.toBe(OrderStatus.payment_pending);
  });
});

describe('findDeclarationReplay (Idempotency-Key, unique per caller)', () => {
  const row = { id: 'p-1', installmentId: 'i-1' };

  it('looks the key up on the (initiatedById, declarationKey) unique index', async () => {
    const db = { payment: { findUnique: jest.fn().mockResolvedValue(row) } };
    await expect(
      findDeclarationReplay(db as unknown as Tx, {
        callerId: 'u-doc',
        key: 'key-12345',
        installmentId: 'i-1',
      }),
    ).resolves.toBe(row);
    expect(db.payment.findUnique).toHaveBeenCalledWith({
      where: {
        initiatedById_declarationKey: {
          initiatedById: 'u-doc',
          declarationKey: 'key-12345',
        },
      },
    });
  });

  it('a new key is no replay', async () => {
    const db = { payment: { findUnique: jest.fn().mockResolvedValue(null) } };
    await expect(
      findDeclarationReplay(db as unknown as Tx, {
        callerId: 'u-doc',
        key: 'key-12345',
        installmentId: 'i-1',
      }),
    ).resolves.toBeNull();
  });

  it('the key used for another installment is a 409 TRANSFER_IDEMPOTENCY_KEY_REUSED', async () => {
    const db = { payment: { findUnique: jest.fn().mockResolvedValue(row) } };
    const error = await findDeclarationReplay(db as unknown as Tx, {
      callerId: 'u-doc',
      key: 'key-12345',
      installmentId: 'i-2',
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).statusCode).toBe(409);
    expect((error as AppException).errorCode).toBe(
      TRANSFER_ERROR.IDEMPOTENCY_KEY_REUSED,
    );
  });
});

describe('isUniqueViolation', () => {
  it('is true for P2002 only', () => {
    const unique = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const other = new Prisma.PrismaClientKnownRequestError('fk', {
      code: 'P2003',
      clientVersion: 'test',
    });
    expect(isUniqueViolation(unique)).toBe(true);
    expect(isUniqueViolation(other)).toBe(false);
    expect(isUniqueViolation(new Error('P2002'))).toBe(false);
  });
});
