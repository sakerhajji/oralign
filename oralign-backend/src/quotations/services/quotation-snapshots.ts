import type {
  CompanyBillingSettings,
  DevisLanguage,
  Prisma,
  Quotation,
} from '@prisma/client';
import { toAmount } from '../../common/billing/tax-split';
import {
  buildDoctorBillingSnapshot,
  DOCTOR_BILLING_SELECT,
  type DoctorBillingSource,
} from '../../common/doctor/doctor-billing-snapshot';
import { pickTranslation } from './quotation-i18n';

/**
 * The two snapshots a devis freezes (spec §6): the company block
 * (`companySnapshot`, CompanyBillingSettings incl. the stamp and the
 * retenue rule) and the practitioner it is addressed to
 * (`clinicSnapshot`). Pure builders, shared by:
 *   - QuotationService.send(), which REBUILDS both on every draft -> sent
 *     (a recalled devis sent again carries the doctor's current profile);
 *   - QuotationPdfService, which renders a draft from snapshots built in
 *     memory and never persisted (a draft PDF never freezes anything).
 */

/** The company settings as the devis freezes them, translations resolved. */
export function buildQuoteCompanySnapshot(
  settings: CompanyBillingSettings,
  language: DevisLanguage,
  currency: string,
  tvaRate: number,
  at: Date = new Date(),
) {
  return {
    companyName: settings.companyName,
    companyLogoPath: settings.companyLogoPath ?? null,
    companyAddress: settings.companyAddress ?? null,
    companyCity: settings.companyCity ?? null,
    companyCountry: settings.companyCountry ?? null,
    companyPhone: settings.companyPhone ?? null,
    companyEmail: settings.companyEmail ?? null,
    taxRegistrationNumber: settings.taxRegistrationNumber ?? null,
    tvaRate,
    // The devis states that this stamp is added to each payment (one
    // facture per payment); frozen with the rest of the company block.
    stampDuty: toAmount(settings.stampDuty),
    // The retenue à la source rule as it stood (spec §4): read by the
    // devis' « Retenue si appliquée » row. Snapshots made before
    // 2026-11-27 lack the three keys: readers fall back to the live
    // settings, like the stamp (quote-document-money.ts).
    withholdingEnabled: settings.withholdingEnabled,
    withholdingRate: toAmount(settings.withholdingRate),
    withholdingThreshold: toAmount(settings.withholdingThreshold),
    currency,
    selectedLanguage: language,
    legalText: pickTranslation(settings.legalTextTranslations, language),
    footerText: pickTranslation(settings.footerTextTranslations, language),
    // Carry the FULL translation maps so the PDF renderer can re-resolve
    // when the admin or doctor regenerates in a different language
    // without losing the historical snapshot. Legacy snapshots without
    // these fields stay valid: the renderer falls back to the resolved
    // `legalText` / `footerText` strings above.
    legalTextTranslations:
      (settings.legalTextTranslations as Record<string, unknown> | null) ??
      null,
    footerTextTranslations:
      (settings.footerTextTranslations as Record<string, unknown> | null) ??
      null,
    bankDetails:
      (settings.bankDetails as Record<string, string> | null) ?? null,
    generatedAt: at.toISOString(),
  };
}

/**
 * The practitioner as the devis freezes him, built by the shared billing
 * snapshot (practice, THE contact: practice first, account fallback, tax
 * id). The practice phone / e-mail keys stay for the readers written
 * before 2026-11-27; `contactPhone` / `contactEmail` are what a devis
 * prints. The registration number is NOT copied: a devis never prints it,
 * and the quote is readable by the assigned designer.
 */
export function buildQuoteClinicSnapshot(
  doctor: DoctorBillingSource,
  patient: { fullName: string | null } | null = null,
  at: Date = new Date(),
) {
  const snapshot = buildDoctorBillingSnapshot(doctor);
  return {
    doctorId: snapshot.doctorId,
    doctorFullName: snapshot.fullName,
    doctorEmail: snapshot.accountEmail,
    doctorPhone: snapshot.accountPhone,
    // The patient is snapshotted with the practice so the PDF header
    // needs no live join (legacy quotes lack it: the PDF prints none).
    patientFullName: patient?.fullName ?? null,
    clinicName: snapshot.clinicName,
    clinicAddress: snapshot.clinicAddress,
    city: snapshot.city,
    country: snapshot.country,
    clinicPhone: snapshot.clinicPhone,
    clinicEmail: snapshot.clinicEmail,
    contactPhone: snapshot.contactPhone,
    contactEmail: snapshot.contactEmail,
    // Doctor's "Matricule fiscal": the invoice renderer reads this key
    // first, then falls back to the live profile.
    taxId: snapshot.taxId,
    logoUrl: snapshot.logoUrl,
    generatedAt: at.toISOString(),
  };
}

/** What the clinic snapshot reads about an order, in one query. */
export const QUOTE_SNAPSHOT_ORDER_SELECT = {
  doctor: { select: DOCTOR_BILLING_SELECT },
  patient: { select: { fullName: true } },
} satisfies Prisma.DentalOrderSelect;

export interface QuoteSnapshots {
  companySnapshot: Prisma.InputJsonValue;
  clinicSnapshot: Prisma.InputJsonValue;
  /** For the DEV- number of a quote numbered at the same time. */
  patientFullName: string | null;
}

/**
 * Both snapshots of a quote as of now: one read of the order's doctor and
 * patient, the company settings given by the caller.
 */
export async function readQuoteSnapshots(
  db: Pick<Prisma.TransactionClient, 'dentalOrder'>,
  settings: CompanyBillingSettings,
  quote: Pick<Quotation, 'orderId' | 'language' | 'currency' | 'tvaRate'>,
  at: Date = new Date(),
): Promise<QuoteSnapshots> {
  const order = await db.dentalOrder.findUniqueOrThrow({
    where: { id: quote.orderId },
    select: QUOTE_SNAPSHOT_ORDER_SELECT,
  });
  return {
    companySnapshot: buildQuoteCompanySnapshot(
      settings,
      quote.language,
      quote.currency,
      quote.tvaRate,
      at,
    ) as unknown as Prisma.InputJsonValue,
    clinicSnapshot: buildQuoteClinicSnapshot(
      order.doctor,
      order.patient,
      at,
    ) as unknown as Prisma.InputJsonValue,
    patientFullName: order.patient?.fullName ?? null,
  };
}
