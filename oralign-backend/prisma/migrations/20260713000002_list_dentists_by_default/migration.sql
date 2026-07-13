-- Public practitioner directory is opt-OUT: approved, active partner clinics
-- are listed by default and can hide themselves from the clinic settings.
ALTER TABLE "DentistProfile" ALTER COLUMN "isListedPublicly" SET DEFAULT true;

-- Backfill existing clinics that were created under the previous opt-in
-- default (only approved + active + non-deleted ones — the public query
-- filters on those anyway, so this just makes them visible now).
UPDATE "DentistProfile" dp SET "isListedPublicly" = true
FROM "User" u
WHERE u.id = dp."userId"
  AND dp."deletedAt" IS NULL
  AND u."verificationStatus" = 'approved'
  AND u."isActive" = true
  AND dp."isListedPublicly" = false;
