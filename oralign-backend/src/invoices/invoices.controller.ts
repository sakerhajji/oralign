import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
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
import { OrderService } from '../orders/services/order.service';
import { PaymentsService } from '../payments/services/payments.service';
import { InvoiceLanguage } from './services/invoice-i18n';
import { InvoicePdfService } from './services/invoice-pdf.service';
import { UpdateInvoiceNumberDto } from './dto/update-invoice-number.dto';

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
    private readonly orderService: OrderService,
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

  @Get('orders/:orderId/treatment-fee/invoice')
  @SkipThrottle()
  @ApiOperation({
    summary:
      "Download the order's treatment-fee invoice as a bilingual (FR/EN) PDF. Admin sees every order; the owning dentist sees only their own. A sequential TF-XXXXXX number is allocated on the first render of a paid fee.",
  })
  @ApiParam({ name: 'orderId', type: String })
  @ApiQuery({
    name: 'lang',
    required: false,
    enum: ['fr', 'en'],
    description:
      'Force a French or English render of the treatment-fee invoice. Falls back to French when omitted.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'application/pdf stream',
    content: { 'application/pdf': {} },
  })
  async downloadTreatmentFeeInvoice(
    @Param('orderId') orderId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
    @Query('lang') lang?: string,
  ): Promise<void> {
    // RBAC: getOrderById throws 403 on a foreign order, 404 on missing.
    // We only need the access gate here — the renderer rehydrates its
    // own projection straight from the order id.
    await this.orderService.getOrderById(orderId, {
      userId: user.sub,
      role: user.role as UserRole,
    });

    const { buffer, fileName, mimeType } =
      await this.invoicePdf.renderTreatmentFeeInvoiceBuffer({
        orderId,
        language: parseInvoiceLanguage(lang),
      });

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', contentDispositionFileName(fileName));
    res.setHeader('Content-Length', buffer.length.toString());
    res.status(HttpStatus.OK).end(buffer);
  }

  @Patch('payments/:paymentId/invoice-number')
  @Roles(UserRole.admin, UserRole.super_admin)
  @ApiOperation({
    summary:
      'Admin-only: set or override the printed invoice / receipt number on a payment. Rejects a number already used by another receipt.',
  })
  @ApiParam({ name: 'paymentId', type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'The updated payment id and its new invoice number.',
  })
  async updateInvoiceNumber(
    @Param('paymentId') paymentId: string,
    @Body() dto: UpdateInvoiceNumberDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ id: string; invoiceNumber: string | null }> {
    const updated = await this.payments.updateInvoiceNumber(
      paymentId,
      dto.invoiceNumber,
      { userId: user.sub, role: user.role as UserRole },
    );
    return { id: updated.id, invoiceNumber: updated.invoiceNumber };
  }
}
