import type {
  ArchTreatment,
  SupplementalContactPurpose,
  SupplementalToothPurpose,
} from '@/lib/types';
import {
  ALIGNER_NUMBER_MAX,
  CONTACT_PURPOSE_OWNER,
  TOOTH_PURPOSE_OWNER,
} from '../supplemental-constants';
import { treatsLower, treatsUpper, type SupplementalDraft } from '../supplemental-draft';
import { contactsFor, isValidContact, teethFor } from '../tooth-details';
import {
  VALIDATION_KEY,
  type FieldErrors,
  type ValidationContext,
  type ValidationField,
} from './validation-types';

/** A rule's verdict per field; `undefined` = the field passes. */
export type MaybeErrors = Partial<Record<ValidationField, string | undefined>>;
export type Arch = 'upper' | 'lower';

/** Merges rule verdicts, keeping the first message of each failing field. */
export function compact(...groups: MaybeErrors[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const group of groups) {
    for (const [field, message] of Object.entries(group) as [ValidationField, string | undefined][]) {
      if (message && !errors[field]) errors[field] = message;
    }
  }
  return errors;
}

export const isBlank = (text: string) => text.trim().length === 0;

export const required = (missing: boolean) => (missing ? VALIDATION_KEY.required : undefined);

/** "Other" was chosen and its free-text precision is empty. */
export function detailsError(chosenOther: boolean, details: string): string | undefined {
  return chosenOther && isBlank(details) ? VALIDATION_KEY.details : undefined;
}

export function treatedArches(arch: ArchTreatment | null): Arch[] {
  const arches: Arch[] = [];
  if (treatsUpper(arch)) arches.push('upper');
  if (treatsLower(arch)) arches.push('lower');
  return arches;
}

/**
 * Highest aligner number valid on every listed arch: within each plan total
 * and the last aligner handed over. Null when nothing bounds it.
 */
export function alignerCeiling(
  arches: readonly Arch[],
  limits: Pick<ValidationContext, 'planTotals' | 'deliveredUpTo'>,
): number | null {
  const bounds = [...arches.map((arch) => limits.planTotals[arch]), limits.deliveredUpTo].filter(
    (bound): bound is number => bound !== null,
  );
  return bounds.length > 0 ? Math.min(...bounds) : null;
}

/** An aligner number must exist in every treated arch and be delivered. */
export function alignerNumberError(
  value: number | null,
  arches: readonly Arch[],
  context: ValidationContext,
): string | undefined {
  if (value === null) return VALIDATION_KEY.required;
  if (!Number.isInteger(value) || value < 1 || value > ALIGNER_NUMBER_MAX) {
    return VALIDATION_KEY.alignerNumber;
  }
  const exceedsPlan = arches.some((arch) => {
    const total = context.planTotals[arch];
    return total !== null && value > total;
  });
  if (exceedsPlan) return VALIDATION_KEY.alignerAbovePlan;
  if (context.deliveredUpTo !== null && value > context.deliveredUpTo) {
    return VALIDATION_KEY.alignerNotDelivered;
  }
  return undefined;
}

export function quantityError(
  value: number | null,
  range: { min: number; max: number },
): string | undefined {
  if (value === null) return VALIDATION_KEY.required;
  return Number.isInteger(value) && value >= range.min && value <= range.max
    ? undefined
    : VALIDATION_KEY.quantity;
}

/**
 * The option asking for teeth is chosen, but no tooth is selected. Rules
 * read the normalised draft, so teeth of an untreated arch do not count.
 */
export function teethError(draft: SupplementalDraft, purpose: SupplementalToothPurpose): MaybeErrors {
  const owner = TOOTH_PURPOSE_OWNER[purpose];
  const asked = owner === null || draft[owner.field] === owner.option;
  return {
    [`teeth.${purpose}`]:
      asked && teethFor(draft.teeth, purpose).length === 0 ? VALIDATION_KEY.teeth : undefined,
  };
}

/**
 * The option asking for contacts is chosen: at least one, each between
 * adjacent teeth with an amount in range and at most two decimals.
 */
export function contactsError(
  draft: SupplementalDraft,
  purpose: SupplementalContactPurpose,
): MaybeErrors {
  const owner = CONTACT_PURPOSE_OWNER[purpose];
  if (draft[owner.field] !== owner.option) return {};
  const contacts = contactsFor(draft.contacts, purpose);
  let message: string | undefined;
  if (contacts.length === 0) message = VALIDATION_KEY.contacts;
  else if (!contacts.every(isValidContact)) message = VALIDATION_KEY.contactAmount;
  return { [`contacts.${purpose}`]: message };
}
