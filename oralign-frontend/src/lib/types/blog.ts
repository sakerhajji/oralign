// Blog (public showcase + admin CMS)
// Split out of the former 2,000-line lib/types/index.ts; import via '@/lib/types'.

import type { MediaProcessingStatus } from './entities';
import type { PaginationParams } from './query-params';

// ==========================================
// BLOG (public showcase + admin CMS) — v2 bilingual + audience + views
// ==========================================
// Wire values MUST stay identical to the backend Prisma `BlogStatus` /
// `BlogAudience` enums + the shared content-block contract. The
// dashboard CMS, the block builder, and the public showcase renderer
// all import these types — keep them the single source of truth.
//
// v2 makes every reader-facing text field bilingual: instead of a bare
// `string`/`string[]`/`number`, the API returns a `Localized<T>`
// (`{ en, fr }`) bag and the CMS/client picks a language at render
// time. `content` is `{ en: BlogBlock[]; fr: BlogBlock[] }`. A post
// also carries an `audience` (which showcase surface it belongs to)
// and a lifetime `views` counter.

/**
 * Bilingual value bag. Every reader-facing blog text field is one of
 * these — the backend stores `{ en, fr }` JSON and the client/CMS
 * resolves the active language (see `pickLocalized` in
 * `blog.service.ts`). Both leaves are always present on the wire; a
 * language with no copy yet is an empty string / empty array / 0.
 */
export type Localized<T> = { en: T; fr: T };

/**
 * Publication lifecycle. Mirrors the backend Prisma `BlogStatus`
 * enum exactly (lowercase wire values) — class-validator's `@IsEnum`
 * rejects anything else.
 */
export enum BlogStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

/**
 * Which audience a post targets. The single public blog at `/blog` shows
 * both and splits them with an audience tab strip (Patients / Practitioners);
 * a post targets exactly one. Mirrors the backend Prisma `BlogAudience`
 * enum (identical lowercase wire values).
 */
export enum BlogAudience {
  PATIENT = 'patient',
  PRACTITIONER = 'practitioner',
}

/**
 * One structured content block stored inside `Blog.content` (a JSON
 * array). Discriminated on `type`. Every block carries a
 * client-generated string `id` so the CMS block builder can key,
 * reorder, and target individual blocks without index churn.
 *
 * The public renderer switches EXHAUSTIVELY over `type` and renders
 * each variant safely (React escapes text by default; the renderer
 * only allows youtube/vimeo embeds for `video` and validates that
 * `cta`/link hrefs start with '/' or 'https://').
 */
export type BlogBlock =
  | { id: string; type: 'heading'; level: 2 | 3; content: string }
  | { id: string; type: 'paragraph'; content: string }
  | {
      id: string;
      type: 'image';
      imageId?: string;
      url: string;
      alt?: string;
      width?: number;
      height?: number;
      caption?: string;
    }
  | {
      id: string;
      type: 'gallery';
      images: {
        imageId?: string;
        url: string;
        alt?: string;
        width?: number;
        height?: number;
      }[];
    }
  // YouTube / Vimeo watch URL — the renderer converts it to an embed
  // iframe (and refuses anything that isn't youtube/vimeo).
  | { id: string; type: 'video'; url: string }
  | { id: string; type: 'quote'; content: string; cite?: string }
  | { id: string; type: 'cta'; label: string; url: string }
  | { id: string; type: 'divider' };

/**
 * Narrow string-literal union of every `BlogBlock` discriminant —
 * handy for the CMS block-type picker and exhaustive switches.
 */
export type BlogBlockType = BlogBlock['type'];

/**
 * One uploaded blog image. Matches the backend `BlogImageDto`. The
 * `*Url` variant fields are RELATIVE `/uploads/blog/...` paths —
 * resolve them to absolute with `resolveBlogMediaUrl()` before
 * handing them to <img>/<Image>. Fall back to `url` when a given
 * variant is absent (legacy / not-yet-processed rows).
 */
export interface BlogImage {
  id: string;
  url: string;
  thumbUrl: string;
  mdUrl: string;
  lgUrl: string;
  width?: number;
  height?: number;
  processingStatus?: MediaProcessingStatus;
}

/**
 * Card-level projection of a post — returned by the public list +
 * the admin list rows + the `related` array on a detail page.
 * Matches the backend `BlogSummaryDto`.
 *
 * v2: `title`, `excerpt`, `coverImageAlt` and `readingTime` are
 * `Localized<…>` bags — resolve them with `pickLocalized(value, lang)`
 * before rendering. `audience` + `views` are new.
 */
export interface BlogSummary {
  id: string;
  slug: string;
  audience: BlogAudience;
  views: number;
  title: Localized<string>;
  excerpt: Localized<string>;
  category: string;
  authorName: string;
  status: BlogStatus;
  publishedAt: string | null;
  readingTime: Localized<number>;
  cover: BlogImage | null;
  coverImageAlt: Localized<string>;
}

/**
 * Public post detail — returned by `GET /api/blog/:slug`. Matches the
 * backend `BlogDetailDto`. `content` carries BOTH languages
 * (`{ en, fr }`); each image/gallery block `url` is already REWRITTEN
 * server-side — in both languages — to its best ready variant (lg)
 * when the underlying BlogImage finished processing, else the
 * original. SEO fields are `Localized<…>` bags.
 */
export interface BlogDetail extends BlogSummary {
  content: { en: BlogBlock[]; fr: BlogBlock[] };
  seoTitle: Localized<string>;
  seoDescription: Localized<string>;
  seoKeywords: Localized<string[]>;
  /**
   * Up to 3 sibling posts of the SAME audience (same category first,
   * then most-recent published of that audience).
   */
  related: BlogSummary[];
}

/**
 * Full admin row — returned by every `/api/admin/blog` endpoint.
 * Matches the backend `BlogDto`. Superset of `BlogSummary` plus the
 * editable content + SEO + audit fields the CMS form binds to. Unlike
 * `BlogDetail`, the admin `content` is NOT url-rewritten — the editor
 * binds the raw per-language block arrays.
 */
export interface Blog extends BlogSummary {
  coverImageId: string | null;
  content: { en: BlogBlock[]; fr: BlogBlock[] };
  seoTitle: Localized<string>;
  seoDescription: Localized<string>;
  seoKeywords: Localized<string[]>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * Create payload. Matches the backend `CreateBlogDto`. `audience` is
 * required; `title` is a `Localized<string>` of which the service
 * enforces at least one non-empty language. Everything else the
 * backend derives (slug, per-language excerpt + readingTime,
 * publishedAt) when omitted.
 *
 * Bilingual text fields are partial — the CMS may submit only the
 * language(s) it has copy for (`{ fr: '…' }`); the backend fills the
 * missing leaf. `content` carries both per-language block arrays.
 */
export interface CreateBlogDto {
  audience: BlogAudience;
  title: Localized<string>;
  slug?: string;
  excerpt?: Partial<Localized<string>>;
  content?: { en: BlogBlock[]; fr: BlogBlock[] };
  coverImageId?: string;
  coverImageAlt?: Partial<Localized<string>>;
  category?: string;
  status?: BlogStatus;
  seoTitle?: Partial<Localized<string>>;
  seoDescription?: Partial<Localized<string>>;
  seoKeywords?: Partial<Localized<string[]>>;
}

/** Update payload — every create field is optional. */
export type UpdateBlogDto = Partial<CreateBlogDto>;

/**
 * Admin list filters. Mirrors the backend `BlogFilterParams`. The
 * service serialises `seoKeywords`-style arrays itself; scalar fields
 * pass straight through as query params. v2 adds an `audience` filter.
 */
export interface BlogFilterParams extends PaginationParams {
  search?: string;
  status?: BlogStatus;
  audience?: BlogAudience;
  category?: string;
  sortBy?: 'createdAt' | 'publishedAt' | 'title';
  sortOrder?: 'asc' | 'desc';
  includeDeleted?: boolean;
}
