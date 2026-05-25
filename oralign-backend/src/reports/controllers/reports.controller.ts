import { Controller, Get, Header, Param, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  REPORT_EXPORT_TYPES,
  ReportExportParamDto,
  ReportSummaryDto,
} from '../dto/report.dto';
import { ReportsService } from '../services/reports.service';

const ADMIN_ROLES: UserRole[] = [UserRole.admin, UserRole.super_admin];

function contentDisposition(fileName: string): string {
  const asciiName =
    fileName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]+/g, '_')
      .replace(/["\\]/g, '_')
      .slice(0, 140) || 'oralign-report.csv';

  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

@ApiTags('reports')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ROLES)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  @ApiOperation({
    summary:
      'Admin report summary: KPIs, top doctors, best packs, and revenue trend.',
  })
  @ApiResponse({ status: 200, description: 'Report summary payload.' })
  async summary(@Query() filter: ReportSummaryDto) {
    return this.reports.getSummary(filter);
  }

  @Get('export/:type')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({
    summary: 'Export a CSV report for revenue, doctors, or packs.',
  })
  @ApiParam({ name: 'type', enum: REPORT_EXPORT_TYPES })
  async exportCsv(
    @Param() params: ReportExportParamDto,
    @Query() filter: ReportSummaryDto,
    @Res() res: Response,
  ) {
    const csv = await this.reports.exportCsv(params.type, filter);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', contentDisposition(csv.fileName));
    res.send(`\uFEFF${csv.content}`);
  }
}
