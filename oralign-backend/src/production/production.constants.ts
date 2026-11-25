import {
  OrderStatus,
  ProductionArch,
  ProductionEventType,
  ProductionNoticeChannel,
} from '@prisma/client';
import type { ActCounterKey } from './production.contract';

/**
 * Lab production: the numbers and names every production module shares.
 * FOUNDATION-OWNED and frozen (production-build/CONTRACT.md): core, the
 * notice dispatcher and the admin reports import these instead of
 * re-declaring them, so a limit is changed in one place.
 */

// ── Steps and quantities ───────────────────────────────────────────────
/** Lowest step the service accepts today ("étape 0" is not offered, D10). */
export const MIN_PRODUCTION_STEP = 1;
/** Highest step number, and the widest range one declaration may cover. */
export const MAX_PRODUCTION_STEP = 200;
/** Per-arch quantity bound (matches the SQL CHECK). */
export const MAX_EVENT_QUANTITY = 500;

// ── Free text ──────────────────────────────────────────────────────────
export const NOTE_MAX_LENGTH = 1000;
export const CANCEL_REASON_MIN_LENGTH = 3;
export const CANCEL_REASON_MAX_LENGTH = 500;
export const RECIPIENT_NAME_MAX_LENGTH = 120;
export const SEARCH_MAX_LENGTH = 120;

// ── Lists ──────────────────────────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
/** Longest period the admin summary, anomalies and CSV accept, in days. */
export const MAX_REPORT_DAYS = 366;

// ── Dates (Africa/Tunis, common/time/business-day.ts) ──────────────────
/** performedAt may run at most this far ahead of the server clock. */
export const FUTURE_SKEW_MS = 2 * 60_000;
/** A technician may backdate down to (today - 7) on the Tunis calendar. */
export const TECHNICIAN_BACKDATE_DAYS = 7;
/** A technician cancels her own rows while now - createdAt is below this. */
export const TECHNICIAN_CANCEL_WINDOW_MS = 24 * 60 * 60_000;

// ── Idempotency ────────────────────────────────────────────────────────
/** Same header and shape as the order / supplemental creations. */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const IDEMPOTENCY_KEY_SHAPE = /^[A-Za-z0-9_-]{8,128}$/;

// ── Notices (outbox) ───────────────────────────────────────────────────
/** Channels a delivery declaration writes, in this order. */
export const NOTICE_CHANNELS: readonly ProductionNoticeChannel[] = [
  ProductionNoticeChannel.in_app,
  ProductionNoticeChannel.email,
];
/** Sends tried before a row is failed for good (and the admins told). */
export const NOTICE_MAX_ATTEMPTS = 5;
/** How often the dispatcher sweeps due rows. */
export const NOTICE_SWEEP_INTERVAL_MS = 60_000;
/** Most rows one sweep claims. */
export const NOTICE_SWEEP_BATCH = 50;
/** Wait before attempt n+1 after attempt n failed (index n-1; the last value repeats). */
export const NOTICE_RETRY_BACKOFF_MS: readonly number[] = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
];
/** A row still `sending` this long after its claim was lost with its process: failed, retried. */
export const NOTICE_SENDING_STALE_MS = 10 * 60_000;

/** Why a notice row was skipped (ProductionNotice.skipReason). */
export const NOTICE_SKIP_REASON = {
  /** The channel cannot run here (SMTP not configured). */
  NOT_CONFIGURED: 'not_configured',
  /** The practitioner has no usable address (account e-mail missing). */
  NO_RECIPIENT: 'no_recipient',
  /** The delivery was cancelled while the notice was still waiting. */
  CANCELLED_BEFORE_SEND: 'cancelled_before_send',
  /** A correction whose delivered notice never reached the practitioner on that channel. */
  ORIGINAL_NOT_SENT: 'original_not_sent',
} as const;
export type NoticeSkipReason =
  (typeof NOTICE_SKIP_REASON)[keyof typeof NOTICE_SKIP_REASON];

/** ProductionNotice.dedupeKey of a delivery notice. */
export function deliveredNoticeKey(
  declarationId: string,
  channel: ProductionNoticeChannel,
): string {
  return `delivered:${declarationId}:${channel}`;
}

/**
 * ProductionNotice.dedupeKey of the correction one cancel request sends.
 * `firstCancelledEventId` = the LOWEST id among the delivery rows THIS
 * request newly cancelled (never the request's target: a target that was
 * already cancelled would repeat its key). An event is cancelled at most
 * once, so the key is deterministic and never collides.
 */
export function correctionNoticeKey(
  firstCancelledEventId: string,
  channel: ProductionNoticeChannel,
): string {
  return `correction:${firstCancelledEventId}:${channel}`;
}

// ── Order statuses (owner decision D3) ─────────────────────────────────
/**
 * Statuses that ARE production, whatever the payment schedule: `paid` is
 * the legacy "paid, not started" value old rows still carry.
 */
export const PRODUCTION_STATUSES: readonly OrderStatus[] = [
  OrderStatus.paid,
  OrderStatus.fabrication,
  OrderStatus.ready_to_ship,
  OrderStatus.shipped,
];

/**
 * Statuses that are never production, even with a released batch: not
 * submitted, closed, or refused (both spellings of cancel are live).
 */
export const NON_PRODUCTION_STATUSES: readonly OrderStatus[] = [
  OrderStatus.draft,
  OrderStatus.finished,
  OrderStatus.canceled,
  OrderStatus.cancelled,
  OrderStatus.rejected,
];

/**
 * Every other status: the case is still being planned or paid, so it is
 * production only once a batch is released (the queue rule's second
 * branch). A positive list lets that branch use the status index, where a
 * NOT IN scans every order (DB-03); derived from the enum, so a new
 * OrderStatus value can never drop out of the queue silently.
 */
export const PAYMENT_PHASE_STATUSES: readonly OrderStatus[] = Object.values(
  OrderStatus,
).filter(
  (status) =>
    !PRODUCTION_STATUSES.includes(status) &&
    !NON_PRODUCTION_STATUSES.includes(status),
);

/** Statuses on which NOBODY may declare (admins included): not a live case. */
export const UNDECLARABLE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.draft,
  OrderStatus.canceled,
  OrderStatus.cancelled,
  OrderStatus.rejected,
];

// ── Acts ───────────────────────────────────────────────────────────────
/** The four acts in workshop order. */
export const PRODUCTION_ACTS: readonly ProductionEventType[] = [
  ProductionEventType.model_printed,
  ProductionEventType.aligner_thermoformed,
  ProductionEventType.aligner_cut,
  ProductionEventType.aligner_delivered,
];

export const PRODUCTION_ARCHES: readonly ProductionArch[] = [
  ProductionArch.upper,
  ProductionArch.lower,
];

/** The counter an act feeds (ActCounters key). */
export const ACT_COUNTER_KEY: Readonly<
  Record<ProductionEventType, ActCounterKey>
> = {
  [ProductionEventType.model_printed]: 'printed',
  [ProductionEventType.aligner_thermoformed]: 'thermoformed',
  [ProductionEventType.aligner_cut]: 'cut',
  [ProductionEventType.aligner_delivered]: 'delivered',
};

/**
 * The act that must come first (warning previous_stage_missing); null for printing.
 * Mirrored by the FE anomalies-view.tsx (stage_skipped wording): change both.
 */
export const PREVIOUS_ACT: Readonly<
  Record<ProductionEventType, ProductionEventType | null>
> = {
  [ProductionEventType.model_printed]: null,
  [ProductionEventType.aligner_thermoformed]: ProductionEventType.model_printed,
  [ProductionEventType.aligner_cut]: ProductionEventType.aligner_thermoformed,
  [ProductionEventType.aligner_delivered]: ProductionEventType.aligner_cut,
};

// ── Data-leak guard ────────────────────────────────────────────────────
/**
 * No key of a technician-reachable production response may match this
 * (brief, "Security"). The guard spec serialises every response built from
 * a fully filled fixture and runs findForbiddenKeys() on it.
 */
export const PRODUCTION_FORBIDDEN_KEY =
  /fee|price|amount|payment|invoice|gift|proof|relativePath|publicToken|installment|phone|email|address/i;
