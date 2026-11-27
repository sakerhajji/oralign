import { Prisma } from '@prisma/client';
import { quoteRemainingAfter, type SettledQuotePayment } from './quote-balance';

const at = (day: number) => new Date(Date.UTC(2026, 10, day, 10, 0, 0));
const pay = (
  id: string,
  settled: string,
  day: number,
): SettledQuotePayment => ({
  id,
  settled: new Prisma.Decimal(settled),
  at: at(day),
});

describe('quoteRemainingAfter (the facture’s "Reste à payer", frozen at issue)', () => {
  const p1 = pay('p-1', '793.334', 1);
  const p2 = pay('p-2', '793.333', 5);
  const p3 = pay('p-3', '793.333', 9);

  it('total minus every payment up to and including this one', () => {
    expect(quoteRemainingAfter('2380.000', [p1, p2, p3], p1).toFixed(3)).toBe(
      '1586.666',
    );
    expect(quoteRemainingAfter('2380.000', [p1, p2, p3], p2).toFixed(3)).toBe(
      '793.333',
    );
  });

  it('the last installment leaves nothing to pay', () => {
    expect(quoteRemainingAfter('2380.000', [p1, p2, p3], p3).toFixed(3)).toBe(
      '0.000',
    );
  });

  it('a facture minted later never counts the payments made after its own', () => {
    // p-1 invoiced after p-3 settled (backfill): still the balance after p-1.
    expect(quoteRemainingAfter('2380.000', [p3, p2, p1], p1).toFixed(3)).toBe(
      '1586.666',
    );
  });

  it('the current payment counts once, listed or not', () => {
    expect(quoteRemainingAfter('2380.000', [], p1).toFixed(3)).toBe('1586.666');
    expect(quoteRemainingAfter('2380.000', [p1, p1], p1).toFixed(3)).toBe(
      '1586.666',
    );
  });

  it('payments at the same instant are ordered by id', () => {
    const a = pay('a', '1000.000', 3);
    const b = pay('b', '1000.000', 3);
    expect(quoteRemainingAfter('2380.000', [a, b], a).toFixed(3)).toBe(
      '1380.000',
    );
    expect(quoteRemainingAfter('2380.000', [a, b], b).toFixed(3)).toBe(
      '380.000',
    );
  });

  it('one millime short of the total settles (same tolerance as the devis), never negative', () => {
    expect(
      quoteRemainingAfter('2380.000', [], pay('x', '2379.999', 1)).toFixed(3),
    ).toBe('0.000');
    expect(
      quoteRemainingAfter('2380.000', [], pay('x', '3000.000', 1)).toFixed(3),
    ).toBe('0.000');
  });
});
