import {
  OrderFileCategory as File,
  OrderStatus,
  OrderType,
  SupplementalApCorrection,
  SupplementalAttachmentPlan,
  SupplementalClinicalObjective,
  SupplementalContactPurpose,
  SupplementalCoverageStatus,
  SupplementalCutoutPlan,
  SupplementalExistingAttachments,
  SupplementalImpressionMethod,
  SupplementalIprPlan,
  SupplementalPreviousIpr,
  SupplementalRequestReason,
  SupplementalResidualSpaces,
  SupplementalReviewStatus,
  SupplementalTeethScope,
  SupplementalToothPurpose,
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
  PLAN_ID,
  slotFile,
  uniqueViolation,
  type FakeDb,
} from './fake-db.helper-spec';

const KEY = 'key-0000-0001';

/** The answers of a refinement that passes every submission rule. */
const COMPLETE_REFINEMENT = {
  reason: SupplementalRequestReason.finishing,
  currentUpperAligner: 10,
  currentLowerAligner: 10,
  newUpperScan: true,
  newLowerScan: false,
  clinicalObjective: SupplementalClinicalObjective.adjust_current_position,
  movementRestriction: SupplementalTeethScope.none,
  apRelationshipRight: SupplementalApCorrection.maintain,
  apRelationshipLeft: SupplementalApCorrection.maintain,
  attachmentPolicy: SupplementalAttachmentPlan.as_needed,
  existingAttachmentPolicy: SupplementalExistingAttachments.keep_all,
  iprPolicy: SupplementalIprPlan.as_needed,
  previousIpr: SupplementalPreviousIpr.as_prescribed,
  precisionCutPolicy: SupplementalCutoutPlan.none,
  residualSpacePolicy: SupplementalResidualSpaces.none,
  impressionMethod: SupplementalImpressionMethod.intraoral_scan,
};
/** The five intraoral views in their upload slots, and the upper scan. */
const COMPLETE_FILES = [
  slotFile('right-lateral', File.right_photo),
  slotFile('frontal-occlusion', File.front_photo),
  slotFile('left-lateral', File.left_photo),
  slotFile('upper-occlusal', File.upper_photo),
  slotFile('lower-occlusal', File.lower_photo),
  slotFile('upper-stl', File.stl),
];

/** The submittable refinement draft, listed among its parent's children. */
function withSubmittableDraft(over: Record<string, unknown> = {}): FakeDb {
  const db = fakeDb({
    parents: [
      parentRow({
        supplementalOrders: [
          {
            id: 'child-1',
            orderType: OrderType.additional_aligners,
            status: OrderStatus.draft,
          },
        ],
      }),
    ],
    children: [
      childRow(
        { files: COMPLETE_FILES },
        {
          ...COMPLETE_REFINEMENT,
          coverageStatus: SupplementalCoverageStatus.review_required,
          coverageReason: 'paid_pack_snapshot_missing',
          ...over,
        },
      ),
    ],
  });
  return db;
}

describe('SupplementalOrderService.create', () => {
  it('locks the case, then creates the draft with defaults, coverage and a max+1 code', async () => {
    const db = fakeDb({
      existingCodes: ['CASE-001-ADD-01', 'CASE-001-ADD-03'],
      consumedCorrections: 1,
    });
    const { requests } = makeServices(db);

    const view = await requests.create(
      PARENT_ID,
      { type: OrderType.additional_aligners },
      KEY,
      doctor,
    );

    const [lockSql, lockedId] = db.tx.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      string,
    ];
    expect(lockSql.join('?')).toContain('FOR UPDATE');
    expect(lockedId).toBe(PARENT_ID);
    expect(db.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.tx.dentalOrder.findFirst.mock.invocationCallOrder[0],
    );
    expect(argOf(db.tx.dentalOrder.create)).toMatchObject({
      data: {
        orderCode: 'CASE-001-ADD-04',
        orderType: OrderType.additional_aligners,
        parentOrderId: PARENT_ID,
        doctorId: doctor.userId,
        patientId: 'patient-1',
        archTreatment: 'both',
        patientStage: 'refinement',
        supplementalRequest: {
          create: {
            createdById: doctor.userId,
            createdByName: 'Actor',
            idempotencyKey: KEY,
            coverageStatus: SupplementalCoverageStatus.included,
            coverageReason: 'within_pack_allowance',
            movementRestriction: SupplementalTeethScope.none,
            apRelationshipRight: SupplementalApCorrection.maintain,
            apRelationshipLeft: SupplementalApCorrection.maintain,
            attachmentPolicy: SupplementalAttachmentPlan.as_needed,
            iprPolicy: SupplementalIprPlan.as_needed,
            apOptions: [],
          },
        },
      },
      select: { id: true },
    });
    expect(auditRows(db)).toMatchObject([
      {
        orderId: NEW_CHILD_ID,
        action: 'supplemental_created',
        actorId: doctor.userId,
      },
      {
        orderId: PARENT_ID,
        action: 'supplemental_child_created',
        metadata: { childOrderId: NEW_CHILD_ID, orderCode: 'CASE-001-ADD-04' },
      },
    ]);
    expect(auditRows(db)[1]).not.toHaveProperty('changes');
    expect(view.order.id).toBe(NEW_CHILD_ID);
    expect(view.request).not.toHaveProperty('idempotencyKey');
    expect(view.permissions).toMatchObject({ canEdit: true, canSubmit: true });
  });

  it('starts a transfer template on the latest approved plan, version from the plan', async () => {
    const db = fakeDb();
    const { requests } = makeServices(db);
    await requests.create(
      PARENT_ID,
      { type: OrderType.transfer_template },
      KEY,
      admin,
    );
    expect(argOf(db.tx.dentalOrder.create)).toMatchObject({
      data: {
        archTreatment: null,
        supplementalRequest: {
          create: {
            createdById: admin.userId,
            quantity: 1,
            sourceTreatmentPlanId: PLAN_ID,
            sourceTreatmentPlanVersion: 2,
            coverageStatus: SupplementalCoverageStatus.chargeable,
            coverageReason: 'requires_quote',
          },
        },
      },
    });
  });

  it.each([
    ['the designer of the case', designer, SUPPLEMENTAL_ERROR.FORBIDDEN],
    ['another dentist', otherDoctor, undefined],
  ])('refuses %s (403), nothing is written', async (_, caller, errorCode) => {
    const db = fakeDb();
    const { requests } = makeServices(db);
    const failure = await failureOf(
      requests.create(PARENT_ID, { type: OrderType.replacement }, KEY, caller),
    );
    expect(failure).toMatchObject({ status: 403 });
    expect(failure.errorCode).toBe(errorCode);
    expect(db.tx.dentalOrder.create).not.toHaveBeenCalled();
    expect(db.tx.orderAuditLog.createMany).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    '',
    'short',
    'bad key!',
    // Shapes only the server writes: a released key, a conversion key.
    'archived_abc12345',
    'warranty-0b3c1d55-5d0f-4c1e-9a3e-2f7f2a6c9b10',
  ])(
    'needs a well-formed client Idempotency-Key (%j) before touching the database',
    async (key) => {
      const db = fakeDb();
      const { requests } = makeServices(db);
      await expect(
        requests.create(PARENT_ID, { type: OrderType.warranty }, key, doctor),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: SUPPLEMENTAL_ERROR.IDEMPOTENCY_KEY_REQUIRED,
      });
      expect(db.prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('refuses a parent that is itself a supplemental request', async () => {
    const db = fakeDb({
      parents: [
        parentRow({ orderType: OrderType.replacement, parentOrderId: 'p-0' }),
      ],
    });
    const { requests } = makeServices(db);
    await expect(
      requests.create(PARENT_ID, { type: OrderType.warranty }, KEY, doctor),
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: SUPPLEMENTAL_ERROR.PARENT_NOT_INITIAL,
    });
  });

  it('needs an approved plan while the case is still in planning (409 with the blocking reason, not a coverage code)', async () => {
    const db = fakeDb({
      parents: [
        parentRow({
          treatmentPlans: [],
          status: OrderStatus.treatment_planning,
          quotation: null,
        }),
      ],
    });
    const { requests } = makeServices(db);
    const attempt = requests.create(
      PARENT_ID,
      { type: OrderType.replacement },
      KEY,
      doctor,
    );
    const failure = await failureOf(attempt);
    expect(failure).toMatchObject({
      status: 409,
      errorCode: SUPPLEMENTAL_ERROR.NOT_ALLOWED,
    });
    expect(failure.message).toContain('approved_plan_required');
    expect(db.tx.dentalOrder.create).not.toHaveBeenCalled();
  });

  it('refuses a second open request of the same kind', async () => {
    const db = fakeDb({
      parents: [
        parentRow({
          supplementalOrders: [
            {
              id: 'child-1',
              orderType: OrderType.replacement,
              status: OrderStatus.quotation_sent,
            },
          ],
        }),
      ],
    });
    const { requests } = makeServices(db);
    await expect(
      requests.create(PARENT_ID, { type: OrderType.replacement }, KEY, doctor),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: SUPPLEMENTAL_ERROR.ACTIVE_REQUEST_EXISTS,
    });
  });

  it('replays: the same key returns the request it created, nothing new', async () => {
    const db = fakeDb({
      children: [childRow()],
      replay: {
        id: 'request-1',
        orderId: 'child-1',
        order: {
          parentOrderId: PARENT_ID,
          orderType: OrderType.additional_aligners,
          deletedAt: null,
        },
      },
    });
    const { requests } = makeServices(db);
    const view = await requests.create(
      PARENT_ID,
      { type: OrderType.additional_aligners },
      KEY,
      doctor,
    );
    expect(view.order.id).toBe('child-1');
    expect(db.tx.dentalOrder.create).not.toHaveBeenCalled();
  });

  it('refuses a key already used for another case', async () => {
    const db = fakeDb({
      replay: {
        id: 'request-9',
        orderId: 'child-9',
        order: {
          parentOrderId: 'parent-9',
          orderType: OrderType.additional_aligners,
          deletedAt: null,
        },
      },
    });
    const { requests } = makeServices(db);
    await expect(
      requests.create(
        PARENT_ID,
        { type: OrderType.additional_aligners },
        KEY,
        doctor,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: SUPPLEMENTAL_ERROR.IDEMPOTENCY_KEY_REUSED,
    });
  });

  it('returns the winner when a concurrent call with the same key hit the unique index', async () => {
    const db = fakeDb({ children: [childRow()] });
    db.prisma.$transaction.mockRejectedValueOnce(uniqueViolation());
    db.tx.supplementalOrderRequest.findUnique.mockResolvedValueOnce({
      id: 'request-1',
      orderId: 'child-1',
      order: {
        parentOrderId: PARENT_ID,
        orderType: OrderType.additional_aligners,
        deletedAt: null,
      },
    });
    const { requests } = makeServices(db);
    const view = await requests.create(
      PARENT_ID,
      { type: OrderType.additional_aligners },
      KEY,
      doctor,
    );
    expect(view.order.id).toBe('child-1');
  });

  it('lets any other unique violation out', async () => {
    const db = fakeDb();
    db.prisma.$transaction.mockRejectedValueOnce(uniqueViolation());
    const { requests } = makeServices(db);
    await expect(
      requests.create(
        PARENT_ID,
        { type: OrderType.additional_aligners },
        KEY,
        doctor,
      ),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('SupplementalOrderService.list', () => {
  it.each([
    [doctor, { doctorId: doctor.userId }],
    [designer, { assignedDesignerId: designer.userId }],
    [admin, {}],
  ])('scopes the children to what %j may read', async (caller, scope) => {
    const db = fakeDb({ children: [childRow()] });
    const { requests } = makeServices(db);
    const views = await requests.list(PARENT_ID, caller);
    expect(db.tx.dentalOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { parentOrderId: PARENT_ID, deletedAt: null, ...scope },
      }),
    );
    expect(views).toHaveLength(1);
  });
});

describe('SupplementalOrderService.update', () => {
  it('clears answers sent as null, drops orphan teeth, audits the real diff', async () => {
    const db = fakeDb({
      children: [
        childRow(
          {},
          {
            movementRestriction: SupplementalTeethScope.selected_teeth,
            upperInstructions: 'Keep 13',
            teeth: [
              {
                purpose: SupplementalToothPurpose.do_not_move,
                toothNumber: 13,
              },
            ],
          },
        ),
      ],
    });
    const { requests } = makeServices(db);

    await requests.update(
      'child-1',
      {
        upperInstructions: null,
        movementRestriction: SupplementalTeethScope.none,
      },
      doctor,
    );

    expect(db.tx.supplementalOrderRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-1' },
      data: {
        upperInstructions: null,
        movementRestriction: SupplementalTeethScope.none,
      },
    });
    expect(db.tx.supplementalToothSelection.deleteMany).toHaveBeenCalledWith({
      where: { requestId: 'request-1' },
    });
    expect(db.tx.supplementalToothSelection.createMany).not.toHaveBeenCalled();
    expect(auditRows(db)).toEqual([
      expect.objectContaining({
        orderId: 'child-1',
        action: 'supplemental_draft_updated',
        changes: {
          upperInstructions: { from: 'Keep 13', to: null },
          movementRestriction: { from: 'selected_teeth', to: 'none' },
          teeth: { from: 'do_not_move 13', to: '' },
        },
      }),
    ]);
  });

  it('keeps the teeth to the treated arch: an upper-only save drops the lower ones, no error', async () => {
    const db = fakeDb({
      children: [
        childRow(
          {},
          {
            precisionCutPolicy: SupplementalCutoutPlan.selected_teeth,
            teeth: [
              { purpose: SupplementalToothPurpose.cutout, toothNumber: 13 },
              { purpose: SupplementalToothPurpose.cutout, toothNumber: 43 },
            ],
          },
        ),
      ],
    });
    const { requests } = makeServices(db);

    await requests.update('child-1', { archTreatment: 'upper' }, doctor);

    expect(db.tx.dentalOrder.update).toHaveBeenCalledWith({
      where: { id: 'child-1' },
      data: { archTreatment: 'upper', treatBothArch: false },
    });
    expect(db.tx.supplementalToothSelection.createMany).toHaveBeenCalledWith({
      data: [
        {
          requestId: 'request-1',
          purpose: SupplementalToothPurpose.cutout,
          toothNumber: 13,
        },
      ],
    });
    expect(auditRows(db)[0]).toMatchObject({
      changes: {
        archTreatment: { from: 'both', to: 'upper' },
        teeth: { from: 'cutout 13, 43', to: 'cutout 13' },
      },
    });
  });

  it('writes nothing, not even an audit row, when the save changes nothing', async () => {
    const db = fakeDb({ children: [childRow({}, { quantity: 2 })] });
    const { requests } = makeServices(db);
    await requests.update('child-1', { archTreatment: 'both' }, doctor);
    expect(db.tx.dentalOrder.update).not.toHaveBeenCalled();
    expect(db.tx.supplementalOrderRequest.update).not.toHaveBeenCalled();
    expect(db.tx.orderAuditLog.createMany).not.toHaveBeenCalled();
  });

  it('re-checks the draft state after locking the child', async () => {
    const db = fakeDb({
      children: [
        childRow(
          { status: OrderStatus.submitted },
          { reviewStatus: SupplementalReviewStatus.pending },
        ),
      ],
    });
    const { requests } = makeServices(db);
    await expect(
      requests.update('child-1', { upperInstructions: 'x' }, doctor),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: SUPPLEMENTAL_ERROR.NOT_DRAFT,
    });
    expect(db.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.tx.dentalOrder.findFirst.mock.invocationCallOrder[0],
    );
  });

  it('refuses contacts between teeth that do not touch', async () => {
    const db = fakeDb({ children: [childRow()] });
    const { requests } = makeServices(db);
    await expect(
      requests.update(
        'child-1',
        {
          contacts: [
            {
              purpose: SupplementalContactPurpose.performed_ipr,
              fromTooth: 11,
              toTooth: 13,
              amountMm: 0.2,
            },
          ],
        },
        doctor,
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: SUPPLEMENTAL_ERROR.INVALID_DRAFT,
    });
  });

  it('reads the source plan version from the plan, and refuses a foreign plan', async () => {
    const db = fakeDb({
      children: [childRow({ orderType: OrderType.transfer_template })],
    });
    const { requests } = makeServices(db);
    await requests.update(
      'child-1',
      { sourceTreatmentPlanId: PLAN_ID },
      doctor,
    );
    expect(db.tx.supplementalOrderRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-1' },
      data: { sourceTreatmentPlanId: PLAN_ID, sourceTreatmentPlanVersion: 2 },
    });

    await expect(
      requests.update(
        'child-1',
        { sourceTreatmentPlanId: '9e7a0f3c-1c1b-4c5e-8d2f-3b9a6d1e2f40' },
        doctor,
      ),
    ).rejects.toMatchObject({ errorCode: SUPPLEMENTAL_ERROR.INVALID_DRAFT });
  });

  it.each([designer, otherDoctor])('refuses %j (403)', async (caller) => {
    const db = fakeDb({ children: [childRow()] });
    const { requests } = makeServices(db);
    const failure = await failureOf(
      requests.update('child-1', { upperInstructions: 'x' }, caller),
    );
    expect(failure.status).toBe(403);
    expect(db.tx.supplementalOrderRequest.update).not.toHaveBeenCalled();
  });
});

describe('SupplementalOrderService.submit', () => {
  it('submits with the computed coverage reason (the draft does not block itself), audit and ONE event', async () => {
    const db = withSubmittableDraft();
    const { requests, emit } = makeServices(db);

    await requests.submit('child-1', doctor);

    expect(db.tx.dentalOrder.update).toHaveBeenCalledWith({
      where: { id: 'child-1' },
      data: { status: OrderStatus.submitted, submittedAt: NOW },
    });
    expect(argOf(db.tx.supplementalOrderRequest.update)).toMatchObject({
      where: { id: 'request-1' },
      data: {
        reviewStatus: SupplementalReviewStatus.pending,
        submittedAt: NOW,
        correctionNumber: null,
        reviewedById: null,
        reviewedByName: null,
        coverageStatus: SupplementalCoverageStatus.included,
        coverageReason: 'within_pack_allowance',
      },
    });
    expect(auditRows(db)).toMatchObject([
      {
        orderId: 'child-1',
        action: 'supplemental_submitted',
        changes: {
          status: { from: OrderStatus.draft, to: OrderStatus.submitted },
          coverageStatus: {
            from: SupplementalCoverageStatus.review_required,
            to: SupplementalCoverageStatus.included,
          },
        },
      },
      { orderId: PARENT_ID, action: 'supplemental_child_submitted' },
    ]);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      NotificationEvents.SupplementalOrderSubmitted,
      expect.objectContaining({
        orderId: 'child-1',
        parentOrderId: PARENT_ID,
        requestType: OrderType.additional_aligners,
        doctorId: doctor.userId,
      }),
    );
  });

  it('lists every problem in ONE 400 and writes nothing', async () => {
    const db = withSubmittableDraft({ reason: null, previousIpr: null });
    const { requests, emit } = makeServices(db);
    await expect(requests.submit('child-1', doctor)).rejects.toMatchObject({
      statusCode: 400,
      errorCode: SUPPLEMENTAL_ERROR.INCOMPLETE,
      message:
        'The request is incomplete: reason:required, previousIpr:required',
    });
    expect(db.tx.dentalOrder.update).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('refuses once the case was cancelled', async () => {
    const db = withSubmittableDraft();
    db.state.parents[0].status = OrderStatus.cancelled;
    const { requests, emit } = makeServices(db);
    await expect(requests.submit('child-1', doctor)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: SUPPLEMENTAL_ERROR.NOT_ALLOWED,
    });
    expect(emit).not.toHaveBeenCalled();
  });

  it('refuses a second submission (state re-read under the lock): no audit, no event', async () => {
    const db = withSubmittableDraft();
    const child = db.state.children[0];
    child.status = OrderStatus.submitted;
    (child.supplementalRequest as Record<string, unknown>).reviewStatus =
      SupplementalReviewStatus.pending;
    const { requests, emit } = makeServices(db);
    await expect(requests.submit('child-1', doctor)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: SUPPLEMENTAL_ERROR.NOT_DRAFT,
    });
    expect(db.tx.orderAuditLog.createMany).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('keeps the price a doctor accepted after a rejected warranty', async () => {
    const db = fakeDb({
      children: [
        childRow(
          {
            orderType: OrderType.replacement,
            archTreatment: 'upper',
            warrantyConversion: { id: 'warranty-request' },
          },
          {
            replacementFromAligner: 5,
            replacementToAligner: 5,
            quantity: 1,
            replacementReason: 'other',
            reasonDetails: 'Garantie refusée CASE-001-WAR-01',
            urgency: 'standard',
            coverageStatus: SupplementalCoverageStatus.chargeable,
            coverageReason: 'warranty_rejected_doctor_confirmed',
          },
        ),
      ],
    });
    const { requests } = makeServices(db);
    await requests.submit('child-1', doctor);
    expect(argOf(db.tx.supplementalOrderRequest.update)).toMatchObject({
      where: { id: 'request-1' },
      data: {
        coverageStatus: SupplementalCoverageStatus.chargeable,
        coverageReason: 'warranty_rejected_doctor_confirmed',
      },
    });
  });
});

describe('SupplementalOrderService.removeDraft', () => {
  it('archives the draft, frees its key and writes the child + case rows', async () => {
    const db = fakeDb({ children: [childRow()] });
    const { requests } = makeServices(db);
    await requests.removeDraft('child-1', doctor);
    expect(db.tx.dentalOrder.update).toHaveBeenCalledWith({
      where: { id: 'child-1' },
      data: { deletedAt: NOW },
    });
    expect(db.tx.supplementalOrderRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-1' },
      data: { idempotencyKey: 'archived_request-1_key-0000-0001' },
    });
    expect(auditRows(db).map((row) => [row.orderId, row.action])).toEqual([
      ['child-1', 'supplemental_draft_archived'],
      [PARENT_ID, 'supplemental_child_archived'],
    ]);
  });
});
