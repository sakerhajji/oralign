-- ─────────────────────────────────────────────────────────────────
-- TreatmentPlan.dentalTreatmentTableImage* (a.k.a. "Traitement dentaire")
-- ─────────────────────────────────────────────────────────────────
-- Mirrors the existing movement-table-image columns. The clinical
-- team uses two separate image artefacts on a treatment plan:
--   1. Orthodontic movement table (movementTableImage*) — already exists.
--   2. Dental treatment table (this migration)             — restorative /
--      endo / extraction plan in image form.
-- Keeping them in separate columns lets the planner upload, replace
-- and delete each one independently without losing the other.
--
-- All four columns are nullable so existing plan rows keep working
-- without a backfill. `IF NOT EXISTS` guards make the migration safe
-- to re-run on a VPS that half-applied previously.

ALTER TABLE "TreatmentPlan"
  ADD COLUMN IF NOT EXISTS "dentalTreatmentTableImagePath" TEXT;

ALTER TABLE "TreatmentPlan"
  ADD COLUMN IF NOT EXISTS "dentalTreatmentTableImageName" TEXT;

ALTER TABLE "TreatmentPlan"
  ADD COLUMN IF NOT EXISTS "dentalTreatmentTableImageMimeType" TEXT;

ALTER TABLE "TreatmentPlan"
  ADD COLUMN IF NOT EXISTS "dentalTreatmentTableImageSizeBytes" INTEGER;
