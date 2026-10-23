import { OrderStatus, Prisma } from '@prisma/client';
import {
  classifyOrderForQuarter,
  hasAppliedLoyaltyDiscount,
  highestReachedTier,
  type LoyaltyOrderCandidate,
  summarizeOrdersForQuarter,
} from './loyalty.rules';
import { nextQuarter, previousQuarter, quarterOf } from './loyalty.types';

const q1 = { year: 2026, quarter: 1 } as const;
const tiers = [
  { minTreatments: 8, discountPercent: 5 },
  { minTreatments: 12, discountPercent: 10 },
];

const order = (
  over: Partial<LoyaltyOrderCandidate> = {},
): LoyaltyOrderCandidate => ({
  id: 'order-1',
  doctorId: 'doctor-1',
  status: OrderStatus.finished,
  createdAt: new Date('2026-03-15T10:00:00.000Z'),
  deletedAt: null,
  quotation: {
    loyaltyDiscountPercent: null,
    loyaltyDiscountAmount: null,
  },
  ...over,
});

const discount = (percent: number, amount = 10) => ({
  loyaltyDiscountPercent: new Prisma.Decimal(percent),
  loyaltyDiscountAmount: new Prisma.Decimal(amount),
});

describe('order-based loyalty rules', () => {
  it.each([
    [7, 0],
    [8, 5],
    [11, 5],
    [12, 10],
    [20, 10],
  ])('%i eligible completed orders produce %i%%', (count, expected) => {
    expect(highestReachedTier(count, tiers)?.discountPercent ?? 0).toBe(
      expected,
    );
  });

  it('counts an order containing multiple treatments only once', () => {
    const candidate = order();
    const metrics = summarizeOrdersForQuarter(
      [candidate, { ...candidate }],
      q1,
    ).get('doctor-1');
    expect(metrics).toEqual({
      eligibleOrderCount: 1,
      excludedDiscountedOrderCount: 0,
    });
  });

  it.each([OrderStatus.draft, OrderStatus.submitted, OrderStatus.fabrication])(
    'does not count unfinished status %s',
    (status) => {
      expect(classifyOrderForQuarter(order({ status }), q1)).toBe('ineligible');
    },
  );

  it.each([OrderStatus.canceled, OrderStatus.cancelled, OrderStatus.rejected])(
    'does not count cancelled/terminal non-completed status %s',
    (status) => {
      expect(classifyOrderForQuarter(order({ status }), q1)).toBe('ineligible');
    },
  );

  it('counts a completed order with no applied loyalty discount', () => {
    expect(classifyOrderForQuarter(order(), q1)).toBe('eligible');
  });

  it.each([5, 10])(
    'excludes a completed order with an applied %i%% loyalty discount',
    (percent) => {
      const candidate = order({ quotation: discount(percent) });
      expect(hasAppliedLoyaltyDiscount(candidate.quotation)).toBe(true);
      expect(classifyOrderForQuarter(candidate, q1)).toBe('discounted');
    },
  );

  it('counts an order when a doctor is eligible but no discount was applied', () => {
    const candidate = order({
      quotation: {
        loyaltyDiscountPercent: null,
        loyaltyDiscountAmount: null,
      },
    });
    expect(classifyOrderForQuarter(candidate, q1)).toBe('eligible');
  });

  it('deduplicates the same order ID during duplicate processing', () => {
    const candidate = order();
    const metrics = summarizeOrdersForQuarter(
      [candidate, candidate, candidate],
      q1,
    ).get('doctor-1');
    expect(metrics?.eligibleOrderCount).toBe(1);
  });

  it('attributes an order created March 31 to Q1 even if completed in April', () => {
    expect(
      classifyOrderForQuarter(
        order({ createdAt: new Date('2026-03-31T23:59:59.999Z') }),
        q1,
      ),
    ).toBe('eligible');
  });

  it('attributes an order created April 1 to Q2, not Q1', () => {
    const candidate = order({
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
    });
    expect(classifyOrderForQuarter(candidate, q1)).toBe('ineligible');
    expect(classifyOrderForQuarter(candidate, { year: 2026, quarter: 2 })).toBe(
      'eligible',
    );
  });

  it('handles Q4 to next-year Q1 transitions', () => {
    expect(nextQuarter({ year: 2026, quarter: 4 })).toEqual({
      year: 2027,
      quarter: 1,
    });
    expect(previousQuarter({ year: 2027, quarter: 1 })).toEqual({
      year: 2026,
      quarter: 4,
    });
    expect(quarterOf(new Date('2027-01-01T00:00:00.000Z'))).toEqual({
      year: 2027,
      quarter: 1,
    });
  });

  it('matches the mixed discounted/non-discounted business example', () => {
    const rows = [
      ...Array.from({ length: 7 }, (_, index) =>
        order({
          id: `discounted-${index}`,
          quotation: discount(10),
        }),
      ),
      ...Array.from({ length: 8 }, (_, index) =>
        order({ id: `eligible-${index}` }),
      ),
    ];
    const metrics = summarizeOrdersForQuarter(rows, q1).get('doctor-1');
    expect(metrics).toEqual({
      eligibleOrderCount: 8,
      excludedDiscountedOrderCount: 7,
    });
    expect(
      highestReachedTier(metrics?.eligibleOrderCount ?? 0, tiers)
        ?.discountPercent,
    ).toBe(5);
  });
});
