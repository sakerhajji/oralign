/**
 * Seed the commercial pack catalogue — grille tarifaire 2026.
 *
 * Source of truth: "ORALIGN — Grille tarifaire praticien, édition 2026"
 * (prix hors taxes, en dinars). Four packs:
 *
 *   Express  — 7 étapes  — 1 an  — 1 finition  — 1 190 / 1 690 DT
 *   Léger    — 14 étapes — 2 ans — 2 finitions — 2 250 / 3 190 DT
 *   Modéré   — 20 étapes — 2 ans — 2 finitions — 2 850 / 3 690 DT
 *   Intégral — selon le plan — 3 ans — 3 finitions — 4 990 DT (2 arcades)
 *
 * Idempotent: re-running upserts each pack by name + each price by
 * (packId, archType, isActive=true). Price changes ARCHIVE the previous
 * active row (isActive=false) instead of mutating it, so historical
 * quotes keep accurate snapshots. Packs from the pre-2026 seed (LITE,
 * ESSENTIAL, SMART, PRO, PRO+) are deactivated — never deleted — and
 * the admin can re-enable them from the dashboard at any time; packs
 * the admin created by hand are left untouched.
 *
 * Run by hand: `npx ts-node prisma/seeds/packs.seed.ts`
 * (or inside the container: `node -r ts-node/register prisma/seeds/packs.seed.ts`).
 */
import { PrismaClient, ArchType, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Plain record type (not an interface) so it satisfies Prisma InputJsonObject.
type Localized = { fr: string; en?: string } & Record<string, string | undefined>;

interface PackSeed {
  /** Plain `name` column = FR fallback, mirrored from nameI18n.fr. */
  name: string;
  nameI18n: Localized;
  descriptionI18n: Localized;
  treatmentExpirationLabel: Localized;
  finishingIncludedLabel: Localized;
  maxStepsPerArch: number | null;
  includedCorrections: number | null;
  isUnlimitedSteps: boolean;
  isUnlimitedCorrections: boolean;
  isForOrthodontists: boolean;
  /** Map of archType → TND price. Missing keys = price not offered. */
  prices: Partial<Record<ArchType, string>>;
}

/** Packs of the retired pre-2026 catalogue, deactivated by this seed. */
const LEGACY_PACK_NAMES = ['LITE', 'ESSENTIAL', 'SMART', 'PRO', 'PRO+'];

const PACKS: PackSeed[] = [
  {
    name: 'Express',
    nameI18n: { fr: 'Express', en: 'Express' },
    descriptionI18n: {
      fr: '7 étapes incluses · corrections légères, résultat rapide.',
      en: '7 stages included · light corrections, fast result.',
    },
    treatmentExpirationLabel: { fr: '1 an', en: '1 year' },
    finishingIncludedLabel: { fr: '1 finition incluse', en: '1 refinement included' },
    maxStepsPerArch: 7,
    includedCorrections: 1,
    isUnlimitedSteps: false,
    isUnlimitedCorrections: false,
    isForOrthodontists: false,
    prices: { single_arch: '1190.000', two_arches: '1690.000' },
  },
  {
    name: 'Léger',
    nameI18n: { fr: 'Léger', en: 'Light' },
    descriptionI18n: {
      fr: '14 étapes incluses · encombrements et corrections modérés.',
      en: '14 stages included · mild crowding and moderate corrections.',
    },
    treatmentExpirationLabel: { fr: '2 ans', en: '2 years' },
    finishingIncludedLabel: { fr: '2 finitions incluses', en: '2 refinements included' },
    maxStepsPerArch: 14,
    includedCorrections: 2,
    isUnlimitedSteps: false,
    isUnlimitedCorrections: false,
    isForOrthodontists: false,
    prices: { single_arch: '2250.000', two_arches: '3190.000' },
  },
  {
    name: 'Modéré',
    nameI18n: { fr: 'Modéré', en: 'Moderate' },
    descriptionI18n: {
      fr: '20 étapes incluses · corrections plus étendues sur les deux arcades.',
      en: '20 stages included · broader corrections across the arches.',
    },
    treatmentExpirationLabel: { fr: '2 ans', en: '2 years' },
    finishingIncludedLabel: { fr: '2 finitions incluses', en: '2 refinements included' },
    maxStepsPerArch: 20,
    includedCorrections: 2,
    isUnlimitedSteps: false,
    isUnlimitedCorrections: false,
    isForOrthodontists: false,
    prices: { single_arch: '2850.000', two_arches: '3690.000' },
  },
  {
    name: 'Intégral',
    nameI18n: { fr: 'Intégral', en: 'Integral' },
    descriptionI18n: {
      fr: 'Étapes selon le plan de traitement · deux arcades · cas complets.',
      en: 'Stages follow the treatment plan · two arches · comprehensive cases.',
    },
    treatmentExpirationLabel: { fr: '3 ans', en: '3 years' },
    finishingIncludedLabel: { fr: '3 finitions incluses', en: '3 refinements included' },
    maxStepsPerArch: null,
    includedCorrections: 3,
    isUnlimitedSteps: true,
    isUnlimitedCorrections: false,
    isForOrthodontists: false,
    prices: { two_arches: '4990.000' },
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

    const data = {
      name: seed.name,
      description: seed.descriptionI18n.fr,
      nameI18n: seed.nameI18n,
      descriptionI18n: seed.descriptionI18n,
      treatmentExpirationLabel: seed.treatmentExpirationLabel,
      finishingIncludedLabel: seed.finishingIncludedLabel,
      maxStepsPerArch: seed.maxStepsPerArch,
      includedCorrections: seed.includedCorrections,
      isUnlimitedSteps: seed.isUnlimitedSteps,
      isUnlimitedCorrections: seed.isUnlimitedCorrections,
      isForOrthodontists: seed.isForOrthodontists,
    };

    // isActive only on create — a pack the admin deactivated stays off
    // through re-runs.
    const pack = existing
      ? await prisma.pack.update({ where: { id: existing.id }, data })
      : await prisma.pack.create({ data: { ...data, isActive: true } });

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
        // The unique index keeps ONE archived row per (pack, arch) —
        // evict the previous one before archiving the current price.
        await prisma.packPrice.deleteMany({
          where: { packId: pack.id, archType: archTypeKey, isActive: false },
        });
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

  // Retire the pre-2026 catalogue: deactivate, never delete — quotes
  // referencing these packs keep their snapshots, and the admin can
  // re-enable any of them from the dashboard.
  const retired = await prisma.pack.updateMany({
    where: { name: { in: LEGACY_PACK_NAMES }, deletedAt: null, isActive: true },
    data: { isActive: false },
  });
  if (retired.count > 0) {
    console.log(`Deactivated ${retired.count} legacy pack(s).`);
  }
}

// Allow invoking the seed directly: `npx ts-node prisma/seeds/packs.seed.ts`.
if (require.main === module) {
  // Prisma 7: the client must be built through a driver adapter —
  // mirror src/prisma/prisma.service.ts (pg Pool + PrismaPg).
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  seedPacks(prisma)
    .then(() => {
      console.log('Packs seed completed (grille 2026).');
      return prisma.$disconnect().then(() => pool.end());
    })
    .catch((err) => {
      console.error(err);
      return prisma.$disconnect().then(() => pool.end()).finally(() => process.exit(1));
    });
}
