-- Catch-up migration: schema.prisma had drifted ahead of the committed
-- migrations, so `prisma migrate deploy` (used in production) never created
-- termsAcceptedAt / the legal columns — prisma.dentalOrder.findMany() then
-- failed in prod with "column DentalOrder.termsAcceptedAt does not exist"
-- (orders page 500).
--
-- IDEMPOTENT ON PURPOSE: some environments were previously `db push`-ed and
-- already have a subset of these columns (e.g. User.emailVerificationCode),
-- so every ADD uses IF NOT EXISTS and can be safely (re-)applied on any DB
-- state. All changes are additive / nullable — no data is touched.

-- Company legal identity fields (Mentions légales / compliance pages).
ALTER TABLE "CompanyBillingSettings"
  ADD COLUMN IF NOT EXISTS "hostingProvider" TEXT,
  ADD COLUMN IF NOT EXISTS "hostingProviderUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "legalForm" TEXT,
  ADD COLUMN IF NOT EXISTS "registreDeCommerce" TEXT,
  ADD COLUMN IF NOT EXISTS "tradeName" TEXT,
  ADD COLUMN IF NOT EXISTS "websiteDomain" TEXT;

-- General Terms & Conditions acceptance stamp on order submit.
ALTER TABLE "DentalOrder"
  ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);

-- Email-verification code + expiry.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "emailVerificationCode" TEXT,
  ADD COLUMN IF NOT EXISTS "emailVerificationExpiry" TIMESTAMP(3);

-- `updatedAt` is managed by Prisma (@updatedAt) in the app layer; drop the
-- residual DB-level DEFAULT so the column matches the schema. DROP DEFAULT is
-- a no-op when there is no default, so this is safe to (re-)apply.
ALTER TABLE "Pack" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "PackPrice" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Payment" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "QuoteInstallment" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "QuoteStepBatch" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "TreatmentPlanIpr" ALTER COLUMN "updatedAt" DROP DEFAULT;
