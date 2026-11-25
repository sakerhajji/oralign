import { Injectable, Logger } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { lookupActorName } from '../../common/access/actor-snapshot';
import type { Caller } from '../../common/access/caller';
import { toAmount } from '../../common/billing/tax-split';
import { env } from '../../common/config/env';
import {
  AppException,
  BadRequestException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { invoiceLanguageFor } from './invoice-i18n';
import { InvoicePdfService } from './invoice-pdf.service';

export interface InvoiceEmailed {
  emailedTo: string;
  emailedAt: Date;
}

/**
 * E-mails a stored invoice, PDF attached, to the practitioner it bills
 * (owner decision, 2026-11-19: the facture goes out after each payment).
 *
 * Recipient: the practitioner's ACCOUNT e-mail — the address they log in
 * with and certainly read — and the invoice's client e-mail only when no
 * practitioner is linked. Language: the practitioner's preferred one.
 *
 * Two entry points with two failure policies:
 *   • `sendAutomatic` runs right after an automatic invoice is created. It
 *     is best-effort and never throws: the payment and the invoice stand
 *     whatever SMTP does, and the admin can re-send from the desk.
 *   • `sendManual` is the admin's explicit (re)send: failures surface.
 * Either way `emailedAt`/`emailedTo` are stamped, with an 'emailed' audit
 * row, only when the relay actually accepted the message.
 */
@Injectable()
export class InvoiceMailService {
  private readonly logger = new Logger(InvoiceMailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicePdf: InvoicePdfService,
    private readonly mail: MailService,
  ) {}

  async sendAutomatic(invoiceId: string): Promise<InvoiceEmailed | null> {
    try {
      return await this.send(invoiceId, null);
    } catch (error) {
      // Swallowed on purpose — see the failure policy above.
      this.logger.warn(
        `Invoice ${invoiceId} was not e-mailed: ${(error as Error).message}`,
      );
      return null;
    }
  }

  async sendManual(invoiceId: string, caller: Caller): Promise<InvoiceEmailed> {
    return this.send(invoiceId, caller);
  }

  private async send(
    invoiceId: string,
    caller: Caller | null,
  ): Promise<InvoiceEmailed> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, deletedAt: null },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        currency: true,
        language: true,
        clientName: true,
        clientEmail: true,
        totalTtc: true,
        stampDuty: true,
        withholdingRate: true,
        withholdingAmount: true,
        netPayable: true,
        orderId: true,
        emailedTo: true,
        order: { select: { orderCode: true } },
        doctor: {
          select: { fullName: true, email: true, preferredLanguage: true },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const to = invoice.doctor?.email?.trim() || invoice.clientEmail?.trim();
    if (!to) {
      throw new BadRequestException(
        'This invoice has no recipient: link a practitioner or fill in the client e-mail.',
        'INVOICE_NO_RECIPIENT',
      );
    }
    const lang = invoice.doctor
      ? invoiceLanguageFor(invoice.doctor.preferredLanguage)
      : invoice.language === 'en'
        ? 'en'
        : 'fr';

    const pdf = await this.invoicePdf.renderInvoiceRecordBuffer({
      invoiceId: invoice.id,
    });

    // Both failures below answer 422, never 502/503: the client reads any
    // 502/503 as "the server is restarting, retry" and drops our message,
    // while these never clear on a retry and the admin must read why.
    let sent: boolean;
    try {
      sent = await this.mail.sendInvoiceToDoctor({
        to,
        lang,
        doctorName: invoice.doctor?.fullName ?? invoice.clientName,
        invoiceNumber: invoice.invoiceNumber,
        orderCode: invoice.order?.orderCode ?? null,
        // Total TTC stamp included, then the retenue and the net, exactly
        // as the attached facture prints them.
        totalTtc: toAmount(invoice.totalTtc),
        stampDuty: toAmount(invoice.stampDuty),
        withholdingRate:
          invoice.withholdingRate === null ? null : toAmount(invoice.withholdingRate),
        withholdingAmount: toAmount(invoice.withholdingAmount),
        netPayable: toAmount(invoice.netPayable),
        currency: invoice.currency || 'TND',
        paid: invoice.status === InvoiceStatus.paid,
        dashboardUrl: invoice.orderId
          ? `${env.frontendUrl.replace(/\/$/, '')}/dashboard/orders/${invoice.orderId}`
          : null,
        pdf: { filename: pdf.fileName, content: pdf.buffer },
      });
    } catch (error) {
      this.logger.error(
        `SMTP refused invoice ${invoice.invoiceNumber} for ${to}: ${(error as Error).message}`,
      );
      throw new AppException(
        422,
        'The e-mail server refused the message; the invoice was not sent.',
        'MAIL_SEND_FAILED',
      );
    }
    if (!sent) {
      // Nothing left the server: stamping emailedAt would be a lie.
      throw new AppException(
        422,
        'E-mail sending is not configured on this server; the invoice was not sent.',
        'MAIL_NOT_CONFIGURED',
      );
    }

    const emailedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { emailedAt, emailedTo: to },
      }),
      this.prisma.invoiceAuditLog.create({
        data: {
          invoiceId: invoice.id,
          actorId: caller?.userId ?? null,
          actorName: caller
            ? await lookupActorName(this.prisma, caller.userId)
            : 'Automatique',
          action: 'emailed',
          changes: {
            emailedTo: { from: invoice.emailedTo ?? null, to },
          } as Prisma.InputJsonValue,
        },
      }),
    ]);
    this.logger.log(`Invoice ${invoice.invoiceNumber} e-mailed to ${to}`);
    return { emailedTo: to, emailedAt };
  }
}
