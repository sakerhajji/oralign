import { ArchTreatment, type OrderFileCategory } from '@prisma/client';
import { splitUploadSlot } from '../../services/upload-slot';
import {
  BITE_REGISTRATION_SLOT_KEYS,
  SCAN_FILE_CATEGORIES,
  type UploadSlot,
} from '../supplemental.constants';
import { alignerLimitFor } from '../supplemental-aligner-limits';
import type { RequestDetails } from '../supplemental-details';
import type { SupplementalAnswers } from '../supplemental-draft';
import {
  PROBLEM_ISSUE,
  problem,
  required,
  type ProblemField,
  type SubmissionProblem,
} from '../supplemental-problems';
import type {
  ApprovedPlan,
  CoverageQuotation,
  SingleArch,
  SupplementalOrderType,
} from '../supplemental.types';

/** A file uploaded on the CHILD order, as the completeness rules read it. */
export interface SubmittedFile {
  category: OrderFileCategory;
  /** `<slotKey>__<client name>` when it went through an upload slot. */
  originalName: string;
}

/** Everything a per-kind validator reads. Built by the service, inside the submit transaction. */
export interface SubmissionContext {
  type: SupplementalOrderType;
  archTreatment: ArchTreatment | null;
  answers: SupplementalAnswers;
  details: RequestDetails;
  files: readonly SubmittedFile[];
  parent: {
    createdAt: Date;
    totalAligners: number | null;
    approvedPlans: ApprovedPlan[];
    quotation: CoverageQuotation | null;
    deliveredUpTo: number | null;
  };
  now: Date;
}

/** Every problem of the request (empty: it can be submitted). */
export type SupplementalValidator = (
  context: SubmissionContext,
) => SubmissionProblem[];

/**
 * True when `file` fills `slot`: uploaded into it (slot prefix), or, for
 * a file without a prefix, carrying the slot's fallback category (only
 * set where no other slot shares that category).
 */
export function fillsSlot(file: SubmittedFile, slot: UploadSlot): boolean {
  const { slotKey } = splitUploadSlot(file.originalName);
  return slotKey !== null
    ? slotKey === slot.key
    : file.category === slot.fallbackCategory;
}

/** A scan of an arch: a scan file that is not a bite registration. */
export function isArchScan(file: SubmittedFile): boolean {
  const { slotKey } = splitUploadSlot(file.originalName);
  return (
    SCAN_FILE_CATEGORIES.includes(file.category) &&
    (slotKey === null || !BITE_REGISTRATION_SLOT_KEYS.includes(slotKey))
  );
}

export function treatedArches(arch: ArchTreatment | null): SingleArch[] {
  switch (arch) {
    case ArchTreatment.both:
      return [ArchTreatment.upper, ArchTreatment.lower];
    case ArchTreatment.upper:
    case ArchTreatment.lower:
      return [arch];
    default:
      return [];
  }
}

export function isSingleArch(arch: ArchTreatment | null): arch is SingleArch {
  return arch === ArchTreatment.upper || arch === ArchTreatment.lower;
}

/**
 * Highest aligner number `arch` can name (approved plan, else pack, else
 * case total: see alignerLimits). Null: unknown, so only the delivery
 * bound applies.
 */
export function planTotalFor(
  arch: SingleArch,
  context: SubmissionContext,
): number | null {
  return alignerLimitFor(arch, context.parent);
}

/**
 * The highest aligner number valid for every arch in `arches`: within each
 * arch's plan total and, once aligners were handed over, not beyond the
 * last one delivered (an aligner the patient never had cannot be lost,
 * defective or "current").
 */
export function alignerCeiling(
  arches: readonly SingleArch[],
  context: SubmissionContext,
): number | null {
  const bounds = [
    ...arches.map((arch) => planTotalFor(arch, context)),
    context.parent.deliveredUpTo,
  ].filter((bound): bound is number => bound !== null);
  return bounds.length > 0 ? Math.min(...bounds) : null;
}

/** An aligner number answer: present and within 1..ceiling. */
export function alignerNumberProblems(
  field: ProblemField,
  value: number | null,
  arches: readonly SingleArch[],
  context: SubmissionContext,
): SubmissionProblem[] {
  if (value === null) return [required(field)];
  const ceiling = alignerCeiling(arches, context);
  return value < 1 || (ceiling !== null && value > ceiling)
    ? [problem(field, PROBLEM_ISSUE.OUT_OF_RANGE)]
    : [];
}

/** A quantity answer: present and within the kind's range. */
export function quantityProblems(
  value: number | null,
  range: { min: number; max: number },
): SubmissionProblem[] {
  if (value === null) return [required('quantity')];
  return value < range.min || value > range.max
    ? [problem('quantity', PROBLEM_ISSUE.OUT_OF_RANGE)]
    : [];
}

/** `required(field)` for each listed answer left unanswered. */
export function unanswered<K extends keyof SupplementalAnswers>(
  answers: SupplementalAnswers,
  fields: readonly K[],
): SubmissionProblem[] {
  return fields
    .filter((field) => answers[field] === null)
    .map((field) => required(field));
}
