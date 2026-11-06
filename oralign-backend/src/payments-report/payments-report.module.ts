import { Module } from '@nestjs/common';
import { PdfModule } from '../common/pdf/pdf.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QuotationModule } from '../quotations/quotation.module';
import { PaymentsReportController } from './payments-report.controller';
import { PaymentsReportService } from './payments-report.service';

/**
 * The payments report (POST /payments/report). Its own module, like the
 * invoices: PaymentsModule stays free of puppeteer-core, and the report
 * reuses PaymentsSummaryService (what "received" means), the billing
 * settings (issuer, logo) and the shared PDF renderer.
 */
@Module({
  imports: [PrismaModule, PaymentsModule, QuotationModule, PdfModule],
  controllers: [PaymentsReportController],
  providers: [PaymentsReportService],
})
export class PaymentsReportModule {}
