import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DoctorDashboardService } from '../services/doctor-dashboard.service';

@ApiTags('doctor-dashboard')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.dentist)
@Controller('doctor/dashboard')
export class DoctorDashboardController {
  constructor(private readonly service: DoctorDashboardService) {}

  @Get('kpis')
  @ApiOperation({ summary: 'Doctor-scoped KPI rollup (orders, patients, revenue, current pack).' })
  async kpis(@CurrentUser() user: JwtPayload) {
    return this.service.getKpis(user.sub);
  }

  @Get('available-packs')
  @ApiOperation({ summary: 'Active pack catalogue with `isCurrent` flag for this doctor.' })
  async availablePacks(@CurrentUser() user: JwtPayload) {
    return this.service.listAvailablePacks(user.sub);
  }
}
