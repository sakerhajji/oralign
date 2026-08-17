import {
  CommunitySubmissionFormat,
  CommunitySubmissionRole,
  CommunitySubmissionStatus,
  CommunitySubmissionTreatmentStatus,
} from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const coerceBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
};

export class CreateCommunitySubmissionDto {
  @ApiProperty({ enum: CommunitySubmissionFormat })
  @IsEnum(CommunitySubmissionFormat)
  format!: CommunitySubmissionFormat;

  @ApiProperty({ example: 'Sonia' })
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  firstName!: string;

  @ApiProperty({ example: 'K.' })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(2)
  lastNameInitial!: string;

  @ApiProperty({ example: '+216 98 000 000' })
  @Transform(trimString)
  @IsString()
  @MinLength(7)
  @MaxLength(32)
  phone!: string;

  @ApiProperty({ example: 'sonia@example.com' })
  @Transform(trimString)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({ example: 'Tunis' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiProperty({ enum: CommunitySubmissionRole })
  @IsEnum(CommunitySubmissionRole)
  role!: CommunitySubmissionRole;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(80)
  childName?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 21 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(21)
  childAge?: number;

  @ApiProperty({ enum: CommunitySubmissionTreatmentStatus })
  @IsEnum(CommunitySubmissionTreatmentStatus)
  treatmentStatus!: CommunitySubmissionTreatmentStatus;

  @ApiProperty({ description: 'Why the person chose ORALIGN.' })
  @Transform(trimString)
  @IsString()
  @MinLength(10)
  @MaxLength(3000)
  why!: string;

  @ApiProperty({ description: 'How the treatment experience went.' })
  @Transform(trimString)
  @IsString()
  @MinLength(10)
  @MaxLength(3000)
  journey!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(3000)
  satisfied?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(3000)
  message?: string;

  @ApiProperty({ example: true })
  @Transform(coerceBoolean)
  @IsBoolean()
  consent!: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(coerceBoolean)
  @IsBoolean()
  contactConsent?: boolean;
}

export class CommunitySubmissionListDto {
  @ApiPropertyOptional({ enum: CommunitySubmissionStatus })
  @IsOptional()
  @IsEnum(CommunitySubmissionStatus)
  status?: CommunitySubmissionStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  // Trash-bin view (mirrors PatientFilterDto.includeDeleted): the archived
  // rows stay hidden unless an admin opts in explicitly.
  @ApiPropertyOptional({
    type: Boolean,
    description:
      'Admin only — return ONLY archived submissions (deletedAt is set). Renders the trash-bin view.',
  })
  @IsOptional()
  @Transform(coerceBoolean)
  @IsBoolean()
  includeDeleted?: boolean;
}

export class RejectCommunitySubmissionDto {
  @ApiPropertyOptional({ description: 'Internal moderation note.' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}

/**
 * Admin-created stories use the same validation as the public form, but can
 * optionally be published immediately after the media has been processed.
 */
export class AdminCreateCommunitySubmissionDto extends CreateCommunitySubmissionDto {
  @ApiPropertyOptional({
    enum: CommunitySubmissionStatus,
    default: CommunitySubmissionStatus.pending,
  })
  @IsOptional()
  @IsEnum(CommunitySubmissionStatus)
  status?: CommunitySubmissionStatus;
}

/** Text/content edits intentionally do not replace media or moderation state. */
export class UpdateCommunitySubmissionDto extends PartialType(
  CreateCommunitySubmissionDto,
) {}
