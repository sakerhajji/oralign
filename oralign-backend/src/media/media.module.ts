import { Global, Module } from '@nestjs/common';
import { MediaProcessingService } from './media-processing.service';
import { MediaQueue } from './media-queue.service';
import { MediaReconciliationService } from './media-reconciliation.service';

/**
 * Async media-optimization pipeline (images / ZIP / STL).
 *
 * Global because every feature module that accepts uploads (orders,
 * treatment chat, support chat, slider) enqueues here — a one-line
 * `mediaProcessing.enqueue(kind, id)` after persisting, no module
 * imports to maintain. PrismaModule is already global, so this module
 * has no imports of its own.
 */
@Global()
@Module({
  providers: [MediaQueue, MediaProcessingService, MediaReconciliationService],
  exports: [MediaProcessingService],
})
export class MediaModule {}
