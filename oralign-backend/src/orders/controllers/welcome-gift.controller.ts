import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
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
import {
  WelcomeGiftMarkDto,
  WelcomeGiftMarkResponseDto,
  WelcomeGiftStatusDto,
} from '../dto/welcome-gift.dto';
import { WelcomeGiftService } from '../services/welcome-gift.service';

/**
 * The welcome gift. `GET /welcome-gift` is the doctor's own banner state,
 * always scoped to the caller (no doctorId parameter to probe someone
 * else's). `PATCH /welcome-gift/doctors/:doctorId` is the admin control of
 * a doctor's mark; its method-level @Roles overrides the dentist-only
 * class default (RolesGuard reads handler first, then class).
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

  @Patch('doctors/:doctorId')
  @Roles(UserRole.admin, UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Admin: mark a practitioner\'s welcome gift as used, or make it available again (it then lands on their next submitted case). Idempotent: an existing "used" mark keeps its original date.',
  })
  @ApiParam({ name: 'doctorId', type: String, description: 'Dentist user ID' })
  @ApiResponse({ status: 200, type: WelcomeGiftMarkResponseDto })
  @ApiResponse({
    status: 404,
    description: 'No non-deleted dentist with this ID.',
  })
  async setDoctorMark(
    @Param('doctorId') doctorId: string,
    @Body() dto: WelcomeGiftMarkDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<WelcomeGiftMarkResponseDto> {
    return this.welcomeGift.setDoctorMark(doctorId, dto.used, {
      userId: user.sub,
      role: user.role,
    });
  }
}
