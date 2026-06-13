import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { BlogAudience, BlogStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// ─────────────────────────────────────────────────────────────────────
// Localized<T> — the SHARED bilingual contract (identical on the
// frontend). Every reader-facing text field is an { en, fr } bag so a
// single post carries both languages and the client/CMS resolves one
// at render time.
// ─────────────────────────────────────────────────────────────────────

export interface Localized<T> {
  en: T;
  fr: T;
}

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

// Per-language content payload. Each language holds its own permissive
// BlogBlock[] (validated/sanitized server-side in BlogService). Kept as
// Record<string, unknown>[] on the wire for the same reason as v1 — see
// the validation-strategy note above.
export interface LocalizedContent {
  en: BlogBlock[];
  fr: BlogBlock[];
}

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
// Localized nested DTOs
// ─────────────────────────────────────────────────────────────────────
//
// A Localized<string> field arrives as `{ en?, fr? }`. Both languages
// are optional at the wire level — the service fills the missing one
// (derives an excerpt, mirrors a blank language, etc.) and, for `title`,
// enforces that at least one language is non-empty. We validate the
// nested shape (object with optional string en/fr) and trim each value;
// the ValidationPipe's whitelist strips any other key.

export class LocalizedTextDto {
  @ApiPropertyOptional({ description: 'English text.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => normalizeOptionalString(value))
  en?: string;

  @ApiPropertyOptional({ description: 'French text.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => normalizeOptionalString(value))
  fr?: string;
}

export class LocalizedKeywordsDto {
  @ApiPropertyOptional({ type: [String], description: 'English keywords.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  en?: string[];

  @ApiPropertyOptional({ type: [String], description: 'French keywords.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  fr?: string[];
}

// ─────────────────────────────────────────────────────────────────────
// Request DTOs
// ─────────────────────────────────────────────────────────────────────

export class CreateBlogDto {
  @ApiProperty({
    enum: BlogAudience,
    description: 'Which showcase surface the post targets.',
  })
  @IsEnum(BlogAudience)
  audience!: BlogAudience;

  @ApiProperty({
    type: () => LocalizedTextDto,
    description:
      'Bilingual title { en?, fr? }. The service requires at least one ' +
      'language non-empty and derives the slug from (fr || en).',
  })
  @IsObject()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  title!: LocalizedTextDto;

  @ApiPropertyOptional({
    description:
      'Optional URL slug. Derived from (title.fr || title.en) when ' +
      'omitted; normalised + made unique by the service either way.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(220)
  @Transform(({ value }) => normalizeOptionalString(value))
  slug?: string;

  @ApiPropertyOptional({
    type: () => LocalizedTextDto,
    description: 'Bilingual card/SEO summary; derived per language when blank.',
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  excerpt?: LocalizedTextDto;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      'Per-language content { en: BlogBlock[]; fr: BlogBlock[] }. Each ' +
      'block array (heading/paragraph/image/gallery/video/quote/cta/' +
      'divider) is validated + sanitized server-side.',
  })
  @IsOptional()
  @IsObject()
  content?: { en?: Record<string, unknown>[]; fr?: Record<string, unknown>[] };

  @ApiPropertyOptional({ description: 'BlogImage id used as the cover.' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeOptionalString(value))
  coverImageId?: string;

  @ApiPropertyOptional({
    type: () => LocalizedTextDto,
    description: 'Bilingual alt text override for the cover.',
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  coverImageAlt?: LocalizedTextDto;

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

  @ApiPropertyOptional({
    type: () => LocalizedTextDto,
    description: 'Bilingual SEO title override.',
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  seoTitle?: LocalizedTextDto;

  @ApiPropertyOptional({
    type: () => LocalizedTextDto,
    description: 'Bilingual SEO description override.',
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  seoDescription?: LocalizedTextDto;

  @ApiPropertyOptional({
    type: () => LocalizedKeywordsDto,
    description: 'Bilingual SEO keyword lists { en?: string[]; fr?: string[] }.',
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LocalizedKeywordsDto)
  seoKeywords?: LocalizedKeywordsDto;
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

  @ApiPropertyOptional({
    enum: BlogAudience,
    description: 'Narrow to one showcase surface (patient | practitioner).',
  })
  @IsOptional()
  @IsEnum(BlogAudience)
  audience?: BlogAudience;

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

  @ApiProperty({ enum: BlogAudience })
  audience!: BlogAudience;

  @ApiProperty({ description: 'Lifetime public view count.' })
  views!: number;

  @ApiProperty({
    type: 'object',
    description: 'Bilingual title { en, fr }.',
    additionalProperties: { type: 'string' },
  })
  title!: Localized<string>;

  @ApiProperty({
    type: 'object',
    description: 'Bilingual excerpt { en, fr } (derived per language).',
    additionalProperties: { type: 'string' },
  })
  excerpt!: Localized<string>;

  @ApiPropertyOptional()
  category?: string | null;

  @ApiPropertyOptional()
  authorName?: string | null;

  @ApiProperty({ enum: BlogStatus })
  status!: BlogStatus;

  @ApiPropertyOptional()
  publishedAt?: Date | null;

  @ApiProperty({
    type: 'object',
    description: 'Per-language reading time in minutes { en, fr }.',
    additionalProperties: { type: 'number' },
  })
  readingTime!: Localized<number>;

  @ApiPropertyOptional({ type: () => BlogImageDto, nullable: true })
  cover!: BlogImageDto | null;

  @ApiProperty({
    type: 'object',
    description: 'Bilingual cover alt text { en, fr }.',
    additionalProperties: { type: 'string' },
  })
  coverImageAlt!: Localized<string>;
}

export class BlogDto extends BlogSummaryDto {
  @ApiPropertyOptional()
  coverImageId?: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Per-language content { en: BlogBlock[]; fr: BlogBlock[] }.',
  })
  content!: LocalizedContent;

  @ApiProperty({
    type: 'object',
    description: 'Bilingual SEO title { en, fr }.',
    additionalProperties: { type: 'string' },
  })
  seoTitle!: Localized<string>;

  @ApiProperty({
    type: 'object',
    description: 'Bilingual SEO description { en, fr }.',
    additionalProperties: { type: 'string' },
  })
  seoDescription!: Localized<string>;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'array', items: { type: 'string' } },
    description: 'Bilingual SEO keyword lists { en: string[]; fr: string[] }.',
  })
  seoKeywords!: Localized<string[]>;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional()
  deletedAt?: Date | null;
}

export class BlogDetailDto extends BlogSummaryDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Per-language content { en: BlogBlock[]; fr: BlogBlock[] } with ' +
      'image/gallery urls rewritten to the best ready (lg) variant when ' +
      'available — in BOTH languages.',
  })
  content!: LocalizedContent;

  @ApiProperty({
    type: 'object',
    description: 'Bilingual SEO title { en, fr }.',
    additionalProperties: { type: 'string' },
  })
  seoTitle!: Localized<string>;

  @ApiProperty({
    type: 'object',
    description: 'Bilingual SEO description { en, fr }.',
    additionalProperties: { type: 'string' },
  })
  seoDescription!: Localized<string>;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'array', items: { type: 'string' } },
    description: 'Bilingual SEO keyword lists { en: string[]; fr: string[] }.',
  })
  seoKeywords!: Localized<string[]>;

  @ApiProperty({ type: () => [BlogSummaryDto], description: 'Up to 3 related posts.' })
  related!: BlogSummaryDto[];
}
