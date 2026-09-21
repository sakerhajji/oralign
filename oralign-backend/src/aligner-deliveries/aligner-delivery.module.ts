import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AlignerDeliveryController } from './controllers/aligner-delivery.controller';
import { AlignerDeliveryService } from './services/aligner-delivery.service';

/**
 * Aligner delivery tracking. Its own module rather than another provider
 * in OrderModule: it only needs Prisma and the (global) OrderAccessPolicy,
 * and OrderService does not depend on it — the only link back is the
 * purge guard counting deliveries as a blocking dependency.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AlignerDeliveryController],
  providers: [AlignerDeliveryService],
})
export class AlignerDeliveryModule {}
