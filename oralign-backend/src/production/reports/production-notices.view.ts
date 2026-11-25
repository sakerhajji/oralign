import { Prisma, ProductionNoticeStatus } from '@prisma/client';
import {
  NOTICE_MAX_ATTEMPTS,
  NOTICE_SKIP_REASON,
} from '../production.constants';
import type { ProductionNoticeView } from '../production.contract';
import { isoOrNull } from './report-views';

/**
 * The notice list of the admin desk (ADMIN ONLY: it carries the recipient
 * address) and the retry rule.
 */

/** Skip reasons a retry can fix once the setup or the address is corrected. */
export const RETRYABLE_SKIP_REASONS: readonly string[] = [
  NOTICE_SKIP_REASON.NOT_CONFIGURED,
  NOTICE_SKIP_REASON.NO_RECIPIENT,
];

/**
 * The retry condition, as a where: a `failed` row, or a row `skipped` for
 * a fixable reason. Never `sent`, `sending` (the dispatcher holds it),
 * `pending`, nor skipped for a cancelled delivery.
 */
export function retryableNoticeWhere(): Prisma.ProductionNoticeWhereInput {
  return {
    OR: [
      { status: ProductionNoticeStatus.failed },
      {
        status: ProductionNoticeStatus.skipped,
        skipReason: { in: [...RETRYABLE_SKIP_REASONS] },
      },
    ],
  };
}

/**
 * Failed for good: the dispatcher no longer retries the row on its own
 * (its claim takes `attempts < NOTICE_MAX_ATTEMPTS` only). A `failed` row
 * below the limit already has its next attempt scheduled.
 */
export function exhaustedNoticeWhere(): Prisma.ProductionNoticeWhereInput {
  return {
    status: ProductionNoticeStatus.failed,
    attempts: { gte: NOTICE_MAX_ATTEMPTS },
  };
}

/**
 * The list filter of GET production/admin/notices. `exhausted` true keeps
 * the rows failed for good, false every other row. With a status as well,
 * both apply (AND), so a status never overrides the exhausted rule.
 */
export function noticeListWhere(query: {
  status?: ProductionNoticeStatus;
  exhausted?: boolean;
}): Prisma.ProductionNoticeWhereInput {
  const filters: Prisma.ProductionNoticeWhereInput[] = [];
  if (query.status) filters.push({ status: query.status });
  if (query.exhausted !== undefined) {
    filters.push(
      query.exhausted
        ? exhaustedNoticeWhere()
        : { NOT: exhaustedNoticeWhere() },
    );
  }
  if (filters.length === 0) return {};
  return filters.length === 1 ? filters[0] : { AND: filters };
}

/** retryableNoticeWhere() on a loaded row. */
export function isRetryableNotice(notice: {
  status: ProductionNoticeStatus;
  skipReason: string | null;
}): boolean {
  return (
    notice.status === ProductionNoticeStatus.failed ||
    (notice.status === ProductionNoticeStatus.skipped &&
      notice.skipReason !== null &&
      RETRYABLE_SKIP_REASONS.includes(notice.skipReason))
  );
}

/** The row + its order code (2 statements per call). */
export const NOTICE_VIEW_SELECT = {
  id: true,
  orderId: true,
  declarationId: true,
  eventIds: true,
  kind: true,
  channel: true,
  status: true,
  skipReason: true,
  recipientAddress: true,
  attempts: true,
  lastError: true,
  notBefore: true,
  sentAt: true,
  createdAt: true,
  updatedAt: true,
  order: { select: { orderCode: true } },
} satisfies Prisma.ProductionNoticeSelect;

export type NoticeViewRow = Prisma.ProductionNoticeGetPayload<{
  select: typeof NOTICE_VIEW_SELECT;
}>;

/** Newest first; id makes the order total for LIMIT / OFFSET. */
export const NOTICE_ORDER_BY = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.ProductionNoticeOrderByWithRelationInput[];

export function noticeViewOf(row: NoticeViewRow): ProductionNoticeView {
  return {
    id: row.id,
    orderId: row.orderId,
    orderCode: row.order.orderCode,
    declarationId: row.declarationId,
    eventIds: row.eventIds,
    kind: row.kind,
    channel: row.channel,
    status: row.status,
    skipReason: row.skipReason,
    recipientAddress: row.recipientAddress,
    attempts: row.attempts,
    lastError: row.lastError,
    notBefore: row.notBefore.toISOString(),
    sentAt: isoOrNull(row.sentAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    retryable: isRetryableNotice(row),
  };
}
