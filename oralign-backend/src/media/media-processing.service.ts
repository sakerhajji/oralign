import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MediaProcessingStatus, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { classifyMedia, MediaKind } from './media.constants';
import { MediaQueue } from './media-queue.service';
import { MediaJob, MediaJobKind, MediaVariants } from './media.types';
import { stemOf } from './naming';
import { processImage } from './processors/image.processor';
import { readZipMetadata } from './processors/zip.processor';
import { processStl } from './processors/stl.processor';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

/**
 * Worker side of the media pipeline. Upload endpoints persist their
 * row (status `pending`), respond immediately, then call `enqueue()` —
 * everything below runs strictly after the HTTP response.
 *
 * Job state machine per row: pending → processing → completed | failed.
 * `failed` is terminal-but-harmless: every consumer falls back to the
 * original file, and reconciliation does NOT retry failed rows (a
 * HEIC photo will fail deterministically forever — retrying it each
 * boot is noise). Crashed `processing` rows DO get retried at boot.
 *
 * SupportMessage and SliderMedia have no status column (variants are
 * best-effort cosmetics there); for them "processed, nothing usable"
 * is encoded as an EMPTY variants object `{}` so the boot backfill
 * (which filters on JSON null) doesn't re-enqueue them forever.
 */
@Injectable()
export class MediaProcessingService implements OnModuleInit {
  private readonly logger = new Logger(MediaProcessingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: MediaQueue,
  ) {}

  onModuleInit(): void {
    this.queue.setHandler((job) => this.process(job));
  }

  /** Fire-and-forget — safe to call right before returning a response. */
  enqueue(kind: MediaJobKind, id: string): void {
    this.queue.add({ kind, id });
  }

  // ──────────────────────────────────────────────────────────────────
  // Dispatch
  // ──────────────────────────────────────────────────────────────────

  private async process(job: MediaJob): Promise<void> {
    switch (job.kind) {
      case 'order-file':
        return this.processOrderFile(job.id);
      case 'treatment-attachment':
        return this.processTreatmentAttachment(job.id);
      case 'support-message':
        return this.processSupportMessage(job.id);
      case 'slider-media':
        return this.processSliderMedia(job.id);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // OrderFile — images, ZIP bundles, STL scans
  // ──────────────────────────────────────────────────────────────────

  private async processOrderFile(id: string): Promise<void> {
    const row = await this.prisma.orderFile.findUnique({ where: { id } });
    if (!row || row.deletedAt) return;

    const kind = classifyMedia(row.mimeType, row.fileName);
    if (!kind) {
      // Mis-flagged row (e.g. HEIC marked pending by an older build) —
      // settle it as failed so it stops appearing in reconciliation.
      if (row.processingStatus === MediaProcessingStatus.pending) {
        await this.prisma.orderFile.update({
          where: { id },
          data: { processingStatus: MediaProcessingStatus.failed },
        });
      }
      return;
    }

    await this.prisma.orderFile.update({
      where: { id },
      data: { processingStatus: MediaProcessingStatus.processing },
    });

    try {
      const result = await this.runProcessors(kind, row.relativePath);
      await this.prisma.orderFile.update({
        where: { id },
        data: {
          processingStatus: MediaProcessingStatus.completed,
          processedAt: new Date(),
          width: result.width ?? undefined,
          height: result.height ?? undefined,
          variants: result.variants as unknown as Prisma.InputJsonValue,
          mediaMetadata: result.metadata
            ? (result.metadata as unknown as Prisma.InputJsonValue)
            : undefined,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Order file ${id} processing failed: ${(error as Error).message}`,
      );
      await this.prisma.orderFile
        .update({
          where: { id },
          data: { processingStatus: MediaProcessingStatus.failed },
        })
        .catch(() => undefined);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // TreatmentMessageAttachment — same contract as OrderFile
  // ──────────────────────────────────────────────────────────────────

  private async processTreatmentAttachment(id: string): Promise<void> {
    const row = await this.prisma.treatmentMessageAttachment.findUnique({
      where: { id },
    });
    if (!row || row.deletedAt) return;

    const kind = classifyMedia(row.mimeType, row.fileName);
    if (!kind) {
      if (row.processingStatus === MediaProcessingStatus.pending) {
        await this.prisma.treatmentMessageAttachment.update({
          where: { id },
          data: { processingStatus: MediaProcessingStatus.failed },
        });
      }
      return;
    }

    await this.prisma.treatmentMessageAttachment.update({
      where: { id },
      data: { processingStatus: MediaProcessingStatus.processing },
    });

    try {
      const result = await this.runProcessors(kind, row.filePath);
      await this.prisma.treatmentMessageAttachment.update({
        where: { id },
        data: {
          processingStatus: MediaProcessingStatus.completed,
          width: result.width ?? undefined,
          height: result.height ?? undefined,
          variants: result.variants as unknown as Prisma.InputJsonValue,
          mediaMetadata: result.metadata
            ? (result.metadata as unknown as Prisma.InputJsonValue)
            : undefined,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Treatment attachment ${id} processing failed: ${(error as Error).message}`,
      );
      await this.prisma.treatmentMessageAttachment
        .update({
          where: { id },
          data: { processingStatus: MediaProcessingStatus.failed },
        })
        .catch(() => undefined);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // SupportMessage — single optional image attachment, variants only
  // ──────────────────────────────────────────────────────────────────

  private async processSupportMessage(id: string): Promise<void> {
    const row = await this.prisma.supportMessage.findUnique({ where: { id } });
    if (!row || row.deletedAt || !row.attachmentRelativePath) return;

    const kind = classifyMedia(
      row.attachmentMime,
      row.attachmentName ?? row.attachmentRelativePath,
    );

    let variants: MediaVariants = {};
    if (kind === 'image') {
      try {
        const result = await this.runProcessors(
          'image',
          row.attachmentRelativePath,
        );
        variants = result.variants;
      } catch (error) {
        this.logger.warn(
          `Support attachment ${id} processing failed: ${(error as Error).message}`,
        );
      }
    }

    // `{}` (not null) even on failure — see class doc.
    await this.prisma.supportMessage
      .update({
        where: { id },
        data: { attachmentVariants: variants as unknown as Prisma.InputJsonValue },
      })
      .catch(() => undefined);
  }

  // ──────────────────────────────────────────────────────────────────
  // SliderMedia — public dashboard hero images (desktop + mobile)
  // ──────────────────────────────────────────────────────────────────

  private async processSliderMedia(id: string): Promise<void> {
    const row = await this.prisma.sliderMedia.findUnique({ where: { id } });
    if (!row || row.deletedAt) return;
    // Only uploaded images get variants — external CDN URLs and videos
    // pass through. A slide that BECAME external/video on update must
    // drop its stale variants, so settle them to {} instead of
    // returning with old data still attached.
    if (row.sourceType !== 'upload' || row.mediaType !== 'image') {
      if (row.desktopVariants !== null || row.mobileVariants !== null) {
        await this.prisma.sliderMedia
          .update({
            where: { id },
            data: {
              desktopVariants: {} as Prisma.InputJsonValue,
              mobileVariants: {} as Prisma.InputJsonValue,
            },
          })
          .catch(() => undefined);
      }
      return;
    }

    const data: Prisma.SliderMediaUpdateInput = {};
    for (const side of ['desktop', 'mobile'] as const) {
      const url = side === 'desktop' ? row.desktopUrl : row.mobileUrl;
      const relative = this.uploadsUrlToRelative(url);
      if (!relative) continue;

      let variants: MediaVariants = {};
      try {
        const result = await this.runProcessors('image', relative);
        variants = result.variants;
      } catch (error) {
        this.logger.warn(
          `Slider media ${id} (${side}) processing failed: ${(error as Error).message}`,
        );
      }
      if (side === 'desktop') {
        data.desktopVariants = variants as unknown as Prisma.InputJsonValue;
      } else {
        data.mobileVariants = variants as unknown as Prisma.InputJsonValue;
      }
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.sliderMedia
        .update({ where: { id }, data })
        .catch(() => undefined);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Shared plumbing
  // ──────────────────────────────────────────────────────────────────

  private async runProcessors(
    kind: MediaKind,
    relativePath: string,
  ): Promise<{
    width?: number;
    height?: number;
    variants: MediaVariants;
    metadata?: unknown;
  }> {
    const absPath = this.resolveUploadPath(relativePath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Stored file missing: ${relativePath}`);
    }

    const relDir = path.posix.dirname(relativePath.replace(/\\/g, '/'));
    const absDir = path.dirname(absPath);
    const baseName = stemOf(path.basename(absPath));

    switch (kind) {
      case 'image': {
        const r = await processImage({ absPath, absDir, relDir, baseName });
        return { width: r.width, height: r.height, variants: r.variants };
      }
      case 'zip': {
        const metadata = await readZipMetadata(absPath);
        return { variants: {}, metadata };
      }
      case 'stl': {
        const r = await processStl({ absPath, absDir, relDir, baseName });
        return { variants: r.variants, metadata: r.metadata };
      }
    }
  }

  /** `/uploads/slider/x.png` (or `uploads/...`) → `slider/x.png`. */
  private uploadsUrlToRelative(url: string | null): string | null {
    if (!url) return null;
    const m = /^\/?uploads\/(.+)$/.exec(url);
    return m ? m[1] : null;
  }

  /**
   * Same traversal guard as the upload services: stored paths are
   * data, so they get the full ".." / absolute-path treatment before
   * touching the filesystem.
   */
  private resolveUploadPath(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, '/');
    if (normalized.startsWith('/') || normalized.includes('..')) {
      throw new Error('Invalid stored file path');
    }
    const absolutePath = path.resolve(UPLOAD_ROOT, normalized);
    if (!absolutePath.startsWith(path.resolve(UPLOAD_ROOT))) {
      throw new Error('Invalid stored file path');
    }
    return absolutePath;
  }
}
