import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Blog, BlogAudience, BlogImage, BlogStatus, Prisma } from '@prisma/client';
import {
  BadRequestException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { PaginatedResponse } from '../../common/dto/response.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaProcessingService } from '../../media/media-processing.service';
import { MediaVariantInfo, MediaVariants } from '../../media/media.types';
import {
  BLOG_MAX_BLOCKS,
  BLOG_MAX_GALLERY_IMAGES,
  BlogBlock,
  BlogDetailDto,
  BlogDto,
  BlogFilterDto,
  BlogGalleryImage,
  BlogImageDto,
  BlogSummaryDto,
  CreateBlogDto,
  Localized,
  LocalizedContent,
  UpdateBlogDto,
} from '../dto/blog.dto';
import { slugify } from '../utils/slug.util';

const WORDS_PER_MINUTE = 200;
const EXCERPT_MAX_CHARS = 160;

/** The two languages every Localized<T> bag carries. */
const LANGS = ['en', 'fr'] as const;

@Injectable()
export class BlogService {
  private readonly logger = new Logger(BlogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaProcessing: MediaProcessingService,
  ) {}

  // ── Admin: list / get ──────────────────────────────────────────────

  async list(filters: BlogFilterDto): Promise<PaginatedResponse<BlogDto>> {
    const take = Math.min(Math.max(filters.limit ?? 20, 1), 100);
    const page = Math.max(filters.page ?? 1, 1);
    const skip = (page - 1) * take;

    const where: Prisma.BlogWhereInput = {};
    if (!filters.includeDeleted) where.deletedAt = null;
    if (filters.status) where.status = filters.status;
    if (filters.audience) where.audience = filters.audience;
    if (filters.category) where.category = filters.category;
    if (filters.search) {
      // title/excerpt are JSON bags — match the search term inside either
      // language's value with a case-insensitive JSON path filter.
      where.OR = this.searchClauses(filters.search);
    }

    const sortBy = filters.sortBy ?? 'createdAt';
    const sortOrder = filters.sortOrder ?? 'desc';
    const orderBy: Prisma.BlogOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [rows, total] = await Promise.all([
      this.prisma.blog.findMany({
        where,
        skip,
        take,
        orderBy,
        include: { coverImage: true },
      }),
      this.prisma.blog.count({ where }),
    ]);

    const data = rows.map((row) => this.mapToDto(row, row.coverImage));
    return new PaginatedResponse(
      data,
      total,
      page,
      take,
      Math.ceil(total / take),
    );
  }

  async get(id: string): Promise<BlogDto> {
    const row = await this.prisma.blog.findUnique({
      where: { id },
      include: { coverImage: true },
    });
    if (!row || row.deletedAt) {
      throw new NotFoundException('Blog post not found');
    }
    return this.mapToDto(row, row.coverImage);
  }

  // ── Admin: create / update / delete ─────────────────────────────────

  async create(dto: CreateBlogDto, authorId: string): Promise<BlogDto> {
    const title = this.normalizeLocalizedText(dto.title);
    if (!title.en.trim() && !title.fr.trim()) {
      throw new BadRequestException(
        'A blog title is required in at least one language.',
      );
    }

    const content = this.sanitizeLocalizedContent(dto.content);
    // Slug from the French title first (showcase default locale), then EN.
    const slug = await this.resolveUniqueSlug(
      dto.slug ?? title.fr ?? title.en,
    );
    const status = dto.status ?? BlogStatus.draft;

    // Snapshot the author's display name so the byline survives the
    // account being deleted (the FK is SetNull).
    const author = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: { fullName: true },
    });
    const authorName = author?.fullName ?? null;

    if (dto.coverImageId) {
      await this.assertImageExists(dto.coverImageId);
    }

    const row = await this.prisma.blog.create({
      data: {
        audience: dto.audience,
        title: title as unknown as Prisma.InputJsonValue,
        slug,
        excerpt: this.resolveExcerpt(
          dto.excerpt,
          content,
        ) as unknown as Prisma.InputJsonValue,
        content: content as unknown as Prisma.InputJsonValue,
        coverImageId: dto.coverImageId ?? null,
        coverImageAlt: this.normalizeLocalizedText(
          dto.coverImageAlt,
        ) as unknown as Prisma.InputJsonValue,
        category: dto.category ?? null,
        authorId,
        authorName,
        status,
        seoTitle: this.normalizeLocalizedText(
          dto.seoTitle,
        ) as unknown as Prisma.InputJsonValue,
        seoDescription: this.normalizeLocalizedText(
          dto.seoDescription,
        ) as unknown as Prisma.InputJsonValue,
        seoKeywords: this.normalizeLocalizedKeywords(
          dto.seoKeywords,
        ) as unknown as Prisma.InputJsonValue,
        readingTime: this.computeReadingTime(
          content,
        ) as unknown as Prisma.InputJsonValue,
        publishedAt: status === BlogStatus.published ? new Date() : null,
      },
      include: { coverImage: true },
    });

    this.logger.log(`Created blog post ${row.id} (${row.slug})`);
    return this.mapToDto(row, row.coverImage);
  }

  async update(id: string, dto: UpdateBlogDto): Promise<BlogDto> {
    const current = await this.prisma.blog.findUnique({ where: { id } });
    if (!current || current.deletedAt) {
      throw new NotFoundException('Blog post not found');
    }

    const data: Prisma.BlogUpdateInput = {};

    if (dto.audience !== undefined) data.audience = dto.audience;

    if (dto.title !== undefined) {
      const title = this.normalizeLocalizedText(dto.title);
      if (!title.en.trim() && !title.fr.trim()) {
        throw new BadRequestException(
          'A blog title is required in at least one language.',
        );
      }
      data.title = title as unknown as Prisma.InputJsonValue;
    }

    // Slug: an explicit slug is normalised + made unique; if only the
    // title changed we leave the slug alone (renaming a URL silently
    // would break inbound links).
    if (dto.slug !== undefined) {
      data.slug = await this.resolveUniqueSlug(dto.slug, id);
    }

    // Content drives both excerpt + reading-time derivations, so resolve
    // it first when present.
    let nextContent: LocalizedContent | undefined;
    if (dto.content !== undefined) {
      nextContent = this.sanitizeLocalizedContent(dto.content);
      data.content = nextContent as unknown as Prisma.InputJsonValue;
      data.readingTime = this.computeReadingTime(
        nextContent,
      ) as unknown as Prisma.InputJsonValue;
    }

    if (dto.excerpt !== undefined) {
      // Re-derive per language from the (new or existing) content when a
      // language's excerpt is cleared.
      const contentForExcerpt =
        nextContent ?? this.asLocalizedContent(current.content);
      data.excerpt = this.resolveExcerpt(
        dto.excerpt,
        contentForExcerpt,
      ) as unknown as Prisma.InputJsonValue;
    }

    if (dto.coverImageId !== undefined) {
      if (dto.coverImageId) await this.assertImageExists(dto.coverImageId);
      data.coverImage = dto.coverImageId
        ? { connect: { id: dto.coverImageId } }
        : { disconnect: true };
    }
    if (dto.coverImageAlt !== undefined) {
      data.coverImageAlt = this.normalizeLocalizedText(
        dto.coverImageAlt,
      ) as unknown as Prisma.InputJsonValue;
    }
    if (dto.category !== undefined) data.category = dto.category ?? null;
    if (dto.seoTitle !== undefined) {
      data.seoTitle = this.normalizeLocalizedText(
        dto.seoTitle,
      ) as unknown as Prisma.InputJsonValue;
    }
    if (dto.seoDescription !== undefined) {
      data.seoDescription = this.normalizeLocalizedText(
        dto.seoDescription,
      ) as unknown as Prisma.InputJsonValue;
    }
    if (dto.seoKeywords !== undefined) {
      data.seoKeywords = this.normalizeLocalizedKeywords(
        dto.seoKeywords,
      ) as unknown as Prisma.InputJsonValue;
    }

    // Status transitions go through the dedicated methods, but allow a
    // direct status patch too — set publishedAt the first time it
    // becomes published, never clear it afterwards.
    if (dto.status !== undefined && dto.status !== current.status) {
      data.status = dto.status;
      if (dto.status === BlogStatus.published && !current.publishedAt) {
        data.publishedAt = new Date();
      }
    }

    const row = await this.prisma.blog.update({
      where: { id },
      data,
      include: { coverImage: true },
    });
    return this.mapToDto(row, row.coverImage);
  }

  // ── Deletion lifecycle: archive → restore → purge ────────────────────
  // A post is editorial CONTENT — nothing clinical or financial points at
  // it — so a real purge is legitimate, but only out of the trash. Its
  // images are NOT touched: they live in the shared BlogImage library and
  // may still be referenced by other posts (coverImage is SetNull exactly
  // so an image can outlive a post and vice-versa).

  async softDelete(id: string): Promise<{ message: string }> {
    const current = await this.prisma.blog.findUnique({ where: { id } });
    if (!current || current.deletedAt) {
      throw new NotFoundException('Blog post not found');
    }
    await this.prisma.blog.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Blog post deleted' };
  }

  /** Bring an archived post back. Idempotent when it is already live. */
  async restore(id: string): Promise<BlogDto> {
    const current = await this.prisma.blog.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Blog post not found');
    const row = current.deletedAt
      ? await this.prisma.blog.update({
          where: { id },
          data: { deletedAt: null },
          include: { coverImage: true },
        })
      : await this.prisma.blog.findUniqueOrThrow({
          where: { id },
          include: { coverImage: true },
        });
    return this.mapToDto(row, row.coverImage);
  }

  /** Permanent delete — trash-first, post row only. Irreversible. */
  async permanentDelete(id: string): Promise<{ message: string }> {
    const current = await this.prisma.blog.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Blog post not found');
    if (!current.deletedAt) {
      throw new BadRequestException(
        'Archive this post before deleting it permanently.',
        'NOT_ARCHIVED',
      );
    }
    await this.prisma.blog.delete({ where: { id } });
    this.logger.log(`Blog post ${id} permanently deleted.`);
    return { message: 'Blog post permanently deleted' };
  }

  // ── Admin: status transitions ───────────────────────────────────────

  async publish(id: string): Promise<BlogDto> {
    const current = await this.prisma.blog.findUnique({ where: { id } });
    if (!current || current.deletedAt) {
      throw new NotFoundException('Blog post not found');
    }
    const row = await this.prisma.blog.update({
      where: { id },
      data: {
        status: BlogStatus.published,
        // Set once; preserve the original publish date on re-publish.
        publishedAt: current.publishedAt ?? new Date(),
      },
      include: { coverImage: true },
    });
    return this.mapToDto(row, row.coverImage);
  }

  async unpublish(id: string): Promise<BlogDto> {
    const current = await this.prisma.blog.findUnique({ where: { id } });
    if (!current || current.deletedAt) {
      throw new NotFoundException('Blog post not found');
    }
    const row = await this.prisma.blog.update({
      where: { id },
      data: { status: BlogStatus.draft },
      include: { coverImage: true },
    });
    return this.mapToDto(row, row.coverImage);
  }

  async archive(id: string): Promise<BlogDto> {
    const current = await this.prisma.blog.findUnique({ where: { id } });
    if (!current || current.deletedAt) {
      throw new NotFoundException('Blog post not found');
    }
    const row = await this.prisma.blog.update({
      where: { id },
      data: { status: BlogStatus.archived },
      include: { coverImage: true },
    });
    return this.mapToDto(row, row.coverImage);
  }

  // ── Public surface ──────────────────────────────────────────────────

  async listPublic(
    filters: BlogFilterDto,
  ): Promise<PaginatedResponse<BlogSummaryDto>> {
    const take = Math.min(Math.max(filters.limit ?? 20, 1), 100);
    const page = Math.max(filters.page ?? 1, 1);
    const skip = (page - 1) * take;

    const where: Prisma.BlogWhereInput = {
      status: BlogStatus.published,
      deletedAt: null,
    };
    if (filters.audience) where.audience = filters.audience;
    if (filters.category) where.category = filters.category;
    if (filters.search) {
      where.OR = this.searchClauses(filters.search);
    }

    const [rows, total] = await Promise.all([
      this.prisma.blog.findMany({
        where,
        skip,
        take,
        orderBy: { publishedAt: 'desc' },
        include: { coverImage: true },
      }),
      this.prisma.blog.count({ where }),
    ]);

    const data = rows.map((row) => this.mapToSummary(row, row.coverImage));
    return new PaginatedResponse(
      data,
      total,
      page,
      take,
      Math.ceil(total / take),
    );
  }

  async listCategories(audience?: BlogAudience): Promise<string[]> {
    const rows = await this.prisma.blog.findMany({
      where: {
        status: BlogStatus.published,
        deletedAt: null,
        category: { not: null },
        ...(audience ? { audience } : {}),
      },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });
    return rows
      .map((r) => r.category)
      .filter((c): c is string => !!c && c.trim() !== '');
  }

  async getPublicBySlug(
    slug: string,
    audience?: BlogAudience,
  ): Promise<BlogDetailDto> {
    const row = await this.prisma.blog.findUnique({
      where: { slug },
      include: { coverImage: true },
    });
    if (
      !row ||
      row.deletedAt ||
      row.status !== BlogStatus.published ||
      (audience && row.audience !== audience)
    ) {
      throw new NotFoundException('Blog post not found');
    }

    const content = this.asLocalizedContent(row.content);

    // Collect imageIds referenced in image/gallery blocks across BOTH
    // languages, load the rows once, then rewrite each block's url to its
    // best ready variant (lg) per language when the image processed.
    const referencedIds = this.collectImageIds(content);
    const imageById = await this.loadImagesById(referencedIds);
    const rewrittenContent: LocalizedContent = {
      en: this.rewriteContentUrls(content.en, imageById),
      fr: this.rewriteContentUrls(content.fr, imageById),
    };

    const summary = this.mapToSummary(row, row.coverImage);
    const related = await this.findRelated(row);

    return {
      ...summary,
      content: rewrittenContent,
      seoTitle: this.asLocalizedText(row.seoTitle),
      seoDescription: this.asLocalizedText(row.seoDescription),
      seoKeywords: this.asLocalizedKeywords(row.seoKeywords),
      related,
    };
  }

  /**
   * Best-effort increment of a published post's view counter. A missing
   * published post is a NotFound (the controller surfaces it); the
   * increment itself never throws a 500 to the caller — failures are
   * swallowed and the last-known count is returned.
   */
  async recordView(slug: string): Promise<{ views: number }> {
    const existing = await this.prisma.blog.findUnique({
      where: { slug },
      select: { status: true, deletedAt: true, views: true },
    });
    if (!existing || existing.deletedAt || existing.status !== BlogStatus.published) {
      throw new NotFoundException('Blog post not found');
    }

    try {
      const updated = await this.prisma.blog.update({
        where: { slug },
        data: { views: { increment: 1 } },
        select: { views: true },
      });
      return { views: updated.views };
    } catch (err) {
      // Never let a view-count write surface as a 500 — the post render
      // already succeeded. Log and return the pre-increment count.
      this.logger.warn(
        `recordView failed for slug=${slug}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { views: existing.views };
    }
  }

  // ── Image upload ────────────────────────────────────────────────────

  /**
   * Persist the BlogImage row for an already-stored upload, THEN enqueue
   * variant generation. Mirrors the slider-media flow: the row is
   * usable immediately (serves the original) and gets variants shortly
   * after the worker runs.
   */
  async uploadImage(
    file: Express.Multer.File,
    userId: string,
  ): Promise<BlogImageDto> {
    if (!file) {
      throw new BadRequestException('No file uploaded.');
    }
    const row = await this.prisma.blogImage.create({
      data: {
        originalName: file.originalname ?? null,
        generatedName: file.filename,
        url: `/uploads/blog/${file.filename}`,
        mimeType: file.mimetype ?? null,
        sizeBytes: file.size ?? null,
        processingStatus: 'pending',
        createdById: userId,
      },
    });

    this.mediaProcessing.enqueue('blog-image', row.id);
    return this.mapImageToDto(row);
  }

  // ── Search ──────────────────────────────────────────────────────────

  /**
   * Build the OR clauses matching a search term inside either language of
   * the JSON `title`/`excerpt` bags (case-insensitive).
   */
  private searchClauses(search: string): Prisma.BlogWhereInput[] {
    const clauses: Prisma.BlogWhereInput[] = [];
    for (const field of ['title', 'excerpt'] as const) {
      for (const lang of LANGS) {
        clauses.push({
          [field]: {
            path: [lang],
            string_contains: search,
          },
        } as Prisma.BlogWhereInput);
      }
    }
    return clauses;
  }

  // ── Derivations ─────────────────────────────────────────────────────

  private async resolveUniqueSlug(
    source: string,
    excludeId?: string,
  ): Promise<string> {
    let base = slugify(source);
    if (!base) base = `post-${randomUUID().slice(0, 8)}`;

    let candidate = base;
    let suffix = 1;
    // Loop until the slug is free (excluding self on update).
    // Append -2, -3, … on collision.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.blog.findFirst({
        where: {
          slug: candidate,
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
        select: { id: true },
      });
      if (!existing) return candidate;
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
  }

  /**
   * Per-language reading time in whole minutes: sum the words across
   * heading, paragraph + quote text of that language's blocks,
   * ceil(words / 200), floor of 1.
   */
  private computeReadingTime(content: LocalizedContent): Localized<number> {
    return {
      en: this.readingTimeForBlocks(content.en),
      fr: this.readingTimeForBlocks(content.fr),
    };
  }

  private readingTimeForBlocks(blocks: BlogBlock[]): number {
    let words = 0;
    for (const block of blocks) {
      let text = '';
      if (block.type === 'heading' || block.type === 'paragraph') {
        text = block.content;
      } else if (block.type === 'quote') {
        text = block.content;
      }
      if (text) {
        words += text.trim().split(/\s+/).filter(Boolean).length;
      }
    }
    return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
  }

  /**
   * Per language: use the supplied excerpt when present; otherwise derive
   * a word-safe ~160-char snippet from that language's first paragraph
   * block. Returns a Localized<string> (empty string when nothing to
   * derive).
   */
  private resolveExcerpt(
    provided: { en?: string; fr?: string } | undefined,
    content: LocalizedContent,
  ): Localized<string> {
    return {
      en: this.excerptForLang(provided?.en, content.en),
      fr: this.excerptForLang(provided?.fr, content.fr),
    };
  }

  private excerptForLang(
    provided: string | undefined,
    blocks: BlogBlock[],
  ): string {
    if (provided && provided.trim()) return provided.trim();

    const firstParagraph = blocks.find(
      (b): b is Extract<BlogBlock, { type: 'paragraph' }> =>
        b.type === 'paragraph',
    );
    if (!firstParagraph?.content) return '';

    const text = firstParagraph.content.trim().replace(/\s+/g, ' ');
    if (text.length <= EXCERPT_MAX_CHARS) return text;

    const clipped = text.slice(0, EXCERPT_MAX_CHARS);
    const lastSpace = clipped.lastIndexOf(' ');
    const wordSafe = lastSpace > 40 ? clipped.slice(0, lastSpace) : clipped;
    return `${wordSafe.trimEnd()}…`;
  }

  // ── Content sanitization ────────────────────────────────────────────

  /**
   * Sanitize a per-language content payload independently into a
   * well-formed LocalizedContent ({ en, fr }). Each side runs the same
   * block-level sanitizer as v1.
   */
  private sanitizeLocalizedContent(
    raw:
      | { en?: Record<string, unknown>[]; fr?: Record<string, unknown>[] }
      | undefined,
  ): LocalizedContent {
    return {
      en: this.sanitizeContent(raw?.en),
      fr: this.sanitizeContent(raw?.fr),
    };
  }

  /**
   * Turn the permissive wire payload into a well-formed BlogBlock[]:
   * drop unknown types, coerce field types, clamp counts, and ensure
   * every block has a stable string id. Blocks that can't be salvaged
   * (e.g. an image block with no url) are dropped.
   */
  private sanitizeContent(
    raw: Record<string, unknown>[] | undefined,
  ): BlogBlock[] {
    if (!Array.isArray(raw)) return [];
    const out: BlogBlock[] = [];

    for (const item of raw.slice(0, BLOG_MAX_BLOCKS)) {
      const block = this.sanitizeBlock(item);
      if (block) out.push(block);
    }
    return out;
  }

  private sanitizeBlock(item: unknown): BlogBlock | null {
    if (!item || typeof item !== 'object') return null;
    const obj = item as Record<string, unknown>;
    const type = typeof obj.type === 'string' ? obj.type : '';
    const id = this.coerceId(obj.id);

    switch (type) {
      case 'heading': {
        const content = this.coerceString(obj.content);
        if (!content) return null;
        const level = obj.level === 3 || obj.level === '3' ? 3 : 2;
        return { id, type: 'heading', level, content };
      }
      case 'paragraph': {
        const content = this.coerceString(obj.content);
        if (!content) return null;
        return { id, type: 'paragraph', content };
      }
      case 'image': {
        const url = this.coerceString(obj.url);
        if (!url) return null;
        return {
          id,
          type: 'image',
          url,
          imageId: this.coerceOptionalString(obj.imageId),
          alt: this.coerceOptionalString(obj.alt),
          width: this.coerceOptionalInt(obj.width),
          height: this.coerceOptionalInt(obj.height),
          caption: this.coerceOptionalString(obj.caption),
        };
      }
      case 'gallery': {
        const rawImages = Array.isArray(obj.images) ? obj.images : [];
        const images: BlogGalleryImage[] = [];
        for (const img of rawImages.slice(0, BLOG_MAX_GALLERY_IMAGES)) {
          if (!img || typeof img !== 'object') continue;
          const g = img as Record<string, unknown>;
          const url = this.coerceString(g.url);
          if (!url) continue;
          images.push({
            url,
            imageId: this.coerceOptionalString(g.imageId),
            alt: this.coerceOptionalString(g.alt),
            width: this.coerceOptionalInt(g.width),
            height: this.coerceOptionalInt(g.height),
          });
        }
        if (images.length === 0) return null;
        return { id, type: 'gallery', images };
      }
      case 'video': {
        const url = this.coerceString(obj.url);
        if (!url) return null;
        return { id, type: 'video', url };
      }
      case 'quote': {
        const content = this.coerceString(obj.content);
        if (!content) return null;
        return {
          id,
          type: 'quote',
          content,
          cite: this.coerceOptionalString(obj.cite),
        };
      }
      case 'cta': {
        const label = this.coerceString(obj.label);
        const url = this.coerceString(obj.url);
        if (!label || !url) return null;
        return { id, type: 'cta', label, url };
      }
      case 'divider':
        return { id, type: 'divider' };
      default:
        return null;
    }
  }

  private coerceId(value: unknown): string {
    return typeof value === 'string' && value.trim()
      ? value
      : randomUUID();
  }

  private coerceString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private coerceOptionalString(value: unknown): string | undefined {
    const s = this.coerceString(value);
    return s === '' ? undefined : s;
  }

  private coerceOptionalInt(value: unknown): number | undefined {
    const n =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim() !== ''
          ? Number(value)
          : NaN;
    return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
  }

  // ── Public-detail url rewriting ─────────────────────────────────────

  private collectImageIds(content: LocalizedContent): string[] {
    const ids = new Set<string>();
    for (const blocks of [content.en, content.fr]) {
      for (const block of blocks) {
        if (block.type === 'image' && block.imageId) {
          ids.add(block.imageId);
        } else if (block.type === 'gallery') {
          for (const img of block.images) {
            if (img.imageId) ids.add(img.imageId);
          }
        }
      }
    }
    return [...ids];
  }

  private async loadImagesById(
    ids: string[],
  ): Promise<Map<string, BlogImage>> {
    const map = new Map<string, BlogImage>();
    if (ids.length === 0) return map;
    const rows = await this.prisma.blogImage.findMany({
      where: { id: { in: ids } },
    });
    for (const row of rows) map.set(row.id, row);
    return map;
  }

  /**
   * Rewrite image/gallery block urls to the best ready variant (lg) when
   * the referenced BlogImage processed successfully; otherwise leave the
   * stored (original) url untouched. Also backfills width/height from
   * the processed image when the block omitted them.
   */
  private rewriteContentUrls(
    blocks: BlogBlock[],
    imageById: Map<string, BlogImage>,
  ): BlogBlock[] {
    return blocks.map((block) => {
      if (block.type === 'image' && block.imageId) {
        const img = imageById.get(block.imageId);
        const best = this.bestReadyUrl(img);
        if (!best) return block;
        return {
          ...block,
          url: best.url,
          width: block.width ?? best.width,
          height: block.height ?? best.height,
        };
      }
      if (block.type === 'gallery') {
        return {
          ...block,
          images: block.images.map((g) => {
            if (!g.imageId) return g;
            const img = imageById.get(g.imageId);
            const best = this.bestReadyUrl(img);
            if (!best) return g;
            return {
              ...g,
              url: best.url,
              width: g.width ?? best.width,
              height: g.height ?? best.height,
            };
          }),
        };
      }
      return block;
    });
  }

  private bestReadyUrl(
    img: BlogImage | undefined,
  ): { url: string; width?: number; height?: number } | null {
    if (!img || img.processingStatus !== 'completed') return null;
    const variants = this.parseVariants(img.variants);
    const lg = variants.lg ?? variants.md ?? variants.thumb;
    if (!lg) return null;
    return {
      url: this.variantToUrl(lg),
      width: lg.width,
      height: lg.height,
    };
  }

  // ── Localized read coercion (defensive) ─────────────────────────────
  //
  // No real data exists yet, but the mappers stay defensive: a JSON value
  // that is a plain string `s` (legacy plain-String column) is coerced to
  // `{ en: s, fr: s }`. A `{ en?, fr? }` object fills the missing side
  // from the present one. Anything else falls back to empty defaults.

  private asLocalizedText(value: Prisma.JsonValue | null): Localized<string> {
    if (typeof value === 'string') {
      const s = value;
      return { en: s, fr: s };
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      const en = typeof obj.en === 'string' ? obj.en : '';
      const fr = typeof obj.fr === 'string' ? obj.fr : '';
      // Mirror a present language into a blank one so consumers always
      // get something to render.
      return {
        en: en || fr,
        fr: fr || en,
      };
    }
    return { en: '', fr: '' };
  }

  private asLocalizedKeywords(
    value: Prisma.JsonValue | null,
  ): Localized<string[]> {
    const toStringArray = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

    if (Array.isArray(value)) {
      // Legacy plain String[] — mirror into both languages.
      const arr = toStringArray(value);
      return { en: arr, fr: arr };
    }
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      return { en: toStringArray(obj.en), fr: toStringArray(obj.fr) };
    }
    return { en: [], fr: [] };
  }

  private asLocalizedReadingTime(
    value: Prisma.JsonValue | null,
  ): Localized<number> {
    const toMinutes = (v: unknown): number => {
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) && n >= 1 ? Math.round(n) : 1;
    };
    if (typeof value === 'number') {
      const n = toMinutes(value);
      return { en: n, fr: n };
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      return { en: toMinutes(obj.en), fr: toMinutes(obj.fr) };
    }
    return { en: 1, fr: 1 };
  }

  /**
   * Read the JSON content column back into a per-language (re-sanitized)
   * LocalizedContent. Defensive against a legacy plain BlogBlock[] (no
   * en/fr split) — that array is treated as the FR side (showcase
   * default) with an empty EN side.
   */
  private asLocalizedContent(value: Prisma.JsonValue | null): LocalizedContent {
    if (Array.isArray(value)) {
      // Legacy: a flat block array. Treat it as the default-locale (fr).
      return {
        en: [],
        fr: this.sanitizeContent(value as unknown as Record<string, unknown>[]),
      };
    }
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      return {
        en: this.sanitizeContent(
          Array.isArray(obj.en)
            ? (obj.en as Record<string, unknown>[])
            : undefined,
        ),
        fr: this.sanitizeContent(
          Array.isArray(obj.fr)
            ? (obj.fr as Record<string, unknown>[])
            : undefined,
        ),
      };
    }
    return { en: [], fr: [] };
  }

  // ── Localized write normalization ───────────────────────────────────

  /** Coerce a LocalizedTextDto-ish input into a full { en, fr } string bag. */
  private normalizeLocalizedText(
    value: { en?: string; fr?: string } | undefined,
  ): Localized<string> {
    return {
      en: (value?.en ?? '').trim(),
      fr: (value?.fr ?? '').trim(),
    };
  }

  private normalizeLocalizedKeywords(
    value: { en?: string[]; fr?: string[] } | undefined,
  ): Localized<string[]> {
    const clean = (arr: string[] | undefined): string[] =>
      (arr ?? [])
        .map((s) => (typeof s === 'string' ? s.trim() : ''))
        .filter((s) => s !== '');
    return { en: clean(value?.en), fr: clean(value?.fr) };
  }

  // ── Mappers ─────────────────────────────────────────────────────────

  private mapToDto(row: Blog, cover: BlogImage | null): BlogDto {
    return {
      ...this.mapToSummary(row, cover),
      coverImageId: row.coverImageId,
      content: this.asLocalizedContent(row.content),
      seoTitle: this.asLocalizedText(row.seoTitle),
      seoDescription: this.asLocalizedText(row.seoDescription),
      seoKeywords: this.asLocalizedKeywords(row.seoKeywords),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }

  private mapToSummary(row: Blog, cover: BlogImage | null): BlogSummaryDto {
    return {
      id: row.id,
      slug: row.slug,
      audience: row.audience,
      views: row.views,
      title: this.asLocalizedText(row.title),
      excerpt: this.asLocalizedText(row.excerpt),
      category: row.category,
      authorName: row.authorName,
      status: row.status,
      publishedAt: row.publishedAt,
      readingTime: this.asLocalizedReadingTime(row.readingTime),
      cover: cover ? this.mapImageToDto(cover) : null,
      coverImageAlt: this.asLocalizedText(row.coverImageAlt),
    };
  }

  /**
   * Build the image DTO with RELATIVE variant urls derived from the
   * variants JSON; fall back to the original `url` when a variant is
   * absent. NEVER exposes a raw disk path.
   */
  mapImageToDto(row: BlogImage): BlogImageDto {
    const variants = this.parseVariants(row.variants);
    const original = row.url;
    const thumb = variants.thumb
      ? this.variantToUrl(variants.thumb)
      : original;
    const md = variants.md ? this.variantToUrl(variants.md) : original;
    const lg = variants.lg ? this.variantToUrl(variants.lg) : original;

    return {
      id: row.id,
      url: original,
      thumbUrl: thumb,
      mdUrl: md,
      lgUrl: lg,
      width: row.width ?? undefined,
      height: row.height ?? undefined,
      processingStatus: row.processingStatus ?? undefined,
    };
  }

  /** `<relDir>/<file>.webp` → `/uploads/<relDir>/<file>.webp`. */
  private variantToUrl(variant: MediaVariantInfo): string {
    const clean = variant.path.replace(/^\/+/, '');
    return `/uploads/${clean}`;
  }

  private parseVariants(value: Prisma.JsonValue | null): MediaVariants {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as unknown as MediaVariants;
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private async assertImageExists(imageId: string): Promise<void> {
    const img = await this.prisma.blogImage.findUnique({
      where: { id: imageId },
      select: { id: true, deletedAt: true },
    });
    if (!img || img.deletedAt) {
      throw new BadRequestException('Cover image not found.');
    }
  }

  /**
   * Up to 3 related posts of the SAME audience: same category first,
   * topped up with the most recent published posts of that audience,
   * always excluding the post itself.
   */
  private async findRelated(post: Blog): Promise<BlogSummaryDto[]> {
    const LIMIT = 3;
    const collected: BlogWithCover[] = [];
    const seen = new Set<string>([post.id]);

    if (post.category) {
      const sameCategory = await this.prisma.blog.findMany({
        where: {
          status: BlogStatus.published,
          deletedAt: null,
          audience: post.audience,
          category: post.category,
          NOT: { id: post.id },
        },
        orderBy: { publishedAt: 'desc' },
        take: LIMIT,
        include: { coverImage: true },
      });
      for (const r of sameCategory) {
        if (!seen.has(r.id)) {
          collected.push(r);
          seen.add(r.id);
        }
      }
    }

    if (collected.length < LIMIT) {
      const recent = await this.prisma.blog.findMany({
        where: {
          status: BlogStatus.published,
          deletedAt: null,
          audience: post.audience,
          NOT: { id: { in: [...seen] } },
        },
        orderBy: { publishedAt: 'desc' },
        take: LIMIT - collected.length,
        include: { coverImage: true },
      });
      for (const r of recent) {
        if (!seen.has(r.id)) {
          collected.push(r);
          seen.add(r.id);
        }
      }
    }

    return collected
      .slice(0, LIMIT)
      .map((r) => this.mapToSummary(r, r.coverImage));
  }
}

/** A Blog row eagerly loaded with its (nullable) cover image. */
type BlogWithCover = Prisma.BlogGetPayload<{ include: { coverImage: true } }>;
