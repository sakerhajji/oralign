-- Catch-up migration: schema.prisma had drifted ahead of the committed
-- migrations, so `prisma migrate deploy` (used in production) never created
-- these columns — which made `prisma.dentalOrder.findMany()` fail in prod
-- with "column DentalOrder.termsAcceptedAt does not exist" (orders 500).
-- All changes are additive / nullable (safe on live data). Generated from
-- `prisma migrate diff` (committed migrations -> current schema).

-- Company legal identity fields (Mentions légales / compliance pages).
ALTER TABLE "CompanyBillingSettings" ADD COLUMN     "hostingProvider" TEXT,
ADD COLUMN     "hostingProviderUrl" TEXT,
ADD COLUMN     "legalForm" TEXT,
ADD COLUMN     "registreDeCommerce" TEXT,
ADD COLUMN     "tradeName" TEXT,
ADD COLUMN     "websiteDomain" TEXT;

-- General Terms & Conditions acceptance stamp on order submit.
ALTER TABLE "DentalOrder" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3);

-- Email-verification code + expiry.
ALTER TABLE "User" ADD COLUMN     "emailVerificationCode" TEXT,
ADD COLUMN     "emailVerificationExpiry" TIMESTAMP(3);

-- `updatedAt` is managed by Prisma (@updatedAt) in the app layer; drop the
-- residual DB-level DEFAULT so the column matches the schema. No data change.
ALTER TABLE "Pack" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "PackPrice" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Payment" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "QuoteInstallment" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "QuoteStepBatch" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "TreatmentPlanIpr" ALTER COLUMN "updatedAt" DROP DEFAULT;
