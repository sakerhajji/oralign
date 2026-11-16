import {
  OrderStatus,
  OrderType,
  QuotationPaymentStatus,
  SupplementalCoverageStatus,
  SupplementalReviewStatus,
} from '@prisma/client';
import { openChildrenOf } from '../order-kind';
import { SUPPLEMENTAL_ERROR } from './supplemental.constants';
import type {
  CorrectionClaim,
  SupplementalTx,
} from './supplemental-order.repository';
import {
  planChildOverride,
  type OverriddenChild,
} from './supplemental-override';

const NOW = new Date('2026-11-12T09:30:00.000Z');
const SUBMITTED = new Date('2026-11-02T08:00:00.000Z');

/** A refinement approved as included, correction #1, then cancelled. */
const cancelledCorrection: OverriddenChild = {
  id: 'child-1',
  status: OrderStatus.canceled,
  orderType: OrderType.additional_aligners,
  parentOrderId: 'case-1',
};

const includedClaim: CorrectionClaim = {
  id: 'request-1',
  reviewStatus: SupplementalReviewStatus.approved,
  coverageStatus: SupplementalCoverageStatus.included,
  correctionNumber: 1,
  submittedAt: SUBMITTED,
};

const pack = (includedCorrections: number | null, unlimited = false) => ({
  paymentStatus: QuotationPaymentStatus.paid,
  treatmentValidityMonths: 12,
  includedCorrections,
  isUnlimitedCorrections: unlimited,
});

function world({
  claim = includedClaim as CorrectionClaim | null,
  quotation = pack(1) as ReturnType<typeof pack> | null,
  consumed = 0,
  liveNumbers = [] as number[],
  openSibling = false,
} = {}) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    dentalOrder: {
      findFirst: jest
        .fn()
        .mockResolvedValue(openSibling ? { id: 'child-2' } : null),
      findUnique: jest.fn().mockResolvedValue({ quotation }),
    },
    supplementalOrderRequest: {
      findUnique: jest.fn().mockResolvedValue(claim),
      count: jest.fn().mockResolvedValue(consumed),
      findMany: jest
        .fn()
        .mockResolvedValue(
          liveNumbers.map((correctionNumber) => ({ correctionNumber })),
        ),
    },
  };
  const plan = (child: OverriddenChild, to: OrderStatus) =>
    planChildOverride(tx as unknown as SupplementalTx, child, to, NOW);
  return { tx, plan };
}

const lockedIds = (tx: ReturnType<typeof world>['tx']) =>
  (tx.$queryRaw.mock.calls as unknown[][]).map((call) => call[1]);

describe('planChildOverride — a given-back correction taken back', () => {
  it('keeps its number when the pack still has a correction and nobody took it', async () => {
    const { tx, plan } = world({ quotation: pack(2), consumed: 1 });

    await expect(
      plan(cancelledCorrection, OrderStatus.fabrication),
    ).resolves.toEqual({ conflict: null, requestPatch: null });
    expect(lockedIds(tx)).toEqual(['case-1']);
    // The child itself is left out of the count it is checked against.
    expect(tx.supplementalOrderRequest.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        order: expect.objectContaining({
          parentOrderId: 'case-1',
          id: { not: 'child-1' },
        }) as unknown,
      }) as unknown,
    });
  });

  it('gets a fresh number above the live ones when its own was handed out again', async () => {
    const { plan } = world({
      quotation: pack(2),
      consumed: 1,
      liveNumbers: [1],
    });

    await expect(
      plan(cancelledCorrection, OrderStatus.fabrication),
    ).resolves.toEqual({
      conflict: null,
      requestPatch: { correctionNumber: 2 },
    });
  });

  it.each([OrderStatus.fabrication, OrderStatus.finished])(
    '→ %s refuses (409) once the pack is used up',
    async (to) => {
      const { plan } = world({ quotation: pack(1), consumed: 1 });

      const result = await plan(cancelledCorrection, to);

      expect(result.conflict).toMatchObject({
        statusCode: 409,
        errorCode: SUPPLEMENTAL_ERROR.ALLOWANCE_EXHAUSTED,
      });
    },
  );

  it('never runs out on an unlimited pack', async () => {
    const { plan } = world({ quotation: pack(null, true), consumed: 9 });

    expect(
      (await plan(cancelledCorrection, OrderStatus.fabrication)).conflict,
    ).toBeNull();
  });

  it('→ submitted is a new review, not a take-back: pending, no allowance read', async () => {
    const { tx, plan } = world({ quotation: pack(1), consumed: 1 });

    const result = await plan(cancelledCorrection, OrderStatus.submitted);

    expect(result).toMatchObject({
      conflict: null,
      requestPatch: {
        reviewStatus: SupplementalReviewStatus.pending,
        submittedAt: SUBMITTED,
        correctionNumber: null,
      },
    });
    expect(tx.supplementalOrderRequest.count).not.toHaveBeenCalled();
  });

  it('leaves a chargeable approval alone: no correction to take back', async () => {
    const { tx, plan } = world({
      claim: {
        ...includedClaim,
        coverageStatus: SupplementalCoverageStatus.chargeable,
        correctionNumber: null,
      },
      consumed: 1,
    });

    await expect(
      plan(cancelledCorrection, OrderStatus.fabrication),
    ).resolves.toEqual({ conflict: null, requestPatch: null });
    expect(tx.supplementalOrderRequest.count).not.toHaveBeenCalled();
  });
});

describe('planChildOverride — one open request per kind', () => {
  it('refuses (409) to reopen a closed child while a sibling of its kind is open', async () => {
    const { tx, plan } = world({ openSibling: true });

    const result = await plan(
      { ...cancelledCorrection, orderType: OrderType.replacement },
      OrderStatus.submitted,
    );

    expect(result.conflict).toMatchObject({
      statusCode: 409,
      errorCode: SUPPLEMENTAL_ERROR.ACTIVE_REQUEST_EXISTS,
    });
    expect(lockedIds(tx)).toEqual(['case-1']);
    expect(tx.dentalOrder.findFirst).toHaveBeenCalledWith({
      where: {
        ...openChildrenOf('case-1'),
        orderType: OrderType.replacement,
        id: { not: 'child-1' },
      },
      select: { id: true },
    });
  });

  it('moves an open child without locking the case: only its review state follows', async () => {
    const { tx, plan } = world();

    await expect(
      plan(
        { ...cancelledCorrection, status: OrderStatus.under_review },
        OrderStatus.rejected,
      ),
    ).resolves.toEqual({
      conflict: null,
      requestPatch: { reviewStatus: SupplementalReviewStatus.rejected },
    });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.dentalOrder.findFirst).not.toHaveBeenCalled();
  });

  it('writes nothing for a child without a request row', async () => {
    const { plan } = world({ claim: null });

    await expect(
      plan(cancelledCorrection, OrderStatus.fabrication),
    ).resolves.toEqual({ conflict: null, requestPatch: null });
  });
});
