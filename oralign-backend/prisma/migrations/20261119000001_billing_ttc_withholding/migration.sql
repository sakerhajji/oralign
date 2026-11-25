-- Billing rework (2026-11-19). Prices are TTC with TVA and the stamp
-- included; a practitioner may apply a retenue à la source when paying;
-- every payment produces a FACTURE that states its payment method.

-- Retenue à la source rate (%), 0 = never offered.
ALTER TABLE "CompanyBillingSettings"
  ADD COLUMN IF NOT EXISTS "withholdingRate" DECIMAL(5,2) NOT NULL DEFAULT 1;

-- A payment keeps the cash it collected in "amount"; the withholding is
-- what the practitioner kept back. amount + withholdingAmount = TTC due.
ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "withholdingRate" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "withholdingAmount" DECIMAL(12,3) NOT NULL DEFAULT 0;

-- Same snapshot for the treatment fee, which lives on the order.
ALTER TABLE "DentalOrder"
  ADD COLUMN IF NOT EXISTS "treatmentFeeWithholdingRate" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "treatmentFeeWithholdingAmount" DECIMAL(12,3);

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "pricesIncludeTax" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "paymentMethod" "PaymentMethod",
  ADD COLUMN IF NOT EXISTS "paymentReference" TEXT,
  ADD COLUMN IF NOT EXISTS "withholdingRate" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "withholdingAmount" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "netPayable" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "treatmentFeeOrderId" TEXT,
  ADD COLUMN IF NOT EXISTS "emailedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emailedTo" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_treatmentFeeOrderId_key"
  ON "Invoice"("treatmentFeeOrderId");

ALTER TABLE "InvoiceLine"
  ADD COLUMN IF NOT EXISTS "unitPriceTtc" DECIMAL(12,3);

-- Existing invoices carried no withholding: what is paid is the total.
UPDATE "Invoice" SET "netPayable" = "totalTtc";

-- Automatic invoices inherit the method and reference of their payment.
UPDATE "Invoice" AS i
SET "paymentMethod" = p."paymentMethod",
    "paymentReference" = COALESCE(i."paymentReference", p."transactionId")
FROM "Payment" AS p
WHERE i."paymentId" = p."id" AND i."paymentMethod" IS NULL;

-- Pack quotes were stored at TVA 0 % although their price includes TVA.
-- Give them the company rate and split the TTC backwards, so the screen
-- and the remaining invoices show HT + TVA = TTC. Amounts due and the
-- installment plan are unchanged. Invoices already issued are left as
-- they are: they are fiscal documents.
UPDATE "Quotation" AS q
SET "tvaRate" = r.rate,
    "subTotalHt" = ROUND(("totalTtc" / (1 + r.rate / 100))::numeric, 3)::double precision,
    "tvaAmount" = ("totalTtc"::numeric
                   - ROUND(("totalTtc" / (1 + r.rate / 100))::numeric, 3))::double precision
FROM (
  SELECT COALESCE(
    (SELECT "defaultTvaRate" FROM "CompanyBillingSettings"
     WHERE "isActive" = true ORDER BY "updatedAt" DESC LIMIT 1),
    19
  ) AS rate
) AS r
WHERE q."packId" IS NOT NULL
  AND q."tvaRate" = 0
  AND q."deletedAt" IS NULL
  AND r.rate > 0;
