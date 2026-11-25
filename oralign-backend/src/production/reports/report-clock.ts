import { businessTimeOf, businessToday } from '../../common/time/business-day';

const HOUR_MS = 3_600_000;

/** The Tunis day and hour shared by every instant of one UTC hour. */
interface HourBucket {
  day: string;
  hour: string;
}

/**
 * businessToday() / businessTimeOf() for a whole report at once. Each of
 * them is one Intl formatting (~15 µs), and a year of rows asks for
 * hundreds of thousands: seconds of blocked event loop for one CSV.
 *
 * Africa/Tunis runs on a whole-hour offset, so inside one UTC hour where
 * the offset does not change, the Tunis day and hour are fixed and the
 * Tunis minute IS the UTC minute: three Intl calls per UTC hour (its first
 * and last minute must read HH:00 and HH:59), then plain arithmetic. Any
 * other hour (a half-hour offset, an offset change inside it) falls back
 * to the direct calls, so the result is always exactly what
 * business-day.ts prints. One clock per request: the cache dies with it.
 */
export class BusinessClock {
  private readonly buckets = new Map<number, HourBucket | null>();

  private bucketOf(instant: Date): HourBucket | null {
    const start = Math.floor(instant.getTime() / HOUR_MS) * HOUR_MS;
    let bucket = this.buckets.get(start);
    if (bucket === undefined) {
      const startInstant = new Date(start);
      const first = businessTimeOf(startInstant);
      const hour = first.slice(0, 2);
      const steady =
        first === `${hour}:00` &&
        businessTimeOf(new Date(start + HOUR_MS - 60_000)) === `${hour}:59`;
      bucket = steady ? { day: businessToday(startInstant), hour } : null;
      this.buckets.set(start, bucket);
    }
    return bucket;
  }

  /** 'YYYY-MM-DD' Tunis (businessToday). */
  dayOf(instant: Date): string {
    return this.bucketOf(instant)?.day ?? businessToday(instant);
  }

  /** 'HH:mm' Tunis (businessTimeOf). */
  timeOf(instant: Date): string {
    const bucket = this.bucketOf(instant);
    if (!bucket) return businessTimeOf(instant);
    return `${bucket.hour}:${String(instant.getUTCMinutes()).padStart(2, '0')}`;
  }

  /** 'YYYY-MM-DD HH:mm' Tunis; '' when absent. */
  stampOf(instant: Date | null): string {
    return instant ? `${this.dayOf(instant)} ${this.timeOf(instant)}` : '';
  }
}
