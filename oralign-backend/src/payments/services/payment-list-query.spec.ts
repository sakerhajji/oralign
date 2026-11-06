import { PaymentPurpose } from '@prisma/client';
import {
  compareIds,
  paymentEventDate,
  paymentListWhere,
} from './payment-list-query';

describe('paymentListWhere', () => {
  it('scopes to live orders, and to the dentist when one is given', () => {
    expect(paymentListWhere({}, undefined)).toEqual({
      order: { deletedAt: null },
    });
    expect(
      paymentListWhere({ purpose: PaymentPurpose.installment }, 'd-1'),
    ).toEqual({
      order: { deletedAt: null, doctorId: 'd-1' },
      purpose: PaymentPurpose.installment,
    });
  });

  it('narrows installments to a rank, a range, or from a rank on', () => {
    expect(
      paymentListWhere({ installmentMin: 1, installmentMax: 1 }, undefined),
    ).toMatchObject({
      installment: { installmentNumber: { gte: 1, lte: 1 } },
    });
    expect(paymentListWhere({ installmentMin: 4 }, undefined)).toMatchObject({
      installment: { installmentNumber: { gte: 4 } },
    });
    expect(paymentListWhere({ installmentMax: 2 }, undefined)).toMatchObject({
      installment: { installmentNumber: { lte: 2 } },
    });
    expect(paymentListWhere({}, undefined)).not.toHaveProperty('installment');
  });

  it('refuses a rank range that ends before it starts', () => {
    let error: unknown;
    try {
      paymentListWhere({ installmentMin: 3, installmentMax: 2 }, undefined);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      statusCode: 400,
      errorCode: 'INVALID_INSTALLMENT_RANGE',
    });
  });
});

describe('payment ordering helpers', () => {
  it('dates a payment when it was received, else when it was made', () => {
    const createdAt = new Date('2026-11-01T10:00:00Z');
    const paidAt = new Date('2026-11-03T10:00:00Z');
    expect(paymentEventDate({ paidAt, createdAt })).toBe(paidAt);
    expect(paymentEventDate({ paidAt: null, createdAt })).toBe(createdAt);
  });

  it('orders ids as the database does', () => {
    expect(compareIds('a', 'b')).toBe(-1);
    expect(compareIds('b', 'a')).toBe(1);
    expect(compareIds('a', 'a')).toBe(0);
  });
});
