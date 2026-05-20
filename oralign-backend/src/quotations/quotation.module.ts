import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { CompanyBillingSettingsController } from './controllers/company-billing-settings.controller';
import { QuotationController } from './controllers/quotation.controller';
import { CompanyBillingSettingsService } from './services/company-billing-settings.service';
import { QuotationService } from './services/quotation.service';
import { QuotationPdfService } from './services/quotation-pdf.service';

/**
 * Quotation / Devis module — admin company-billing-settings + per-order
 * quote lifecycle + PDF rendering. Imports PrismaModule (DB) and
 * StorageModule (logo upload).
 */
@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [CompanyBillingSettingsController, QuotationController],
  providers: [
    CompanyBillingSettingsService,
    QuotationService,
    QuotationPdfService,
  ],
  exports: [QuotationService, QuotationPdfService],
})
export class QuotationModule {}
