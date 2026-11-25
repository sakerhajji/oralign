import {
  InstallmentStatus,
  PaymentRecordStatus,
  Prisma,
  QuotationPaymentStatus,
  QuotationStatus,
} from '@prisma/client';
import {
  hasFreeStepForReplan,
  isTtcPriced,
  KEPT_INSTALLMENT_STATUSES,
  planRebalance,
  type PlanInstallment,
  presentQuotes,
  QUOTE_ERROR,
  quoteActionFlags,
  quoteMoneyEdited,
  readQuoteMoney,
  resolveQuoteDiscount,
  settleQuote,
} from './quote-money';

const D = (v: string | number) => new Prisma.Decimal(v);

/** The error `run` throws; fails the test when it does not throw. */
function refusal(run: () => unknown): unknown {
  try {
    run();
  } catch (err) {
    return err;
  }
  throw new Error('expected a refusal');
}

const row = (
  n: number,
  amount: string,
  status: InstallmentStatus = InstallmentStatus.pending,
  inFlight = false,
): PlanInstallment => ({
  id: `i-${n}`,
  installmentNumber: n,
  amount: D(amount),
  status,
  inFlight,
});

describe('readQuoteMoney', () => {
  it('counts a payment as amount + withholding, and unknown attempts as in flight', async () => {
    const groupBy = jest.fn().mockResolvedValue([
      {
        quotationId: 'q-1',
        status: PaymentRecordStatus.success,
        _sum: { amount: D('591.000'), withholdingAmount: D('9.000') },
        _count: { _all: 1 },
      },
      {
        quotationId: 'q-1',
        status: PaymentRecordStatus.unknown,
        _sum: { amount: D('700'), withholdingAmount: D(0) },
        _count: { _all: 1 },
      },
      {
        quotationId: 'q-1',
        status: PaymentRecordStatus.expired,
        _sum: { amount: D('700'), withholdingAmount: D(0) },
        _count: { _all: 3 },
      },
    ]);

    const money = await readQuoteMoney(
      { payment: { groupBy } } as never,
      ['q-1', 'q-2'],
    );

    expect(money.get('q-1')).toMatchObject({ receivedCount: 1, inFlightCount: 1 });
    expect(money.get('q-1')!.received.toFixed(3)).toBe('600.000');
    // Dead attempts move nothing and block nothing.
    expect(money.get('q-2')).toMatchObject({ receivedCount: 0, inFlightCount: 0 });
  });

  it('takes the stamps out: cash + retenue - stamp is what the installments settled', async () => {
    const groupBy = jest.fn().mockResolvedValue([
      {
        quotationId: 'q-1',
        status: PaymentRecordStatus.success,
        // Three installments of 1 000: one with a 1 % retenue (991 cash),
        // two without (1 001 cash each), every one with its 1 TND stamp.
        _sum: {
          amount: D('2993.000'),
          withholdingAmount: D('10.000'),
          stampAmount: D('3.000'),
        },
        _count: { _all: 3 },
      },
    ]);

    const money = await readQuoteMoney({ payment: { groupBy } } as never, [
      'q-1',
    ]);

    expect(groupBy.mock.calls[0][0]._sum).toEqual({
      amount: true,
      withholdingAmount: true,
      stampAmount: true,
    });
    expect(money.get('q-1')!.received.toFixed(3)).toBe('3000.000');
    // So the quote reaches exactly paid, neither short nor 3 TND over.
    const settled = settleQuote(D('3000.000'), money.get('q-1')!.received);
    expect(settled.paymentStatus).toBe(QuotationPaymentStatus.paid);
    expect(settled.paidAmount.toFixed(3)).toBe('3000.000');
  });

  it('a payment made before the stamp was added (stampAmount 0) counts cash + retenue', async () => {
    const groupBy = jest.fn().mockResolvedValue([
      {
        quotationId: 'q-1',
        status: PaymentRecordStatus.success,
        _sum: {
          amount: D('990.000'),
          withholdingAmount: D('10.000'),
          stampAmount: D('0'),
        },
        _count: { _all: 1 },
      },
    ]);
    const money = await readQuoteMoney({ payment: { groupBy } } as never, [
      'q-1',
    ]);
    expect(money.get('q-1')!.received.toFixed(3)).toBe('1000.000');
  });
});

describe('settleQuote', () => {
  it('derives pending / partially paid / paid like handleSuccess, millime tolerance included', () => {
    expect(settleQuote(D(2000), D(0))).toMatchObject({
      paymentStatus: QuotationPaymentStatus.pending,
    });
    const partial = settleQuote(D(2000), D(600));
    expect(partial.paymentStatus).toBe(QuotationPaymentStatus.partially_paid);
    expect(partial.remainingAmount.toFixed(3)).toBe('1400.000');
    const paid = settleQuote(D('2000.000'), D('1999.999'));
    expect(paid.paymentStatus).toBe(QuotationPaymentStatus.paid);
    expect(paid.remainingAmount.toFixed(3)).toBe('0.000');
  });
});

describe('quoteActionFlags', () => {
  const money = (receivedCount: number, inFlightCount: number) => ({
    received: D(receivedCount * 100),
    receivedCount,
    inFlightCount,
  });

  const flags = (
    status: QuotationStatus,
    receivedCount: number,
    inFlightCount: number,
    freeSteps = true,
  ) => quoteActionFlags(status, money(receivedCount, inFlightCount), freeSteps);

  it('allows delete and recall only while no money moved', () => {
    expect(flags(QuotationStatus.approved, 0, 0)).toEqual({
      hasPaymentInFlight: false,
      receivedAmount: 0,
      canDelete: true,
      canRecall: true,
      freeStepsForReplan: true,
    });
    expect(flags(QuotationStatus.approved, 0, 1)).toMatchObject({
      hasPaymentInFlight: true,
      canDelete: false,
      canRecall: false,
    });
    expect(flags(QuotationStatus.sent, 1, 0, false)).toMatchObject({
      receivedAmount: 100,
      canDelete: false,
      canRecall: false,
      freeStepsForReplan: false,
    });
  });

  it('never offers to recall a draft or a rejected quote, which may still be deleted', () => {
    expect(flags(QuotationStatus.draft, 0, 0)).toMatchObject({
      canDelete: true,
      canRecall: false,
    });
    expect(flags(QuotationStatus.rejected, 0, 0)).toMatchObject({
      canDelete: true,
      canRecall: false,
    });
  });
});

describe('quoteMoneyEdited', () => {
  const stored = {
    treatmentFees: 1500,
    fabricationFees: 200,
    deliveryFees: 0,
    discountAmount: 0,
    tvaRate: 19,
  };

  it('ignores a body that only echoes the stored amounts (the editor posts every field)', () => {
    expect(quoteMoneyEdited({}, stored)).toBe(false);
    expect(quoteMoneyEdited({ ...stored }, stored)).toBe(false);
    // Float noise below the millime is not an edit.
    expect(quoteMoneyEdited({ treatmentFees: 1500.0001 }, stored)).toBe(false);
  });

  it('sees any money field whose value differs', () => {
    expect(quoteMoneyEdited({ ...stored, fabricationFees: 0 }, stored)).toBe(
      true,
    );
    expect(quoteMoneyEdited({ discountAmount: 50 }, stored)).toBe(true);
    expect(quoteMoneyEdited({ tvaRate: 7 }, stored)).toBe(true);
  });
});

describe('isTtcPriced', () => {
  const fees = {
    treatmentFees: 1500,
    fabricationFees: 200,
    deliveryFees: 0,
    discountAmount: 0,
  };

  it('is true for a pack quote, whatever its stored totals', () => {
    expect(isTtcPriced({ ...fees, packId: 'p-1', totalTtc: 2023 })).toBe(true);
  });

  it('is true for a packless quote whose total is the net of its fees', () => {
    expect(isTtcPriced({ ...fees, packId: null, totalTtc: 1700 })).toBe(true);
    expect(
      isTtcPriced({
        ...fees,
        discountAmount: 100,
        packId: null,
        totalTtc: 1600,
      }),
    ).toBe(true);
  });

  it('is false for a legacy HT quote: TVA was added on top of the fees', () => {
    // 1700 HT + 19 % = 2023.
    expect(isTtcPriced({ ...fees, packId: null, totalTtc: 2023 })).toBe(false);
  });
});

describe('hasFreeStepForReplan', () => {
  const limited = {
    packId: 'p-1',
    isUnlimitedSteps: false,
    maxStepsPerArch: 30,
  };
  const range = (fromStep: number, toStep: number) => ({ fromStep, toStep });
  const free = (...ranges: Array<ReturnType<typeof range>>) =>
    hasFreeStepForReplan(limited, ranges);

  it('is true while some pack step is outside every kept batch', () => {
    expect(free()).toBe(true);
    expect(free(range(1, 10))).toBe(true);
    // A hole in the middle counts, in whatever order the batches come.
    expect(free(range(21, 30), range(1, 10))).toBe(true);
    expect(free(range(2, 30))).toBe(true);
  });

  it('is false once the kept batches cover 1..maxStepsPerArch', () => {
    expect(free(range(11, 20), range(1, 10), range(21, 30))).toBe(false);
    expect(free(range(1, 40))).toBe(false);
  });

  it('is always true for an unlimited pack, false without a pack or a step limit', () => {
    const unlimited = { packId: 'p-1', isUnlimitedSteps: true };
    expect(hasFreeStepForReplan(unlimited, [range(1, 500)])).toBe(true);
    expect(hasFreeStepForReplan({ packId: null }, [])).toBe(false);
    const noLimit = { ...limited, maxStepsPerArch: 0 };
    expect(hasFreeStepForReplan(noLimit, [])).toBe(false);
  });
});

describe('presentQuotes', () => {
  it('reads the kept batches of limited pack quotes only, in one query', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { quotationId: 'q-full', fromStep: 1, toStep: 20 },
      { quotationId: 'q-full', fromStep: 21, toStep: 30 },
      { quotationId: 'q-open', fromStep: 1, toStep: 10 },
    ]);
    const db = {
      payment: { groupBy: jest.fn().mockResolvedValue([]) },
      quoteStepBatch: { findMany },
    };
    const pack = {
      status: QuotationStatus.approved,
      packId: 'p-1',
      maxStepsPerArch: 30,
    };

    const views = await presentQuotes(db as never, [
      { ...pack, id: 'q-full', isUnlimitedSteps: false },
      { ...pack, id: 'q-open', isUnlimitedSteps: false },
      { ...pack, id: 'q-unlimited', isUnlimitedSteps: true },
      { id: 'q-legacy', status: QuotationStatus.approved, packId: null },
    ]);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          quotationId: { in: ['q-full', 'q-open'] },
          installment: { status: { in: KEPT_INSTALLMENT_STATUSES } },
        },
      }),
    );
    expect(views.map((v) => [v.id, v.freeStepsForReplan])).toEqual([
      ['q-full', false],
      ['q-open', true],
      ['q-unlimited', true],
      ['q-legacy', false],
    ]);
  });

  it('skips the batch read when no quote has a step limit', async () => {
    const findMany = jest.fn();
    const db = {
      payment: { groupBy: jest.fn().mockResolvedValue([]) },
      quoteStepBatch: { findMany },
    };

    await presentQuotes(db as never, [
      { id: 'q-legacy', status: QuotationStatus.sent, packId: null },
    ]);

    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('resolveQuoteDiscount — a remise typed as a percentage', () => {
  const stored = {
    treatmentFees: 2380,
    fabricationFees: 0,
    deliveryFees: 20,
    discountAmount: 0,
    discountPercent: null as Prisma.Decimal | null,
  };

  it('turns a percentage into its amount on the gross (pack price + fees)', () => {
    const r = resolveQuoteDiscount({ discountPercent: 10 }, stored);
    expect(r.amount).toBe(240);
    expect(r.percent?.toFixed(2)).toBe('10.00');
  });

  it('uses the fees of the same edit', () => {
    const r = resolveQuoteDiscount({ deliveryFees: 120, discountPercent: 5 }, stored);
    expect(r.amount).toBe(125);
  });

  it('keeps a stored percentage true when only a fee changes', () => {
    const r = resolveQuoteDiscount(
      { deliveryFees: 120 },
      { ...stored, discountPercent: D('10') },
    );
    expect(r).toEqual({ amount: 250, percent: undefined });
  });

  it('an amount typed by hand clears the percentage', () => {
    expect(
      resolveQuoteDiscount({ discountAmount: 50 }, { ...stored, discountPercent: D('10') }),
    ).toEqual({ amount: undefined, percent: null });
    expect(resolveQuoteDiscount({ discountPercent: null }, stored)).toEqual({
      amount: undefined,
      percent: null,
    });
  });

  it('an echoed (unchanged) amount keeps the stored percentage', () => {
    expect(
      resolveQuoteDiscount(
        { discountAmount: 240 },
        { ...stored, discountAmount: 240, discountPercent: D('10') },
      ),
    ).toEqual({ amount: 240, percent: undefined });
  });

  it('leaves everything as is when the edit does not touch the remise', () => {
    expect(resolveQuoteDiscount({ notes: 'x' } as never, stored)).toEqual({
      amount: undefined,
      percent: undefined,
    });
  });
});

describe('planRebalance', () => {
  it('spreads what is left over the unpaid rows in proportion, paid rows untouched', () => {
    const { changes } = planRebalance({
      newTotal: D('2380.000'),
      received: D('600.000'),
      installments: [
        row(1, '600.000', InstallmentStatus.paid),
        row(2, '700.000'),
        row(3, '700.000'),
      ],
    });

    expect(changes.map((c) => [c.installmentNumber, c.to.toFixed(3)])).toEqual([
      [2, '890.000'],
      [3, '890.000'],
    ]);
  });

  it('keeps the unequal shape of the plan', () => {
    const { changes } = planRebalance({
      newTotal: D('2000'),
      received: D(0),
      installments: [row(1, '500'), row(2, '300'), row(3, '200')],
    });
    expect(changes.map((c) => c.to.toFixed(3))).toEqual([
      '1000.000',
      '600.000',
      '400.000',
    ]);
  });

  it('lands on the total to the millime, the last row absorbing the rounding', () => {
    const { changes } = planRebalance({
      newTotal: D('1000'),
      received: D(0),
      installments: [row(1, '300'), row(2, '300'), row(3, '300')],
    });
    expect(changes.map((c) => c.to.toFixed(3))).toEqual([
      '333.333',
      '333.333',
      '333.334',
    ]);
  });

  it('refuses a total below what was already settled (400)', () => {
    expect(
      refusal(() =>
        planRebalance({
          newTotal: D('500.000'),
          received: D('600.000'),
          installments: [row(1, '600', InstallmentStatus.paid), row(2, '1400')],
        }),
      ),
    ).toMatchObject({
      statusCode: 400,
      errorCode: QUOTE_ERROR.TOTAL_BELOW_PAID,
    });
  });

  it('refuses while an unpaid row has an attempt that may still settle (409)', () => {
    expect(
      refusal(() =>
        planRebalance({
          newTotal: D('2500'),
          received: D(0),
          installments: [
            row(1, '1000'),
            row(2, '1000', InstallmentStatus.pending, true),
          ],
        }),
      ),
    ).toMatchObject({
      statusCode: 409,
      errorCode: QUOTE_ERROR.PAYMENT_IN_FLIGHT,
    });
  });

  it('adds one extra installment when every row is paid and the total goes up', () => {
    const plan = planRebalance({
      newTotal: D('2500'),
      received: D('2000'),
      installments: [row(1, '2000', InstallmentStatus.paid)],
    });
    expect(plan.changes).toEqual([]);
    expect(plan.cancelled).toEqual([]);
    expect(plan.extra?.toFixed(3)).toBe('500.000');
  });

  it('cancels the unpaid rows when the new total is exactly what was paid', () => {
    const plan = planRebalance({
      newTotal: D('600'),
      received: D('600'),
      installments: [
        row(1, '600', InstallmentStatus.paid),
        row(2, '700'),
        row(3, '700'),
      ],
    });
    expect(plan.changes).toEqual([]);
    expect(plan.cancelled.map((c) => c.installmentNumber)).toEqual([2, 3]);
    expect(plan.extra).toBeNull();
  });

  it('puts a remainder too small to spread on the first unpaid row', () => {
    const plan = planRebalance({
      newTotal: D('600.002'),
      received: D('600'),
      installments: [
        row(1, '600', InstallmentStatus.paid),
        row(2, '700'),
        row(3, '700'),
        row(4, '700'),
      ],
    });
    expect(plan.changes.map((c) => [c.installmentNumber, c.to.toFixed(3)])).toEqual([
      [2, '0.002'],
    ]);
    expect(plan.cancelled.map((c) => c.installmentNumber)).toEqual([3, 4]);
  });

  it('ignores cancelled rows: they neither carry nor receive anything', () => {
    const plan = planRebalance({
      newTotal: D('1800'),
      received: D('600'),
      installments: [
        row(1, '600', InstallmentStatus.paid),
        row(2, '0', InstallmentStatus.cancelled),
        row(3, '1000'),
      ],
    });
    expect(plan.changes.map((c) => [c.installmentNumber, c.to.toFixed(3)])).toEqual([
      [3, '1200.000'],
    ]);
    expect(plan.cancelled).toEqual([]);
  });

  it('has nothing to do on a quote without a plan yet, or fully paid at the same total', () => {
    const none = { changes: [], cancelled: [], extra: null };
    expect(
      planRebalance({ newTotal: D('2380'), received: D(0), installments: [] }),
    ).toEqual(none);
    expect(
      planRebalance({
        newTotal: D('2000.000'),
        received: D('2000'),
        installments: [row(1, '2000', InstallmentStatus.paid)],
      }),
    ).toEqual(none);
  });
});
