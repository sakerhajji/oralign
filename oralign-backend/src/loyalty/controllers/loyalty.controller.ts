import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ADMIN_ROLES } from '../../common/access/caller';
import { LoyaltyService } from '../services/loyalty.service';
import {
  LoyaltyOverviewDto,
  LoyaltyTierDto,
  UpdateLoyaltyTiersDto,
} from '../dto/loyalty.dto';
import { previousQuarter, quarterOf } from '../loyalty.types';

@ApiTags('loyalty')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ROLES)
@Controller('admin/loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('overview')
  @ApiOperation({
    summary:
      'Current-quarter loyalty dashboard: KPIs, tiers and per-practitioner progress',
  })
  overview(): Promise<LoyaltyOverviewDto> {
    return this.loyalty.overview();
  }

  @Get('tiers')
  @ApiOperation({ summary: 'Active loyalty tiers' })
  listTiers(): Promise<LoyaltyTierDto[]> {
    return this.loyalty.listTiers();
  }

  @Put('tiers')
  @ApiOperation({
    summary:
      'Replace the loyalty tier list (closed quarters keep their snapshots)',
  })
  updateTiers(@Body() dto: UpdateLoyaltyTiersDto): Promise<LoyaltyTierDto[]> {
    return this.loyalty.updateTiers(dto);
  }

  @Post('recompute')
  @ApiOperation({
    summary:
      'Force-close the previous quarter now (idempotent — normally automatic)',
  })
  async recompute(): Promise<{ closed: string }> {
    const prev = previousQuarter(quarterOf(new Date()));
    await this.loyalty.ensureQuarterClosed(prev);
    return { closed: `${prev.year}-T${prev.quarter}` };
  }
}
