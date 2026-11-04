-- Welcome gift, new rule: every practitioner gets it ONCE, on the next case
-- they submit (a new practitioner's first case, a current practitioner's
-- next one). "User"."welcomeGiftUsedAt" is the doctor mark: set in the
-- submit transaction when the gift lands on one of their cases, never
-- cleared automatically. "DentalOrder"."welcomeGiftFirstCase" says whether
-- the gifted case was the doctor's very first submitted case (it only
-- drives the copy shown to the doctor).
-- Additive and idempotent: safe under `prisma migrate deploy` on prod and on
-- dev databases that already received the columns. Cases submitted before
-- are never repriced; the two UPDATEs below only bring the new columns in
-- line with the gifts already applied under the first-case rule.

-- ── User: the doctor mark ──────────────────────────────────────────
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "welcomeGiftUsedAt" TIMESTAMP(3);

-- ── DentalOrder: was the gifted case the doctor's first one? ───────
ALTER TABLE "DentalOrder"
  ADD COLUMN IF NOT EXISTS "welcomeGiftFirstCase" BOOLEAN NOT NULL DEFAULT false;

-- A doctor who already holds a gift is marked with the moment it was
-- applied. At most one gift order per doctor (partial unique index
-- "DentalOrder_welcome_gift_doctor_key", kept as is), so the join is 1:1.
UPDATE "User" u SET "welcomeGiftUsedAt" = o."welcomeGiftAppliedAt"
  FROM "DentalOrder" o
 WHERE o."doctorId" = u.id
   AND o."welcomeGiftAppliedAt" IS NOT NULL
   AND u."welcomeGiftUsedAt" IS NULL;

-- The first-case rule only ever gifted a doctor's first case.
UPDATE "DentalOrder" SET "welcomeGiftFirstCase" = true
 WHERE "welcomeGiftAppliedAt" IS NOT NULL
   AND "welcomeGiftFirstCase" = false;
