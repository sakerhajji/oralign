import type {
  ArchTreatment,
  OrderStatus,
  OrderType,
  PatientStage,
  QuotationPaymentStatus,
  QuotationStatus,
  SupplementalContactPurpose,
  SupplementalCoverageStatus,
  SupplementalOrderRequest,
  SupplementalReviewStatus,
  SupplementalToothPurpose,
} from '@prisma/client';
import type { OrderResponseDto } from '../dto/order.dto';

/** The kind of a supplemental child: every order type but the initial case. */
export type SupplementalOrderType = Exclude<OrderType, 'initial'>;

/** One arch: what `ArchTreatment.both` is made of. */
export type SingleArch = Exclude<ArchTreatment, 'both'>;

/** The two outcomes of an admin review. */
export type SupplementalReviewDecision = Extract<
  SupplementalReviewStatus,
  'approved' | 'rejected'
>;

/** A tooth the doctor selected, and why. */
export interface ToothSelection {
  purpose: SupplementalToothPurpose;
  toothNumber: number;
}

/** A contact between two adjacent teeth (fromTooth < toTooth once stored). */
export interface ToothContact {
  purpose: SupplementalContactPurpose;
  fromTooth: number;
  toTooth: number;
  amountMm: number;
}

/** The approved treatment plans of a case, newest version first. */
export interface ApprovedPlan {
  id: string;
  version: number;
  approvedAt: Date | null;
  totalUpperAligners: number | null;
  totalLowerAligners: number | null;
}

/** The parent quotation fields the coverage policy reads (pack snapshot). */
export interface CoverageQuotation {
  status: QuotationStatus;
  paymentStatus: QuotationPaymentStatus;
  treatmentValidityMonths: number | null;
  includedCorrections: number | null;
  isUnlimitedCorrections: boolean;
  /** Pack snapshot: aligners per arch the case was sold with (null = unlimited / unknown). */
  maxStepsPerArch: number | null;
  isUnlimitedSteps: boolean;
}

/** Where the highest valid aligner number of each arch comes from. */
export type AlignerLimitSource = 'approved_plan' | 'pack' | 'case';

/** Highest aligner number per arch a request may name (null: unknown). */
export interface AlignerLimits {
  upper: number | null;
  lower: number | null;
  source: AlignerLimitSource | null;
}

/** A live (not archived) child of the initial case. */
export interface SupplementalChildSummary {
  id: string;
  orderType: OrderType;
  status: OrderStatus;
}

/**
 * Everything the pure rules know about an initial case, loaded once by the
 * repository (inside the transaction that acts on it).
 */
export interface SupplementalParentSnapshot {
  id: string;
  orderCode: string;
  orderType: OrderType;
  parentOrderId: string | null;
  doctorId: string;
  patientId: string;
  assignedDesignerId: string | null;
  status: OrderStatus;
  deletedAt: Date | null;
  createdAt: Date;
  archTreatment: ArchTreatment | null;
  patientStage: PatientStage | null;
  totalAligners: number | null;
  coverageStartedAt: Date | null;
  coverageExpiresAt: Date | null;
  approvedPlans: ApprovedPlan[];
  quotation: CoverageQuotation | null;
  children: SupplementalChildSummary[];
  /** Highest aligner number handed to the patient, null before any hand-over. */
  deliveredUpTo: number | null;
  /** See countConsumedCorrections: the one count of used corrections. */
  consumedCorrections: number;
  /** The numbers those corrections carry (consumedCorrectionNumbers). */
  correctionNumbers: number[];
}

// ── HTTP view ─────────────────────────────────────────────────────────

export interface SupplementalPermissions {
  canEdit: boolean;
  canSubmit: boolean;
  canDelete: boolean;
  canReview: boolean;
  canConvert: boolean;
}

/**
 * The request as clients read it: every column but the idempotency key,
 * with the doctor's teeth and contacts. `warrantyDiscoveredAt` is the
 * calendar day ('YYYY-MM-DD') it was entered as; `convertedReplacementOrderId`
 * is null once that replacement was archived (it can be converted again).
 */
export type SupplementalRequestDto = Omit<
  SupplementalOrderRequest,
  'idempotencyKey' | 'warrantyDiscoveredAt'
> & {
  warrantyDiscoveredAt: string | null;
  teeth: ToothSelection[];
  contacts: ToothContact[];
};

export interface SupplementalParentView {
  id: string;
  orderCode: string;
  status: OrderStatus;
  orderType: OrderType;
  archTreatment: ArchTreatment | null;
  coverageStartedAt: Date | null;
  coverageExpiresAt: Date | null;
}

export interface SupplementalOrderView {
  order: OrderResponseDto;
  request: SupplementalRequestDto;
  parentOrder: SupplementalParentView;
  permissions: SupplementalPermissions;
}

/** Why a new request of one kind cannot start (null: it can). */
export type SupplementalBlockedReason =
  | 'approved_plan_required'
  | 'parent_not_eligible'
  | 'active_request_exists';

/** Why the server priced a request the way it did (coverage policy). */
export type CoverageReason =
  | 'paid_pack_snapshot_missing'
  | 'structured_validity_unknown'
  | 'coverage_expired'
  | 'within_pack_allowance'
  | 'allowance_unknown'
  | 'included_corrections_exhausted'
  | 'requires_quote'
  | 'warranty_review_required'
  | 'warranty_rejected_doctor_confirmed';

export interface SupplementalCoverage {
  status: SupplementalCoverageStatus;
  reason: CoverageReason;
}

export interface SupplementalKindEligibility {
  allowed: boolean;
  blockedReason: SupplementalBlockedReason | null;
  coverageStatus: SupplementalCoverageStatus;
  coverageReason: CoverageReason;
  activeRequestId: string | null;
  /** Rank the request would take if approved as included. */
  correctionNumber: number | null;
  includedRemaining: number | 'unlimited' | null;
}

export interface SupplementalEligibility {
  parentOrderId: string;
  canCreate: boolean;
  allowed: boolean;
  reason: Exclude<SupplementalBlockedReason, 'active_request_exists'> | null;
  coverageStartedAt: Date | null;
  coverageExpiresAt: Date | null;
  approvedPlan: ApprovedPlan | null;
  /** Highest aligner number per arch: approved plan, else pack, else case total. */
  alignerLimits: AlignerLimits;
  deliveredUpTo: number | null;
  requests: Record<SupplementalOrderType, SupplementalKindEligibility>;
}
