import { Prisma } from '@prisma/client';
import { toAmount } from '../../common/billing/tax-split';

/**
 * The practitioner's pack catalogue (GET doctor/dashboard/available-packs).
 *
 * Read-only projection of the active packs: it never changes a pack rule,
 * a price or what a quote snapshots. Prices are the active PackPrice rows,
 * TTC (VAT included), shown as they are; the pack that applies to a case is
 * still the one an admin attaches to its quote.
 */

/** Only the columns the catalogue shows, plus the active prices. */
export const AVAILABLE_PACK_SELECT = {
  id: true,
  name: true,
  description: true,
  nameI18n: true,
  descriptionI18n: true,
  treatmentExpirationLabel: true,
  finishingIncludedLabel: true,
  treatmentValidityMonths: true,
  maxStepsPerArch: true,
  includedCorrections: true,
  isUnlimitedSteps: true,
  isUnlimitedCorrections: true,
  isForOrthodontists: true,
  prices: {
    where: { isActive: true },
    select: { archType: true, price: true, currency: true },
  },
} satisfies Prisma.PackSelect;

export type AvailablePackRow = Prisma.PackGetPayload<{
  select: typeof AVAILABLE_PACK_SELECT;
}>;

/** A display text in the dashboard languages; French is the fallback. */
export interface LocalizedText {
  fr?: string;
  en?: string;
}

export interface AvailablePackDto {
  id: string;
  /** French / legacy plain columns, kept for older readers. */
  name: string;
  description: string | null;
  nameI18n: LocalizedText | null;
  descriptionI18n: LocalizedText | null;
  /** Display text of the treatment validity ("2 ans"). Never parsed. */
  treatmentExpirationLabel: LocalizedText | null;
  finishingIncludedLabel: LocalizedText | null;
  /** Coverage window in months; the validity shown when no label is set. */
  treatmentValidityMonths: number | null;
  maxStepsPerArch: number | null;
  includedCorrections: number | null;
  isUnlimitedSteps: boolean;
  isUnlimitedCorrections: boolean;
  isForOrthodontists: boolean;
  /** TTC, null when the pack does not offer that arch. */
  priceTwoArches: number | null;
  priceSingleArch: number | null;
  /** Previous frontend release only: remove once it is gone. */
  price: number;
  currency: string;
  isCurrent: boolean;
}

const LANGS = ['fr', 'en'] as const;

/**
 * A `Localized<string>` JSON bag reduced to its non-blank French and English
 * strings. Any other key or value type is dropped, so the response carries
 * nothing but display text. A bare JSON string (legacy shape) reads as
 * French. Null when no usable text is left.
 */
export function localizedText(
  value: Prisma.JsonValue | null | undefined,
): LocalizedText | null {
  if (typeof value === 'string') {
    const text = value.trim();
    return text ? { fr: text } : null;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const bag: LocalizedText = {};
  for (const lang of LANGS) {
    const text = value[lang];
    if (typeof text === 'string' && text.trim()) bag[lang] = text.trim();
  }
  return bag.fr !== undefined || bag.en !== undefined ? bag : null;
}

/** The active price of one arch, as a 3-decimal amount; null when absent. */
function archPrice(
  prices: AvailablePackRow['prices'],
  archType: 'two_arches' | 'single_arch',
): number | null {
  const row = prices.find((price) => price.archType === archType);
  return row ? toAmount(row.price) : null;
}

export function toAvailablePack(
  pack: AvailablePackRow,
  currentPackId: string | null,
): AvailablePackDto {
  const priceTwoArches = archPrice(pack.prices, 'two_arches');
  const priceSingleArch = archPrice(pack.prices, 'single_arch');
  return {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    nameI18n: localizedText(pack.nameI18n),
    descriptionI18n: localizedText(pack.descriptionI18n),
    treatmentExpirationLabel: localizedText(pack.treatmentExpirationLabel),
    finishingIncludedLabel: localizedText(pack.finishingIncludedLabel),
    treatmentValidityMonths: pack.treatmentValidityMonths,
    maxStepsPerArch: pack.maxStepsPerArch,
    includedCorrections: pack.includedCorrections,
    isUnlimitedSteps: pack.isUnlimitedSteps,
    isUnlimitedCorrections: pack.isUnlimitedCorrections,
    isForOrthodontists: pack.isForOrthodontists,
    priceTwoArches,
    priceSingleArch,
    price: priceTwoArches ?? priceSingleArch ?? 0,
    currency: pack.prices[0]?.currency ?? 'TND',
    isCurrent: currentPackId !== null && currentPackId === pack.id,
  };
}
