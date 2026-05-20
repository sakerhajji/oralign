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
// Default phone + country so the dashboard's OnboardingGuard sees the
// account as "profile-complete" out of the box. Without these the
// frontend redirects to /onboarding/profile even though super admins
// have no business onboarding as if they were dentists.
const PHONE = process.env.SUPER_ADMIN_PHONE ?? '+216 00 000 000';
const COUNTRY = process.env.SUPER_ADMIN_COUNTRY ?? 'TN';

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
        phone: PHONE,
        country: COUNTRY,
        passwordHash,
        role: UserRole.super_admin,
        isActive: true,
        isEmailVerified: true,
        verificationStatus: VerificationStatus.approved,
      },
      update: {
        // phone + country deliberately omitted from the update block so
        // we don't clobber values an admin may have edited in the UI.
        // The follow-up updateMany below only fills them when they're
        // currently null.
        fullName: FULL_NAME,
        passwordHash,
        role: UserRole.super_admin,
        isActive: true,
        isEmailVerified: true,
        verificationStatus: VerificationStatus.approved,
      },
    });

    // Backfill phone / country if either is currently null on the row.
    // Without this the dashboard's OnboardingGuard would redirect the
    // admin into /onboarding/profile because profileComplete checks
    // require both fields.
    const needsBackfill = await prisma.user.findUnique({
      where: { email: EMAIL },
      select: { phone: true, country: true },
    });
    if (
      needsBackfill &&
      (needsBackfill.phone === null || needsBackfill.country === null)
    ) {
      await prisma.user.update({
        where: { email: EMAIL },
        data: {
          phone: needsBackfill.phone ?? PHONE,
          country: needsBackfill.country ?? COUNTRY,
        },
      });
    }

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
