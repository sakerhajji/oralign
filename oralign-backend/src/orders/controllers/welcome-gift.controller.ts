import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WelcomeGiftStatusDto } from '../dto/welcome-gift.dto';
import { WelcomeGiftService } from '../services/welcome-gift.service';

/**
 * The doctor's own welcome gift (banner state). Always scoped to the
 * caller: there is no doctorId parameter to probe someone else's.
 */
@ApiTags('welcome-gift')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.dentist)
@Controller('welcome-gift')
export class WelcomeGiftController {
  constructor(private readonly welcomeGift: WelcomeGiftService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "The caller's welcome gift (once per practitioner, on their next submitted case): whether it is still on offer, whether that case would be their first, and its live value (treatment fee + CBCT supplement).",
  })
  @ApiResponse({ status: 200, type: WelcomeGiftStatusDto })
  async getStatus(
    @CurrentUser() user: JwtPayload,
  ): Promise<WelcomeGiftStatusDto> {
    return this.welcomeGift.getStatus(user.sub);
  }
}
