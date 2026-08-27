// Quotation / Devis
// Split out of the former 2,000-line lib/types/index.ts; import via '@/lib/types'.

import type { ArchType, PaymentMode, QuotationPaymentStatus } from './billing';
import type { Localized } from './blog';

// ─── Quotation / Devis ──────────────────────────────────────────────────────

export enum DevisLanguage {
  FR = 'fr',
  EN = 'en',
  AR = 'ar',
}

export enum QuotationStatus {
  DRAFT     = 'draft',
  SENT      = 'sent',
  APPROVED  = 'approved',
  REJECTED  = 'rejected',
  CANCELED  = 'canceled',
}

/** Translated text bundles editable from the admin billing-settings UI. */
export interface TranslatedTexts {
  fr?: string;
  en?: string;
  ar?: string;
}

export interface BankDetails {
  bankName?: string;
  accountName?: string;
  rib?: string;
  iban?: string;
  swift?: string;
}

export interface CompanyBillingSettings {
  id: string;
  companyName: string;
  companyLogoPath?: string | null;
  companyAddress?: string | null;
  companyCity?: string | null;
  companyCountry?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  taxRegistrationNumber?: string | null;

  // Legal identity (mentions légales) — sourced from billing settings so
  // the public compliance pages never hardcode the merchant's data.
  tradeName?: string | null;
  legalForm?: string | null;
  registreDeCommerce?: string | null;
  hostingProvider?: string | null;
  hostingProviderUrl?: string | null;
  websiteDomain?: string | null;

  defaultTvaRate: number;
  // Professional/clinical fee auto-applied to new quotes. The admin
  // can still override per-quote — this is just the policy default.
  defaultTreatmentFee: number;
  // "Droit de timbre" (Tunisian fiscal stamp, typically 1.000 TND).
  // Added to the INVOICE total. Decimal on the backend, serialised as a
  // number at the DTO boundary exactly like `defaultTreatmentFee`.
  stampDuty: number;
  // CBCT paid supplement — when enabled with a fee > 0, requesting CBCT
  // on a NEW order snapshots this amount onto the order. Currency
  // follows defaultCurrency.
  cbctSupplementEnabled: boolean;
  cbctSupplementFee: number;
  // Beyond-the-pack tariffs (grille 2026) — informational price list the
  // admin edits; 0 hides the line on doctor-facing surfaces.
  refinementTwoArchesFee: number;
  refinementSingleArchFee: number;
  replacementAlignerFee: number;
  retainersFee: number;
  // Master switch of the quarterly loyalty program.
  loyaltyEnabled: boolean;
  defaultCurrency: string;
  devisPrefix: string;
  devisNextNumber: number;

  legalTextTranslations?: TranslatedTexts | null;
  footerTextTranslations?: TranslatedTexts | null;
  bankDetails?: BankDetails | null;

  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertCompanyBillingSettingsDto {
  companyName?: string;
  companyAddress?: string;
  companyCity?: string;
  companyCountry?: string;
  companyPhone?: string;
  companyEmail?: string;
  taxRegistrationNumber?: string;
  tradeName?: string;
  legalForm?: string;
  registreDeCommerce?: string;
  hostingProvider?: string;
  hostingProviderUrl?: string;
  websiteDomain?: string;
  defaultTvaRate?: number;
  defaultTreatmentFee?: number;
  /** "Droit de timbre" — fiscal stamp added to the invoice total. */
  stampDuty?: number;
  /** CBCT paid supplement toggle + fee (currency = defaultCurrency). */
  cbctSupplementEnabled?: boolean;
  cbctSupplementFee?: number;
  /** Beyond-the-pack tariffs (grille 2026). */
  refinementTwoArchesFee?: number;
  refinementSingleArchFee?: number;
  replacementAlignerFee?: number;
  retainersFee?: number;
  /** Master switch of the quarterly loyalty program. */
  loyaltyEnabled?: boolean;
  defaultCurrency?: string;
  devisPrefix?: string;
  devisNextNumber?: number;
  legalTextTranslations?: TranslatedTexts;
  footerTextTranslations?: TranslatedTexts;
  bankDetails?: BankDetails;
  isActive?: boolean;
}

/**
 * PUBLIC legal identity projection (mentions légales) served WITHOUT auth
 * from `/company-billing-settings/legal-info`. Powers the public showcase
 * compliance pages + the dashboard help page. Every field can be null
 * until the admin fills the billing settings — the UI renders graceful
 * "à compléter" placeholders in that case.
 */
export interface LegalInfo {
  companyName: string | null;
  tradeName: string | null;
  legalForm: string | null;
  taxRegistrationNumber: string | null;
  registreDeCommerce: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  hostingProvider: string | null;
  hostingProviderUrl: string | null;
  websiteDomain: string | null;
  currency: string | null;
}

/** Snapshot of the company-billing-settings row at quotation-issue time. */
export interface QuotationCompanySnapshot {
  companyName: string;
  companyLogoPath?: string | null;
  companyAddress?: string | null;
  companyCity?: string | null;
  companyCountry?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  taxRegistrationNumber?: string | null;
  tvaRate: number;
  currency: string;
  selectedLanguage: DevisLanguage;
  legalText: string;
  footerText: string;
  bankDetails?: BankDetails | null;
  generatedAt: string;
}

/** Snapshot of the doctor's DentistProfile at quotation-issue time. */
export interface QuotationClinicSnapshot {
  doctorId: string;
  doctorFullName: string;
  doctorEmail: string;
  clinicName?: string | null;
  clinicAddress?: string | null;
  city?: string | null;
  country?: string | null;
  clinicPhone?: string | null;
  clinicEmail?: string | null;
  logoUrl?: string | null;
  generatedAt: string;
}

export interface Quotation {
  id: string;
  orderId: string;
  quotationNumber?: string | null;
  language: DevisLanguage;
  status: QuotationStatus;
  treatmentFees: number;
  fabricationFees: number;
  deliveryFees: number;
  discountAmount: number;
  subTotalHt: number;
  tvaRate: number;
  tvaAmount: number;
  totalTtc: number;
  currency: string;
  notes?: string | null;
  adminMessage?: string | null;
  companySnapshot?: QuotationCompanySnapshot | null;
  clinicSnapshot?: QuotationClinicSnapshot | null;
  pdfFilePath?: string | null;
  sentAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  createdById: string;
  approvedById?: string | null;
  rejectedById?: string | null;
  createdAt: string;
  updatedAt: string;
  // ── Pack snapshot (set when admin attaches a Pack) ────────────────
  // All optional because legacy (pre-packs) quotes don't carry these.
  // `totalPrice` / `paidAmount` / `remainingAmount` are strings on the
  // wire because the backend serialises Prisma.Decimal as a string to
  // avoid Number-precision drift on the client.
  packId?: string | null;
  packName?: string | null;
  archType?: ArchType | null;
  maxStepsPerArch?: number | null;
  includedCorrections?: number | null;
  isUnlimitedSteps?: boolean | null;
  isUnlimitedCorrections?: boolean | null;
  isForOrthodontists?: boolean | null;
  totalPrice?: string | null;
  paidAmount?: string | null;
  remainingAmount?: string | null;
  paymentMode?: PaymentMode | null;
  paymentStatus?: QuotationPaymentStatus | null;
  doctorApprovedAt?: string | null;
  // Read-only LOCALIZED display fields for the attached pack, joined on
  // the `getForOrder` read (NOT stored on the quote). Lets the order
  // summary render the pack name / expiration / finishing in the current
  // UI language. Null when no pack is attached (or it was deleted) — the
  // UI falls back to the stable `packName` snapshot.
  pack?: PackLocalizedSummary | null;
}

export interface PackLocalizedSummary {
  id: string;
  name: string;
  nameI18n?: Partial<Localized<string>> | null;
  descriptionI18n?: Partial<Localized<string>> | null;
  treatmentExpirationLabel?: Partial<Localized<string>> | null;
  finishingIncludedLabel?: Partial<Localized<string>> | null;
  maxStepsPerArch?: number | null;
  includedCorrections?: number | null;
  isUnlimitedSteps?: boolean | null;
  isUnlimitedCorrections?: boolean | null;
}

/** Create / update payload shared by admin form. */
export interface UpsertQuotationDto {
  language?: DevisLanguage;
  treatmentFees?: number;
  fabricationFees?: number;
  deliveryFees?: number;
  discountAmount?: number;
  tvaRate?: number;
  currency?: string;
  notes?: string;
  adminMessage?: string;
}
