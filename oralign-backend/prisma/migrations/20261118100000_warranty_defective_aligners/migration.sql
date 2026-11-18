-- A warranty claim can name several defective aligners (for example 1, 2 and 4).
ALTER TABLE "SupplementalOrderRequest"
  ADD COLUMN "defectiveAligners" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

-- Existing claims named one aligner, in the replacement column.
UPDATE "SupplementalOrderRequest" AS request
SET "defectiveAligners" = ARRAY[request."replacementFromAligner"]
FROM "DentalOrder" AS child
WHERE child."id" = request."orderId"
  AND child."orderType" = 'warranty'
  AND request."replacementFromAligner" IS NOT NULL;
