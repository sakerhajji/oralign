import { ReplacementReason } from '@prisma/client';
import { QUANTITY_RANGE } from '../supplemental.constants';
import {
  PROBLEM_ISSUE,
  problem,
  required,
  type SubmissionProblem,
} from '../supplemental-problems';
import {
  alignerNumberProblems,
  quantityProblems,
  treatedArches,
  unanswered,
  type SubmissionContext,
} from './submission-context';

/**
 * Lost / broken / deformed aligners: one or both arches, a range from..to
 * within the plan of every treated arch and, once deliveries exist, not
 * beyond the last aligner handed over. The quantity is per aligner.
 */
export function replacementProblems(
  context: SubmissionContext,
): SubmissionProblem[] {
  const { answers, archTreatment } = context;
  const problems: SubmissionProblem[] = [];
  const arches = treatedArches(archTreatment);

  if (!archTreatment) problems.push(required('archTreatment'));
  const fromProblems = alignerNumberProblems(
    'replacementFromAligner',
    answers.replacementFromAligner,
    arches,
    context,
  );
  const toProblems = alignerNumberProblems(
    'replacementToAligner',
    answers.replacementToAligner,
    arches,
    context,
  );
  problems.push(...fromProblems, ...toProblems);
  if (
    fromProblems.length === 0 &&
    toProblems.length === 0 &&
    answers.replacementFromAligner !== null &&
    answers.replacementToAligner !== null &&
    answers.replacementFromAligner > answers.replacementToAligner
  ) {
    problems.push(problem('replacementToAligner', PROBLEM_ISSUE.INVALID));
  }

  problems.push(
    ...quantityProblems(answers.quantity, QUANTITY_RANGE.replacement),
  );
  if (!answers.replacementReason) problems.push(required('replacementReason'));
  else if (
    answers.replacementReason === ReplacementReason.other &&
    !answers.reasonDetails
  ) {
    problems.push(required('reasonDetails'));
  }
  problems.push(...unanswered(answers, ['urgency']));
  return problems;
}
