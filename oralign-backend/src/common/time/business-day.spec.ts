import {
  BUSINESS_TIME_ZONE,
  businessDayRange,
  businessToday,
  isCalendarDate,
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
});
