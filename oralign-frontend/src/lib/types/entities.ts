// Core entities (User, DentistProfile, Patient, DentalOrder, ...)
// Split out of the former 2,000-line lib/types/index.ts; import via '@/lib/types'.

import type { OrderFileCategory, PaymentMethod, PaymentRecordStatus } from './billing';
import { ArchTreatment, DayOfWeek, Gender, OrderStatus, PatientStage, ToothInstructionType, UserRole, VerificationStatus } from './enums';
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
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
  dentistProfile?: DentistProfile | null;
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
  /** Specialty shown in the public directory ("Trouver un praticien"). */
  specialty?: string;
  /** Whether the clinic appears in the public directory (opt-out, default on). */
  isListedPublicly?: boolean;
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
  doctor?: {
    id: string;
    fullName: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
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
  doctor?: {
    id: string;
    fullName: string;
    email: string;
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
  // Treatment-fee gate fields. The doctor pays this professional fee
  // BEFORE the admin can start the treatment plan; the UI surfaces a
  // "Pay treatment fee" / "Mark as paid" card while paidAt is null
  // and the configured default fee is > 0.
  treatmentFeePaidAt?: string;
  treatmentFeeAmount?: number;
  treatmentFeePaymentMethod?: PaymentMethod;
  treatmentFeePaymentStatus?: PaymentRecordStatus;
  treatmentFeeProofPath?: string;
  // CBCT supplement snapshot — set server-side when the doctor requests
  // CBCT on a draft order and the paid supplement is enabled; frozen
  // after submission so config changes never reprice existing orders.
  cbctFeeAmount?: number;
  cbctFeeCurrency?: string;
  // ── Notification badges (computed by the backend list endpoint) ───────────
  // `latestPlanStatus` is undefined when no treatment plan has been started.
  latestPlanStatus?: TreatmentPlanStatus;
  treatmentPlansCount?: number;
}
