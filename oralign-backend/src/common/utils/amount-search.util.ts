import { Prisma } from '@prisma/client';

/** Up to 9 digits of dinars and 3 of millimes: what a Decimal(12, 3) can hold. */
const AMOUNT = /^\d{1,9}(\.\d{1,3})?$/;

/**
 * The dinar written before or after an amount: the ISO code the desk
 * prints ("1 500,000 TND"), or the abbreviations people type (DT, د.ت).
 */
const CURRENCY = /^\s*(?:TND|DT|د\.ت)|(?:TND|DT|د\.ت)\s*$/gi;

/**
 * The amount a search term names, or null when it is not one. Reads the
 * ways people type or copy an amount: "1500", "1500.5", "1500,5",
 * "1 500,000", "1 500,000 TND", "1500 DT" (spaces, including the narrow
 * no-break space of French number formatting, group the thousands; a
 * comma or a dot marks the millimes; the currency may stand on either
 * side). Compared as an exact Decimal, never as a float.
 */
export function parseSearchAmount(term: string): Prisma.Decimal | null {
  const compact = term
    .trim()
    .replace(CURRENCY, '')
    .replace(/\s/g, '')
    .replace(',', '.');
  return AMOUNT.test(compact) ? new Prisma.Decimal(compact) : null;
}
