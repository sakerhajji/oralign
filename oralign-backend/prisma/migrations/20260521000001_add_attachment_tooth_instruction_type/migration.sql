-- Add `attachment` to the ToothInstructionType enum.
--
-- Postgres requires `ALTER TYPE … ADD VALUE` to run OUTSIDE a
-- transaction block. Prisma normally wraps each migration file in a
-- single transaction; for this specific operation we either need to
-- run BEFORE COMMIT or split into its own migration that just adds
-- the value. Since this migration ONLY adds the enum value, Prisma's
-- migrate-deploy will execute it cleanly.

ALTER TYPE "ToothInstructionType" ADD VALUE IF NOT EXISTS 'attachment';
