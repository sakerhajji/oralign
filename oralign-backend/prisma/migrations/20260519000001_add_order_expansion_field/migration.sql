-- Add expansion field to DentalOrder. Additive, nullable — existing rows
-- are unaffected. The dentist wizard writes a short structured string
-- here (e.g. "Both — anterior priority") or "No expansion" when none is
-- planned.
ALTER TABLE "DentalOrder" ADD COLUMN "expansion" TEXT;
