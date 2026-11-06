import { parseSearchAmount } from './amount-search.util';

/** French number formatting groups thousands with a (narrow) no-break space. */
const NNBSP = String.fromCodePoint(0x202f);
const NBSP = String.fromCodePoint(0xa0);

describe('parseSearchAmount', () => {
  it.each([
    ['1500', '1500.000'],
    ['1500.5', '1500.500'],
    ['1500,5', '1500.500'],
    ['1 500,000', '1500.000'],
    [`1${NNBSP}500,250`, '1500.250'],
    [`1${NBSP}500,25`, '1500.250'],
    ['0,750', '0.750'],
    ['350', '350.000'],
    // Copied from the desk, which prints every amount with its currency
    // (formatPrice: "1 500,000 TND").
    [`1${NNBSP}500,000 TND`, '1500.000'],
    ['1500 TND', '1500.000'],
    ['1500TND', '1500.000'],
    ['1500 tnd', '1500.000'],
    ['TND 1500', '1500.000'],
    ['1500 DT', '1500.000'],
    ['1 500,5 dt', '1500.500'],
    ['1500 د.ت', '1500.000'],
    ['  350,000 TND  ', '350.000'],
  ])('reads "%s" as the exact amount %s', (term, amount) => {
    expect(parseSearchAmount(term)?.toFixed(3)).toBe(amount);
  });

  it.each([
    'Sarah',
    'ORA-1500',
    'FAC-000123',
    'TND',
    'DT',
    '1500 EUR',
    '1500 TND 2',
    '1.500,000',
    '1,500.000',
    '1500.0001',
    '-5',
    '1e3',
    '1234567890',
    '',
  ])('"%s" is not an amount', (term) => {
    expect(parseSearchAmount(term)).toBeNull();
  });
});
