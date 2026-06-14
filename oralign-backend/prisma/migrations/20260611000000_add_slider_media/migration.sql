-- Dashboard slider media (admin-curated hero images / videos).
--
-- WHY THIS MIGRATION EXISTS:
-- The `SliderMedia` table was originally introduced via `prisma db push`
-- (the project's dev workflow) and was never captured as a migration. As a
-- result `prisma migrate deploy` on a fresh database never created it, and
-- the later media-optimization migration (20260612000001) failed with
-- `relation "SliderMedia" does not exist` while trying to ALTER it. This
-- migration backfills the CREATE so the migration chain is self-consistent.
-- It is ordered (timestamp) BEFORE 20260612000001 so the table exists when
-- that migration adds the `desktopVariants` / `mobileVariants` columns —
-- which is exactly why those two columns are intentionally NOT created here.
--
-- Idempotent (DO-block enum guards + IF NOT EXISTS) so it is also safe to
-- run against a database that already received the table via `db push`.

-- ── Enums ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "SliderMediaType" AS ENUM ('image', 'video');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "SliderMediaSourceType" AS ENUM ('upload', 'external');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "SliderMediaDeviceTarget" AS ENUM ('desktop', 'mobile');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "SliderMediaStatus" AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Table ───────────────────────────────────────────────────────────────
-- NOTE: desktopVariants / mobileVariants (JSONB) are deliberately omitted —
-- 20260612000001_add_media_optimization_fields adds them.
CREATE TABLE IF NOT EXISTS "SliderMedia" (
  "id"            TEXT NOT NULL,
  "title"         TEXT NOT NULL,
  "mediaType"     "SliderMediaType" NOT NULL,
  "sourceType"    "SliderMediaSourceType" NOT NULL,
  "desktopUrl"    TEXT,
  "mobileUrl"     TEXT,
  "deviceTargets" "SliderMediaDeviceTarget"[],
  "status"        "SliderMediaStatus" NOT NULL DEFAULT 'active',
  "displayOrder"  INTEGER NOT NULL DEFAULT 0,
  "linkUrl"       TEXT,
  "createdById"   TEXT,
  "deletedAt"     TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SliderMedia_pkey" PRIMARY KEY ("id")
);

-- ── Indexes ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "SliderMedia_status_deletedAt_displayOrder_idx"
  ON "SliderMedia" ("status", "deletedAt", "displayOrder");
CREATE INDEX IF NOT EXISTS "SliderMedia_deletedAt_displayOrder_idx"
  ON "SliderMedia" ("deletedAt", "displayOrder");

-- ── Foreign key (audit author; SetNull so deleting the user keeps the slide)
DO $$ BEGIN
  ALTER TABLE "SliderMedia"
    ADD CONSTRAINT "SliderMedia_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
