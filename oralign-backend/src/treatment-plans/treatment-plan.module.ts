import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TreatmentPlanController } from './controllers/treatment-plan.controller';
import { TreatmentMessageController } from './controllers/treatment-message.controller';
import { TreatmentPlanIprController } from './controllers/treatment-plan-ipr.controller';
import { PublicTreatmentViewerController } from './controllers/public-viewer.controller';
import { TreatmentPlanService } from './services/treatment-plan.service';
import { TreatmentMessageService } from './services/treatment-message.service';
import { TreatmentPlanIprService } from './services/treatment-plan-ipr.service';
import { PublicTreatmentViewerService } from './services/public-viewer.service';
import { TreatmentChatGateway } from './gateways/treatment-chat.gateway';

@Module({
  imports: [PrismaModule],
  controllers: [
    TreatmentPlanController,
    TreatmentMessageController,
    TreatmentPlanIprController,
    PublicTreatmentViewerController,
  ],
  providers: [
    TreatmentPlanService,
    TreatmentMessageService,
    TreatmentPlanIprService,
    PublicTreatmentViewerService,
    TreatmentChatGateway,
  ],
  exports: [TreatmentPlanService, TreatmentMessageService, TreatmentPlanIprService],
})
export class TreatmentPlanModule {}
