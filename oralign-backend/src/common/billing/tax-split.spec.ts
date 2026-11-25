import {
  computeWithholding,
  paymentCharge,
  percentOf,
  inclusiveInvoiceTotals,
  resolveTvaRate,
  splitInclusive,
  spreadProportionally,
  toAmount,
} from './tax-split';

const n = toAmount;

describe('tax-split', () => {
  describe('splitInclusive', () => {
    it('splits a pack price with the stamp included', () => {
      const s = splitInclusive(3030.5, 19, 1);
      expect(n(s.stamp)).toBe(1);
      expect(n(s.ht)).toBe(2545.798);
      expect(n(s.tva)).toBe(483.702);
      expect(n(s.ht.plus(s.tva).plus(s.stamp))).toBe(3030.5);
    });

    it('splits without a stamp (a devis)', () => {
      const s = splitInclusive(3030.5, 19);
      expect(n(s.ht)).toBe(2546.639);
      expect(n(s.tva)).toBe(483.861);
    });

    it('stays exact for every amount between 1 and 5000 TND', () => {
      for (let millimes = 1000; millimes <= 5_000_000; millimes += 997) {
        const total = millimes / 1000;
        const s = splitInclusive(total, 19, 1);
        expect(n(s.ht.plus(s.tva).plus(s.stamp))).toBe(total);
        expect(s.tva.isNegative()).toBe(false);
      }
    });

    it('never carves out more stamp than the amount', () => {
      const s = splitInclusive(0.5, 19, 1);
      expect(n(s.stamp)).toBe(0.5);
      expect(n(s.ht)).toBe(0);
      expect(n(s.tva)).toBe(0);
    });

    it('handles a zero rate', () => {
      const s = splitInclusive(100, 0, 1);
      expect(n(s.ht)).toBe(99);
      expect(n(s.tva)).toBe(0);
    });
  });

  describe('percentOf', () => {
    it('takes a percentage of the gross, half-up to the millime', () => {
      expect(n(percentOf(3690, 10))).toBe(369);
      expect(n(percentOf(1234.567, 7.5))).toBe(92.593);
    });
    it('never exceeds the gross nor goes negative', () => {
      expect(n(percentOf(500, 150))).toBe(500);
      expect(n(percentOf(500, -5))).toBe(0);
    });
  });

  describe('computeWithholding', () => {
    it('takes 1 % of the amount due and leaves the rest to pay', () => {
      const w = computeWithholding(1515.25, 1);
      expect(n(w.amount)).toBe(15.153);
      expect(n(w.net)).toBe(1500.097);
      expect(n(w.net.plus(w.amount))).toBe(1515.25);
    });

    it('is "not applied" for a missing or zero rate', () => {
      for (const rate of [null, undefined, 0, '0']) {
        const w = computeWithholding(300, rate);
        expect(w.rate).toBeNull();
        expect(n(w.amount)).toBe(0);
        expect(n(w.net)).toBe(300);
      }
    });

    it('never produces a zero net', () => {
      const w = computeWithholding(10, 100);
      expect(w.net.greaterThan(0)).toBe(true);
    });
  });

  describe('resolveTvaRate', () => {
    it('keeps a stored rate above 0', () => {
      expect(resolveTvaRate(7, 19)).toBe(7);
    });
    it('falls back to the company rate for 0 or null', () => {
      expect(resolveTvaRate(0, 19)).toBe(19);
      expect(resolveTvaRate(null, 19)).toBe(19);
      expect(resolveTvaRate(undefined, undefined)).toBe(19);
    });
  });

  describe('spreadProportionally', () => {
    it('adds up exactly', () => {
      const parts = spreadProportionally(100, [1, 1, 1]);
      expect(parts.map(n)).toEqual([33.333, 33.333, 33.334]);
    });
    it('gives nothing to zero weights', () => {
      const parts = spreadProportionally(10, [0, 5, 0]);
      expect(parts.map(n)).toEqual([0, 10, 0]);
    });
  });

  describe('paymentCharge', () => {
    it('adds the stamp and takes the retenue on the TTC', () => {
      const c = paymentCharge(1000, 1, 1);
      expect(n(c.due)).toBe(1000);
      expect(n(c.stamp)).toBe(1);
      expect(n(c.total)).toBe(1001);
      expect(n(c.withholding)).toBe(10);
      expect(n(c.cash)).toBe(991);
      // What the payment settles on the devis is the installment itself.
      expect(n(c.cash.plus(c.withholding).minus(c.stamp))).toBe(1000);
    });

    it('charges due + stamp without a retenue', () => {
      const c = paymentCharge(1690, 1, null);
      expect(c.withholdingRate).toBeNull();
      expect(n(c.cash)).toBe(1691);
    });

    it('adds no stamp to nothing', () => {
      expect(n(paymentCharge(0, 1, 1).cash)).toBe(0);
    });
  });

  describe('inclusiveInvoiceTotals', () => {
    it('matches the automatic invoice of one payment: the stamp is added', () => {
      const t = inclusiveInvoiceTotals([{ quantity: 1, unitPriceTtc: 1515.25 }], 19, 0, 1);
      expect(n(t.subTotalHt)).toBe(1273.319);
      expect(n(t.tvaAmount)).toBe(241.931);
      expect(n(t.stamp)).toBe(1);
      expect(n(t.totalTtc)).toBe(1516.25);
      expect(n(t.subTotalHt.plus(t.tvaAmount).plus(t.stamp))).toBe(1516.25);
      expect(n(t.netPayable)).toBe(1516.25);
    });

    it('splits a treatment fee and its CBCT supplement', () => {
      const t = inclusiveInvoiceTotals(
        [
          { quantity: 1, unitPriceTtc: 300 },
          { quantity: 1, unitPriceTtc: 50 },
        ],
        19,
        0,
        1,
        1,
      );
      expect(n(t.totalTtc)).toBe(351);
      expect(n(t.lineHt[0].plus(t.lineHt[1]))).toBe(n(t.subTotalHt));
      expect(n(t.subTotalHt.plus(t.tvaAmount))).toBe(350);
      expect(n(t.subTotalHt.plus(t.tvaAmount).plus(t.stamp))).toBe(351);
      // The retenue is on the TTC, never on the stamp.
      expect(n(t.withholdingAmount)).toBe(3.5);
      expect(n(t.netPayable)).toBe(347.5);
    });

    it('applies a TTC discount, then adds the stamp', () => {
      const t = inclusiveInvoiceTotals([{ quantity: 2, unitPriceTtc: 100 }], 19, 50, 1);
      expect(n(t.grossTtc)).toBe(200);
      expect(n(t.discountApplied)).toBe(50);
      expect(n(t.totalTtc)).toBe(151);
      expect(n(t.subTotalHt.plus(t.tvaAmount))).toBe(150);
      expect(n(t.subTotalHt.plus(t.tvaAmount).plus(t.stamp))).toBe(151);
      expect(n(t.unitHt[0])).toBe(n(t.lineHt[0].div(2)));
    });

    it('clamps a discount larger than the gross', () => {
      const t = inclusiveInvoiceTotals([{ quantity: 1, unitPriceTtc: 80 }], 19, 500, 1);
      expect(n(t.discountApplied)).toBe(80);
      expect(n(t.totalTtc)).toBe(0);
      expect(n(t.stamp)).toBe(0);
    });

    it('keeps mixed rates exact', () => {
      const t = inclusiveInvoiceTotals(
        [
          { quantity: 1, unitPriceTtc: 119 },
          { quantity: 1, unitPriceTtc: 107, tvaRate: 7 },
        ],
        19,
        0,
        0,
      );
      expect(n(t.lineHt[0])).toBe(100);
      expect(n(t.lineHt[1])).toBe(100);
      expect(n(t.tvaAmount)).toBe(26);
    });
  });
});
