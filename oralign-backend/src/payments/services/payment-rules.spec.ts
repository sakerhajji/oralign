import { PaymentMethod, PaymentRecordStatus, Prisma } from '@prisma/client';
import {
  appliesWithholding,
  assertNoOtherPaymentInFlight,
  assertWithholdingAllowed,
  CARD_IN_FLIGHT_MESSAGE,
  chargeWithholdingIneligibility,
  chargesTheSame,
  expectedCharge,
  IN_FLIGHT_PAYMENT_STATUSES,
  isAdminRecordedMethod,
  paymentChargeData,
  paymentGross,
  paymentSettled,
  CHARGE_SETTINGS_SELECT,
  readChargeSettings,
  readTreatmentFeeSettings,
  resolvePaymentCharge,
  toPaymentJson,
  toThreshold,
  TRANSFER_IN_FLIGHT_MESSAGE,
  treatmentFeeDue,
  treatmentFeeSettled,
  withholdingRuleOf,
} from './payment-rules';

const d = (value: string) => new Prisma.Decimal(value);
const fixed = (value: Prisma.Decimal | null) => value?.toFixed(3) ?? null;

describe('resolvePaymentCharge (stamp added, retenue à la source taken off)', () => {
  // Switched on, no threshold: the arithmetic alone.
  const settings = {
    withholdingRate: '1',
    stampDuty: '1',
    withholdingEnabled: true,
  };

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
      withholdingEnabled: true,
    });
    // 333.333 x 1.5 % = 4.999995 → 5.000
    expect(fixed(c.withholding)).toBe('5.000');
    expect(fixed(c.cash)).toBe('329.333');
    expect(c.cash.plus(c.withholding).minus(c.stamp).toFixed(3)).toBe(
      '333.333',
    );
  });

  it('no stamp configured: the due alone (the retenue still on the due)', () => {
    const c = resolvePaymentCharge(true, '1000', {
      withholdingRate: '1',
      withholdingEnabled: true,
    });
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
          withholdingEnabled: true,
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

  it('reads the active settings: rate, stamp, switch and threshold; 0 / off / null when there are none', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({
        withholdingRate: d('1'),
        stampDuty: d('1'),
        withholdingEnabled: true,
        withholdingThreshold: d('1000'),
      })
      .mockResolvedValueOnce(null);
    const db = { companyBillingSettings: { findFirst } } as never;

    const read = await readChargeSettings(db);
    expect(read.withholdingRate.toString()).toBe('1');
    expect(read.stampDuty.toFixed(3)).toBe('1.000');
    expect(read.withholdingEnabled).toBe(true);
    expect(read.withholdingThreshold?.toFixed(3)).toBe('1000.000');
    expect(findFirst).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: CHARGE_SETTINGS_SELECT,
    });
    expect(CHARGE_SETTINGS_SELECT).toEqual({
      withholdingRate: true,
      stampDuty: true,
      withholdingEnabled: true,
      withholdingThreshold: true,
    });

    const none = await readChargeSettings(db);
    expect(none.withholdingRate.toFixed(3)).toBe('0.000');
    expect(none.stampDuty.toFixed(3)).toBe('0.000');
    expect(none.withholdingEnabled).toBe(false);
    expect(none.withholdingThreshold).toBeNull();
  });

  it('the treatment fee reads the same settings plus the fee, in one query', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      withholdingRate: d('1'),
      stampDuty: d('1'),
      withholdingEnabled: false,
      withholdingThreshold: d('1000'),
      defaultTreatmentFee: d('300'),
      defaultCurrency: 'TND',
    });
    const read = await readTreatmentFeeSettings({
      companyBillingSettings: { findFirst },
    } as never);
    expect(findFirst).toHaveBeenCalledTimes(1);
    const query = (findFirst.mock.calls[0] as [{ select: object }])[0];
    expect(query.select).toEqual({
      ...CHARGE_SETTINGS_SELECT,
      defaultTreatmentFee: true,
      defaultCurrency: true,
    });
    expect(read.defaultTreatmentFee.toFixed(3)).toBe('300.000');
    expect(read.defaultCurrency).toBe('TND');
    expect(read.withholdingThreshold?.toFixed(3)).toBe('1000.000');
  });

  it('snapshots the threshold on the charge and its Payment columns', () => {
    const c = resolvePaymentCharge(true, '1000', {
      ...settings,
      withholdingThreshold: '1000',
    });
    expect(fixed(c.withholding)).toBe('10.000');
    expect(fixed(c.withholdingThreshold)).toBe('1000.000');
    expect(fixed(paymentChargeData(c).withholdingThreshold)).toBe('1000.000');
    expect(
      paymentChargeData(resolvePaymentCharge(false, '500', { stampDuty: '1' }))
        .withholdingThreshold,
    ).toBeNull();
  });
});

describe('the retenue rule at the payment entry points (spec §4)', () => {
  const rule = {
    withholdingRate: '1',
    stampDuty: '1',
    withholdingEnabled: true,
    withholdingThreshold: '1000',
  };

  it('applies the retenue from the threshold on (at or above, to the millime)', () => {
    const c = resolvePaymentCharge(true, '1000.000', rule);
    expect(fixed(c.withholding)).toBe('10.000');
    expect(fixed(c.cash)).toBe('991.000');
    expect(fixed(resolvePaymentCharge(true, '2380', rule).withholding)).toBe(
      '23.800',
    );
  });

  it('refuses it below the threshold with 400 WITHHOLDING_BELOW_THRESHOLD and the threshold in the body', () => {
    let error: unknown;
    try {
      resolvePaymentCharge(true, '999.999', rule);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      statusCode: 400,
      errorCode: 'WITHHOLDING_BELOW_THRESHOLD',
      details: { withholdingThreshold: 1000 },
    });
    // The French amount in the message: 1 000,000 TND.
    expect((error as Error).message).toMatch(/1\s000,000 TND/u);
  });

  it('a 2 380 devis paid in 3 x 793.333: each payment is its own base', () => {
    expect(() => resolvePaymentCharge(true, '793.333', rule)).toThrow(
      expect.objectContaining({ errorCode: 'WITHHOLDING_BELOW_THRESHOLD' }),
    );
  });

  it('the treatment fee (300 + 50 CBCT) stays below a 1 000 threshold', () => {
    expect(() =>
      resolvePaymentCharge(true, treatmentFeeDue('300', '50'), rule),
    ).toThrow(
      expect.objectContaining({ errorCode: 'WITHHOLDING_BELOW_THRESHOLD' }),
    );
  });

  it.each([[false], [null], [undefined]])(
    'refuses it with 400 WITHHOLDING_DISABLED when the switch is %p, whatever the rate and the amount',
    (enabled) => {
      expect(() =>
        resolvePaymentCharge(true, '5000', {
          ...rule,
          withholdingEnabled: enabled,
        }),
      ).toThrow(
        expect.objectContaining({
          statusCode: 400,
          errorCode: 'WITHHOLDING_DISABLED',
        }),
      );
    },
  );

  it('switched off wins over the threshold: a small payment is "disabled", not "below"', () => {
    expect(
      chargeWithholdingIneligibility('10', {
        ...rule,
        withholdingEnabled: false,
      }),
    ).toBe('disabled');
    expect(chargeWithholdingIneligibility('10', rule)).toBe('below_threshold');
    expect(chargeWithholdingIneligibility('1000', rule)).toBeNull();
  });

  it('a payment without the retenue is always allowed, eligible or not', () => {
    for (const settings of [
      rule,
      { ...rule, withholdingEnabled: false },
      { ...rule, withholdingRate: '0' },
    ]) {
      expect(fixed(resolvePaymentCharge(false, '500', settings).cash)).toBe(
        '501.000',
      );
      expect(fixed(resolvePaymentCharge(undefined, '500', settings).cash)).toBe(
        '501.000',
      );
    }
    expect(() => assertWithholdingAllowed('1000', rule)).not.toThrow();
  });

  it('expectedCharge never throws and prices an ineligible retenue as none', () => {
    const below = expectedCharge(true, '500', rule);
    expect(below.withholdingRate).toBeNull();
    expect(fixed(below.cash)).toBe('501.000');
    expect(fixed(below.withholdingThreshold)).toBe('1000.000');
    const off = expectedCharge(true, '5000', {
      ...rule,
      withholdingEnabled: false,
    });
    expect(fixed(off.withholding)).toBe('0.000');
    expect(fixed(expectedCharge(true, '1000', rule).withholding)).toBe(
      '10.000',
    );
  });

  it('a live attempt priced with a retenue that no longer applies is not the same charge', () => {
    const before = resolvePaymentCharge(true, '1000', rule);
    const now = expectedCharge(true, '1000', {
      ...rule,
      withholdingThreshold: '1500',
    });
    expect(
      chargesTheSame(
        {
          amount: before.cash,
          withholdingAmount: before.withholding,
          stampAmount: before.stamp,
        },
        now,
      ),
    ).toBe(false);
  });

  it('reads the rule from the active settings row: the read feeds the guard', async () => {
    const row = (enabled: boolean) => ({
      withholdingRate: d('1'),
      stampDuty: d('1'),
      withholdingEnabled: enabled,
      withholdingThreshold: d('1000'),
    });
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(row(false))
      .mockResolvedValueOnce(row(true))
      .mockResolvedValueOnce(null);
    const db = { companyBillingSettings: { findFirst } } as never;

    const off = await readChargeSettings(db);
    expect(() => resolvePaymentCharge(true, '2000', off)).toThrow(
      expect.objectContaining({ errorCode: 'WITHHOLDING_DISABLED' }),
    );
    const on = await readChargeSettings(db);
    expect(fixed(resolvePaymentCharge(true, '2000', on).withholding)).toBe(
      '20.000',
    );
    // No settings row at all: off.
    const none = await readChargeSettings(db);
    expect(() => resolvePaymentCharge(true, '2000', none)).toThrow(
      expect.objectContaining({ errorCode: 'WITHHOLDING_DISABLED' }),
    );
  });

  it('withholdingRuleOf maps the settings onto the shared rule', () => {
    expect(withholdingRuleOf(rule)).toEqual({
      enabled: true,
      rate: '1',
      threshold: '1000',
    });
  });
});

describe('chargesTheSame (a live attempt still charges what a new one would)', () => {
  const now = resolvePaymentCharge(true, '1000', {
    withholdingRate: '1',
    stampDuty: '1',
    withholdingEnabled: true,
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

  it('the retenue threshold snapshot is a 3-decimal number, null kept, absent when not selected', () => {
    expect(
      toPaymentJson({ amount: d('50'), withholdingThreshold: d('1000.000') }),
    ).toMatchObject({ withholdingThreshold: 1000 });
    expect(
      toPaymentJson({ amount: d('50'), withholdingThreshold: '999.9996' }),
    ).toMatchObject({ withholdingThreshold: 1000 });
    expect(
      toPaymentJson({ amount: d('50'), withholdingThreshold: d('0') }),
    ).toMatchObject({ withholdingThreshold: 0 });
    // Taken before the threshold existed (2026-11-27): null, never 0.
    expect(
      toPaymentJson({ amount: d('50'), withholdingThreshold: null }),
    ).toMatchObject({ withholdingThreshold: null });
    expect(toPaymentJson({ amount: d('50') })).not.toHaveProperty(
      'withholdingThreshold',
    );
  });

  it('toThreshold: one conversion for every payment response', () => {
    expect(toThreshold(d('1000.5'))).toBe(1000.5);
    expect(toThreshold('1000.0004')).toBe(1000);
    expect(toThreshold(null)).toBeNull();
    expect(toThreshold(undefined)).toBeNull();
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
    expect(
      (findFirst.mock.calls[0] as [{ where: { paymentMethod: unknown } }])[0]
        .where.paymentMethod,
    ).toEqual({
      in: [PaymentMethod.card],
    });
  });

  it.each([PaymentMethod.cash, PaymentMethod.cheque])(
    '%s looks for both an open card attempt and an open transfer',
    async (method) => {
      const { tx, findFirst } = txWith(null);
      await assertNoOtherPaymentInFlight(tx, 'i-1', method);
      expect(
        (findFirst.mock.calls[0] as [{ where: { paymentMethod: unknown } }])[0]
          .where.paymentMethod,
      ).toEqual({
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
