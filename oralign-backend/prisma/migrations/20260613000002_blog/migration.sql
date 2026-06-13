-- ────────────────────────────────────────────────────────────────
-- Practitioner / patient blog (v2) — a small bilingual CMS for the
-- marketing showcase.
--
-- Two tables (BlogImage media library + Blog posts) and two enums
-- (BlogStatus + BlogAudience). v2 changes vs the first cut:
--   • every reader-facing text field is a JSONB Localized<T> bag
--     ({ en, fr }) instead of a scalar String/String[]/Int, so a post
--     carries both languages at once;
--   • `audience` (patient | practitioner) picks which showcase surface
--     the post belongs to;
--   • `views` counts public detail renders.
--
-- The post body is a JSONB object { en: BlogBlock[]; fr: BlogBlock[] };
-- BlogImage mirrors the OrderFile media-optimization columns so the
-- async pipeline ('blog-image' job) can fill variants. Images are
-- shared across both languages.
--
-- NOTE: this project applies schema via `prisma db push` on container
-- start; this file exists so fresh environments + reviewers see the
-- exact DDL, and so prod `migrate deploy` works. There is no real blog
-- data yet, so this migration is the FINAL v2 shape (no in-place
-- column conversion). Every statement is idempotent (IF NOT EXISTS /
-- DO-block guard) so a re-run on a partially-applied DB doesn't error.
-- ────────────────────────────────────────────────────────────────

DO $$
BEGIN
  CREATE TYPE "BlogStatus" AS ENUM ('draft', 'published', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "BlogAudience" AS ENUM ('patient', 'practitioner');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── BlogImage media library (unchanged from v1) ──────────────────
CREATE TABLE IF NOT EXISTS "BlogImage" (
  "id"               TEXT NOT NULL,
  "originalName"     TEXT,
  "generatedName"    TEXT,
  "url"              TEXT NOT NULL,
  "alt"              TEXT,
  "mimeType"         TEXT,
  "sizeBytes"        INTEGER,
  "width"            INTEGER,
  "height"           INTEGER,
  "processingStatus" "MediaProcessingStatus",
  "variants"         JSONB,
  "mediaMetadata"    JSONB,
  "processedAt"      TIMESTAMP(3),
  "createdById"      TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  "deletedAt"        TIMESTAMP(3),
  CONSTRAINT "BlogImage_pkey" PRIMARY KEY ("id")
);

-- ── Blog posts (v2 — bilingual JSONB text fields + audience + views) ─
CREATE TABLE IF NOT EXISTS "Blog" (
  "id"             TEXT NOT NULL,
  "title"          JSONB NOT NULL,                 -- Localized<string>
  "slug"           TEXT NOT NULL,
  "excerpt"        JSONB,                           -- Localized<string>
  "content"        JSONB,                           -- { en: BlogBlock[]; fr: BlogBlock[] }
  "audience"       "BlogAudience" NOT NULL DEFAULT 'practitioner',
  "views"          INTEGER NOT NULL DEFAULT 0,
  "coverImageId"   TEXT,
  "coverImageAlt"  JSONB,                           -- Localized<string>
  "category"       TEXT,
  "authorId"       TEXT,
  "authorName"     TEXT,
  "status"         "BlogStatus" NOT NULL DEFAULT 'draft',
  "seoTitle"       JSONB,                           -- Localized<string>
  "seoDescription" JSONB,                           -- Localized<string>
  "seoKeywords"    JSONB,                           -- Localized<string[]>
  "readingTime"    JSONB,                           -- Localized<number>
  "publishedAt"    TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "deletedAt"      TIMESTAMP(3),
  CONSTRAINT "Blog_pkey" PRIMARY KEY ("id")
);

-- ── Foreign keys (ON DELETE SET NULL — keep posts/images on author
--    removal; keep posts on cover-image removal) ──────────────────
ALTER TABLE "BlogImage"
  ADD CONSTRAINT "BlogImage_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Blog"
  ADD CONSTRAINT "Blog_coverImageId_fkey"
  FOREIGN KEY ("coverImageId") REFERENCES "BlogImage"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Blog"
  ADD CONSTRAINT "Blog_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Unique + hot-path indexes ────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "Blog_slug_key" ON "Blog" ("slug");

CREATE INDEX IF NOT EXISTS "BlogImage_processingStatus_idx"
  ON "BlogImage" ("processingStatus");
CREATE INDEX IF NOT EXISTS "BlogImage_deletedAt_idx"
  ON "BlogImage" ("deletedAt");

-- Public list (newest first), narrowed by audience + status + soft-delete.
CREATE INDEX IF NOT EXISTS "Blog_audience_status_deletedAt_publishedAt_idx"
  ON "Blog" ("audience", "status", "deletedAt", "publishedAt" DESC);
-- Admin status-narrowed list (kept from v1).
CREATE INDEX IF NOT EXISTS "Blog_status_deletedAt_publishedAt_idx"
  ON "Blog" ("status", "deletedAt", "publishedAt" DESC);
CREATE INDEX IF NOT EXISTS "Blog_slug_idx" ON "Blog" ("slug");
CREATE INDEX IF NOT EXISTS "Blog_category_idx" ON "Blog" ("category");
CREATE INDEX IF NOT EXISTS "Blog_authorId_idx" ON "Blog" ("authorId");
CREATE INDEX IF NOT EXISTS "Blog_deletedAt_idx" ON "Blog" ("deletedAt");
