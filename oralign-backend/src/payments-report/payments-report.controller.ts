import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { Response } from 'express';
import {
  CurrentUser,
  JwtPayload,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { attachmentDisposition } from '../common/http/content-disposition';
import { PaymentsReportRequestDto } from './dto/payments-report.dto';
import { PaymentsReportService } from './payments-report.service';

/**
 * The payments report PDF. POST, because the request carries each tab's
 * filters as a JSON body; it reads only. Printing a PDF costs a Chromium
 * page, so the route has its own tighter throttle.
 */
@ApiTags('payments')
@ApiBearerAuth('access-token')
@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsReportController {
  constructor(private readonly reports: PaymentsReportService) {}

  @Post('report')
  @Roles(UserRole.dentist, UserRole.admin, UserRole.super_admin)
  @Throttle({
    short: { limit: 6, ttl: 10_000 },
    medium: { limit: 30, ttl: 60_000 },
  })
  @ApiOperation({
    summary:
      "The payments report as a PDF: treatment fees, installment payments or both (consolidated), for a period of Africa/Tunis days and the desk tabs' filters. Every matching row, the money collected (successful payments only) per method. A dentist gets their own orders only. 400 REPORT_TOO_LARGE past 5000 rows.",
  })
  @ApiProduces('application/pdf')
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'application/pdf, as an attachment named Oralign_Rapport_Paiements_….pdf',
  })
  async download(
    @Body() request: PaymentsReportRequestDto,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, fileName } = await this.reports.render(request, {
      userId: user.sub,
      role: user.role,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      attachmentDisposition(fileName, 'report.pdf'),
    );
    res.setHeader('Content-Length', buffer.length.toString());
    // A report is a snapshot of private money data: never cache it.
    res.setHeader('Cache-Control', 'no-store');
    res.status(HttpStatus.OK).end(buffer);
  }
}
