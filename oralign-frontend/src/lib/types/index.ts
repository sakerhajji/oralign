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
  // Professional/clinical fee auto-applied to new quotes. The admin
  // can still override per-quote — this is just the policy default.
  defaultTreatmentFee: number;
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
  defaultTreatmentFee?: number;
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
  // ── Pack snapshot (set when admin attaches a Pack) ────────────────
  // All optional because legacy (pre-packs) quotes don't carry these.
  // `totalPrice` / `paidAmount` / `remainingAmount` are strings on the
  // wire because the backend serialises Prisma.Decimal as a string to
  // avoid Number-precision drift on the client.
  packId?: string | null;
  packName?: string | null;
  archType?: ArchType | null;
  maxStepsPerArch?: number | null;
  includedCorrections?: number | null;
  isUnlimitedSteps?: boolean | null;
  isUnlimitedCorrections?: boolean | null;
  isForOrthodontists?: boolean | null;
  totalPrice?: string | null;
  paidAmount?: string | null;
  remainingAmount?: string | null;
  paymentMode?: PaymentMode | null;
  paymentStatus?: QuotationPaymentStatus | null;
  doctorApprovedAt?: string | null;
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

// ─── Packs + payment-plan + payments ──────────────────────────────────────
// Mirrors backend Prisma enums + models. Decimal money fields cross the
// wire as strings — never parse them with `Number()` before doing
// arithmetic; use a string-based decimal helper instead, otherwise
// totals will drift at the 3rd decimal place (TND is 3-decimal).

// Frontend mirror of the backend Prisma `ArchType` enum. Wire values
// MUST match the backend exactly — class-validator's `@IsEnum` on the
// server rejects anything else with "archType must be one of …". The
// constant NAMES (ONE_ARCH / TWO_ARCHES) are a frontend convention so
// every call site reads cleanly without leaking the snake_case wire
// format into the UI code.
export enum ArchType {
  ONE_ARCH = 'single_arch',
  TWO_ARCHES = 'two_arches',
}

export enum PaymentMode {
  FULL_PAYMENT = 'full_payment',
  INSTALLMENTS = 'installments',
}

export enum QuotationPaymentStatus {
  PENDING = 'pending',
  PARTIALLY_PAID = 'partially_paid',
  PAID = 'paid',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum InstallmentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled',
}

export enum BatchStatus {
  LOCKED = 'locked',
  UNLOCKED = 'unlocked',
  DELIVERED = 'delivered',
}

export enum PaymentMethod {
  CARD = 'card',
  BANK_TRANSFER = 'bank_transfer',
  CASH = 'cash',
}

/**
 * Payment lifecycle. CARD: `pending → success | failed | cancelled`.
 * BANK_TRANSFER: `awaiting_confirmation → success | rejected`.
 * CASH: created directly in `success` by an admin endpoint.
 */
export enum PaymentRecordStatus {
  PENDING = 'pending',
  AWAITING_CONFIRMATION = 'awaiting_confirmation',
  SUCCESS = 'success',
  FAILED = 'failed',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

export interface Pack {
  id: string;
  name: string;
  description?: string | null;
  maxStepsPerArch?: number | null;
  includedCorrections?: number | null;
  isUnlimitedSteps: boolean;
  isUnlimitedCorrections: boolean;
  isForOrthodontists: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  prices?: PackPrice[];
}

export interface PackPrice {
  id: string;
  packId: string;
  archType: ArchType;
  price: string;          // decimal-as-string
  currency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePackDto {
  name: string;
  description?: string;
  maxStepsPerArch?: number;
  includedCorrections?: number;
  isUnlimitedSteps?: boolean;
  isUnlimitedCorrections?: boolean;
  isForOrthodontists?: boolean;
  isActive?: boolean;
  // Inline price — when set, the backend atomically creates a single
  // ACTIVE PackPrice (archType=two_arches) alongside the pack so the
  // admin form is the only place an admin has to touch.
  price?: number;
  currency?: string;
}

export type UpdatePackDto = Partial<CreatePackDto>;

export interface CreatePackPriceDto {
  archType: ArchType;
  price: number;          // sent as number, persisted as Decimal
  currency?: string;
}

export type UpdatePackPriceDto = Partial<CreatePackPriceDto> & {
  isActive?: boolean;
};

export interface AttachPackToQuotationDto {
  packId: string;
  // Optional — defaults to two_arches on the backend. The admin UI
  // consolidated to a single price per pack, so callers don't need
  // to pass an arch.
  archType?: ArchType;
}

export interface PaymentPlanBatchDto {
  fromStep: number;
  toStep: number;
}

export interface PaymentPlanInstallmentDto {
  amount: number;
  availableFrom?: string;   // ISO date
  dueDate?: string;         // ISO date
  batch: PaymentPlanBatchDto;
}

export interface ConfigurePaymentPlanDto {
  paymentMode: PaymentMode;
  installments: PaymentPlanInstallmentDto[];
}

export interface QuoteInstallment {
  id: string;
  quotationId: string;
  installmentNumber: number;
  amount: string;
  availableFrom: string;
  dueDate?: string | null;
  status: InstallmentStatus;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteStepBatch {
  id: string;
  quotationId: string;
  installmentId: string;
  batchNumber: number;
  fromStep: number;
  toStep: number;
  status: BatchStatus;
  deliveredAt?: string | null;
  deliveredById?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  quotationId: string;
  installmentId: string;
  amount: string;
  currency: string;
  // Backend serialises the Prisma column verbatim as `paymentMethod`.
  // `method` is kept as an optional alias for any legacy consumer
  // that still reads it; the table + every new caller should rely
  // on `paymentMethod`.
  paymentMethod: PaymentMethod;
  /** @deprecated — historical alias for `paymentMethod`. */
  method?: PaymentMethod;
  status: PaymentRecordStatus;
  idempotencyKey?: string | null;
  transactionId?: string | null;
  bankReference?: string | null;
  proofUrl?: string | null;
  receiptNumber?: string | null;
  notes?: string | null;
  rejectionReason?: string | null;
  initiatedById?: string | null;
  confirmedById?: string | null;
  rejectedById?: string | null;
  initiatedAt?: string | null;
  confirmedAt?: string | null;
  rejectedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeclareBankTransferDto {
  bankReference?: string;
  // proofFile is sent as multipart FormData — not on the DTO type itself.
}

export interface ConfirmPaymentDto {
  notes?: string;
}

export interface RejectPaymentDto {
  rejectionReason: string;
}

export interface RecordCashPaymentDto {
  receiptNumber?: string;
  notes?: string;
}

export enum PaymentSortBy {
  CREATED_AT = 'createdAt',
  AMOUNT = 'amount',
  PAID_AT = 'paidAt',
  STATUS = 'status',
}

export enum PaymentSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * Filter shape for the payment history + pending queue. Mirrors the
 * backend `PaymentFilterDto`. Multi-value `methods` and `statuses`
 * arrays are sent as comma-separated strings on the wire (service
 * layer handles the join).
 */
export interface PaymentFilterDto {
  page?: number;
  limit?: number;
  // Legacy single-value (kept for backward compat — multi versions win).
  method?: PaymentMethod;
  paymentMethod?: PaymentMethod;
  status?: PaymentRecordStatus;
  // Canonical multi-value filters.
  methods?: PaymentMethod[];
  statuses?: PaymentRecordStatus[];
  // Search + structural narrowing.
  search?: string;
  doctorId?: string;
  patientId?: string;
  // Date range.
  createdFrom?: string;
  createdTo?: string;
  // Sorting.
  sortBy?: PaymentSortBy;
  sortOrder?: PaymentSortOrder;
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

// ─── Notifications ──────────────────────────────────────────────────────────
// Mirrors the backend `NotificationType` Prisma enum + Notification model.
// Stays role-agnostic: the bell dropdown renders any type that lands in the
// recipient's inbox.

export enum NotificationType {
  // Admin-facing
  USER_REGISTERED = 'user_registered',
  ORDER_CREATED = 'order_created',
  ORDER_SUBMITTED = 'order_submitted',
  PAYMENT_RECEIVED = 'payment_received',
  PAYMENT_DECLARED = 'payment_declared',
  CASH_PAYMENT_RECORDED = 'cash_payment_recorded',
  // Doctor-facing
  ORDER_STATUS_CHANGED = 'order_status_changed',
  TREATMENT_PLAN_READY = 'treatment_plan_ready',
  TREATMENT_PLAN_UPDATED = 'treatment_plan_updated',
  QUOTATION_SENT = 'quotation_sent',
  QUOTATION_CANCELED = 'quotation_canceled',
  PAYMENT_CONFIRMED = 'payment_confirmed',
  PAYMENT_REJECTED = 'payment_rejected',
  BATCH_UNLOCKED = 'batch_unlocked',
  BATCH_DELIVERED = 'batch_delivered',
  INSTALLMENT_OVERDUE = 'installment_overdue',
  // Generic
  SYSTEM_MESSAGE = 'system_message',
}

export interface Notification {
  id: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  /** Deep link the UI navigates to on click; path-only. */
  link?: string | null;
  /** Free-form structured payload — type-narrow at the call site. */
  metadata?: Record<string, unknown> | null;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationFilters {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
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
  // Admin trash-bin view — backend returns ONLY soft-deleted rows
  // when this is true. Non-admin callers are silently ignored.
  includeDeleted?: boolean;
}

export interface BulkActionDto {
  ids: string[];
}

export interface BulkUpdateStatusDto {
  ids: string[];
  isActive: boolean;
}

// ==========================================
// SUPPORT CHAT (doctor ↔ admin)
// ==========================================

export enum SupportConversationStatus {
  OPEN = 'open',
  PENDING = 'pending',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum SupportPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

export interface SupportMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: UserRole;
  body?: string | null;
  attachmentRelativePath?: string | null;
  attachmentMime?: string | null;
  attachmentName?: string | null;
  attachmentSize?: number | null;
  readAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  sender?: {
    id: string;
    fullName: string;
    role: UserRole;
    avatarUrl?: string | null;
  } | null;
}

export interface SupportConversation {
  id: string;
  doctorId: string;
  subject?: string | null;
  status: SupportConversationStatus;
  priority: SupportPriority;
  assignedAdminId?: string | null;
  unreadByAdmin: number;
  unreadByDoctor: number;
  lastMessageAt: string;
  lastMessagePreview?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  doctor?: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl?: string | null;
  } | null;
  assignedAdmin?: {
    id: string;
    fullName: string;
    email: string;
  } | null;
}

export interface SupportConversationFilters {
  page?: number;
  limit?: number;
  search?: string;
  statuses?: SupportConversationStatus[];
  priorities?: SupportPriority[];
  unreadOnly?: boolean;
  includeDeleted?: boolean;
}

// ==========================================
// DASHBOARD (Admin + Doctor)
// ==========================================

export interface DashboardRange {
  from?: string;
  to?: string;
}

export interface AdminDashboardKpis {
  range: { from: string; to: string };
  revenue: {
    total: number;
    today: number;
    thisMonth: number;
    prevMonth: number;
    monthlyGrowthPct: number;
    collected: number;
    unpaid: number;
  };
  doctors: { total: number; active: number; inactive: number; newInRange: number };
  patients: { total: number; newInRange: number };
  orders: {
    total: number;
    inRange: number;
    today: number;
    thisMonth: number;
    paid: number;
    unpaid: number;
  };
  payments: {
    pending: number;
    awaitingConfirmation: number;
    completed: number;
    failed: number;
    rejected: number;
  };
  packs: {
    active: number;
    bestSelling: { id: string; name: string; soldCount: number; revenue: number } | null;
    conversionRatePct: number;
    averageOrderValue: number;
  };
}

export interface AdminTopDoctorRow {
  doctorId: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  clinicName: string | null;
  city: string | null;
  orders: number;
  paidOrders: number;
  revenue: number;
  outstanding: number;
}

export interface AdminTopDoctorsResponse {
  byOrders: AdminTopDoctorRow[];
  byPaidOrders: AdminTopDoctorRow[];
  byOutstanding: AdminTopDoctorRow[];
}

export interface AdminBestPackRow {
  packId: string;
  name: string;
  isActive: boolean;
  sold: number;
  revenue: number;
  collected: number;
  currentPrice: number;
  currency: string;
}

export interface AdminTrendPoint {
  date: string;
  revenue: number;
  orders: number;
  newDoctors: number;
  newPatients: number;
}

export interface AdminTrendsResponse {
  range: { from: string; to: string };
  points: AdminTrendPoint[];
}

export interface DoctorDashboardKpis {
  doctorId: string;
  generatedAt: string;
  orders: {
    total: number;
    today: number;
    thisMonth: number;
    prevMonth: number;
    paid: number;
    unpaid: number;
  };
  patients: { total: number; newThisMonth: number };
  revenue: { totalGenerated: number; collected: number; unpaidDebt: number };
  payments: {
    pending: number;
    completed: number;
    failed: number;
    awaitingConfirmation: number;
  };
  quotations: { total: number; paid: number; unpaid: number };
  currentPack: {
    id: string;
    name: string;
    description: string | null;
    approvedAt: string | null;
    expiresAt: string | null;
    remainingDays: number | null;
    usagePct: number | null;
    isUnlimitedSteps: boolean;
  } | null;
  suggestedPack: {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
  } | null;
}

export interface AvailablePack {
  id: string;
  name: string;
  description: string | null;
  maxStepsPerArch: number | null;
  includedCorrections: number | null;
  isUnlimitedSteps: boolean;
  isUnlimitedCorrections: boolean;
  isForOrthodontists: boolean;
  price: number;
  currency: string;
  isCurrent: boolean;
}

// ==========================================
// SLIDER MEDIA (Doctor dashboard carousel)
// ==========================================

export enum SliderMediaType {
  IMAGE = 'image',
  VIDEO = 'video',
}

export enum SliderMediaSourceType {
  UPLOAD = 'upload',
  EXTERNAL = 'external',
}

export enum SliderMediaDeviceTarget {
  DESKTOP = 'desktop',
  MOBILE = 'mobile',
}

export enum SliderMediaStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export interface SliderMedia {
  id: string;
  title: string;
  mediaType: SliderMediaType;
  sourceType: SliderMediaSourceType;
  deviceTargets: SliderMediaDeviceTarget[];
  desktopUrl: string | null;
  mobileUrl: string | null;
  status: SliderMediaStatus;
  displayOrder: number;
  linkUrl: string | null;
  createdById: string | null;
  createdBy?: { id: string; fullName: string } | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SliderMediaFilters {
  page?: number;
  limit?: number;
  status?: SliderMediaStatus;
  device?: SliderMediaDeviceTarget;
  mediaType?: SliderMediaType;
  search?: string;
  includeDeleted?: boolean;
  deletedOnly?: boolean;
}

export interface CreateSliderMediaInput {
  title: string;
  mediaType: SliderMediaType;
  sourceType: SliderMediaSourceType;
  deviceTargets: SliderMediaDeviceTarget[];
  desktopUrl?: string;
  mobileUrl?: string;
  status?: SliderMediaStatus;
  displayOrder?: number;
  linkUrl?: string;
  desktopFile?: File;
  mobileFile?: File;
}

export interface UpdateSliderMediaInput {
  title?: string;
  mediaType?: SliderMediaType;
  sourceType?: SliderMediaSourceType;
  deviceTargets?: SliderMediaDeviceTarget[];
  desktopUrl?: string;
  mobileUrl?: string;
  clearDesktopUrl?: boolean;
  clearMobileUrl?: boolean;
  status?: SliderMediaStatus;
  displayOrder?: number;
  linkUrl?: string;
  desktopFile?: File;
  mobileFile?: File;
}

// ==========================================
// REPORTS
// ==========================================

export type ReportExportType = 'revenue' | 'doctors' | 'packs';

export interface ReportSummary {
  generatedAt: string;
  range: { from: string; to: string };
  kpis: AdminDashboardKpis;
  topDoctors: AdminTopDoctorsResponse;
  bestPacks: AdminBestPackRow[];
  trends: AdminTrendsResponse;
}
