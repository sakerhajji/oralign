import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ChunkedUploadService } from './chunked-upload.service';

// First sweep shortly after boot (crash recovery), then periodically.
// Plain timers instead of @nestjs/schedule — matches the existing
// MediaReconciliationService pattern, no extra dependency.
const BOOT_DELAY_MS = 60 * 1000;
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 h

/**
 * Reclaims disk from abandoned chunked uploads: sessions untouched for
 * longer than the TTL (24 h) lose their part directory and DB row, and
 * orphan part directories with no session row are removed. A resumable
 * upload interrupted for less than the TTL is left alone — that's the
 * resume window.
 */
@Injectable()
export class UploadCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UploadCleanupService.name);
  private bootTimer?: NodeJS.Timeout;
  private interval?: NodeJS.Timeout;

  constructor(private readonly chunkedUploads: ChunkedUploadService) {}

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
  }
}
