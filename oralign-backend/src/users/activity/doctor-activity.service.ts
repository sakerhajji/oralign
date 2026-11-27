import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountActivityEventKind, Prisma, UserRole } from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import { lookupActorName } from '../../common/access/actor-snapshot';
import { PaginatedResponse } from '../../common/dto/response.dto';
import {
  BadRequestException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import {
  ACCOUNT_ACTIVITY_ERROR,
  validReason,
} from '../../common/exceptions/domain-error-codes';
import {
  NotificationEvents,
  type AccountActivityNoticeEvent,
} from '../../notifications/events/notification-events';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AccountActivityEventDto,
  DoctorActivityStatus,
  DoctorActivitySummary,
} from './doctor-activity.contract';
import {
  toActivityEventDto,
  toActivitySummary,
} from './doctor-activity.mapper';
import {
  loadCycles,
  readInactivitySettings,
  ruleSubjectChunks,
  RULE_SUBJECT_SELECT,
  type ActivityAccountRow,
} from './doctor-activity.repository';
import {
  activityStatusOf,
  nominalDeadline,
  projectedDeadline,
} from './doctor-activity.rules';

/** Accounts per query when the whole dentist base is scanned. */
export const ACTIVITY_SCAN_CHUNK = 500;

/**
 * The users-desk side of the inactivity rule: the activity block of a
 * dentist, the list filter, the journal, the admin reactivation and the
 * block / unblock journal rows. The daily sweep lives in
 * DoctorInactivitySweepService. Never touches User.isActive (except the
 * existing block toggle it journals), DentistProfile.isListedPublicly, or
 * deletes anything.
 */
@Injectable()
export class DoctorActivityService {
  private readonly logger = new Logger(DoctorActivityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * The activity block of every dentist among `accounts` (other roles are
   * absent from the map). Three queries whatever the page size.
   */
  async summaries(
    accounts: readonly ActivityAccountRow[],
    now: Date = new Date(),
  ): Promise<Map<string, DoctorActivitySummary>> {
    const dentists = accounts.filter((a) => a.role === UserRole.dentist);
    const result = new Map<string, DoctorActivitySummary>();
    if (dentists.length === 0) return result;
    const settings = await readInactivitySettings(this.prisma);
    const cycles = await loadCycles(this.prisma, dentists, settings);
    for (const account of dentists) {
      const cycle = cycles.get(account.id);
      if (!cycle) continue;
      result.set(
        account.id,
        toActivitySummary({
          account,
          cycle,
          ruleEnabled: settings.ruleEnabled,
          now,
        }),
      );
    }
    return result;
  }

  /**
   * The `activity` list filter as a `where` fragment (dentists only).
   * inactive is a column; warned and active are derived, so the warned
   * ids are computed over the live rule subjects (none while the rule is
   * off: everybody not dormant is then "active").
   */
  async listFilterWhere(
    status: DoctorActivityStatus,
    now: Date = new Date(),
  ): Promise<Prisma.UserWhereInput> {
    if (status === 'inactive') {
      return { role: UserRole.dentist, inactiveSince: { not: null } };
    }
    const warned = await this.warnedDoctorIds(now);
    if (status === 'warned') {
      return {
        role: UserRole.dentist,
        inactiveSince: null,
        id: { in: warned },
      };
    }
    return {
      role: UserRole.dentist,
      inactiveSince: null,
      ...(warned.length > 0 ? { id: { notIn: warned } } : {}),
    };
  }

  /** Live rule subjects whose deadline is within 30 days (or past). */
  async warnedDoctorIds(now: Date = new Date()): Promise<string[]> {
    const settings = await readInactivitySettings(this.prisma);
    if (!settings.ruleEnabled) return [];
    const warned: string[] = [];
    for await (const chunk of ruleSubjectChunks(
      this.prisma,
      ACTIVITY_SCAN_CHUNK,
    )) {
      const cycles = await loadCycles(this.prisma, chunk, settings);
      for (const doctor of chunk) {
        const cycle = cycles.get(doctor.id);
        if (
          cycle &&
          activityStatusOf({
            inactiveSince: null,
            deadlineAt: projectedDeadline(cycle, now),
            now,
          }) === 'warned'
        ) {
          warned.push(doctor.id);
        }
      }
    }
    return warned;
  }

  /**
   * POST users/:id/reactivate. One transaction under the doctor's row
   * lock: a guarded update (inactiveSince not null → null, activityResetAt
   * = now, so the new cycle starts now and the next sweep does not
   * deactivate him again), then the journal row. Idempotent: an account
   * that is not dormant answers `changed: false` and writes nothing.
   * The caller (UserService) checked the admin hierarchy.
   */
  async reactivate(
    doctorId: string,
    caller: Caller,
    rawReason: unknown,
  ): Promise<{ changed: boolean }> {
    const reason = validReason(rawReason);
    if (!reason) {
      throw new BadRequestException(
        'Indiquez le motif de la réactivation (3 à 500 caractères).',
        ACCOUNT_ACTIVITY_ERROR.REACTIVATION_REASON_REQUIRED,
      );
    }
    const target = await this.prisma.user.findUnique({
      where: { id: doctorId },
      select: { role: true, deletedAt: true },
    });
    if (!target || target.deletedAt) {
      throw new NotFoundException('User not found');
    }
    if (target.role !== UserRole.dentist) {
      throw new BadRequestException(
        'Seul un compte praticien peut être réactivé.',
        ACCOUNT_ACTIVITY_ERROR.NOT_A_DOCTOR,
      );
    }
    const actorName = await lookupActorName(this.prisma, caller.userId);
    const now = new Date();

    const notice = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${doctorId} FOR UPDATE`;
      const doctor = await tx.user.findUnique({
        where: { id: doctorId },
        select: RULE_SUBJECT_SELECT,
      });
      if (!doctor?.inactiveSince || doctor.deletedAt) return null;
      const { count } = await tx.user.updateMany({
        where: { id: doctorId, inactiveSince: { not: null } },
        data: { inactiveSince: null, activityResetAt: now },
      });
      if (count === 0) return null;
      const settings = await readInactivitySettings(tx);
      const deadlineAt = nominalDeadline(now, settings.months);
      const event = await tx.accountActivityEvent.create({
        data: {
          userId: doctorId,
          kind: AccountActivityEventKind.reactivated,
          anchorAt: now,
          deadlineAt,
          createdAt: now,
          actorId: caller.userId,
          actorName,
          actorRole: caller.role,
          reason,
          metadata: { inactiveSince: doctor.inactiveSince.toISOString() },
        },
        select: { id: true },
      });
      return {
        eventId: event.id,
        userId: doctor.id,
        fullName: doctor.fullName,
        email: doctor.email,
        preferredLanguage: doctor.preferredLanguage,
        kind: AccountActivityEventKind.reactivated,
        anchorAt: now.toISOString(),
        deadlineAt: deadlineAt.toISOString(),
        actorId: caller.userId,
        actorName,
        reason,
      } satisfies AccountActivityNoticeEvent;
    });

    if (!notice) return { changed: false };
    this.logger.log(
      `Doctor ${doctorId} reactivated by ${caller.role} ${caller.userId}`,
    );
    this.emit(NotificationEvents.AccountReactivated, notice);
    return { changed: true };
  }

  /** GET users/:id/activity-events: the journal, newest first. */
  async listEvents(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<AccountActivityEventDto>> {
    const exists = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('User not found');
    const where: Prisma.AccountActivityEventWhereInput = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.accountActivityEvent.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          kind: true,
          anchorAt: true,
          deadlineAt: true,
          actorId: true,
          actorName: true,
          actorRole: true,
          reason: true,
          createdAt: true,
        },
      }),
      this.prisma.accountActivityEvent.count({ where }),
    ]);
    return new PaginatedResponse(
      rows.map(toActivityEventDto),
      total,
      page,
      limit,
      Math.ceil(total / limit),
    );
  }

  /**
   * Journal rows `blocked` / `unblocked` for the accounts a bulk status
   * change really flipped, in the caller's transaction. anchorAt is the
   * event instant (repeated acts never collide); deadlineAt is the
   * dentist's current deadline, the event instant for other roles (the
   * rule does not concern them). An unblock is a notice floor: it opens a
   * fresh cycle with no warning yet (cycleKeyOf), whose deadline is the
   * nominal one, so that is what its row records.
   */
  async journalStatusChange(
    tx: Prisma.TransactionClient,
    accounts: readonly ActivityAccountRow[],
    change: { isActive: boolean; caller: Caller; at: Date },
  ): Promise<number> {
    if (accounts.length === 0) return 0;
    const settings = await readInactivitySettings(tx);
    const dentists = accounts.filter((a) => a.role === UserRole.dentist);
    const cycles = await loadCycles(tx, dentists, settings);
    const actorName = await lookupActorName(tx, change.caller.userId);
    const deadlineOf = (accountId: string): Date => {
      const cycle = cycles.get(accountId);
      if (!cycle) return change.at;
      return change.isActive ? cycle.nominal : cycle.deadline;
    };
    const { count } = await tx.accountActivityEvent.createMany({
      data: accounts.map((account) => ({
        userId: account.id,
        kind: change.isActive
          ? AccountActivityEventKind.unblocked
          : AccountActivityEventKind.blocked,
        anchorAt: change.at,
        deadlineAt: deadlineOf(account.id),
        createdAt: change.at,
        actorId: change.caller.userId,
        actorName,
        actorRole: change.caller.role,
      })),
      skipDuplicates: true,
    });
    return count;
  }

  /** After commit; a listener failure never reaches the caller. */
  private emit(name: string, payload: AccountActivityNoticeEvent): void {
    try {
      this.events.emit(name, payload);
    } catch (error) {
      this.logger.error(
        `Emitting ${name} for user ${payload.userId} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
