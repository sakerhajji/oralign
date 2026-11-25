import { Prisma } from '@prisma/client';
import type { Cache } from 'cache-manager';
import type { PrismaService } from '../../prisma/prisma.service';
import { AdminDashboardService } from './admin-dashboard.service';

/**
 * Revenue on the admin dashboard is what payments SETTLED (cash + the
 * retenue kept back - the droit de timbre charged on top), never the cash:
 * the stamp belongs to each payment's facture, not to the lab's revenue.
 * The takings (PaymentsSummaryService) are the cash, stamps included.
 */

const d = (value: string) => new Prisma.Decimal(value);

const range = {
  from: new Date('2026-11-18T00:00:00.000Z'),
  to: new Date('2026-11-20T00:00:00.000Z'),
};

function makeService(options: {
  feeSum?: Record<string, Prisma.Decimal | null>;
  payments?: Array<Record<string, unknown>>;
}) {
  const zero = jest.fn().mockResolvedValue(0);
  const none = jest.fn().mockResolvedValue([]);
  const prisma = {
    user: { count: zero, findMany: none },
    patient: { count: zero, findMany: none },
    pack: { count: zero, findUnique: jest.fn().mockResolvedValue(null) },
    dentalOrder: {
      count: zero,
      findMany: none,
      aggregate: jest.fn().mockResolvedValue({
        _sum: options.feeSum ?? {
          treatmentFeeAmount: null,
          treatmentFeeWithholdingAmount: null,
          treatmentFeeStampAmount: null,
        },
      }),
    },
    quotation: {
      aggregate: jest.fn().mockResolvedValue({
        _count: { _all: 0 },
        _sum: { totalPrice: null, paidAmount: null },
      }),
      groupBy: none,
    },
    payment: {
      count: zero,
      findMany: jest.fn().mockResolvedValue(options.payments ?? []),
    },
    // The batch form: every operation was already started by its mock.
    $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
  };
  const cache = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AdminDashboardService(
    prisma as unknown as PrismaService,
    cache as unknown as Cache,
  );
  return { service, prisma };
}

describe('AdminDashboardService — revenue is what was settled, stamps out', () => {
  it('a treatment fee counts cash + retenue - stamp (347.500 + 3.500 - 1 = 350)', async () => {
    const { service, prisma } = makeService({
      feeSum: {
        treatmentFeeAmount: d('347.500'),
        treatmentFeeWithholdingAmount: d('3.500'),
        treatmentFeeStampAmount: d('1.000'),
      },
    });

    const kpis = (await service.getKpis(range)) as {
      revenue: Record<string, number>;
    };

    // Every fee aggregate sums the stamp, so it can be taken out.
    for (const [args] of prisma.dentalOrder.aggregate.mock.calls as Array<
      [{ _sum: Record<string, boolean> }]
    >) {
      expect(args._sum).toEqual({
        treatmentFeeAmount: true,
        treatmentFeeWithholdingAmount: true,
        treatmentFeeStampAmount: true,
      });
    }
    expect(kpis.revenue.total).toBe(350);
    expect(kpis.revenue.collected).toBe(350);
    expect(kpis.revenue.thisMonth).toBe(350);
    expect(kpis.revenue.today).toBe(350);
  });

  it('fees paid before the stamp (null stamp) count cash + retenue', async () => {
    const { service } = makeService({
      feeSum: {
        treatmentFeeAmount: d('346.500'),
        treatmentFeeWithholdingAmount: d('3.500'),
        treatmentFeeStampAmount: null,
      },
    });
    const kpis = (await service.getKpis(range)) as {
      revenue: Record<string, number>;
    };
    expect(kpis.revenue.total).toBe(350);
  });

  it('the daily series counts each payment for what it settled', async () => {
    const paidAt = new Date('2026-11-19T10:00:00.000Z');
    const { service, prisma } = makeService({
      payments: [
        // 1 000 + 1 stamp - 10 retenue.
        {
          paidAt,
          amount: d('991.000'),
          withholdingAmount: d('10.000'),
          stampAmount: d('1.000'),
        },
        // 500 + 1 stamp, no retenue.
        {
          paidAt,
          amount: d('501.000'),
          withholdingAmount: d('0'),
          stampAmount: d('1.000'),
        },
        // Paid before the stamp was added.
        {
          paidAt,
          amount: d('990.000'),
          withholdingAmount: d('10.000'),
          stampAmount: d('0'),
        },
      ],
    });

    const trends = (await service.getTrends(range)) as {
      points: Array<{ revenue: number }>;
    };

    const [query] = prisma.payment.findMany.mock.calls[0] as [
      { select: Record<string, boolean> },
    ];
    expect(query.select).toMatchObject({
      amount: true,
      withholdingAmount: true,
      stampAmount: true,
    });
    const revenue = trends.points.reduce((sum, p) => sum + p.revenue, 0);
    expect(revenue).toBe(2500);
    // All on one day.
    expect(trends.points.filter((p) => p.revenue > 0)).toHaveLength(1);
  });
});
