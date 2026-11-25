import { AppException } from '../../common/exceptions/app.exception';
import { MAX_REPORT_DAYS } from '../production.constants';
import { isInRange, resolveReportPeriod } from './report-period';

function errorOf(run: () => unknown): AppException {
  try {
    run();
  } catch (error) {
    if (error instanceof AppException) return error;
    throw error;
  }
  throw new Error('expected an AppException');
}

describe('resolveReportPeriod', () => {
  it('turns Tunis days into UTC bounds, both days included', () => {
    const period = resolveReportPeriod('2026-11-01', '2026-11-30');
    expect(period.from).toBe('2026-11-01');
    expect(period.to).toBe('2026-11-30');
    // Africa/Tunis is UTC+1: 00:00 Tunis is 23:00 UTC the day before.
    expect(period.range.gte.toISOString()).toBe('2026-10-31T23:00:00.000Z');
    expect(period.range.lt.toISOString()).toBe('2026-11-30T23:00:00.000Z');
  });

  it('a single day is a 24 h window', () => {
    const { range } = resolveReportPeriod('2026-11-03', '2026-11-03');
    expect(range.lt.getTime() - range.gte.getTime()).toBe(24 * 3600_000);
  });

  it('refuses a period that ends before it starts: 400 INVALID_DATE_RANGE', () => {
    const error = errorOf(() =>
      resolveReportPeriod('2026-11-30', '2026-11-01'),
    );
    expect(error.statusCode).toBe(400);
    expect(error.errorCode).toBe('INVALID_DATE_RANGE');
  });

  it(`accepts exactly ${MAX_REPORT_DAYS} days and refuses one more`, () => {
    // 2026-01-01 + 365 days = 2027-01-01: 366 days, both included.
    expect(() => resolveReportPeriod('2026-01-01', '2027-01-01')).not.toThrow();
    const error = errorOf(() =>
      resolveReportPeriod('2026-01-01', '2027-01-02'),
    );
    expect(error.statusCode).toBe(400);
    expect(error.errorCode).toBe('INVALID_DATE_RANGE');
  });

  it('a day that does not exist is a 400 INVALID_DATE', () => {
    const error = errorOf(() =>
      resolveReportPeriod('2026-02-30', '2026-03-01'),
    );
    expect(error.statusCode).toBe(400);
    expect(error.errorCode).toBe('INVALID_DATE');
  });
});

describe('isInRange', () => {
  const range = {
    gte: new Date('2026-11-02T23:00:00.000Z'),
    lt: new Date('2026-11-03T23:00:00.000Z'),
  };

  it('includes the lower bound and excludes the upper one', () => {
    expect(isInRange(range.gte, range)).toBe(true);
    expect(isInRange(new Date('2026-11-03T22:59:59.999Z'), range)).toBe(true);
    expect(isInRange(range.lt, range)).toBe(false);
    expect(isInRange(new Date('2026-11-02T22:59:59.999Z'), range)).toBe(false);
  });

  it('null is never in range', () => {
    expect(isInRange(null, range)).toBe(false);
  });
});
