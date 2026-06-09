-- Editable, sequential invoice/receipt number.
-- Purely additive + idempotent so it is safe to apply on a dev database
-- that was previously synced with `db push` (no destructive reset).

-- AlterTable: the printed receipt number (e.g. FAC-000001). Nullable for
-- pending/legacy rows; allocated lazily on first successful-receipt render.
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "invoiceNumber" TEXT;

-- CreateIndex: two receipts must never share a printed number.
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_invoiceNumber_key" ON "Payment"("invoiceNumber");

-- AlterTable: sequential invoice-number counter (mirrors the devis counter).
ALTER TABLE "CompanyBillingSettings" ADD COLUMN IF NOT EXISTS "invoicePrefix" TEXT NOT NULL DEFAULT 'FAC';
ALTER TABLE "CompanyBillingSettings" ADD COLUMN IF NOT EXISTS "invoiceNextNumber" INTEGER NOT NULL DEFAULT 1;
