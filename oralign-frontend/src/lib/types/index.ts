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

// ─── Treatment plan ─────────────────────────────────────────────────────────

export enum TreatmentPlanStatus {
  PENDING = 'pending',
  READY = 'ready',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum TreatmentMessageType {
  MESSAGE = 'message',
  SYSTEM = 'system',
  APPROVAL = 'approval',
  REJECTION = 'rejection',
  FILE = 'file',
  TREATMENT_RESULT = 'treatment_result',
}

export enum TreatmentAttachmentCategory {
  IMAGE = 'image',
  XRAY = 'xray',
  STL = 'stl',
  PLY = 'ply',
  OBJ = 'obj',
  ZIP = 'zip',
  PDF = 'pdf',
  VIDEO = 'video',
  TREATMENT_FILE = 'treatment_file',
  TREATMENT_RESULT = 'treatment_result',
  CONTAINER = 'container',
  OTHER = 'other',
}

export interface TreatmentPlan {
  id: string;
  orderId: string;
  version: number;
  name: string;
  status: TreatmentPlanStatus;
  resultViewUrl?: string | null;
  filePath?: string | null;
  movementTableImagePath?: string | null;
  movementTableImageName?: string | null;
  movementTableImageMimeType?: string | null;
  movementTableImageSizeBytes?: number | null;
  // Dental treatment table ("traitement dentaire") — second image
  // artefact, distinct from the movement table above. Stored in
  // its own columns + on-disk folder so neither image can overwrite
  // the other.
  dentalTreatmentTableImagePath?: string | null;
  dentalTreatmentTableImageName?: string | null;
  dentalTreatmentTableImageMimeType?: string | null;
  dentalTreatmentTableImageSizeBytes?: number | null;
  totalUpperAligners?: number | null;
  totalLowerAligners?: number | null;
  issuedUpperAligners?: number | null;
  issuedLowerAligners?: number | null;
  createdById: string;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  publicToken?: string | null;
  publicExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TreatmentMessageAttachment {
  id: string;
  messageId: string;
  uploadedById: string;
  fileName: string;
  filePath: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  category: TreatmentAttachmentCategory;
  createdAt: string;
}

export interface TreatmentMessage {
  id: string;
  treatmentPlanId: string;
  senderId: string;
  message?: string | null;
  type: TreatmentMessageType;
  attachments: TreatmentMessageAttachment[];
  sender?: {
    id: string;
    fullName: string;
    role: string;
    avatarUrl?: string | null;
  };
  createdAt: string;
}

export interface OdontogramEntry {
  type: string;
  value?: string | null;
  note?: string | null;
  createdById?: string | null;
  createdAt: string;
}

export interface TreatmentPlanIpr {
  id: string;
  treatmentPlanId: string;
  /** FDI tooth number of the "from" side of the contact. */
  fromTooth: number;
  /** FDI tooth number of the "to" side of the contact. */
  toTooth: number;
  /** IPR amount in mm, stored as a string to preserve trailing zeros. */
  value: string;
  /** Optional clinic-specific stripping auxiliary value. */
  note?: string | null;
  createdById?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertTreatmentPlanIprDto {
  fromTooth: number;
  toTooth: number;
  value: string;
  note?: string | null;
}

export interface TreatmentPlanReview extends TreatmentPlan {
  odontogram: Array<{ toothNumber: number; entries: OdontogramEntry[] }>;
  messages: TreatmentMessage[];
  clinicalImages: OrderFile[];
  /** IPR / stripping entries owned by THIS treatment plan version. */
  iprEntries: TreatmentPlanIpr[];
}

export interface PublicTreatmentViewerPayload {
  treatmentPlan: {
    id: string;
    name: string;
    version: number;
    resultViewUrl?: string | null;
  };
  doctor?: { fullName?: string | null; clinicName?: string | null };
  patient?: {
    firstName?: string | null;
    /** Used to render a gendered salutation (Mr. / Ms.) on the patient
     *  public viewer page. */
    gender?: 'male' | 'female' | 'other' | null;
  };
}

// ─── Quotation / Devis ──────────────────────────────────────────────────────

export enum DevisLanguage {
  FR = 'fr',
  EN = 'en',
  AR = 'ar',
}

export enum QuotationStatus {
  DRAFT     = 'draft',
  SENT      = 'sent',
  APPROVED  = 'approved',
  REJECTED  = 'rejected',
  CANCELED  = 'canceled',
}

/** Translated text bundles editable from the admin billing-settings UI. */
export interface TranslatedTexts {
  fr?: string;
  en?: string;
  ar?: string;
}

export interface BankDetails {
  bankName?: string;
  accountName?: string;
  rib?: string;
  iban?: string;
  swift?: string;
}

export interface CompanyBillingSettings {
  id: string;
  companyName: string;
  companyLogoPath?: string | null;
  companyAddress?: string | null;
  companyCity?: string | null;
  companyCountry?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  taxRegistrationNumber?: string | null;

  defaultTvaRate: number;
  defaultCurrency: string;
  devisPrefix: string;
  devisNextNumber: number;

  legalTextTranslations?: TranslatedTexts | null;
  footerTextTranslations?: TranslatedTexts | null;
  bankDetails?: BankDetails | null;

  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertCompanyBillingSettingsDto {
  companyName?: string;
  companyAddress?: string;
  companyCity?: string;
  companyCountry?: string;
  companyPhone?: string;
  companyEmail?: string;
  taxRegistrationNumber?: string;
  defaultTvaRate?: number;
  defaultCurrency?: string;
  devisPrefix?: string;
  devisNextNumber?: number;
  legalTextTranslations?: TranslatedTexts;
  footerTextTranslations?: TranslatedTexts;
  bankDetails?: BankDetails;
  isActive?: boolean;
}

/** Snapshot of the company-billing-settings row at quotation-issue time. */
export interface QuotationCompanySnapshot {
  companyName: string;
  companyLogoPath?: string | null;
  companyAddress?: string | null;
  companyCity?: string | null;
  companyCountry?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  taxRegistrationNumber?: string | null;
  tvaRate: number;
  currency: string;
  selectedLanguage: DevisLanguage;
  legalText: string;
  footerText: string;
  bankDetails?: BankDetails | null;
  generatedAt: string;
}

/** Snapshot of the doctor's DentistProfile at quotation-issue time. */
export interface QuotationClinicSnapshot {
  doctorId: string;
  doctorFullName: string;
  doctorEmail: string;
  clinicName?: string | null;
  clinicAddress?: string | null;
  city?: string | null;
  country?: string | null;
  clinicPhone?: string | null;
  clinicEmail?: string | null;
  logoUrl?: string | null;
  generatedAt: string;
}

export interface Quotation {
  id: string;
  orderId: string;
  quotationNumber?: string | null;
  language: DevisLanguage;
  status: QuotationStatus;
  treatmentFees: number;
  fabricationFees: number;
  deliveryFees: number;
  discountAmount: number;
  subTotalHt: number;
  tvaRate: number;
  tvaAmount: number;
  totalTtc: number;
  currency: string;
  notes?: string | null;
  adminMessage?: string | null;
  companySnapshot?: QuotationCompanySnapshot | null;
  clinicSnapshot?: QuotationClinicSnapshot | null;
  pdfFilePath?: string | null;
  sentAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  createdById: string;
  approvedById?: string | null;
  rejectedById?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Create / update payload shared by admin form. */
export interface UpsertQuotationDto {
  language?: DevisLanguage;
  treatmentFees?: number;
  fabricationFees?: number;
  deliveryFees?: number;
  discountAmount?: number;
  tvaRate?: number;
  currency?: string;
  notes?: string;
  adminMessage?: string;
}

export enum OrderFileCategory {
  RIGHT_PHOTO = 'right_photo',
  FRONT_PHOTO = 'front_photo',
  LEFT_PHOTO = 'left_photo',
  UPPER_PHOTO = 'upper_photo',
  LOWER_PHOTO = 'lower_photo',
  ORTHOPANTOMOGRAPHY = 'orthopantomography',
  STL = 'stl',
  PLY = 'ply',
  OBJ = 'obj',
  ZIP = 'zip',
  PDF = 'pdf',
  IMAGE = 'image',
  VIDEO = 'video',
  OTHER = 'other',
}

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

export interface OrderFile {
  id: string;
  category: OrderFileCategory;
  originalName: string;
  fileName: string;
  relativePath: string;
  mimeType: string;
  size: number;
  createdAt: string;
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
  doctor?: { id: string; fullName: string; email: string };
  patient?: { id: string; fullName: string; email?: string; phone?: string };
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  // ── Notification badges (computed by the backend list endpoint) ───────────
  // `latestPlanStatus` is undefined when no treatment plan has been started.
  latestPlanStatus?: TreatmentPlanStatus;
  treatmentPlansCount?: number;
}

// ==========================================
// AUTH DTOs
// ==========================================

export interface SignUpDto {
  email: string;
  fullName: string;
  password: string;
  phone?: string;
  country?: string;
}

export interface SignInDto {
  email: string;
  password: string;
}

export interface VerifyEmailDto {
  email: string;
  verificationCode: string;
}

export interface ForgotPasswordDto {
  email: string;
}

export interface ResetPasswordDto {
  token: string;
  newPassword: string;
}

export interface RefreshTokenDto {
  refreshToken: string;
}

export interface AuthTokenDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponseDto {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isEmailVerified: boolean;
  verificationStatus: VerificationStatus;
  avatarUrl?: string;
  authToken: AuthTokenDto;
}

export interface VerifyEmailResponseDto {
  message: string;
  user?: {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    isEmailVerified: boolean;
    verificationStatus: VerificationStatus;
  };
  authToken?: AuthTokenDto;
}

// ==========================================
// USER DTOs
// ==========================================

export interface CreateUserDto {
  email: string;
  fullName: string;
  password: string;
  phone?: string;
  country?: string;
  role?: UserRole;
  avatarUrl?: string;
}

export interface UpdateUserDto {
  fullName?: string;
  phone?: string;
  country?: string;
  avatarUrl?: string;
  password?: string;
  role?: UserRole;
  isEmailVerified?: boolean;
}

// ==========================================
// DENTIST PROFILE DTOs
// ==========================================

export interface CreateDentistProfileDto {
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
}

export interface UpdateDentistProfileDto {
  clinicName?: string;
  clinicAddress?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  clinicPhone?: string;
  clinicEmail?: string;
  description?: string;
  logoUrl?: string;
}

/** Single-shot weekly schedule entry — used by SetupClinicDto. */
export interface WeeklyHoursEntryDto {
  dayOfWeek: DayOfWeek;
  openTime: string; // HH:mm
  closeTime: string; // HH:mm
  isClosed: boolean;
}

/** Combined clinic + working-hours payload for the onboarding wizard. */
export interface SetupClinicDto extends CreateDentistProfileDto {
  workingHours: WeeklyHoursEntryDto[];
}

export interface SearchByCityDto {
  city: string;
  page?: number;
  limit?: number;
}

export interface SearchNearbyDto {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  page?: number;
  limit?: number;
}

// ==========================================
// WORKING HOURS DTOs
// ==========================================

export interface CreateWorkingHoursDto {
  dentistProfileId: string;
  dayOfWeek: DayOfWeek;
  openTime: string;
  closeTime: string;
  isClosed?: boolean;
}

export interface UpdateWorkingHoursDto {
  openTime?: string;
  closeTime?: string;
  isClosed?: boolean;
}

// ==========================================
// PATIENT DTOs
// ==========================================

export interface CreatePatientDto {
  fullName: string;
  email?: string;
  phone?: string;
  gender?: Gender;
  dateOfBirth?: string;
  address?: string;
  notes?: string;
  // Multi-select clinical-condition labels — see Patient.clinicalConditions
  // for the canonical option list and the storage rationale.
  clinicalConditions?: string[];
  clinicalConditionsOther?: string;
  doctorId?: string;
}

export interface UpdatePatientDto {
  fullName?: string;
  email?: string;
  phone?: string;
  gender?: Gender;
  dateOfBirth?: string;
  address?: string;
  notes?: string;
  clinicalConditions?: string[];
  clinicalConditionsOther?: string;
  doctorId?: string;
}

export interface CreateOrderDto {
  orderCode?: string;
  doctorId?: string;
  patientId: string;
  patientStage?: PatientStage;
  chiefComplaint?: string;
  archTreatment?: ArchTreatment;
  treatBothArch?: boolean;
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
  useCbctWithScans?: boolean;
  wantsManufacturing?: boolean;
  materials?: string[];
  toothInstructions?: ToothInstruction[];
}

export type UpdateOrderDto = Partial<CreateOrderDto>;

export interface UpdateToothInstructionsDto {
  instructions: ToothInstruction[];
}

// ==========================================
// API RESPONSE TYPES
// ==========================================

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string;
  errorCode?: string;
  timestamp: string;
}

export interface MessageResponse {
  message: string;
}

// ==========================================
// QUERY PARAMS
// ==========================================

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface UserFilterParams extends PaginationParams {
  search?: string;
  role?: UserRole;
  isActive?: boolean;
  isEmailVerified?: boolean;
}

/**
 * Canonical sort fields for the patients list endpoint. Mirrors
 * `PatientSortField` on the backend. Keep narrow — the backend
 * rejects values outside the enum via class-validator.
 */
export type PatientSortField = 'createdAt' | 'updatedAt' | 'fullName';
/** Canonical sort fields for the orders list endpoint. */
export type OrderSortField = 'createdAt' | 'updatedAt' | 'orderCode' | 'status';
export type SortOrder = 'asc' | 'desc';

export interface PatientFilterParams extends PaginationParams {
  search?: string;
  doctorId?: string;
  /** Optional gender filter — admin-only on the patients page. */
  gender?: Gender;
  sortBy?: PatientSortField;
  sortOrder?: SortOrder;
  /** ISO 8601 dates (YYYY-MM-DD or full datetime). Inclusive bounds. */
  createdFrom?: string;
  createdTo?: string;
}

export interface OrderFilterParams extends PaginationParams {
  search?: string;
  doctorId?: string;
  patientId?: string;
  status?: OrderStatus;
  orderCode?: string;
  sortBy?: OrderSortField;
  sortOrder?: SortOrder;
  createdFrom?: string;
  createdTo?: string;
}

export interface BulkActionDto {
  ids: string[];
}

export interface BulkUpdateStatusDto {
  ids: string[];
  isActive: boolean;
}
