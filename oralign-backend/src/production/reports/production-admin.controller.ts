import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ADMIN_ROLES } from '../../common/access/caller';
import { CSV_MIME_TYPE } from '../../common/csv/csv';
import {
  CurrentUser,
  type JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { attachmentDisposition } from '../../common/http/content-disposition';
import {
  ProductionExportQueryDto,
  ProductionNoticesQueryDto,
  ProductionPeriodQueryDto,
  ProductionProgressQueryDto,
} from '../dto';
import type {
  ProductionAnomalies,
  ProductionNoticePage,
  ProductionNoticeView,
  ProductionProgressPage,
  ProductionSummary,
} from '../production.contract';
import { ProductionAnomaliesService } from './production-anomalies.service';
import { ProductionExportService } from './production-export.service';
import { ProductionNoticesService } from './production-notices.service';
import { ProductionProgressReportService } from './production-progress.service';
import { ProductionSummaryService } from './production-summary.service';

/**
 * Lab production, ADMIN DESK ("Pilotage"): journal / recap, progress,
 * anomalies, CSV export and the practitioner notices. Admin-only at the
 * class level (the RolesGuard refuses the technician outright); periods
 * are Tunis days, both included, at most MAX_REPORT_DAYS long.
 */
@ApiTags('production-admin')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ROLES)
@Controller('production/admin')
export class ProductionAdminController {
  constructor(
    private readonly summaries: ProductionSummaryService,
    private readonly progress: ProductionProgressReportService,
    private readonly anomalies: ProductionAnomaliesService,
    private readonly exports: ProductionExportService,
    private readonly notices: ProductionNoticesService,
  ) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Journal (from = to) or recap of a period of Tunis days',
    description:
      'Counted rows: live, entered through the module, performedAt in the period. 400 INVALID_DATE_RANGE when from > to or the span exceeds 366 days.',
  })
  getSummary(
    @Query() query: ProductionPeriodQueryDto,
  ): Promise<ProductionSummary> {
    return this.summaries.summarize(query);
  }

  @Get('progress')
  @ApiOperation({
    summary: 'Per-case progress (planned, made, remaining), paged',
  })
  getProgress(
    @Query() query: ProductionProgressQueryDto,
  ): Promise<ProductionProgressPage> {
    return this.progress.list(query);
  }

  @Get('anomalies')
  @ApiOperation({
    summary: 'Discrepancies ("Écarts") of a period, computed at read time',
  })
  getAnomalies(
    @Query() query: ProductionPeriodQueryDto,
  ): Promise<ProductionAnomalies> {
    return this.anomalies.detect(query);
  }

  @Get('export.csv')
  @ApiProduces(CSV_MIME_TYPE)
  @ApiOperation({
    summary: 'CSV of a period: one line per event (detail) or per day (daily)',
    description:
      'UTF-8 with BOM, ";" separated, CRLF: opens straight in French Excel. File name production_<from>_<to>_<format>.csv.',
  })
  async exportCsv(
    @Query() query: ProductionExportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const { content, fileName } = await this.exports.build(query);
    res.setHeader('Content-Type', CSV_MIME_TYPE);
    res.setHeader('Content-Disposition', attachmentDisposition(fileName));
    // Patient names inside: never kept by a shared cache.
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(HttpStatus.OK).end(content);
  }

  @Get('notices')
  @ApiOperation({ summary: 'Practitioner notices (outbox), newest first' })
  getNotices(
    @Query() query: ProductionNoticesQueryDto,
  ): Promise<ProductionNoticePage> {
    return this.notices.list(query);
  }

  @Post('notices/:id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'ProductionNotice id (uuid)' })
  @ApiOperation({
    summary: 'Queue a failed or fixably skipped notice again',
    description:
      '404 when the notice does not exist, 409 NOTICE_NOT_RETRYABLE when it is sent, in flight, pending, or skipped for a cancelled delivery.',
  })
  retryNotice(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ProductionNoticeView> {
    return this.notices.retry(id, { userId: user.sub, role: user.role });
  }
}
