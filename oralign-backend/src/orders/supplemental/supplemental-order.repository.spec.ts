import {
  OrderStatus,
  OrderType,
  SupplementalCoverageStatus,
  SupplementalReviewStatus,
} from '@prisma/client';
import {
  countConsumedCorrections,
  nextSequentialCode,
} from './supplemental-order.repository';

describe('nextSequentialCode', () => {
  it.each<[string[], string]>([
    [[], 'CASE-001-ADD-01'],
    [['CASE-001-ADD-01'], 'CASE-001-ADD-02'],
    // A purged (or archived) code in the middle never makes NN go back:
    // the highest suffix decides, never the number of rows.
    [['CASE-001-ADD-01', 'CASE-001-ADD-03'], 'CASE-001-ADD-04'],
    [['CASE-001-ADD-03'], 'CASE-001-ADD-04'],
    [['CASE-001-ADD-99'], 'CASE-001-ADD-100'],
    // Codes that only share the prefix are not part of the sequence.
    [
      ['CASE-001-ADD-xyz', 'CASE-001-ADD-02-copy', 'CASE-001-ADDX-07'],
      'CASE-001-ADD-01',
    ],
  ])('%j → %s', (codes, expected) => {
    expect(nextSequentialCode('CASE-001-ADD', codes)).toBe(expected);
  });
});

describe('countConsumedCorrections', () => {
  type CountClient = Parameters<typeof countConsumedCorrections>[0];
  const db = () => {
    const count = jest.fn().mockResolvedValue(3);
    // Only the delegate method the query uses.
    const client = { supplementalOrderRequest: { count } };
    return { count, client: client as unknown as CountClient };
  };

  it('counts approved, included refinements of live, not abandoned children', async () => {
    const { client, count } = db();
    await expect(countConsumedCorrections(client, 'parent-1')).resolves.toBe(3);
    expect(count).toHaveBeenCalledWith({
      where: {
        reviewStatus: SupplementalReviewStatus.approved,
        coverageStatus: SupplementalCoverageStatus.included,
        order: {
          parentOrderId: 'parent-1',
          orderType: OrderType.additional_aligners,
          deletedAt: null,
          status: {
            notIn: [
              OrderStatus.canceled,
              OrderStatus.cancelled,
              OrderStatus.rejected,
            ],
          },
        },
      },
    });
  });

  it('can leave one child out', async () => {
    const { client, count } = db();
    await countConsumedCorrections(client, 'parent-1', {
      excludeChildId: 'child-1',
    });
    expect((count.mock.calls as unknown[][])[0][0]).toMatchObject({
      where: { order: { id: { not: 'child-1' } } },
    });
  });
});
