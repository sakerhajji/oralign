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
}
