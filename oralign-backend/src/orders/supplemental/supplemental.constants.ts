import {
  OrderFileCategory,
  OrderStatus,
  OrderType,
  SupplementalApOption,
  SupplementalAttachmentPlan,
  SupplementalContactPurpose,
  SupplementalCutoutPlan,
  SupplementalExistingAttachments,
  SupplementalIprPlan,
  SupplementalPreviousIpr,
  SupplementalResidualSpaces,
  SupplementalReviewStatus,
  SupplementalTeethScope,
  SupplementalToothPurpose,
  type SupplementalOrderRequest,
} from '@prisma/client';
import { ORDER_KIND_ERROR } from '../order-kind';
import { CLOSED_ORDER_STATUSES } from '../order-status-groups';
import type {
  CoverageReason,
  SupplementalBlockedReason,
  SupplementalOrderType,
  SupplementalReviewDecision,
} from './supplemental.types';

export const SUPPLEMENTAL_ORDER_TYPES = [
  OrderType.additional_aligners,
  OrderType.replacement,
  OrderType.transfer_template,
  OrderType.warranty,
] as const satisfies readonly SupplementalOrderType[];

export function isSupplementalOrderType(
  type: OrderType,
): type is SupplementalOrderType {
  return (SUPPLEMENTAL_ORDER_TYPES as readonly OrderType[]).includes(type);
}

export const SUPPLEMENTAL_REVIEW_DECISIONS = [
  SupplementalReviewStatus.approved,
  SupplementalReviewStatus.rejected,
] as const satisfies readonly SupplementalReviewDecision[];

/** Child order code: `${parentCode}-${suffix}-${NN}`. */
export const SUPPLEMENTAL_CODE_SUFFIX: Record<SupplementalOrderType, string> = {
  additional_aligners: 'ADD',
  replacement: 'REP',
  transfer_template: 'TRF',
  warranty: 'WAR',
};
export const SUPPLEMENTAL_CODE_SEQUENCE_DIGITS = 2;

// ── Statuses ──────────────────────────────────────────────────────────

/**
 * A child in one of these no longer counts as the open request of its kind
 * (a draft does count: one open request per kind per case).
 */
export const CLOSED_REQUEST_STATUSES = CLOSED_ORDER_STATUSES;

/**
 * Ends that undo a request: a correction consumed by an approval is given
 * back when its order ends here. `finished` keeps it: it was delivered.
 */
export const ABANDONED_ORDER_STATUSES: readonly OrderStatus[] =
  CLOSED_ORDER_STATUSES.filter((status) => status !== OrderStatus.finished);

/**
 * A case in one of these has left the planning stage even when no
 * approved plan is on file in ORALIGN (plans made outside the app, cases
 * imported before plans existed): the treatment was accepted, quoted, paid,
 * made or handed over, so supplemental requests are possible.
 */
export const PLANNING_PASSED_STATUSES: readonly OrderStatus[] = [
  OrderStatus.treatment_approved,
  OrderStatus.approved,
  OrderStatus.quotation_sent,
  OrderStatus.payment_plan_selected,
  OrderStatus.payment_pending,
  OrderStatus.payment_review,
  OrderStatus.paid,
  OrderStatus.fabrication,
  OrderStatus.ready_to_ship,
  OrderStatus.shipped,
  OrderStatus.finished,
];

/** An initial case in one of these accepts no supplemental request. */
export const PARENT_INELIGIBLE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.draft,
  ...ABANDONED_ORDER_STATUSES,
];

/** Order status a child takes when an admin decides on it. */
export const REVIEWED_ORDER_STATUS: Record<
  SupplementalReviewDecision,
  OrderStatus
> = {
  approved: OrderStatus.under_review,
  rejected: OrderStatus.rejected,
};

// ── Files ─────────────────────────────────────────────────────────────

/** Every photo category (a warranty accepts any of them as evidence). */
export const PHOTO_CATEGORIES: readonly OrderFileCategory[] = [
  OrderFileCategory.right_photo,
  OrderFileCategory.front_photo,
  OrderFileCategory.left_photo,
  OrderFileCategory.upper_photo,
  OrderFileCategory.lower_photo,
];

/**
 * An upload slot of the shared order uploader. The uploader stores each
 * file as `<key>__<client name>` (see services/upload-slot.ts). A file
 * without a slot prefix (an API client, an older upload) fills the slot
 * only through `fallbackCategory`, set where no other slot of the uploader
 * shares that category.
 */
export interface UploadSlot {
  key: string;
  fallbackCategory: OrderFileCategory | null;
}

/**
 * MIRRORS the slot keys of
 * oralign-frontend/src/components/orders/order-file-upload.tsx
 * (patientImageSlots / stlSlots): rename a key there, rename it here.
 *
 * The five intraoral views a refinement needs. The frontal and left views
 * have no category fallback: the extraoral 'smile' and 'profile' slots are
 * stored as front_photo and left_photo too.
 */
export const INTRAORAL_PHOTO_SLOTS: readonly UploadSlot[] = [
  { key: 'right-lateral', fallbackCategory: OrderFileCategory.right_photo },
  { key: 'frontal-occlusion', fallbackCategory: null },
  { key: 'left-lateral', fallbackCategory: null },
  { key: 'upper-occlusal', fallbackCategory: OrderFileCategory.upper_photo },
  { key: 'lower-occlusal', fallbackCategory: OrderFileCategory.lower_photo },
];

/**
 * Bite-registration slots (same mirror as above): STL files that record
 * the occlusion, not a new scan of an arch.
 */
export const BITE_REGISTRATION_SLOT_KEYS: readonly string[] = [
  'first-occlusion',
  'second-occlusion',
];

/**
 * Warranty photo slots (same mirror): `aligner-<n>` shows aligner n, the
 * label slot shows the pouch and proves nothing about an aligner.
 */
export const ALIGNER_PHOTO_SLOT = /^aligner-(\d+)$/;
export const ALIGNER_LABEL_SLOT_KEY = 'aligner-label';

export const SCAN_FILE_CATEGORIES: readonly OrderFileCategory[] = [
  OrderFileCategory.stl,
  OrderFileCategory.ply,
  OrderFileCategory.obj,
  OrderFileCategory.zip,
];

/** Any of these proves a warranty defect. */
export const WARRANTY_EVIDENCE_CATEGORIES: readonly OrderFileCategory[] = [
  ...PHOTO_CATEGORIES,
  OrderFileCategory.image,
];

// ── Teeth and contacts ────────────────────────────────────────────────

const quadrant = (first: number): number[] =>
  Array.from({ length: 8 }, (_, index) => first + index);

/** FDI numbers of the permanent dentition: 11-18, 21-28, 31-38, 41-48. */
export const PERMANENT_TEETH: readonly number[] = [
  ...quadrant(11),
  ...quadrant(21),
  ...quadrant(31),
  ...quadrant(41),
];

/**
 * FDI quadrants of the upper arch (11-18, 21-28); 3 and 4 are the lower
 * one. A request treating one arch holds teeth and contacts of that arch
 * only.
 */
export const UPPER_ARCH_QUADRANTS: readonly number[] = [1, 2];

/** The two contacts that cross the midline (central incisors). */
export const MIDLINE_CONTACTS: readonly (readonly [number, number])[] = [
  [11, 21],
  [31, 41],
];

/** The answers that can ask for teeth or contacts. */
export type DetailOwnerField = keyof Pick<
  SupplementalOrderRequest,
  | 'movementRestriction'
  | 'attachmentPolicy'
  | 'existingAttachmentPolicy'
  | 'iprPolicy'
  | 'previousIpr'
  | 'precisionCutPolicy'
  | 'residualSpacePolicy'
>;

/** `field` set to `value` asks for the detail; null: always asked. */
export interface DetailOwner {
  field: DetailOwnerField;
  value: string;
}

/**
 * THE option → detail table (one row per detail purpose). A detail whose
 * owning answer is not selected is dropped on every draft save; a selected
 * owner with no detail blocks the submission.
 */
export const SUPPLEMENTAL_DETAIL_OWNERS = {
  teeth: {
    do_not_move: {
      field: 'movementRestriction',
      value: SupplementalTeethScope.selected_teeth,
    },
    no_attachment: {
      field: 'attachmentPolicy',
      value: SupplementalAttachmentPlan.avoid_selected_teeth,
    },
    remove_attachment: {
      field: 'existingAttachmentPolicy',
      value: SupplementalExistingAttachments.remove_selected,
    },
    no_ipr: {
      field: 'iprPolicy',
      value: SupplementalIprPlan.avoid_selected_teeth,
    },
    cutout: {
      field: 'precisionCutPolicy',
      value: SupplementalCutoutPlan.selected_teeth,
    },
    transfer_tray: null,
  } satisfies Record<SupplementalToothPurpose, DetailOwner | null>,
  contacts: {
    performed_ipr: {
      field: 'previousIpr',
      value: SupplementalPreviousIpr.different,
    },
    residual_space: {
      field: 'residualSpacePolicy',
      value: SupplementalResidualSpaces.close_specified,
    },
  } satisfies Record<SupplementalContactPurpose, DetailOwner>,
} as const;

export const ALLOWED_TOOTH_PURPOSES: Record<
  SupplementalOrderType,
  readonly SupplementalToothPurpose[]
> = {
  additional_aligners: [
    SupplementalToothPurpose.do_not_move,
    SupplementalToothPurpose.no_attachment,
    SupplementalToothPurpose.remove_attachment,
    SupplementalToothPurpose.no_ipr,
    SupplementalToothPurpose.cutout,
  ],
  replacement: [],
  transfer_template: [SupplementalToothPurpose.transfer_tray],
  warranty: [],
};

export const ALLOWED_CONTACT_PURPOSES: Record<
  SupplementalOrderType,
  readonly SupplementalContactPurpose[]
> = {
  additional_aligners: [
    SupplementalContactPurpose.performed_ipr,
    SupplementalContactPurpose.residual_space,
  ],
  replacement: [],
  transfer_template: [],
  warranty: [],
};

export interface NumberRange {
  min: number;
  max: number;
}

/** Amount of a contact, in mm, per purpose (column is DECIMAL(4,2)). */
export const CONTACT_AMOUNT_MM: Record<
  SupplementalContactPurpose,
  NumberRange
> = {
  performed_ipr: { min: 0.05, max: 2 },
  residual_space: { min: 0.05, max: 9.99 },
};
export const CONTACT_AMOUNT_DECIMALS = 2;

// ── Answers ───────────────────────────────────────────────────────────

/** Therapeutic options that make the elastic cut-out question relevant. */
export const ELASTIC_CUTOUT_OPTIONS: readonly SupplementalApOption[] = [
  SupplementalApOption.elastics_simulation,
  SupplementalApOption.sequential_distalization,
];

/** Aligners per replacement / transfer trays per request. */
export const QUANTITY_RANGE = {
  replacement: { min: 1, max: 10 },
  transfer_template: { min: 1, max: 5 },
} as const satisfies Partial<Record<SupplementalOrderType, NumberRange>>;

export const ALIGNER_NUMBER_MAX = 999;
export const SHORT_TEXT_MAX = 120;
export const REASON_TEXT_MAX = 1000;
export const NOTES_TEXT_MAX = 2000;
export const CLINICAL_TEXT_MAX = 3000;

// ── Idempotency ───────────────────────────────────────────────────────

/** Same shape as the generic order create (order.service.ts). */
export const IDEMPOTENCY_KEY_SHAPE = /^[A-Za-z0-9_-]{8,128}$/;
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
/** An archived draft frees its key: `archived_<requestId>_<key>`. */
export const ARCHIVED_KEY_PREFIX = 'archived_';
/** The paid replacement of a rejected warranty is keyed on the warranty. */
export const WARRANTY_CONVERSION_KEY_PREFIX = 'warranty-';
/**
 * Prefixes only the server writes. A client key carrying one could pose as
 * a released key (never released again) or take the key a warranty
 * conversion needs, so the Idempotency-Key header refuses them.
 */
export const SERVER_KEY_PREFIXES: readonly string[] = [
  ARCHIVED_KEY_PREFIX,
  WARRANTY_CONVERSION_KEY_PREFIX,
];

// ── Reasons, errors, audit ────────────────────────────────────────────

export const COVERAGE_REASON = {
  PAID_PACK_SNAPSHOT_MISSING: 'paid_pack_snapshot_missing',
  STRUCTURED_VALIDITY_UNKNOWN: 'structured_validity_unknown',
  COVERAGE_EXPIRED: 'coverage_expired',
  WITHIN_PACK_ALLOWANCE: 'within_pack_allowance',
  ALLOWANCE_UNKNOWN: 'allowance_unknown',
  INCLUDED_CORRECTIONS_EXHAUSTED: 'included_corrections_exhausted',
  REQUIRES_QUOTE: 'requires_quote',
  WARRANTY_REVIEW_REQUIRED: 'warranty_review_required',
  WARRANTY_REJECTED_DOCTOR_CONFIRMED: 'warranty_rejected_doctor_confirmed',
} as const satisfies Record<string, CoverageReason>;

export const BLOCKED_REASON = {
  APPROVED_PLAN_REQUIRED: 'approved_plan_required',
  PARENT_NOT_ELIGIBLE: 'parent_not_eligible',
  ACTIVE_REQUEST_EXISTS: 'active_request_exists',
} as const satisfies Record<string, SupplementalBlockedReason>;

/**
 * Error codes of the supplemental flows (the frontend translates by code;
 * messages stay English). The ones the generic order flows throw too come
 * from order-kind.ts, so each code is spelled once.
 */
export const SUPPLEMENTAL_ERROR = {
  IDEMPOTENCY_KEY_REQUIRED: 'SUPPLEMENTAL_IDEMPOTENCY_KEY_REQUIRED',
  IDEMPOTENCY_KEY_REUSED: 'SUPPLEMENTAL_IDEMPOTENCY_KEY_REUSED',
  PARENT_NOT_INITIAL: 'SUPPLEMENTAL_PARENT_NOT_INITIAL',
  NOT_ALLOWED: 'SUPPLEMENTAL_NOT_ALLOWED',
  ACTIVE_REQUEST_EXISTS: ORDER_KIND_ERROR.ACTIVE_REQUEST_EXISTS,
  NOT_DRAFT: 'SUPPLEMENTAL_NOT_DRAFT',
  NOT_PENDING: 'SUPPLEMENTAL_NOT_PENDING',
  FORBIDDEN: 'SUPPLEMENTAL_FORBIDDEN',
  INCOMPLETE: 'SUPPLEMENTAL_INCOMPLETE',
  INVALID_DRAFT: 'SUPPLEMENTAL_INVALID_DRAFT',
  COVERAGE_NOT_ALLOWED: 'SUPPLEMENTAL_COVERAGE_NOT_ALLOWED',
  REJECTION_REASON_REQUIRED: 'SUPPLEMENTAL_REJECTION_REASON_REQUIRED',
  ALLOWANCE_EXHAUSTED: 'SUPPLEMENTAL_ALLOWANCE_EXHAUSTED',
  CONVERSION_NOT_ALLOWED: 'SUPPLEMENTAL_CONVERSION_NOT_ALLOWED',
  DEDICATED_FLOW: ORDER_KIND_ERROR.DEDICATED_FLOW,
  ACTIVE_CHILDREN: ORDER_KIND_ERROR.ACTIVE_CHILDREN,
  TREATMENT_FEE_INITIAL_ONLY: ORDER_KIND_ERROR.TREATMENT_FEE_INITIAL_ONLY,
} as const;

/** OrderAuditLog actions; `child_*` rows land on the initial case. */
export const SUPPLEMENTAL_AUDIT_ACTION = {
  CREATED: 'supplemental_created',
  CHILD_CREATED: 'supplemental_child_created',
  DRAFT_UPDATED: 'supplemental_draft_updated',
  DRAFT_ARCHIVED: 'supplemental_draft_archived',
  CHILD_ARCHIVED: 'supplemental_child_archived',
  SUBMITTED: 'supplemental_submitted',
  CHILD_SUBMITTED: 'supplemental_child_submitted',
  REVIEWED: 'supplemental_reviewed',
  CHILD_REVIEWED: 'supplemental_child_reviewed',
  CONVERTED: 'supplemental_converted',
} as const;

/** reasonDetails of the paid replacement a rejected warranty becomes. */
export function warrantyConversionNote(
  warrantyCode: string,
  aligners: readonly number[],
): string {
  const note = `Garantie refusée ${warrantyCode}`;
  return aligners.length > 1
    ? `${note} (aligneurs ${aligners.join(', ')})`
    : note;
}
