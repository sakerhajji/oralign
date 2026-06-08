import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { Response } from 'express';
import {
  CurrentUser,
  JwtPayload,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PaymentsService } from '../payments/services/payments.service';
import { InvoiceLanguage } from './services/invoice-i18n';
import { InvoicePdfService } from './services/invoice-pdf.service';

/**
 * RFC 5987 Content-Disposition helper. ASCII filename for legacy
 * agents, plus a UTF-8 encoded `filename*` for everything else.
 */
function contentDispositionFileName(fileName: string): string {
  const asciiName =
    fileName
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\x20-\x7E]+/g, '_')
      .replace(/["\\]/g, '_')
      .slice(0, 120) || 'invoice.pdf';

  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * Coerce the `?lang=` query into a known InvoiceLanguage. Anything
 * other than `fr`/`en` returns undefined so the service can apply the
 * company-default fallback. We deliberately do NOT throw — a typo on
 * the dashboard side should still produce a sensible PDF.
 */
function parseInvoiceLanguage(value: string | undefined): InvoiceLanguage | undefined {
  if (value === 'fr' || value === 'en') return value;
  return undefined;
}

/**
 * Invoice / payment-receipt endpoints. Mounted under the Payments
 * resource (`GET /payments/:paymentId/invoice`) so the URL reads as
 * "this payment's invoice", but owned by its own module to keep the
 * Puppeteer renderer + i18n dictionary cleanly separated from the
 * payment lifecycle (CARD / BANK / CASH) in PaymentsService.
 *
 * Authorisation reuses PaymentsService.getPayment which already runs
 * the admin-OR-owning-doctor check — no duplication of RBAC logic
 * here, the controller just streams the rendered buffer back.
 */
@ApiTags('invoices')
@ApiBearerAuth('access-token')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.dentist, UserRole.admin, UserRole.super_admin)
export class InvoicesController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly invoicePdf: InvoicePdfService,
  ) {}

  @Get('payments/:paymentId/invoice')
  @SkipThrottle()
  @ApiOperation({
    summary:
      'Download the bilingual (FR/EN) payment receipt as a PDF. Admin sees every payment; the owning dentist sees only payments on their own orders. Defaults to the language already chosen on the related quote if `?lang=` is omitted.',
  })
  @ApiParam({ name: 'paymentId', type: String })
  @ApiQuery({
    name: 'lang',
    required: false,
    enum: ['fr', 'en'],
    description:
      'Force a French or English render of the receipt. Falls back to the quote snapshot language and then French when omitted.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'application/pdf stream',
    content: { 'application/pdf': {} },
  })
  async download(
    @Param('paymentId') paymentId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
    @Query('lang') lang?: string,
  ): Promise<void> {
    // RBAC: run the canonical payment fetch (throws 403 on a foreign
    // payment, 404 on missing). We don't pass the row through to the
    // renderer — the service rehydrates with its own RBAC-agnostic
    // select so the renderer's expectations stay stable.
    await this.payments.getPayment(paymentId, {
      userId: user.sub,
      role: user.role as UserRole,
    });

    const { buffer, fileName, mimeType } = await this.invoicePdf.renderInvoiceBuffer({
      paymentId,
      language: parseInvoiceLanguage(lang),
    });

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', contentDispositionFileName(fileName));
    res.setHeader('Content-Length', buffer.length.toString());
    res.status(HttpStatus.OK).end(buffer);
  }
}
