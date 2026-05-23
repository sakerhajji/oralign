/**
 * Seed the commercial pack catalogue.
 *
 * Idempotent: re-running upserts each pack by name + each price by
 * (packId, archType, isActive=true). Safe to call from automated
 * boot-time setup OR by hand via `npx ts-node prisma/seeds/packs.seed.ts`.
 *
 * Prices are TND (3 decimal precision via Prisma.Decimal).
 */
import { PrismaClient, ArchType, Prisma } from '@prisma/client';

interface PackSeed {
  name: string;
  description: string;
  maxStepsPerArch: number | null;
  includedCorrections: number | null;
  isUnlimitedSteps: boolean;
  isUnlimitedCorrections: boolean;
  isForOrthodontists: boolean;
  /** Map of archType → TND price. Missing keys = price not offered. */
  prices: Partial<Record<ArchType, string>>;
}

const PACKS: PackSeed[] = [
  {
    name: 'LITE',
    description: '7 steps per arch · 1 included correction',
    maxStepsPerArch: 7,
    includedCorrections: 1,
    isUnlimitedSteps: false,
    isUnlimitedCorrections: false,
    isForOrthodontists: false,
    prices: { single_arch: '850.000', two_arches: '1300.000' },
  },
  {
    name: 'ESSENTIAL',
    description: '12 steps per arch · 1 included correction',
    maxStepsPerArch: 12,
    includedCorrections: 1,
    isUnlimitedSteps: false,
    isUnlimitedCorrections: false,
    isForOrthodontists: false,
    prices: { single_arch: '1150.000', two_arches: '1950.000' },
  },
  {
    name: 'SMART',
    description: '24 steps per arch · 2 included corrections',
    maxStepsPerArch: 24,
    includedCorrections: 2,
    isUnlimitedSteps: false,
    isUnlimitedCorrections: false,
    isForOrthodontists: false,
    prices: { single_arch: '2100.000', two_arches: '3150.000' },
  },
  {
    name: 'PRO',
    description: '36 steps per arch · 3 included corrections · two arches only · orthodontist-only',
    maxStepsPerArch: 36,
    includedCorrections: 3,
    isUnlimitedSteps: false,
    isUnlimitedCorrections: false,
    isForOrthodontists: true,
    prices: { two_arches: '4500.000' },
  },
  {
    name: 'PRO+',
    description: 'Unlimited steps · unlimited corrections · two arches only · orthodontist-only',
    maxStepsPerArch: null,
    includedCorrections: null,
    isUnlimitedSteps: true,
    isUnlimitedCorrections: true,
    isForOrthodontists: true,
    prices: { two_arches: '5000.000' },
  },
];

export async function seedPacks(prisma: PrismaClient): Promise<void> {
  for (const seed of PACKS) {
    // Upsert by name — there is no @@unique on name in the schema (a
    // future ALTER could rename a pack), so we look it up first then
    // create or update by id. This keeps the seed re-runnable on the
    // same data set without unique-constraint surprises.
    const existing = await prisma.pack.findFirst({
      where: { name: seed.name, deletedAt: null },
    });

    const pack = existing
      ? await prisma.pack.update({
          where: { id: existing.id },
          data: {
            description: seed.description,
            maxStepsPerArch: seed.maxStepsPerArch,
            includedCorrections: seed.includedCorrections,
            isUnlimitedSteps: seed.isUnlimitedSteps,
            isUnlimitedCorrections: seed.isUnlimitedCorrections,
            isForOrthodontists: seed.isForOrthodontists,
            isActive: true,
          },
        })
      : await prisma.pack.create({
          data: {
            name: seed.name,
            description: seed.description,
            maxStepsPerArch: seed.maxStepsPerArch,
            includedCorrections: seed.includedCorrections,
            isUnlimitedSteps: seed.isUnlimitedSteps,
            isUnlimitedCorrections: seed.isUnlimitedCorrections,
            isForOrthodontists: seed.isForOrthodontists,
            isActive: true,
          },
        });

    // For each price slot the seed declares, mark any pre-existing
    // active row for that (pack, arch) as archived (isActive=false)
    // if its amount differs, then upsert the new active row. Archived
    // rows are kept so historical quotes keep snapshotting accurately.
    for (const [archTypeKey, amount] of Object.entries(seed.prices) as Array<
      [ArchType, string]
    >) {
      const target = new Prisma.Decimal(amount);
      const currentActive = await prisma.packPrice.findFirst({
        where: { packId: pack.id, archType: archTypeKey, isActive: true },
      });
      if (currentActive && !currentActive.price.eq(target)) {
        await prisma.packPrice.update({
          where: { id: currentActive.id },
          data: { isActive: false },
        });
      }
      if (!currentActive || !currentActive.price.eq(target)) {
        await prisma.packPrice.create({
          data: {
            packId: pack.id,
            archType: archTypeKey,
            price: target,
            currency: 'TND',
            isActive: true,
          },
        });
      }
    }
  }
}

// Allow invoking the seed directly: `npx ts-node prisma/seeds/packs.seed.ts`.
if (require.main === module) {
  const prisma = new PrismaClient();
  seedPacks(prisma)
    .then(() => {
      console.log('Packs seed completed.');
      return prisma.$disconnect();
    })
    .catch((err) => {
      console.error(err);
      return prisma.$disconnect().finally(() => process.exit(1));
    });
}
