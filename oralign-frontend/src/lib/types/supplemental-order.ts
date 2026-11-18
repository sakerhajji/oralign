import type { DentalOrder } from './entities';
import type {
  ArchTreatment,
  OrderStatus,
  OrderType,
  ReplacementReason,
  SupplementalApCorrection,
  SupplementalApOption,
  SupplementalAttachmentPlan,
  SupplementalClinicalObjective,
  SupplementalContactPurpose,
  SupplementalCoverageStatus,
  SupplementalCutoutPlan,
  SupplementalExistingAttachments,
  SupplementalImpressionMethod,
  SupplementalIprPlan,
  SupplementalPreviousIpr,
  SupplementalRequestReason,
  SupplementalResidualSpaces,
  SupplementalReviewStatus,
  SupplementalTeethScope,
  SupplementalToothPurpose,
  SupplementalUrgency,
  TransferTemplatePurpose,
  WarrantyDefectCategory,
} from './enums';

/** Every order type except the initial case: the four supplemental kinds. */
export type SupplementalKind = Exclude<OrderType, OrderType.INITIAL>;

/** A tooth the doctor selected on the request, with what it means. */
export interface SupplementalToothSelection {
  purpose: SupplementalToothPurpose;
  /** FDI number (11–18, 21–28, 31–38, 41–48). */
  toothNumber: number;
}

/** A contact between two adjacent teeth, `fromTooth < toTooth`. */
export interface SupplementalToothContact {
  purpose: SupplementalContactPurpose;
  fromTooth: number;
  toTooth: number;
  amountMm: number;
}

/** The request columns that the doctor fills in the wizard. */
export interface SupplementalRequestAnswers {
  reason: SupplementalRequestReason | null;
  reasonDetails: string | null;
  currentUpperAligner: number | null;
  currentLowerAligner: number | null;
  passiveOppositeArch: boolean | null;
  newUpperScan: boolean | null;
  newLowerScan: boolean | null;
  clinicalObjective: SupplementalClinicalObjective | null;
  movementRestriction: SupplementalTeethScope | null;
  apRelationshipRight: SupplementalApCorrection | null;
  apRelationshipLeft: SupplementalApCorrection | null;
  apOptions: SupplementalApOption[];
  elasticCutouts: boolean | null;
  attachmentPolicy: SupplementalAttachmentPlan | null;
  existingAttachmentPolicy: SupplementalExistingAttachments | null;
  iprPolicy: SupplementalIprPlan | null;
  previousIpr: SupplementalPreviousIpr | null;
  precisionCutPolicy: SupplementalCutoutPlan | null;
  residualSpacePolicy: SupplementalResidualSpaces | null;
  upperInstructions: string | null;
  lowerInstructions: string | null;
  impressionMethod: SupplementalImpressionMethod | null;
  replacementFromAligner: number | null;
  replacementToAligner: number | null;
  quantity: number | null;
  replacementReason: ReplacementReason | null;
  urgency: SupplementalUrgency | null;
  transferPurpose: TransferTemplatePurpose | null;
  transferNotes: string | null;
  /** Every defective aligner of a warranty claim, ascending. */
  defectiveAligners: number[];
  warrantyDefectCategory: WarrantyDefectCategory | null;
  /** Calendar day 'YYYY-MM-DD' (ISO instant accepted when reading). */
  warrantyDiscoveredAt: string | null;
  warrantyLotReference: string | null;
  warrantyComments: string | null;
  teeth: SupplementalToothSelection[];
  contacts: SupplementalToothContact[];
}

/** `SupplementalOrderRequest` as the API returns it (no idempotency key). */
export interface SupplementalRequest extends SupplementalRequestAnswers {
  id: string;
  orderId: string;
  createdById: string | null;
  coverageStatus: SupplementalCoverageStatus;
  coverageReason: string | null;
  reviewStatus: SupplementalReviewStatus;
  reviewReason: string | null;
  reviewedAt: string | null;
  reviewedById: string | null;
  reviewedByName?: string | null;
  submittedAt: string | null;
  correctionNumber: number | null;
  sourceTreatmentPlanId: string | null;
  sourceTreatmentPlanVersion: number | null;
  convertedReplacementOrderId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What the caller may do with a request — computed by the server. */
export interface SupplementalPermissions {
  canEdit: boolean;
  canSubmit: boolean;
  canDelete: boolean;
  canReview: boolean;
  canConvert: boolean;
}

export interface SupplementalParentSummary {
  id: string;
  orderCode: string;
  status: OrderStatus;
  orderType: OrderType;
  archTreatment: ArchTreatment | null;
  coverageStartedAt: string | null;
  coverageExpiresAt: string | null;
}

export interface SupplementalOrderView {
  order: DentalOrder;
  request: SupplementalRequest;
  parentOrder: SupplementalParentSummary;
  permissions: SupplementalPermissions;
}

export type SupplementalBlockedReason =
  | 'approved_plan_required'
  | 'parent_not_eligible'
  | 'active_request_exists';

export interface SupplementalKindEligibility {
  allowed: boolean;
  blockedReason: SupplementalBlockedReason | null;
  coverageStatus: SupplementalCoverageStatus;
  /** Why the coverage was decided — never a blocking reason. */
  coverageReason: string | null;
  activeRequestId: string | null;
  correctionNumber: number | null;
  includedRemaining: number | 'unlimited' | null;
}

export interface SupplementalApprovedPlan {
  id: string;
  version: number;
  approvedAt: string | null;
  totalUpperAligners: number | null;
  totalLowerAligners: number | null;
}

/** Highest aligner number per arch: approved plan, else pack, else case total. */
export interface SupplementalAlignerLimits {
  upper: number | null;
  lower: number | null;
  source: 'approved_plan' | 'pack' | 'case' | null;
}

export interface SupplementalEligibility {
  parentOrderId: string;
  canCreate: boolean;
  allowed: boolean;
  reason: string | null;
  coverageStartedAt: string | null;
  coverageExpiresAt: string | null;
  approvedPlan: SupplementalApprovedPlan | null;
  alignerLimits: SupplementalAlignerLimits;
  /** Highest aligner number already handed over, null when none. */
  deliveredUpTo: number | null;
  requests: Record<SupplementalKind, SupplementalKindEligibility>;
}

/**
 * Whole-form PUT body. `undefined` leaves a column unchanged, `null`
 * clears it; `teeth` / `contacts` replace the request's rows.
 */
export type UpdateSupplementalOrderDto = Partial<
  SupplementalRequestAnswers & { archTreatment: ArchTreatment | null }
>;

export type SupplementalReviewDecision =
  | SupplementalReviewStatus.APPROVED
  | SupplementalReviewStatus.REJECTED;

export interface ReviewSupplementalOrderDto {
  decision: SupplementalReviewDecision;
  coverageStatus?: SupplementalCoverageStatus;
  reason?: string;
}
