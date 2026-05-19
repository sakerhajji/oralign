import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TreatmentPlanController } from './controllers/treatment-plan.controller';
import { TreatmentMessageController } from './controllers/treatment-message.controller';
import { PublicTreatmentViewerController } from './controllers/public-viewer.controller';
import { TreatmentPlanService } from './services/treatment-plan.service';
import { TreatmentMessageService } from './services/treatment-message.service';
import { PublicTreatmentViewerService } from './services/public-viewer.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    TreatmentPlanController,
    TreatmentMessageController,
    PublicTreatmentViewerController,
  ],
  providers: [
    TreatmentPlanService,
    TreatmentMessageService,
    PublicTreatmentViewerService,
  ],
  exports: [TreatmentPlanService, TreatmentMessageService],
})
export class TreatmentPlanModule {}
