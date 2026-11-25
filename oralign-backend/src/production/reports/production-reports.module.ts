import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProductionNotificationsModule } from '../notifications/production-notifications.module';
import { ProductionAdminController } from './production-admin.controller';
import { ProductionAnomaliesService } from './production-anomalies.service';
import { ProductionExportService } from './production-export.service';
import { ProductionNoticesService } from './production-notices.service';
import { ProductionProgressReportService } from './production-progress.service';
import { ProductionSummaryService } from './production-summary.service';

/**
 * Lab production, ADMIN DESK: journal / recap summary, progress,
 * anomalies ("Écarts"), CSV export and the notice list + retry.
 * Controller: ProductionAdminController (`production/admin/*`, class-level
 * ADMIN_ROLES).
 *
 * Read-only over Prisma + the production kernel, except the notice retry,
 * which resets the row and kicks ProductionNoticeDispatcher (imported from
 * ProductionNotificationsModule). Never imports ProductionModule.
 */
@Module({
  imports: [PrismaModule, ProductionNotificationsModule],
  controllers: [ProductionAdminController],
  providers: [
    ProductionSummaryService,
    ProductionProgressReportService,
    ProductionAnomaliesService,
    ProductionExportService,
    ProductionNoticesService,
  ],
})
export class ProductionReportsModule {}
