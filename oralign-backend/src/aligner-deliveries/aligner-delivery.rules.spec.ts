import { OrderStatus } from '@prisma/client';
import {
  ALIGNER_DELIVERY_ERROR,
  assertNoConflict,
  assertOrderAcceptsDeliveries,
  assertRangeWellFormed,
  assertTotalCoversDeliveries,
  assertWithinTotal,
  countDelivered,
  findConflict,
  firstUndelivered,
  mergeRanges,
  parseDeliveryDate,
  resolveTotal,
  type PersistedDelivery,
} from './aligner-delivery.rules';

/** The error a synchronous call throws — typed `unknown`, not `any`. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to throw');
}

const delivered = (
  fromAligner: number,
  toAligner: number,
  on = '2026-09-07',
): PersistedDelivery => ({
  fromAligner,
  toAligner,
  deliveredAt: new Date(`${on}T00:00:00.000Z`),
});

describe('aligner delivery rules', () => {
  describe('ranges and totals', () => {
    it('merges adjacent and overlapping ranges, sorted, without mutating the input', () => {
      const input = [
        { fromAligner: 4, toAligner: 7 },
        { fromAligner: 1, toAligner: 3 },
        { fromAligner: 10, toAligner: 12 },
      ];
      const snapshot = JSON.stringify(input);
      expect(mergeRanges(input)).toEqual([
        { fromAligner: 1, toAligner: 7 },
        { fromAligner: 10, toAligner: 12 },
      ]);
      expect(JSON.stringify(input)).toBe(snapshot);
    });

    it('counts 1 → 3 then 4 → 7 as 7 delivered aligners', () => {
      expect(countDelivered([delivered(1, 3), delivered(4, 7)])).toBe(7);
    });

    it('counts distinct aligners, never double-counting an overlap that slipped in', () => {
      expect(countDelivered([delivered(1, 5), delivered(3, 7)])).toBe(7);
    });

    it('counts non-contiguous batches correctly (1 → 3 and 8 → 10 = 6)', () => {
      expect(countDelivered([delivered(8, 10), delivered(1, 3)])).toBe(6);
    });

    it.each([
      [[], 20, 1],
      [[delivered(1, 3)], 20, 4],
      [[delivered(1, 3), delivered(4, 7)], 20, 8],
      [[delivered(1, 3), delivered(8, 10)], 20, 4],
      [[delivered(2, 5)], 20, 1],
      [[delivered(1, 20)], 20, null],
      [[delivered(1, 20)], null, 21],
    ])(
      'next undelivered aligner of %j (total %s) is %s',
      (ranges, total, expected) => {
        expect(firstUndelivered(ranges, total)).toBe(expected);
      },
    );
  });

  describe('validation', () => {
    it('accepts a well-formed range, including a single aligner', () => {
      expect(() =>
        assertRangeWellFormed({ fromAligner: 1, toAligner: 3 }),
      ).not.toThrow();
      expect(() =>
        assertRangeWellFormed({ fromAligner: 5, toAligner: 5 }),
      ).not.toThrow();
    });

    it.each([
      [{ fromAligner: 5, toAligner: 3 }],
      [{ fromAligner: 0, toAligner: 3 }],
      [{ fromAligner: 1.5, toAligner: 3 }],
    ])('rejects %j with 400 ALIGNER_RANGE_INVALID', (range) => {
      expect(thrownBy(() => assertRangeWellFormed(range))).toMatchObject({
        statusCode: 400,
        errorCode: ALIGNER_DELIVERY_ERROR.RANGE_INVALID,
      });
    });

    it('rejects a range beyond the series with 400 ALIGNER_RANGE_OUT_OF_BOUNDS', () => {
      expect(
        thrownBy(() =>
          assertWithinTotal({ fromAligner: 18, toAligner: 21 }, 20),
        ),
      ).toMatchObject({
        statusCode: 400,
        errorCode: ALIGNER_DELIVERY_ERROR.RANGE_OUT_OF_BOUNDS,
      });
      expect(() =>
        assertWithinTotal({ fromAligner: 18, toAligner: 20 }, 20),
      ).not.toThrow();
    });

    it('accepts the next contiguous batch 4 → 7 after 1 → 3', () => {
      expect(() =>
        assertNoConflict({ fromAligner: 4, toAligner: 7 }, [delivered(1, 3)]),
      ).not.toThrow();
    });

    it('rejects an overlapping batch 2 → 5 after 1 → 3 with 409 ALIGNER_DELIVERY_OVERLAP', () => {
      expect(
        thrownBy(() =>
          assertNoConflict({ fromAligner: 2, toAligner: 5 }, [delivered(1, 3)]),
        ),
      ).toMatchObject({
        statusCode: 409,
        errorCode: ALIGNER_DELIVERY_ERROR.OVERLAP,
      });
    });

    it('reports the identical range as a duplicate, naming when it was delivered', () => {
      const error = thrownBy(() =>
        assertNoConflict({ fromAligner: 1, toAligner: 3 }, [
          delivered(1, 3, '2026-09-07'),
        ]),
      );
      expect(error).toMatchObject({
        statusCode: 409,
        errorCode: ALIGNER_DELIVERY_ERROR.DUPLICATE,
      });
      expect((error as Error).message).toContain('2026-09-07');
    });

    it.each([
      ['contained', 5, 6],
      ['containing', 1, 10],
      ['touching the end', 7, 9],
    ])('flags a %s range as an overlap', (_label, fromAligner, toAligner) => {
      expect(
        findConflict({ fromAligner, toAligner }, [delivered(4, 7)])?.kind,
      ).toBe('overlap');
    });

    it('allows a batch after a gap (8 → 10 while 4 → 7 is still pending)', () => {
      expect(
        findConflict({ fromAligner: 8, toAligner: 10 }, [delivered(1, 3)]),
      ).toBeNull();
    });
  });

  describe('series size', () => {
    it('requires the total on the first delivery', () => {
      expect(thrownBy(() => resolveTotal(null, undefined))).toMatchObject({
        statusCode: 400,
        errorCode: ALIGNER_DELIVERY_ERROR.TOTAL_REQUIRED,
      });
      expect(resolveTotal(null, 20)).toBe(20);
    });

    it('keeps the stored total and refuses a different one from a delivery request', () => {
      expect(resolveTotal(20, undefined)).toBe(20);
      expect(resolveTotal(20, 20)).toBe(20);
      expect(thrownBy(() => resolveTotal(20, 24))).toMatchObject({
        statusCode: 400,
        errorCode: ALIGNER_DELIVERY_ERROR.TOTAL_ALREADY_SET,
      });
    });

    it('never lets a corrected total drop below an aligner already delivered', () => {
      const history = [delivered(1, 3), delivered(4, 7)];
      expect(
        thrownBy(() => assertTotalCoversDeliveries(6, history)),
      ).toMatchObject({
        statusCode: 400,
        errorCode: ALIGNER_DELIVERY_ERROR.TOTAL_BELOW_DELIVERED,
      });
      expect(() => assertTotalCoversDeliveries(7, history)).not.toThrow();
      expect(() => assertTotalCoversDeliveries(1, [])).not.toThrow();
    });
  });

  describe('order status', () => {
    it.each([
      OrderStatus.draft,
      OrderStatus.canceled,
      OrderStatus.cancelled,
      OrderStatus.rejected,
    ])('refuses deliveries on a %s order', (status) => {
      expect(
        thrownBy(() => assertOrderAcceptsDeliveries(status)),
      ).toMatchObject({
        statusCode: 400,
        errorCode: ALIGNER_DELIVERY_ERROR.ORDER_NOT_DELIVERABLE,
      });
    });

    it.each([
      OrderStatus.fabrication,
      OrderStatus.shipped,
      OrderStatus.finished,
      OrderStatus.paid,
    ])('accepts deliveries on a %s order', (status) => {
      expect(() => assertOrderAcceptsDeliveries(status)).not.toThrow();
    });
  });

  describe('delivery date', () => {
    const now = new Date('2026-09-21T10:00:00.000Z');

    it('defaults to today (UTC calendar date)', () => {
      expect(parseDeliveryDate(undefined, now).toISOString()).toBe(
        '2026-09-21T00:00:00.000Z',
      );
    });

    it('parses a past calendar date to UTC midnight', () => {
      expect(parseDeliveryDate('2026-09-07', now).toISOString()).toBe(
        '2026-09-07T00:00:00.000Z',
      );
    });

    it("allows tomorrow's date (a clinic east of UTC just after local midnight)", () => {
      expect(() => parseDeliveryDate('2026-09-22', now)).not.toThrow();
    });

    it('rejects a date further in the future', () => {
      expect(
        thrownBy(() => parseDeliveryDate('2026-09-23', now)),
      ).toMatchObject({
        statusCode: 400,
        errorCode: ALIGNER_DELIVERY_ERROR.DATE_IN_FUTURE,
      });
    });

    it.each(['2026-02-30', '2026-13-01', '07/09/2026', ''])(
      'rejects the impossible date %j',
      (value) => {
        expect(thrownBy(() => parseDeliveryDate(value, now))).toMatchObject({
          statusCode: 400,
          errorCode: ALIGNER_DELIVERY_ERROR.DATE_INVALID,
        });
      },
    );
  });
});
