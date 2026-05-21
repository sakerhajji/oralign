import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { TreatmentPlanIprService } from '../services/treatment-plan-ipr.service';
import {
  TreatmentPlanIprResponseDto,
  UpsertTreatmentPlanIprDto,
} from '../dto/treatment-plan-ipr.dto';

const ALL_AUTHED: UserRole[] = [
  UserRole.dentist,
  UserRole.admin,
  UserRole.super_admin,
  UserRole.designer,
];
const PLANNER: UserRole[] = [
  UserRole.admin,
  UserRole.super_admin,
  UserRole.designer,
];

/**
 * REST surface for the per-plan IPR / stripping table. Three endpoints,
 * each scoped under the treatment-plan id so URL ownership is obvious:
 *
 *   GET    /treatment-plans/:planId/iprs
 *   PUT    /treatment-plans/:planId/iprs                       (upsert)
 *   DELETE /treatment-plans/:planId/iprs/:fromTooth/:toTooth
 *
 * Read is open to anyone who can read the parent order (the doctor
 * sees the planner's IPR on their review screen). Writes are
 * planner-only — same gate as the rest of the treatment-plan editor.
 */
@ApiTags('treatment-plan-ipr')
@ApiBearerAuth('access-token')
@Controller('treatment-plans/:planId/iprs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ALL_AUTHED)
export class TreatmentPlanIprController {
  constructor(private readonly service: TreatmentPlanIprService) {}

  @Get()
  @ApiOperation({ summary: 'List IPR / stripping entries for a treatment plan' })
  @ApiParam({ name: 'planId', type: String })
  @ApiOkResponse({ type: [TreatmentPlanIprResponseDto] })
  async list(
    @Param('planId') planId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TreatmentPlanIprResponseDto[]> {
    const rows = await this.service.list(planId, {
      userId: user.sub,
      role: user.role as UserRole,
    });
    return rows.map((r) => ({
      id: r.id,
      treatmentPlanId: r.treatmentPlanId,
      fromTooth: r.fromTooth,
      toTooth: r.toTooth,
      value: r.value,
      note: r.note,
      createdById: r.createdById,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @Roles(...PLANNER)
  @ApiOperation({
    summary: 'Upsert (create or update) one IPR / stripping contact',
  })
  @ApiParam({ name: 'planId', type: String })
  @ApiOkResponse({ type: TreatmentPlanIprResponseDto })
  async upsert(
    @Param('planId') planId: string,
    @Body() dto: UpsertTreatmentPlanIprDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TreatmentPlanIprResponseDto> {
    const row = await this.service.upsert(planId, dto, {
      userId: user.sub,
      role: user.role as UserRole,
    });
    return {
      id: row.id,
      treatmentPlanId: row.treatmentPlanId,
      fromTooth: row.fromTooth,
      toTooth: row.toTooth,
      value: row.value,
      note: row.note,
      createdById: row.createdById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  @Delete(':fromTooth/:toTooth')
  @HttpCode(HttpStatus.OK)
  @Roles(...PLANNER)
  @ApiOperation({
    summary: 'Remove an IPR contact. Idempotent — missing rows are a no-op.',
  })
  @ApiParam({ name: 'planId', type: String })
  @ApiParam({ name: 'fromTooth', type: Number })
  @ApiParam({ name: 'toTooth', type: Number })
  async remove(
    @Param('planId') planId: string,
    @Param('fromTooth', ParseIntPipe) fromTooth: number,
    @Param('toTooth', ParseIntPipe) toTooth: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ deleted: boolean }> {
    return this.service.remove(planId, fromTooth, toTooth, {
      userId: user.sub,
      role: user.role as UserRole,
    });
  }
}
