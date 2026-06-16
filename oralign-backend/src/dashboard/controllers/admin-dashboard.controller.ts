import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminDashboardService } from '../services/admin-dashboard.service';
import { AdminAnalyticsLimitDto, DashboardRangeDto } from '../dto/dashboard.dto';

@ApiTags('admin-dashboard')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.super_admin)
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly service: AdminDashboardService) {}

  @Get('kpis')
  @ApiOperation({
    summary: 'Aggregated KPI rollup (revenue, orders, doctors, patients, packs, payments).',
  })
  async kpis(@Query() range: DashboardRangeDto) {
    return this.service.getKpis(range);
  }

  @Get('sidebar-badges')
  @ApiOperation({
    summary:
      'Lightweight attention counts for the sidebar (new submitted orders + dentists awaiting approval).',
  })
  async sidebarBadges() {
    return this.service.getSidebarBadges();
  }

  @Get('top-doctors')
  @ApiOperation({ summary: 'Top doctors by orders / paid orders / outstanding balance.' })
  async topDoctors(@Query() filter: AdminAnalyticsLimitDto) {
    return this.service.getTopDoctors(filter);
  }

  @Get('best-packs')
  @ApiOperation({ summary: 'Best-selling packs in the requested range.' })
  async bestPacks(@Query() filter: AdminAnalyticsLimitDto) {
    return this.service.getBestPacks(filter);
  }

  @Get('trends')
  @ApiOperation({
    summary:
      'Daily-bucket revenue + orders + doctor/patient growth series for chart rendering.',
  })
  async trends(@Query() range: DashboardRangeDto) {
    return this.service.getTrends(range);
  }
}
