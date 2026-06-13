-- ────────────────────────────────────────────────────────────────
-- Practitioner blog — a small CMS for the marketing showcase.
--
-- Two tables (BlogImage media library + Blog posts) and one enum
-- (BlogStatus). The post body is a JSONB array of typed content
-- blocks; BlogImage mirrors the OrderFile media-optimization columns
-- so the async pipeline ('blog-image' job) can fill variants.
--
-- NOTE: this project applies schema via `prisma db push` on container
-- start; this file exists so fresh environments + reviewers see the
-- exact DDL, and so prod `migrate deploy` works. Every statement is
-- idempotent (IF NOT EXISTS / DO-block guard) so a re-run on a
-- partially-applied DB doesn't error.
-- ────────────────────────────────────────────────────────────────

DO $$
BEGIN
  CREATE TYPE "BlogStatus" AS ENUM ('draft', 'published', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── BlogImage media library ──────────────────────────────────────
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

-- ── Blog posts ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Blog" (
  "id"             TEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "slug"           TEXT NOT NULL,
  "excerpt"        TEXT,
  "content"        JSONB,
  "coverImageId"   TEXT,
  "coverImageAlt"  TEXT,
  "category"       TEXT,
  "authorId"       TEXT,
  "authorName"     TEXT,
  "status"         "BlogStatus" NOT NULL DEFAULT 'draft',
  "seoTitle"       TEXT,
  "seoDescription" TEXT,
  "seoKeywords"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "readingTime"    INTEGER,
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

CREATE INDEX IF NOT EXISTS "Blog_status_deletedAt_publishedAt_idx"
  ON "Blog" ("status", "deletedAt", "publishedAt" DESC);
CREATE INDEX IF NOT EXISTS "Blog_slug_idx" ON "Blog" ("slug");
CREATE INDEX IF NOT EXISTS "Blog_category_idx" ON "Blog" ("category");
CREATE INDEX IF NOT EXISTS "Blog_authorId_idx" ON "Blog" ("authorId");
CREATE INDEX IF NOT EXISTS "Blog_deletedAt_idx" ON "Blog" ("deletedAt");
