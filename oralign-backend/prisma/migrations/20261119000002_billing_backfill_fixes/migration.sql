-- Fixes to the backfill of 20261119000001_billing_ttc_withholding (review
-- of the billing rework, 2026-11-19). Data only, no schema change.

-- 1. Synthetic transaction ids are not payment references. A cash, cheque
-- or bank-transfer payment recorded without a reference gets a generated
-- "cash_<uuid>" / "cheque_<uuid>" / "bank_<uuid>" (and "mock_cb_<uuid>" in
-- development) only to keep Payment.transactionId filled. The previous
-- migration copied those into Invoice.paymentReference, so the facture
-- printed "Réf. cash_1b9d…". Same pattern as
-- src/invoices/services/payment-reference.ts: keep both in step.
UPDATE "Invoice"
SET "paymentReference" = NULL
WHERE "paymentReference" ~ '^(cash|cheque|bank|mock_cb)_[0-9a-f-]{36}$';

-- 2. Pack quotes had their TVA split rewritten by the previous migration
-- (HT + TVA 19 % = TTC instead of TVA 0 %), but their stored devis PDF was
-- rendered before that and still prints "Sous-total HT = Total TTC" with
-- no TVA line. The raw UPDATE did not touch "updatedAt", so nothing could
-- tell the file is stale. Dropping the pointer makes the next download
-- (GET quotations/:id/pdf) render the devis again, in the quote's own
-- language, from the corrected figures. The old file is overwritten at
-- the same path by that render.
UPDATE "Quotation"
SET "pdfFilePath" = NULL
WHERE "packId" IS NOT NULL
  AND "deletedAt" IS NULL
  AND "pdfFilePath" IS NOT NULL;
