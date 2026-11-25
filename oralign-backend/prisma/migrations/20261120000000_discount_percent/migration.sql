-- A remise can be typed as a percentage of the gross on a devis or an
-- invoice. The amount stays the figure every total uses; the percentage
-- is kept so the document prints "Remise (10 %)" and later edits of the
-- prices recompute the remise. Null = typed as an amount (all existing rows).
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "discountPercent" DECIMAL(5,2);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "discountPercent" DECIMAL(5,2);
