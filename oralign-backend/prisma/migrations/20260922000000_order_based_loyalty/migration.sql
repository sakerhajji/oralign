-- Convert loyalty qualification from approved pack quotations to eligible
-- completed orders without destroying the legacy quarterly snapshots.

CREATE TYPE "LoyaltyCalculationBasis" AS ENUM (
  'approved_quotes_v1',
  'completed_orders_v2'
);

ALTER TABLE "Quotation"
  ADD COLUMN "loyaltySourceYear" INTEGER,
  ADD COLUMN "loyaltySourceQuarter" INTEGER;

ALTER TABLE "LoyaltyQuarterResult"
  ADD COLUMN "excludedDiscountedOrderCount" INTEGER,
  ADD COLUMN "calculationBasis" "LoyaltyCalculationBasis" NOT NULL DEFAULT 'approved_quotes_v1',
  ADD COLUMN "tierSnapshot" JSONB,
  ADD COLUMN "legacyTreatmentCount" INTEGER,
  ADD COLUMN "legacyDiscountPercent" DECIMAL(5,2);

-- Preserve the previous approved-quotation calculation before v2 lazily
-- recalculates each finished quarter from the real order source data.
UPDATE "LoyaltyQuarterResult"
SET
  "legacyTreatmentCount" = "treatmentCount",
  "legacyDiscountPercent" = "discountPercent"
WHERE "legacyTreatmentCount" IS NULL;

CREATE INDEX "DentalOrder_status_createdAt_deletedAt_idx"
  ON "DentalOrder"("status", "createdAt", "deletedAt");

ALTER TABLE "Quotation"
  ADD CONSTRAINT "Quotation_loyaltySourceQuarter_check"
  CHECK (
    "loyaltySourceQuarter" IS NULL
    OR "loyaltySourceQuarter" BETWEEN 1 AND 4
  );

ALTER TABLE "Quotation"
  ADD CONSTRAINT "Quotation_loyaltySource_pair_check"
  CHECK (
    ("loyaltySourceYear" IS NULL) = ("loyaltySourceQuarter" IS NULL)
  );
