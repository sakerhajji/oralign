import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { MediaJob } from './media.types';

/**
 * Minimal in-process job queue for media optimization.
 *
 * Why not BullMQ today: the deployment is a single backend container
 * and the DB row (`processingStatus`) is already the durable source of
 * truth — a Redis-backed queue would add an infra dependency without
 * adding durability we don't already have. The seam for upgrading is
 * deliberate, though:
 *
 *   • `add()` mirrors BullMQ's `queue.add(name, data)` shape.
 *   • The single registered handler mirrors a BullMQ Worker processor.
 *   • Jobs are idempotent and re-derivable from the DB, so "lost on
 *     restart" is already handled by MediaReconciliationService
 *     re-enqueueing pending/processing rows at boot — exactly the
 *     semantics you'd keep after moving the transport to Redis.
 *
 * Concurrency is fixed at 1 ON PURPOSE: sharp and the STL rasterizer
 * are CPU-bound, and the container shares its cores with the HTTP
 * event loop. One background slot keeps p95 API latency flat while
 * still chewing through a 20-file upload in well under a minute.
 */
@Injectable()
export class MediaQueue implements OnApplicationShutdown {
  private readonly logger = new Logger(MediaQueue.name);

  private readonly queue: MediaJob[] = [];
  /** Dedup guard: `kind:id` of everything queued or currently running. */
  private readonly pending = new Set<string>();
  private draining = false;
  private stopped = false;
  private handler: ((job: MediaJob) => Promise<void>) | null = null;

  /**
   * Registered once by MediaProcessingService at module init — a
   * callback instead of an injected dependency to keep the queue free
   * of circular DI with the service that owns the processors.
   */
  setHandler(handler: (job: MediaJob) => Promise<void>): void {
    this.handler = handler;
  }

  add(job: MediaJob): void {
    if (this.stopped) return;
    const key = `${job.kind}:${job.id}`;
    if (this.pending.has(key)) return; // already queued or running
    this.pending.add(key);
    this.queue.push(job);
    // Defer the kick so `add()` never does work inside a request path.
    setImmediate(() => void this.drain());
  }

  get size(): number {
    return this.queue.length;
  }

  private async drain(): Promise<void> {
    if (this.draining || this.stopped || !this.handler) return;
    this.draining = true;
    try {
      while (this.queue.length > 0 && !this.stopped) {
        const job = this.queue.shift()!;
        try {
          await this.handler(job);
        } catch (error) {
          // The handler is expected to persist `failed` itself; this
          // catch only protects the loop from a throw escaping it.
          this.logger.error(
            `Media job ${job.kind}:${job.id} threw: ${(error as Error).message}`,
          );
        } finally {
          this.pending.delete(`${job.kind}:${job.id}`);
        }
      }
    } finally {
      this.draining = false;
    }
  }

  onApplicationShutdown(): void {
    // Drop the in-memory tail; rows still marked pending/processing in
    // the DB are picked back up by reconciliation on next boot.
    this.stopped = true;
    this.queue.length = 0;
    this.pending.clear();
  }
}
