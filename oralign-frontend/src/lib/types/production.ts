// Lab production API types: a one-to-one mirror of the backend contract
// oralign-backend/src/production/production.contract.ts (and the request
// DTOs in src/production/dto). FOUNDATION-OWNED and frozen: change both
// sides in the same commit (production-build/CONTRACT.md).
//
// Instants are ISO 8601 strings; business days are 'YYYY-MM-DD' on the
// Africa/Tunis calendar (lib/utils/business-day.ts). Absent = null.
// Nothing here carries money, payment, a file path or patient contact.

import type {
  ArchTreatment,
  Gender,
  OrderStatus,
  OrderType,
  PatientStage,
  ReplacementReason,
  SupplementalApCorrection,
  SupplementalApOption,
  SupplementalAttachmentPlan,
  SupplementalClinicalObjective,
  SupplementalContactPurpose,
  SupplementalCutoutPlan,
  SupplementalExistingAttachments,
  SupplementalImpressionMethod,
  SupplementalIprPlan,
  SupplementalPreviousIpr,
  SupplementalRequestReason,
  SupplementalResidualSpaces,
  SupplementalTeethScope,
  SupplementalToothPurpose,
  SupplementalUrgency,
  ToothInstructionType,
  TransferTemplatePurpose,
  UserRole,
  WarrantyDefectCategory,
} from './enums';
import type { OrderFileCategory } from './billing';
import type { MediaProcessingStatus, MediaVariants } from './entities';
import type { TreatmentAttachmentCategory } from './treatment-plan';

// ── Enumerations (Prisma enums) ────────────────────────────────────────

/** The four acts, in workshop order. */
export const PRODUCTION_EVENT_TYPES = [
  'model_printed',
  'aligner_thermoformed',
  'aligner_cut',
  'aligner_delivered',
] as const;
export type ProductionEventType = (typeof PRODUCTION_EVENT_TYPES)[number];

export const PRODUCTION_ARCHES = ['upper', 'lower'] as const;
export type ProductionArch = (typeof PRODUCTION_ARCHES)[number];

/** The form's arch choice: `both` writes one row per arch. */
export type ProductionArchChoice = ProductionArch | 'both';

export const DELIVERY_RECIPIENTS = ['practitioner', 'courier', 'patient'] as const;
export type DeliveryRecipient = (typeof DELIVERY_RECIPIENTS)[number];

/** legacy_batch = imported at go-live from batches already delivered. */
export type ProductionEventOrigin = 'declared' | 'legacy_batch';

export type ProductionNoticeKind = 'delivered' | 'correction';
export type ProductionNoticeChannel = 'in_app' | 'email';
export const PRODUCTION_NOTICE_STATUSES = [
  'pending',
  'sending',
  'sent',
  'failed',
  'skipped',
] as const;
export type ProductionNoticeStatus = (typeof PRODUCTION_NOTICE_STATUSES)[number];

// ── Error and warning codes ────────────────────────────────────────────

/** `errorCode` of the production endpoints (HTTP status in CONTRACT.md). */
export const PRODUCTION_ERROR = {
  STEPS_NOT_RELEASED: 'STEPS_NOT_RELEASED',
  PRODUCTION_CONFIRM_REQUIRED: 'PRODUCTION_CONFIRM_REQUIRED',
  NOTE_REQUIRED: 'NOTE_REQUIRED',
  ORDER_NOT_IN_PRODUCTION: 'ORDER_NOT_IN_PRODUCTION',
  CANCEL_WINDOW_PASSED: 'CANCEL_WINDOW_PASSED',
  CANCEL_NOT_OWN_EVENT: 'CANCEL_NOT_OWN_EVENT',
  STEP_BEYOND_PLANNED_TOTAL: 'STEP_BEYOND_PLANNED_TOTAL',
  INVALID_STEP_RANGE: 'INVALID_STEP_RANGE',
  PERFORMED_AT_OUT_OF_RANGE: 'PERFORMED_AT_OUT_OF_RANGE',
  // Shared date codes (backend common/time/business-day.ts): the declare
  // form's day/time and every admin period.
  INVALID_DATE: 'INVALID_DATE',
  INVALID_TIME: 'INVALID_TIME',
  INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
  IDEMPOTENCY_KEY_REQUIRED: 'PRODUCTION_IDEMPOTENCY_KEY_REQUIRED',
  IDEMPOTENCY_KEY_REUSED: 'PRODUCTION_IDEMPOTENCY_KEY_REUSED',
  NOTICE_NOT_RETRYABLE: 'NOTICE_NOT_RETRYABLE',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  PLAN_TOTALS_REQUIRED: 'PLAN_TOTALS_REQUIRED',
  TEMPORARY_PASSWORD_TECHNICIAN_ONLY: 'TEMPORARY_PASSWORD_TECHNICIAN_ONLY',
  BATCH_NEEDS_NO_DELIVERY: 'BATCH_NEEDS_NO_DELIVERY',
} as const;
export type ProductionErrorCode =
  (typeof PRODUCTION_ERROR)[keyof typeof PRODUCTION_ERROR];

/** Warnings that need a confirmation AND a note (stored on the row). */
export const PRODUCTION_WARNINGS = [
  'previous_stage_missing',
  'already_declared',
  'quantity_differs',
  'beyond_planned_total',
  'arch_not_treated',
  'steps_not_released',
] as const;
export type ProductionWarningCode = (typeof PRODUCTION_WARNINGS)[number];

/** Body of the 409 PRODUCTION_CONFIRM_REQUIRED. */
export interface ProductionConfirmRequiredBody {
  statusCode: 409;
  message: string;
  errorCode: 'PRODUCTION_CONFIRM_REQUIRED';
  warnings: ProductionWarningCode[];
  timestamp: string;
}

// ── Shared building blocks ─────────────────────────────────────────────

export type ActCounterKey = 'printed' | 'thermoformed' | 'cut' | 'delivered';
export type ActCounters = Record<ActCounterKey, number>;

export interface ArchPair<T> {
  upper: T;
  lower: T;
}

export type PlannedSource = 'approved_plan' | 'pack' | 'case';

export interface PlannedTotal {
  total: number | null;
  source: PlannedSource | null;
  /** true unless the approved plan gave it ("provisoire"). */
  provisional: boolean;
}

/** null = the arch is not treated ("—"). */
export type PlannedTotals = ArchPair<PlannedTotal | null>;

export type ProductionOrderKind = 'main' | 'supplemental';

/** Same envelope as PaginatedResponse. */
export interface ProductionPage<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ProductionOrderRef {
  orderId: string;
  orderCode: string;
  kind: ProductionOrderKind;
  orderType: OrderType;
  patientName: string;
}

export interface ActTotal {
  entries: number;
  quantity: number;
}
export type ActTotals = Record<ProductionEventType, ActTotal>;

// ── Events ─────────────────────────────────────────────────────────────

export interface ProductionEventView {
  id: string;
  orderId: string;
  declarationId: string;
  type: ProductionEventType;
  arch: ProductionArch;
  stepFrom: number;
  stepTo: number;
  quantity: number;
  performedAt: string;
  createdAt: string;
  createdById: string | null;
  createdByName: string | null;
  createdByRole: UserRole | null;
  deliveredTo: DeliveryRecipient | null;
  deliveredToName: string | null;
  note: string | null;
  warnings: ProductionWarningCode[];
  origin: ProductionEventOrigin;
  notifiedAt: string | null;
  cancelledAt: string | null;
  cancelledById: string | null;
  cancelledByName: string | null;
  cancelReason: string | null;
  /** The caller may cancel it now (computed by the server). */
  canCancel: boolean;
}

export interface ProductionEventWithOrder extends ProductionEventView {
  order: ProductionOrderRef;
}

// ── Queue ──────────────────────────────────────────────────────────────

export type ProductionQueueTab = 'active' | 'done';

export interface ProductionOrderSummary {
  orderId: string;
  orderCode: string;
  kind: ProductionOrderKind;
  orderType: OrderType;
  parentOrderId: string | null;
  parentOrderCode: string | null;
  patientName: string;
  practitionerName: string;
  /** Raw status: show a production label, never the payment phase names. */
  status: OrderStatus;
  archTreatment: ArchTreatment | null;
  treatedArches: ProductionArch[];
  planned: PlannedTotals;
  counters: ArchPair<ActCounters>;
  lastActionAt: string | null;
  deliveryComplete: boolean;
  /** Which steps the workshop may work on (spec §3). */
  release: ProductionReleaseSummary;
}

export type ProductionQueueItem = ProductionOrderSummary;
export type ProductionQueuePage = ProductionPage<ProductionQueueItem>;

// ── Release block (spec §3) ────────────────────────────────────────────
// Mirrors backend production.contract.ts: `release` on the queue items and
// the case sheet (« Plan 1→7 · Débloquées 1→4 · Prochaine tranche 5→7 »).

/**
 * none: nothing released (batches all locked, an unlimited pack before
 * anything is paid); partial: some steps, a locked tranche (or a planned
 * step outside every batch) left; all: every planned step; unscheduled:
 * no batches and everything released (legacy).
 */
export type ProductionReleaseState = 'none' | 'partial' | 'all' | 'unscheduled';

export interface ProductionStepSpan {
  from: number;
  to: number;
}

export interface ProductionArchRelease {
  /** 1 → planned total; null while the total is unknown. */
  total: ProductionStepSpan | null;
  /** Shown « provisoire »: a provisional total never trims. */
  provisional: boolean;
  /** Merged, each batch trimmed to the arch's approved total; all / unscheduled: [total]. */
  unlocked: ProductionStepSpan[];
  /** End of the last unlocked span; null = nothing workable. */
  workableTo: number | null;
}

export interface ProductionReleaseSummary {
  state: ProductionReleaseState;
  /** null for an arch the case does not treat. */
  arches: ArchPair<ProductionArchRelease | null>;
  /** The lowest locked tranche, trimmed to the plan; null when none (always on an unlimited pack). */
  next: ProductionStepSpan | null;
}

export interface ProductionQueueParams {
  tab?: ProductionQueueTab;
  search?: string;
  page?: number;
  /** Page size (the repo's name for it), 1-100, default 20. */
  limit?: number;
}

// ── Case sheet ─────────────────────────────────────────────────────────

export type ReleasedRangeState = 'locked' | 'released' | 'delivered';

export interface ReleasedRange {
  from: number;
  to: number;
  state: ReleasedRangeState;
}

export interface ProductionDeclareWindow {
  earliestDay: string;
  latestDay: string;
}

export interface ProductionCaseSheet extends ProductionOrderSummary {
  clinicName: string | null;
  firstActionAt: string | null;
  /** Ascending; each range ends at the highest approved total (null without batches). */
  releasedRanges: ReleasedRange[] | null;
  /** The lowest RELEASED uncovered step per act and arch; null when none is left to do. */
  nextStepFrom: Record<ProductionEventType, ArchPair<number | null>>;
  canDeclare: boolean;
  cannotDeclareReason: 'ORDER_NOT_IN_PRODUCTION' | null;
  declareWindow: ProductionDeclareWindow;
  history: ProductionEventView[];
  sheetVersion: string;
}

// ── Declare / cancel ───────────────────────────────────────────────────

/** POST production/events body (with an Idempotency-Key header). */
export interface DeclareProductionEventInput {
  orderId: string;
  type: ProductionEventType;
  arch: ProductionArchChoice;
  stepFrom: number;
  stepTo: number;
  quantity?: number;
  /** With performedTime, or neither (server time). */
  performedDay?: string;
  /** 'HH:mm', Tunis wall clock. */
  performedTime?: string;
  note?: string;
  /** Required for aligner_delivered. */
  deliveredTo?: DeliveryRecipient;
  deliveredToName?: string;
  /** The codes of the 409 PRODUCTION_CONFIRM_REQUIRED the user confirmed. */
  confirmWarnings?: ProductionWarningCode[];
}

export interface ProductionDeclareResult {
  events: ProductionEventView[];
  counters: ArchPair<ActCounters>;
  sheetVersion: string;
  replayed: boolean;
}

/** PATCH production/events/:id/cancel body. */
export interface CancelProductionEventInput {
  /** 3-500 characters. */
  reason: string;
  alsoSibling?: boolean;
}

export interface ProductionCancelResult {
  events: ProductionEventView[];
  counters: ArchPair<ActCounters>;
  sheetVersion: string;
}

// ── Ma journée ─────────────────────────────────────────────────────────

export type ProductionMyDayChoice = 'today' | 'yesterday';

export interface ProductionMyDay {
  day: string;
  totals: ActTotals;
  events: ProductionEventWithOrder[];
}

// ── Dossier (finance-free) ─────────────────────────────────────────────

export type ProductionFileVariant = 'thumb' | 'md' | 'lg' | 'avif' | 'model';

/**
 * No stored name or path (they rebuild the disk path): a download is named
 * by the server's Content-Disposition (`<category>-<NNN><ext>`).
 */
export interface ProductionFileView {
  id: string;
  category: OrderFileCategory;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  orderIndex: number;
  width: number | null;
  height: number | null;
  processingStatus: MediaProcessingStatus | null;
  variants: MediaVariants | null;
  mediaMetadata: Record<string, unknown> | null;
}

export interface ProductionPlanAttachmentView {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  category: TreatmentAttachmentCategory;
  createdAt: string;
  width: number | null;
  height: number | null;
  processingStatus: MediaProcessingStatus | null;
}

export interface ProductionPlanIprView {
  fromTooth: number;
  toTooth: number;
  value: string;
  note: string | null;
}

export interface ProductionPlanView {
  id: string;
  version: number;
  name: string;
  approvedAt: string | null;
  totalUpperAligners: number | null;
  totalLowerAligners: number | null;
  resultViewUrl: string | null;
  hasMovementTable: boolean;
  hasDentalTable: boolean;
  ipr: ProductionPlanIprView[];
  attachments: ProductionPlanAttachmentView[];
}

export interface ProductionToothInstructionView {
  toothNumber: number;
  type: ToothInstructionType;
  value: string | null;
  note: string | null;
}

export interface ProductionSupplementalAnswers {
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
  sourceTreatmentPlanVersion: number | null;
  transferPurpose: TransferTemplatePurpose | null;
  transferNotes: string | null;
  defectiveAligners: number[];
  warrantyDefectCategory: WarrantyDefectCategory | null;
  warrantyDiscoveredAt: string | null;
  warrantyLotReference: string | null;
  warrantyComments: string | null;
  teeth: { purpose: SupplementalToothPurpose; toothNumber: number }[];
  /** `iprMm` (the request's amountMm, renamed: no key reads as money). */
  contacts: {
    purpose: SupplementalContactPurpose;
    fromTooth: number;
    toTooth: number;
    iprMm: number;
  }[];
}

export interface ProductionDossier {
  order: {
    orderId: string;
    orderCode: string;
    orderType: OrderType;
    kind: ProductionOrderKind;
    parentOrderId: string | null;
    parentOrderCode: string | null;
    status: OrderStatus;
    createdAt: string;
    submittedAt: string | null;
    patientStage: PatientStage | null;
    archTreatment: ArchTreatment | null;
    treatBothArch: boolean;
    treatedArches: ProductionArch[];
    chiefComplaint: string | null;
    treatmentPlan: string | null;
    dontMoveOption: string | null;
    apRelationship: string | null;
    anteroposteriorRelationship: string | null;
    elastics: string | null;
    openBite: string | null;
    midline: string | null;
    ipr: string | null;
    biteRamps: string | null;
    expansion: string | null;
    crossbite: string | null;
    spaces: string | null;
    extractions: string | null;
    specialInstructions: string | null;
    additionalInstructions: string | null;
    materials: string[];
    useCbctWithScans: boolean;
    wantsManufacturing: boolean;
    totalAligners: number | null;
  };
  patient: { fullName: string; gender: Gender | null; age: number | null };
  practitioner: { fullName: string; clinicName: string | null };
  toothInstructions: ProductionToothInstructionView[];
  files: ProductionFileView[];
  plan: ProductionPlanView | null;
  supplementalRequest: ProductionSupplementalAnswers | null;
}

// ── Admin desk ─────────────────────────────────────────────────────────

/** Tunis days, both included; from = to is the journal. */
export interface ProductionPeriodParams {
  from: string;
  to: string;
}

export interface ProductionCaseTotals extends ProductionOrderRef {
  acts: ActTotals;
}

export interface ProductionAuthorTotals {
  userId: string | null;
  name: string | null;
  role: UserRole | null;
  acts: ActTotals;
}

export interface ProductionDayTotals {
  day: string;
  acts: ActTotals;
}

export interface ProductionSummary {
  from: string;
  to: string;
  mode: 'journal' | 'recap';
  totals: ActTotals;
  consumption: { plates: number; models: number };
  byDay: ProductionDayTotals[];
  byCase: ProductionCaseTotals[];
  byAuthor: ProductionAuthorTotals[];
  events: ProductionEventWithOrder[] | null;
  cancelled: ProductionEventWithOrder[];
}

export type ProductionProgressState = 'all' | 'active' | 'done';

export interface ProductionProgressParams {
  search?: string;
  state?: ProductionProgressState;
  page?: number;
  limit?: number;
}

/** The admin "Avancement" row: no `release` (queue and case sheet only). */
export interface ProductionProgressRow extends Omit<ProductionOrderSummary, 'release'> {
  remaining: ArchPair<number | null>;
  firstActionAt: string | null;
  inQueue: boolean;
}

export type ProductionProgressPage = ProductionPage<ProductionProgressRow>;

export const PRODUCTION_ANOMALY_KINDS = [
  'stage_skipped',
  'duplicate_declaration',
  // ANY act (detail names it) confirmed with steps_not_released (spec §3);
  // the key keeps its historic name.
  'unreleased_delivery',
  'confirmed_warning',
  'cancelled_event',
  'notice_failed',
  'notice_skipped',
  'finished_incomplete',
  'planned_total_unknown',
  'coverage_started_by_cancelled_delivery',
  'batch_kept_after_cancel',
] as const;
export type ProductionAnomalyKind = (typeof PRODUCTION_ANOMALY_KINDS)[number];

export interface ProductionAnomaly {
  kind: ProductionAnomalyKind;
  orderId: string;
  orderCode: string;
  patientName: string;
  arch: ProductionArch | null;
  steps: { from: number; to: number }[] | null;
  eventIds: string[];
  noticeId: string | null;
  warnings: ProductionWarningCode[];
  at: string;
  /**
   * Short machine detail; its meaning depends on `kind`:
   * - duplicate_declaration, unreleased_delivery, confirmed_warning,
   *   cancelled_event: the rows' act code (ProductionEventType);
   * - stage_skipped: the LATER act (the one missing is the backend's
   *   PREVIOUS_ACT[detail], mirrored in anomalies-view.tsx);
   * - coverage_started_by_cancelled_delivery: the coverage start, ISO instant;
   * - batch_kept_after_cancel: the batch's steps as "from-to";
   * - notice_failed: the provider's lastError; notice_skipped: the skipReason;
   * - finished_incomplete, planned_total_unknown: null.
   */
  detail: string | null;
}

export interface ProductionAnomalies {
  from: string;
  to: string;
  items: ProductionAnomaly[];
  countsByKind: Record<ProductionAnomalyKind, number>;
}

export type ProductionExportFormat = 'detail' | 'daily';

export interface ProductionExportParams extends ProductionPeriodParams {
  format?: ProductionExportFormat;
}

export interface ProductionNoticeView {
  id: string;
  orderId: string;
  orderCode: string;
  declarationId: string;
  eventIds: string[];
  kind: ProductionNoticeKind;
  channel: ProductionNoticeChannel;
  status: ProductionNoticeStatus;
  skipReason: string | null;
  recipientAddress: string | null;
  attempts: number;
  lastError: string | null;
  notBefore: string;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  retryable: boolean;
}

export type ProductionNoticePage = ProductionPage<ProductionNoticeView>;

export interface ProductionNoticesParams {
  status?: ProductionNoticeStatus;
  /**
   * true: failed for good (status failed and out of attempts: no automatic
   * retry left); false: every other notice. Combines with `status` (AND).
   */
  exhausted?: boolean;
  page?: number;
  limit?: number;
}
