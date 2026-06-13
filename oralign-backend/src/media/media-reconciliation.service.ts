import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { MediaProcessingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  classifyMedia,
  RECONCILE_BACKFILL_BATCH,
  RECONCILE_DELAY_MS,
} from './media.constants';
import { MediaProcessingService } from './media-processing.service';

/**
 * Boot-time safety net for the in-process media queue:
 *
 *   1. RECOVERY — rows stuck in `pending`/`processing` (the container
 *      restarted mid-job, or the enqueue was lost) are re-enqueued.
 *      Jobs are idempotent (variants are overwritten in place), so
 *      re-running a half-finished one is safe.
 *
 *   2. BACKFILL — rows created BEFORE the pipeline existed (status
 *      null) that classify as image/zip/stl get marked pending and
 *      enqueued, capped per model per boot so a large legacy library
 *      optimizes itself over a few restarts instead of hammering the
 *      box on the first one.
 *
 * `failed` rows are deliberately left alone — they fail
 * deterministically (HEIC, corrupt file) and every consumer already
 * falls back to the original.
 */
@Injectable()
export class MediaReconciliationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MediaReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly processing: MediaProcessingService,
  ) {}

  onApplicationBootstrap(): void {
    // Delayed so cold-start traffic (health checks, first page loads)
    // never competes with a backfill burst.
    setTimeout(() => {
      this.run().catch((error: Error) =>
        this.logger.error(`Media reconciliation failed: ${error.message}`),
      );
    }, RECONCILE_DELAY_MS);
  }

  async run(): Promise<void> {
    let enqueued = 0;

    // ── 1. Recovery: lost/interrupted jobs ─────────────────────────
    const stuckOrderFiles = await this.prisma.orderFile.findMany({
      where: {
        deletedAt: null,
        processingStatus: {
          in: [MediaProcessingStatus.pending, MediaProcessingStatus.processing],
        },
      },
      select: { id: true },
      take: RECONCILE_BACKFILL_BATCH,
    });
    for (const { id } of stuckOrderFiles) {
      this.processing.enqueue('order-file', id);
      enqueued += 1;
    }

    const stuckAttachments =
      await this.prisma.treatmentMessageAttachment.findMany({
        where: {
          deletedAt: null,
          processingStatus: {
            in: [
              MediaProcessingStatus.pending,
              MediaProcessingStatus.processing,
            ],
          },
        },
        select: { id: true },
        take: RECONCILE_BACKFILL_BATCH,
      });
    for (const { id } of stuckAttachments) {
      this.processing.enqueue('treatment-attachment', id);
      enqueued += 1;
    }

    const stuckBlogImages = await this.prisma.blogImage.findMany({
      where: {
        deletedAt: null,
        processingStatus: {
          in: [MediaProcessingStatus.pending, MediaProcessingStatus.processing],
        },
      },
      select: { id: true },
      take: RECONCILE_BACKFILL_BATCH,
    });
    for (const { id } of stuckBlogImages) {
      this.processing.enqueue('blog-image', id);
      enqueued += 1;
    }

    // ── 2. Backfill: pre-pipeline rows ─────────────────────────────
    enqueued += await this.backfillOrderFiles();
    enqueued += await this.backfillTreatmentAttachments();
    enqueued += await this.backfillSupportMessages();
    enqueued += await this.backfillSliderMedia();
    enqueued += await this.backfillBlogImages();

    if (enqueued > 0) {
      this.logger.log(`Media reconciliation enqueued ${enqueued} job(s)`);
    }
  }

  private async backfillOrderFiles(): Promise<number> {
    // Over-fetch then classify in JS — eligibility depends on mime AND
    // filename extension, which doesn't express well as a SQL filter.
    const candidates = await this.prisma.orderFile.findMany({
      where: { deletedAt: null, processingStatus: null },
      select: { id: true, mimeType: true, fileName: true },
      orderBy: { createdAt: 'desc' }, // newest first — most likely viewed
      take: RECONCILE_BACKFILL_BATCH * 2,
    });
    const eligible = candidates
      .filter((c) => classifyMedia(c.mimeType, c.fileName) !== null)
      .slice(0, RECONCILE_BACKFILL_BATCH);
    if (eligible.length === 0) return 0;

    await this.prisma.orderFile.updateMany({
      where: { id: { in: eligible.map((e) => e.id) } },
      data: { processingStatus: MediaProcessingStatus.pending },
    });
    for (const { id } of eligible) this.processing.enqueue('order-file', id);
    return eligible.length;
  }

  private async backfillTreatmentAttachments(): Promise<number> {
    const candidates = await this.prisma.treatmentMessageAttachment.findMany({
      where: { deletedAt: null, processingStatus: null },
      select: { id: true, mimeType: true, fileName: true },
      orderBy: { createdAt: 'desc' },
      take: RECONCILE_BACKFILL_BATCH * 2,
    });
    const eligible = candidates
      .filter((c) => classifyMedia(c.mimeType, c.fileName) !== null)
      .slice(0, RECONCILE_BACKFILL_BATCH);
    if (eligible.length === 0) return 0;

    await this.prisma.treatmentMessageAttachment.updateMany({
      where: { id: { in: eligible.map((e) => e.id) } },
      data: { processingStatus: MediaProcessingStatus.pending },
    });
    for (const { id } of eligible) {
      this.processing.enqueue('treatment-attachment', id);
    }
    return eligible.length;
  }

  private async backfillSupportMessages(): Promise<number> {
    // JSON-null filter: DbNull = never processed ({} = processed/empty).
    const rows = await this.prisma.supportMessage.findMany({
      where: {
        deletedAt: null,
        attachmentRelativePath: { not: null },
        attachmentMime: { startsWith: 'image/' },
        attachmentVariants: { equals: Prisma.DbNull },
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: RECONCILE_BACKFILL_BATCH,
    });
    for (const { id } of rows) this.processing.enqueue('support-message', id);
    return rows.length;
  }

  private async backfillSliderMedia(): Promise<number> {
    const rows = await this.prisma.sliderMedia.findMany({
      where: {
        deletedAt: null,
        sourceType: 'upload',
        mediaType: 'image',
        desktopVariants: { equals: Prisma.DbNull },
      },
      select: { id: true },
      take: RECONCILE_BACKFILL_BATCH,
    });
    for (const { id } of rows) this.processing.enqueue('slider-media', id);
    return rows.length;
  }

  private async backfillBlogImages(): Promise<number> {
    // Null-status rows that classify as image (mime check) get marked
    // pending + enqueued. We over-fetch then classify in JS so an
    // accidental non-image row never starts the pipeline.
    const candidates = await this.prisma.blogImage.findMany({
      where: { deletedAt: null, processingStatus: null },
      select: { id: true, mimeType: true, generatedName: true, url: true },
      orderBy: { createdAt: 'desc' },
      take: RECONCILE_BACKFILL_BATCH * 2,
    });
    const eligible = candidates
      .filter(
        (c) =>
          classifyMedia(c.mimeType, c.generatedName ?? c.url) === 'image',
      )
      .slice(0, RECONCILE_BACKFILL_BATCH);
    if (eligible.length === 0) return 0;

    await this.prisma.blogImage.updateMany({
      where: { id: { in: eligible.map((e) => e.id) } },
      data: { processingStatus: MediaProcessingStatus.pending },
    });
    for (const { id } of eligible) this.processing.enqueue('blog-image', id);
    return eligible.length;
  }
}
