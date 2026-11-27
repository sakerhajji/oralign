// Core entities (User, DentistProfile, Patient, DentalOrder, ...)
// Split out of the former 2,000-line lib/types/index.ts; import via '@/lib/types'.

import type { OrderFileCategory, PaymentMethod, PaymentRecordStatus } from './billing';
import { ArchTreatment, DayOfWeek, Gender, OrderStatus, OrderType, PatientStage, ToothInstructionType, UserRole, VerificationStatus } from './enums';
import type { TreatmentPlanStatus } from './treatment-plan';

// ==========================================
// ENTITIES
// ==========================================

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  country?: string;
  role: UserRole;
  isActive: boolean;
  isEmailVerified: boolean;
  verificationStatus: VerificationStatus;
  avatarUrl?: string;
  /** Content language ('fr' | 'en') — UI, notifications and emails. */
  preferredLanguage?: string;
  /**
   * The account still runs on a temporary password the admin handed over:
   * the API refuses everything but GET /users/me and POST
   * /auth/change-password (403 PASSWORD_CHANGE_REQUIRED) until it changes.
   */
  mustChangePassword?: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
  dentistProfile?: DentistProfile | null;
  /**
   * Oralign gift mark (admin users list / detail only): when the
   * practitioner's once-only gift was used, null while it is still
   * available. Absent on payloads that do not carry it (e.g. /users/me).
   */
  welcomeGiftUsedAt?: string | null;
  /**
   * The doctor's most recent case that received the gift (null for
   * non-dentists). `archived`: the case was archived, so it still counts
   * as the used gift but its page no longer opens (never link to it).
   */
  welcomeGiftOrder?: { id: string; orderCode: string; archived: boolean } | null;
  /**
   * Doctor inactivity (spec §5): set when the account turned DORMANT (no
   * order for inactivityMonths). Not the same as isActive ("Bloqué"): a
   * dormant doctor keeps login, payments and chat but cannot order.
   */
  inactiveSince?: string | null;
  /** Last admin reactivation (part of the inactivity anchor). */
  activityResetAt?: string | null;
  /** When an admin approved the account (null before 2026-11-27). */
  approvedAt?: string | null;
  /** Admin users list / detail only: the derived activity block. */
  activity?: DoctorActivitySummary | null;
}

export interface DentistProfile {
  id: string;
  userId: string;
  clinicName: string;
  clinicAddress?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  clinicPhone?: string;
  clinicEmail?: string;
  description?: string;
  logoUrl?: string;
  /**
   * The DOCTOR's clinic "Matricule fiscal" (tax registration number).
   * Distinct from the COMPANY's `CompanyBillingSettings.taxRegistrationNumber`
   * (the Oralign header tax id). Editable by the doctor and admin; rendered
   * in the invoice "Billed to" (doctor/clinic) block when present.
   */
  taxId?: string;
  /**
   * Professional-order registration number. Optional and private like
   * taxId (never on the public directory), not printed for now.
   */
  registrationNumber?: string | null;
  /** Specialty shown in the public directory ("Trouver un praticien"). */
  specialty?: string;
  /** Whether the clinic appears in the public directory (opt-out, default on). */
  isListedPublicly?: boolean;
  /** The owner's name and photo, read live (cached server-side ≤ 5 min, dropped on edit). */
  userFullName?: string;
  userAvatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkingHours {
  id: string;
  dentistProfileId: string;
  dayOfWeek: DayOfWeek;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Canonical list of clinical-condition labels exposed by the patient
 * forms. Kept as a string-literal union so the type system catches
 * typos in code that constructs payloads, but the backend stores it
 * as a free `text[]` so the clinic can add labels later without a
 * Prisma migration.
 */
export const CLINICAL_CONDITION_OPTIONS = [
  'Crowding',
  'Spacing',
  'Class II Division 1',
  'Class II Division 2',
  'Class III',
  'Open bite',
  'Anterior crossbite',
  'Posterior crossbite',
  'Deep bite',
  'Narrow arch',
  'Proclination',
  'Increased overjet',
  'Unesthetic smile',
  'Dental shape anomaly',
  'TMJ problem (temporomandibular dislocation)',
  'Other',
] as const;

export type ClinicalCondition = (typeof CLINICAL_CONDITION_OPTIONS)[number];

/**
 * Sentinel for the free-text "Other" entry. Kept as a constant so any
 * code that needs to test for it doesn't repeat the literal string.
 */
export const CLINICAL_CONDITION_OTHER: ClinicalCondition = 'Other';

export interface Patient {
  id: string;
  doctorId: string;
  /** Set when the patient is in the trash (soft-deleted). */
  deletedAt?: string | null;
  fullName: string;
  email?: string;
  phone?: string;
  gender?: Gender;
  dateOfBirth?: string;
  address?: string;
  notes?: string;
  profilePhotoUrl?: string;
  /**
   * Multi-select clinical-condition labels. Empty array (or absent
   * from a legacy payload) means "no conditions recorded".
   */
  clinicalConditions?: string[];
  /**
   * Free-text detail captured when "Other" is in `clinicalConditions`.
   * UI is hidden unless "Other" is selected.
   */
  clinicalConditionsOther?: string;
  /** THE live doctor summary (spec §6): person + practice + printed contact. */
  doctor?: DoctorSummary;
  createdAt: string;
  updatedAt: string;
}

/** The newest order of a patient, as the patients list carries it. */
export interface PatientLatestOrder {
  id: string;
  orderCode: string;
  status: OrderStatus;
  orderType: OrderType;
  parentOrderId?: string | null;
  isCurrent: boolean;
  createdAt: string;
}

/**
 * A row of GET /patients. The order figures are scoped like the orders
 * the caller can open (a dentist counts only their own) and leave out
 * orders in the trash.
 */
export interface PatientListItem extends Patient {
  ordersCount: number;
  latestOrder: PatientLatestOrder | null;
}

export interface ToothInstruction {
  toothNumber: number;
  type: ToothInstructionType;
  // Optional value — required by `ipr_value` entries (mm as a string so
  // forms can keep their raw input including trailing zeros) and free-form
  // notes attached to any per-tooth instruction.
  value?: string | null;
  note?: string | null;
}

/** Lifecycle of the backend's async media-optimization pipeline. */
export type MediaProcessingStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

/**
 * One derived artefact (no disk path crosses the API — fetch it via the
 * download endpoint with `?variant=<name>`).
 */
export interface MediaVariantInfo {
  width?: number;
  height?: number;
  sizeBytes?: number;
  /** 'webp' | 'avif' | 'glb' */
  format?: string;
}

/** Keys: thumb (~300px) | md (~800px) | lg (~1600px) | avif | model (GLB). */
export type MediaVariants = Record<string, MediaVariantInfo>;

/** Safe ZIP description — central directory only, nothing extracted. */
export interface ZipMediaMetadata {
  kind: 'zip';
  entryCount: number;
  topLevelEntries: string[];
  totalUncompressedBytes: number;
  truncated: boolean;
  suspicious: boolean;
}

export interface StlMediaMetadata {
  kind: 'stl';
  format: 'binary' | 'ascii';
  triangleCount: number;
  vertexCount: number;
  bbox: { min: [number, number, number]; max: [number, number, number] };
}

export interface OrderFile {
  id: string;
  category: OrderFileCategory;
  originalName: string;
  fileName: string;
  relativePath: string;
  mimeType: string;
  size: number;
  createdAt: string;
  // ── Media-optimization pipeline (absent on legacy rows) ──────────
  /** Clean ordered filename (Patient_Category_NNN.ext) used for downloads. */
  generatedName?: string;
  /** Per order+category upload sequence; 0 on legacy rows. */
  orderIndex?: number;
  /** Original image dimensions (px). */
  width?: number;
  height?: number;
  processingStatus?: MediaProcessingStatus;
  variants?: MediaVariants;
  mediaMetadata?: ZipMediaMetadata | StlMediaMetadata | Record<string, unknown>;
}

export interface DentalOrder {
  id: string;
  orderCode: string;
  doctorId: string;
  patientId: string;
  assignedDesignerId?: string;
  status: OrderStatus;
  orderType: OrderType;
  parentOrderId?: string;
  patientStage?: PatientStage;
  chiefComplaint?: string;
  archTreatment?: ArchTreatment;
  treatBothArch: boolean;
  treatmentPlan?: string;
  dontMoveOption?: string;
  apRelationship?: string;
  anteroposteriorRelationship?: string;
  elastics?: string;
  openBite?: string;
  midline?: string;
  ipr?: string;
  biteRamps?: string;
  expansion?: string;
  crossbite?: string;
  spaces?: string;
  extractions?: string;
  specialInstructions?: string;
  additionalInstructions?: string;
  useCbctWithScans: boolean;
  wantsManufacturing: boolean;
  materials: string[];
  toothInstructions: ToothInstruction[];
  files: OrderFile[];
  /**
   * The doctor, from the shared summary (spec §6, DOCTOR_SUMMARY_SELECT)
   * plus the clinic name for the existing readers. Only id, name and
   * account e-mail are certain: a designer gets a reduced view (no phone,
   * no contact fields) and an older response none of the summary. Show
   * the contact with lib/doctor/doctor-contact.ts.
   */
  doctor?: Pick<DoctorSummary, 'id' | 'fullName' | 'email'> &
    Partial<Omit<DoctorSummary, 'id' | 'fullName' | 'email'>> & {
      clinicName?: string;
    };
  patient?: {
    id: string;
    fullName: string;
    email?: string;
    phone?: string;
    gender?: Gender;
    dateOfBirth?: string;
    profilePhotoUrl?: string;
  };
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  coverageStartedAt?: string;
  coverageExpiresAt?: string;
  // Treatment-fee gate fields. The doctor pays this professional fee
  // BEFORE the admin can start the treatment plan; the UI surfaces a
  // "Pay treatment fee" / "Mark as paid" card while paidAt is null
  // and the configured default fee is > 0.
  treatmentFeePaidAt?: string;
  /**
   * Cash collected for the fee: fee due (TTC) + stamp - retenue. The fee
   * due is this + withholding - stamp.
   */
  treatmentFeeAmount?: number;
  /** Retenue à la source applied to the fee: rate (%) and amount kept back. */
  treatmentFeeWithholdingRate?: number | null;
  treatmentFeeWithholdingAmount?: number | null;
  /**
   * Droit de timbre charged on top of the fee with its payment. null / 0
   * on fees paid before 2026-11-20.
   */
  treatmentFeeStampAmount?: number | null;
  treatmentFeePaymentMethod?: PaymentMethod;
  treatmentFeePaymentStatus?: PaymentRecordStatus;
  /**
   * Owner and admins only: P-A strips it for every other reader and sends
   * `treatmentFeeHasProof`. Never use it as a URL: the receipt is read
   * through GET orders/:id/treatment-fee/proof.
   */
  treatmentFeeProofPath?: string;
  /** Whether a fee receipt is attached (every reader). */
  treatmentFeeHasProof?: boolean;
  /** The fee transfer declaration's identity (its subject), ISO. */
  treatmentFeeDeclaredAt?: string | null;
  /** First time an admin opened the fee receipt ("À vérifier"). */
  treatmentFeeReviewOpenedAt?: string | null;
  /** Refused fee transfer (status rejected): when and why. */
  treatmentFeeRejectedAt?: string | null;
  treatmentFeeRejectionReason?: string | null;
  /** Retenue threshold in force when the fee was charged (snapshot). */
  treatmentFeeWithholdingThreshold?: number | null;
  // CBCT supplement snapshot — set server-side when the doctor requests
  // CBCT on a draft order and the paid supplement is enabled; frozen
  // after submission so config changes never reprice existing orders.
  cbctFeeAmount?: number;
  cbctFeeCurrency?: string;
  // Welcome gift (once per practitioner) — stamped server-side on the
  // case a doctor submitted while the gift was unused: the treatment fee
  // (+ CBCT snapshot) is waived, amounts snapshotted at submit. Null when
  // no gift applies. `firstCase` = that case was the doctor's very first
  // submitted case (drives the "premier cas" vs "ce cas" copy).
  welcomeGift?: {
    appliedAt: string;
    treatmentFee: number;
    cbctFee: number;
    total: number;
    currency: string;
    firstCase: boolean;
  } | null;
  // ── Notification badges (computed by the backend list endpoint) ───────────
  // `latestPlanStatus` is undefined when no treatment plan has been started.
  latestPlanStatus?: TreatmentPlanStatus;
  treatmentPlansCount?: number;
  /** Set when the order is in the trash (soft-deleted). */
  deletedAt?: string | null;
}

export interface OrderHistoryEntry {
  id: string;
  source: 'order' | 'treatment_plan' | 'quotation' | 'payment' | 'delivery';
  action: string;
  actor: {
    id: string | null;
    name: string;
    role: UserRole | null;
  } | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// ─── Programme contract (P0, CONTRACT.md): inactivity, doctor identity ────

/**
 * Doctor inactivity (backend users/activity/doctor-activity.contract.ts).
 * active: deadline more than 30 days away; warned: within 30 days;
 * inactive: dormant (User.inactiveSince set).
 */
export type DoctorActivityStatus = 'active' | 'warned' | 'inactive';

export type AccountActivityEventKind =
  | 'warning_30d'
  | 'warning_7d'
  | 'deactivated'
  | 'reactivated'
  | 'blocked'
  | 'unblocked';

export interface DoctorActivitySummary {
  status: DoctorActivityStatus;
  lastSubmittedOrderAt: string | null;
  anchorAt: string;
  /** null while the rule is switched off. */
  deadlineAt: string | null;
  inactiveSince: string | null;
  activityResetAt: string | null;
  ruleEnabled: boolean;
}

/** One row of GET users/:id/activity-events. */
export interface AccountActivityEvent {
  id: string;
  kind: AccountActivityEventKind;
  anchorAt: string;
  deadlineAt: string;
  /** null = the system (the daily sweep). */
  actor: { id: string | null; name: string; role: UserRole | null } | null;
  reason: string | null;
  createdAt: string;
}

/** POST users/:id/reactivate body (reason: 3-500 characters once trimmed). */
export interface ReactivateDoctorBody {
  reason: string;
}

/** POST admin/doctor-activity/sweep response (super_admin, e2e / support). */
export interface DoctorActivitySweepResult {
  ruleEnabled: boolean;
  scanned: number;
  warned30: number;
  warned7: number;
  deactivated: number;
}

/** Inactivity errorCode values (backend domain-error-codes.ts). */
export const ACCOUNT_ACTIVITY_ERROR = {
  /** 403: order create / submit on a dormant account. */
  ACCOUNT_DORMANT: 'ACCOUNT_DORMANT',
  /** 400: reactivation without a 3-500 character reason. */
  REACTIVATION_REASON_REQUIRED: 'REACTIVATION_REASON_REQUIRED',
  /** 400: reactivation of an account that is not a dentist. */
  NOT_A_DOCTOR: 'ACCOUNT_ACTIVITY_NOT_A_DOCTOR',
} as const;
export type AccountActivityErrorCode =
  (typeof ACCOUNT_ACTIVITY_ERROR)[keyof typeof ACCOUNT_ACTIVITY_ERROR];

/**
 * THE doctor identity of the owner / admin screens (backend
 * common/doctor/doctor-identity.ts DOCTOR_SUMMARY_SELECT, P-F): User +
 * DentistProfile joined live. Production screens never get it (name only,
 * leak guard). contactPhone / contactEmail apply the printed-contact rule
 * (practice first, account fallback) so screens never re-derive it.
 */
export interface DoctorSummary {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  deletedAt: string | null;
  clinic: {
    clinicName: string;
    clinicAddress: string | null;
    city: string | null;
    country: string | null;
    clinicPhone: string | null;
    clinicEmail: string | null;
    logoUrl: string | null;
    specialty: string | null;
    /** Owner and admins only. */
    taxId?: string | null;
    registrationNumber?: string | null;
  } | null;
  contactPhone: string | null;
  contactEmail: string | null;
}
