import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { DoctorActivitySweepResult } from './doctor-activity.contract';
import { DoctorInactivitySweepService } from './doctor-inactivity-sweep.service';

/**
 * Support / e2e handle on the daily inactivity sweep. Super admin only:
 * a pass can deactivate accounts (still only when the rule is switched on
 * and the deadlines are due). The per-user routes (reactivate, journal)
 * live on UserController, next to the account they act on.
 */
@ApiTags('users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/doctor-activity')
export class DoctorActivityController {
  constructor(private readonly sweep: DoctorInactivitySweepService) {}

  @Post('sweep')
  @Roles(UserRole.super_admin)
  @Throttle({ long: { limit: 20, ttl: 60 * 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Run the doctor inactivity sweep now (super admin). Same pass as the daily timer: warnings at 30 and 7 days, then dormancy; nothing when the rule is switched off.',
  })
  @ApiResponse({ status: 200, description: 'DoctorActivitySweepResult' })
  run(): Promise<DoctorActivitySweepResult> {
    return this.sweep.sweep();
  }
}
