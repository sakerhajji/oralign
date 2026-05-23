import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PackController } from './controllers/pack.controller';
import { PackService } from './services/pack.service';

/**
 * Pack catalogue module.
 *
 * Exports `PackService` so the quotations module can call
 * `getActivePriceForQuote` when an admin attaches a pack to a
 * quotation — keeping the price-lookup + validation rules in a
 * single place.
 */
@Module({
  controllers: [PackController],
  providers: [PackService, PrismaService],
  exports: [PackService],
})
export class PackModule {}
