/**
 * Centralized price formatting — the single source of truth for every
 * amount shown to a user.
 *
 * Why this exists: the Tunisian payment provider requires all displayed
 * prices to be expressed in the SAME currency as the merchant account.
 * That currency is configured once by the admin at
 * `/account/billing-settings` (`defaultCurrency`, default "TND") and is
 * carried on each priced record (pack price, quote, installment). This
 * helper NEVER invents a currency — the caller always passes the one from
 * the record or from billing settings, so no screen can silently mix
 * EUR / USD / DT / TND.
 *
 * Format: `1 234,500 TND` (fr-FR grouping, 3-decimal precision to match
 * the Tunisian dinar's millime subdivision and the backend PDF/e-mail
 * renderers). The ISO code always trails the number.
 */

/** Fallback merchant currency when a record genuinely carries none. */
export const DEFAULT_MERCHANT_CURRENCY = 'TND';

interface FormatPriceOptions {
  /** Locale used for digit grouping / decimal separator. Default fr-FR. */
  locale?: string;
  /** Fraction digits. Default 3 (TND millimes). */
  fractionDigits?: number;
}

/**
 * Format a monetary amount with its currency code.
 *
 * @param amount   number | numeric string | null | undefined (→ 0)
 * @param currency ISO code from the priced record / billing settings.
 *                 Falls back to TND only when null/blank is passed.
 */
export function formatPrice(
  amount: number | string | null | undefined,
  currency: string | null | undefined = DEFAULT_MERCHANT_CURRENCY,
  options: FormatPriceOptions = {},
): string {
  const { locale = 'fr-FR', fractionDigits = 3 } = options;
  const ccy = (currency ?? '').trim() || DEFAULT_MERCHANT_CURRENCY;

  const num =
    typeof amount === 'number'
      ? amount
      : amount != null && amount !== ''
        ? Number(amount)
        : 0;
  const safe = Number.isFinite(num) ? num : 0;

  const formatted = Math.abs(safe).toLocaleString(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

  // Use a real minus sign for negatives (credits / adjustments).
  return `${safe < 0 ? '−' : ''}${formatted} ${ccy}`;
}
