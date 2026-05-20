-- ─────────────────────────────────────────
-- Quotation / Devis + Company billing settings.
--
-- Adds:
--   • enum  "DevisLanguage"    (fr | en | ar)
--   • enum  "QuotationStatus"  (draft | sent | approved | rejected | canceled)
--   • table "CompanyBillingSettings" — singleton-style admin config
--   • table "Quotation"        — one row per order (unique on orderId)
--
-- companySnapshot / clinicSnapshot are JSONB so old PDFs / summaries
-- stay accurate after the admin edits company info or the doctor edits
-- their clinic profile later.
-- ─────────────────────────────────────────

-- ── Enums ─────────────────────────────────
CREATE TYPE "DevisLanguage"   AS ENUM ('fr', 'en', 'ar');
CREATE TYPE "QuotationStatus" AS ENUM ('draft', 'sent', 'approved', 'rejected', 'canceled');

-- ── CompanyBillingSettings ───────────────
CREATE TABLE "CompanyBillingSettings" (
    "id"                      TEXT NOT NULL,
    "companyName"             TEXT NOT NULL,
    "companyLogoPath"         TEXT,
    "companyAddress"          TEXT,
    "companyCity"             TEXT,
    "companyCountry"          TEXT,
    "companyPhone"            TEXT,
    "companyEmail"            TEXT,
    "taxRegistrationNumber"   TEXT,
    "defaultTvaRate"          DOUBLE PRECISION NOT NULL DEFAULT 19,
    "defaultCurrency"         TEXT NOT NULL DEFAULT 'TND',
    "devisPrefix"             TEXT NOT NULL DEFAULT 'DEV',
    "devisNextNumber"         INTEGER NOT NULL DEFAULT 1,
    "legalTextTranslations"   JSONB,
    "footerTextTranslations"  JSONB,
    "bankDetails"             JSONB,
    "isActive"                BOOLEAN NOT NULL DEFAULT true,
    "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"               TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyBillingSettings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CompanyBillingSettings_isActive_idx"
    ON "CompanyBillingSettings"("isActive");

-- ── Quotation ────────────────────────────
CREATE TABLE "Quotation" (
    "id"                 TEXT NOT NULL,
    "orderId"            TEXT NOT NULL,
    "quotationNumber"    TEXT,
    "language"           "DevisLanguage"   NOT NULL DEFAULT 'fr',
    "status"             "QuotationStatus" NOT NULL DEFAULT 'draft',
    "treatmentFees"      DOUBLE PRECISION  NOT NULL DEFAULT 0,
    "fabricationFees"    DOUBLE PRECISION  NOT NULL DEFAULT 0,
    "deliveryFees"       DOUBLE PRECISION  NOT NULL DEFAULT 0,
    "discountAmount"     DOUBLE PRECISION  NOT NULL DEFAULT 0,
    "subTotalHt"         DOUBLE PRECISION  NOT NULL DEFAULT 0,
    "tvaRate"            DOUBLE PRECISION  NOT NULL DEFAULT 19,
    "tvaAmount"          DOUBLE PRECISION  NOT NULL DEFAULT 0,
    "totalTtc"           DOUBLE PRECISION  NOT NULL DEFAULT 0,
    "currency"           TEXT              NOT NULL DEFAULT 'TND',
    "notes"              TEXT,
    "adminMessage"       TEXT,
    "companySnapshot"    JSONB,
    "clinicSnapshot"     JSONB,
    "pdfFilePath"        TEXT,
    "sentAt"             TIMESTAMP(3),
    "approvedAt"         TIMESTAMP(3),
    "rejectedAt"         TIMESTAMP(3),
    "rejectionReason"    TEXT,
    "createdById"        TEXT NOT NULL,
    "approvedById"       TEXT,
    "rejectedById"       TEXT,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    "deletedAt"          TIMESTAMP(3),

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- One quotation per order (cancelled rows still occupy the slot — admin
-- must `cancel + recreate` to re-issue, matching the documented UX).
CREATE UNIQUE INDEX "Quotation_orderId_key"          ON "Quotation"("orderId");
CREATE UNIQUE INDEX "Quotation_quotationNumber_key"  ON "Quotation"("quotationNumber");
CREATE INDEX "Quotation_orderId_idx"   ON "Quotation"("orderId");
CREATE INDEX "Quotation_status_idx"    ON "Quotation"("status");
CREATE INDEX "Quotation_language_idx"  ON "Quotation"("language");
CREATE INDEX "Quotation_deletedAt_idx" ON "Quotation"("deletedAt");
CREATE INDEX "Quotation_createdAt_idx" ON "Quotation"("createdAt");

-- ── Foreign keys ─────────────────────────
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "DentalOrder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_rejectedById_fkey"
    FOREIGN KEY ("rejectedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
