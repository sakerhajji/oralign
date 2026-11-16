import { OrderStatus, OrderType } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { LoyaltyEligibilityService } from './loyalty-eligibility.service';

describe('LoyaltyEligibilityService.metricsByDoctor', () => {
  it('reads the finished CASES of the quarter only, supplemental requests excluded', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new LoyaltyEligibilityService({
      dentalOrder: { findMany },
    } as unknown as PrismaService);

    await service.metricsByDoctor({ year: 2026, quarter: 3 });

    expect(findMany).toHaveBeenCalledTimes(1);
    const [{ where, select }] = findMany.mock.calls[0] as [
      { where: object; select: object },
    ];
    expect(where).toEqual({
      createdAt: {
        gte: new Date('2026-07-01T00:00:00.000Z'),
        lt: new Date('2026-10-01T00:00:00.000Z'),
      },
      status: OrderStatus.finished,
      orderType: OrderType.initial,
      deletedAt: null,
    });
    // The rule re-checks the kind of every row it is handed.
    expect(select).toMatchObject({ orderType: true });
  });
});
