-- Add `defaultTreatmentFee` to CompanyBillingSettings so admins can
-- configure the per-quote professional / clinical fee in one place
-- instead of retyping it on every quotation.
--
-- Default 0 preserves the previous behaviour (the existing
-- QuotationService falls back to `dto.treatmentFees ?? 0` on rows
-- where the admin hasn't filled the setting yet).

ALTER TABLE "CompanyBillingSettings"
  ADD COLUMN "defaultTreatmentFee" DECIMAL(12, 3) NOT NULL DEFAULT 0;
