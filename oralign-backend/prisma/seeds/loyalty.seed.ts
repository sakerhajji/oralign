/**
 * Seed the loyalty program defaults — grille tarifaire 2026.
 *
 *   « 8 traitements par trimestre  → 5 % de remise le trimestre suivant
 *     12 traitements ou plus       → 10 % »
 *
 * Also fills the beyond-the-pack tariffs on the ACTIVE billing settings
 * row, but ONLY for fields still at their 0 default — an admin-edited
 * value is never overwritten. defaultTreatmentFee (étude 300 DT) and the
 * CBCT supplement (+50 DT) already exist as admin-managed settings and
 * are seeded the same conservative way.
 *
 * Idempotent: tiers are only created when NO active tier exists, so an
 * admin-tuned ladder survives re-runs.
 *
 * Run by hand: `npx ts-node prisma/seeds/loyalty.seed.ts`.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const DEFAULT_TIERS = [
  { minTreatments: 8, discountPercent: '5.00' },
  { minTreatments: 12, discountPercent: '10.00' },
];

/** Grille 2026 — beyond-the-pack tariffs (TND, hors taxes). */
const BEYOND_PACK_DEFAULTS = {
  refinementTwoArchesFee: '900.000',
  refinementSingleArchFee: '520.000',
  replacementAlignerFee: '95.000',
  retainersFee: '210.000',
  // Étude et plan de traitement 3D (deducted from the pack per the sheet).
  defaultTreatmentFee: '300.000',
  // Supplément fichiers DICOM — cone beam.
  cbctSupplementFee: '50.000',
} as const;

export async function seedLoyalty(prisma: PrismaClient): Promise<void> {
  const activeTierCount = await prisma.loyaltyTier.count({
    where: { isActive: true },
  });
  if (activeTierCount === 0) {
    for (const tier of DEFAULT_TIERS) {
      await prisma.loyaltyTier.create({
        data: {
          minTreatments: tier.minTreatments,
          discountPercent: new Prisma.Decimal(tier.discountPercent),
        },
      });
    }
    console.log(`Seeded ${DEFAULT_TIERS.length} loyalty tier(s).`);
  } else {
    console.log('Loyalty tiers already configured — left untouched.');
  }

  const settings = await prisma.companyBillingSettings.findFirst({
    where: { isActive: true },
  });
  if (!settings) {
    console.log(
      'No active billing settings row — beyond-the-pack tariffs will apply once the admin saves the billing settings.',
    );
    return;
  }

  // Fill only never-configured (still 0) money fields. Caveat: 0 is
  // the "never configured" sentinel, so an admin who deliberately sets
  // a tariff to 0 (free) will see a re-run restore the grille default —
  // acceptable for a hand-run seed, called out here on purpose.
  const zero = new Prisma.Decimal(0);
  const patch: Record<string, Prisma.Decimal> = {};
  for (const [field, value] of Object.entries(BEYOND_PACK_DEFAULTS)) {
    const current = settings[field as keyof typeof settings] as Prisma.Decimal;
    if (current == null || zero.eq(current)) {
      patch[field] = new Prisma.Decimal(value);
    }
  }
  if (Object.keys(patch).length > 0) {
    await prisma.companyBillingSettings.update({
      where: { id: settings.id },
      data: patch,
    });
    console.log(
      `Billing settings: seeded ${Object.keys(patch).join(', ')} (untouched fields kept).`,
    );
  } else {
    console.log('Beyond-the-pack tariffs already configured — left untouched.');
  }
}

// Allow invoking the seed directly.
if (require.main === module) {
  // Prisma 7: the client must be built through a driver adapter —
  // mirror src/prisma/prisma.service.ts (pg Pool + PrismaPg).
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  seedLoyalty(prisma)
    .then(() => {
      console.log('Loyalty seed completed.');
      return prisma.$disconnect().then(() => pool.end());
    })
    .catch((err) => {
      console.error(err);
      return prisma.$disconnect().then(() => pool.end()).finally(() => process.exit(1));
    });
}
