import type {
  SupplementalContactPurpose,
  SupplementalOrderRequest,
  SupplementalToothPurpose,
} from '@prisma/client';
import { BadRequestException } from '../../common/exceptions/app.exception';
import { SUPPLEMENTAL_ERROR } from './supplemental.constants';

/**
 * A reason a request cannot be submitted, as `<field>:<issue>`. The field
 * is the request column (or archTreatment, a detail list `teeth.<purpose>` /
 * `contacts.<purpose>`, a file set), so a client maps each problem to the
 * question it belongs to without a lookup table of its own.
 */
export type ProblemField =
  | keyof SupplementalOrderRequest
  | 'archTreatment'
  | 'instructions'
  | 'scans'
  | 'photos'
  | 'evidencePhotos'
  | `teeth.${SupplementalToothPurpose}`
  | `contacts.${SupplementalContactPurpose}`;

export const PROBLEM_ISSUE = {
  /** Not answered (or no file / detail where one is needed). */
  REQUIRED: 'required',
  /** Answered with a value outside what the case allows. */
  OUT_OF_RANGE: 'out_of_range',
  /** Answered with a value that does not fit the other answers. */
  INVALID: 'invalid',
} as const;

export type ProblemIssue = (typeof PROBLEM_ISSUE)[keyof typeof PROBLEM_ISSUE];

export type SubmissionProblem = `${ProblemField}:${ProblemIssue}`;

export function problem(
  field: ProblemField,
  issue: ProblemIssue,
): SubmissionProblem {
  return `${field}:${issue}`;
}

export const required = (field: ProblemField): SubmissionProblem =>
  problem(field, PROBLEM_ISSUE.REQUIRED);

/** Leading text of the SUPPLEMENTAL_INCOMPLETE message, before the list. */
export const INCOMPLETE_MESSAGE_PREFIX = 'The request is incomplete: ';

/**
 * ONE 400 listing every problem (never the first one only), so the wizard
 * can flag all the questions at once: message
 * `The request is incomplete: reason:required, photos:required`.
 */
export function incompleteRequest(
  problems: readonly SubmissionProblem[],
): BadRequestException {
  return new BadRequestException(
    `${INCOMPLETE_MESSAGE_PREFIX}${problems.join(', ')}`,
    SUPPLEMENTAL_ERROR.INCOMPLETE,
  );
}
