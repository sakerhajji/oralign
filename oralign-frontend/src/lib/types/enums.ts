// Enums (mirrors the Prisma enums)
// Split out of the former 2,000-line lib/types/index.ts; import via '@/lib/types'.

// ==========================================
// ENUMS
// ==========================================

export enum UserRole {
  ADMIN = 'admin',
  DENTIST = 'dentist',
  DESIGNER = 'designer',
  SUPER_ADMIN = 'super_admin',
  /** Lab technician: the production screens only, never money. */
  TECHNICIAN = 'technician',
}

export enum VerificationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum DayOfWeek {
  MONDAY = 'monday',
  TUESDAY = 'tuesday',
  WEDNESDAY = 'wednesday',
  THURSDAY = 'thursday',
  FRIDAY = 'friday',
  SATURDAY = 'saturday',
  SUNDAY = 'sunday',
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

/**
 * Order lifecycle — kept in sync with the backend Prisma `OrderStatus`
 * enum. Group naming here drives the grouped <Select> on the admin
 * status-override dialog.
 */
export enum OrderStatus {
  // ── Submission phase ─────────────────────────────────────────────
  DRAFT                  = 'draft',
  SUBMITTED              = 'submitted',
  UNDER_REVIEW           = 'under_review',
  // ── Treatment planning ──────────────────────────────────────────
  TREATMENT_PLANNING     = 'treatment_planning',
  TREATMENT_PLAN_READY   = 'treatment_plan_ready',
  REVISION_REQUESTED     = 'revision_requested',
  TREATMENT_APPROVED     = 'treatment_approved',
  // ── Quote + payment ─────────────────────────────────────────────
  QUOTATION_SENT         = 'quotation_sent',
  PAYMENT_PLAN_SELECTED  = 'payment_plan_selected',
  PAYMENT_PENDING        = 'payment_pending',
  PAYMENT_REVIEW         = 'payment_review',
  PAID                   = 'paid',
  // ── Production / fulfilment ─────────────────────────────────────
  FABRICATION            = 'fabrication',
  READY_TO_SHIP          = 'ready_to_ship',
  SHIPPED                = 'shipped',
  FINISHED               = 'finished',
  // ── Terminal ────────────────────────────────────────────────────
  CANCELED               = 'canceled',
  // ── Legacy (kept so old rows still resolve a label / badge) ─────
  IN_REVIEW              = 'in_review',
  APPROVED               = 'approved',
  REJECTED               = 'rejected',
  CANCELLED              = 'cancelled',
}

export enum PatientStage {
  INITIAL = 'initial',
  REFINEMENT = 'refinement',
  RETAINER = 'retainer',
}

export enum OrderType {
  INITIAL = 'initial',
  ADDITIONAL_ALIGNERS = 'additional_aligners',
  REPLACEMENT = 'replacement',
  TRANSFER_TEMPLATE = 'transfer_template',
  WARRANTY = 'warranty',
}

export enum SupplementalCoverageStatus {
  REVIEW_REQUIRED = 'review_required',
  INCLUDED = 'included',
  CHARGEABLE = 'chargeable',
  WARRANTY_APPROVED = 'warranty_approved',
  WARRANTY_REJECTED = 'warranty_rejected',
}

export enum SupplementalReviewStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum SupplementalRequestReason {
  FINISHING = 'finishing',
  TRACKING_PROBLEM = 'tracking_problem',
  TREATMENT_PLAN_CHANGE = 'treatment_plan_change',
  DENTAL_RESTORATION = 'dental_restoration',
  NON_COMPLIANCE = 'non_compliance',
  OTHER = 'other',
}

export enum SupplementalClinicalObjective {
  ADJUST_CURRENT_POSITION = 'adjust_current_position',
  PRESERVE_PREVIOUS_GOAL = 'preserve_previous_goal',
  NEW_GOAL = 'new_goal',
}

// ── Supplemental "additional aligners" form: one enum per question ──
// String values are the Prisma enum values (backend schema).

/** Q6 — movement restrictions. */
export enum SupplementalTeethScope {
  NONE = 'none',
  SELECTED_TEETH = 'selected_teeth',
}

/** Q7 — antero-posterior correction, asked per side. */
export enum SupplementalApCorrection {
  MAINTAIN = 'maintain',
  IMPROVE_CANINE = 'improve_canine',
  IMPROVE_CANINE_MOLAR = 'improve_canine_molar',
  CLASS_ONE = 'class_one',
}

/** Q7 — therapeutic options (multi-select). */
export enum SupplementalApOption {
  POSTERIOR_IPR = 'posterior_ipr',
  ELASTICS_SIMULATION = 'elastics_simulation',
  SEQUENTIAL_DISTALIZATION = 'sequential_distalization',
  MANDIBULAR_ADVANCEMENT = 'mandibular_advancement',
  ORTHOGNATHIC_SURGERY = 'orthognathic_surgery',
}

/** Q8 — new attachments. */
export enum SupplementalAttachmentPlan {
  AS_NEEDED = 'as_needed',
  AVOID_SELECTED_TEETH = 'avoid_selected_teeth',
}

/** Q9 — attachments already bonded. */
export enum SupplementalExistingAttachments {
  REMOVE_ALL = 'remove_all',
  REMOVE_SELECTED = 'remove_selected',
  KEEP_CONVENTIONAL = 'keep_conventional',
  KEEP_ALL = 'keep_all',
}

/** Q10a — IPR for the new plan. */
export enum SupplementalIprPlan {
  AS_NEEDED = 'as_needed',
  NONE = 'none',
  AVOID_SELECTED_TEETH = 'avoid_selected_teeth',
}

/** Q10b — IPR performed during the previous plan. */
export enum SupplementalPreviousIpr {
  AS_PRESCRIBED = 'as_prescribed',
  NONE = 'none',
  DIFFERENT = 'different',
}

/** Q11 — elastic cut-outs. */
export enum SupplementalCutoutPlan {
  NONE = 'none',
  SAME_AS_PREVIOUS = 'same_as_previous',
  SELECTED_TEETH = 'selected_teeth',
}

/** Q12 — residual spaces. */
export enum SupplementalResidualSpaces {
  NONE = 'none',
  CLOSE_SPECIFIED = 'close_specified',
}

/** Records step — how the new arch records reach the lab. */
export enum SupplementalImpressionMethod {
  INTRAORAL_SCAN = 'intraoral_scan',
  PHYSICAL_IMPRESSION = 'physical_impression',
}

/** What a tooth selected on a supplemental request means. */
export enum SupplementalToothPurpose {
  DO_NOT_MOVE = 'do_not_move',
  NO_ATTACHMENT = 'no_attachment',
  REMOVE_ATTACHMENT = 'remove_attachment',
  NO_IPR = 'no_ipr',
  CUTOUT = 'cutout',
  TRANSFER_TRAY = 'transfer_tray',
}

/** What a contact (two adjacent teeth and an amount in mm) means. */
export enum SupplementalContactPurpose {
  PERFORMED_IPR = 'performed_ipr',
  RESIDUAL_SPACE = 'residual_space',
}

export enum ReplacementReason {
  LOST = 'lost',
  BROKEN = 'broken',
  DEFORMED = 'deformed',
  OTHER = 'other',
}

export enum SupplementalUrgency {
  STANDARD = 'standard',
  URGENT = 'urgent',
}

export enum TransferTemplatePurpose {
  ATTACHMENT_PLACEMENT = 'attachment_placement',
  AUXILIARY_PLACEMENT = 'auxiliary_placement',
  ATTACHMENT_AND_AUXILIARY = 'attachment_and_auxiliary',
  OTHER = 'other',
}

export enum WarrantyDefectCategory {
  FIT = 'fit',
  CRACK = 'crack',
  DEFORMATION = 'deformation',
  TRIM = 'trim',
  MATERIAL = 'material',
  LABELING = 'labeling',
  OTHER = 'other',
}

export enum ArchTreatment {
  UPPER = 'upper',
  LOWER = 'lower',
  BOTH = 'both',
}

export enum ToothInstructionType {
  // Order-level — set by the doctor on the order itself.
  NO_ATTACHMENTS = 'no_attachments',
  DO_NOT_MOVE = 'do_not_move',
  NO_IPR = 'no_ipr',
  EXTRACT = 'extract',
  // Treatment-plan level — set by the planner on the plan editor.
  // ATTACHMENT is distinct from NO_ATTACHMENTS: it records that the
  // planner placed an attachment on this tooth (pink swatch). IPR_VALUE
  // is the per-tooth IPR amount (mm) plus an optional stripping note.
  ATTACHMENT = 'attachment',
  IPR_VALUE = 'ipr_value',
  // Reserved: no order or plan stores it any more (a doctor's cut-out
  // request lives on the supplemental request). The value stays because
  // Postgres cannot drop an enum value; the odontogram still uses it as
  // the teal swatch of the supplemental cut-out picker.
  PRECISION_CUT = 'precision_cut',
}
