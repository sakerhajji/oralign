import {
  Prisma,
  ProductionNoticeChannel,
  ProductionNoticeKind,
  ProductionNoticeStatus,
} from '@prisma/client';
import { env } from '../common/config/env';
import {
  correctionNoticeKey,
  deliveredNoticeKey,
  NOTICE_CHANNELS,
  NOTICE_SKIP_REASON,
} from './production.constants';

/**
 * The ProductionNotice OUTBOX writes of a delivery declaration and of its
 * cancel (CONTRACT §3.5), inside the caller's transaction: a crash after
 * the commit can never lose a notice, nor send one for a rolled-back
 * declaration. Whether a channel is configured and who receives it are
 * decided at send time by the dispatcher (production/notifications).
 * Every row passes `eventIds` explicitly: Prisma would store NULL, which
 * ProductionNotice_eventIds_check refuses.
 */

/** One `delivered` row per channel, due after the grace delay (D7). */
export async function writeDeliveredNotices(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    declarationId: string;
    eventIds: readonly string[];
    now: Date;
  },
): Promise<void> {
  const notBefore = new Date(
    input.now.getTime() + env.production.noticeDelayMinutes * 60_000,
  );
  await tx.productionNotice.createMany({
    data: NOTICE_CHANNELS.map((channel) => ({
      orderId: input.orderId,
      declarationId: input.declarationId,
      eventIds: [...input.eventIds],
      kind: ProductionNoticeKind.delivered,
      channel,
      status: ProductionNoticeStatus.pending,
      dedupeKey: deliveredNoticeKey(input.declarationId, channel),
      notBefore,
    })),
  });
}

/** A declaration's delivered notice, as the cancel reads it (rows locked). */
export interface DeliveredNoticeState {
  id: string;
  channel: ProductionNoticeChannel;
  status: ProductionNoticeStatus;
}

/**
 * Lock the declaration's `delivered` notices for the rest of the cancel.
 * The dispatcher claims with FOR UPDATE SKIP LOCKED, so it cannot start
 * sending one of them between this read and the cancel's commit: what
 * the cancel decides from (still pending, or already sent / sending) stays
 * true until it commits. Taken BEFORE the events are updated, the order
 * the dispatcher writes in (notice, then the events' notifiedAt).
 */
export async function lockDeliveredNotices(
  tx: Prisma.TransactionClient,
  declarationId: string,
): Promise<DeliveredNoticeState[]> {
  // Enum columns read back as text: a raw query has no enum codec.
  return tx.$queryRaw<DeliveredNoticeState[]>`
    SELECT id, channel::text AS channel, status::text AS status
    FROM "ProductionNotice"
    WHERE "declarationId" = ${declarationId} AND kind = 'delivered'
    ORDER BY id
    FOR UPDATE`;
}

/**
 * After a cancel of delivery rows of one declaration:
 *   • every delivery row of it is now cancelled → its notices still
 *     pending or failed are skipped (cancelled_before_send). While one arch
 *     stays live, they stay: the dispatcher renders the live rows only;
 *   • each channel whose notice is sent or in flight gets one correction,
 *     keyed on the LOWEST id this request newly cancelled (an event is
 *     cancelled once, so the key never repeats; keyed on the target, a
 *     later cancel of the sibling would collide), due now.
 * The cancel reason never reaches a notice (D8).
 */
export async function reviseNoticesOnCancel(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    declarationId: string;
    notices: readonly DeliveredNoticeState[];
    /** The delivery rows THIS request cancelled. */
    cancelledEventIds: readonly string[];
    declarationFullyCancelled: boolean;
    now: Date;
  },
): Promise<void> {
  if (input.cancelledEventIds.length === 0) return;
  const waiting = input.notices
    .filter(
      (notice) =>
        notice.status === ProductionNoticeStatus.pending ||
        notice.status === ProductionNoticeStatus.failed,
    )
    .map((notice) => notice.id);
  if (input.declarationFullyCancelled && waiting.length > 0) {
    await tx.productionNotice.updateMany({
      where: {
        id: { in: waiting },
        status: {
          in: [ProductionNoticeStatus.pending, ProductionNoticeStatus.failed],
        },
      },
      data: {
        status: ProductionNoticeStatus.skipped,
        skipReason: NOTICE_SKIP_REASON.CANCELLED_BEFORE_SEND,
      },
    });
  }

  const reached = new Set(
    input.notices
      .filter(
        (notice) =>
          notice.status === ProductionNoticeStatus.sent ||
          notice.status === ProductionNoticeStatus.sending,
      )
      .map((notice) => notice.channel),
  );
  const channels = NOTICE_CHANNELS.filter((channel) => reached.has(channel));
  if (channels.length === 0) return;
  const eventIds = [...input.cancelledEventIds].sort();
  await tx.productionNotice.createMany({
    data: channels.map((channel) => ({
      orderId: input.orderId,
      declarationId: input.declarationId,
      eventIds,
      kind: ProductionNoticeKind.correction,
      channel,
      status: ProductionNoticeStatus.pending,
      dedupeKey: correctionNoticeKey(eventIds[0], channel),
      notBefore: input.now,
    })),
  });
}
