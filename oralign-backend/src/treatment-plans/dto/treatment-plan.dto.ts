import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';
import {
  TreatmentPlanStatus,
  TreatmentMessageType,
  TreatmentAttachmentCategory,
} from '@prisma/client';

export class CreateTreatmentPlanDto {
  @ApiPropertyOptional({ example: 'Treatment Plan v1 — initial setup' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'https://viewer.example.com/cases/abc' })
  @IsOptional()
  @IsUrl({ require_protocol: true, require_tld: false })
  resultViewUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  totalUpperAligners?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  totalLowerAligners?: number;
}

export class UpdateTreatmentPlanDto extends PartialType(
  CreateTreatmentPlanDto,
) {
  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  issuedUpperAligners?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  issuedLowerAligners?: number;

  @ApiPropertyOptional({ enum: TreatmentPlanStatus })
  @IsOptional()
  @IsEnum(TreatmentPlanStatus)
  status?: TreatmentPlanStatus;
}

export class UpdateResultViewUrlDto {
  @ApiProperty({ example: 'https://viewer.example.com/cases/abc' })
  @IsUrl({ require_protocol: true, require_tld: false })
  resultViewUrl!: string;
}

export class CreateTreatmentMessageDto {
  @ApiPropertyOptional({
    example: 'Updated movement plan based on your feedback.',
    description: 'Optional message text (file-only messages are allowed).',
  })
  @IsOptional()
  @IsString()
  message?: string;
}

export class CreatePublicLinkDto {
  @ApiPropertyOptional({
    example: 7,
    description:
      'How many days the public link stays valid (default 30, max 365).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  validDays?: number;
}

// ─── Response shapes (Swagger only — values come straight from Prisma) ─────

export class TreatmentPlanResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty() version!: number;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: TreatmentPlanStatus }) status!: TreatmentPlanStatus;
  @ApiPropertyOptional() resultViewUrl?: string;
  @ApiPropertyOptional() movementTableImagePath?: string;
  @ApiPropertyOptional() movementTableImageName?: string;
  @ApiPropertyOptional() movementTableImageMimeType?: string;
  @ApiPropertyOptional() movementTableImageSizeBytes?: number;
  @ApiPropertyOptional() totalUpperAligners?: number;
  @ApiPropertyOptional() totalLowerAligners?: number;
  @ApiPropertyOptional() issuedUpperAligners?: number;
  @ApiPropertyOptional() issuedLowerAligners?: number;
  @ApiPropertyOptional() approvedAt?: Date;
  @ApiPropertyOptional() rejectedAt?: Date;
  @ApiPropertyOptional() publicToken?: string;
  @ApiPropertyOptional() publicExpiresAt?: Date;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class TreatmentMessageAttachmentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty() filePath!: string;
  @ApiPropertyOptional() mimeType?: string;
  @ApiPropertyOptional() sizeBytes?: number;
  @ApiProperty({ enum: TreatmentAttachmentCategory })
  category!: TreatmentAttachmentCategory;
  @ApiProperty() uploadedById!: string;
  @ApiProperty() createdAt!: Date;
}

export class TreatmentMessageResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() treatmentPlanId!: string;
  @ApiProperty() senderId!: string;
  @ApiPropertyOptional() message?: string;
  @ApiProperty({ enum: TreatmentMessageType }) type!: TreatmentMessageType;
  @ApiProperty({ type: [TreatmentMessageAttachmentResponseDto] })
  attachments!: TreatmentMessageAttachmentResponseDto[];
  @ApiPropertyOptional()
  sender?: { id: string; fullName: string; role: string; avatarUrl?: string };
  @ApiProperty() createdAt!: Date;
}

export class TreatmentPlanReviewDto extends TreatmentPlanResponseDto {
  @ApiProperty({
    description:
      'Grouped odontogram data — one entry per tooth with all the ' +
      'instructions attached to it (including admin-added IPR values).',
  })
  odontogram!: Array<{
    toothNumber: number;
    entries: Array<{
      type: string;
      value?: string | null;
      note?: string | null;
      createdById?: string | null;
      createdAt: Date;
    }>;
  }>;

  @ApiProperty({ type: [TreatmentMessageResponseDto] })
  messages!: TreatmentMessageResponseDto[];
}
