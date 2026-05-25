import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Prisma,
  SliderMedia,
  SliderMediaDeviceTarget,
  SliderMediaSourceType,
  SliderMediaStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateSliderMediaDto,
  ReorderSliderMediaDto,
  SliderMediaFilterDto,
  UpdateSliderMediaDto,
} from '../dto/slider-media.dto';

const ACTIVE_CACHE_KEY = (device: SliderMediaDeviceTarget) =>
  `slider:active:${device}`;
const ACTIVE_CACHE_TTL_MS = 60_000; // 60 s — admin edits invalidate sooner

/**
 * Slider-media service — admin CRUD + lightweight "active list" query
 * cached in Redis for the doctor dashboard.
 *
 * The active list is the hottest read in this whole module (every
 * doctor dashboard page paint), so we cache it for a minute and bust
 * the cache from every write path. Each device has its own cache key
 * so a mobile-only edit doesn't invalidate desktop, and vice versa.
 */
@Injectable()
export class SliderMediaService {
  private readonly logger = new Logger(SliderMediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  // ─── Reads ─────────────────────────────────────────────────────────

  /**
   * Public-ish read called by the doctor dashboard. Returns only
   * active, non-deleted slides whose deviceTargets contains the
   * requested device. Ordered by displayOrder ASC, then createdAt
   * DESC so newer additions outrank older ones at the same rank.
   *
   * Cached in Redis for ACTIVE_CACHE_TTL_MS — bursty pageloads from
   * many doctors hit the cache once and reuse the same array.
   */
  async listActiveForDevice(
    device: SliderMediaDeviceTarget,
  ): Promise<SliderMedia[]> {
    const cached = await this.cache.get<SliderMedia[]>(ACTIVE_CACHE_KEY(device));
    if (cached) return cached;

    const rows = await this.prisma.sliderMedia.findMany({
      where: {
        status: SliderMediaStatus.active,
        deletedAt: null,
        deviceTargets: { has: device },
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
    });

    // Drop any row whose URL for THIS device is empty AND whose only
    // fallback would be the other-device URL. Leaving it in would
    // render a broken <img> on the doctor side.
    const usable = rows.filter((r) => {
      if (device === SliderMediaDeviceTarget.desktop) {
        return !!r.desktopUrl || !!r.mobileUrl;
      }
      return !!r.mobileUrl || !!r.desktopUrl;
    });

    await this.cache.set(ACTIVE_CACHE_KEY(device), usable, ACTIVE_CACHE_TTL_MS);
    return usable;
  }

  async listForAdmin(filter: SliderMediaFilterDto) {
    const page = filter.page ?? 1;
    const limit = Math.min(filter.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.SliderMediaWhereInput = {
      ...(filter.deletedOnly
        ? { deletedAt: { not: null } }
        : filter.includeDeleted
          ? {}
          : { deletedAt: null }),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.mediaType ? { mediaType: filter.mediaType } : {}),
      ...(filter.device ? { deviceTargets: { has: filter.device } } : {}),
      ...(filter.search
        ? {
            OR: [
              { title: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.sliderMedia.findMany({
        where,
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
        include: {
          createdBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.sliderMedia.count({ where }),
    ]);

    return {
      data: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getById(id: string): Promise<SliderMedia> {
    const row = await this.prisma.sliderMedia.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Slider media ${id} not found`);
    return row;
  }

  // ─── Writes ────────────────────────────────────────────────────────

  /**
   * Create a slide. The controller resolves any uploaded files into
   * `/uploads/slider/...` paths and passes them via `uploadedUrls`,
   * which override the body's URL fields when present.
   */
  async create(
    dto: CreateSliderMediaDto,
    actorId: string,
    uploadedUrls?: { desktopUrl?: string; mobileUrl?: string },
  ): Promise<SliderMedia> {
    const desktopUrl = uploadedUrls?.desktopUrl ?? dto.desktopUrl ?? null;
    const mobileUrl = uploadedUrls?.mobileUrl ?? dto.mobileUrl ?? null;

    this.validateSourceUrls(dto.sourceType, desktopUrl, mobileUrl, dto.deviceTargets);

    const created = await this.prisma.sliderMedia.create({
      data: {
        title: dto.title.trim(),
        mediaType: dto.mediaType,
        sourceType: dto.sourceType,
        deviceTargets: dto.deviceTargets,
        desktopUrl,
        mobileUrl,
        status: dto.status ?? SliderMediaStatus.active,
        displayOrder: dto.displayOrder ?? 0,
        linkUrl: dto.linkUrl ?? null,
        createdById: actorId,
      },
    });

    await this.invalidateActiveCacheFor(dto.deviceTargets);
    this.events.emit('slider.changed', { id: created.id });
    return created;
  }

  async update(
    id: string,
    dto: UpdateSliderMediaDto,
    uploadedUrls?: { desktopUrl?: string; mobileUrl?: string },
  ): Promise<SliderMedia> {
    const existing = await this.getById(id);

    // Merge URL sources: uploaded > body > existing > null-if-cleared.
    let desktopUrl = existing.desktopUrl;
    if (dto.clearDesktopUrl) desktopUrl = null;
    if (dto.desktopUrl) desktopUrl = dto.desktopUrl;
    if (uploadedUrls?.desktopUrl) desktopUrl = uploadedUrls.desktopUrl;

    let mobileUrl = existing.mobileUrl;
    if (dto.clearMobileUrl) mobileUrl = null;
    if (dto.mobileUrl) mobileUrl = dto.mobileUrl;
    if (uploadedUrls?.mobileUrl) mobileUrl = uploadedUrls.mobileUrl;

    const nextTargets = dto.deviceTargets ?? existing.deviceTargets;
    const nextSourceType = dto.sourceType ?? existing.sourceType;

    this.validateSourceUrls(nextSourceType, desktopUrl, mobileUrl, nextTargets);

    const updated = await this.prisma.sliderMedia.update({
      where: { id },
      data: {
        title: dto.title?.trim() ?? undefined,
        mediaType: dto.mediaType ?? undefined,
        sourceType: dto.sourceType ?? undefined,
        deviceTargets: dto.deviceTargets ?? undefined,
        desktopUrl,
        mobileUrl,
        status: dto.status ?? undefined,
        displayOrder: dto.displayOrder ?? undefined,
        linkUrl: dto.linkUrl ?? undefined,
      },
    });

    // Invalidate cache for BOTH the old and new device-target sets so a
    // slide that moved from mobile→desktop drops out of mobile cache
    // immediately.
    await this.invalidateActiveCacheFor([
      ...new Set([...existing.deviceTargets, ...nextTargets]),
    ]);
    this.events.emit('slider.changed', { id });
    return updated;
  }

  async activate(id: string): Promise<SliderMedia> {
    return this.update(id, { status: SliderMediaStatus.active });
  }

  async deactivate(id: string): Promise<SliderMedia> {
    return this.update(id, { status: SliderMediaStatus.inactive });
  }

  async softDelete(id: string): Promise<{ id: string }> {
    const existing = await this.getById(id);
    await this.prisma.sliderMedia.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.invalidateActiveCacheFor(existing.deviceTargets);
    this.events.emit('slider.changed', { id });
    return { id };
  }

  async restore(id: string): Promise<SliderMedia> {
    const restored = await this.prisma.sliderMedia.update({
      where: { id },
      data: { deletedAt: null },
    });
    await this.invalidateActiveCacheFor(restored.deviceTargets);
    this.events.emit('slider.changed', { id });
    return restored;
  }

  /**
   * Bulk reorder. Caller passes the desired id sequence; we rewrite
   * displayOrder to 10, 20, 30, … (gaps of 10) so future single-item
   * inserts can slot in without rewriting every row.
   *
   * Wrapped in a transaction so a half-applied reorder never leaves
   * the gallery in an inconsistent state.
   */
  async reorder(dto: ReorderSliderMediaDto): Promise<{ updated: number }> {
    if (dto.ids.length === 0) return { updated: 0 };

    const result = await this.prisma.$transaction(
      dto.ids.map((id, idx) =>
        this.prisma.sliderMedia.update({
          where: { id },
          data: { displayOrder: (idx + 1) * 10 },
        }),
      ),
    );
    // We don't know which device targets are affected without reading
    // the rows back — bust both caches to be safe.
    await this.invalidateActiveCacheFor([
      SliderMediaDeviceTarget.desktop,
      SliderMediaDeviceTarget.mobile,
    ]);
    this.events.emit('slider.changed', { reordered: dto.ids.length });
    return { updated: result.length };
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private async invalidateActiveCacheFor(
    targets: SliderMediaDeviceTarget[],
  ): Promise<void> {
    await Promise.all(
      [...new Set(targets)].map((d) =>
        this.cache.del(ACTIVE_CACHE_KEY(d)).catch((err) => {
          this.logger.warn(
            `Failed to invalidate slider cache for ${d}: ${(err as Error).message}`,
          );
        }),
      ),
    );
  }

  /**
   * Ensure URL fields make sense for the chosen source type + device
   * targets. We reject early so the doctor dashboard never has to
   * deal with a row that says "desktop slide" but has no URL.
   */
  private validateSourceUrls(
    sourceType: SliderMediaSourceType,
    desktopUrl: string | null,
    mobileUrl: string | null,
    targets: SliderMediaDeviceTarget[],
  ): void {
    if (!desktopUrl && !mobileUrl) {
      throw new BadRequestException(
        sourceType === SliderMediaSourceType.upload
          ? 'Upload at least one media file (desktop or mobile).'
          : 'Provide at least one external URL (desktop or mobile).',
      );
    }
    if (targets.includes(SliderMediaDeviceTarget.desktop) && !desktopUrl && !mobileUrl) {
      throw new BadRequestException(
        'Desktop slide requires a desktopUrl (or a mobileUrl fallback).',
      );
    }
    if (targets.includes(SliderMediaDeviceTarget.mobile) && !mobileUrl && !desktopUrl) {
      throw new BadRequestException(
        'Mobile slide requires a mobileUrl (or a desktopUrl fallback).',
      );
    }
  }
}
