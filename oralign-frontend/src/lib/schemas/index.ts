import { z } from 'zod';
import {
  ArchTreatment,
  Gender,
  PatientStage,
  ToothInstructionType,
  UserRole,
  DayOfWeek,
} from '@/lib/types';

const E164_PHONE_REGEX = /^\+[1-9]\d{1,14}$/;
const ISO_COUNTRY_REGEX = /^[A-Z]{2}$/;

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export const optionalE164PhoneSchema = z.preprocess(
  normalizeOptionalString,
  z
    .string()
    .regex(E164_PHONE_REGEX, 'Phone must be in international format (e.g. +21612345678)')
    .optional(),
);

export const optionalCountrySchema = z.preprocess(
  (value) => {
    const normalized = normalizeOptionalString(value);
    if (typeof normalized !== 'string') return normalized;
    return normalized.toUpperCase();
  },
  z
    .string()
    .regex(ISO_COUNTRY_REGEX, 'Country must be a 2-letter ISO code (e.g. TN)')
    .optional(),
);

// ==========================================
// AUTH SCHEMAS
// ==========================================

export const signUpSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  phone: optionalE164PhoneSchema,
  country: optionalCountrySchema,
});

export const signInSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
});

export const verifyEmailSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  verificationCode: z.string().min(1, 'Verification code is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(8, 'Password must be at least 8 characters'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// ==========================================
// USER SCHEMAS
// ==========================================

export const createUserSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  phone: optionalE164PhoneSchema,
  country: optionalCountrySchema,
  role: z.nativeEnum(UserRole).optional(),
  avatarUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
});

export const updateUserSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters').optional(),
  phone: optionalE164PhoneSchema,
  country: optionalCountrySchema,
  password: z.string().min(8, 'Password must be at least 8 characters').optional().or(z.literal('')),
  role: z.nativeEnum(UserRole).optional(),
  isEmailVerified: z.boolean().optional(),
});

export const accountProfileSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  phone: optionalE164PhoneSchema,
  country: optionalCountrySchema,
});

export const clinicSettingsSchema = z.object({
  clinicName: z.string().min(1, 'Clinic name is required'),
  clinicAddress: z.string().optional(),
  clinicPhone: optionalE164PhoneSchema,
  city: z.string().optional(),
  country: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  description: z.string().optional(),
});

export const securitySettingsSchema = z
  .object({
    currentPassword: z.string().min(8, 'Password must be at least 8 characters'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(8, 'Password must be at least 8 characters'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// ==========================================
// DENTIST PROFILE SCHEMAS
// ==========================================

export const createDentistProfileSchema = z.object({
  clinicName: z.string().min(1, 'Clinic name is required'),
  clinicAddress: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  clinicPhone: z.string().optional(),
  clinicEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  description: z.string().optional(),
  logoUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
});

export const updateDentistProfileSchema = z.object({
  clinicName: z.string().min(1, 'Clinic name is required').optional(),
  clinicAddress: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  clinicPhone: z.string().optional(),
  clinicEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  description: z.string().optional(),
  logoUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
});

// ==========================================
// WORKING HOURS SCHEMAS
// ==========================================

export const createWorkingHoursSchema = z.object({
  dentistProfileId: z.string().uuid('Invalid profile ID'),
  dayOfWeek: z.nativeEnum(DayOfWeek),
  openTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm)'),
  closeTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm)'),
  isClosed: z.boolean().optional(),
}).refine((data) => {
  if (data.isClosed) return true;
  return data.openTime < data.closeTime;
}, {
  message: 'Opening time must be before closing time',
  path: ['closeTime'],
});

export const updateWorkingHoursSchema = z.object({
  openTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm)').optional(),
  closeTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm)').optional(),
  isClosed: z.boolean().optional(),
});

// ==========================================
// PATIENT SCHEMAS
// ==========================================

export const createPatientSchema = z.object({
  fullName: z.string().min(2, 'Patient name must be at least 2 characters'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: optionalE164PhoneSchema,
  gender: z.nativeEnum(Gender).optional(),
  dateOfBirth: z.string().optional().or(z.literal('')),
  address: z.string().optional(),
  notes: z.string().optional(),
  doctorId: z.string().optional(),
});

export const updatePatientSchema = createPatientSchema;

// ==========================================
// ORDER SCHEMAS
// ==========================================

export const orderClinicalSchema = z.object({
  patientId: z.string().min(1, 'Patient is required'),
  doctorId: z.string().optional(),
  patientStage: z.nativeEnum(PatientStage).optional(),
  chiefComplaint: z.string().optional(),
  archTreatment: z.nativeEnum(ArchTreatment).optional(),
  treatBothArch: z.boolean().optional(),
  treatmentPlan: z.string().optional(),
  dontMoveOption: z.string().optional(),
  apRelationship: z.string().optional(),
  anteroposteriorRelationship: z.string().optional(),
  elastics: z.string().optional(),
  openBite: z.string().optional(),
  midline: z.string().optional(),
  ipr: z.string().optional(),
  biteRamps: z.string().optional(),
  crossbite: z.string().optional(),
  spaces: z.string().optional(),
  extractions: z.string().optional(),
  specialInstructions: z.string().optional(),
  additionalInstructions: z.string().optional(),
  useCbctWithScans: z.boolean().optional(),
  wantsManufacturing: z.boolean().optional(),
  materials: z.array(z.string()).optional(),
});

export const toothInstructionSchema = z.object({
  toothNumber: z.number().int().min(11).max(48),
  type: z.nativeEnum(ToothInstructionType),
});

export const createOrderSchema = orderClinicalSchema.extend({
  toothInstructions: z.array(toothInstructionSchema).optional(),
});

// ==========================================
// SEARCH SCHEMAS
// ==========================================

export const searchByCitySchema = z.object({
  city: z.string().min(1, 'City is required'),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(100).optional(),
});

export const searchNearbySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusKm: z.number().positive().max(1000).optional(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(100).optional(),
});

// Export types
export type SignUpFormData = z.infer<typeof signUpSchema>;
export type SignInFormData = z.infer<typeof signInSchema>;
export type VerifyEmailFormData = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
export type CreateUserFormData = z.infer<typeof createUserSchema>;
export type UpdateUserFormData = z.infer<typeof updateUserSchema>;
export type AccountProfileFormData = z.infer<typeof accountProfileSchema>;
export type ClinicSettingsFormData = z.infer<typeof clinicSettingsSchema>;
export type SecuritySettingsFormData = z.infer<typeof securitySettingsSchema>;
export type CreateDentistProfileFormData = z.infer<typeof createDentistProfileSchema>;
export type UpdateDentistProfileFormData = z.infer<typeof updateDentistProfileSchema>;
export type CreateWorkingHoursFormData = z.infer<typeof createWorkingHoursSchema>;
export type UpdateWorkingHoursFormData = z.infer<typeof updateWorkingHoursSchema>;
export type CreatePatientFormData = z.infer<typeof createPatientSchema>;
export type UpdatePatientFormData = z.infer<typeof updatePatientSchema>;
export type OrderClinicalFormData = z.infer<typeof orderClinicalSchema>;
export type CreateOrderFormData = z.infer<typeof createOrderSchema>;
export type SearchByCityFormData = z.infer<typeof searchByCitySchema>;
export type SearchNearbyFormData = z.infer<typeof searchNearbySchema>;
