import { Injectable } from '@nestjs/common';
import { CompanyBillingSettings, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BadRequestException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import {
  CompanyBillingSettingsResponseDto,
  UpsertCompanyBillingSettingsDto,
} from '../dto/company-billing-settings.dto';
import {
  formatDateStamp,
  slugifyForCode,
} from '../../common/utils/code-naming.util';

/**
 * CompanyBillingSettings is treated as a singleton: there is at most
 * one active row at a time. The service exposes the "active" row via
 * `getActive()` and lazily creates one on first PUT.
 *
 * Why a row and not env vars: the admin needs to upload a logo, edit
 * translations, change the TVA rate from the UI without a redeploy,
 * and old quotes have to keep referencing the values that existed at
 * generation time. JSONB + a single editable row hits all those.
 */
@Injectable()
export class CompanyBillingSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the current active settings or null if the admin hasn't saved any yet. */
  async getActive(): Promise<CompanyBillingSettings | null> {
    return this.prisma.companyBillingSettings.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Same as getActive() but throws when no active row exists. Used by
   * the Quote pipeline — refusing to generate a Quote without company
   * settings keeps every PDF self-consistent.
   */
  async requireActive(): Promise<CompanyBillingSettings> {
    const settings = await this.getActive();
    if (!settings) {
      throw new NotFoundException(
        'Company billing settings have not been configured yet. Ask an admin to set them up first.',
      );
    }
    return settings;
  }

  /**
   * Upsert the active row. The first save also satisfies the
   * companyName-required guard. Subsequent saves are pure updates.
   */
  async upsert(
    dto: UpsertCompanyBillingSettingsDto,
  ): Promise<CompanyBillingSettings> {
    const current = await this.getActive();

    if (!current) {
      if (!dto.companyName || !dto.companyName.trim()) {
        throw new BadRequestException(
          'Company name is required when creating billing settings for the first time.',
        );
      }
      return this.prisma.companyBillingSettings.create({
        data: {
          companyName: dto.companyName.trim(),
          companyAddress: dto.companyAddress ?? null,
          companyCity: dto.companyCity ?? null,
          companyCountry: dto.companyCountry ?? null,
          companyPhone: dto.companyPhone ?? null,
          companyEmail: dto.companyEmail ?? null,
          taxRegistrationNumber: dto.taxRegistrationNumber ?? null,
          defaultTvaRate: dto.defaultTvaRate ?? 19,
          defaultTreatmentFee: dto.defaultTreatmentFee ?? 0,
          stampDuty: dto.stampDuty ?? 1,
          defaultCurrency: dto.defaultCurrency ?? 'TND',
          devisPrefix: dto.devisPrefix ?? 'DEV',
          devisNextNumber: dto.devisNextNumber ?? 1,
          legalTextTranslations:
            (dto.legalTextTranslations as Prisma.InputJsonValue) ??
            Prisma.JsonNull,
          footerTextTranslations:
            (dto.footerTextTranslations as Prisma.InputJsonValue) ??
            Prisma.JsonNull,
          bankDetails:
            (dto.bankDetails as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          isActive: dto.isActive ?? true,
        },
      });
    }

    // Update path — preserve fields the form didn't touch.
    return this.prisma.companyBillingSettings.update({
      where: { id: current.id },
      data: {
        companyName: dto.companyName ?? current.companyName,
        companyAddress: dto.companyAddress ?? current.companyAddress,
        companyCity: dto.companyCity ?? current.companyCity,
        companyCountry: dto.companyCountry ?? current.companyCountry,
        companyPhone: dto.companyPhone ?? current.companyPhone,
        companyEmail: dto.companyEmail ?? current.companyEmail,
        taxRegistrationNumber:
          dto.taxRegistrationNumber ?? current.taxRegistrationNumber,
        defaultTvaRate: dto.defaultTvaRate ?? current.defaultTvaRate,
        defaultTreatmentFee:
          dto.defaultTreatmentFee ?? current.defaultTreatmentFee,
        stampDuty: dto.stampDuty ?? current.stampDuty,
        defaultCurrency: dto.defaultCurrency ?? current.defaultCurrency,
        devisPrefix: dto.devisPrefix ?? current.devisPrefix,
        devisNextNumber: dto.devisNextNumber ?? current.devisNextNumber,
        legalTextTranslations:
          dto.legalTextTranslations !== undefined
            ? (dto.legalTextTranslations as Prisma.InputJsonValue)
            : (current.legalTextTranslations as Prisma.InputJsonValue),
        footerTextTranslations:
          dto.footerTextTranslations !== undefined
            ? (dto.footerTextTranslations as Prisma.InputJsonValue)
            : (current.footerTextTranslations as Prisma.InputJsonValue),
        bankDetails:
          dto.bankDetails !== undefined
            ? (dto.bankDetails as Prisma.InputJsonValue)
            : (current.bankDetails as Prisma.InputJsonValue),
        isActive: dto.isActive ?? current.isActive,
      },
    });
  }

  /**
   * Attach a freshly uploaded logo. The caller is expected to have
   * already validated the upload (size/mime) via the storage service.
   */
  async setLogoPath(relativePath: string): Promise<CompanyBillingSettings> {
    let settings = await this.getActive();
    if (!settings) {
      // Create a minimal row so the logo isn't orphaned. companyName
      // can be filled in later by the admin via PUT.
      settings = await this.prisma.companyBillingSettings.create({
        data: { companyName: 'Oralign', companyLogoPath: relativePath },
      });
      return settings;
    }
    return this.prisma.companyBillingSettings.update({
      where: { id: settings.id },
      data: { companyLogoPath: relativePath },
    });
  }

  async clearLogo(): Promise<CompanyBillingSettings | null> {
    const settings = await this.getActive();
    if (!settings) return null;
    return this.prisma.companyBillingSettings.update({
      where: { id: settings.id },
      data: { companyLogoPath: null },
    });
  }

  /**
   * Build the human-readable quotation number from the patient's name
   * and the quote's creation date — `dv_<PatientNameSlug>_YYYYMMDD`.
   * Falls back to the legacy `DEV-XXXXXX` counter when we can't slug
   * the patient (missing patient, non-Latin name with no ASCII
   * fallback, etc.), so this is always safe to call.
   *
   * Collisions (same patient, same day) are resolved with a `-N`
   * suffix. We wrap the existence-check + counter-bump in a single
   * Prisma transaction so two concurrent `POST /quotations/.../send`
   * calls cannot allocate the same number.
   *
   * Kept the legacy counter (`devisNextNumber`) bumping inside the
   * fallback branch so existing audit trails / number sequences in
   * the billing settings stay intact even though new quotes use the
   * patient-stamped format.
   */
  async allocateQuotationNumber(args: {
    patientFullName?: string | null;
    createdAt?: Date | null;
  }): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const settings = await tx.companyBillingSettings.findFirst({
        where: { isActive: true },
        orderBy: { updatedAt: 'desc' },
      });
      if (!settings) {
        throw new NotFoundException(
          'Cannot allocate quotation number — company billing settings missing.',
        );
      }

      const date = args.createdAt ?? new Date();
      const datePart = formatDateStamp(date);
      const slug = slugifyForCode(args.patientFullName ?? '');

      // Fast path: patient slug is empty → fall back to the legacy
      // counter-based number so we still produce *something* sensible.
      if (!slug) {
        const prefix = settings.devisPrefix || 'DEV';
        const next = settings.devisNextNumber;
        const numberString = `${prefix}-${String(next).padStart(6, '0')}`;
        await tx.companyBillingSettings.update({
          where: { id: settings.id },
          data: { devisNextNumber: next + 1 },
        });
        return numberString;
      }

      const stem = `dv_${slug}_${datePart}`;
      // Same patient + same day → tack on a -02, -03, … suffix so
      // each quote stays uniquely addressable.
      const existing = await tx.quotation.count({
        where: { quotationNumber: { startsWith: stem } },
      });
      return existing === 0
        ? stem
        : `${stem}-${String(existing + 1).padStart(2, '0')}`;
    });
  }

  /**
   * Allocate the next sequential invoice / receipt number — `FAC-000001`.
   * Receipts are legal documents, so the numbering is a plain gapless
   * counter (no patient stamp). The read + counter-bump run in one
   * transaction so two concurrent receipt renders can't collide on the
   * same value.
   */
  async allocateInvoiceNumber(): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const settings = await tx.companyBillingSettings.findFirst({
        where: { isActive: true },
        orderBy: { updatedAt: 'desc' },
      });
      if (!settings) {
        throw new NotFoundException(
          'Cannot allocate invoice number — company billing settings missing.',
        );
      }
      const prefix = settings.invoicePrefix || 'FAC';
      const next = settings.invoiceNextNumber;
      await tx.companyBillingSettings.update({
        where: { id: settings.id },
        data: { invoiceNextNumber: next + 1 },
      });
      return `${prefix}-${String(next).padStart(6, '0')}`;
    });
  }

  /**
   * Allocate the next sequential treatment-fee receipt number —
   * `TF-000001`. A SEPARATE gapless counter from the installment
   * invoice sequence (product decision); same transactional bump so
   * concurrent renders can't collide on the same value.
   */
  async allocateTreatmentFeeInvoiceNumber(): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const settings = await tx.companyBillingSettings.findFirst({
        where: { isActive: true },
        orderBy: { updatedAt: 'desc' },
      });
      if (!settings) {
        throw new NotFoundException(
          'Cannot allocate treatment-fee invoice number — company billing settings missing.',
        );
      }
      const prefix = settings.treatmentFeeInvoicePrefix || 'TF';
      const next = settings.treatmentFeeInvoiceNextNumber;
      await tx.companyBillingSettings.update({
        where: { id: settings.id },
        data: { treatmentFeeInvoiceNextNumber: next + 1 },
      });
      return `${prefix}-${String(next).padStart(6, '0')}`;
    });
  }

  /**
   * Legacy entry point — kept so any external caller that hasn't been
   * updated still resolves to a sensible counter-based number. New
   * code should call `allocateQuotationNumber({ patientFullName, … })`.
   */
  async allocateNextQuotationNumber(): Promise<string> {
    return this.allocateQuotationNumber({});
  }

  // ─── Mapping ─────────────────────────────────────────────────────────────

  static toDto(
    settings: CompanyBillingSettings,
  ): CompanyBillingSettingsResponseDto {
    return {
      id: settings.id,
      companyName: settings.companyName,
      companyLogoPath: settings.companyLogoPath ?? null,
      companyAddress: settings.companyAddress ?? null,
      companyCity: settings.companyCity ?? null,
      companyCountry: settings.companyCountry ?? null,
      companyPhone: settings.companyPhone ?? null,
      companyEmail: settings.companyEmail ?? null,
      taxRegistrationNumber: settings.taxRegistrationNumber ?? null,
      defaultTvaRate: settings.defaultTvaRate,
      // Decimal → Number at the API boundary; the frontend form uses
      // a plain number input and computeTotals() does Number arithmetic.
      defaultTreatmentFee: Number(settings.defaultTreatmentFee),
      // Same Decimal → Number boundary treatment as defaultTreatmentFee
      // so the admin form gets a plain number and the invoice total math
      // is pure Number arithmetic.
      stampDuty: Number(settings.stampDuty),
      defaultCurrency: settings.defaultCurrency,
      devisPrefix: settings.devisPrefix,
      devisNextNumber: settings.devisNextNumber,
      legalTextTranslations:
        (settings.legalTextTranslations as Record<string, string> | null) ??
        null,
      footerTextTranslations:
        (settings.footerTextTranslations as Record<string, string> | null) ??
        null,
      bankDetails:
        (settings.bankDetails as Record<string, string> | null) ?? null,
      isActive: settings.isActive,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
  }
}
