import { incompleteRequest } from '../supplemental-problems';
import type { SupplementalOrderType } from '../supplemental.types';
import { additionalAlignersProblems } from './additional-aligners.validator';
import { replacementProblems } from './replacement.validator';
import type {
  SubmissionContext,
  SupplementalValidator,
} from './submission-context';
import { transferTemplateProblems } from './transfer-template.validator';
import { warrantyProblems } from './warranty.validator';

export type { SubmissionContext } from './submission-context';

/** One validator per kind; the server is the source of truth at submit. */
export const SUBMISSION_VALIDATORS: Record<
  SupplementalOrderType,
  SupplementalValidator
> = {
  additional_aligners: additionalAlignersProblems,
  replacement: replacementProblems,
  transfer_template: transferTemplateProblems,
  warranty: warrantyProblems,
};

/** 400 SUPPLEMENTAL_INCOMPLETE listing every problem, if there is one. */
export function assertSubmittable(context: SubmissionContext): void {
  const problems = SUBMISSION_VALIDATORS[context.type](context);
  if (problems.length > 0) throw incompleteRequest(problems);
}
