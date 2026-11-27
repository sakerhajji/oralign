// Quotation / Devis
// Split out of the former 2,000-line lib/types/index.ts; import via '@/lib/types'.

import type { ArchType, PaymentMode, QuotationPaymentStatus } from "./billing";
import type { Localized } from "./blog";

// ─── Quotation / Devis ──────────────────────────────────────────────────────

export enum DevisLanguage {
  FR = "fr",
  EN = "en",
  AR = "ar",
}

export enum QuotationStatus {
  DRAFT = "draft",
  SENT = "sent",
  APPROVED = "approved",
  REJECTED = "rejected",
  CANCELED = "canceled",
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
  // ADDED to every payment, since each payment gets its own facture
  // (owner decision 2026-11-20). Decimal on the backend, serialised as a
  // number like `defaultTreatmentFee`.
  stampDuty: number;
  // Retenue à la source (%) a practitioner may apply when paying (once
  // withholdingEnabled is on); 0 = the retenue can never apply.
  withholdingRate: number;
  // Master switch of the retenue (spec §4), off until the accountant
  // validates. Optional only so an older API never breaks the form
  // (absent reads as off, like the backend default).
  withholdingEnabled?: boolean;
  // Payment base (TTC, stamp excluded) from which the retenue may apply,
  // 3 decimals; a payment below it cannot carry it. Default 1 000.
  withholdingThreshold?: number;
  // Doctor inactivity rule (spec §5): rollout switch (default off) and
  // period in calendar months (1-24, default 6).
  inactivityRuleEnabled?: boolean;
  inactivityMonths?: number;
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
  // Welcome gift switch (treatment fee + CBCT waived once per
  // practitioner, on their next submitted case). Optional until every backend
  // serving this UI returns it; the form treats a missing value as on.
  welcomeGiftEnabled?: boolean;
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

/**
 * PUT /admin/company-billing-settings. Partial: an omitted (undefined) field
 * keeps its stored value. For the optional text fields (address … website
 * domain) an empty string "" CLEARS the stored value (stored as null).
 * Numbers and booleans are only ever "set" or "unchanged".
 */
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
  /** "Droit de timbre" — fiscal stamp added to every payment. */
  stampDuty?: number;
  /** Retenue à la source (%), 0 to 99.99, 2 decimals. */
  withholdingRate?: number;
  /** Retenue master switch (spec §4); on needs a rate above 0 (else 400). */
  withholdingEnabled?: boolean;
  /** Retenue threshold, ≥ 0, 3 decimals (spec §4). */
  withholdingThreshold?: number;
  /** Doctor inactivity rule switch and period, whole months 1-24 (spec §5). */
  inactivityRuleEnabled?: boolean;
  inactivityMonths?: number;
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
  /**
   * Welcome gift switch (once per practitioner). Saved on its own by the
   * gift card's instant switch; the form's Save leaves it out.
   */
  welcomeGiftEnabled?: boolean;
  defaultCurrency?: string;
  devisPrefix?: string;
  devisNextNumber?: number;
  legalTextTranslations?: TranslatedTexts;
  footerTextTranslations?: TranslatedTexts;
  bankDetails?: BankDetails;
  isActive?: boolean;
}

/**
 * A fiscal or rollout setting journaled on every change
 * (BillingSettingsAuditLog.field, backend billing-settings-audit.ts).
 */
export type BillingSettingsAuditField =
  | 'withholdingEnabled'
  | 'withholdingRate'
  | 'withholdingThreshold'
  | 'stampDuty'
  | 'defaultTvaRate'
  | 'inactivityRuleEnabled'
  | 'inactivityMonths';

/**
 * One change of a fiscal or rollout setting, from
 * GET /admin/company-billing-settings/history (newest first). `before` /
 * `after` are JSON scalars: booleans for switches, an integer for the
 * months, decimal strings for rates and amounts ("1000.000", "1.00");
 * `before` is null for the initial value.
 */
export interface BillingSettingsAuditEntry {
  id: string;
  field: BillingSettingsAuditField | string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
  /** The admin's name at the time; null for a system write. */
  actorName: string | null;
  /** ISO 8601 (UTC); shown in Africa/Tunis. */
  createdAt: string;
}

export interface BillingSettingsHistoryPage {
  data: BillingSettingsAuditEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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
  /**
   * Droit de timbre added to each payment, frozen at send time (TND, 3
   * dp). Absent from snapshots made before 2026-11-20: readers fall back
   * to the live settings.
   */
  stampDuty?: number | null;
  /**
   * The retenue à la source rule as the devis was sent (spec §4). Absent
   * from snapshots made before 2026-11-27: readers fall back to the live
   * settings (quote-retenue-estimate.ts).
   */
  withholdingEnabled?: boolean;
  /** Rate in %; 0 = the retenue cannot apply. */
  withholdingRate?: number | null;
  /** Base (TTC, stamp excluded) from which it applies; 0 = every payment. */
  withholdingThreshold?: number | null;
  generatedAt: string;
}

/**
 * Snapshot of the doctor (account + DentistProfile) at quotation-issue
 * time, rebuilt on every draft → sent. The registration number is never
 * copied (a devis does not print it).
 */
export interface QuotationClinicSnapshot {
  doctorId: string;
  doctorFullName: string;
  doctorEmail: string;
  /** The account phone (since 2026-11-27). */
  doctorPhone?: string | null;
  /** The patient, so the PDF header needs no live join (since 2026-11-27). */
  patientFullName?: string | null;
  clinicName?: string | null;
  clinicAddress?: string | null;
  city?: string | null;
  country?: string | null;
  clinicPhone?: string | null;
  clinicEmail?: string | null;
  /** THE contact a devis prints: practice first, account as fallback (since 2026-11-27). */
  contactPhone?: string | null;
  contactEmail?: string | null;
  /** The practitioner's matricule fiscal. */
  taxId?: string | null;
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
  /** Set when the remise was typed as a percentage of the gross (Decimal string). */
  discountPercent?: number | string | null;
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
  treatmentValidityMonths?: number | null;
  isUnlimitedSteps?: boolean | null;
  isUnlimitedCorrections?: boolean | null;
  isForOrthodontists?: boolean | null;
  totalPrice?: string | null;
  paidAmount?: string | null;
  remainingAmount?: string | null;
  paymentMode?: PaymentMode | null;
  paymentStatus?: QuotationPaymentStatus | null;
  doctorApprovedAt?: string | null;
  // Computed on read. `receivedAmount` = what is settled (cash + retenue -
  // stamp), the same figure as paidAmount. A quote can be deleted, recalled or have
  // its pack changed only while nothing was received and nothing is in flight.
  receivedAmount?: number | string | null;
  hasPaymentInFlight?: boolean;
  canDelete?: boolean;
  canRecall?: boolean;
  /**
   * Computed on read: false when the kept installments (paid or
   * cancelled, whose step batches a re-plan never touches) already cover
   * every step of a limited pack, so a re-plan has no step left to give.
   * Missing from older payloads; the plan view then works it out itself.
   */
  freeStepsForReplan?: boolean;
  loyaltyDiscountPercent?: string | null;
  loyaltyDiscountAmount?: string | null;
  loyaltySourceYear?: number | null;
  loyaltySourceQuarter?: number | null;
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
  treatmentValidityMonths?: number | null;
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
  /** A number: the server derives the remise from it. null: typed as an amount. */
  discountPercent?: number | null;
  tvaRate?: number;
  currency?: string;
  notes?: string;
  adminMessage?: string;
}
