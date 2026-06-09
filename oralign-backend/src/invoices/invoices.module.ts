import { Module } from '@nestjs/common';
import { OrderModule } from '../orders/order.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QuotationModule } from '../quotations/quotation.module';
import { InvoicesController } from './invoices.controller';
import { InvoicePdfService } from './services/invoice-pdf.service';

/**
 * Invoices module — owns the bilingual (FR/EN) payment-receipt PDF
 * renderer and the single route that streams it back to the doctor or
 * admin. Mounted at `GET /payments/:paymentId/invoice`.
 *
 * Why a separate module rather than folding the controller into
 * PaymentsModule:
 *   • Keeps PaymentsModule lean — it already coordinates the CARD /
 *     BANK_TRANSFER / CASH lifecycle and the gateway strategy, which
 *     is unrelated to PDF rendering.
 *   • Mirrors the QuotationModule pattern (which owns
 *     QuotationPdfService inside its own module). Consistency makes
 *     the project easier to navigate.
 *   • Decouples the heavy Puppeteer dependency from the payment hot
 *     path. PaymentsModule never imports puppeteer-core — only the
 *     receipt download path pays that startup cost.
 *
 * Imports:
 *   • PaymentsModule — for the PaymentsService RBAC helper that gates
 *     the payment-receipt download endpoint (admin OR owning dentist).
 *   • OrderModule — for the OrderService RBAC helper that gates the
 *     treatment-fee invoice endpoint (admin OR owning dentist).
 *   • QuotationModule — for CompanyBillingSettingsService which feeds
 *     the company header block on the receipt.
 *   • PrismaModule — DB access for the rehydration query.
 */
@Module({
  imports: [PrismaModule, PaymentsModule, QuotationModule, OrderModule],
  controllers: [InvoicesController],
  providers: [InvoicePdfService],
  exports: [InvoicePdfService],
})
export class InvoicesModule {}
