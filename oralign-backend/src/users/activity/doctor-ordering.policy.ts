import { Prisma, VerificationStatus } from '@prisma/client';
import { ACCOUNT_ACTIVITY_ERROR } from '../../common/exceptions/domain-error-codes';
import { ForbiddenException } from '../../common/exceptions/app.exception';

/**
 * Ordering gate of a dormant doctor (spec §5, DECISIONS §5): order create
 * and submit, initial and supplemental, answer 403 ACCOUNT_DORMANT while
 * the ORDER's doctor has `User.inactiveSince` set, also when an admin acts
 * for him. Everything else stays open (login, payments, plan approval,
 * chat, patients, editing an existing draft).
 *
 * Plain functions, no DI: the orders, supplemental and appointments
 * services call them without importing any module (orders.module.ts has
 * no owner). The message is French UI text; clients key on the errorCode.
 */

export const ACCOUNT_DORMANT_MESSAGE =
  'Ce compte praticien est inactif faute de commande soumise depuis plusieurs mois. ' +
  'Il doit être réactivé par l’équipe Oralign avant toute nouvelle commande.';

/** The ONE refusal, shared by every ordering path. */
export function accountDormantError(): ForbiddenException {
  return new ForbiddenException(
    ACCOUNT_DORMANT_MESSAGE,
    ACCOUNT_ACTIVITY_ERROR.ACCOUNT_DORMANT,
  );
}

/** Throws ACCOUNT_DORMANT when the doctor row read says dormant. */
export function assertNotDormant(
  doctor: { inactiveSince: Date | null } | null | undefined,
): void {
  if (doctor?.inactiveSince) throw accountDormantError();
}

/**
 * Unlocked check, for paths that only CREATE a draft (a draft is not
 * activity): one primary-key read. An unknown id passes, the caller has
 * its own existence check.
 */
export async function assertDoctorCanOrder(
  db: { user: Pick<Prisma.TransactionClient['user'], 'findUnique'> },
  doctorId: string,
): Promise<void> {
  assertNotDormant(
    await db.user.findUnique({
      where: { id: doctorId },
      select: { inactiveSince: true },
    }),
  );
}

/**
 * Locked check, for SUBMIT paths, inside their transaction and before the
 * write. `FOR KEY SHARE` on the doctor's row:
 * - it conflicts with the sweep's `FOR UPDATE` (taken before it re-reads
 *   the last submission and deactivates), so a submission and a
 *   deactivation of the same doctor are serialised: either the sweep sees
 *   the new submission and skips, or the submission sees the dormant row
 *   and is refused;
 * - it does NOT conflict with ordinary row updates (FOR NO KEY UPDATE),
 *   so the welcome gift's mark claim in the same transaction, or a
 *   concurrent submission of the same doctor, never deadlocks on it.
 */
export async function assertDoctorCanOrderLocked(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  doctorId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<{ inactiveSince: Date | null }[]>`
    SELECT "inactiveSince" FROM "User" WHERE "id" = ${doctorId} FOR KEY SHARE`;
  assertNotDormant(rows[0]);
}

/**
 * THE public-practitioner predicate on the owning account: approved,
 * active (not blocked), not archived, not dormant. Shared by the public
 * directory ("Trouver un praticien") and both appointment checks, so a
 * dormant doctor disappears from all of them at once and reappears on
 * reactivation. DentistProfile.isListedPublicly (the doctor's own choice)
 * is never touched.
 */
export const PUBLIC_PRACTITIONER_USER_WHERE = {
  verificationStatus: VerificationStatus.approved,
  isActive: true,
  deletedAt: null,
  inactiveSince: null,
} satisfies Prisma.UserWhereInput;

/** The same predicate on the profile row (the directory and booking reads). */
export const PUBLIC_PRACTITIONER_PROFILE_WHERE = {
  deletedAt: null,
  isListedPublicly: true,
  user: PUBLIC_PRACTITIONER_USER_WHERE,
} satisfies Prisma.DentistProfileWhereInput;
