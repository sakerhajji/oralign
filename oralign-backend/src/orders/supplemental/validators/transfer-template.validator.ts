import { TransferTemplatePurpose } from '@prisma/client';
import { QUANTITY_RANGE } from '../supplemental.constants';
import { detailProblems } from '../supplemental-details';
import {
  PROBLEM_ISSUE,
  problem,
  required,
  type SubmissionProblem,
} from '../supplemental-problems';
import { quantityProblems, type SubmissionContext } from './submission-context';

/**
 * Transfer trays built from an approved plan of the case when it has one
 * (the server chose it; a client may only switch to another approved
 * plan), for a
 * purpose, on the selected teeth of the treated arch(es).
 */
export function transferTemplateProblems(
  context: SubmissionContext,
): SubmissionProblem[] {
  const { answers, archTreatment, parent } = context;
  const problems: SubmissionProblem[] = [];

  if (!archTreatment) problems.push(required('archTreatment'));
  // A case whose plan was made outside ORALIGN has no plan to point at:
  // the tray is then built from the case's own records.
  if (!answers.sourceTreatmentPlanId) {
    if (parent.approvedPlans.length > 0) {
      problems.push(required('sourceTreatmentPlanId'));
    }
  } else if (
    !parent.approvedPlans.some(
      (plan) => plan.id === answers.sourceTreatmentPlanId,
    )
  ) {
    problems.push(problem('sourceTreatmentPlanId', PROBLEM_ISSUE.INVALID));
  }
  if (!answers.transferPurpose) problems.push(required('transferPurpose'));
  else if (
    answers.transferPurpose === TransferTemplatePurpose.other &&
    !answers.transferNotes
  ) {
    problems.push(required('transferNotes'));
  }
  problems.push(
    ...quantityProblems(answers.quantity, QUANTITY_RANGE.transfer_template),
    ...detailProblems(context.type, archTreatment, answers, context.details),
  );
  return problems;
}
