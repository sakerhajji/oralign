// Run: node --test src/lib/billing/tax-split.test.mjs
// (Node >= 22.18 strips the TypeScript types of the imported module.)
//
// The display mirror of the server's billing maths. Owner decision
// 2026-11-20: prices are TTC (TVA 19 % inside), the droit de timbre is
// ADDED to every payment (each payment has its own facture), and the
// retenue à la source is taken on the TTC without the stamp.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isWithholdingEligible,
  paymentSplitOf,
  previewPlanStamps,
  previewInclusiveInvoice,
  previewInstallmentCharges,
  previewPaymentCharge,
  previewWithholding,
  sumPaymentCharges,
  withholdingIneligibility,
} from './tax-split.ts';

describe('previewPaymentCharge', () => {
  it('adds the stamp and takes the retenue on the TTC alone (owner example)', () => {
    assert.deepEqual(previewPaymentCharge(1000, 1, 1, true), {
      due: 1000,
      stamp: 1,
      total: 1001,
      rate: 1,
      withholding: 10,
      cash: 991,
    });
  });

  it('charges due + stamp when the retenue is not ticked', () => {
    const c = previewPaymentCharge(1000, 1, 1, false);
    assert.equal(c.withholding, 0);
    assert.equal(c.rate, 0);
    assert.equal(c.cash, 1001);
    assert.equal(c.total, 1001);
  });

  it('charges no stamp on nothing due', () => {
    assert.deepEqual(previewPaymentCharge(0, 1, 1, true), {
      due: 0,
      stamp: 0,
      total: 0,
      rate: 0,
      withholding: 0,
      cash: 0,
    });
  });

  it('rounds the retenue half-up to the millime', () => {
    // 333.335 x 1 % = 3.33335 -> 3.333
    const c = previewPaymentCharge(333.335, 1, 1, true);
    assert.equal(c.withholding, 3.333);
    assert.equal(c.cash, 331.002);
  });

  it('reads decimal strings as the API sends them', () => {
    const c = previewPaymentCharge('346.500', '1.000', '1', true);
    assert.equal(c.withholding, 3.465);
    assert.equal(c.cash, 344.035);
  });
});

describe('previewInstallmentCharges', () => {
  it('gives each installment its own stamp and its own retenue', () => {
    const c = previewInstallmentCharges(['333.333', '333.333', '333.334'], 1, 1, true);
    assert.equal(c.count, 3);
    assert.equal(c.due, 1000);
    assert.equal(c.stamp, 3);
    assert.equal(c.total, 1003);
    // 3.333 three times, never round(1000 x 1 %) = 10.
    assert.equal(c.withholding, 9.999);
    assert.equal(c.cash, 993.001);
    assert.equal(c.rate, 1);
  });

  it('is the single payment when there is one installment', () => {
    const one = previewInstallmentCharges([1000], 1, 1, true);
    const { count, smallestDue, ...rest } = one;
    assert.equal(count, 1);
    assert.equal(smallestDue, 1000);
    assert.deepEqual(rest, previewPaymentCharge(1000, 1, 1, true));
  });

  it('skips empty installments (no stamp, not counted)', () => {
    const c = previewInstallmentCharges([500, undefined, 0], 1, 0, false);
    assert.equal(c.count, 1);
    assert.equal(c.stamp, 1);
    assert.equal(c.cash, 501);
  });

  it('sums previews without float drift', () => {
    const c = sumPaymentCharges([
      previewPaymentCharge(0.1, 0.2, 0, false),
      previewPaymentCharge(0.2, 0.1, 0, false),
    ]);
    assert.equal(c.cash, 0.6);
    assert.equal(c.total, 0.6);
  });
});

describe('previewInclusiveInvoice', () => {
  it('prints the owner example facture', () => {
    const r = previewInclusiveInvoice([{ quantity: 1, unitPriceTtc: 1000 }], 19, 0, 1, 1);
    assert.equal(r.subTotalHt, 840.336);
    assert.equal(r.tvaAmount, 159.664);
    assert.equal(r.stamp, 1);
    assert.equal(r.totalTtc, 1001);
    assert.equal(r.withholdingAmount, 10);
    assert.equal(r.netPayable, 991);
  });

  it('takes the retenue on the TTC after the remise, stamp excluded', () => {
    const r = previewInclusiveInvoice([{ quantity: 2, unitPriceTtc: 600 }], 19, 200, 1, 1);
    assert.equal(r.grossTtc, 1200);
    assert.equal(r.discountApplied, 200);
    assert.equal(r.totalTtc, 1001);
    assert.equal(r.withholdingAmount, 10);
    assert.equal(r.netPayable, 991);
  });

  it('adds no stamp to an empty invoice', () => {
    const r = previewInclusiveInvoice([{ quantity: 1, unitPriceTtc: 0 }], 19, 0, 1, 1);
    assert.equal(r.stamp, 0);
    assert.equal(r.totalTtc, 0);
    assert.equal(r.netPayable, 0);
  });
});

describe('previewWithholding', () => {
  it('leaves the amount whole when off', () => {
    assert.deepEqual(previewWithholding(1000, 1, false), { rate: 0, due: 1000, amount: 0, net: 1000 });
  });
});

describe('paymentSplitOf', () => {
  it('settles cash + retenue - stamp', () => {
    assert.deepEqual(paymentSplitOf('991.000', '10.000', '1.000'), {
      settled: 1000,
      stamp: 1,
      withholding: 10,
      cash: 991,
    });
  });

  it('reads a payment made before the stamp was added (stamp 0)', () => {
    assert.equal(paymentSplitOf(990, 10, 0).settled, 1000);
  });

  it("prefers the API's settled amount when it sends one", () => {
    assert.equal(paymentSplitOf(991, 10, 1, '1000.000').settled, 1000);
    assert.equal(paymentSplitOf(1001, 0, 1, null).settled, 1000);
  });
});

describe('previewPlanStamps', () => {
  it('adds one stamp per payment of the plan', () => {
    assert.deepEqual(previewPlanStamps('3000.000', 3, 1), {
      count: 3,
      stampEach: 1,
      stamps: 3,
      total: 3003,
    });
  });

  it('adds nothing without a stamp or a payment', () => {
    assert.equal(previewPlanStamps(3000, 3, 0).total, 3000);
    assert.equal(previewPlanStamps(3000, 0, 1).stamps, 0);
  });
});

describe('withholdingIneligibility (mirror of the server rule)', () => {
  const on = { enabled: true, rate: 1, threshold: 1000 };

  it('is eligible at the threshold and above, to the millime', () => {
    assert.equal(withholdingIneligibility(1000, on), null);
    assert.equal(withholdingIneligibility('1000.000', on), null);
    assert.equal(withholdingIneligibility(2380, on), null);
    assert.equal(isWithholdingEligible(1000, on), true);
  });

  it('is below the threshold one millime under it', () => {
    assert.equal(withholdingIneligibility(999.999, on), 'below_threshold');
    // A 2 380 devis in 3 x 793.333: each payment is its own base.
    assert.equal(withholdingIneligibility('793.333', on), 'below_threshold');
    assert.equal(isWithholdingEligible(999.999, on), false);
  });

  it('is disabled when switched off or without a rate, whatever the amount', () => {
    for (const rule of [
      { ...on, enabled: false },
      { ...on, enabled: null },
      { ...on, enabled: undefined },
      { ...on, rate: 0 },
      { ...on, rate: null },
      { ...on, rate: -1 },
    ]) {
      assert.equal(withholdingIneligibility(5000, rule), 'disabled');
      assert.equal(withholdingIneligibility(10, rule), 'disabled');
    }
  });

  it('has no threshold when none is given; 0 lets every payment through', () => {
    assert.equal(withholdingIneligibility(10, { enabled: true, rate: 1, threshold: null }), null);
    assert.equal(withholdingIneligibility(10, { enabled: true, rate: 1 }), null);
    assert.equal(withholdingIneligibility(0.001, { ...on, threshold: 0 }), null);
  });

  it('reads decimal strings as the API sends them', () => {
    assert.equal(withholdingIneligibility('1000.000', { enabled: true, rate: '1.00', threshold: '1000.000' }), null);
    assert.equal(
      withholdingIneligibility('999.999', { enabled: true, rate: '1', threshold: '1000' }),
      'below_threshold',
    );
  });
});

describe('sumPaymentCharges smallestDue', () => {
  it('is the smallest counted due, so one choice for all only when it qualifies', () => {
    const c = previewInstallmentCharges(['1200', '793.333', 0, '1500'], 1, 1, false);
    assert.equal(c.count, 3);
    assert.equal(c.smallestDue, 793.333);
    assert.equal(isWithholdingEligible(c.smallestDue, { enabled: true, rate: 1, threshold: 1000 }), false);
  });

  it('is 0 without any payment', () => {
    assert.equal(sumPaymentCharges([]).smallestDue, 0);
    assert.equal(previewInstallmentCharges([0, null], 1, 1, true).smallestDue, 0);
  });
});
