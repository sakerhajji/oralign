-- AlterTable
ALTER TABLE "Pack" ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;

-- Start from the order practitioners already see (oldest pack first).
UPDATE "Pack" AS p
SET "displayOrder" = ranked.position
FROM (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS position
  FROM "Pack"
) AS ranked
WHERE p."id" = ranked."id";
