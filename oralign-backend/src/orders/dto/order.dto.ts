import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  ArchTreatment,
  OrderFileCategory,
  OrderStatus,
  PatientStage,
  ToothInstructionType,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class ToothInstructionDto {
  @ApiProperty({ example: 11, description: 'FDI tooth number' })
  @Type(() => Number)
  @IsInt()
  @Min(11)
  @Max(48)
  toothNumber!: number;

  @ApiProperty({ enum: ToothInstructionType })
  @IsEnum(ToothInstructionType)
  type!: ToothInstructionType;
}

export class UpdateToothInstructionsDto {
  @ApiProperty({ type: [ToothInstructionDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ToothInstructionDto)
  instructions!: ToothInstructionDto[];
}

export class CreateOrderDto {
  @ApiProperty({ required: false, description: 'Optional admin order code' })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  @MinLength(3)
  orderCode?: string;

  @ApiProperty({ required: false, description: 'Admin-only dentist owner' })
  @IsOptional()
  @IsString()
  doctorId?: string;

  @ApiProperty({ description: 'Patient ID' })
  @IsString()
  patientId!: string;

  @ApiProperty({ enum: PatientStage, required: false })
  @IsOptional()
  @IsEnum(PatientStage)
  patientStage?: PatientStage;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @ApiProperty({ enum: ArchTreatment, required: false })
  @IsOptional()
  @IsEnum(ArchTreatment)
  archTreatment?: ArchTreatment;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  treatBothArch?: boolean;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  treatmentPlan?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  dontMoveOption?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  apRelationship?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  anteroposteriorRelationship?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  elastics?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  openBite?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  midline?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  ipr?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  biteRamps?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  crossbite?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  spaces?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  extractions?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  specialInstructions?: string;

  @ApiProperty({ required: false })
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  additionalInstructions?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  useCbctWithScans?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  wantsManufacturing?: boolean;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  materials?: string[];

  @ApiProperty({ type: [ToothInstructionDto], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ToothInstructionDto)
  toothInstructions?: ToothInstructionDto[];
}

export class UpdateOrderDto extends PartialType(CreateOrderDto) {}

export class OrderFilterDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  doctorId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiProperty({ enum: OrderStatus, required: false })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  orderCode?: string;
}

export class UploadOrderFilesQueryDto {
  @ApiProperty({ enum: OrderFileCategory, required: false, default: 'other' })
  @IsOptional()
  @IsEnum(OrderFileCategory)
  category?: OrderFileCategory;
}

export class OrderFileResponseDto {
  @ApiProperty()
  id!: string;
  @ApiProperty({ enum: OrderFileCategory })
  category!: OrderFileCategory;
  @ApiProperty()
  originalName!: string;
  @ApiProperty()
  fileName!: string;
  @ApiProperty()
  relativePath!: string;
  @ApiProperty()
  mimeType!: string;
  @ApiProperty()
  size!: number;
  @ApiProperty()
  createdAt!: Date;
}

export class OrderResponseDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  orderCode!: string;
  @ApiProperty()
  doctorId!: string;
  @ApiProperty()
  patientId!: string;
  @ApiProperty({ required: false })
  assignedDesignerId?: string;
  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;
  @ApiProperty({ enum: PatientStage, required: false })
  patientStage?: PatientStage;
  @ApiProperty({ required: false })
  chiefComplaint?: string;
  @ApiProperty({ enum: ArchTreatment, required: false })
  archTreatment?: ArchTreatment;
  @ApiProperty()
  treatBothArch!: boolean;
  @ApiProperty({ required: false })
  treatmentPlan?: string;
  @ApiProperty({ required: false })
  dontMoveOption?: string;
  @ApiProperty({ required: false })
  apRelationship?: string;
  @ApiProperty({ required: false })
  anteroposteriorRelationship?: string;
  @ApiProperty({ required: false })
  elastics?: string;
  @ApiProperty({ required: false })
  openBite?: string;
  @ApiProperty({ required: false })
  midline?: string;
  @ApiProperty({ required: false })
  ipr?: string;
  @ApiProperty({ required: false })
  biteRamps?: string;
  @ApiProperty({ required: false })
  crossbite?: string;
  @ApiProperty({ required: false })
  spaces?: string;
  @ApiProperty({ required: false })
  extractions?: string;
  @ApiProperty({ required: false })
  specialInstructions?: string;
  @ApiProperty({ required: false })
  additionalInstructions?: string;
  @ApiProperty()
  useCbctWithScans!: boolean;
  @ApiProperty()
  wantsManufacturing!: boolean;
  @ApiProperty({ type: [String] })
  materials!: string[];
  @ApiProperty({ type: [ToothInstructionDto] })
  toothInstructions!: ToothInstructionDto[];
  @ApiProperty({ type: [OrderFileResponseDto] })
  files!: OrderFileResponseDto[];
  @ApiProperty({ required: false })
  doctor?: { id: string; fullName: string; email: string };
  @ApiProperty({ required: false })
  patient?: { id: string; fullName: string; email?: string; phone?: string };
  @ApiProperty()
  createdAt!: Date;
  @ApiProperty()
  updatedAt!: Date;
  @ApiProperty({ required: false })
  submittedAt?: Date;
}
