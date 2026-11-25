import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  NotificationType,
  ProductionNoticeChannel as NoticeChannelName,
  ProductionNoticeKind,
} from '@prisma/client';
import { env } from '../../common/config/env';
import { pickLang } from '../../common/i18n/lang';
import { NotificationsService } from '../../notifications/services/notifications.service';
import {
  countersFromProgress,
  plannedTotalsInputOf,
  resolvePlannedTotals,
} from '../kernel';
import {
  NOTICE_MAX_ATTEMPTS,
  NOTICE_RETRY_BACKOFF_MS,
  NOTICE_SKIP_REASON,
  NOTICE_SWEEP_BATCH,
  NOTICE_SWEEP_INTERVAL_MS,
  deliveredNoticeKey,
} from '../production.constants';
import {
  PRODUCTION_NOTICE_CHANNELS,
  type PreparedNotice,
  type ProductionNoticeChannel,
} from './production-notice.channel';
import { buildNoticeFacts } from './production-notice.renderer';
import {
  correctionDecision,
  errorText,
  isFinalAttempt,
  retryDelayMs,
} from './production-notice.rules';
import {
  ProductionNoticeStore,
  type ClaimedBatch,
  type ClaimedNotice,
  type ExhaustedNotice,
  type NoticeEventRow,
} from './production-notice.store';

/**
 * How the admin alert names a channel. A Record over the enum, so a new
 * ProductionNoticeChannel value does not compile until it has a label.
 */
const CHANNEL_LABEL: Record<NoticeChannelName, { en: string; fr: string }> = {
  [NoticeChannelName.in_app]: { en: 'in-app', fr: 'dans l’application' },
  [NoticeChannelName.email]: { en: 'e-mail', fr: 'e-mail' },
};

/** Let the app finish booting before the first sweep (a deploy leaves due rows behind). */
const BOOT_DELAY_MS = 15_000;
/** A full batch or a kick during a pass runs another one, at most this many per sweep. */
const MAX_PASSES_PER_SWEEP = 10;

/**
 * Sends the ProductionNotice outbox (CONTRACT.md §3.5). Core writes the rows
 * in the declare / cancel transaction; this class turns them into messages:
 *
 *   1. claim due rows (store.claimDue: stale recovery + a conditional,
 *      SKIP LOCKED claim, multi-instance safe);
 *   2. load what rendering needs in one batched call (store.loadClaimed);
 *   3. per row, in its own try: decide (a delivered notice whose rows are
 *      all cancelled is skipped; a correction waits for, sends after, or
 *      is skipped with its original), render at send time, hand it to the
 *      channel, record the outcome (sent + notifiedAt, skipped, or failed
 *      with backoff; the last failure tells the admins once).
 *
 * Channels are injected (PRODUCTION_NOTICE_CHANNELS): this class never
 * knows how a bell row or an e-mail is made.
 */
@Injectable()
export class ProductionNoticeDispatcher
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ProductionNoticeDispatcher.name);
  private readonly channels: ReadonlyMap<
    NoticeChannelName,
    ProductionNoticeChannel
  >;
  private bootTimer?: NodeJS.Timeout;
  private sweepTimer?: NodeJS.Timeout;
  private running = false;
  /** A kick arrived while a pass was running: run another one after it. */
  private kicked = false;
  private stopped = false;

  constructor(
    private readonly store: ProductionNoticeStore,
    private readonly notifications: NotificationsService,
    @Inject(PRODUCTION_NOTICE_CHANNELS)
    channels: readonly ProductionNoticeChannel[],
  ) {
    this.channels = new Map(channels.map((c) => [c.channel, c]));
  }

  onModuleInit(): void {
    // Specs drive sweep() themselves; a live timer would hit the mocks.
    if (env.nodeEnv === 'test') return;
    this.bootTimer = setTimeout(() => this.kick(), BOOT_DELAY_MS);
    this.bootTimer.unref?.();
    this.sweepTimer = setInterval(() => this.kick(), NOTICE_SWEEP_INTERVAL_MS);
    // Never keep the process alive just for the sweeper.
    this.sweepTimer.unref?.();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.bootTimer) clearTimeout(this.bootTimer);
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  /**
   * Run a sweep now instead of waiting for the next tick. Fire-and-forget:
   * callers never await it, and it never throws.
   */
  kick(): void {
    if (this.stopped) return;
    this.sweep().catch((error: unknown) =>
      this.logger.error(`Production notice sweep failed: ${errorText(error)}`),
    );
  }

  /**
   * Claim and send what is due. Never throws. Re-entrancy: a sweep that
   * finds another one running only asks it for one more pass, so a slow
   * SMTP relay never stacks sweeps, and a kick (an admin retry) made
   * during a pass still gets a pass of its own.
   */
  async sweep(): Promise<void> {
    if (this.running) {
      this.kicked = true;
      return;
    }
    this.running = true;
    try {
      for (let pass = 0; pass < MAX_PASSES_PER_SWEEP; pass += 1) {
        this.kicked = false;
        const claimed = await this.runPass();
        if (claimed < NOTICE_SWEEP_BATCH && !this.kicked) break;
      }
    } catch (error) {
      // Rows claimed by a pass that died here stay `sending`; the stale
      // recovery of a later sweep puts them back in the retry cycle.
      this.logger.error(`Production notice sweep failed: ${errorText(error)}`);
    } finally {
      this.running = false;
    }
  }

  /** One claim + send round. Returns how many rows it claimed. */
  private async runPass(): Promise<number> {
    const { claimedIds, exhausted } = await this.store.claimDue(new Date());
    await this.tellAdmins(exhausted);
    if (claimedIds.length === 0) return 0;
    const batch = await this.store.loadClaimed(claimedIds);
    for (const notice of batch.notices) {
      try {
        await this.handle(notice, batch);
      } catch (error) {
        await this.recordFailure(notice, error);
      }
    }
    return claimedIds.length;
  }

  private async handle(notice: ClaimedNotice, batch: ClaimedBatch) {
    const rows = notice.eventIds
      .map((id) => batch.events.get(id))
      .filter((row): row is NoticeEventRow => row !== undefined);
    if (rows.length === 0) {
      throw new Error('None of the events this notice reports on exist.');
    }

    let reported: NoticeEventRow[];
    if (notice.kind === ProductionNoticeKind.delivered) {
      // While one arch stays live the notice stays, with that arch only.
      reported = rows.filter((row) => row.cancelledAt === null);
      if (reported.length === 0) {
        await this.store.markSkipped(
          notice.id,
          NOTICE_SKIP_REASON.CANCELLED_BEFORE_SEND,
        );
        return;
      }
    } else {
      const original =
        batch.originals.get(
          deliveredNoticeKey(notice.declarationId, notice.channel),
        ) ?? null;
      const decision = correctionDecision(original);
      if (decision === 'wait') {
        await this.store.release(
          notice.id,
          new Date(Date.now() + NOTICE_RETRY_BACKOFF_MS[0]),
        );
        return;
      }
      if (decision === 'skip') {
        await this.store.markSkipped(
          notice.id,
          NOTICE_SKIP_REASON.ORIGINAL_NOT_SENT,
        );
        return;
      }
      reported = rows.filter((row) => row.cancelledAt !== null);
      if (reported.length === 0) {
        throw new Error('A correction reports on cancelled events only.');
      }
    }

    const channel = this.channels.get(notice.channel);
    if (!channel) {
      await this.store.markSkipped(
        notice.id,
        NOTICE_SKIP_REASON.NOT_CONFIGURED,
      );
      return;
    }
    const outcome = await channel.send(this.prepare(notice, reported));
    if (outcome.status === 'sent') {
      await this.store.markSent(notice, outcome.recipientAddress, new Date());
    } else {
      await this.store.markSkipped(notice.id, outcome.reason);
    }
  }

  /** The row, its reported events and the case's progress, rendered at send time. */
  private prepare(
    notice: ClaimedNotice,
    reported: readonly NoticeEventRow[],
  ): PreparedNotice {
    const { order } = notice;
    const doctor = order.doctor;
    return {
      noticeId: notice.id,
      kind: notice.kind,
      orderId: notice.orderId,
      declarationId: notice.declarationId,
      eventIds: notice.eventIds,
      // An archived practitioner can no longer read anything we send.
      recipient: doctor.deletedAt
        ? null
        : {
            id: doctor.id,
            email: doctor.email,
            fullName: doctor.fullName,
            lang: pickLang(doctor.preferredLanguage),
          },
      facts: buildNoticeFacts({
        kind: notice.kind,
        orderCode: order.orderCode,
        patientName: order.patient.fullName,
        rows: reported,
        planned: resolvePlannedTotals(plannedTotalsInputOf(order)),
        counters: countersFromProgress(order.productionProgress),
      }),
    };
  }

  private async recordFailure(
    notice: ClaimedNotice,
    error: unknown,
  ): Promise<void> {
    const attempts = notice.attempts + 1;
    const lastError = errorText(error);
    this.logger.error(
      `Production notice ${notice.id} (${notice.kind}, ${notice.channel}) attempt ${attempts}/${NOTICE_MAX_ATTEMPTS} failed: ${lastError}`,
    );
    try {
      const written = await this.store.markFailed(notice.id, {
        attempts,
        lastError,
        notBefore: new Date(Date.now() + retryDelayMs(attempts)),
      });
      if (written && isFinalAttempt(attempts)) {
        await this.tellAdmins([
          {
            id: notice.id,
            orderId: notice.orderId,
            orderCode: notice.order.orderCode,
            kind: notice.kind,
            channel: notice.channel,
          },
        ]);
      }
    } catch (writeError) {
      // The row stays `sending`: the stale recovery retries it later.
      this.logger.error(
        `Could not record the failure of production notice ${notice.id}: ${errorText(writeError)}`,
      );
    }
  }

  /** One admin broadcast per row that ran out of attempts (never retried automatically). */
  private async tellAdmins(exhausted: readonly ExhaustedNotice[]) {
    for (const notice of exhausted) {
      const delivered = notice.kind === ProductionNoticeKind.delivered;
      const label = CHANNEL_LABEL[notice.channel];
      try {
        await this.notifications.broadcastToAdmins({
          type: NotificationType.system_message,
          title: {
            en: 'Practitioner notice not sent',
            fr: 'Notification au praticien non envoyée',
          },
          message: {
            en:
              `The ${delivered ? 'delivery' : 'correction'} notice (${label.en}) ` +
              `for order ${notice.orderCode} failed ${NOTICE_MAX_ATTEMPTS} times and will not be retried automatically.`,
            fr:
              `La notification ${delivered ? 'de livraison' : 'de correction'} (${label.fr}) ` +
              `de la commande ${notice.orderCode} a échoué ${NOTICE_MAX_ATTEMPTS} fois ; elle ne sera plus relancée automatiquement.`,
          },
          link: '/dashboard/production/pilotage?view=notices',
          metadata: {
            noticeId: notice.id,
            orderId: notice.orderId,
            kind: notice.kind,
            channel: notice.channel,
          },
        });
      } catch (error) {
        this.logger.error(
          `Could not tell the admins about production notice ${notice.id}: ${errorText(error)}`,
        );
      }
    }
  }
}
