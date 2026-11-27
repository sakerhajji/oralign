// Run: node --test src/components/orders/quote-retenue-estimate.test.mjs
// (Node >= 22.18 strips the TypeScript types of the imported module.)
//
// The devis' « Retenue si appliquée » as the admin quote summary previews
// it; the same cases as the server's quote-document-money.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  estimateQuoteRetenue,
  quotePaymentBases,
  quoteRetenueRule,
} from './quote-retenue-estimate.ts';

const ON = { enabled: true, rate: 1, threshold: 1000 };

describe('quoteRetenueRule', () => {
  it('a sent devis reads the rule its snapshot froze', () => {
    assert.deepEqual(
      quoteRetenueRule(
        { withholdingEnabled: true, withholdingRate: 1.5, withholdingThreshold: 2000 },
        { enabled: false, rate: 1, threshold: 1000 },
        false,
      ),
      { enabled: true, rate: 1.5, threshold: 2000 },
    );
  });

  it('frozen switched off stays off', () => {
    assert.equal(
      quoteRetenueRule({ withholdingEnabled: false, withholdingRate: 1 }, ON, false)?.enabled,
      false,
    );
  });

  it('an older snapshot, or a draft, reads the live rule', () => {
    assert.equal(quoteRetenueRule({ companyName: 'Oralign' }, ON, false), ON);
    assert.equal(quoteRetenueRule(null, ON, false), ON);
    assert.equal(
      quoteRetenueRule({ withholdingEnabled: false, withholdingRate: 1 }, ON, true),
      ON,
    );
  });

  it('a threshold of 0 (or malformed) is no threshold', () => {
    assert.equal(
      quoteRetenueRule(
        { withholdingEnabled: true, withholdingRate: '1', withholdingThreshold: 0 },
        null,
        false,
      )?.threshold,
      null,
    );
    assert.deepEqual(
      quoteRetenueRule(
        { withholdingEnabled: true, withholdingRate: 'x', withholdingThreshold: {} },
        null,
        false,
      ),
      { enabled: true, rate: 0, threshold: null },
    );
  });
});

describe('quotePaymentBases', () => {
  it('the installments, or the whole total without a plan', () => {
    assert.deepEqual(quotePaymentBases([1190, '1190.000'], 2380), [1190, 1190]);
    assert.deepEqual(quotePaymentBases([], 2380), [2380]);
  });
});

describe('estimateQuoteRetenue', () => {
  it('no plan: 1 % of the total when it reaches the threshold', () => {
    assert.deepEqual(estimateQuoteRetenue([2380], ON), {
      rate: 1,
      amount: 23.8,
      eligiblePayments: 1,
      payments: 1,
      threshold: 1000,
    });
  });

  it('each payment is its own base: 3 x 793,333 never reaches 1 000', () => {
    assert.equal(estimateQuoteRetenue([793.334, 793.333, 793.333], ON), null);
  });

  it('at the threshold exactly it applies; a millime under, it does not', () => {
    const estimate = estimateQuoteRetenue([1000, 999.999, 1380], ON);
    assert.equal(estimate?.eligiblePayments, 2);
    assert.equal(estimate?.payments, 3);
    assert.equal(estimate?.amount, 23.8);
  });

  it('switched off, rate 0, no rule: nothing', () => {
    assert.equal(estimateQuoteRetenue([5000], { ...ON, enabled: false }), null);
    assert.equal(estimateQuoteRetenue([5000], { ...ON, rate: 0 }), null);
    assert.equal(estimateQuoteRetenue([5000], null), null);
  });

  it('no threshold: every payment qualifies; rounding is half-up to the millime', () => {
    assert.equal(
      estimateQuoteRetenue([100, 50], { enabled: true, rate: 1, threshold: null })?.amount,
      1.5,
    );
    // 1.5 % of 1 234,567 = 18,51850 -> 18,519.
    assert.equal(
      estimateQuoteRetenue([1234.567], { enabled: true, rate: 1.5, threshold: null })?.amount,
      18.519,
    );
  });

  it('empty or zero payments: nothing', () => {
    assert.equal(estimateQuoteRetenue([], ON), null);
    assert.equal(estimateQuoteRetenue([0], ON), null);
  });
});
