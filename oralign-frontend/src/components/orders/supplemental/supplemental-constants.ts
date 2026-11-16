import {
  CirclePlus,
  RefreshCw,
  ShieldCheck,
  Stamp,
  type LucideIcon,
} from 'lucide-react';
import {
  OrderFileCategory,
  OrderType,
  SupplementalAttachmentPlan,
  SupplementalContactPurpose,
  SupplementalCoverageStatus,
  SupplementalCutoutPlan,
  SupplementalExistingAttachments,
  SupplementalIprPlan,
  SupplementalPreviousIpr,
  SupplementalResidualSpaces,
  SupplementalReviewStatus,
  SupplementalTeethScope,
  SupplementalToothPurpose,
  ToothInstructionType,
  type SupplementalKind,
} from '@/lib/types';

export const SUPPLEMENTAL_KINDS: readonly SupplementalKind[] = [
  OrderType.ADDITIONAL_ALIGNERS,
  OrderType.REPLACEMENT,
  OrderType.TRANSFER_TEMPLATE,
  OrderType.WARRANTY,
];

export function isSupplementalKind(value: unknown): value is SupplementalKind {
  return SUPPLEMENTAL_KINDS.some((kind) => kind === value);
}

export const KIND_ICON: Record<SupplementalKind, LucideIcon> = {
  [OrderType.ADDITIONAL_ALIGNERS]: RefreshCw,
  [OrderType.REPLACEMENT]: CirclePlus,
  [OrderType.TRANSFER_TEMPLATE]: Stamp,
  [OrderType.WARRANTY]: ShieldCheck,
};

/**
 * Coverage stays an estimate until the administration decides: while the
 * request is a draft or awaits review, an admin may still change it.
 */
export function isCoverageEstimate(status: SupplementalReviewStatus): boolean {
  return (
    status === SupplementalReviewStatus.DRAFT ||
    status === SupplementalReviewStatus.PENDING
  );
}

// ─── Teeth and contacts (SPEC §1.4) ─────────────────────────────────

/** Odontogram swatch used to paint each tooth purpose. */
export const TOOTH_PURPOSE_COLOR: Record<SupplementalToothPurpose, ToothInstructionType> = {
  [SupplementalToothPurpose.DO_NOT_MOVE]: ToothInstructionType.DO_NOT_MOVE,
  [SupplementalToothPurpose.NO_ATTACHMENT]: ToothInstructionType.NO_ATTACHMENTS,
  [SupplementalToothPurpose.REMOVE_ATTACHMENT]: ToothInstructionType.ATTACHMENT,
  [SupplementalToothPurpose.NO_IPR]: ToothInstructionType.NO_IPR,
  [SupplementalToothPurpose.CUTOUT]: ToothInstructionType.PRECISION_CUT,
  [SupplementalToothPurpose.TRANSFER_TRAY]: ToothInstructionType.ATTACHMENT,
};

/** The answer that asks for details, e.g. Q6 "do not move these teeth". */
type OwningOption =
  | { field: 'movementRestriction'; option: SupplementalTeethScope }
  | { field: 'attachmentPolicy'; option: SupplementalAttachmentPlan }
  | { field: 'existingAttachmentPolicy'; option: SupplementalExistingAttachments }
  | { field: 'iprPolicy'; option: SupplementalIprPlan }
  | { field: 'previousIpr'; option: SupplementalPreviousIpr }
  | { field: 'precisionCutPolicy'; option: SupplementalCutoutPlan }
  | { field: 'residualSpacePolicy'; option: SupplementalResidualSpaces };

/** `null`: the details are always asked for (transfer tray teeth). */
export const TOOTH_PURPOSE_OWNER: Record<SupplementalToothPurpose, OwningOption | null> = {
  [SupplementalToothPurpose.DO_NOT_MOVE]: {
    field: 'movementRestriction',
    option: SupplementalTeethScope.SELECTED_TEETH,
  },
  [SupplementalToothPurpose.NO_ATTACHMENT]: {
    field: 'attachmentPolicy',
    option: SupplementalAttachmentPlan.AVOID_SELECTED_TEETH,
  },
  [SupplementalToothPurpose.REMOVE_ATTACHMENT]: {
    field: 'existingAttachmentPolicy',
    option: SupplementalExistingAttachments.REMOVE_SELECTED,
  },
  [SupplementalToothPurpose.NO_IPR]: {
    field: 'iprPolicy',
    option: SupplementalIprPlan.AVOID_SELECTED_TEETH,
  },
  [SupplementalToothPurpose.CUTOUT]: {
    field: 'precisionCutPolicy',
    option: SupplementalCutoutPlan.SELECTED_TEETH,
  },
  [SupplementalToothPurpose.TRANSFER_TRAY]: null,
};

export const CONTACT_PURPOSE_OWNER: Record<SupplementalContactPurpose, OwningOption> = {
  [SupplementalContactPurpose.PERFORMED_IPR]: {
    field: 'previousIpr',
    option: SupplementalPreviousIpr.DIFFERENT,
  },
  [SupplementalContactPurpose.RESIDUAL_SPACE]: {
    field: 'residualSpacePolicy',
    option: SupplementalResidualSpaces.CLOSE_SPECIFIED,
  },
};

export const KIND_TOOTH_PURPOSES: Record<SupplementalKind, readonly SupplementalToothPurpose[]> = {
  [OrderType.ADDITIONAL_ALIGNERS]: [
    SupplementalToothPurpose.DO_NOT_MOVE,
    SupplementalToothPurpose.NO_ATTACHMENT,
    SupplementalToothPurpose.REMOVE_ATTACHMENT,
    SupplementalToothPurpose.NO_IPR,
    SupplementalToothPurpose.CUTOUT,
  ],
  [OrderType.REPLACEMENT]: [],
  [OrderType.TRANSFER_TEMPLATE]: [SupplementalToothPurpose.TRANSFER_TRAY],
  [OrderType.WARRANTY]: [],
};

export const KIND_CONTACT_PURPOSES: Record<SupplementalKind, readonly SupplementalContactPurpose[]> = {
  [OrderType.ADDITIONAL_ALIGNERS]: [
    SupplementalContactPurpose.PERFORMED_IPR,
    SupplementalContactPurpose.RESIDUAL_SPACE,
  ],
  [OrderType.REPLACEMENT]: [],
  [OrderType.TRANSFER_TEMPLATE]: [],
  [OrderType.WARRANTY]: [],
};

/** Accepted contact amounts in mm, per purpose (server rule). */
export const CONTACT_AMOUNT_RANGE: Record<SupplementalContactPurpose, { min: number; max: number }> = {
  [SupplementalContactPurpose.PERFORMED_IPR]: { min: 0.05, max: 2 },
  [SupplementalContactPurpose.RESIDUAL_SPACE]: { min: 0.05, max: 9.99 },
};

/** Decimals a contact amount keeps (DECIMAL(4,2) column, DTO rule). */
export const CONTACT_AMOUNT_DECIMALS = 2;

// ─── Limits mirrored from the update DTO ────────────────────────────

export const TEXT_LIMITS = {
  reasonDetails: 1000,
  instructions: 3000,
  transferNotes: 2000,
  warrantyLotReference: 120,
  warrantyComments: 3000,
  reviewReason: 1000,
} as const;

export const ALIGNER_NUMBER_MAX = 999;

export const QUANTITY_RANGE = {
  [OrderType.REPLACEMENT]: { min: 1, max: 10 },
  [OrderType.TRANSFER_TEMPLATE]: { min: 1, max: 5 },
} as const;

// ─── Files ──────────────────────────────────────────────────────────

/**
 * The five intraoral views a refinement needs. `slotKey` is the prefix
 * `ClinicalOrderFiles` gives each upload (`<slotKey>__<name>`);
 * `fallbackCategory` is set only where no other slot shares the
 * category, so an unprefixed legacy file still counts.
 */
export const INTRAORAL_PHOTO_SLOTS = [
  { slotKey: 'right-lateral', titleKey: 'orderForm.files.slots.rightLateral', fallbackCategory: OrderFileCategory.RIGHT_PHOTO },
  { slotKey: 'frontal-occlusion', titleKey: 'orderForm.files.slots.frontalOcclusion', fallbackCategory: null },
  { slotKey: 'left-lateral', titleKey: 'orderForm.files.slots.leftLateral', fallbackCategory: null },
  { slotKey: 'upper-occlusal', titleKey: 'orderForm.files.slots.upperOcclusal', fallbackCategory: OrderFileCategory.UPPER_PHOTO },
  { slotKey: 'lower-occlusal', titleKey: 'orderForm.files.slots.lowerOcclusal', fallbackCategory: OrderFileCategory.LOWER_PHOTO },
] as const;

export const SCAN_FILE_CATEGORIES: readonly OrderFileCategory[] = [
  OrderFileCategory.STL,
  OrderFileCategory.PLY,
  OrderFileCategory.OBJ,
  OrderFileCategory.ZIP,
];

export const EVIDENCE_PHOTO_CATEGORIES: readonly OrderFileCategory[] = [
  OrderFileCategory.RIGHT_PHOTO,
  OrderFileCategory.FRONT_PHOTO,
  OrderFileCategory.LEFT_PHOTO,
  OrderFileCategory.UPPER_PHOTO,
  OrderFileCategory.LOWER_PHOTO,
  OrderFileCategory.IMAGE,
];

// ─── Review ─────────────────────────────────────────────────────────

/** Coverage an admin may grant when approving, per kind (SPEC §2.3). */
export const APPROVAL_COVERAGE: Record<SupplementalKind, readonly SupplementalCoverageStatus[]> = {
  [OrderType.ADDITIONAL_ALIGNERS]: [
    SupplementalCoverageStatus.INCLUDED,
    SupplementalCoverageStatus.CHARGEABLE,
  ],
  [OrderType.REPLACEMENT]: [SupplementalCoverageStatus.CHARGEABLE],
  [OrderType.TRANSFER_TEMPLATE]: [SupplementalCoverageStatus.CHARGEABLE],
  [OrderType.WARRANTY]: [SupplementalCoverageStatus.WARRANTY_APPROVED],
};

/** Autosave fires this long after the last change. */
export const AUTOSAVE_DELAY_MS = 1500;
