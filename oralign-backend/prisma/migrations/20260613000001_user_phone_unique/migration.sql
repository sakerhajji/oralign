-- Make User.phone unique (NULLs remain non-unique in Postgres, so users
-- without a phone are unaffected — only a SET phone must be unique).
--
-- NOTE: schema is applied via `prisma db push` on container start; this
-- file documents the DDL for fresh setups / reviewers. Safe to keep
-- alongside db push (push diffs the live schema, not a migrations table).
--
-- Drops the old non-unique index if present, then adds the unique one.
DROP INDEX IF EXISTS "User_phone_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_key" ON "User"("phone");
