import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChunkedUploadService } from './chunked-upload.service';
import { purgeStoredMedia } from './order-storage';

// First sweep shortly after boot (crash recovery), then periodically.
// Plain timers instead of @nestjs/schedule — matches the existing
// MediaReconciliationService pattern, no extra dependency.
const BOOT_DELAY_MS = 60 * 1000;
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 h

/**
 * How long a soft-deleted order FILE sits in the trash before its blob is
 * reclaimed. Soft-deleting a file no longer unlinks anything (the row must
 * stay restorable / auditable); this sweep is what eventually frees the
 * disk. Deliberately generous — the order itself is never touched here.
 */
export const DELETED_FILE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const PURGE_BATCH = 200;

/**
 * Technical-cleanup jobs — TEMPORARY / TRASHED data only:
 *   1. abandoned chunked uploads: sessions untouched for longer than the
 *      TTL (24 h) lose their part directory and DB row; orphan part dirs
 *      with no session row are removed. A resumable upload interrupted
 *      for less than the TTL is left alone — that's the resume window.
 *   2. order files soft-deleted more than DELETED_FILE_RETENTION_MS ago:
 *      blob + variants unlinked, row removed. Files of orders that are
 *      themselves archived are left alone — the ORDER's own restore /
 *      permanent-delete decides their fate.
 * Nothing here ever touches a live business row.
 */
@Injectable()
export class UploadCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UploadCleanupService.name);
  private bootTimer?: NodeJS.Timeout;
  private interval?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chunkedUploads: ChunkedUploadService,
  ) {}

  onModuleInit(): void {
    this.bootTimer = setTimeout(() => void this.sweep(), BOOT_DELAY_MS);
    this.interval = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    // Never keep the process alive just for the sweeper.
    this.bootTimer.unref?.();
    this.interval.unref?.();
  }

  onModuleDestroy(): void {
    if (this.bootTimer) clearTimeout(this.bootTimer);
    if (this.interval) clearInterval(this.interval);
  }

  private async sweep(): Promise<void> {
    try {
      await this.chunkedUploads.cleanupStaleSessions();
    } catch (error) {
      this.logger.warn(
        `Upload-session sweep failed: ${(error as Error).message}`,
      );
    }
    try {
      await this.purgeExpiredDeletedFiles();
    } catch (error) {
      this.logger.warn(
        `Deleted-file retention sweep failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Purge order files whose trash retention has expired. Public so a test
   * (or an operator script) can trigger it with an explicit cutoff.
   */
  async purgeExpiredDeletedFiles(
    now: Date = new Date(),
  ): Promise<{ purged: number }> {
    const cutoff = new Date(now.getTime() - DELETED_FILE_RETENTION_MS);
    const expired = await this.prisma.orderFile.findMany({
      where: {
        deletedAt: { not: null, lt: cutoff },
        order: { deletedAt: null },
      },
      select: { id: true, relativePath: true, variants: true },
      take: PURGE_BATCH,
    });
    if (expired.length === 0) return { purged: 0 };

    // Row first, then blob: if the unlink fails the row is already gone
    // and the reconciliation sweep sees an orphan blob (harmless); the
    // reverse order could leave a row pointing at nothing.
    const { count } = await this.prisma.orderFile.deleteMany({
      where: { id: { in: expired.map((f) => f.id) } },
    });
    for (const file of expired) {
      await purgeStoredMedia(file.relativePath, file.variants);
    }
    this.logger.log(
      `Deleted-file retention sweep: purged ${count} file(s) older than ${DELETED_FILE_RETENTION_MS / 86_400_000} days`,
    );
    return { purged: count };
  }
}
