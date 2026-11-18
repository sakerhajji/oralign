import {
  ArchTreatment,
  OrderStatus,
  OrderType,
  ReplacementReason,
  SupplementalCoverageStatus,
  SupplementalReviewStatus,
  SupplementalUrgency,
} from '@prisma/client';
import { NotificationEvents } from '../../notifications/events/notification-events';
import { SUPPLEMENTAL_ERROR } from './supplemental.constants';
import {
  admin,
  argOf,
  auditRows,
  childRow,
  designer,
  doctor,
  failureOf,
  fakeDb,
  makeServices,
  NEW_CHILD_ID,
  NOW,
  otherDoctor,
  PARENT_ID,
  parentRow,
  quotation,
  type FakeDb,
} from './fake-db.helper-spec';

const approve = SupplementalReviewStatus.approved;
const reject = SupplementalReviewStatus.rejected;

/** A pending request of `type`, under a case whose pack allows `included`. */
function pending(
  type: OrderType,
  {
    consumed = 0,
    numbers,
    included = 2,
    status = OrderStatus.submitted,
    request = {},
    parent = {},
  }: {
    consumed?: number;
    /** Numbers of the live corrections (default 1..consumed). */
    numbers?: number[];
    included?: number | null;
    status?: OrderStatus;
    request?: Record<string, unknown>;
    parent?: Record<string, unknown>;
  } = {},
): FakeDb {
  return fakeDb({
    consumedCorrections: consumed,
    correctionNumbers: numbers,
    parents: [parentRow({ quotation: quotation(included), ...parent })],
    children: [
      childRow(
        { orderType: type, status },
        {
          reviewStatus: SupplementalReviewStatus.pending,
          coverageStatus:
            type === OrderType.warranty
              ? SupplementalCoverageStatus.review_required
              : SupplementalCoverageStatus.included,
          ...request,
        },
      ),
    ],
  });
}

describe('SupplementalReviewService.review', () => {
  it.each([doctor, designer])(
    'is for admins only (%j → 403)',
    async (caller) => {
      const db = pending(OrderType.additional_aligners);
      const { reviews } = makeServices(db);
      await expect(
        reviews.review('child-1', { decision: approve }, caller),
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: SUPPLEMENTAL_ERROR.FORBIDDEN,
      });
      expect(db.prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('needs a reason to reject', async () => {
    const db = pending(OrderType.replacement);
    const { reviews } = makeServices(db);
    await expect(
      reviews.review('child-1', { decision: reject, reason: null }, admin),
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: SUPPLEMENTAL_ERROR.REJECTION_REASON_REQUIRED,
    });
  });

  it('approves an included refinement: numbered under the parent lock, audited, one event', async () => {
    const db = pending(OrderType.additional_aligners, { consumed: 1 });
    const { reviews, emit } = makeServices(db);

    await reviews.review(
      'child-1',
      {
        decision: approve,
        coverageStatus: SupplementalCoverageStatus.included,
      },
      admin,
    );

    const lockedIds = (db.tx.$queryRaw.mock.calls as unknown[][]).map(
      (call) => call[1],
    );
    expect(lockedIds).toEqual([PARENT_ID, 'child-1']);
    expect(db.tx.dentalOrder.update).toHaveBeenCalledWith({
      where: { id: 'child-1' },
      data: { status: OrderStatus.under_review },
    });
    expect(db.tx.supplementalOrderRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-1' },
      data: {
        reviewStatus: approve,
        reviewReason: null,
        reviewedAt: NOW,
        reviewedById: admin.userId,
        reviewedByName: 'Actor',
        coverageStatus: SupplementalCoverageStatus.included,
        correctionNumber: 2,
      },
    });
    const [childAudit, parentAudit] = auditRows(db);
    expect(childAudit).toMatchObject({
      orderId: 'child-1',
      action: 'supplemental_reviewed',
      changes: {
        status: { from: OrderStatus.submitted, to: OrderStatus.under_review },
        reviewStatus: { from: SupplementalReviewStatus.pending, to: approve },
        correctionNumber: { from: null, to: 2 },
      },
    });
    // The case did not change: metadata only, never the child's diff.
    expect(parentAudit).not.toHaveProperty('changes');
    expect(parentAudit).toMatchObject({
      orderId: PARENT_ID,
      action: 'supplemental_child_reviewed',
      actorId: admin.userId,
      actorName: 'Actor',
      actorRole: admin.role,
      metadata: {
        childOrderId: 'child-1',
        decision: approve,
        correctionNumber: 2,
      },
    });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      NotificationEvents.SupplementalOrderReviewed,
      expect.objectContaining({
        orderId: 'child-1',
        doctorId: doctor.userId,
        decision: approve,
        coverageStatus: SupplementalCoverageStatus.included,
      }),
    );
  });

  it('numbers above the live corrections, never the count + 1', async () => {
    // #1 was cancelled after #2 was approved: one in use, numbered 2.
    const db = pending(OrderType.additional_aligners, {
      consumed: 1,
      numbers: [2],
    });
    const { reviews } = makeServices(db);
    await reviews.review(
      'child-1',
      {
        decision: approve,
        coverageStatus: SupplementalCoverageStatus.included,
      },
      admin,
    );
    expect(argOf(db.tx.supplementalOrderRequest.update)).toMatchObject({
      data: { correctionNumber: 3 },
    });
  });

  it('refuses "included" once the allowance is used up, and writes nothing', async () => {
    const db = pending(OrderType.additional_aligners, { consumed: 2 });
    const { reviews, emit } = makeServices(db);
    await expect(
      reviews.review(
        'child-1',
        {
          decision: approve,
          coverageStatus: SupplementalCoverageStatus.included,
        },
        admin,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: SUPPLEMENTAL_ERROR.ALLOWANCE_EXHAUSTED,
    });
    expect(db.tx.dentalOrder.update).not.toHaveBeenCalled();
    expect(db.tx.supplementalOrderRequest.update).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('approves the same request as chargeable instead, no correction used', async () => {
    const db = pending(OrderType.additional_aligners, { consumed: 2 });
    const { reviews } = makeServices(db);
    await reviews.review(
      'child-1',
      {
        decision: approve,
        coverageStatus: SupplementalCoverageStatus.chargeable,
      },
      admin,
    );
    expect(argOf(db.tx.supplementalOrderRequest.update)).toMatchObject({
      data: {
        coverageStatus: SupplementalCoverageStatus.chargeable,
        correctionNumber: null,
      },
    });
  });

  it('includes without limit on an unlimited pack', async () => {
    const db = pending(OrderType.additional_aligners, {
      consumed: 7,
      parent: {
        quotation: quotation(null, { isUnlimitedCorrections: true }),
      },
    });
    const { reviews } = makeServices(db);
    await reviews.review('child-1', { decision: approve }, admin);
    expect(argOf(db.tx.supplementalOrderRequest.update)).toMatchObject({
      data: { correctionNumber: 8 },
    });
  });

  it.each<
    [OrderType, SupplementalCoverageStatus | undefined, Record<string, unknown>]
  >([
    [
      OrderType.additional_aligners,
      SupplementalCoverageStatus.warranty_approved,
      {},
    ],
    [OrderType.replacement, SupplementalCoverageStatus.included, {}],
    [
      OrderType.transfer_template,
      SupplementalCoverageStatus.warranty_approved,
      {},
    ],
    [OrderType.warranty, SupplementalCoverageStatus.chargeable, {}],
    // A computed review_required must be settled explicitly.
    [
      OrderType.additional_aligners,
      undefined,
      { coverageStatus: SupplementalCoverageStatus.review_required },
    ],
  ])('refuses to approve a %s as %s', async (type, coverageStatus, request) => {
    const db = pending(type, { request });
    const { reviews } = makeServices(db);
    await expect(
      reviews.review('child-1', { decision: approve, coverageStatus }, admin),
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: SUPPLEMENTAL_ERROR.COVERAGE_NOT_ALLOWED,
    });
    expect(db.tx.supplementalOrderRequest.update).not.toHaveBeenCalled();
  });

  it.each<
    [typeof approve | typeof reject, SupplementalCoverageStatus, OrderStatus]
  >([
    [
      approve,
      SupplementalCoverageStatus.warranty_approved,
      OrderStatus.under_review,
    ],
    [
      reject,
      SupplementalCoverageStatus.warranty_rejected,
      OrderStatus.rejected,
    ],
  ])(
    'decides a warranty claim (%s → %s)',
    async (decision, coverage, status) => {
      const db = pending(OrderType.warranty);
      const { reviews } = makeServices(db);
      await reviews.review(
        'child-1',
        { decision, reason: 'Fit checked on the model' },
        admin,
      );
      expect(db.tx.dentalOrder.update).toHaveBeenCalledWith({
        where: { id: 'child-1' },
        data: { status },
      });
      expect(argOf(db.tx.supplementalOrderRequest.update)).toMatchObject({
        data: {
          reviewStatus: decision,
          coverageStatus: coverage,
          correctionNumber: null,
          reviewReason: 'Fit checked on the model',
        },
      });
    },
  );

  it('refuses a request that is no longer pending (re-read under the locks)', async () => {
    const db = pending(OrderType.replacement, {
      request: { reviewStatus: SupplementalReviewStatus.approved },
    });
    const { reviews, emit } = makeServices(db);
    await expect(
      reviews.review('child-1', { decision: approve }, admin),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: SUPPLEMENTAL_ERROR.NOT_PENDING,
    });
    expect(emit).not.toHaveBeenCalled();
  });

  it.each([
    OrderStatus.canceled,
    OrderStatus.cancelled,
    OrderStatus.fabrication,
  ])(
    'refuses a pending request whose order an override moved to %s: nothing reopened',
    async (status) => {
      const db = pending(OrderType.additional_aligners, { status });
      const { reviews, emit } = makeServices(db);
      await expect(
        reviews.review(
          'child-1',
          {
            decision: approve,
            coverageStatus: SupplementalCoverageStatus.included,
          },
          admin,
        ),
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: SUPPLEMENTAL_ERROR.NOT_PENDING,
      });
      expect(db.tx.dentalOrder.update).not.toHaveBeenCalled();
      expect(db.tx.supplementalOrderRequest.update).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    },
  );

  it('still decides a request whose case was archived', async () => {
    const db = pending(OrderType.replacement, {
      parent: { deletedAt: NOW },
      request: { coverageStatus: SupplementalCoverageStatus.chargeable },
    });
    const { reviews } = makeServices(db);
    await reviews.review('child-1', { decision: approve }, admin);
    expect(db.tx.dentalOrder.update).toHaveBeenCalled();
  });
});

describe('SupplementalReviewService.convertRejectedWarranty', () => {
  /** A warranty claim on lower aligner 5, rejected. */
  function rejectedWarranty(request: Record<string, unknown> = {}): FakeDb {
    return fakeDb({
      children: [
        childRow(
          {
            id: 'warranty-1',
            orderCode: 'CASE-001-WAR-01',
            orderType: OrderType.warranty,
            status: OrderStatus.rejected,
            archTreatment: ArchTreatment.lower,
          },
          {
            id: 'warranty-request',
            reviewStatus: SupplementalReviewStatus.rejected,
            coverageStatus: SupplementalCoverageStatus.warranty_rejected,
            defectiveAligners: [5],
            ...request,
          },
        ),
      ],
    });
  }

  it.each([admin, otherDoctor])(
    'is the owning dentist’s consent only (%j → 403)',
    async (caller) => {
      const db = rejectedWarranty();
      const { reviews } = makeServices(db);
      expect(
        (await failureOf(reviews.convertRejectedWarranty('warranty-1', caller)))
          .status,
      ).toBe(403);
      expect(db.tx.dentalOrder.create).not.toHaveBeenCalled();
    },
  );

  it('refuses a warranty claim that was not rejected', async () => {
    const db = rejectedWarranty({
      reviewStatus: SupplementalReviewStatus.approved,
      coverageStatus: SupplementalCoverageStatus.warranty_approved,
    });
    const { reviews } = makeServices(db);
    await expect(
      reviews.convertRejectedWarranty('warranty-1', doctor),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: SUPPLEMENTAL_ERROR.CONVERSION_NOT_ALLOWED,
    });
  });

  it('creates the paid replacement, links it and audits warranty, replacement and case in one transaction', async () => {
    const db = rejectedWarranty();
    const { reviews } = makeServices(db);

    const view = await reviews.convertRejectedWarranty('warranty-1', doctor);

    expect(db.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(argOf(db.tx.dentalOrder.create)).toMatchObject({
      data: {
        orderType: OrderType.replacement,
        orderCode: 'CASE-001-REP-01',
        archTreatment: ArchTreatment.lower,
        supplementalRequest: {
          create: {
            idempotencyKey: 'warranty-warranty-request',
            replacementFromAligner: 5,
            replacementToAligner: 5,
            quantity: 1,
            replacementReason: ReplacementReason.other,
            reasonDetails: 'Garantie refusée CASE-001-WAR-01',
            urgency: SupplementalUrgency.standard,
            coverageStatus: SupplementalCoverageStatus.chargeable,
            coverageReason: 'warranty_rejected_doctor_confirmed',
          },
        },
      },
      select: { id: true },
    });
    expect(db.tx.supplementalOrderRequest.update).toHaveBeenCalledWith({
      where: { id: 'warranty-request' },
      data: { convertedReplacementOrderId: NEW_CHILD_ID },
    });
    expect(auditRows(db).map((row) => [row.orderId, row.action])).toEqual([
      [NEW_CHILD_ID, 'supplemental_created'],
      [PARENT_ID, 'supplemental_child_created'],
      ['warranty-1', 'supplemental_converted'],
    ]);
    expect(view.order.id).toBe(NEW_CHILD_ID);
  });

  it('is idempotent: a live linked replacement is returned as is', async () => {
    const db = rejectedWarranty({
      convertedReplacementOrderId: 'replacement-1',
      convertedReplacementOrder: { id: 'replacement-1', deletedAt: null },
    });
    db.state.children.push(
      childRow({ id: 'replacement-1', orderType: OrderType.replacement }),
    );
    const { reviews } = makeServices(db);
    const view = await reviews.convertRejectedWarranty('warranty-1', doctor);
    expect(view.order.id).toBe('replacement-1');
    expect(db.tx.dentalOrder.create).not.toHaveBeenCalled();
  });

  it('refuses (409) when another live request holds the conversion key', async () => {
    const db = rejectedWarranty();
    db.state.replay = {
      id: 'request-9',
      orderId: 'replacement-9',
      order: {
        parentOrderId: PARENT_ID,
        orderType: OrderType.replacement,
        deletedAt: null,
      },
    };
    const { reviews } = makeServices(db);
    await expect(
      reviews.convertRejectedWarranty('warranty-1', doctor),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: SUPPLEMENTAL_ERROR.IDEMPOTENCY_KEY_REUSED,
    });
    expect(db.tx.dentalOrder.create).not.toHaveBeenCalled();
    expect(db.tx.supplementalOrderRequest.update).not.toHaveBeenCalled();
  });

  it('creates and links a new replacement once the previous one was archived', async () => {
    const db = rejectedWarranty({
      convertedReplacementOrderId: 'replacement-1',
      convertedReplacementOrder: { id: 'replacement-1', deletedAt: NOW },
    });
    const { reviews } = makeServices(db);
    await reviews.convertRejectedWarranty('warranty-1', doctor);
    expect(db.tx.dentalOrder.create).toHaveBeenCalledTimes(1);
    expect(db.tx.supplementalOrderRequest.update).toHaveBeenCalledWith({
      where: { id: 'warranty-request' },
      data: { convertedReplacementOrderId: NEW_CHILD_ID },
    });
  });
});
