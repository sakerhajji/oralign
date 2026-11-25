/**
 * Idempotent script to create (or reset) a DEMO lab technician account, for
 * local runs, demos and the e2e fixtures of the production module.
 *
 * The account is ready to sign in (e-mail verified, approved, French) and
 * on a temporary password: the first sign-in asks for a new one
 * (mustChangePassword), like an account an admin creates.
 *
 * Usage (local dev):
 *   npx ts-node -r tsconfig-paths/register src/scripts/create-demo-technician.ts
 *   DEMO_TECHNICIAN_EMAIL=lab@example.com DEMO_TECHNICIAN_PASSWORD=secret12 \
 *     npx ts-node -r tsconfig-paths/register src/scripts/create-demo-technician.ts
 *
 * Usage (Docker):
 *   docker compose exec backend node dist/src/scripts/create-demo-technician
 *
 * Safety:
 *   • refuses NODE_ENV=production unless `--force` is passed: a known demo
 *     password must not exist in production by accident;
 *   • refuses to convert an existing account of another role;
 *   • prints a password ONLY when it generated it, on a non-production run,
 *     once. A DEMO_TECHNICIAN_PASSWORD from the environment is never echoed;
 *     a forced production run without one prints nothing: issue the
 *     password from the Users desk ("Mot de passe temporaire").
 */
import { PrismaClient, UserRole, VerificationStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';
import { generateTemporaryPassword } from '../users/temporary-password';

const EMAIL = (
  process.env.DEMO_TECHNICIAN_EMAIL ?? 'technicienne.demo@oralign.local'
)
  .trim()
  .toLowerCase();
const FULL_NAME =
  process.env.DEMO_TECHNICIAN_NAME?.trim() || 'Technicienne Démo';
const PASSWORD_FROM_ENV = process.env.DEMO_TECHNICIAN_PASSWORD || undefined;
const MIN_PASSWORD_LENGTH = 8;

const isProduction = process.env.NODE_ENV === 'production';
const forced = process.argv.includes('--force');

async function main(): Promise<void> {
  if (isProduction && !forced) {
    throw new Error(
      'NODE_ENV=production: a demo account with a known password must not exist there. ' +
        'Pass --force only if you really mean it.',
    );
  }
  if (PASSWORD_FROM_ENV && PASSWORD_FROM_ENV.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `DEMO_TECHNICIAN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const existing = await prisma.user.findUnique({
      where: { email: EMAIL },
      select: { id: true, role: true },
    });
    if (existing && existing.role !== UserRole.technician) {
      throw new Error(
        `${EMAIL} already belongs to a ${existing.role} account; choose another DEMO_TECHNICIAN_EMAIL.`,
      );
    }

    const generated = PASSWORD_FROM_ENV
      ? undefined
      : generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(PASSWORD_FROM_ENV ?? generated!, 12);
    const account = {
      fullName: FULL_NAME,
      passwordHash,
      role: UserRole.technician,
      isActive: true,
      isEmailVerified: true,
      verificationStatus: VerificationStatus.approved,
      preferredLanguage: 'fr',
      mustChangePassword: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      // A handover nobody in the app made (the script): dated, no issuer.
      temporaryPasswordIssuedAt: new Date(),
      temporaryPasswordIssuedById: null,
      deletedAt: null,
    };

    const user = await prisma.user.upsert({
      where: { email: EMAIL },
      create: { email: EMAIL, ...account },
      // A reset revokes the sessions opened with the previous password.
      update: { ...account, tokenVersion: { increment: 1 } },
      select: { id: true, email: true },
    });

    console.log(`✓ Demo technician ready: ${user.email} (id: ${user.id})`);
    if (generated && !isProduction) {
      // Shown once, for the person running the script locally.
      console.log(
        `  Temporary password (changed at first sign-in): ${generated}`,
      );
    } else if (generated) {
      console.log(
        '  No password shown in production: issue one from the Users desk.',
      );
    } else {
      console.log(
        '  Password: DEMO_TECHNICIAN_PASSWORD (changed at first sign-in).',
      );
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(
    '✗ Failed to create the demo technician:',
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
