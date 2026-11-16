import type { Lang } from '@/lib/i18n/dict';
import type { SupplementalToothContact } from '@/lib/types';
import { formatBusinessDay } from '@/lib/utils/business-day';
import { roundContactAmount } from './tooth-details';

const LOCALE: Record<Lang, string> = { fr: 'fr-FR', en: 'en-US' };

/** "13, 23" — FDI numbers in ascending order. */
export function formatTeeth(toothNumbers: readonly number[]): string {
  return [...toothNumbers].sort((a, b) => a - b).join(', ');
}

/** "0,2" / "0.2" — up to two decimals, no trailing zeros. */
export function formatMm(amountMm: number, lang: Lang): string {
  return new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: 2 }).format(amountMm);
}

/** "11–21 : 0,2 mm" (French spacing) / "11–21: 0.2 mm". */
export function formatContact(contact: SupplementalToothContact, lang: Lang): string {
  const separator = lang === 'fr' ? ' : ' : ': ';
  return `${contact.fromTooth}–${contact.toTooth}${separator}${formatMm(contact.amountMm, lang)} mm`;
}

/**
 * A millimetre amount typed in the odontogram's contact popover, rounded
 * to the two decimals the server stores ("0.125" → 0.13); `null` when
 * blank or not a number. Range checks are the caller's.
 */
export function parseMm(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const amount = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(amount) ? roundContactAmount(amount) : null;
}

/** An ISO instant as its business day ("28 juil. 2025"), or null. */
export function formatDay(iso: string | null | undefined, lang: Lang): string | null {
  return iso ? formatBusinessDay(iso, lang) : null;
}

/** A whole number typed in a numeric input; `null` when blank or invalid. */
export function parseWholeNumber(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.trunc(value) : null;
}
