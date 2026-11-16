import {
  ArchTreatment,
  SupplementalApCorrection,
  SupplementalClinicalObjective,
  SupplementalImpressionMethod,
  SupplementalRequestReason,
} from '@prisma/client';
import {
  ELASTIC_CUTOUT_OPTIONS,
  INTRAORAL_PHOTO_SLOTS,
} from '../supplemental.constants';
import { detailProblems } from '../supplemental-details';
import type { SupplementalAnswers } from '../supplemental-draft';
import { required, type SubmissionProblem } from '../supplemental-problems';
import {
  alignerNumberProblems,
  fillsSlot,
  isArchScan,
  isSingleArch,
  treatedArches,
  unanswered,
  type SubmissionContext,
} from './submission-context';

/** Single-choice questions every refinement must answer (Q6-Q12, scans). */
const REQUIRED_CHOICES = [
  'clinicalObjective',
  'movementRestriction',
  'apRelationshipRight',
  'apRelationshipLeft',
  'attachmentPolicy',
  'existingAttachmentPolicy',
  'iprPolicy',
  'previousIpr',
  'precisionCutPolicy',
  'residualSpacePolicy',
  'impressionMethod',
] as const satisfies readonly (keyof SupplementalAnswers)[];

/**
 * Answers the instructions (Q13) must describe: a treatment plan change
 * (Q1 says "to be detailed in the instructions"), a new goal (Q5), a full
 * canine + molar correction on either side (Q7).
 */
export function needsInstructions(answers: SupplementalAnswers): boolean {
  return (
    answers.reason === SupplementalRequestReason.treatment_plan_change ||
    answers.clinicalObjective === SupplementalClinicalObjective.new_goal ||
    answers.apRelationshipRight ===
      SupplementalApCorrection.improve_canine_molar ||
    answers.apRelationshipLeft === SupplementalApCorrection.improve_canine_molar
  );
}

/** An intraoral scan: one arch scan file per arch announced as rescanned. */
function scanProblems({
  answers,
  files,
}: SubmissionContext): SubmissionProblem[] {
  if (answers.impressionMethod !== SupplementalImpressionMethod.intraoral_scan)
    return [];
  const uploaded = files.filter(isArchScan).length;
  const expected =
    Number(answers.newUpperScan === true) +
    Number(answers.newLowerScan === true);
  return uploaded < expected ? [required('scans')] : [];
}

/** The five intraoral views, each in its own upload slot. */
function photoProblems({ files }: SubmissionContext): SubmissionProblem[] {
  const complete = INTRAORAL_PHOTO_SLOTS.every((slot) =>
    files.some((file) => fillsSlot(file, slot)),
  );
  return complete ? [] : [required('photos')];
}

/** The 13 questions of the additional-aligner form, then scans and photos. */
export function additionalAlignersProblems(
  context: SubmissionContext,
): SubmissionProblem[] {
  const { answers, archTreatment } = context;
  const problems: SubmissionProblem[] = [];

  if (!answers.reason) problems.push(required('reason'));
  else if (
    answers.reason === SupplementalRequestReason.other &&
    !answers.reasonDetails
  ) {
    problems.push(required('reasonDetails'));
  }

  if (!archTreatment) problems.push(required('archTreatment'));
  for (const arch of treatedArches(archTreatment)) {
    problems.push(
      ...alignerNumberProblems(
        arch === ArchTreatment.upper
          ? 'currentUpperAligner'
          : 'currentLowerAligner',
        arch === ArchTreatment.upper
          ? answers.currentUpperAligner
          : answers.currentLowerAligner,
        [arch],
        context,
      ),
    );
  }
  if (isSingleArch(archTreatment) && answers.passiveOppositeArch === null) {
    problems.push(required('passiveOppositeArch'));
  }

  problems.push(
    ...unanswered(answers, ['newUpperScan', 'newLowerScan']),
    ...unanswered(answers, REQUIRED_CHOICES),
  );
  if (
    needsInstructions(answers) &&
    !answers.upperInstructions &&
    !answers.lowerInstructions
  ) {
    problems.push(required('instructions'));
  }
  const needsCutouts = answers.apOptions.some((option) =>
    ELASTIC_CUTOUT_OPTIONS.includes(option),
  );
  if (needsCutouts && answers.elasticCutouts === null) {
    problems.push(required('elasticCutouts'));
  }

  problems.push(
    ...detailProblems(context.type, archTreatment, answers, context.details),
    ...scanProblems(context),
    ...photoProblems(context),
  );
  return problems;
}
