-- ─────────────────────────────────────────────────────────────────
-- TreatmentPlanIpr — IPR / stripping moved out of OrderToothInstruction
-- ─────────────────────────────────────────────────────────────────
-- Why: IPR is a between-tooth CONTACT property, not a per-tooth fact.
-- Previously stored as `OrderToothInstruction` rows with type=ipr_value
-- anchored on a single tooth — that abused the per-tooth model and
-- triggered P2002 on concurrent writes because it shared its unique
-- constraint (orderId, toothNumber, type) with the four order-level
-- per-tooth types.
--
-- The new table is scoped to a TreatmentPlan, keyed on the contact
-- pair (fromTooth, toTooth), and writes go through upsert so re-saving
-- the same contact is idempotent.
--
-- All `CREATE … IF NOT EXISTS` / `ON CONFLICT DO NOTHING` so this
-- migration is safe to re-run.

CREATE TABLE IF NOT EXISTS "TreatmentPlanIpr" (
  "id"              TEXT PRIMARY KEY,
  "treatmentPlanId" TEXT NOT NULL,
  "fromTooth"       INTEGER NOT NULL,
  "toTooth"         INTEGER NOT NULL,
  "value"           TEXT NOT NULL,
  "note"            TEXT,
  "createdById"     TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- FKs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TreatmentPlanIpr_treatmentPlanId_fkey'
  ) THEN
    ALTER TABLE "TreatmentPlanIpr"
      ADD CONSTRAINT "TreatmentPlanIpr_treatmentPlanId_fkey"
      FOREIGN KEY ("treatmentPlanId") REFERENCES "TreatmentPlan"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TreatmentPlanIpr_createdById_fkey'
  ) THEN
    ALTER TABLE "TreatmentPlanIpr"
      ADD CONSTRAINT "TreatmentPlanIpr_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Unique contact-point per plan + supporting index
CREATE UNIQUE INDEX IF NOT EXISTS "TreatmentPlanIpr_treatmentPlanId_fromTooth_toTooth_key"
  ON "TreatmentPlanIpr"("treatmentPlanId", "fromTooth", "toTooth");

CREATE INDEX IF NOT EXISTS "TreatmentPlanIpr_treatmentPlanId_idx"
  ON "TreatmentPlanIpr"("treatmentPlanId");

-- ─── Back-fill from legacy OrderToothInstruction.ipr_value rows ───
--
-- The old per-tooth model anchored the slot on the "right" tooth of
-- the rendered contact. Reverse-derive `fromTooth` from FDI rules:
--   • Upper-right half (anchor 12..18) → fromTooth = anchor + 1
--   • Upper-left  half (anchor 22..28) → fromTooth = anchor - 1
--   • Lower-right half (anchor 42..48) → fromTooth = anchor + 1
--   • Lower-left  half (anchor 32..38) → fromTooth = anchor - 1
--   • Upper midline (anchor 21) → fromTooth = 11
--   • Lower midline (anchor 31) → fromTooth = 41
--
-- Attach each legacy IPR row to the LATEST non-deleted treatment plan
-- for its order — a reasonable default; old rows weren't tied to a
-- specific plan version.

INSERT INTO "TreatmentPlanIpr" (
  "id", "treatmentPlanId", "fromTooth", "toTooth", "value", "note",
  "createdById", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  tp."id",
  CASE
    WHEN oti."toothNumber" BETWEEN 12 AND 18 THEN oti."toothNumber" + 1
    WHEN oti."toothNumber" BETWEEN 22 AND 28 THEN oti."toothNumber" - 1
    WHEN oti."toothNumber" BETWEEN 42 AND 48 THEN oti."toothNumber" + 1
    WHEN oti."toothNumber" BETWEEN 32 AND 38 THEN oti."toothNumber" - 1
    WHEN oti."toothNumber" = 21 THEN 11
    WHEN oti."toothNumber" = 31 THEN 41
  END AS "fromTooth",
  oti."toothNumber"                  AS "toTooth",
  COALESCE(NULLIF(oti."value", ''), '0') AS "value",
  oti."note",
  oti."createdById",
  oti."createdAt",
  COALESCE(oti."updatedAt", oti."createdAt")
FROM "OrderToothInstruction" oti
JOIN "DentalOrder" d ON d."id" = oti."orderId"
JOIN LATERAL (
  SELECT "id" FROM "TreatmentPlan"
  WHERE "orderId" = d."id" AND "deletedAt" IS NULL
  ORDER BY "version" DESC
  LIMIT 1
) tp ON TRUE
WHERE oti."type" = 'ipr_value'
ON CONFLICT ("treatmentPlanId", "fromTooth", "toTooth") DO NOTHING;

-- Drop the now-migrated legacy rows from OrderToothInstruction so
-- subsequent reads + writes only see them in the new home.
DELETE FROM "OrderToothInstruction" WHERE "type" = 'ipr_value';
