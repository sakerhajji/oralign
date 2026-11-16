import {
  SupplementalApCorrection,
  SupplementalClinicalObjective,
  SupplementalContactPurpose,
  SupplementalImpressionMethod,
  SupplementalRequestReason,
  SupplementalToothPurpose,
} from '@/lib/types';
import { INTRAORAL_PHOTO_SLOTS, SCAN_FILE_CATEGORIES } from '../supplemental-constants';
import {
  asksElasticCutouts,
  isSingleArch,
  treatsLower,
  treatsUpper,
  type SupplementalDraft,
} from '../supplemental-draft';
import {
  alignerNumberError,
  compact,
  contactsError,
  detailsError,
  isBlank,
  required,
  teethError,
} from './rule-helpers';
import { VALIDATION_KEY, type ValidationContext, type Validator } from './validation-types';

/** Q1 reason, Q2 aligner worn per treated arch. */
export const situation: Validator = (draft, context) =>
  compact({
    reason: required(draft.reason === null),
    reasonDetails: detailsError(
      draft.reason === SupplementalRequestReason.OTHER,
      draft.reasonDetails,
    ),
    currentUpperAligner: treatsUpper(draft.archTreatment)
      ? alignerNumberError(draft.currentUpperAligner, ['upper'], context)
      : undefined,
    currentLowerAligner: treatsLower(draft.archTreatment)
      ? alignerNumberError(draft.currentLowerAligner, ['lower'], context)
      : undefined,
  });

/**
 * A treated arch whose aligner worn (Q2, step 1) is still empty — e.g. an
 * arch added in Q3 after step 1 asked only for the case's arch.
 */
function missingCurrentAligner(draft: SupplementalDraft): boolean {
  return (
    (treatsUpper(draft.archTreatment) && draft.currentUpperAligner === null) ||
    (treatsLower(draft.archTreatment) && draft.currentLowerAligner === null)
  );
}

/** Q3 arches (+ opposite arch for one arch), Q4 new records, Q5 set-up. */
export const arches: Validator = (draft) =>
  compact({
    archTreatment:
      required(draft.archTreatment === null) ??
      (missingCurrentAligner(draft) ? VALIDATION_KEY.currentAlignerMissing : undefined),
    passiveOppositeArch: required(
      isSingleArch(draft.archTreatment) && draft.passiveOppositeArch === null,
    ),
    newUpperScan: required(draft.newUpperScan === null),
    newLowerScan: required(draft.newLowerScan === null),
    clinicalObjective: required(draft.clinicalObjective === null),
  });

/** Q6 restrictions (+ teeth), Q7 A-P per side and the cut-out follow-up. */
export const movement: Validator = (draft) =>
  compact(
    {
      movementRestriction: required(draft.movementRestriction === null),
      apRelationshipRight: required(draft.apRelationshipRight === null),
      apRelationshipLeft: required(draft.apRelationshipLeft === null),
      elasticCutouts: required(
        asksElasticCutouts(draft.apOptions) && draft.elasticCutouts === null,
      ),
    },
    teethError(draft, SupplementalToothPurpose.DO_NOT_MOVE),
  );

/** Q8, Q9, Q10 with their teeth and contacts. */
export const attachments: Validator = (draft) =>
  compact(
    {
      attachmentPolicy: required(draft.attachmentPolicy === null),
      existingAttachmentPolicy: required(draft.existingAttachmentPolicy === null),
      iprPolicy: required(draft.iprPolicy === null),
      previousIpr: required(draft.previousIpr === null),
    },
    teethError(draft, SupplementalToothPurpose.NO_ATTACHMENT),
    teethError(draft, SupplementalToothPurpose.REMOVE_ATTACHMENT),
    teethError(draft, SupplementalToothPurpose.NO_IPR),
    contactsError(draft, SupplementalContactPurpose.PERFORMED_IPR),
  );

/**
 * Answers that only make sense with written instructions: a treatment plan
 * change (Q1 says "to be detailed in the instructions"), a new goal (Q5),
 * a full canine + molar correction on either side (Q7).
 */
export function needsInstructions(draft: SupplementalDraft): boolean {
  return (
    draft.reason === SupplementalRequestReason.TREATMENT_PLAN_CHANGE ||
    draft.clinicalObjective === SupplementalClinicalObjective.NEW_GOAL ||
    draft.apRelationshipRight === SupplementalApCorrection.IMPROVE_CANINE_MOLAR ||
    draft.apRelationshipLeft === SupplementalApCorrection.IMPROVE_CANINE_MOLAR
  );
}

/** Q11 cut-outs, Q12 residual spaces, Q13 instructions when called for. */
export const finishing: Validator = (draft) =>
  compact(
    {
      precisionCutPolicy: required(draft.precisionCutPolicy === null),
      residualSpacePolicy: required(draft.residualSpacePolicy === null),
      upperInstructions:
        needsInstructions(draft) &&
        isBlank(draft.upperInstructions) &&
        isBlank(draft.lowerInstructions)
          ? VALIDATION_KEY.instructions
          : undefined,
    },
    teethError(draft, SupplementalToothPurpose.CUTOUT),
    contactsError(draft, SupplementalContactPurpose.RESIDUAL_SPACE),
  );

export function countScanFiles(files: ValidationContext['files']): number {
  return files.filter((file) => SCAN_FILE_CATEGORIES.includes(file.category)).length;
}

/** Scan files expected: one per arch announced as rescanned in Q4. */
export function expectedScanFiles(draft: SupplementalDraft): number {
  return [draft.newUpperScan, draft.newLowerScan].filter(Boolean).length;
}

/** Records: the method, and the scan files it implies. */
export const scans: Validator = (draft, context) =>
  compact({
    impressionMethod: required(draft.impressionMethod === null),
    scanFiles:
      draft.impressionMethod === SupplementalImpressionMethod.INTRAORAL_SCAN &&
      countScanFiles(context.files) < expectedScanFiles(draft)
        ? VALIDATION_KEY.scanFiles
        : undefined,
  });

/** Intraoral views not uploaded yet (their slot title keys). */
export function missingIntraoralPhotos(files: ValidationContext['files']): string[] {
  return INTRAORAL_PHOTO_SLOTS.filter(
    (slot) =>
      !files.some(
        (file) =>
          file.originalName.startsWith(`${slot.slotKey}__`) ||
          (slot.fallbackCategory !== null &&
            file.category === slot.fallbackCategory &&
            !file.originalName.includes('__')),
      ),
  ).map((slot) => slot.titleKey);
}

/** The five intraoral views, each in its own slot. */
export const photos: Validator = (_draft, context) =>
  compact({
    photos:
      missingIntraoralPhotos(context.files).length > 0 ? VALIDATION_KEY.photos : undefined,
  });
