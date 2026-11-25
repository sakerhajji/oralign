/**
 * The lab production limits, shared by the technician screens
 * (components/production) and the admin desk (components/production-admin).
 * They mirror oralign-backend/src/production/production.constants.ts:
 * change both sides together. The server stays the judge; these only
 * shape the forms and the copy.
 */

/** Steps a declaration may name (D10: no "étape 0" in this build). */
export const MIN_STEP = 1;
export const MAX_STEP = 200;
export const MAX_QUANTITY = 500;

export const NOTE_MAX = 1000;
export const RECIPIENT_NAME_MAX = 120;
export const REASON_MIN = 3;
export const REASON_MAX = 500;
export const SEARCH_MAX_LENGTH = 120;

/** The repo's default page size (the API's `limit` default). */
export const PAGE_SIZE = 20;

/** Longest admin period, in Tunis days (both ends included). */
export const MAX_REPORT_DAYS = 366;

/** The server accepts an act at most 2 minutes ahead of its clock. */
export const FUTURE_SKEW_MS = 2 * 60_000;

/** A practitioner notice is failed for good after this many attempts. */
export const NOTICE_MAX_ATTEMPTS = 5;
