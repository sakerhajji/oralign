import {
  ArchTreatment,
  type SupplementalContactPurpose,
  type SupplementalOrderRequest,
  type SupplementalToothPurpose,
} from '@prisma/client';
import {
  ALLOWED_CONTACT_PURPOSES,
  ALLOWED_TOOTH_PURPOSES,
  CONTACT_AMOUNT_MM,
  MIDLINE_CONTACTS,
  PERMANENT_TEETH,
  SUPPLEMENTAL_DETAIL_OWNERS,
  UPPER_ARCH_QUADRANTS,
  type DetailOwner,
  type DetailOwnerField,
} from './supplemental.constants';
import {
  PROBLEM_ISSUE,
  problem,
  required,
  type SubmissionProblem,
} from './supplemental-problems';
import type {
  SingleArch,
  SupplementalOrderType,
  ToothContact,
  ToothSelection,
} from './supplemental.types';

/**
 * The doctor's teeth and contacts: shape rules (draft save), the
 * normalisation every draft save applies (owning answer selected, treated
 * arch) and completeness (submission). Pure.
 */

/** The answers that decide which details are asked for. */
export type DetailOwnerAnswers = Pick<
  SupplementalOrderRequest,
  DetailOwnerField
>;

export interface RequestDetails {
  teeth: ToothSelection[];
  contacts: ToothContact[];
}

export function isPermanentTooth(tooth: number): boolean {
  return PERMANENT_TEETH.includes(tooth);
}

const quadrantOf = (tooth: number) => Math.floor(tooth / 10);

/** The arch of an FDI tooth: upper 11-28, lower 31-48. */
export function archOfTooth(tooth: number): SingleArch {
  return UPPER_ARCH_QUADRANTS.includes(quadrantOf(tooth))
    ? ArchTreatment.upper
    : ArchTreatment.lower;
}

/**
 * True when `tooth` sits on an arch the request treats. An arch not chosen
 * yet (null) rules nothing out: the submission asks for the arch anyway,
 * and the details are re-checked against it once it is chosen.
 */
export function isOnTreatedArch(
  tooth: number,
  archTreatment: ArchTreatment | null,
): boolean {
  return (
    archTreatment === null ||
    archTreatment === ArchTreatment.both ||
    archOfTooth(tooth) === archTreatment
  );
}

/** A contact belongs to a treated arch when both of its teeth do. */
function isContactOnTreatedArch(
  contact: ToothContact,
  archTreatment: ArchTreatment | null,
): boolean {
  return (
    isOnTreatedArch(contact.fromTooth, archTreatment) &&
    isOnTreatedArch(contact.toTooth, archTreatment)
  );
}

/**
 * Two teeth that touch: neighbours in one quadrant (13-14), or the central
 * incisors across the midline (11-21, 31-41). Order does not matter.
 */
export function areAdjacentTeeth(a: number, b: number): boolean {
  if (!isPermanentTooth(a) || !isPermanentTooth(b)) return false;
  if (quadrantOf(a) === quadrantOf(b)) return Math.abs(a - b) === 1;
  return MIDLINE_CONTACTS.some(
    ([left, right]) =>
      (a === left && b === right) || (a === right && b === left),
  );
}

/** The stored form of a contact: lower FDI number first. */
export function normaliseContact(contact: ToothContact): ToothContact {
  return contact.fromTooth <= contact.toTooth
    ? contact
    : { ...contact, fromTooth: contact.toTooth, toTooth: contact.fromTooth };
}

const toothKey = (tooth: ToothSelection) =>
  `${tooth.purpose}:${tooth.toothNumber}`;
const contactKey = (contact: ToothContact) =>
  `${contact.purpose}:${contact.fromTooth}-${contact.toTooth}`;

const duplicatesOf = (keys: readonly string[]): string[] =>
  keys.filter((key, index) => keys.indexOf(key) !== index);

/**
 * Why submitted teeth / contacts cannot be stored for a request of `type`
 * (empty: they can). Contacts must already be normalised.
 */
export function detailInputErrors(
  type: SupplementalOrderType,
  { teeth, contacts }: RequestDetails,
): string[] {
  const errors: string[] = [];
  for (const tooth of teeth) {
    if (!ALLOWED_TOOTH_PURPOSES[type].includes(tooth.purpose)) {
      errors.push(`teeth.${tooth.purpose} is not asked on a ${type} request`);
    }
    if (!isPermanentTooth(tooth.toothNumber)) {
      errors.push(`tooth ${tooth.toothNumber} is not an FDI permanent tooth`);
    }
  }
  for (const contact of contacts) {
    if (!ALLOWED_CONTACT_PURPOSES[type].includes(contact.purpose)) {
      errors.push(
        `contacts.${contact.purpose} is not asked on a ${type} request`,
      );
    }
    if (!areAdjacentTeeth(contact.fromTooth, contact.toTooth)) {
      errors.push(
        `teeth ${contact.fromTooth} and ${contact.toTooth} are not adjacent`,
      );
    }
    const { min, max } = CONTACT_AMOUNT_MM[contact.purpose];
    if (contact.amountMm < min || contact.amountMm > max) {
      errors.push(
        `contacts.${contact.purpose} amount must be ${min}-${max} mm`,
      );
    }
  }
  for (const key of duplicatesOf(teeth.map(toothKey))) {
    errors.push(`tooth ${key} is listed twice`);
  }
  for (const key of duplicatesOf(contacts.map(contactKey))) {
    errors.push(`contact ${key} is listed twice`);
  }
  return errors;
}

/** True when the answer that asks for the detail is selected. */
export function isOwnerSelected(
  owner: DetailOwner | null,
  answers: DetailOwnerAnswers,
): boolean {
  return owner === null || answers[owner.field] === owner.value;
}

const toothOwner = (purpose: SupplementalToothPurpose) =>
  SUPPLEMENTAL_DETAIL_OWNERS.teeth[purpose];
const contactOwner = (purpose: SupplementalContactPurpose) =>
  SUPPLEMENTAL_DETAIL_OWNERS.contacts[purpose];

/**
 * Drop the details whose owning answer is not selected (Q6 answered "none"
 * drops the do-not-move teeth, ...). Run on every draft save, so a stored
 * request never holds a detail no answer asks for.
 */
export function keepOwnedDetails(
  answers: DetailOwnerAnswers,
  { teeth, contacts }: RequestDetails,
): RequestDetails {
  return {
    teeth: teeth.filter((tooth) =>
      isOwnerSelected(toothOwner(tooth.purpose), answers),
    ),
    contacts: contacts.filter((contact) =>
      isOwnerSelected(contactOwner(contact.purpose), answers),
    ),
  };
}

/**
 * Drop the teeth and contacts of an arch the request does not treat (an
 * upper-only request keeps 11-28). Silent, like the ownership rule: the
 * arch can change after the teeth were picked.
 */
export function keepTreatedArchDetails(
  archTreatment: ArchTreatment | null,
  { teeth, contacts }: RequestDetails,
): RequestDetails {
  return {
    teeth: teeth.filter((tooth) =>
      isOnTreatedArch(tooth.toothNumber, archTreatment),
    ),
    contacts: contacts.filter((contact) =>
      isContactOnTreatedArch(contact, archTreatment),
    ),
  };
}

/** What every draft save stores: owned details, on a treated arch. */
export function normaliseDetails(
  archTreatment: ArchTreatment | null,
  answers: DetailOwnerAnswers,
  details: RequestDetails,
): RequestDetails {
  return keepTreatedArchDetails(
    archTreatment,
    keepOwnedDetails(answers, details),
  );
}

/** Selected owners without a single detail (submission problems). */
export function missingDetailProblems(
  type: SupplementalOrderType,
  answers: DetailOwnerAnswers,
  { teeth, contacts }: RequestDetails,
): SubmissionProblem[] {
  const problems: SubmissionProblem[] = [];
  for (const purpose of ALLOWED_TOOTH_PURPOSES[type]) {
    const asked = isOwnerSelected(toothOwner(purpose), answers);
    if (asked && !teeth.some((tooth) => tooth.purpose === purpose)) {
      problems.push(required(`teeth.${purpose}`));
    }
  }
  for (const purpose of ALLOWED_CONTACT_PURPOSES[type]) {
    const asked = isOwnerSelected(contactOwner(purpose), answers);
    if (asked && !contacts.some((contact) => contact.purpose === purpose)) {
      problems.push(required(`contacts.${purpose}`));
    }
  }
  return problems;
}

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

/**
 * `teeth.<purpose>:invalid` / `contacts.<purpose>:invalid` for every
 * purpose holding a detail off the treated arches. A save drops them, so
 * only a row stored before the rule (or before the arch changed through
 * another path) gets here.
 */
export function outOfArchDetailProblems(
  archTreatment: ArchTreatment | null,
  { teeth, contacts }: RequestDetails,
): SubmissionProblem[] {
  const teethOff = teeth
    .filter((tooth) => !isOnTreatedArch(tooth.toothNumber, archTreatment))
    .map((tooth) => tooth.purpose);
  const contactsOff = contacts
    .filter((contact) => !isContactOnTreatedArch(contact, archTreatment))
    .map((contact) => contact.purpose);
  return [
    ...unique(teethOff).map((purpose) =>
      problem(`teeth.${purpose}`, PROBLEM_ISSUE.INVALID),
    ),
    ...unique(contactsOff).map((purpose) =>
      problem(`contacts.${purpose}`, PROBLEM_ISSUE.INVALID),
    ),
  ];
}

/** Every detail problem of a submission: missing, then off-arch. */
export function detailProblems(
  type: SupplementalOrderType,
  archTreatment: ArchTreatment | null,
  answers: DetailOwnerAnswers,
  details: RequestDetails,
): SubmissionProblem[] {
  return [
    ...missingDetailProblems(type, answers, details),
    ...outOfArchDetailProblems(archTreatment, details),
  ];
}

/** Stable one-line rendering, for the audit diff ("cutout 13, 23"). */
export function describeTeeth(teeth: readonly ToothSelection[]): string {
  const byPurpose = new Map<string, number[]>();
  for (const tooth of [...teeth].sort(
    (a, b) => a.toothNumber - b.toothNumber,
  )) {
    byPurpose.set(tooth.purpose, [
      ...(byPurpose.get(tooth.purpose) ?? []),
      tooth.toothNumber,
    ]);
  }
  return [...byPurpose.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([purpose, numbers]) => `${purpose} ${numbers.join(', ')}`)
    .join('; ');
}

/** Stable one-line rendering ("performed_ipr 11-21 0.2 mm"). */
export function describeContacts(contacts: readonly ToothContact[]): string {
  return contacts
    .map(
      (contact) =>
        `${contactKey(contact).replace(':', ' ')} ${contact.amountMm} mm`,
    )
    .sort()
    .join('; ');
}
