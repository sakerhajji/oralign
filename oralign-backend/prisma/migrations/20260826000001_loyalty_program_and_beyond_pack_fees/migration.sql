-- Loyalty program (grille 2026) + beyond-the-pack price list.
--
-- Purely ADDITIVE: two new tables, two snapshot columns on Quotation,
-- five columns on CompanyBillingSettings. No column is dropped, no
-- existing row is touched, every new column is nullable or defaulted.
--
-- Referential actions follow DELETION-POLICY.md: a closed loyalty
-- quarter backs the discounts of issued quotes, so the doctor FK is
-- RESTRICT — results must be purged explicitly before a practitioner
-- hard-delete. Tiers are standalone admin-editable rows; closed
-- quarters snapshot the awarded percent as literal values, so tier
-- edits never rewrite history.

-- Quotation: loyalty discount snapshot (frozen at pack-attach time).
ALTER TABLE "Quotation"
  ADD COLUMN "loyaltyDiscountPercent" DECIMAL(5,2),
  ADD COLUMN "loyaltyDiscountAmount" DECIMAL(12,3);

-- CompanyBillingSettings: beyond-the-pack tariffs + program switch.
ALTER TABLE "CompanyBillingSettings"
  ADD COLUMN "refinementTwoArchesFee" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN "refinementSingleArchFee" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN "replacementAlignerFee" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN "retainersFee" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Admin-editable loyalty tiers.
CREATE TABLE "LoyaltyTier" (
  "id" TEXT NOT NULL,
  "minTreatments" INTEGER NOT NULL,
  "discountPercent" DECIMAL(5,2) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LoyaltyTier_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoyaltyTier_isActive_minTreatments_idx"
  ON "LoyaltyTier"("isActive", "minTreatments");

-- Closed quarters, one row per (doctor, year, quarter).
CREATE TABLE "LoyaltyQuarterResult" (
  "id" TEXT NOT NULL,
  "doctorId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "quarter" INTEGER NOT NULL,
  "treatmentCount" INTEGER NOT NULL,
  "tierMinTreatments" INTEGER,
  "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LoyaltyQuarterResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoyaltyQuarterResult_doctorId_year_quarter_key"
  ON "LoyaltyQuarterResult"("doctorId", "year", "quarter");

CREATE INDEX "LoyaltyQuarterResult_year_quarter_idx"
  ON "LoyaltyQuarterResult"("year", "quarter");

ALTER TABLE "LoyaltyQuarterResult"
  ADD CONSTRAINT "LoyaltyQuarterResult_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
