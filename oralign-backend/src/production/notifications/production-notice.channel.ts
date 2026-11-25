import type {
  ProductionNoticeChannel as NoticeChannelName,
  ProductionNoticeKind,
} from '@prisma/client';
import type { Lang } from '../../common/i18n/lang';
import type { NoticeSkipReason } from '../production.constants';
import type { NoticeFacts } from './production-notice.renderer';

/**
 * One way of reaching the practitioner (CONTRACT.md §3.5). The dispatcher
 * owns the outbox (claim, retries, bookkeeping); a channel only sends.
 * Adding a channel takes, all of them (missing one fails silently: no row
 * is written, or the row is skipped as not_configured):
 *   • a class implementing this interface, listed in the
 *     PRODUCTION_NOTICE_CHANNELS provider of ProductionNotificationsModule;
 *   • its ProductionNoticeChannel enum value, and the migration adding it;
 *   • its entry in NOTICE_CHANNELS (production.constants.ts): the channels
 *     a delivery declaration writes outbox rows for;
 *   • its admin-alert label (CHANNEL_LABEL in the dispatcher; tsc asks);
 *   • the FE `productionAdmin.notices.channels.*` dictionary keys and the
 *     ProductionNoticeChannel type of lib/types/production.ts.
 */
export interface ProductionNoticeChannel {
  /** The outbox rows this class sends (ProductionNotice.channel). */
  readonly channel: NoticeChannelName;
  /**
   * Send one notice. Resolve `sent` only on a real accept by the provider,
   * `skipped` when this channel cannot reach the practitioner at all.
   * THROW on a provider error: the dispatcher counts the attempt and
   * retries with backoff.
   */
  send(notice: PreparedNotice): Promise<ChannelOutcome>;
}

/** Multi-provider token: the channel implementations, in NOTICE_CHANNELS order. */
export const PRODUCTION_NOTICE_CHANNELS = Symbol('PRODUCTION_NOTICE_CHANNELS');

/** The practitioner, as loaded at send time. */
export interface NoticeRecipient {
  /** User id (the in-app recipient). */
  id: string;
  /** Account e-mail, the address every practitioner mail goes to. */
  email: string;
  fullName: string;
  /** From the account's preferredLanguage. */
  lang: Lang;
}

/** A claimed outbox row, ready to send. */
export interface PreparedNotice {
  noticeId: string;
  kind: ProductionNoticeKind;
  orderId: string;
  declarationId: string;
  eventIds: readonly string[];
  /** null when the practitioner's account is archived: nobody to tell. */
  recipient: NoticeRecipient | null;
  facts: NoticeFacts;
}

export type ChannelOutcome =
  /** `recipientAddress` is stored on the row (doctor id in-app, the e-mail address by mail). */
  | { status: 'sent'; recipientAddress: string }
  | { status: 'skipped'; reason: NoticeSkipReason };
