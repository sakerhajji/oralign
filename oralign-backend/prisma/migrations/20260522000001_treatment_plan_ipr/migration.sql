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
-- The old per-tooth model anchored each slot on the RIGHT-side tooth
-- of the rendered contact. Reverse-derive `fromTooth` from FDI rules:
--
--   FDI render order per arch half (left → right on screen):
--     • Upper right (UR): 18, 17, 16, 15, 14, 13, 12, 11
--     • Upper left  (UL): 21, 22, 23, 24, 25, 26, 27, 28
--     • Lower right (LR): 48, 47, 46, 45, 44, 43, 42, 41
--     • Lower left  (LL): 31, 32, 33, 34, 35, 36, 37, 38
--
--   The "right-side anchor" of each contact is therefore:
--     • UR contacts → anchors 11..17  (NOT 12..18 — tooth 18 is the
--                                      LEFT-most in UR, so it can't be
--                                      a right anchor. v1 of this
--                                      migration had this off-by-one
--                                      bug and broke on prod data
--                                      anchored on tooth 11.)
--     • UL contacts → anchors 22..28
--     • LR contacts → anchors 41..47
--     • LL contacts → anchors 32..38
--     • Midline upper (between UR's 11 and UL's 21) → anchored on 21
--     • Midline lower (between LR's 41 and LL's 31) → anchored on 31
--
--   So fromTooth (left-side neighbour in render order) is:
--     • UR / LR halves  →  fromTooth = anchor + 1
--     • UL / LL halves  →  fromTooth = anchor - 1
--     • Midline upper   →  fromTooth = 11
--     • Midline lower   →  fromTooth = 41
--
-- Each legacy IPR row is attached to the LATEST non-deleted treatment
-- plan for its order — a reasonable default; old rows weren't tied to
-- a specific plan version. The WHERE filter mirrors the CASE so any
-- legacy row anchored on a tooth that CAN'T be a right-side anchor
-- (e.g. 18, 28, 38, 48 — extremities of each half) is skipped here
-- AND preserved by the DELETE below. Those rows are dead data the
-- code no longer reads but are kept on the off chance the team needs
-- to triage them manually.

INSERT INTO "TreatmentPlanIpr" (
  "id", "treatmentPlanId", "fromTooth", "toTooth", "value", "note",
  "createdById", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  tp."id",
  CASE
    WHEN oti."toothNumber" BETWEEN 11 AND 17 THEN oti."toothNumber" + 1
    WHEN oti."toothNumber" BETWEEN 22 AND 28 THEN oti."toothNumber" - 1
    WHEN oti."toothNumber" BETWEEN 41 AND 47 THEN oti."toothNumber" + 1
    WHEN oti."toothNumber" BETWEEN 32 AND 38 THEN oti."toothNumber" - 1
    WHEN oti."toothNumber" = 21 THEN 11
    WHEN oti."toothNumber" = 31 THEN 41
  END                                AS "fromTooth",
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
  -- Mirror the CASE — skip rows we can't map (no NULL fromTooth slips
  -- past the NOT NULL constraint and aborts the migration).
  AND (
    oti."toothNumber" BETWEEN 11 AND 17
    OR oti."toothNumber" BETWEEN 22 AND 28
    OR oti."toothNumber" BETWEEN 41 AND 47
    OR oti."toothNumber" BETWEEN 32 AND 38
    OR oti."toothNumber" IN (21, 31)
  )
ON CONFLICT ("treatmentPlanId", "fromTooth", "toTooth") DO NOTHING;

-- Drop the rows we just migrated. Keep the WHERE clause aligned with
-- the INSERT — orphan rows that couldn't be mapped stay in
-- OrderToothInstruction (the application layer ignores them).
DELETE FROM "OrderToothInstruction"
WHERE "type" = 'ipr_value'
  AND (
    "toothNumber" BETWEEN 11 AND 17
    OR "toothNumber" BETWEEN 22 AND 28
    OR "toothNumber" BETWEEN 41 AND 47
    OR "toothNumber" BETWEEN 32 AND 38
    OR "toothNumber" IN (21, 31)
  );
