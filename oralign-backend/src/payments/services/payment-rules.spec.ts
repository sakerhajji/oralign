import { PaymentMethod, PaymentRecordStatus, Prisma } from '@prisma/client';
import {
  appliesWithholding,
  assertNoOtherPaymentInFlight,
  CARD_IN_FLIGHT_MESSAGE,
  chargesTheSame,
  expectedCharge,
  IN_FLIGHT_PAYMENT_STATUSES,
  isAdminRecordedMethod,
  paymentChargeData,
  paymentGross,
  paymentSettled,
  readChargeSettings,
  resolvePaymentCharge,
  toPaymentJson,
  TRANSFER_IN_FLIGHT_MESSAGE,
  treatmentFeeDue,
  treatmentFeeSettled,
} from './payment-rules';

const d = (value: string) => new Prisma.Decimal(value);
const fixed = (value: Prisma.Decimal | null) => value?.toFixed(3) ?? null;

describe('resolvePaymentCharge (stamp added, retenue à la source taken off)', () => {
  const settings = { withholdingRate: '1', stampDuty: '1' };

  it('the owner example: 1 000 due, retenue 1 % applied → 1 001 total, 991 cash', () => {
    const c = resolvePaymentCharge(true, '1000', settings);
    expect(fixed(c.due)).toBe('1000.000');
    expect(fixed(c.stamp)).toBe('1.000');
    expect(fixed(c.total)).toBe('1001.000');
    expect(c.withholdingRate?.toString()).toBe('1');
    // The retenue is on the due, the stamp excluded: 1 % of 1 000.
    expect(fixed(c.withholding)).toBe('10.000');
    expect(fixed(c.cash)).toBe('991.000');
  });

  it('not applied: the due + the stamp is paid, no rate, nothing kept back', () => {
    const c = resolvePaymentCharge(false, '1000', settings);
    expect(c.withholdingRate).toBeNull();
    expect(fixed(c.withholding)).toBe('0.000');
    expect(fixed(c.stamp)).toBe('1.000');
    expect(fixed(c.cash)).toBe('1001.000');
  });

  it('cash + retenue - stamp is always the due (what the payment settles)', () => {
    const c = resolvePaymentCharge(true, '333.333', {
      withholdingRate: '1.5',
      stampDuty: '1',
    });
    // 333.333 x 1.5 % = 4.999995 → 5.000
    expect(fixed(c.withholding)).toBe('5.000');
    expect(fixed(c.cash)).toBe('329.333');
    expect(c.cash.plus(c.withholding).minus(c.stamp).toFixed(3)).toBe(
      '333.333',
    );
  });

  it('no stamp configured: the due alone (the retenue still on the due)', () => {
    const c = resolvePaymentCharge(true, '1000', { withholdingRate: '1' });
    expect(fixed(c.stamp)).toBe('0.000');
    expect(fixed(c.cash)).toBe('990.000');
  });

  it.each([['0'], [null], [undefined]])(
    'refuses the flag with 400 WITHHOLDING_DISABLED when the rate is %p',
    (rate) => {
      expect(() =>
        resolvePaymentCharge(true, '1000', {
          withholdingRate: rate,
          stampDuty: '1',
        }),
      ).toThrow(
        expect.objectContaining({
          statusCode: 400,
          errorCode: 'WITHHOLDING_DISABLED',
        }),
      );
    },
  );

  it('a disabled rate does not matter when the flag is off', () => {
    const c = resolvePaymentCharge(undefined, '50', {
      withholdingRate: '0',
      stampDuty: '1',
    });
    expect(fixed(c.cash)).toBe('51.000');
  });

  it('expectedCharge never throws: a rate of 0 applies no retenue', () => {
    const c = expectedCharge(true, '1000', {
      withholdingRate: '0',
      stampDuty: '1',
    });
    expect(c.withholdingRate).toBeNull();
    expect(fixed(c.cash)).toBe('1001.000');
  });

  it('the payment columns: cash as amount, retenue and stamp beside it', () => {
    const data = paymentChargeData(
      resolvePaymentCharge(true, '1000', settings),
    );
    expect(fixed(data.amount)).toBe('991.000');
    expect(data.withholdingRate?.toString()).toBe('1');
    expect(fixed(data.withholdingAmount)).toBe('10.000');
    expect(fixed(data.stampAmount)).toBe('1.000');
  });

  it('reads the active settings: rate and stamp, 0 when there are none', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({ withholdingRate: d('1'), stampDuty: d('1') })
      .mockResolvedValueOnce(null);
    const db = { companyBillingSettings: { findFirst } } as never;

    const read = await readChargeSettings(db);
    expect(read.withholdingRate.toString()).toBe('1');
    expect(read.stampDuty.toFixed(3)).toBe('1.000');
    expect(findFirst).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: { withholdingRate: true, stampDuty: true },
    });

    const none = await readChargeSettings(db);
    expect(none.withholdingRate.toFixed(3)).toBe('0.000');
    expect(none.stampDuty.toFixed(3)).toBe('0.000');
  });
});

describe('chargesTheSame (a live attempt still charges what a new one would)', () => {
  const now = resolvePaymentCharge(true, '1000', {
    withholdingRate: '1',
    stampDuty: '1',
  });

  it('the same cash, retenue and stamp', () => {
    expect(
      chargesTheSame(
        {
          amount: d('991.000'),
          withholdingAmount: d('10.000'),
          stampAmount: d('1.000'),
        },
        now,
      ),
    ).toBe(true);
  });

  it('an attempt opened before the stamp was added does not', () => {
    expect(
      chargesTheSame(
        {
          amount: d('990.000'),
          withholdingAmount: d('10.000'),
          stampAmount: d('0'),
        },
        now,
      ),
    ).toBe(false);
  });

  it('nor one opened at another retenue rate', () => {
    expect(
      chargesTheSame(
        {
          amount: d('981.000'),
          withholdingAmount: d('20.000'),
          stampAmount: d('1.000'),
        },
        now,
      ),
    ).toBe(false);
  });
});

describe('payment amounts', () => {
  it('gross = cash + retenue (the facture total, stamp included)', () => {
    expect(
      paymentGross({ amount: d('990'), withholdingAmount: d('10') }).toFixed(3),
    ).toBe('1000.000');
    const stamped = {
      amount: d('991'),
      withholdingAmount: d('10'),
      stampAmount: d('1'),
    };
    expect(paymentGross(stamped).toFixed(3)).toBe('1001.000');
    expect(paymentGross({ amount: d('990') }).toFixed(3)).toBe('990.000');
  });

  it('settled = cash + retenue - stamp (the installment)', () => {
    expect(
      paymentSettled({
        amount: d('991'),
        withholdingAmount: d('10'),
        stampAmount: d('1'),
      }).toFixed(3),
    ).toBe('1000.000');
    expect(
      paymentSettled({ amount: d('1001'), stampAmount: d('1') }).toFixed(3),
    ).toBe('1000.000');
    // A payment made before the stamp was added: stampAmount 0 (or absent).
    expect(
      paymentSettled({
        amount: d('990'),
        withholdingAmount: d('10'),
        stampAmount: d('0'),
      }).toFixed(3),
    ).toBe('1000.000');
    expect(paymentSettled({ amount: d('500') }).toFixed(3)).toBe('500.000');
  });

  it('the fee an order settled: cash + retenue - stamp, legacy null stamp = 0', () => {
    expect(
      treatmentFeeSettled({
        treatmentFeeAmount: d('347.500'),
        treatmentFeeWithholdingAmount: d('3.500'),
        treatmentFeeStampAmount: d('1.000'),
      }).toFixed(3),
    ).toBe('350.000');
    expect(
      treatmentFeeSettled({
        treatmentFeeAmount: d('346.500'),
        treatmentFeeWithholdingAmount: d('3.500'),
        treatmentFeeStampAmount: null,
      }).toFixed(3),
    ).toBe('350.000');
  });

  it('tells an attempt with a retenue from one without', () => {
    expect(appliesWithholding({ withholdingRate: d('1') })).toBe(true);
    expect(appliesWithholding({ withholdingAmount: d('0.010') })).toBe(true);
    // Decimal.js counts 0 as "positive": a 0 amount is still "none".
    expect(
      appliesWithholding({ withholdingRate: null, withholdingAmount: d('0') }),
    ).toBe(false);
    expect(appliesWithholding({})).toBe(false);
  });

  it('the treatment fee due is the fee plus the CBCT snapshot, as a Decimal', () => {
    expect(treatmentFeeDue(d('300.000'), d('50.000')).toFixed(3)).toBe(
      '350.000',
    );
    expect(treatmentFeeDue(d('0.1'), d('0.2')).toFixed(3)).toBe('0.300');
    expect(treatmentFeeDue(null, null).toFixed(3)).toBe('0.000');
  });

  it('the JSON keeps amount as is and adds the retenue and stamp fields as numbers', () => {
    const json = toPaymentJson({
      id: 'p1',
      amount: d('991.000'),
      withholdingRate: d('1.00'),
      withholdingAmount: d('10.000'),
      stampAmount: d('1.000'),
    });
    expect(json).toEqual({
      id: 'p1',
      amount: d('991.000'),
      withholdingRate: 1,
      withholdingAmount: 10,
      stampAmount: 1,
      grossAmount: 1001,
      settledAmount: 1000,
    });
    expect(
      toPaymentJson({ amount: d('50'), withholdingRate: null }),
    ).toMatchObject({
      withholdingRate: null,
      withholdingAmount: 0,
      stampAmount: 0,
      grossAmount: 50,
      settledAmount: 50,
    });
  });

  it('a legacy payment (stamp 0): settled = gross = cash + retenue', () => {
    expect(
      toPaymentJson({
        amount: d('990.000'),
        withholdingRate: d('1'),
        withholdingAmount: d('10.000'),
        stampAmount: d('0'),
      }),
    ).toMatchObject({ stampAmount: 0, grossAmount: 1000, settledAmount: 1000 });
  });

  it('only cash and cheque are admin-recorded methods', () => {
    expect(isAdminRecordedMethod(PaymentMethod.cash)).toBe(true);
    expect(isAdminRecordedMethod(PaymentMethod.cheque)).toBe(true);
    expect(isAdminRecordedMethod(PaymentMethod.card)).toBe(false);
    expect(isAdminRecordedMethod(PaymentMethod.bank_transfer)).toBe(false);
  });
});

describe('assertNoOtherPaymentInFlight (one payment at a time)', () => {
  const txWith = (open: { paymentMethod: PaymentMethod } | null) => {
    const findFirst = jest.fn().mockResolvedValue(open);
    return { tx: { payment: { findFirst } } as never, findFirst };
  };

  it('a card payment looks for an open transfer only', async () => {
    const { tx, findFirst } = txWith(null);
    await assertNoOtherPaymentInFlight(tx, 'i-1', PaymentMethod.card);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        installmentId: 'i-1',
        status: { in: IN_FLIGHT_PAYMENT_STATUSES },
        paymentMethod: { in: [PaymentMethod.bank_transfer] },
      },
      select: { paymentMethod: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('a transfer looks for an open card attempt only (a re-declaration replaces its own kind)', async () => {
    const { tx, findFirst } = txWith(null);
    await assertNoOtherPaymentInFlight(tx, 'i-1', PaymentMethod.bank_transfer);
    expect(findFirst.mock.calls[0][0].where.paymentMethod).toEqual({
      in: [PaymentMethod.card],
    });
  });

  it.each([PaymentMethod.cash, PaymentMethod.cheque])(
    '%s looks for both an open card attempt and an open transfer',
    async (method) => {
      const { tx, findFirst } = txWith(null);
      await assertNoOtherPaymentInFlight(tx, 'i-1', method);
      expect(findFirst.mock.calls[0][0].where.paymentMethod).toEqual({
        in: [PaymentMethod.card, PaymentMethod.bank_transfer],
      });
    },
  );

  it('the in-flight statuses: pending, unknown, awaiting confirmation', () => {
    expect(IN_FLIGHT_PAYMENT_STATUSES).toEqual([
      PaymentRecordStatus.pending,
      PaymentRecordStatus.unknown,
      PaymentRecordStatus.awaiting_confirmation,
    ]);
  });

  it('409 PAYMENT_ATTEMPT_IN_PROGRESS naming the open card payment', async () => {
    const { tx } = txWith({ paymentMethod: PaymentMethod.card });
    await expect(
      assertNoOtherPaymentInFlight(tx, 'i-1', PaymentMethod.bank_transfer),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'PAYMENT_ATTEMPT_IN_PROGRESS',
      message: CARD_IN_FLIGHT_MESSAGE,
    });
  });

  it('409 naming the transfer awaiting confirmation', async () => {
    const { tx } = txWith({ paymentMethod: PaymentMethod.bank_transfer });
    await expect(
      assertNoOtherPaymentInFlight(tx, 'i-1', PaymentMethod.cash),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: TRANSFER_IN_FLIGHT_MESSAGE,
    });
  });
});
