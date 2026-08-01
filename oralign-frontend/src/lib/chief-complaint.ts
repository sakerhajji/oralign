import {
  CLINICAL_CONDITION_OPTIONS,
  CLINICAL_CONDITION_OTHER,
} from '@/lib/types';

/**
 * Chief-complaint (order "Reason for consultation") storage helpers.
 *
 * The order's `chiefComplaint` column is a single free-text string, but
 * the wizard now edits it as a checkbox multi-select over the shared
 * `CLINICAL_CONDITION_OPTIONS` (plus an "Other" free-text). To avoid a
 * backend schema change we PACK the selection into that one string and
 * UNPACK it back into checkboxes on load:
 *
 *   • Selected conditions are stored as their canonical ENGLISH labels
 *     (e.g. `Crowding, Open bite`) — same stable values the patient's
 *     `clinicalConditions` array uses, so filtering / analytics that key
 *     off English keep working.
 *   • The "Other" free-text (if any) is appended as the trailing
 *     segment.
 *   • Only the DISPLAYED label is localized (see `formatChiefComplaint`).
 *
 * Legacy rows created before this change hold arbitrary prose; unpacking
 * simply routes any token that isn't a known condition into the "Other"
 * bucket, so an old free-text complaint shows up (editable) under Other.
 */

/**
 * Canonical (English) clinical-condition value → dashboard dict key.
 * Mirrors the map in `clinical-conditions-field.tsx`; exported so both
 * the field and the chief-complaint formatter localize identically.
 */
export const CONDITION_DICT_KEY: Record<string, string> = {
  Crowding: 'orderForm.patient.condCrowding',
  Spacing: 'orderForm.patient.condSpacing',
  'Class II Division 1': 'orderForm.patient.condClassII1',
  'Class II Division 2': 'orderForm.patient.condClassII2',
  'Class III': 'orderForm.patient.condClassIII',
  'Open bite': 'orderForm.patient.condOpenBite',
  'Anterior crossbite': 'orderForm.patient.condAnteriorCrossbite',
  'Posterior crossbite': 'orderForm.patient.condPosteriorCrossbite',
  'Deep bite': 'orderForm.patient.condDeepBite',
  'Narrow arch': 'orderForm.patient.condNarrowArch',
  Proclination: 'orderForm.patient.condProclination',
  'Increased overjet': 'orderForm.patient.condIncreasedOverjet',
  'Unesthetic smile': 'orderForm.patient.condUnestheticSmile',
  'Dental shape anomaly': 'orderForm.patient.condDentalShapeAnomaly',
  'TMJ problem (temporomandibular dislocation)': 'orderForm.patient.condTmjDislocation',
  Other: 'orderForm.patient.condOther',
};

/** Localize one canonical condition label; falls back to the raw value. */
export function conditionLabel(
  canonical: string,
  t: (key: string) => string,
): string {
  const key = CONDITION_DICT_KEY[canonical];
  return key ? t(key) : canonical;
}

/** Pack a checkbox selection + "Other" free-text into the stored string. */
export function packChiefComplaint(conditions: string[], other: string): string {
  const standard = conditions.filter((c) => c !== CLINICAL_CONDITION_OTHER);
  const otherText = conditions.includes(CLINICAL_CONDITION_OTHER)
    ? other.trim()
    : '';
  return [...standard, otherText].filter(Boolean).join(', ');
}

/** Unpack a stored chief-complaint string back into checkbox state. */
export function unpackChiefComplaint(raw: string | undefined | null): {
  conditions: string[];
  other: string;
} {
  const text = (raw ?? '').trim();
  if (!text) return { conditions: [], other: '' };

  const known = new Set<string>(
    CLINICAL_CONDITION_OPTIONS.filter((o) => o !== CLINICAL_CONDITION_OTHER),
  );
  // Split on commas OR the em/en-dash the legacy derivation used as the
  // "standard — other" separator, tolerating surrounding whitespace.
  const tokens = text
    .split(/\s*[,–—]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  const matched: string[] = [];
  const leftover: string[] = [];
  for (const token of tokens) {
    if (known.has(token)) matched.push(token);
    else leftover.push(token);
  }

  // Deterministic order (canonical list order) regardless of stored order.
  const ordered = CLINICAL_CONDITION_OPTIONS.filter(
    (o) => o !== CLINICAL_CONDITION_OTHER && matched.includes(o),
  );
  const other = leftover.join(', ');
  const conditions = other ? [...ordered, CLINICAL_CONDITION_OTHER] : ordered;
  return { conditions, other };
}

/** Localized, comma-joined chief complaint for read-only displays. */
export function formatChiefComplaint(
  raw: string | undefined | null,
  t: (key: string) => string,
): string {
  const { conditions, other } = unpackChiefComplaint(raw);
  const labels = conditions
    .filter((c) => c !== CLINICAL_CONDITION_OTHER)
    .map((c) => conditionLabel(c, t));
  if (other) labels.push(other);
  return labels.join(', ');
}
