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

export enum OrderStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  IN_REVIEW = 'in_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
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
  NO_ATTACHMENTS = 'no_attachments',
  DO_NOT_MOVE = 'do_not_move',
  NO_IPR = 'no_ipr',
  IPR_VALUE = 'ipr_value',
  EXTRACT = 'extract',
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

export interface TreatmentPlanReview extends TreatmentPlan {
  odontogram: Array<{ toothNumber: number; entries: OdontogramEntry[] }>;
  messages: TreatmentMessage[];
}

export interface PublicTreatmentViewerPayload {
  treatmentPlan: {
    id: string;
    name: string;
    version: number;
    resultViewUrl?: string | null;
  };
  doctor?: { fullName?: string | null; clinicName?: string | null };
  patient?: { firstName?: string | null };
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

export interface PatientFilterParams extends PaginationParams {
  search?: string;
  doctorId?: string;
}

export interface OrderFilterParams extends PaginationParams {
  search?: string;
  doctorId?: string;
  patientId?: string;
  status?: OrderStatus;
  orderCode?: string;
}

export interface BulkActionDto {
  ids: string[];
}

export interface BulkUpdateStatusDto {
  ids: string[];
  isActive: boolean;
}
