import { ArchTreatment } from '@prisma/client';
import { businessToday } from '../../../common/time/business-day';
import { WARRANTY_EVIDENCE_CATEGORIES } from '../supplemental.constants';
import { dateToCalendarDay } from '../supplemental-draft';
import {
  PROBLEM_ISSUE,
  problem,
  required,
  type SubmissionProblem,
} from '../supplemental-problems';
import {
  alignerNumberProblems,
  isSingleArch,
  type SubmissionContext,
} from './submission-context';

/**
 * The defect was found between the case's creation day and today, both
 * counted on the lab's (Tunis) calendar.
 */
function discoveryDayProblems({
  answers,
  parent,
  now,
}: SubmissionContext): SubmissionProblem[] {
  if (!answers.warrantyDiscoveredAt) return [required('warrantyDiscoveredAt')];
  const day = dateToCalendarDay(answers.warrantyDiscoveredAt);
  return day > businessToday(now) || day < businessToday(parent.createdAt)
    ? [problem('warrantyDiscoveredAt', PROBLEM_ISSUE.OUT_OF_RANGE)]
    : [];
}

/**
 * A defective aligner of ONE arch, delivered to the patient, with the
 * defect, its discovery day, comments and at least one evidence photo.
 * The lot reference is optional.
 */
export function warrantyProblems(
  context: SubmissionContext,
): SubmissionProblem[] {
  const { answers, archTreatment, files } = context;
  const problems: SubmissionProblem[] = [];

  if (!archTreatment) problems.push(required('archTreatment'));
  else if (archTreatment === ArchTreatment.both) {
    problems.push(problem('archTreatment', PROBLEM_ISSUE.INVALID));
  }
  problems.push(
    ...alignerNumberProblems(
      'replacementFromAligner',
      answers.replacementFromAligner,
      isSingleArch(archTreatment) ? [archTreatment] : [],
      context,
    ),
  );
  if (!answers.warrantyDefectCategory) {
    problems.push(required('warrantyDefectCategory'));
  }
  problems.push(...discoveryDayProblems(context));
  if (!answers.warrantyComments) problems.push(required('warrantyComments'));
  if (
    !files.some((file) => WARRANTY_EVIDENCE_CATEGORIES.includes(file.category))
  ) {
    problems.push(required('evidencePhotos'));
  }
  return problems;
}
