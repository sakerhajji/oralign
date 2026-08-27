import { Module } from '@nestjs/common';
import { PackModule } from '../packs/pack.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import {
  CompanyBillingSettingsController,
  PublicBillingDefaultsController,
  PublicLegalInfoController,
} from './controllers/company-billing-settings.controller';
import { QuotationController } from './controllers/quotation.controller';
import { QuotationPaymentPlanController } from './controllers/quotation-payment-plan.controller';
import { CompanyBillingSettingsService } from './services/company-billing-settings.service';
import { QuotationService } from './services/quotation.service';
import { QuotationPaymentPlanService } from './services/quotation-payment-plan.service';
import { QuotationPdfService } from './services/quotation-pdf.service';

/**
 * Quotation / Devis module — admin company-billing-settings + per-order
 * quote lifecycle + PDF rendering. Imports PrismaModule (DB),
 * StorageModule (logo upload), and PackModule so the pack-aware
 * payment-plan service can resolve active prices.
 *
 * QuotationPaymentPlanService lives next to QuotationService rather
 * than in a separate module so the two services can collaborate
 * cheaply (e.g. approve() delegates pack quotes to it). Exporting
 * both keeps consumers from having to know which file owns the
 * behaviour they need.
 */
@Module({
  imports: [PrismaModule, StorageModule, PackModule, LoyaltyModule],
  controllers: [
    CompanyBillingSettingsController,
    PublicBillingDefaultsController,
    PublicLegalInfoController,
    QuotationController,
    QuotationPaymentPlanController,
  ],
  providers: [
    CompanyBillingSettingsService,
    QuotationService,
    QuotationPaymentPlanService,
    QuotationPdfService,
  ],
  exports: [
    QuotationService,
    QuotationPaymentPlanService,
    QuotationPdfService,
    // Re-exported so InvoicesModule (which renders the bilingual
    // payment receipt PDF) can inject the same company-billing
    // settings the quote PDF uses — keeps the receipt header
    // visually consistent with the quote header.
    CompanyBillingSettingsService,
  ],
})
export class QuotationModule {}
