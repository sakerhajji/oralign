/**
 * What a pack card of the practitioner catalogue says, as data: the name
 * and description in the UI language, and the facts line by line (steps,
 * corrections, validity) as `dashboard.packs.*` keys with their params.
 *
 * Pure (no React, no runtime import) so `node --test` runs it directly:
 *   node --test src/components/dashboard/pack-card-facts.test.mjs
 * The language pick is injected (`pickLocalized` bound to the UI language)
 * so FR fallback stays in one place.
 */

/** A `Localized<string>` bag, or the legacy plain string. */
export type LocalizedValue =
  | Partial<Record<'en' | 'fr', string>>
  | string
  | null
  | undefined;

/** The text of `value` in the UI language (French fallback). */
export type PickText = (value: LocalizedValue) => string;

export interface PackTextSource {
  name: string;
  description?: string | null;
  nameI18n?: Partial<Record<'en' | 'fr', string>> | null;
  descriptionI18n?: Partial<Record<'en' | 'fr', string>> | null;
}

export interface PackFactSource {
  isUnlimitedSteps?: boolean | null;
  maxStepsPerArch?: number | null;
  isUnlimitedCorrections?: boolean | null;
  includedCorrections?: number | null;
  treatmentExpirationLabel?: Partial<Record<'en' | 'fr', string>> | null;
  treatmentValidityMonths?: number | null;
}

export type PackFactKind = 'steps' | 'corrections' | 'validity';

export interface PackFact {
  kind: PackFactKind;
  /** A `dashboard.packs.*` dictionary key. */
  key: string;
  params?: Record<string, string | number>;
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

const text = (pick: PickText, value: LocalizedValue): string => {
  const picked = pick(value);
  return typeof picked === 'string' ? picked.trim() : '';
};

/** The localized name; never empty (falls back to the plain FR name). */
export function packCardName(pack: PackTextSource, pick: PickText): string {
  return text(pick, pack.nameI18n ?? pack.name) || pack.name;
}

/** The localized description, or null when the pack has none. */
export function packCardDescription(
  pack: PackTextSource,
  pick: PickText,
): string | null {
  return text(pick, pack.descriptionI18n ?? pack.description ?? null) || null;
}

/** "30 steps per arch", or nothing when the pack sets no number. */
export function packStepsFact(pack: PackFactSource): PackFact | null {
  if (pack.isUnlimitedSteps) {
    return { kind: 'steps', key: 'dashboard.packs.featureUnlimitedSteps' };
  }
  const count = pack.maxStepsPerArch;
  if (!isCount(count)) return null;
  return {
    kind: 'steps',
    key:
      count === 1
        ? 'dashboard.packs.featureStepPerArch'
        : 'dashboard.packs.featureStepsPerArch',
    params: { count },
  };
}

/**
 * The included corrections, from the numeric business value (owner
 * default: the catalogue shows the count, not the finishing label).
 * Zero is a real fact ("no correction included"); null is unknown.
 */
export function packCorrectionsFact(pack: PackFactSource): PackFact | null {
  if (pack.isUnlimitedCorrections) {
    return {
      kind: 'corrections',
      key: 'dashboard.packs.featureUnlimitedCorrections',
    };
  }
  const count = pack.includedCorrections;
  if (count === 0) {
    return { kind: 'corrections', key: 'dashboard.packs.featureNoCorrection' };
  }
  if (!isCount(count)) return null;
  return {
    kind: 'corrections',
    key:
      count === 1
        ? 'dashboard.packs.featureIncludedCorrection'
        : 'dashboard.packs.featureIncludedCorrections',
    params: { count },
  };
}

/**
 * The validity: the admin's display label first ("2 ans", never parsed),
 * the coverage months as the fallback, nothing when neither is set.
 */
export function packValidityFact(
  pack: PackFactSource,
  pick: PickText,
): PackFact | null {
  const label = text(pick, pack.treatmentExpirationLabel ?? null);
  if (label) {
    return {
      kind: 'validity',
      key: 'dashboard.packs.featureValidity',
      params: { period: label },
    };
  }
  const months = pack.treatmentValidityMonths;
  if (!isCount(months)) return null;
  return {
    kind: 'validity',
    key:
      months === 1
        ? 'dashboard.packs.featureValidityMonth'
        : 'dashboard.packs.featureValidityMonths',
    params: { count: months },
  };
}

/** The card's facts, in reading order, without the ones a pack lacks. */
export function packCardFacts(pack: PackFactSource, pick: PickText): PackFact[] {
  return [
    packStepsFact(pack),
    packCorrectionsFact(pack),
    packValidityFact(pack, pick),
  ].filter((fact): fact is PackFact => fact !== null);
}
