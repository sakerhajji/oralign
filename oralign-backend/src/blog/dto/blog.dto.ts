import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { BlogStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// ─────────────────────────────────────────────────────────────────────
// Content blocks — the SHARED blog contract (identical on the frontend)
// ─────────────────────────────────────────────────────────────────────
//
// The post body is an ordered array of these discriminated-union blocks.
// Every block carries a client-generated string `id`.
//
// NOTE ON VALIDATION STRATEGY
// ---------------------------
// A class-validator `@ValidateNested` discriminator over a true union is
// brittle (class-transformer's `discriminator` needs a class per arm and
// still mis-handles unknown arms). The whitelist ValidationPipe also
// strips unknown nested keys, which would silently mangle blocks.
//
// So we accept `content` as an opaque `Record<string, unknown>[]`,
// validated ONLY as "an optional array, capped in length" at the DTO
// layer, and do the real shape work in `BlogService.sanitizeContent`:
// it drops unknown block types, coerces field types, clamps counts
// (gallery images, heading levels), and re-stamps a stable id. This
// keeps the wire-contract permissive while guaranteeing what lands in
// the DB column is well-formed BlogBlock[].

export type BlogBlockType =
  | 'heading'
  | 'paragraph'
  | 'image'
  | 'gallery'
  | 'video'
  | 'quote'
  | 'cta'
  | 'divider';

export interface BlogHeadingBlock {
  id: string;
  type: 'heading';
  level: 2 | 3;
  content: string;
}

export interface BlogParagraphBlock {
  id: string;
  type: 'paragraph';
  content: string;
}

export interface BlogImageBlock {
  id: string;
  type: 'image';
  imageId?: string;
  url: string;
  alt?: string;
  width?: number;
  height?: number;
  caption?: string;
}

export interface BlogGalleryImage {
  imageId?: string;
  url: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface BlogGalleryBlock {
  id: string;
  type: 'gallery';
  images: BlogGalleryImage[];
}

export interface BlogVideoBlock {
  id: string;
  type: 'video';
  /** YouTube/Vimeo watch URL; the renderer converts it to an embed. */
  url: string;
}

export interface BlogQuoteBlock {
  id: string;
  type: 'quote';
  content: string;
  cite?: string;
}

export interface BlogCtaBlock {
  id: string;
  type: 'cta';
  label: string;
  url: string;
}

export interface BlogDividerBlock {
  id: string;
  type: 'divider';
}

export type BlogBlock =
  | BlogHeadingBlock
  | BlogParagraphBlock
  | BlogImageBlock
  | BlogGalleryBlock
  | BlogVideoBlock
  | BlogQuoteBlock
  | BlogCtaBlock
  | BlogDividerBlock;

// Caps enforced by the service when sanitizing content.
export const BLOG_MAX_BLOCKS = 200;
export const BLOG_MAX_GALLERY_IMAGES = 24;

// ─────────────────────────────────────────────────────────────────────
// Coercion helpers (mirrors the pattern used by the other filter DTOs)
// ─────────────────────────────────────────────────────────────────────

const normalizeOptionalString = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const coerceBool = ({ value }: { value: unknown }): boolean | unknown => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
};

// ─────────────────────────────────────────────────────────────────────
// Request DTOs
// ─────────────────────────────────────────────────────────────────────

export class CreateBlogDto {
  @ApiProperty({ example: 'Why aligners beat brackets in 2026' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Transform(({ value }) => normalizeOptionalString(value))
  title!: string;

  @ApiPropertyOptional({
    description:
      'Optional URL slug. Derived from the title when omitted; ' +
      'normalised + made unique by the service either way.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(220)
  @Transform(({ value }) => normalizeOptionalString(value))
  slug?: string;

  @ApiPropertyOptional({ description: 'Card/SEO summary; derived when blank.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => normalizeOptionalString(value))
  excerpt?: string;

  @ApiPropertyOptional({
    type: 'array',
    description:
      'Ordered BlogBlock[] (heading/paragraph/image/gallery/video/' +
      'quote/cta/divider). Validated + sanitized server-side.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(BLOG_MAX_BLOCKS)
  content?: Record<string, unknown>[];

  @ApiPropertyOptional({ description: 'BlogImage id used as the cover.' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeOptionalString(value))
  coverImageId?: string;

  @ApiPropertyOptional({ description: 'Alt text override for the cover.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(({ value }) => normalizeOptionalString(value))
  coverImageAlt?: string;

  @ApiPropertyOptional({ example: 'Orthodontics' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(({ value }) => normalizeOptionalString(value))
  category?: string;

  @ApiPropertyOptional({ enum: BlogStatus, default: BlogStatus.draft })
  @IsOptional()
  @IsEnum(BlogStatus)
  status?: BlogStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => normalizeOptionalString(value))
  seoTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => normalizeOptionalString(value))
  seoDescription?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  seoKeywords?: string[];
}

// Every field optional — the service patches only what's present and
// validates cross-field rules (e.g. slug uniqueness) itself.
export class UpdateBlogDto extends PartialType(CreateBlogDto) {}

export class BlogFilterDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: 'Match title/excerpt (case-insensitive)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: BlogStatus })
  @IsOptional()
  @IsEnum(BlogStatus)
  status?: BlogStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional({
    enum: ['createdAt', 'publishedAt', 'title'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsEnum(['createdAt', 'publishedAt', 'title'])
  sortBy?: 'createdAt' | 'publishedAt' | 'title';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({
    default: false,
    description: 'When true, includes soft-deleted posts.',
  })
  @IsOptional()
  @Transform(coerceBool)
  includeDeleted?: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// Response DTOs
// ─────────────────────────────────────────────────────────────────────

export class BlogImageDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'Relative /uploads/blog/... url (original).' })
  url!: string;

  @ApiProperty({ description: 'Relative thumb variant; falls back to url.' })
  thumbUrl!: string;

  @ApiProperty({ description: 'Relative md variant; falls back to url.' })
  mdUrl!: string;

  @ApiProperty({ description: 'Relative lg variant; falls back to url.' })
  lgUrl!: string;

  @ApiPropertyOptional()
  width?: number;

  @ApiPropertyOptional()
  height?: number;

  @ApiPropertyOptional({ enum: ['pending', 'processing', 'completed', 'failed'] })
  processingStatus?: string;
}

export class BlogSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  excerpt?: string | null;

  @ApiPropertyOptional()
  category?: string | null;

  @ApiPropertyOptional()
  authorName?: string | null;

  @ApiProperty({ enum: BlogStatus })
  status!: BlogStatus;

  @ApiPropertyOptional()
  publishedAt?: Date | null;

  @ApiProperty({ description: 'Estimated reading time in minutes.' })
  readingTime!: number;

  @ApiPropertyOptional({ type: () => BlogImageDto, nullable: true })
  cover!: BlogImageDto | null;

  @ApiPropertyOptional()
  coverImageAlt?: string | null;
}

export class BlogDto extends BlogSummaryDto {
  @ApiPropertyOptional()
  coverImageId?: string | null;

  @ApiProperty({ type: 'array', description: 'BlogBlock[]' })
  content!: BlogBlock[];

  @ApiPropertyOptional()
  seoTitle?: string | null;

  @ApiPropertyOptional()
  seoDescription?: string | null;

  @ApiProperty({ type: [String] })
  seoKeywords!: string[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional()
  deletedAt?: Date | null;
}

export class BlogDetailDto extends BlogSummaryDto {
  @ApiProperty({
    type: 'array',
    description:
      'BlogBlock[] with image/gallery urls rewritten to the best ready ' +
      '(lg) variant when available.',
  })
  content!: BlogBlock[];

  @ApiPropertyOptional()
  seoTitle?: string | null;

  @ApiPropertyOptional()
  seoDescription?: string | null;

  @ApiProperty({ type: [String] })
  seoKeywords!: string[];

  @ApiProperty({ type: () => [BlogSummaryDto], description: 'Up to 3 related posts.' })
  related!: BlogSummaryDto[];
}
