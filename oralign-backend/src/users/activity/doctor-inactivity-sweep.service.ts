import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountActivityEventKind, Prisma } from '@prisma/client';
import { env } from '../../common/config/env';
import {
  NotificationEvents,
  type AccountActivityNoticeEvent,
} from '../../notifications/events/notification-events';
import { PrismaService } from '../../prisma/prisma.service';
import type { DoctorActivitySweepResult } from './doctor-activity.contract';
import {
  loadCycles,
  readInactivitySettings,
  ruleSubjectChunks,
  RULE_SUBJECT_SELECT,
  type RuleSubjectRow,
} from './doctor-activity.repository';
import {
  isRuleSubject,
  nextSweepAction,
  type ActivityCycle,
  type SweepAction,
} from './doctor-activity.rules';

// Plain timers instead of @nestjs/schedule, like LoyaltyService and the
// production notice dispatcher. Each pass acts on DUE states (not on an
// exact day), so a missed or late tick only shifts a deadline, never
// skips a warning.
const BOOT_DELAY_MS = 5 * 60_000;
const SWEEP_INTERVAL_MS = 24 * 60 * 60_000;
const SWEEP_CHUNK = 200;

type WarningAction = Extract<SweepAction, { daysLeft: number }>;

/**
 * The daily inactivity sweep (spec §5): for every approved, live dentist
 * who is not dormant, at most one step per pass, the 30-day warning, the
 * 7-day warning, then the deactivation (User.inactiveSince). Behind
 * CompanyBillingSettings.inactivityRuleEnabled (off by default: nothing
 * happens). Idempotent through the AccountActivityEvent unique key
 * (userId, kind, anchorAt = the cycle key): a second pass, or a second
 * instance, writes nothing. Never deletes anything and never touches
 * User.isActive.
 *
 * Notices (e-mail + in-app) are emitted AFTER the journal row commits;
 * DoctorActivityNoticesListener delivers them.
 */
@Injectable()
export class DoctorInactivitySweepService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DoctorInactivitySweepService.name);
  private bootTimer?: NodeJS.Timeout;
  private sweepTimer?: NodeJS.Timeout;
  /** The pass in progress: a second call waits for it instead of racing it. */
  private running: Promise<DoctorActivitySweepResult> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  onModuleInit(): void {
    // Specs drive sweep() themselves; a live timer would hit the mocks.
    if (env.nodeEnv === 'test') return;
    this.bootTimer = setTimeout(() => this.tick(), BOOT_DELAY_MS);
    this.bootTimer.unref?.();
    this.sweepTimer = setInterval(() => this.tick(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.bootTimer) clearTimeout(this.bootTimer);
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  private tick(): void {
    this.sweep().catch((error: unknown) =>
      this.logger.error(`Inactivity sweep failed: ${errorText(error)}`),
    );
  }

  /** Run one pass now (the timer, or POST admin/doctor-activity/sweep). */
  sweep(now: Date = new Date()): Promise<DoctorActivitySweepResult> {
    if (!this.running) {
      this.running = this.runPass(now).finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async runPass(now: Date): Promise<DoctorActivitySweepResult> {
    const settings = await readInactivitySettings(this.prisma);
    const result: DoctorActivitySweepResult = {
      ruleEnabled: settings.ruleEnabled,
      scanned: 0,
      warned30: 0,
      warned7: 0,
      deactivated: 0,
    };
    if (!settings.ruleEnabled) return result;

    for await (const chunk of ruleSubjectChunks(this.prisma, SWEEP_CHUNK)) {
      result.scanned += chunk.length;
      const cycles = await loadCycles(this.prisma, chunk, settings);
      for (const doctor of chunk) {
        const cycle = cycles.get(doctor.id);
        if (!cycle) continue;
        const action = nextSweepAction({
          nominal: cycle.nominal,
          warnings: cycle.warnings,
          now,
        });
        if (!action) continue;
        try {
          if (action.kind === AccountActivityEventKind.deactivated) {
            if (await this.deactivate(doctor, cycle, now)) {
              result.deactivated += 1;
            }
          } else if (await this.warn(doctor, cycle, action, now)) {
            if (action.kind === AccountActivityEventKind.warning_30d) {
              result.warned30 += 1;
            } else {
              result.warned7 += 1;
            }
          }
        } catch (error) {
          // One doctor's failure never stops the pass; the next one retries.
          this.logger.error(
            `Inactivity ${action.kind} failed for user ${doctor.id}: ${errorText(error)}`,
          );
        }
      }
    }

    if (result.warned30 + result.warned7 + result.deactivated > 0) {
      this.logger.log(
        `Inactivity sweep: ${result.scanned} scanned, ${result.warned30} warned (30 d), ${result.warned7} warned (7 d), ${result.deactivated} deactivated`,
      );
    }
    return result;
  }

  /**
   * One warning: the journal row first, keyed at the cycle key (its
   * unique key is the idempotency key: a duplicate means another pass
   * already warned this cycle), then the notice. createdAt = the pass
   * instant, so the deadline the warning announces is exactly createdAt +
   * its notice period. The notice itself carries the activity anchor (the
   * date the doctor reads).
   */
  private async warn(
    doctor: RuleSubjectRow,
    cycle: ActivityCycle,
    action: WarningAction,
    now: Date,
  ): Promise<boolean> {
    let eventId: string;
    try {
      const event = await this.prisma.accountActivityEvent.create({
        data: {
          userId: doctor.id,
          kind: action.kind,
          anchorAt: cycle.cycleKey,
          deadlineAt: action.deadlineAt,
          createdAt: now,
          metadata: { daysLeft: action.daysLeft },
        },
        select: { id: true },
      });
      eventId = event.id;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
    this.emit(NotificationEvents.AccountInactivityWarning, {
      ...noticeOf(
        doctor,
        eventId,
        action.kind,
        cycle.anchor,
        action.deadlineAt,
      ),
      daysLeft: action.daysLeft,
    });
    return true;
  }

  /**
   * The deactivation, in one transaction under the doctor's row lock
   * (`FOR UPDATE`, which the submit paths' `FOR KEY SHARE` waits for):
   * everything is re-read under the lock, the settings included, and the
   * doctor is skipped if the rule was switched off (or off and on again)
   * meanwhile, if he submitted an order (the anchor moved) or was
   * unblocked (the cycle key moved), was archived, blocked or already
   * dormant. Then a guarded update and the journal row.
   */
  private async deactivate(
    doctor: RuleSubjectRow,
    planned: ActivityCycle,
    now: Date,
  ): Promise<boolean> {
    const notice = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${doctor.id} FOR UPDATE`;
      const fresh = await tx.user.findUnique({
        where: { id: doctor.id },
        select: RULE_SUBJECT_SELECT,
      });
      if (!fresh || fresh.inactiveSince || !isRuleSubject(fresh)) return null;
      const settings = await readInactivitySettings(tx);
      if (!settings.ruleEnabled) return null;
      const cycle = (await loadCycles(tx, [fresh], settings)).get(fresh.id);
      if (
        !cycle ||
        cycle.anchor.getTime() !== planned.anchor.getTime() ||
        cycle.cycleKey.getTime() !== planned.cycleKey.getTime()
      ) {
        return null;
      }
      const action = nextSweepAction({
        nominal: cycle.nominal,
        warnings: cycle.warnings,
        now,
      });
      if (action?.kind !== AccountActivityEventKind.deactivated) return null;
      const { count } = await tx.user.updateMany({
        where: { id: fresh.id, inactiveSince: null },
        data: { inactiveSince: now },
      });
      if (count === 0) return null;
      const event = await tx.accountActivityEvent.create({
        data: {
          userId: fresh.id,
          kind: AccountActivityEventKind.deactivated,
          anchorAt: cycle.cycleKey,
          deadlineAt: action.deadlineAt,
          createdAt: now,
          metadata: {
            lastSubmittedOrderAt:
              cycle.lastSubmittedOrderAt?.toISOString() ?? null,
          },
        },
        select: { id: true },
      });
      return noticeOf(
        fresh,
        event.id,
        AccountActivityEventKind.deactivated,
        cycle.anchor,
        action.deadlineAt,
      );
    });
    if (!notice) return false;
    this.logger.log(`Doctor ${doctor.id} turned dormant (no recent order)`);
    this.emit(NotificationEvents.AccountDeactivated, notice);
    return true;
  }

  private emit(name: string, payload: AccountActivityNoticeEvent): void {
    try {
      this.events.emit(name, payload);
    } catch (error) {
      this.logger.error(
        `Emitting ${name} for user ${payload.userId} failed: ${errorText(error)}`,
      );
    }
  }
}

function noticeOf(
  doctor: Pick<
    RuleSubjectRow,
    'id' | 'fullName' | 'email' | 'preferredLanguage'
  >,
  eventId: string,
  kind: AccountActivityEventKind,
  anchor: Date,
  deadline: Date,
): AccountActivityNoticeEvent {
  return {
    eventId,
    userId: doctor.id,
    fullName: doctor.fullName,
    email: doctor.email,
    preferredLanguage: doctor.preferredLanguage,
    kind,
    anchorAt: anchor.toISOString(),
    deadlineAt: deadline.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
