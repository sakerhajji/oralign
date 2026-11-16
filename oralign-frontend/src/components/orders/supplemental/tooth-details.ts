import { contactAnchor } from '@/components/orders/wizard/tooth-contacts';
import type {
  SupplementalContactPurpose,
  SupplementalToothContact,
  SupplementalToothPurpose,
  SupplementalToothSelection,
} from '@/lib/types';
import { CONTACT_AMOUNT_DECIMALS, CONTACT_AMOUNT_RANGE } from './supplemental-constants';

/*
 * The doctor's teeth and contacts on a request (pure helpers). Teeth are
 * FDI numbers per purpose; a contact joins two adjacent teeth, stored
 * with fromTooth < toTooth. The chart geometry (which teeth touch, how
 * the odontogram keys a contact) lives in `wizard/tooth-contacts`.
 */

export function teethFor(
  teeth: readonly SupplementalToothSelection[],
  purpose: SupplementalToothPurpose,
): number[] {
  return teeth
    .filter((tooth) => tooth.purpose === purpose)
    .map((tooth) => tooth.toothNumber)
    .sort((a, b) => a - b);
}

export function replaceTeeth(
  teeth: readonly SupplementalToothSelection[],
  purpose: SupplementalToothPurpose,
  toothNumbers: readonly number[],
): SupplementalToothSelection[] {
  const unique = [...new Set(toothNumbers)];
  return [
    ...teeth.filter((tooth) => tooth.purpose !== purpose),
    ...unique.map((toothNumber) => ({ purpose, toothNumber })),
  ];
}

export function contactsFor(
  contacts: readonly SupplementalToothContact[],
  purpose: SupplementalContactPurpose,
): SupplementalToothContact[] {
  return contacts
    .filter((contact) => contact.purpose === purpose)
    .sort((a, b) => a.fromTooth - b.fromTooth || a.toTooth - b.toTooth);
}

/** Set (or, with `amountMm` null, remove) one contact of a purpose. */
export function upsertContact(
  contacts: readonly SupplementalToothContact[],
  purpose: SupplementalContactPurpose,
  pair: { fromTooth: number; toTooth: number },
  amountMm: number | null,
): SupplementalToothContact[] {
  const fromTooth = Math.min(pair.fromTooth, pair.toTooth);
  const toTooth = Math.max(pair.fromTooth, pair.toTooth);
  const others = contacts.filter(
    (contact) =>
      contact.purpose !== purpose ||
      contact.fromTooth !== fromTooth ||
      contact.toTooth !== toTooth,
  );
  return amountMm === null ? others : [...others, { purpose, fromTooth, toTooth, amountMm }];
}

const DECIMAL_FACTOR = 10 ** CONTACT_AMOUNT_DECIMALS;

/** An amount rounded to the decimals the server stores. */
export function roundContactAmount(amountMm: number): number {
  return Math.round(amountMm * DECIMAL_FACTOR) / DECIMAL_FACTOR;
}

/** Inside the purpose's range, with at most two decimals (server rule). */
export function isValidContactAmount(
  amountMm: number,
  purpose: SupplementalContactPurpose,
): boolean {
  const { min, max } = CONTACT_AMOUNT_RANGE[purpose];
  return (
    Number.isFinite(amountMm) &&
    roundContactAmount(amountMm) === amountMm &&
    amountMm >= min &&
    amountMm <= max
  );
}

/** A contact the server accepts: two adjacent teeth and a valid amount. */
export function isValidContact(contact: SupplementalToothContact): boolean {
  return (
    contactAnchor(contact.fromTooth, contact.toTooth) !== null &&
    isValidContactAmount(contact.amountMm, contact.purpose)
  );
}
