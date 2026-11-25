import {
  BUSINESS_TIME_ZONE,
  businessDayRange,
  businessInstant,
  businessTimeOf,
  businessToday,
  isCalendarDate,
  isClockTime,
  shiftCalendarDay,
} from './business-day';

/** What `run` throws; fails the test when it throws nothing. */
function errorOf(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('Expected an error, none was thrown.');
}

const at = (iso: string) => new Date(iso);

describe('business calendar (Africa/Tunis)', () => {
  it('is the Tunis zone', () => {
    expect(BUSINESS_TIME_ZONE).toBe('Africa/Tunis');
  });

  describe('businessToday', () => {
    it('00:30 in Tunis is already the next day, while UTC is still on the previous one', () => {
      expect(businessToday(at('2026-11-05T23:30:00.000Z'))).toBe('2026-11-06');
    });

    it('23:59:59 in Tunis is still today; midnight is tomorrow', () => {
      expect(businessToday(at('2026-11-06T22:59:59.999Z'))).toBe('2026-11-06');
      expect(businessToday(at('2026-11-06T23:00:00.000Z'))).toBe('2026-11-07');
    });

    it.each([
      ['2026-12-31T23:30:00.000Z', '2027-01-01'],
      ['2026-02-28T23:15:00.000Z', '2026-03-01'],
      ['2028-02-28T23:15:00.000Z', '2028-02-29'],
      ['2026-10-31T23:00:00.000Z', '2026-11-01'],
    ])('crosses month and year ends: %s is %s in Tunis', (instant, day) => {
      expect(businessToday(at(instant))).toBe(day);
    });

    it('defaults to now', () => {
      jest.useFakeTimers({ now: at('2026-11-05T23:30:00.000Z') });
      try {
        expect(businessToday()).toBe('2026-11-06');
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('isCalendarDate', () => {
    it.each(['2026-11-06', '2026-01-01', '2026-12-31', '2028-02-29'])(
      'accepts %s',
      (value) => {
        expect(isCalendarDate(value)).toBe(true);
      },
    );

    it.each([
      '2026-02-29',
      '2026-02-30',
      '2026-04-31',
      '2026-13-01',
      '2026-00-10',
      '2026-11-00',
      '2026-11-6',
      '26-11-06',
      '2026/11/06',
      '06-11-2026',
      '2026-11-06T00:00:00Z',
      ' 2026-11-06',
      '',
    ])('refuses %j', (value) => {
      expect(isCalendarDate(value)).toBe(false);
    });

    it.each([null, undefined, 20261106, at('2026-11-06'), ['2026-11-06']])(
      'refuses a non-string (%p)',
      (value) => {
        expect(isCalendarDate(value)).toBe(false);
      },
    );
  });

  describe('businessDayRange', () => {
    it('one day: from its Tunis midnight up to the next one, excluded', () => {
      expect(businessDayRange('2026-11-06', '2026-11-06')).toStrictEqual({
        gte: at('2026-11-05T23:00:00.000Z'),
        lt: at('2026-11-06T23:00:00.000Z'),
      });
    });

    it('several days, both ends included', () => {
      expect(businessDayRange('2026-11-01', '2026-11-06')).toStrictEqual({
        gte: at('2026-10-31T23:00:00.000Z'),
        lt: at('2026-11-06T23:00:00.000Z'),
      });
    });

    it('a payment at 00:30 in Tunis counts on its Tunis day, not the UTC one', () => {
      const paid = at('2026-11-05T23:30:00.000Z');
      const nov5 = businessDayRange('2026-11-05', '2026-11-05');
      const nov6 = businessDayRange('2026-11-06', '2026-11-06');
      expect(paid >= nov5.lt!).toBe(true);
      expect(paid >= nov6.gte! && paid < nov6.lt!).toBe(true);
    });

    it.each([
      ['2026-12-31', '2026-12-30T23:00:00.000Z', '2026-12-31T23:00:00.000Z'],
      ['2027-01-01', '2026-12-31T23:00:00.000Z', '2027-01-01T23:00:00.000Z'],
      ['2026-02-28', '2026-02-27T23:00:00.000Z', '2026-02-28T23:00:00.000Z'],
      ['2028-02-29', '2028-02-28T23:00:00.000Z', '2028-02-29T23:00:00.000Z'],
      ['2026-11-30', '2026-11-29T23:00:00.000Z', '2026-11-30T23:00:00.000Z'],
    ])('rolls over month and year ends: %s', (day, gte, lt) => {
      expect(businessDayRange(day, day)).toStrictEqual({
        gte: at(gte),
        lt: at(lt),
      });
    });

    it('reads the offset from the time zone data, never a constant: Tunisia was UTC+2 in summer 2008', () => {
      expect(businessDayRange('2008-07-01', '2008-07-01')).toStrictEqual({
        gte: at('2008-06-30T22:00:00.000Z'),
        lt: at('2008-07-01T22:00:00.000Z'),
      });
      // The day the clocks moved forward lasted 23 hours.
      expect(businessDayRange('2008-03-30', '2008-03-30')).toStrictEqual({
        gte: at('2008-03-29T23:00:00.000Z'),
        lt: at('2008-03-30T22:00:00.000Z'),
      });
    });

    it('only from: open after it', () => {
      expect(businessDayRange('2026-11-01')).toStrictEqual({
        gte: at('2026-10-31T23:00:00.000Z'),
      });
      expect(businessDayRange('2026-11-01', null)).toStrictEqual({
        gte: at('2026-10-31T23:00:00.000Z'),
      });
    });

    it('only to: open before it', () => {
      expect(businessDayRange(undefined, '2026-11-06')).toStrictEqual({
        lt: at('2026-11-06T23:00:00.000Z'),
      });
    });

    it('no bound (or blank ones): no range', () => {
      expect(businessDayRange()).toStrictEqual({});
      expect(businessDayRange('', '')).toStrictEqual({});
    });

    it('a period that ends before it starts is a 400 INVALID_DATE_RANGE', () => {
      expect(
        errorOf(() => businessDayRange('2026-11-07', '2026-11-06')),
      ).toMatchObject({ statusCode: 400, errorCode: 'INVALID_DATE_RANGE' });
    });

    it.each([
      ['2026-02-30', '2026-03-01'],
      ['2026-03-01', '2026-02-30'],
      ['2026-11-6', undefined],
      [undefined, 'tomorrow'],
    ])(
      'a date that is malformed or does not exist is a 400 INVALID_DATE (%s → %s)',
      (from, to) => {
        expect(errorOf(() => businessDayRange(from, to))).toMatchObject({
          statusCode: 400,
          errorCode: 'INVALID_DATE',
        });
      },
    );
  });

  describe('businessTimeOf', () => {
    it('prints the Tunis wall clock, 24 h, minutes floored', () => {
      expect(businessTimeOf(at('2026-11-25T08:30:59.999Z'))).toBe('09:30');
      expect(businessTimeOf(at('2026-11-05T23:05:00.000Z'))).toBe('00:05');
      expect(businessTimeOf(at('2008-07-01T07:30:00.000Z'))).toBe('09:30');
    });

    it('round-trips with businessInstant', () => {
      expect(businessTimeOf(businessInstant('2026-11-25', '17:45'))).toBe(
        '17:45',
      );
    });
  });

  describe('shiftCalendarDay', () => {
    it.each([
      ['2026-11-25', -1, '2026-11-24'],
      ['2026-11-25', -7, '2026-11-18'],
      ['2026-03-01', -1, '2026-02-28'],
      ['2028-03-01', -1, '2028-02-29'],
      ['2026-12-31', 1, '2027-01-01'],
      ['2026-11-25', 0, '2026-11-25'],
    ])('%s %+d is %s', (day, days, expected) => {
      expect(shiftCalendarDay(day, days)).toBe(expected);
    });

    it('a malformed day is a 400 INVALID_DATE', () => {
      expect(errorOf(() => shiftCalendarDay('2026-02-30', 1))).toMatchObject({
        statusCode: 400,
        errorCode: 'INVALID_DATE',
      });
    });
  });

  describe('isClockTime', () => {
    it.each(['00:00', '07:05', '12:30', '23:59'])('accepts %s', (value) => {
      expect(isClockTime(value)).toBe(true);
    });

    it.each([
      '7:05',
      '24:00',
      '23:60',
      '07:05:00',
      '0705',
      ' 07:05',
      '07h05',
      '',
      null,
      undefined,
      705,
    ])('refuses %p', (value) => {
      expect(isClockTime(value)).toBe(false);
    });
  });

  describe('businessInstant', () => {
    it('reads the wall clock in Tunis (UTC+1 today), whatever the server zone', () => {
      expect(businessInstant('2026-11-25', '09:30')).toStrictEqual(
        at('2026-11-25T08:30:00.000Z'),
      );
    });

    it('00:30 in Tunis is still the previous day in UTC', () => {
      expect(businessInstant('2026-11-06', '00:30')).toStrictEqual(
        at('2026-11-05T23:30:00.000Z'),
      );
    });

    it('00:00 is the business midnight businessDayRange starts from', () => {
      expect(businessInstant('2026-11-06', '00:00')).toStrictEqual(
        businessDayRange('2026-11-06', '2026-11-06').gte,
      );
    });

    it('23:59 stays inside the day businessDayRange bounds', () => {
      const instant = businessInstant('2026-12-31', '23:59');
      const day = businessDayRange('2026-12-31', '2026-12-31');
      expect(instant).toStrictEqual(at('2026-12-31T22:59:00.000Z'));
      expect(instant >= day.gte! && instant < day.lt!).toBe(true);
    });

    it('round-trips through businessToday', () => {
      expect(businessToday(businessInstant('2027-01-01', '00:15'))).toBe(
        '2027-01-01',
      );
      expect(businessToday(businessInstant('2026-12-31', '23:45'))).toBe(
        '2026-12-31',
      );
    });

    it('honours a daylight-saving period from the zone data: Tunisia was UTC+2 in summer 2008', () => {
      expect(businessInstant('2008-07-01', '09:30')).toStrictEqual(
        at('2008-07-01T07:30:00.000Z'),
      );
      // Either side of the 2008-03-30 jump (02:00 → 03:00, i.e. 01:00 UTC).
      expect(businessInstant('2008-03-30', '01:30')).toStrictEqual(
        at('2008-03-30T00:30:00.000Z'),
      );
      expect(businessInstant('2008-03-30', '03:30')).toStrictEqual(
        at('2008-03-30T01:30:00.000Z'),
      );
    });

    it('a time the spring jump skips lands as far past the jump (02:30 → 03:30)', () => {
      expect(businessInstant('2008-03-30', '02:30')).toStrictEqual(
        businessInstant('2008-03-30', '03:30'),
      );
    });

    it('a time the fall-back repeats resolves to its second occurrence', () => {
      // 2008-10-26: 03:00 summer time (01:00 UTC) went back to 02:00.
      expect(businessInstant('2008-10-26', '02:30')).toStrictEqual(
        at('2008-10-26T01:30:00.000Z'),
      );
    });

    it.each([
      ['2026-02-30', '09:00'],
      ['2026-11-6', '09:00'],
      ['', '09:00'],
      ['tomorrow', '09:00'],
    ])(
      'a day that is malformed or does not exist is a 400 INVALID_DATE (%j)',
      (day, time) => {
        expect(errorOf(() => businessInstant(day, time))).toMatchObject({
          statusCode: 400,
          errorCode: 'INVALID_DATE',
        });
      },
    );

    it.each(['9:00', '24:00', '09:60', '09:00:00', ''])(
      'a malformed time is a 400 INVALID_TIME (%j)',
      (time) => {
        expect(
          errorOf(() => businessInstant('2026-11-25', time)),
        ).toMatchObject({
          statusCode: 400,
          errorCode: 'INVALID_TIME',
        });
      },
    );
  });
});
