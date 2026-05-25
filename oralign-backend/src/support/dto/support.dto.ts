import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  SupportConversationStatus,
  SupportPriority,
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
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Create a new conversation — opened by the doctor with an initial
 * message. The first message body is optional when an attachment is
 * uploaded with the request; the multipart route enforces that
 * (body OR attachment must be present).
 */
export class CreateSupportConversationDto {
  @ApiPropertyOptional({
    description:
      'One-line subject shown in the admin queue. Optional — falls back to the first message preview.',
    example: 'Cannot regenerate PDF in Arabic',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  subject?: string;

  @ApiPropertyOptional({ description: 'First message body. Optional if attachment is provided.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  body?: string;
}

/**
 * Send a new message to an existing conversation. Body OR attachment
 * required — controller enforces that after multer has parsed the
 * file. Validation here is independent of whether an attachment
 * arrives.
 */
export class SendSupportMessageDto {
  @ApiPropertyOptional({ description: 'Message text. Optional when an attachment is uploaded.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  body?: string;
}

/**
 * Admin-side filter for the conversations list. Doctor side ignores
 * every field except `page` + `limit` because doctors only see their
 * own threads anyway — the service applies the scope before any
 * filter.
 */
export class SupportConversationFilterDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Free-text search across doctor name, doctor email, doctor phone, subject, last message preview, and conversation id.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  search?: string;

  @ApiPropertyOptional({
    enum: SupportConversationStatus,
    isArray: true,
    description: 'Filter by one or more statuses. Comma-separated string or repeated query params.',
  })
  @IsOptional()
  @Transform(({ value }) => normaliseEnumArray(value))
  @IsArray()
  @ArrayMaxSize(10)
  @IsEnum(SupportConversationStatus, { each: true })
  statuses?: SupportConversationStatus[];

  @ApiPropertyOptional({
    enum: SupportPriority,
    isArray: true,
    description: 'Filter by one or more priorities.',
  })
  @IsOptional()
  @Transform(({ value }) => normaliseEnumArray(value))
  @IsArray()
  @ArrayMaxSize(10)
  @IsEnum(SupportPriority, { each: true })
  priorities?: SupportPriority[];

  @ApiPropertyOptional({
    description: 'Filter to admin-unread only. Useful for the "needs reply" tab.',
  })
  @IsOptional()
  @Transform(({ value }) => normaliseBoolean(value))
  @IsBoolean()
  unreadOnly?: boolean;

  @ApiPropertyOptional({
    description:
      'Admin-only: when true, returns ONLY soft-deleted conversations (trash bin).',
  })
  @IsOptional()
  @Transform(({ value }) => normaliseBoolean(value))
  @IsBoolean()
  includeDeleted?: boolean;
}

/**
 * Admin-only: transition a conversation's lifecycle status. Sending
 * `resolved` stamps `resolvedAt`; `closed` stamps `closedAt`. Other
 * directions are accepted too — admins can re-open a resolved
 * conversation just by setting status back to `open`.
 */
export class UpdateSupportStatusDto {
  @ApiProperty({ enum: SupportConversationStatus })
  @IsEnum(SupportConversationStatus)
  status!: SupportConversationStatus;
}

export class UpdateSupportPriorityDto {
  @ApiProperty({ enum: SupportPriority })
  @IsEnum(SupportPriority)
  priority!: SupportPriority;
}

/**
 * Admin assigns themselves (or a colleague) to a conversation. Pass
 * `null` to unassign. Service rejects assigning a non-admin user.
 */
export class AssignSupportConversationDto {
  @ApiPropertyOptional({ description: 'Admin user id, or null to unassign.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  assignedAdminId?: string | null;
}

/**
 * Normalise a query param that may arrive as undefined, a comma-
 * separated string, OR a repeated query array. Empty strings drop.
 */
function normaliseEnumArray(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function normaliseBoolean(value: unknown): unknown {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return undefined;
}
