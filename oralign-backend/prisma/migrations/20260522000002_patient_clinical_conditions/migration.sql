-- ─────────────────────────────────────────────────────────────────
-- Patient.clinicalConditions + clinicalConditionsOther
-- ─────────────────────────────────────────────────────────────────
-- Why a String[] column rather than a Postgres ENUM array:
--   The clinical team will probably add labels over time (eg. they
--   already asked for "Unesthetic smile" and "Dental shape anomaly"
--   on top of the orthodontic-classification labels). A free TEXT[]
--   lets them grow the list with a single frontend release; an ENUM
--   would force a migration every time. The frontend constrains
--   submissions to a known list so we still get consistent values
--   for analytics.
--
--   `clinicalConditionsOther` carries the free-text detail typed
--   when the planner ticks "Other". Kept NULL otherwise.
--
-- Both columns are nullable / defaulted so the migration is safe to
-- apply on existing patient rows: existing rows get an empty array
-- and a NULL "other" field, which matches the no-conditions state.
-- `IF NOT EXISTS` makes the migration safe to re-run if it half-
-- applied on a VPS (mirrors the pattern used by the TreatmentPlanIpr
-- migration alongside it).

ALTER TABLE "Patient"
  ADD COLUMN IF NOT EXISTS "clinicalConditions" TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE "Patient"
  ADD COLUMN IF NOT EXISTS "clinicalConditionsOther" TEXT;
