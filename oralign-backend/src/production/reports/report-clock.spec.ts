import * as businessDay from '../../common/time/business-day';
import { BusinessClock } from './report-clock';

const { businessTimeOf, businessToday } = businessDay;

describe('BusinessClock', () => {
  it('prints exactly what business-day.ts prints, over a year of odd instants', () => {
    const clock = new BusinessClock();
    const start = Date.UTC(2026, 0, 1);
    // An odd step (39 min 5.671 s) walks the minutes and seconds of the
    // hour, both sides of midnight Tunis, across the whole year.
    for (let ms = start; ms < start + 366 * 86_400_000; ms += 2_345_671) {
      const instant = new Date(ms);
      expect(clock.dayOf(instant)).toBe(businessToday(instant));
      expect(clock.timeOf(instant)).toBe(businessTimeOf(instant));
    }
  });

  it('agrees on the 2008 daylight-saving switches Tunisia had (offset change inside the cache)', () => {
    const clock = new BusinessClock();
    // Tunisia observed DST in 2005-2008 (March and October switches).
    const days = ['2008-03-30', '2008-10-26'];
    for (const day of days) {
      const midnight = Date.parse(`${day}T00:00:00.000Z`) - 86_400_000;
      for (let ms = midnight; ms < midnight + 2 * 86_400_000; ms += 59_000) {
        const instant = new Date(ms);
        expect(clock.dayOf(instant)).toBe(businessToday(instant));
        expect(clock.timeOf(instant)).toBe(businessTimeOf(instant));
      }
    }
  });

  it('the Tunis day turns at 23:00 UTC', () => {
    const clock = new BusinessClock();
    expect(clock.dayOf(new Date('2026-11-03T22:59:59.999Z'))).toBe(
      '2026-11-03',
    );
    expect(clock.dayOf(new Date('2026-11-03T23:00:00.000Z'))).toBe(
      '2026-11-04',
    );
    expect(clock.timeOf(new Date('2026-11-03T23:07:30.000Z'))).toBe('00:07');
  });

  it('stampOf joins day and time, empty for null', () => {
    const clock = new BusinessClock();
    expect(clock.stampOf(new Date('2026-11-03T23:30:00.000Z'))).toBe(
      '2026-11-04 00:30',
    );
    expect(clock.stampOf(null)).toBe('');
  });

  it('formats once per UTC hour, not once per instant', () => {
    const timeOf = jest.spyOn(businessDay, 'businessTimeOf');
    const today = jest.spyOn(businessDay, 'businessToday');
    try {
      const clock = new BusinessClock();
      const hour = Date.UTC(2026, 10, 3, 9);
      for (let minute = 0; minute < 60; minute += 1) {
        const instant = new Date(hour + minute * 60_000 + 1234);
        clock.dayOf(instant);
        clock.timeOf(instant);
      }
      // First and last minute of the hour, and its day: three calls.
      expect(timeOf.mock.calls.length + today.mock.calls.length).toBe(3);
    } finally {
      timeOf.mockRestore();
      today.mockRestore();
    }
  });
});
