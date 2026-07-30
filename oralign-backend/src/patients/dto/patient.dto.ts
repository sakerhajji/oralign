import { ApiProperty } from '@nestjs/swagger';
import { Gender } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const E164_PHONE_REGEX = /^\+[1-9]\d{1,14}$/;

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const normalizeEmail = (value: unknown): unknown => {
  const normalized = normalizeOptionalString(value);
  if (typeof normalized !== 'string') return normalized;
  return normalized.toLowerCase();
};

export class CreatePatientDto {
  @ApiProperty({ example: 'Sarah Morgan', description: 'Patient full name' })
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiProperty({
    example: 'sarah.morgan@example.com',
    required: false,
    description: 'Patient email address',
  })
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value))
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({
    example: '+21612345678',
    required: false,
    description: 'Patient phone number in E.164 format',
  })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  @Matches(E164_PHONE_REGEX, {
    message: 'Phone must be in E.164 format (e.g. +21612345678)',
  })
  phone?: string;

  @ApiProperty({ enum: Gender, required: false })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiProperty({
    example: '1992-05-20',
    required: false,
    description: 'Patient birth date',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateOfBirth?: Date;

  @ApiProperty({ example: '12 Dental Avenue', required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ example: 'Prefers morning appointments.', required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  notes?: string;

  // ── Clinical conditions (multi-select + Other text) ──────────────
  // Stored as a free String[] — see Patient model comment for why
  // it isn't a Postgres enum. Capped at 30 entries to bound payload
  // size; the canonical frontend list has 15 today.
  @ApiProperty({
    type: [String],
    required: false,
    example: ['Crowding', 'Deep bite'],
    description:
      'Multi-select clinical-condition labels. Frontend constrains to a known set + "Other".',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  clinicalConditions?: string[];

  @ApiProperty({
    required: false,
    description:
      'Free-text detail typed when "Other" is selected in clinicalConditions.',
  })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  clinicalConditionsOther?: string;

  @ApiProperty({
    example: '8a45c87d-c66a-4f30-8504-c90f7d14e68e',
    required: false,
    description:
      'Admin-only dentist filter/assignment. Dentists cannot set this.',
  })
  @IsOptional()
  @IsString()
  doctorId?: string;
}

export class UpdatePatientDto {
  @ApiProperty({ example: 'Sarah Morgan', required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @ApiProperty({ example: 'sarah.morgan@example.com', required: false })
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value))
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: '+21612345678', required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  @Matches(E164_PHONE_REGEX, {
    message: 'Phone must be in E.164 format (e.g. +21612345678)',
  })
  phone?: string;

  @ApiProperty({ enum: Gender, required: false })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiProperty({ example: '1992-05-20', required: false })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateOfBirth?: Date;

  @ApiProperty({ example: '12 Dental Avenue', required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ example: 'Prefers morning appointments.', required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  notes?: string;

  // ── Clinical conditions (multi-select + Other text) — see CreatePatientDto.
  @ApiProperty({
    type: [String],
    required: false,
    example: ['Crowding', 'Deep bite'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  clinicalConditions?: string[];

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  clinicalConditionsOther?: string;

  @ApiProperty({
    example: '8a45c87d-c66a-4f30-8504-c90f7d14e68e',
    required: false,
    description: 'Admin-only dentist reassignment.',
  })
  @IsOptional()
  @IsString()
  doctorId?: string;
}

export class PatientResponseDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  doctorId!: string;
  @ApiProperty()
  fullName!: string;
  @ApiProperty({ required: false })
  email?: string;
  @ApiProperty({ required: false })
  phone?: string;
  @ApiProperty({ enum: Gender, required: false })
  gender?: Gender;
  @ApiProperty({ required: false })
  dateOfBirth?: Date;
  @ApiProperty({ required: false })
  address?: string;
  @ApiProperty({ required: false })
  notes?: string;
  @ApiProperty({
    required: false,
    description: 'Relative URL of the patient profile photo.',
  })
  profilePhotoUrl?: string;
  @ApiProperty({ type: [String], required: false })
  clinicalConditions!: string[];
  @ApiProperty({ required: false })
  clinicalConditionsOther?: string;
  @ApiProperty({ required: false })
  doctor?: {
    id: string;
    fullName: string;
    email: string;
  };
  @ApiProperty()
  createdAt!: Date;
  @ApiProperty()
  updatedAt!: Date;
}

// Sort fields the patients-list endpoint honours. Narrow enum so a
// typo in the client falls through to the default rather than producing
// nonsense ordering.
export enum PatientSortField {
  createdAt = 'createdAt',
  updatedAt = 'updatedAt',
  fullName = 'fullName',
}

export enum PatientSortOrder {
  asc = 'asc',
  desc = 'desc',
}

export class PatientFilterDto {
  @ApiProperty({ required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ required: false, default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({
    required: false,
    description: 'Search by name, email, or phone',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, description: 'Admin-only dentist filter' })
  @IsOptional()
  @IsString()
  doctorId?: string;

  @ApiProperty({ enum: Gender, required: false })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiProperty({
    enum: PatientSortField,
    required: false,
    default: PatientSortField.createdAt,
  })
  @IsOptional()
  @IsEnum(PatientSortField)
  sortBy?: PatientSortField;

  @ApiProperty({
    enum: PatientSortOrder,
    required: false,
    default: PatientSortOrder.desc,
  })
  @IsOptional()
  @IsEnum(PatientSortOrder)
  sortOrder?: PatientSortOrder;

  @ApiProperty({ required: false, example: '2024-05-22' })
  @IsOptional()
  @IsString()
  createdFrom?: string;

  @ApiProperty({ required: false, example: '2024-06-22' })
  @IsOptional()
  @IsString()
  createdTo?: string;
}

export class BulkDeletePatientsDto {
  @ApiProperty({
    type: [String],
    description: 'Array of patient IDs to soft-delete',
    example: ['uuid-1', 'uuid-2'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids!: string[];
}
