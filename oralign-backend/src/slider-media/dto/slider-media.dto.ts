import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  SliderMediaDeviceTarget,
  SliderMediaSourceType,
  SliderMediaStatus,
  SliderMediaType,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Slider-media DTOs.
 *
 * Two flavours: a permissive create/update body that the admin form
 * sends (multipart fields are coerced from strings on the wire) and a
 * lean list-filter for the table page.
 *
 * IMPORTANT: when multipart files are present we don't validate the URL
 * fields here — the controller fills them in post-upload before
 * persisting. The DTO still keeps `@IsOptional()` so the validator
 * doesn't reject a body without them.
 */

const coerceBool = ({ value }: { value: unknown }): boolean | unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

const coerceInt = ({ value }: { value: unknown }): number | unknown => {
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isNaN(n) ? value : n;
  }
  return value;
};

/**
 * `deviceTargets=desktop&deviceTargets=mobile` (multiple) or a single
 * comma-separated string both end up as a string[] when class-transformer
 * normalises the multipart body. Either shape works here.
 */
const coerceArray = ({ value }: { value: unknown }) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return value;
};

export class CreateSliderMediaDto {
  @ApiProperty({ example: 'Spring promotion banner' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @ApiProperty({ enum: SliderMediaType })
  @IsEnum(SliderMediaType)
  mediaType!: SliderMediaType;

  @ApiProperty({ enum: SliderMediaSourceType })
  @IsEnum(SliderMediaSourceType)
  sourceType!: SliderMediaSourceType;

  @ApiProperty({
    enum: SliderMediaDeviceTarget,
    isArray: true,
    description:
      'Which device list(s) the slide belongs to. Pass desktop, mobile, or both.',
  })
  @Transform(coerceArray)
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(SliderMediaDeviceTarget, { each: true })
  deviceTargets!: SliderMediaDeviceTarget[];

  // ─── External URLs (only when sourceType=external) ──────────────
  // Uploads override these in the controller — we still accept them
  // so admins can mix a hosted desktop video with an uploaded mobile
  // thumbnail in one row if they want.

  @ApiPropertyOptional({ example: 'https://cdn.oralign.com/spring-desktop.mp4' })
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  desktopUrl?: string;

  @ApiPropertyOptional({ example: 'https://cdn.oralign.com/spring-mobile.mp4' })
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  mobileUrl?: string;

  @ApiPropertyOptional({ enum: SliderMediaStatus, default: SliderMediaStatus.active })
  @IsOptional()
  @IsEnum(SliderMediaStatus)
  status?: SliderMediaStatus;

  @ApiPropertyOptional({ minimum: 0, maximum: 9999, default: 0 })
  @IsOptional()
  @Transform(coerceInt)
  @IsInt()
  @Min(0)
  @Max(9999)
  displayOrder?: number;

  @ApiPropertyOptional({ example: 'https://oralign.com/packs/pro' })
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  linkUrl?: string;
}

export class UpdateSliderMediaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional({ enum: SliderMediaType })
  @IsOptional()
  @IsEnum(SliderMediaType)
  mediaType?: SliderMediaType;

  @ApiPropertyOptional({ enum: SliderMediaSourceType })
  @IsOptional()
  @IsEnum(SliderMediaSourceType)
  sourceType?: SliderMediaSourceType;

  @ApiPropertyOptional({
    enum: SliderMediaDeviceTarget,
    isArray: true,
  })
  @IsOptional()
  @Transform(coerceArray)
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(SliderMediaDeviceTarget, { each: true })
  deviceTargets?: SliderMediaDeviceTarget[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  desktopUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  mobileUrl?: string;

  // Allow callers to wipe a URL (e.g. "drop the mobile-specific asset
  // and fall back to desktop") by sending the literal string "null".
  // Pure undefined leaves the existing URL untouched.
  @ApiPropertyOptional({ description: 'Set to true to drop desktopUrl' })
  @IsOptional()
  @Transform(coerceBool)
  clearDesktopUrl?: boolean;

  @ApiPropertyOptional({ description: 'Set to true to drop mobileUrl' })
  @IsOptional()
  @Transform(coerceBool)
  clearMobileUrl?: boolean;

  @ApiPropertyOptional({ enum: SliderMediaStatus })
  @IsOptional()
  @IsEnum(SliderMediaStatus)
  status?: SliderMediaStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(coerceInt)
  @IsInt()
  @Min(0)
  @Max(9999)
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  linkUrl?: string;
}

export class SliderMediaFilterDto {
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

  @ApiPropertyOptional({ enum: SliderMediaStatus })
  @IsOptional()
  @IsEnum(SliderMediaStatus)
  status?: SliderMediaStatus;

  @ApiPropertyOptional({ enum: SliderMediaDeviceTarget })
  @IsOptional()
  @IsEnum(SliderMediaDeviceTarget)
  device?: SliderMediaDeviceTarget;

  @ApiPropertyOptional({ enum: SliderMediaType })
  @IsOptional()
  @IsEnum(SliderMediaType)
  mediaType?: SliderMediaType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(coerceBool)
  includeDeleted?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Return only soft-deleted slides. Used by the Trash tab.',
  })
  @IsOptional()
  @Transform(coerceBool)
  deletedOnly?: boolean;
}

export class ReorderSliderMediaDto {
  @ApiProperty({ type: [String], description: 'Slide ids in desired display order' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids!: string[];
}
