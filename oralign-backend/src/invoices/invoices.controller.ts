import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Logger,
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
import { PaymentRecordStatus, UserRole } from '@prisma/client';
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
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceAutoService } from './services/invoice-auto.service';
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
 * The practitioner's invoice downloads. Mounted under the Payments and
 * Orders resources (`GET /payments/:paymentId/invoice`,
 * `GET /orders/:orderId/treatment-fee/invoice`) so the URLs read as "this
 * payment's invoice", but owned by its own module to keep the Puppeteer
 * renderer + i18n dictionary separated from the payment lifecycle.
 *
 * Both routes serve the STORED FACTURE (owner decision, 2026-11-19: every
 * payment produces a facture, never a receipt). When the money is settled
 * but the invoice is missing (a listener failed, or the payment predates
 * automatic invoicing), it is generated on the spot — WITHOUT the e-mail:
 * whoever opened the route is already looking at the document, and an
 * admin browsing the payments desk must not mail a practitioner "votre
 * facture" for a payment made months ago. Live payments are e-mailed by
 * the event listeners; the invoice desk can re-send. The legacy on-the-fly
 * renderers stay only as a last resort, so a practitioner is never left
 * without a document.
 *
 * Authorisation reuses PaymentsService.getPayment / OrderService
 * .getOrderById, which already run the admin-OR-owning-doctor check — no
 * duplication of RBAC logic here.
 */
@ApiTags('invoices')
@ApiBearerAuth('access-token')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.dentist, UserRole.admin, UserRole.super_admin)
export class InvoicesController {
  private readonly logger = new Logger(InvoicesController.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly invoicePdf: InvoicePdfService,
    private readonly orderService: OrderService,
    private readonly prisma: PrismaService,
    private readonly autoInvoices: InvoiceAutoService,
  ) {}

  /**
   * The stored invoice of a settled payment, generated when missing. Null
   * when there is none to serve (unsettled payment, archived invoice, or a
   * generation failure — logged), so the caller falls back.
   */
  private async invoiceForPayment(paymentId: string): Promise<string | null> {
    const stored = await this.prisma.invoice.findUnique({
      where: { paymentId },
      select: { id: true, deletedAt: true },
    });
    if (stored) return stored.deletedAt ? null : stored.id;
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { status: true },
    });
    if (payment?.status !== PaymentRecordStatus.success) return null;
    try {
      const res = await this.autoInvoices.generateForPayment(paymentId, {
        notify: false,
      });
      return res.invoiceId ?? null;
    } catch (error) {
      this.logger.error(
        `On-demand invoice for payment ${paymentId} failed: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /** Same for an order's treatment fee (+ CBCT). */
  private async invoiceForTreatmentFee(orderId: string): Promise<string | null> {
    const stored = await this.prisma.invoice.findUnique({
      where: { treatmentFeeOrderId: orderId },
      select: { id: true, deletedAt: true },
    });
    if (stored) return stored.deletedAt ? null : stored.id;
    try {
      // A no-op ({ created: false }) while the fee is not settled.
      const res = await this.autoInvoices.generateForTreatmentFee(orderId, {
        notify: false,
      });
      return res.invoiceId ?? null;
    } catch (error) {
      this.logger.error(
        `On-demand treatment-fee invoice for order ${orderId} failed: ${(error as Error).message}`,
      );
      return null;
    }
  }

  @Get('payments/:paymentId/invoice')
  @SkipThrottle()
  @ApiOperation({
    summary:
      "Download the FACTURE of a payment as a bilingual (FR/EN) PDF, generated on demand when the payment is settled but its invoice is missing. Admin sees every payment; the owning dentist sees only payments on their own orders. Defaults to the invoice's own language if `?lang=` is omitted.",
  })
  @ApiParam({ name: 'paymentId', type: String })
  @ApiQuery({
    name: 'lang',
    required: false,
    enum: ['fr', 'en'],
    description:
      "Force a French or English render. Falls back to the invoice's own language when omitted.",
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

    const language = parseInvoiceLanguage(lang);
    const invoiceId = await this.invoiceForPayment(paymentId);
    const { buffer, fileName, mimeType } = invoiceId
      ? await this.invoicePdf.renderInvoiceRecordBuffer({ invoiceId, language })
      : // Last resort: the legacy document built from the payment itself.
        await this.invoicePdf.renderInvoiceBuffer({ paymentId, language });

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', contentDispositionFileName(fileName));
    res.setHeader('Content-Length', buffer.length.toString());
    res.status(HttpStatus.OK).end(buffer);
  }

  @Get('orders/:orderId/treatment-fee/invoice')
  @SkipThrottle()
  @ApiOperation({
    summary:
      "Download the FACTURE of the order's treatment fee (+ CBCT) as a bilingual (FR/EN) PDF, generated on demand once the fee is settled. Admin sees every order; the owning dentist sees only their own.",
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

    const language = parseInvoiceLanguage(lang);
    const invoiceId = await this.invoiceForTreatmentFee(orderId);
    const { buffer, fileName, mimeType } = invoiceId
      ? await this.invoicePdf.renderInvoiceRecordBuffer({ invoiceId, language })
      : // Last resort (unsettled fee, or generation failed): the legacy
        // document built from the order's columns.
        await this.invoicePdf.renderTreatmentFeeInvoiceBuffer({
          orderId,
          language,
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
