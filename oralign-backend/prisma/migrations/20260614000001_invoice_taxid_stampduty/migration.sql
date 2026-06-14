-- Invoice billing fields: doctor matricule fiscal + company droit de timbre.
--
-- Both statements are idempotent (ADD COLUMN IF NOT EXISTS) so this is
-- safe to apply on top of a database that already had the columns pushed
-- by `prisma db push` on a dev container boot.

-- DentistProfile.taxId — the DOCTOR's clinic "Matricule fiscal" (tax
-- registration number). Distinct from the COMPANY's
-- CompanyBillingSettings.taxRegistrationNumber.
ALTER TABLE "DentistProfile" ADD COLUMN IF NOT EXISTS "taxId" TEXT;

-- CompanyBillingSettings.stampDuty — "Droit de timbre" (Tunisian fiscal
-- stamp, typically 1.000 TND) added to the invoice total.
ALTER TABLE "CompanyBillingSettings" ADD COLUMN IF NOT EXISTS "stampDuty" DECIMAL(12,3) NOT NULL DEFAULT 1;
