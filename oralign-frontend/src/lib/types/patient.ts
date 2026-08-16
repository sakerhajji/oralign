// Patient DTOs
// Split out of the former 2,000-line lib/types/index.ts; import via '@/lib/types'.

import type { ToothInstruction } from './entities';
import { ArchTreatment, Gender, PatientStage } from './enums';

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
