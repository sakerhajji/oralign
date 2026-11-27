import type {
  ArchTreatment,
  DeliveryRecipient,
  Gender,
  MediaProcessingStatus,
  OrderFileCategory,
  OrderStatus,
  OrderType,
  PatientStage,
  ProductionArch,
  ProductionEventOrigin,
  ProductionEventType,
  ProductionNoticeChannel,
  ProductionNoticeKind,
  ProductionNoticeStatus,
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
  TreatmentAttachmentCategory,
  UserRole,
  WarrantyDefectCategory,
} from '@prisma/client';

/**
 * THE response contract of the lab production API (global prefix /api).
 * FOUNDATION-OWNED and frozen: production-build/CONTRACT.md documents every
 * endpoint against these shapes and the frontend mirrors them one to one in
 * oralign-frontend/src/lib/types/production.ts. A change here is a change
 * there, in the same commit.
 *
 * Conventions:
 *   • instants are ISO 8601 strings (UTC); business days are 'YYYY-MM-DD'
 *     on the Africa/Tunis calendar;
 *   • absent values are `null`, never omitted;
 *   • NO key of a technician-reachable shape may match
 *     PRODUCTION_FORBIDDEN_KEY (production.constants.ts): no money, no
 *     payment, no path, no patient contact. The admin-only shapes are
 *     marked as such.
 */

// ── Error and warning codes ────────────────────────────────────────────

/**
 * `errorCode` values of the production endpoints (and of the account
 * changes they depend on). HTTP status in the comment.
 */
export const PRODUCTION_ERROR = {
  /**
   * 409. A technician declared an act (print, thermoform, cut or delivery,
   * spec §3) on steps whose batch is still locked. Neutral message, no
   * amount. Admins get the confirmable warning steps_not_released instead.
   */
  STEPS_NOT_RELEASED: 'STEPS_NOT_RELEASED',
  /** 409. Warnings apply that the request did not confirm; the body lists them (ProductionConfirmRequiredBody). */
  PRODUCTION_CONFIRM_REQUIRED: 'PRODUCTION_CONFIRM_REQUIRED',
  /** 400. Warnings were confirmed but the note is empty. */
  NOTE_REQUIRED: 'NOTE_REQUIRED',
  /** 409 on a write, 403 on a read: the order is not (or no longer) a production case for this caller. */
  ORDER_NOT_IN_PRODUCTION: 'ORDER_NOT_IN_PRODUCTION',
  /** 403. A technician's own row is older than 24 h (from createdAt). */
  CANCEL_WINDOW_PASSED: 'CANCEL_WINDOW_PASSED',
  /** 403. A technician tried to cancel a row she did not declare. */
  CANCEL_NOT_OWN_EVENT: 'CANCEL_NOT_OWN_EVENT',
  /** 400. A technician named a step above the approved plan's total. */
  STEP_BEYOND_PLANNED_TOTAL: 'STEP_BEYOND_PLANNED_TOTAL',
  /** 400. stepFrom < 1, stepFrom > stepTo, or a range wider than MAX_PRODUCTION_STEP. */
  INVALID_STEP_RANGE: 'INVALID_STEP_RANGE',
  /** 400. performedAt in the future (beyond the skew), before the backdating floor, or before the order existed. */
  PERFORMED_AT_OUT_OF_RANGE: 'PERFORMED_AT_OUT_OF_RANGE',
  /** 400. A Tunis day that is not a real calendar date (common/time/business-day.ts). */
  INVALID_DATE: 'INVALID_DATE',
  /** 400. A wall-clock time that is not HH:mm (common/time/business-day.ts). */
  INVALID_TIME: 'INVALID_TIME',
  /** 400. An admin period whose `to` is before `from`, or longer than MAX_REPORT_DAYS. */
  INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
  /** 400. POST production/events without a well-formed Idempotency-Key header. */
  IDEMPOTENCY_KEY_REQUIRED: 'PRODUCTION_IDEMPOTENCY_KEY_REQUIRED',
  /** 409. The Idempotency-Key was already used by this caller for a different declaration. */
  IDEMPOTENCY_KEY_REUSED: 'PRODUCTION_IDEMPOTENCY_KEY_REUSED',
  /** 409. Retry asked on a notice that is sent, in flight, or skipped because its delivery was cancelled. */
  NOTICE_NOT_RETRYABLE: 'NOTICE_NOT_RETRYABLE',
  /** 403. The account runs on a temporary password (auth PasswordChangeGuard). */
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  /** 400. mark-ready without the per-arch totals of the treated arches; body `missing: ProductionArch[]`. */
  PLAN_TOTALS_REQUIRED: 'PLAN_TOTALS_REQUIRED',
  /** 409. POST users/:id/temporary-password on an account that is not a technician. */
  TEMPORARY_PASSWORD_TECHNICIAN_ONLY: 'TEMPORARY_PASSWORD_TECHNICIAN_ONLY',
  /** 409. "Marquer livré" on a batch wholly beyond the approved totals while the case has no live delivery yet: it is delivered with the case's first delivery. */
  BATCH_NEEDS_NO_DELIVERY: 'BATCH_NEEDS_NO_DELIVERY',
} as const;
export type ProductionErrorCode =
  (typeof PRODUCTION_ERROR)[keyof typeof PRODUCTION_ERROR];

/**
 * Non-blocking findings on a declaration. Each one needs the user's
 * confirmation AND a note; the confirmed codes are stored on the row
 * (ProductionEvent.warnings) and shown in "Écarts".
 */
export const PRODUCTION_WARNING = {
  /** Steps of this arch the previous act does not cover (thermoformed without printed, …). */
  previous_stage_missing: 'previous_stage_missing',
  /** Overlap with a non-cancelled event of the same act and arch (reprint, re-cut, re-delivery). */
  already_declared: 'already_declared',
  /** quantity ≠ stepTo - stepFrom + 1. */
  quantity_differs: 'quantity_differs',
  /** Above the planned total: always when it is provisional; for an admin also when it is the approved plan's. */
  beyond_planned_total: 'beyond_planned_total',
  /** The arch is not treated (archTreatment). */
  arch_not_treated: 'arch_not_treated',
  /**
   * ADMIN ONLY: any act on steps whose batch is locked (the journaled
   * override: confirmed with a note, stored on the row, listed in
   * « Écarts »). A technician gets 409 STEPS_NOT_RELEASED instead.
   */
  steps_not_released: 'steps_not_released',
} as const;
export type ProductionWarningCode =
  (typeof PRODUCTION_WARNING)[keyof typeof PRODUCTION_WARNING];

/** Body of the 409 PRODUCTION_CONFIRM_REQUIRED (AppException details). */
export interface ProductionConfirmRequiredBody {
  statusCode: 409;
  message: string;
  errorCode: typeof PRODUCTION_ERROR.PRODUCTION_CONFIRM_REQUIRED;
  /** Union over the declaration's rows, in PRODUCTION_WARNING order. */
  warnings: ProductionWarningCode[];
  timestamp: string;
}

// ── Shared building blocks ─────────────────────────────────────────────

/** The form's arch choice; `both` writes two rows sharing a declarationId. */
export type ProductionArchChoice = ProductionArch | 'both';

export type ActCounterKey = 'printed' | 'thermoformed' | 'cut' | 'delivered';

/** Distinct steps covered by the non-cancelled events of each act, for one arch. */
export type ActCounters = Record<ActCounterKey, number>;

export interface ArchPair<T> {
  upper: T;
  lower: T;
}

/** Where a planned total comes from, best first (resolvePlannedTotals). */
export type PlannedSource = 'approved_plan' | 'pack' | 'case';

/** Planned aligners of one TREATED arch. */
export interface PlannedTotal {
  /** null when no source knows it ("X livrés à ce jour"). */
  total: number | null;
  source: PlannedSource | null;
  /** true unless the approved plan gave it ("provisoire" in the UI). */
  provisional: boolean;
}

/** Per arch; null = the arch is not treated ("—"). */
export type PlannedTotals = ArchPair<PlannedTotal | null>;

/** 'main' = an initial case; 'supplemental' = a child order (parentOrderCode set). */
export type ProductionOrderKind = 'main' | 'supplemental';

/** Same envelope as the repo's PaginatedResponse (common/dto/response.dto.ts). */
export interface ProductionPage<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** What a row of another list needs to name its case. */
export interface ProductionOrderRef {
  orderId: string;
  orderCode: string;
  kind: ProductionOrderKind;
  orderType: OrderType;
  patientName: string;
}

/** Non-cancelled rows of one act: how many entries, and Σ quantity. */
export interface ActTotal {
  entries: number;
  quantity: number;
}
export type ActTotals = Record<ProductionEventType, ActTotal>;

// ── Events ─────────────────────────────────────────────────────────────

/** One ProductionEvent row as every production screen shows it. */
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
  /** First time a notice channel reached the practitioner (deliveries only). */
  notifiedAt: string | null;
  cancelledAt: string | null;
  cancelledById: string | null;
  cancelledByName: string | null;
  /** Shown to staff only; never sent to the practitioner (D8). */
  cancelReason: string | null;
  /** The CALLER may cancel it now (admin: any live row; technician: her own, < 24 h). */
  canCancel: boolean;
}

export interface ProductionEventWithOrder extends ProductionEventView {
  order: ProductionOrderRef;
}

// ── GET production/queue ───────────────────────────────────────────────

export type ProductionQueueTab = 'active' | 'done';

/** The head every per-case list shares (queue item, progress row, sheet). */
export interface ProductionOrderSummary {
  orderId: string;
  orderCode: string;
  kind: ProductionOrderKind;
  orderType: OrderType;
  parentOrderId: string | null;
  parentOrderCode: string | null;
  patientName: string;
  practitionerName: string;
  /** Raw status. Technician screens show a production label, never the payment phase names. */
  status: OrderStatus;
  archTreatment: ArchTreatment | null;
  /** Resolved arches (treatedArches()): never empty. */
  treatedArches: ProductionArch[];
  planned: PlannedTotals;
  counters: ArchPair<ActCounters>;
  /** Latest performedAt of a non-cancelled event (ProductionProgress). */
  lastActionAt: string | null;
  /** Every treated arch has a known total and delivered >= total (count-based). */
  deliveryComplete: boolean;
  /** Which steps the workshop may work on (spec §3): releaseSummaryOf(). */
  release: ProductionReleaseSummary;
}

export type ProductionQueueItem = ProductionOrderSummary;
export type ProductionQueuePage = ProductionPage<ProductionQueueItem>;

// ── Release block (spec §3; frozen in P0, built by P-C) ─────────────────
// `release` on ProductionOrderSummary (queue cards, the queue table, the
// sheet header: « Plan 1→7 · Débloquées 1→4 · Prochaine tranche 5→7 » /
// « Aucune tranche débloquée »), computed by releaseSummaryOf()
// (production-state.ts) from the SAME reading the declare rules use.
// Technician-reachable: no key may match PRODUCTION_FORBIDDEN_KEY.

/**
 * none: nothing is released (batches all locked; an unlimited pack before
 * anything is paid; a case without batches that is neither paid nor in a
 * production status);
 * partial: some released steps, and a locked batch (or a planned step
 * outside every batch) is left;
 * all: every planned step is (an unlimited pack once anything is paid);
 * unscheduled: no batches and everything released (legacy production-
 * status case, or a fully paid quote without a schedule).
 */
export type ProductionReleaseState = 'none' | 'partial' | 'all' | 'unscheduled';

/** An inclusive span of aligner steps. */
export interface ProductionStepSpan {
  from: number;
  to: number;
}

/** One arch of the release block. */
export interface ProductionArchRelease {
  /** 1 → the arch's planned total; null while the total is unknown. */
  total: ProductionStepSpan | null;
  /** The total is not final yet (shown « provisoire »): it does not trim. */
  provisional: boolean;
  /**
   * Released spans, merged, each batch trimmed to the arch's APPROVED
   * total (batch-coverage.ts). state all / unscheduled: [total] (or []
   * while the total is unknown); none: [].
   */
  unlocked: ProductionStepSpan[];
  /** Last released step (end of the last span): the workable limit; null = none. */
  workableTo: number | null;
}

export interface ProductionReleaseSummary {
  state: ProductionReleaseState;
  /** null for an arch the case does not treat. */
  arches: ArchPair<ProductionArchRelease | null>;
  /**
   * The lowest locked batch that holds a step of the approved plan, its
   * end trimmed to the highest approved total of the treated arches;
   * null when none is locked (and always on an unlimited-step pack, whose
   * batches are payment placeholders, not aligner ranges).
   */
  next: ProductionStepSpan | null;
}

// ── GET production/orders/:orderId (case sheet) ────────────────────────

/** locked = not released yet; released = may be delivered; delivered = batch done. */
export type ReleasedRangeState = 'locked' | 'released' | 'delivered';

/**
 * A step batch of the payment schedule, WITHOUT any amount, its end
 * trimmed to the highest approved total of the treated arches (a batch
 * wholly beyond them is left out).
 */
export interface ReleasedRange {
  from: number;
  to: number;
  state: ReleasedRangeState;
}

/** The Tunis days the caller's date picker may offer (the server re-checks the instant). */
export interface ProductionDeclareWindow {
  earliestDay: string;
  latestDay: string;
}

export interface ProductionCaseSheet extends ProductionOrderSummary {
  clinicName: string | null;
  firstActionAt: string | null;
  /**
   * Ascending by `from`; null when the case has no step batches (or on an
   * unlimited-step pack: read `release`).
   */
  releasedRanges: ReleasedRange[] | null;
  /**
   * Per act and arch: the lowest RELEASED step >= 1 its non-cancelled
   * events do not cover ("de" of the form); null when the arch is not
   * treated, or every released step up to a known planned total is
   * covered (the rest, if any, is locked: `release.next`).
   */
  nextStepFrom: Record<ProductionEventType, ArchPair<number | null>>;
  /** The caller may declare on this case at all (act-level gates still apply). */
  canDeclare: boolean;
  cannotDeclareReason: typeof PRODUCTION_ERROR.ORDER_NOT_IN_PRODUCTION | null;
  declareWindow: ProductionDeclareWindow;
  /** Every event of the case, cancelled included; performedAt desc, then createdAt desc. */
  history: ProductionEventView[];
  /** Changes on every declare / cancel of the case (ProductionProgress.updatedAt; '0' before the first). */
  sheetVersion: string;
}

// ── POST production/events · PATCH production/events/:id/cancel ────────

export interface ProductionDeclareResult {
  /** The 1-2 rows of the declaration (upper first). */
  events: ProductionEventView[];
  counters: ArchPair<ActCounters>;
  sheetVersion: string;
  /** true when the Idempotency-Key replayed an earlier declaration: nothing was written. */
  replayed: boolean;
}

export interface ProductionCancelResult {
  /** The target row and, with alsoSibling, the other arch of its declaration. */
  events: ProductionEventView[];
  counters: ArchPair<ActCounters>;
  sheetVersion: string;
}

// ── GET production/my-day ──────────────────────────────────────────────

export type ProductionMyDayChoice = 'today' | 'yesterday';

export interface ProductionMyDay {
  /** The Tunis day shown. */
  day: string;
  /** The caller's non-cancelled rows of that day (by createdAt), per act. */
  totals: ActTotals;
  /** The caller's rows declared that day, cancelled included; createdAt desc. */
  events: ProductionEventWithOrder[];
}

// ── GET production/orders/:orderId/dossier (finance-free, D9) ──────────

/**
 * No stored name, no `generatedName`, no path: the stored name is built
 * from the doctor, the patient, the category and the index, under
 * orders/<orderId>/<category>/. The streams name their downloads with
 * productionDownloadName() (kernel) instead.
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
  /** Variant names → dimensions/format; fetch with ?variant=<name>. */
  variants: Record<
    string,
    { width?: number; height?: number; sizeBytes?: number; format?: string }
  > | null;
  /** zip / 3D descriptors (counts, bbox), never disk paths. */
  mediaMetadata: Record<string, unknown> | null;
}

export interface ProductionPlanAttachmentView {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  /** treatment_result | treatment_file | container only. */
  category: TreatmentAttachmentCategory;
  createdAt: string;
  width: number | null;
  height: number | null;
  processingStatus: MediaProcessingStatus | null;
}

export interface ProductionPlanIprView {
  fromTooth: number;
  toTooth: number;
  /** mm, as typed ("0.20"). */
  value: string;
  note: string | null;
}

/** The latest APPROVED plan of the case (approvedAt desc). */
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

/** A supplemental child's clinical answers: no coverage, review or audit field. */
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
  /** 'YYYY-MM-DD'. */
  warrantyDiscoveredAt: string | null;
  warrantyLotReference: string | null;
  warrantyComments: string | null;
  teeth: { purpose: SupplementalToothPurpose; toothNumber: number }[];
  /** `iprMm`, not the table's amountMm: no key may read as money. */
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
    /** Packed multi-select (frontend lib/chief-complaint.ts). */
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
  /** Name, gender, age only (D9): no birth date, contact, address or notes. */
  patient: {
    fullName: string;
    gender: Gender | null;
    /** Whole years on the Tunis calendar today; null without a birth date. */
    age: number | null;
  };
  practitioner: { fullName: string; clinicName: string | null };
  toothInstructions: ProductionToothInstructionView[];
  /** Live files, by category then orderIndex. */
  files: ProductionFileView[];
  plan: ProductionPlanView | null;
  /** Set on a supplemental child only. */
  supplementalRequest: ProductionSupplementalAnswers | null;
}

// ── Admin: GET production/admin/summary ───────────────────────────────

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

/** Journal when from = to, monthly recap otherwise. ADMIN ONLY. */
export interface ProductionSummary {
  from: string;
  to: string;
  mode: 'journal' | 'recap';
  /** Non-cancelled, declared (not legacy_batch) rows with performedAt in the period. */
  totals: ActTotals;
  /** Theoretical: one plate per thermoformed aligner, one model per print (Σ quantity). */
  consumption: { plates: number; models: number };
  /** Days with at least one counted row, ascending. */
  byDay: ProductionDayTotals[];
  /** Cases with at least one counted row, by orderCode. */
  byCase: ProductionCaseTotals[];
  /** Authors with at least one counted row, by name. */
  byAuthor: ProductionAuthorTotals[];
  /** Journal mode: the counted rows of the day, performedAt asc. Recap mode: null. */
  events: ProductionEventWithOrder[] | null;
  /** Cancelled rows with performedAt in the period, cancelledAt desc. */
  cancelled: ProductionEventWithOrder[];
}

// ── Admin: GET production/admin/progress ──────────────────────────────

/** all = in the queue OR with progress; active = queue rule (D3); done = progress, out of the queue. */
export type ProductionProgressState = 'all' | 'active' | 'done';

/**
 * The admin "Avancement" row. It does not carry `release` (spec §3 puts
 * the release block on the queue and the case sheet; the progress select
 * loads one released batch only).
 */
export interface ProductionProgressRow extends Omit<
  ProductionOrderSummary,
  'release'
> {
  /** planned - delivered, floored at 0; null when unknown or not treated. */
  remaining: ArchPair<number | null>;
  firstActionAt: string | null;
  /** Matches the queue rule (D3) right now. */
  inQueue: boolean;
}

export type ProductionProgressPage = ProductionPage<ProductionProgressRow>;

// ── Admin: GET production/admin/anomalies ("Écarts") ───────────────────

export const PRODUCTION_ANOMALY = {
  /** A later act covers steps the previous act does not (step by step, current state). */
  stage_skipped: 'stage_skipped',
  /** A confirmed already_declared: reprint, re-cut or re-delivery. */
  duplicate_declaration: 'duplicate_declaration',
  /**
   * ANY act (print, thermoform, cut, delivery: `detail` names it) confirmed
   * with steps_not_released: the admin override since spec §3, and the
   * technicians' entries on locked steps declared before it (kept as
   * history, DECISIONS §3). The key keeps its historic name.
   */
  unreleased_delivery: 'unreleased_delivery',
  /** Any other confirmed warning (previous_stage_missing, quantity_differs, beyond_planned_total, arch_not_treated). */
  confirmed_warning: 'confirmed_warning',
  /** A cancelled row. */
  cancelled_event: 'cancelled_event',
  /** A notice failed for good (NOTICE_MAX_ATTEMPTS). */
  notice_failed: 'notice_failed',
  /** A notice skipped for not_configured / no_recipient (not for cancelled_before_send). */
  notice_skipped: 'notice_skipped',
  /** The order is finished while a treated arch is not fully delivered. */
  finished_incomplete: 'finished_incomplete',
  /** A treated arch of a case with production has no known planned total. */
  planned_total_unknown: 'planned_total_unknown',
  /** The coverage window started on a delivery that was later cancelled. */
  coverage_started_by_cancelled_delivery:
    'coverage_started_by_cancelled_delivery',
  /** A cancel could not revert a production-delivered batch because the order is finished. */
  batch_kept_after_cancel: 'batch_kept_after_cancel',
} as const;
export type ProductionAnomalyKind =
  (typeof PRODUCTION_ANOMALY)[keyof typeof PRODUCTION_ANOMALY];

/** ADMIN ONLY. legacy_batch rows never produce one. */
export interface ProductionAnomaly {
  kind: ProductionAnomalyKind;
  orderId: string;
  orderCode: string;
  patientName: string;
  arch: ProductionArch | null;
  /** The steps concerned, merged and ascending; null when not step-based. */
  steps: { from: number; to: number }[] | null;
  eventIds: string[];
  noticeId: string | null;
  warnings: ProductionWarningCode[];
  /** The instant that dates it (performedAt, cancelledAt, notice updatedAt, lastActionAt…). */
  at: string;
  /**
   * Short machine detail, whose meaning depends on `kind`:
   *   • duplicate_declaration, unreleased_delivery, confirmed_warning,
   *     cancelled_event: the act code (ProductionEventType) of the rows;
   *   • stage_skipped: the LATER act, the one that went ahead; the act it
   *     skipped is PREVIOUS_ACT[detail] (production.constants.ts);
   *   • coverage_started_by_cancelled_delivery: the coverage start, an ISO
   *     instant;
   *   • batch_kept_after_cancel: the batch range as 'from-to' (e.g. '1-10');
   *   • notice_skipped: the skipReason; notice_failed: the lastError;
   *   • finished_incomplete, planned_total_unknown: null.
   * The FE decodes it per kind (anomalies-view.tsx): change a format on
   * both sides together.
   */
  detail: string | null;
}

export interface ProductionAnomalies {
  from: string;
  to: string;
  /** `at` desc. */
  items: ProductionAnomaly[];
  countsByKind: Record<ProductionAnomalyKind, number>;
}

// ── Admin: GET production/admin/notices · POST …/:id/retry ─────────────

/** ADMIN ONLY (carries the recipient address). */
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
  /** POST …/retry would be accepted (failed, or skipped for not_configured / no_recipient). */
  retryable: boolean;
}

export type ProductionNoticePage = ProductionPage<ProductionNoticeView>;

/** Query of GET production/admin/notices (ProductionNoticesQueryDto). */
export interface ProductionNoticesParams {
  status?: ProductionNoticeStatus;
  /**
   * true = failed for good (status failed AND attempts >= NOTICE_MAX_ATTEMPTS:
   * the dispatcher no longer retries it); false = every other notice.
   * Combined with `status` by AND. A `failed` row below the limit already
   * has its next attempt scheduled.
   */
  exhausted?: boolean;
  page?: number;
  limit?: number;
}
