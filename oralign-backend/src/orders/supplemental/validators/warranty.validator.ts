import { ArchTreatment } from '@prisma/client';
import { businessToday } from '../../../common/time/business-day';
import { splitUploadSlot } from '../../services/upload-slot';
import {
  ALIGNER_LABEL_SLOT_KEY,
  ALIGNER_PHOTO_SLOT,
  WARRANTY_EVIDENCE_CATEGORIES,
} from '../supplemental.constants';
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
  type SubmittedFile,
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
 * A photo that can prove the claim: not the pouch label, not an aligner no
 * longer claimed. Photos from before the aligner slots still count.
 */
function showsClaimedAligner(
  file: SubmittedFile,
  claimed: readonly number[],
): boolean {
  if (!WARRANTY_EVIDENCE_CATEGORIES.includes(file.category)) return false;
  const { slotKey } = splitUploadSlot(file.originalName);
  if (slotKey === ALIGNER_LABEL_SLOT_KEY) return false;
  const aligner = slotKey ? ALIGNER_PHOTO_SLOT.exec(slotKey) : null;
  return !aligner || claimed.includes(Number(aligner[1]));
}

/**
 * One or more defective aligners of ONE arch, all delivered to the patient,
 * with the defect, its discovery day, comments and at least one photo of a
 * claimed aligner. The lot reference is optional.
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
  const arches = isSingleArch(archTreatment) ? [archTreatment] : [];
  const alignerProblems = answers.defectiveAligners.flatMap((aligner) =>
    alignerNumberProblems('defectiveAligners', aligner, arches, context),
  );
  if (answers.defectiveAligners.length === 0) {
    problems.push(required('defectiveAligners'));
  } else {
    problems.push(...alignerProblems.slice(0, 1));
  }
  if (!answers.warrantyDefectCategory) {
    problems.push(required('warrantyDefectCategory'));
  }
  problems.push(...discoveryDayProblems(context));
  if (!answers.warrantyComments) problems.push(required('warrantyComments'));
  if (
    !files.some((file) =>
      showsClaimedAligner(file, answers.defectiveAligners),
    )
  ) {
    problems.push(required('evidencePhotos'));
  }
  return problems;
}
