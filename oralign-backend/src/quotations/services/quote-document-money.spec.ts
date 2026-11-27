import { Prisma } from '@prisma/client';
import {
  estimateQuoteWithholding,
  quoteBalance,
  quotePaymentBases,
  quoteWithholdingRule,
} from './quote-document-money';

const D = (v: string | number) => new Prisma.Decimal(v);
const ON = { enabled: true, rate: 1, threshold: 1000 };

describe('quoteWithholdingRule (the rule a devis states)', () => {
  it('the three keys the snapshot froze at send time win over the live rule', () => {
    expect(
      quoteWithholdingRule(
        {
          withholdingEnabled: true,
          withholdingRate: 1.5,
          withholdingThreshold: 2000,
        },
        { enabled: false, rate: 1, threshold: 1000 },
      ),
    ).toEqual({ enabled: true, rate: 1.5, threshold: 2000 });
  });

  it('a snapshot frozen switched off stays off, whatever the live switch', () => {
    expect(
      quoteWithholdingRule(
        {
          withholdingEnabled: false,
          withholdingRate: 1,
          withholdingThreshold: 1000,
        },
        ON,
      )?.enabled,
    ).toBe(false);
  });

  it('a snapshot taken before 2026-11-27 (no keys) reads the live rule', () => {
    expect(
      quoteWithholdingRule({ companyName: 'Oralign', stampDuty: 1 }, ON),
    ).toBe(ON);
    expect(quoteWithholdingRule(null, ON)).toBe(ON);
    expect(quoteWithholdingRule(null, null)).toBeNull();
  });

  it('a malformed amount reads as none, never as a number', () => {
    expect(
      quoteWithholdingRule(
        {
          withholdingEnabled: true,
          withholdingRate: 'x',
          withholdingThreshold: {},
        },
        null,
      ),
    ).toEqual({ enabled: true, rate: null, threshold: null });
  });
});

describe('quotePaymentBases', () => {
  it('every planned installment, or the whole total while there is no plan', () => {
    expect(quotePaymentBases([1190, '1190.000'], 2380).map(String)).toEqual([
      '1190',
      '1190',
    ]);
    expect(quotePaymentBases([], 2380).map(String)).toEqual(['2380']);
  });
});

describe('estimateQuoteWithholding (« Retenue si appliquée »)', () => {
  it('no plan: the rate on the total, when the total reaches the threshold', () => {
    const estimate = estimateQuoteWithholding([D('2380')], ON);
    expect(estimate).toMatchObject({ eligiblePayments: 1, payments: 1 });
    expect(estimate?.amount.toFixed(3)).toBe('23.800');
    expect(estimate?.rate.toFixed(2)).toBe('1.00');
    expect(estimate?.threshold?.toFixed(3)).toBe('1000.000');
  });

  it('each payment is its own base: 3 x 793,333 never reaches 1 000 (no row)', () => {
    expect(
      estimateQuoteWithholding([D('793.334'), D('793.333'), D('793.333')], ON),
    ).toBeNull();
  });

  it('only the installments at or above the threshold count', () => {
    const estimate = estimateQuoteWithholding(
      [D('1000'), D('999.999'), D('1380')],
      ON,
    );
    expect(estimate).toMatchObject({ eligiblePayments: 2, payments: 3 });
    // 10.000 + 13.800.
    expect(estimate?.amount.toFixed(3)).toBe('23.800');
  });

  it('switched off, a rate of 0 or no rule at all: no estimate', () => {
    expect(
      estimateQuoteWithholding([D('5000')], { ...ON, enabled: false }),
    ).toBeNull();
    expect(
      estimateQuoteWithholding([D('5000')], { ...ON, rate: 0 }),
    ).toBeNull();
    expect(estimateQuoteWithholding([D('5000')], null)).toBeNull();
  });

  it('no threshold (or 0): every payment qualifies', () => {
    const estimate = estimateQuoteWithholding([D('100'), D('50')], {
      enabled: true,
      rate: 1,
      threshold: null,
    });
    expect(estimate?.amount.toFixed(3)).toBe('1.500');
    expect(estimate?.threshold).toBeNull();
    expect(
      estimateQuoteWithholding([D('100')], {
        enabled: true,
        rate: 1,
        threshold: 0,
      })?.amount.toFixed(3),
    ).toBe('1.000');
  });

  it('empty or zero installments are no payments', () => {
    expect(estimateQuoteWithholding([D('0')], ON)).toBeNull();
    expect(estimateQuoteWithholding([], ON)).toBeNull();
  });
});

describe('quoteBalance (« Déjà réglé / Reste à payer »)', () => {
  it('nothing received: no rows', () => {
    expect(quoteBalance(2380, 0)).toBeNull();
  });

  it('what was settled, and what the devis still asks for', () => {
    const balance = quoteBalance(D('2380'), D('1000'));
    expect(balance?.paid.toFixed(3)).toBe('1000.000');
    expect(balance?.remaining.toFixed(3)).toBe('1380.000');
  });

  it('the settlement tolerance: a millime short is fully paid', () => {
    expect(quoteBalance(2380, D('2379.999'))?.remaining.toFixed(3)).toBe(
      '0.000',
    );
  });
});
