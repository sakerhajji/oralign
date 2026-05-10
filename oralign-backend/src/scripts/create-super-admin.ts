/**
 * Idempotent script to create or update the super-admin user.
 *
 * Usage (Docker):
 *   docker compose exec backend node dist/src/scripts/create-super-admin
 *   docker compose exec -e SUPER_ADMIN_EMAIL=you@example.com -e SUPER_ADMIN_PASSWORD=secret \
 *     backend node dist/src/scripts/create-super-admin
 *
 * Usage (local dev):
 *   npm run create-super-admin:dev
 */
import { PrismaClient, UserRole, VerificationStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';

const EMAIL = process.env.SUPER_ADMIN_EMAIL ?? 'admin@oralign.com';
const PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? 'Admin@123456';
const FULL_NAME = process.env.SUPER_ADMIN_NAME ?? 'Super Admin';

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const passwordHash = await bcrypt.hash(PASSWORD, 12);

    const user = await prisma.user.upsert({
      where: { email: EMAIL },
      create: {
        email: EMAIL,
        fullName: FULL_NAME,
        passwordHash,
        role: UserRole.super_admin,
        isActive: true,
        isEmailVerified: true,
        verificationStatus: VerificationStatus.approved,
      },
      update: {
        fullName: FULL_NAME,
        passwordHash,
        role: UserRole.super_admin,
        isActive: true,
        isEmailVerified: true,
        verificationStatus: VerificationStatus.approved,
      },
    });

    console.log(`✓ Super admin ready: ${user.email} (id: ${user.id})`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('✗ Failed to create super admin:', err);
  process.exit(1);
});
