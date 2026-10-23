import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LoyaltyService } from './services/loyalty.service';
import { LoyaltyController } from './controllers/loyalty.controller';
import { LoyaltyEligibilityService } from './services/loyalty-eligibility.service';

@Module({
  imports: [PrismaModule],
  controllers: [LoyaltyController],
  providers: [LoyaltyService, LoyaltyEligibilityService],
  // QuotationPaymentPlanService consumes the discount at pack-attach.
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
