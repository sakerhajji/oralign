import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductionController } from './controllers/production.controller';
import { ProductionDossierService } from './production-dossier.service';
import { ProductionEventsService } from './production-events.service';
import { ProductionFilesService } from './production-files.service';
import { ProductionMyDayService } from './production-my-day.service';
import { ProductionOrderGate } from './production-order-gate';
import { ProductionQueueService } from './production-queue.service';
import { ProductionSheetService } from './production-sheet.service';

/**
 * Lab production, CORE: events (declare / cancel, under the order lock),
 * queue, case sheet, "Ma journée", the finance-free dossier and its file
 * streams. Controller: ProductionController (`production/*`, technician +
 * admins). OrderAccessPolicy and MailService are global; nothing to import.
 *
 * Module graph (production-build/CONTRACT.md, "Modules"), cycle-free:
 *   • this module imports PrismaModule only — NEVER QuotationModule,
 *     PaymentsModule, NotificationsModule or the two production
 *     sub-modules. The file streams reuse the order and plan modules'
 *     stream functions (plain exports), so not even OrderModule or
 *     TreatmentPlanModule is needed;
 *   • QuotationModule / PaymentsModule import THIS module: the legacy
 *     "deliver batch" endpoint calls ProductionEventsService.declareWithin,
 *     and both unlock hooks call the tx-scoped projectBatches()
 *     (production-batch-projection.ts), owner decision D2;
 *   • the notice outbox is written here, in the declare / cancel
 *     transaction, with plain Prisma: no dependency on the dispatcher.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ProductionController],
  providers: [
    ProductionOrderGate,
    ProductionEventsService,
    ProductionQueueService,
    ProductionSheetService,
    ProductionDossierService,
    ProductionFilesService,
    ProductionMyDayService,
  ],
  exports: [ProductionEventsService],
})
export class ProductionModule {}
