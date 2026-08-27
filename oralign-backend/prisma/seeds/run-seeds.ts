/**
 * Run every seed against DATABASE_URL.
 *
 * Prisma 7 requires the client to be constructed through a driver
 * adapter — mirror src/prisma/prisma.service.ts (pg Pool + PrismaPg).
 *
 * Usage (host or any node container with the repo mounted):
 *   node -e "require('ts-node/register/transpile-only'); require('./prisma/seeds/run-seeds.ts')"
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { seedPacks } from './packs.seed';
import { seedLoyalty } from './loyalty.seed';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

seedPacks(prisma)
  .then(() => seedLoyalty(prisma))
  .then(() => {
    console.log('Seeds completed (packs + loyalty).');
    return prisma.$disconnect().then(() => pool.end());
  })
  .catch((err) => {
    console.error(err);
    prisma
      .$disconnect()
      .then(() => pool.end())
      .finally(() => process.exit(1));
  });
