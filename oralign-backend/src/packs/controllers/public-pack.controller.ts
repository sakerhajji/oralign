import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PackService } from '../services/pack.service';

/**
 * Public pack catalogue — backs the marketing showcase
 * (`/practitioner` page on the Next.js frontend).
 *
 * Why a separate controller instead of an extra route on PackController:
 *   • PackController is guarded with `JwtAuthGuard + RolesGuard` at
 *     the class level. Adding a `@Public()` route inside it would
 *     bypass the auth guard but still trigger the roles guard,
 *     producing a confusing 403 for unauthenticated traffic.
 *   • Keeping the public surface in its own controller documents the
 *     boundary clearly: anyone can hit `/packs/public`, no role
 *     metadata or session is consulted.
 *
 * The endpoint deliberately returns ONLY active, non-deleted packs
 * with ONLY their active prices — so when an admin deactivates a
 * pack in `/dashboard/packs`, it disappears from the showcase on
 * the next client poll without a redeploy.
 */
@ApiTags('packs')
@Controller('packs')
export class PublicPackController {
  constructor(private readonly packService: PackService) {}

  @Public()
  @Get('public')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Public list of active packs with active prices. Used by the ' +
      'marketing showcase to render the Packs section dynamically.',
  })
  async listPublic() {
    return this.packService.listPublic();
  }
}
