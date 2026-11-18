import {
  OrderType,
  ReplacementReason,
  SupplementalToothPurpose,
  TransferTemplatePurpose,
} from '@/lib/types';
import {
  ALIGNER_LABEL_SLOT_KEY,
  EVIDENCE_PHOTO_CATEGORIES,
  QUANTITY_RANGE,
  alignerOfSlot,
} from '../supplemental-constants';
import { isSingleArch, type SupplementalDraft } from '../supplemental-draft';
import {
  alignerNumberError,
  compact,
  detailsError,
  isBlank,
  quantityError,
  required,
  teethError,
  treatedArches,
} from './rule-helpers';
import { VALIDATION_KEY, type ValidationContext, type Validator } from './validation-types';

/** Replacement: arch, a delivered range valid on every treated arch, copies, reason, priority. */
export const replacementDetails: Validator = (draft, context) => {
  const from = draft.replacementFromAligner;
  const to = draft.replacementToAligner;
  const archList = treatedArches(draft.archTreatment);
  return compact({
    archTreatment: required(draft.archTreatment === null),
    replacementFromAligner: alignerNumberError(from, archList, context),
    replacementToAligner:
      alignerNumberError(to, archList, context) ??
      (from !== null && to !== null && to < from ? VALIDATION_KEY.rangeOrder : undefined),
    quantity: quantityError(draft.quantity, QUANTITY_RANGE[OrderType.REPLACEMENT]),
    replacementReason: required(draft.replacementReason === null),
    reasonDetails: detailsError(
      draft.replacementReason === ReplacementReason.OTHER,
      draft.reasonDetails,
    ),
    urgency: required(draft.urgency === null),
  });
};

/** Transfer tray: arch, purpose ("Other" needs notes), number of trays. */
export const transferDetails: Validator = (draft) =>
  compact({
    archTreatment: required(draft.archTreatment === null),
    transferPurpose: required(draft.transferPurpose === null),
    transferNotes: detailsError(
      draft.transferPurpose === TransferTemplatePurpose.OTHER,
      draft.transferNotes,
    ),
    quantity: quantityError(draft.quantity, QUANTITY_RANGE[OrderType.TRANSFER_TEMPLATE]),
  });

export const transferTeeth: Validator = (draft) =>
  compact(teethError(draft, SupplementalToothPurpose.TRANSFER_TRAY));

function discoveredAtError(day: string, context: ValidationContext): string | undefined {
  if (isBlank(day)) return VALIDATION_KEY.required;
  if (day > context.today) return VALIDATION_KEY.dateFuture;
  if (context.caseOpenedOn !== null && day < context.caseOpenedOn) {
    return VALIDATION_KEY.dateBeforeCase;
  }
  return undefined;
}

function defectiveAlignersError(draft: SupplementalDraft, context: ValidationContext) {
  if (draft.defectiveAligners.length === 0) return VALIDATION_KEY.defectiveAligners;
  const arches = treatedArches(draft.archTreatment);
  return draft.defectiveAligners
    .map((aligner) => alignerNumberError(aligner, arches, context))
    .find(Boolean);
}

/** Warranty: one arch, delivered aligners, the defect, a past date, a description. */
export const warrantyDetails: Validator = (draft, context) =>
  compact({
    archTreatment: required(!isSingleArch(draft.archTreatment)),
    defectiveAligners: defectiveAlignersError(draft, context),
    warrantyDefectCategory: required(draft.warrantyDefectCategory === null),
    warrantyDiscoveredAt: discoveredAtError(draft.warrantyDiscoveredAt, context),
    warrantyComments: required(isBlank(draft.warrantyComments)),
  });

/**
 * A photo that can prove the claim: not the pouch label, not an aligner no
 * longer claimed. Photos from before the aligner slots still count.
 */
function showsClaimedAligner(
  file: ValidationContext['files'][number],
  claimed: readonly number[],
): boolean {
  if (!EVIDENCE_PHOTO_CATEGORIES.includes(file.category)) return false;
  const slotKey = file.originalName.includes('__')
    ? file.originalName.split('__')[0].toLowerCase()
    : null;
  if (slotKey === ALIGNER_LABEL_SLOT_KEY) return false;
  const aligner = slotKey ? alignerOfSlot(slotKey) : null;
  return aligner === null || claimed.includes(aligner);
}

export const evidencePhotos: Validator = (draft, context) =>
  compact({
    photos: context.files.some((file) => showsClaimedAligner(file, draft.defectiveAligners))
      ? undefined
      : VALIDATION_KEY.evidencePhotos,
  });
