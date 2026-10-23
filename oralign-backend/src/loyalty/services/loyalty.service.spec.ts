import { LoyaltyCalculationBasis, Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { LoyaltyEligibilityService } from './loyalty-eligibility.service';
import { LoyaltyService } from './loyalty.service';

const tiers = [
  {
    id: 'tier-5',
    minTreatments: 8,
    discountPercent: new Prisma.Decimal(5),
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'tier-10',
    minTreatments: 12,
    discountPercent: new Prisma.Decimal(10),
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

interface LoyaltyUpsertArgs {
  where: {
    doctorId_year_quarter: {
      doctorId: string;
      year: number;
      quarter: number;
    };
  };
  update: {
    treatmentCount: number;
    excludedDiscountedOrderCount: number;
    discountPercent: Prisma.Decimal;
  };
}

function makeService() {
  const upsert = jest.fn(
    (_args: LoyaltyUpsertArgs): Promise<Record<string, never>> =>
      Promise.resolve({}),
  );
  const prisma = {
    loyaltyTier: { findMany: jest.fn().mockResolvedValue(tiers) },
    loyaltyQuarterResult: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert,
    },
    companyBillingSettings: {
      findFirst: jest.fn().mockResolvedValue({
        loyaltyEnabled: true,
        defaultCurrency: 'TND',
      }),
    },
    quotation: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { loyaltyDiscountAmount: null },
      }),
    },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const eligibility = {
    metricsByDoctor: jest.fn().mockResolvedValue(new Map()),
  };
  const service = new LoyaltyService(
    prisma as unknown as PrismaService,
    eligibility as unknown as LoyaltyEligibilityService,
  );
  return { service, prisma, eligibility, upsert };
}

describe('LoyaltyService order-based quarter calculation', () => {
  it('recalculating twice writes the same unique result without double counting', async () => {
    const { service, eligibility, upsert } = makeService();
    eligibility.metricsByDoctor.mockResolvedValue(
      new Map([
        [
          'doctor-1',
          { eligibleOrderCount: 8, excludedDiscountedOrderCount: 2 },
        ],
      ]),
    );

    await service.ensureQuarterClosed({ year: 2026, quarter: 1 });
    await service.ensureQuarterClosed({ year: 2026, quarter: 1 });

    expect(upsert).toHaveBeenCalledTimes(2);
    const first = upsert.mock.calls[0][0];
    const second = upsert.mock.calls[1][0];
    expect(second.where).toEqual(first.where);
    expect(second.update.treatmentCount).toBe(8);
    expect(second.update.excludedDiscountedOrderCount).toBe(2);
    expect(second.update.discountPercent.toString()).toBe('5');
  });

  it('reuses a closed quarter tier snapshot after admin tier changes', async () => {
    const { service, prisma, eligibility, upsert } = makeService();
    eligibility.metricsByDoctor.mockResolvedValue(
      new Map([
        [
          'doctor-1',
          { eligibleOrderCount: 8, excludedDiscountedOrderCount: 0 },
        ],
      ]),
    );
    prisma.loyaltyTier.findMany.mockResolvedValue([
      { ...tiers[0], discountPercent: new Prisma.Decimal(7) },
      { ...tiers[1], discountPercent: new Prisma.Decimal(15) },
    ]);
    prisma.loyaltyQuarterResult.findMany.mockResolvedValue([
      {
        doctorId: 'doctor-1',
        tierSnapshot: [
          { minTreatments: 8, discountPercent: '5.00' },
          { minTreatments: 12, discountPercent: '10.00' },
        ],
      },
    ]);

    await service.ensureQuarterClosed({ year: 2026, quarter: 1 });

    expect(upsert.mock.calls[0][0].update.discountPercent.toString()).toBe('5');
    expect(prisma.loyaltyTier.findMany).not.toHaveBeenCalled();
  });

  it('does not expose or apply a new reward while loyalty is disabled', async () => {
    const { service, prisma } = makeService();
    prisma.companyBillingSettings.findFirst.mockResolvedValue({
      loyaltyEnabled: false,
    });
    const ensure = jest.spyOn(service, 'ensureQuarterClosed');

    await expect(service.activeRewardFor('doctor-1')).resolves.toEqual({
      discountPercent: 0,
      sourceYear: null,
      sourceQuarter: null,
    });
    expect(ensure).not.toHaveBeenCalled();
  });

  it('keeps active discount separate from current projected reward', async () => {
    const { service, prisma, eligibility } = makeService();
    jest.spyOn(service, 'ensureQuarterClosed').mockResolvedValue();
    eligibility.metricsByDoctor.mockResolvedValue(
      new Map([
        [
          'doctor-1',
          { eligibleOrderCount: 6, excludedDiscountedOrderCount: 3 },
        ],
      ]),
    );
    prisma.loyaltyQuarterResult.findMany.mockResolvedValue([
      {
        doctorId: 'doctor-1',
        treatmentCount: 8,
        excludedDiscountedOrderCount: 1,
        discountPercent: new Prisma.Decimal(5),
        calculationBasis: LoyaltyCalculationBasis.completed_orders_v2,
      },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'doctor-1', fullName: 'Doctor A', dentistProfile: null },
    ]);

    const overview = await service.overview();
    expect(overview.doctors[0]).toMatchObject({
      activeDiscountPercent: 5,
      eligibleOrdersThisQuarter: 6,
      excludedDiscountedOrdersThisQuarter: 3,
      projectedNextQuarterDiscountPercent: 0,
    });
  });
});
