import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ProductionNoticeKind,
  ProductionNoticeStatus,
  type ProductionNoticeChannel as NoticeChannelName,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NOTICE_MAX_ATTEMPTS,
  NOTICE_SENDING_STALE_MS,
  NOTICE_SWEEP_BATCH,
  deliveredNoticeKey,
  type NoticeSkipReason,
} from '../production.constants';
import {
  PLANNED_TOTALS_ORDER_SELECT,
  PROGRESS_COUNTERS_SELECT,
} from '../kernel';

/**
 * Every database access of the notice dispatcher (CONTRACT.md §3.5), so the
 * dispatcher reads as the outbox algorithm and its spec needs no Prisma.
 *
 * Timestamps are the APP clock, bound as parameters (`now` comes from the
 * caller): the columns are `timestamp(3)` without zone, and the DB's
 * now() is timestamptz, so comparing with it would shift by the session
 * TimeZone (1 h in Africa/Tunis).
 *
 * PrismaService exposes no $queryRaw: the raw claim runs through
 * $transaction. A transaction never spans a send; single statements and
 * the render load go straight through the model getters.
 */

/** What rendering a claimed row needs, in ONE call (7 batched statements). */
const CLAIMED_NOTICE_SELECT = {
  id: true,
  orderId: true,
  declarationId: true,
  eventIds: true,
  kind: true,
  channel: true,
  attempts: true,
  order: {
    select: {
      orderCode: true,
      patient: { select: { fullName: true } },
      doctor: {
        select: {
          id: true,
          email: true,
          fullName: true,
          preferredLanguage: true,
          deletedAt: true,
        },
      },
      productionProgress: { select: PROGRESS_COUNTERS_SELECT },
      ...PLANNED_TOTALS_ORDER_SELECT,
    },
  },
} satisfies Prisma.ProductionNoticeSelect;

export type ClaimedNotice = Prisma.ProductionNoticeGetPayload<{
  select: typeof CLAIMED_NOTICE_SELECT;
}>;

/** The event columns a notice prints. No cancelReason, no note: never sent (D8). */
const NOTICE_EVENT_SELECT = {
  id: true,
  arch: true,
  stepFrom: true,
  stepTo: true,
  quantity: true,
  performedAt: true,
  deliveredTo: true,
  deliveredToName: true,
  cancelledAt: true,
} satisfies Prisma.ProductionEventSelect;

export type NoticeEventRow = Prisma.ProductionEventGetPayload<{
  select: typeof NOTICE_EVENT_SELECT;
}>;

/** The delivered notice a correction is decided against. */
export interface OriginalNotice {
  status: ProductionNoticeStatus;
  attempts: number;
}

export interface ClaimedBatch {
  notices: ClaimedNotice[];
  events: ReadonlyMap<string, NoticeEventRow>;
  /** By dedupeKey (deliveredNoticeKey(declarationId, channel)). */
  originals: ReadonlyMap<string, OriginalNotice>;
}

/** A row that just ran out of attempts (the admins are told once). */
export interface ExhaustedNotice {
  id: string;
  orderId: string;
  orderCode: string;
  kind: ProductionNoticeKind;
  channel: NoticeChannelName;
}

@Injectable()
export class ProductionNoticeStore {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One transaction, two statements:
   *   1. rows still `sending` long after their claim were lost with their
   *      process: `failed`, one attempt spent, `interrupted`. RETURNING
   *      tells which of them just ran out of attempts. SKIP LOCKED here
   *      too: a delivery cancel holds its declaration's notices (locked by
   *      id), and waiting on them in another order could deadlock;
   *   2. the claim: due `pending` / `failed` rows → `sending`, in one
   *      conditional UPDATE with SKIP LOCKED, so several instances never
   *      claim (or send) the same row.
   * Enum values stay SQL literals: a text parameter against an enum column
   * raises "operator does not exist".
   */
  async claimDue(
    now: Date,
  ): Promise<{ claimedIds: string[]; exhausted: ExhaustedNotice[] }> {
    const staleBefore = new Date(now.getTime() - NOTICE_SENDING_STALE_MS);
    return this.prisma.$transaction(async (tx) => {
      const recovered = await tx.$queryRaw<
        Array<ExhaustedNotice & { attempts: number }>
      >`
        UPDATE "ProductionNotice" AS n
        SET status = 'failed',
            attempts = n.attempts + 1,
            "lastError" = 'interrupted',
            "updatedAt" = ${now}
        FROM "DentalOrder" AS o
        WHERE o.id = n."orderId"
          AND n.status = 'sending'
          AND n.id IN (
            SELECT id FROM "ProductionNotice"
            WHERE status = 'sending' AND "updatedAt" < ${staleBefore}
            ORDER BY id
            FOR UPDATE SKIP LOCKED
          )
        RETURNING n.id, n."orderId", o."orderCode", n.kind, n.channel, n.attempts`;
      const claimed = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "ProductionNotice" SET status = 'sending', "updatedAt" = ${now}
        WHERE id IN (
          SELECT id FROM "ProductionNotice"
          WHERE status IN ('pending', 'failed')
            AND "notBefore" <= ${now}
            AND attempts < ${NOTICE_MAX_ATTEMPTS}
          ORDER BY "notBefore", id
          LIMIT ${NOTICE_SWEEP_BATCH}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id`;
      return {
        claimedIds: claimed.map((row) => row.id),
        exhausted: recovered
          .filter((row) => row.attempts >= NOTICE_MAX_ATTEMPTS)
          .map(({ attempts: _attempts, ...row }) => row),
      };
    });
  }

  /**
   * The claimed rows with everything rendering needs, whatever their
   * number: the rows (+ order, patient, doctor, progress, approved plan,
   * quotation), their events, and the delivered notices the corrections
   * are decided against. Three calls at most.
   */
  async loadClaimed(ids: readonly string[]): Promise<ClaimedBatch> {
    const notices = await this.prisma.productionNotice.findMany({
      where: { id: { in: [...ids] } },
      select: CLAIMED_NOTICE_SELECT,
      // The claim's order: the longest-waiting first.
      orderBy: [{ notBefore: 'asc' }, { id: 'asc' }],
    });
    const eventIds = [...new Set(notices.flatMap((n) => n.eventIds))];
    const events = eventIds.length
      ? await this.prisma.productionEvent.findMany({
          where: { id: { in: eventIds } },
          select: NOTICE_EVENT_SELECT,
        })
      : [];
    const originalKeys = [
      ...new Set(
        notices
          .filter((n) => n.kind === ProductionNoticeKind.correction)
          .map((n) => deliveredNoticeKey(n.declarationId, n.channel)),
      ),
    ];
    const originals = originalKeys.length
      ? await this.prisma.productionNotice.findMany({
          where: { dedupeKey: { in: originalKeys } },
          select: { dedupeKey: true, status: true, attempts: true },
        })
      : [];
    return {
      notices,
      events: new Map(events.map((event) => [event.id, event])),
      originals: new Map(
        originals.map((o) => [
          o.dedupeKey,
          { status: o.status, attempts: o.attempts },
        ]),
      ),
    };
  }

  /**
   * The provider accepted: `sent`, and the events' notifiedAt where still
   * empty, atomically. Not guarded on `sending` on purpose: the message
   * went out, so the row must say so even if a stale recovery touched it.
   */
  async markSent(
    notice: { id: string; eventIds: readonly string[] },
    recipientAddress: string,
    now: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.productionNotice.update({
        where: { id: notice.id },
        data: {
          status: ProductionNoticeStatus.sent,
          sentAt: now,
          recipientAddress,
          skipReason: null,
        },
      });
      await tx.productionEvent.updateMany({
        where: { id: { in: [...notice.eventIds] }, notifiedAt: null },
        data: { notifiedAt: now },
      });
    });
  }

  /** Final without a send. Guarded on our own claim. */
  async markSkipped(id: string, reason: NoticeSkipReason): Promise<boolean> {
    return this.updateClaimed(id, {
      status: ProductionNoticeStatus.skipped,
      skipReason: reason,
    });
  }

  /** Back to `pending` later, without spending an attempt (a correction waiting for its original). */
  async release(id: string, notBefore: Date): Promise<boolean> {
    return this.updateClaimed(id, {
      status: ProductionNoticeStatus.pending,
      notBefore,
    });
  }

  /** A failed attempt (final when `attempts` reached NOTICE_MAX_ATTEMPTS). */
  async markFailed(
    id: string,
    failure: { attempts: number; lastError: string; notBefore: Date },
  ): Promise<boolean> {
    return this.updateClaimed(id, {
      status: ProductionNoticeStatus.failed,
      attempts: failure.attempts,
      lastError: failure.lastError,
      notBefore: failure.notBefore,
    });
  }

  /**
   * Only while the row is still ours (`sending`): a stale recovery by
   * another instance may have taken it back meanwhile. true = written.
   */
  private async updateClaimed(
    id: string,
    data: Prisma.ProductionNoticeUpdateManyMutationInput,
  ): Promise<boolean> {
    const { count } = await this.prisma.productionNotice.updateMany({
      where: { id, status: ProductionNoticeStatus.sending },
      data,
    });
    return count > 0;
  }
}
