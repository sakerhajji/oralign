import { Module } from '@nestjs/common';
import { PackController } from './controllers/pack.controller';
import { PublicPackController } from './controllers/public-pack.controller';
import { PackService } from './services/pack.service';

/**
 * Pack catalogue module.
 *
 * Exports `PackService` so the quotations module can call
 * `getActivePriceForQuote` when an admin attaches a pack to a
 * quotation — keeping the price-lookup + validation rules in a
 * single place.
 *
 * Two controllers fronts the module:
 *   • PackController        — admin CRUD, guarded by JWT + roles.
 *   • PublicPackController  — `@Public()` GET /packs/public used by
 *                             the marketing showcase. Separated so
 *                             the public surface is unambiguous and
 *                             the role guard never short-circuits
 *                             unauthenticated reads.
 */
@Module({
  controllers: [PackController, PublicPackController],
  providers: [PackService],
  exports: [PackService],
})
export class PackModule {}
