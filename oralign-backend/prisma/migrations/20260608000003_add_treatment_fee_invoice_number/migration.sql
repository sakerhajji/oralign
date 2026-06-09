-- Treatment-fee receipt numbering — a separate `TF-` sequence from the
-- installment `FAC-` invoices. Additive + idempotent (safe on a
-- db-push'd dev database; no destructive reset).

-- AlterTable: the printed treatment-fee receipt number on the order.
ALTER TABLE "DentalOrder" ADD COLUMN IF NOT EXISTS "treatmentFeeInvoiceNumber" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "DentalOrder_treatmentFeeInvoiceNumber_key" ON "DentalOrder"("treatmentFeeInvoiceNumber");

-- AlterTable: the separate treatment-fee invoice counter.
ALTER TABLE "CompanyBillingSettings" ADD COLUMN IF NOT EXISTS "treatmentFeeInvoicePrefix" TEXT NOT NULL DEFAULT 'TF';
ALTER TABLE "CompanyBillingSettings" ADD COLUMN IF NOT EXISTS "treatmentFeeInvoiceNextNumber" INTEGER NOT NULL DEFAULT 1;
