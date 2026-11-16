import {
  ArchTreatment,
  OrderType,
  PatientStage,
  ReplacementReason,
  SupplementalApCorrection,
  SupplementalAttachmentPlan,
  SupplementalIprPlan,
  SupplementalTeethScope,
  SupplementalUrgency,
} from '@prisma/client';
import {
  QUANTITY_RANGE,
  warrantyConversionNote,
} from './supplemental.constants';
import type { SupplementalAnswers } from './supplemental-draft';
import { latestApprovedPlan } from './supplemental-eligibility';
import type {
  SupplementalOrderType,
  SupplementalParentSnapshot,
} from './supplemental.types';

/** What a new child order and its request start with. */
export interface ChildDefaults {
  archTreatment: ArchTreatment | null;
  patientStage: PatientStage | null;
  answers: Partial<SupplementalAnswers> & {
    sourceTreatmentPlanVersion?: number | null;
  };
}

/**
 * Server defaults of a new request (pure). Only answers with a safe,
 * conventional default are prefilled; every question that needs the
 * doctor's judgement (the starred ones) starts unanswered.
 */
export function creationDefaults(
  type: SupplementalOrderType,
  parent: Pick<
    SupplementalParentSnapshot,
    'archTreatment' | 'patientStage' | 'approvedPlans'
  >,
): ChildDefaults {
  switch (type) {
    case OrderType.additional_aligners:
      return {
        archTreatment: parent.archTreatment ?? ArchTreatment.both,
        patientStage: PatientStage.refinement,
        answers: {
          movementRestriction: SupplementalTeethScope.none,
          apRelationshipRight: SupplementalApCorrection.maintain,
          apRelationshipLeft: SupplementalApCorrection.maintain,
          attachmentPolicy: SupplementalAttachmentPlan.as_needed,
          iprPolicy: SupplementalIprPlan.as_needed,
          apOptions: [],
        },
      };
    case OrderType.replacement:
      return {
        archTreatment: null,
        patientStage: parent.patientStage,
        answers: {
          quantity: QUANTITY_RANGE.replacement.min,
          urgency: SupplementalUrgency.standard,
        },
      };
    case OrderType.transfer_template: {
      const plan = latestApprovedPlan(parent);
      return {
        archTreatment: null,
        patientStage: parent.patientStage,
        answers: {
          quantity: QUANTITY_RANGE.transfer_template.min,
          sourceTreatmentPlanId: plan?.id ?? null,
          sourceTreatmentPlanVersion: plan?.version ?? null,
        },
      };
    }
    case OrderType.warranty:
      return {
        archTreatment: null,
        patientStage: parent.patientStage,
        answers: {},
      };
  }
}

/** The rejected warranty a paid replacement is built from. */
export interface ConvertedWarranty {
  orderCode: string;
  archTreatment: ArchTreatment | null;
  replacementFromAligner: number | null;
}

/**
 * The paid replacement of a rejected warranty: the defective aligner of
 * the same arch, once, at standard urgency, its origin in the details.
 */
export function warrantyReplacementDefaults(
  warranty: ConvertedWarranty,
  parent: Pick<SupplementalParentSnapshot, 'patientStage'>,
): ChildDefaults {
  return {
    archTreatment: warranty.archTreatment,
    patientStage: parent.patientStage,
    answers: {
      replacementFromAligner: warranty.replacementFromAligner,
      replacementToAligner: warranty.replacementFromAligner,
      quantity: QUANTITY_RANGE.replacement.min,
      replacementReason: ReplacementReason.other,
      reasonDetails: warrantyConversionNote(warranty.orderCode),
      urgency: SupplementalUrgency.standard,
    },
  };
}
