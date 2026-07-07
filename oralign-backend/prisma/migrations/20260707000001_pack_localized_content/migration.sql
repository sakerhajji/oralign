-- Pack: localized content bags (Localized<string> = { fr, en? }) stored
-- as JSONB, mirroring the Blog model's localized-content pattern.
--
-- Fully ADDITIVE + NULLABLE so existing packs and quotations keep working
-- untouched: the plain `name` / `description` columns stay as the French
-- fallback. No example/default packs are created here — the backfill only
-- copies each EXISTING pack's current name/description into its FR bag.
--
-- Guarded with IF NOT EXISTS so re-application (Prisma `db push` on
-- container boot, or a manual re-run) is a safe no-op.

ALTER TABLE "Pack" ADD COLUMN IF NOT EXISTS "nameI18n" JSONB;
ALTER TABLE "Pack" ADD COLUMN IF NOT EXISTS "descriptionI18n" JSONB;
ALTER TABLE "Pack" ADD COLUMN IF NOT EXISTS "treatmentExpirationLabel" JSONB;
ALTER TABLE "Pack" ADD COLUMN IF NOT EXISTS "finishingIncludedLabel" JSONB;

-- Backfill the FR bag from the legacy plain columns for rows that predate
-- the localized fields. Touches ONLY existing rows; creates nothing.
UPDATE "Pack"
  SET "nameI18n" = jsonb_build_object('fr', "name")
  WHERE "nameI18n" IS NULL AND "name" IS NOT NULL;

UPDATE "Pack"
  SET "descriptionI18n" = jsonb_build_object('fr', "description")
  WHERE "descriptionI18n" IS NULL
    AND "description" IS NOT NULL
    AND "description" <> '';
