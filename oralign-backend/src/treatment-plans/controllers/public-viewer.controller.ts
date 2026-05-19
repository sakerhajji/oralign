import { Controller, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { PublicTreatmentViewerService } from '../services/public-viewer.service';

@ApiTags('public-treatment-viewer')
@Controller('public/treatment-viewer')
export class PublicTreatmentViewerController {
  constructor(private readonly service: PublicTreatmentViewerService) {}

  /**
   * Token-only read of a public treatment viewer payload.
   *
   * Returns ONLY display-safe fields (plan name/version, the third-party
   * viewer URL, doctor/clinic display name, patient first name). No
   * conversation, attachments, medical history, or payment data.
   *
   * Rate-limited tighter than the rest of the API because the URL is
   * shared with end patients and there's no auth in front of it.
   */
  @Get(':token')
  @Public()
  @Throttle({ long: { limit: 60, ttl: 60 * 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Public treatment viewer payload (by token)' })
  @ApiParam({ name: 'token', type: String })
  get(@Param('token') token: string) {
    return this.service.getByToken(token);
  }
}
