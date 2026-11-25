import {
  ArchTreatment,
  OrderFileCategory,
  OrderStatus,
  OrderType,
  ProductionArch,
  ProductionEventType,
} from '@prisma/client';
import {
  NON_PRODUCTION_STATUSES,
  PAYMENT_PHASE_STATUSES,
  PRODUCTION_STATUSES,
  correctionNoticeKey,
  deliveredNoticeKey,
} from '../production.constants';
import {
  computeProgress,
  countersFromProgress,
  emptyActTotals,
  findForbiddenKeys,
  isDeclarableStatus,
  isDeliveryComplete,
  isInProductionQueue,
  isReadableByTechnician,
  orderKindOf,
  plannedTotalsInputOf,
  productionDoneWhere,
  productionDownloadName,
  productionHistoryWhere,
  productionQueueWhere,
  productionTechnicianDoneWhere,
  productionTechnicianReadWhere,
  remainingByArch,
  resolvePlannedTotals,
  sheetVersionOf,
  treatedArches,
  type PlannedTotalsInput,
  type ProgressEventInput,
} from './index';

const base: PlannedTotalsInput = {
  archTreatment: ArchTreatment.both,
  treatBothArch: false,
  totalAligners: null,
  approvedPlan: null,
  quotation: null,
};

describe('treatedArches', () => {
  it.each([
    [ArchTreatment.upper, [ProductionArch.upper]],
    [ArchTreatment.lower, [ProductionArch.lower]],
    [ArchTreatment.both, [ProductionArch.upper, ProductionArch.lower]],
  ])('archTreatment %s', (archTreatment, expected) => {
    expect(treatedArches({ ...base, archTreatment })).toEqual(expected);
  });

  it('without archTreatment: treatBothArch, then the arches the plan sizes, then both', () => {
    expect(
      treatedArches({ ...base, archTreatment: null, treatBothArch: true }),
    ).toEqual([ProductionArch.upper, ProductionArch.lower]);
    expect(
      treatedArches({
        ...base,
        archTreatment: null,
        approvedPlan: { totalUpperAligners: 12, totalLowerAligners: null },
      }),
    ).toEqual([ProductionArch.upper]);
    expect(treatedArches({ ...base, archTreatment: null })).toEqual([
      ProductionArch.upper,
      ProductionArch.lower,
    ]);
  });
});

describe('resolvePlannedTotals', () => {
  it('the approved plan, per arch, is final', () => {
    expect(
      resolvePlannedTotals({
        ...base,
        approvedPlan: { totalUpperAligners: 18, totalLowerAligners: 14 },
        quotation: {
          maxStepsPerArch: 30,
          isUnlimitedSteps: false,
          deletedAt: null,
        },
      }),
    ).toEqual({
      upper: { total: 18, source: 'approved_plan', provisional: false },
      lower: { total: 14, source: 'approved_plan', provisional: false },
    });
  });

  it('an arch the plan does not size falls back on its own (pack, then case), provisional', () => {
    expect(
      resolvePlannedTotals({
        ...base,
        totalAligners: 20,
        approvedPlan: { totalUpperAligners: 18, totalLowerAligners: null },
        quotation: {
          maxStepsPerArch: 30,
          isUnlimitedSteps: false,
          deletedAt: null,
        },
      }).lower,
    ).toEqual({ total: 30, source: 'pack', provisional: true });
  });

  it('an unlimited or archived pack is skipped for the case total', () => {
    for (const quotation of [
      { maxStepsPerArch: 30, isUnlimitedSteps: true, deletedAt: null },
      { maxStepsPerArch: 30, isUnlimitedSteps: false, deletedAt: new Date() },
    ]) {
      expect(
        resolvePlannedTotals({ ...base, totalAligners: 20, quotation }).upper,
      ).toEqual({ total: 20, source: 'case', provisional: true });
    }
  });

  it('nothing known: a treated arch is { total: null, source: null }', () => {
    expect(resolvePlannedTotals(base).upper).toEqual({
      total: null,
      source: null,
      provisional: true,
    });
  });

  it('an arch the case does not treat is null, never a fallback', () => {
    expect(
      resolvePlannedTotals({
        ...base,
        archTreatment: ArchTreatment.upper,
        totalAligners: 20,
      }),
    ).toEqual({
      upper: { total: 20, source: 'case', provisional: true },
      lower: null,
    });
  });

  it('plannedTotalsInputOf reads the nested select row', () => {
    expect(
      plannedTotalsInputOf({
        archTreatment: ArchTreatment.lower,
        treatBothArch: false,
        totalAligners: 9,
        treatmentPlans: [{ totalUpperAligners: null, totalLowerAligners: 7 }],
        quotation: null,
      }),
    ).toEqual({
      archTreatment: ArchTreatment.lower,
      treatBothArch: false,
      totalAligners: 9,
      approvedPlan: { totalUpperAligners: null, totalLowerAligners: 7 },
      quotation: null,
    });
  });
});

describe('computeProgress (the ProductionProgress projection)', () => {
  const at = (iso: string) => new Date(iso);
  const event = (
    over: Partial<ProgressEventInput> = {},
  ): ProgressEventInput => ({
    type: ProductionEventType.model_printed,
    arch: ProductionArch.upper,
    stepFrom: 1,
    stepTo: 5,
    performedAt: at('2026-11-20T08:00:00.000Z'),
    cancelledAt: null,
    ...over,
  });

  it('counts distinct steps per act × arch; reprints do not inflate', () => {
    const progress = computeProgress([
      event(),
      event({ stepFrom: 3, stepTo: 8 }),
      event({ arch: ProductionArch.lower, stepTo: 2 }),
      event({ type: ProductionEventType.aligner_delivered, stepTo: 4 }),
    ]);
    expect(progress).toMatchObject({
      printedUpper: 8,
      printedLower: 2,
      thermoformedUpper: 0,
      deliveredUpper: 4,
      deliveredLower: 0,
    });
  });

  it('excludes cancelled rows from counters AND from the action span', () => {
    const progress = computeProgress([
      event({ performedAt: at('2026-11-21T08:00:00.000Z') }),
      event({
        stepFrom: 6,
        stepTo: 10,
        performedAt: at('2026-11-25T08:00:00.000Z'),
        cancelledAt: at('2026-11-25T09:00:00.000Z'),
      }),
      event({ performedAt: at('2026-11-19T08:00:00.000Z') }),
    ]);
    expect(progress.printedUpper).toBe(5);
    expect(progress.firstActionAt).toEqual(at('2026-11-19T08:00:00.000Z'));
    expect(progress.lastActionAt).toEqual(at('2026-11-21T08:00:00.000Z'));
  });

  it('all cancelled: zero counters, no span', () => {
    const progress = computeProgress([
      event({ cancelledAt: at('2026-11-21T00:00:00Z') }),
    ]);
    expect(progress.printedUpper).toBe(0);
    expect(progress.firstActionAt).toBeNull();
    expect(progress.lastActionAt).toBeNull();
  });

  it('countersFromProgress maps the columns; no row = zeros', () => {
    const counters = countersFromProgress({
      ...computeProgress([
        event({
          type: ProductionEventType.aligner_cut,
          arch: ProductionArch.lower,
        }),
      ]),
    });
    expect(counters.lower).toEqual({
      printed: 0,
      thermoformed: 0,
      cut: 5,
      delivered: 0,
    });
    expect(countersFromProgress(null)).toEqual({
      upper: { printed: 0, thermoformed: 0, cut: 0, delivered: 0 },
      lower: { printed: 0, thermoformed: 0, cut: 0, delivered: 0 },
    });
  });
});

describe('delivery completeness and remaining', () => {
  const counters = (upper: number, lower: number) => ({
    upper: { printed: 0, thermoformed: 0, cut: 0, delivered: upper },
    lower: { printed: 0, thermoformed: 0, cut: 0, delivered: lower },
  });
  const known = (total: number | null) => ({
    total,
    source: total === null ? null : ('approved_plan' as const),
    provisional: total === null,
  });

  it('complete only when every treated arch reached a known total', () => {
    const planned = { upper: known(10), lower: known(8) };
    expect(isDeliveryComplete(planned, counters(10, 8))).toBe(true);
    expect(isDeliveryComplete(planned, counters(10, 7))).toBe(false);
    expect(
      isDeliveryComplete({ upper: known(10), lower: null }, counters(10, 0)),
    ).toBe(true);
    expect(
      isDeliveryComplete({ upper: known(null), lower: null }, counters(50, 0)),
    ).toBe(false);
  });

  it('remaining is planned - delivered, floored, null when unknown or untreated', () => {
    expect(
      remainingByArch({ upper: known(10), lower: null }, counters(12, 0)),
    ).toEqual({ upper: 0, lower: null });
    expect(
      remainingByArch({ upper: known(10), lower: known(null) }, counters(4, 1)),
    ).toEqual({ upper: 6, lower: null });
  });

  it('sheetVersion follows the progress row', () => {
    expect(sheetVersionOf(null)).toBe('0');
    expect(
      sheetVersionOf({ updatedAt: new Date('2026-11-25T10:00:00.000Z') }),
    ).toBe('2026-11-25T10:00:00.000Z');
  });
});

describe('queue rule (D3)', () => {
  it.each([
    OrderStatus.paid,
    OrderStatus.fabrication,
    OrderStatus.ready_to_ship,
    OrderStatus.shipped,
  ])('%s is production, batch or not', (status) => {
    expect(
      isInProductionQueue({ status, deletedAt: null, hasReleasedBatch: false }),
    ).toBe(true);
  });

  it('an installment case still paying is production once a batch is released', () => {
    expect(
      isInProductionQueue({
        status: OrderStatus.payment_pending,
        deletedAt: null,
        hasReleasedBatch: true,
      }),
    ).toBe(true);
    expect(
      isInProductionQueue({
        status: OrderStatus.payment_pending,
        deletedAt: null,
        hasReleasedBatch: false,
      }),
    ).toBe(false);
  });

  it.each([
    OrderStatus.draft,
    OrderStatus.finished,
    OrderStatus.canceled,
    OrderStatus.cancelled,
    OrderStatus.rejected,
  ])('%s never is, even with a released batch', (status) => {
    expect(
      isInProductionQueue({ status, deletedAt: null, hasReleasedBatch: true }),
    ).toBe(false);
  });

  it('a soft-deleted order never is', () => {
    expect(
      isInProductionQueue({
        status: OrderStatus.fabrication,
        deletedAt: new Date(),
        hasReleasedBatch: true,
      }),
    ).toBe(false);
  });

  it('the Prisma filters encode the same rule', () => {
    expect(productionQueueWhere()).toMatchObject({
      deletedAt: null,
      OR: [
        { status: { in: [...PRODUCTION_STATUSES] } },
        {
          status: { in: [...PAYMENT_PHASE_STATUSES] },
          quotation: {
            is: {
              deletedAt: null,
              stepBatches: {
                some: { status: { in: ['unlocked', 'delivered'] } },
              },
            },
          },
        },
      ],
    });
    expect(productionDoneWhere()).toEqual({
      deletedAt: null,
      productionProgress: { is: { lastActionAt: { not: null } } },
      NOT: productionQueueWhere(),
    });
  });

  it('the status sets of the Prisma filter partition the enum exactly as isInProductionQueue does (DB-03)', () => {
    const [production, paying] = productionQueueWhere().OR as [
      { status: { in: OrderStatus[] } },
      { status: { in: OrderStatus[] } },
    ];
    for (const status of Object.values(OrderStatus)) {
      const sets = [
        production.status.in.includes(status),
        paying.status.in.includes(status),
        NON_PRODUCTION_STATUSES.includes(status),
      ];
      // Exactly one set holds each value: none is lost, none is doubled.
      expect([status, sets.filter(Boolean).length]).toEqual([status, 1]);
      const order = { status, deletedAt: null };
      expect(isInProductionQueue({ ...order, hasReleasedBatch: false })).toBe(
        production.status.in.includes(status),
      );
      expect(isInProductionQueue({ ...order, hasReleasedBatch: true })).toBe(
        production.status.in.includes(status) ||
          paying.status.in.includes(status),
      );
    }
    // The twelve statuses of a case still planned or paid, legacy ones included.
    expect([...PAYMENT_PHASE_STATUSES].sort()).toEqual(
      [
        OrderStatus.submitted,
        OrderStatus.under_review,
        OrderStatus.treatment_planning,
        OrderStatus.treatment_plan_ready,
        OrderStatus.revision_requested,
        OrderStatus.treatment_approved,
        OrderStatus.quotation_sent,
        OrderStatus.payment_plan_selected,
        OrderStatus.payment_pending,
        OrderStatus.payment_review,
        OrderStatus.in_review,
        OrderStatus.approved,
      ].sort(),
    );
  });

  it('the technician reads the queue and the cases DECLARED through the module, never a legacy-only archive', () => {
    expect(productionHistoryWhere()).toEqual({
      productionEvents: { some: { origin: 'declared' } },
    });
    expect(productionTechnicianReadWhere()).toEqual({
      deletedAt: null,
      OR: [productionQueueWhere(), productionHistoryWhere()],
    });
    expect(productionTechnicianDoneWhere()).toEqual({
      AND: [productionDoneWhere(), productionHistoryWhere()],
    });

    const finished = {
      status: OrderStatus.finished,
      deletedAt: null,
      hasReleasedBatch: true,
    };
    // Only legacy_batch rows (the D5 import): out of her reach.
    expect(
      isReadableByTechnician({ ...finished, hasDeclaredEvent: false }),
    ).toBe(false);
    expect(
      isReadableByTechnician({ ...finished, hasDeclaredEvent: true }),
    ).toBe(true);
    expect(
      isReadableByTechnician({
        status: OrderStatus.fabrication,
        deletedAt: null,
        hasReleasedBatch: false,
        hasDeclaredEvent: false,
      }),
    ).toBe(true);
    expect(
      isReadableByTechnician({
        ...finished,
        deletedAt: new Date(),
        hasDeclaredEvent: true,
      }),
    ).toBe(false);
  });

  it('nobody declares on a draft, cancelled or rejected order', () => {
    expect(isDeclarableStatus(OrderStatus.finished)).toBe(true);
    expect(isDeclarableStatus(OrderStatus.payment_pending)).toBe(true);
    for (const status of [
      OrderStatus.draft,
      OrderStatus.canceled,
      OrderStatus.cancelled,
      OrderStatus.rejected,
    ]) {
      expect(isDeclarableStatus(status)).toBe(false);
    }
  });

  it('orderKindOf', () => {
    expect(orderKindOf(OrderType.initial)).toBe('main');
    expect(orderKindOf(OrderType.warranty)).toBe('supplemental');
  });
});

describe('leak guard', () => {
  it('finds forbidden keys at any depth, as serialised', () => {
    expect(
      findForbiddenKeys({
        orderCode: 'OA-1',
        patient: { fullName: 'A', phone: '+216' },
        files: [{ id: 'f', relativePath: 'orders/x' }],
        cbctFeeAmount: 12,
        contacts: [{ amountMm: 0.2 }],
        nested: { toJSON: () => ({ publicToken: 't' }) },
      }),
    ).toEqual([
      'patient.phone',
      'files[0].relativePath',
      'cbctFeeAmount',
      'contacts[0].amountMm',
      'nested.publicToken',
    ]);
  });

  it('a clean production payload passes', () => {
    expect(
      findForbiddenKeys({
        orderCode: 'OA-1',
        planned: { upper: { total: 10 } },
        contacts: [{ iprMm: 0.2 }],
        additionalInstructions: 'x',
        deliveredToName: 'Coursier',
      }),
    ).toEqual([]);
  });

  it('production download names never carry the stored name (doctor, patient) or path', () => {
    const file = { category: OrderFileCategory.front_photo, orderIndex: 3 };
    expect(
      productionDownloadName(
        file,
        'orders/o-1/front_photo/Dr-Hajji_Marie-Dupont_front-photo_003.JPG',
      ),
    ).toBe('front-photo-003.jpg');
    expect(
      productionDownloadName(
        file,
        'orders/o-1/front_photo/Dr-Hajji_Marie-Dupont_front-photo_003-md.webp',
        'md',
      ),
    ).toBe('front-photo-003-md.webp');
    expect(
      productionDownloadName(
        { category: OrderFileCategory.zip, orderIndex: 12 },
        'orders/o-1/zip/no-extension',
      ),
    ).toBe('zip-012');
  });

  it('emptyActTotals has every act at zero', () => {
    expect(emptyActTotals()).toEqual({
      model_printed: { entries: 0, quantity: 0 },
      aligner_thermoformed: { entries: 0, quantity: 0 },
      aligner_cut: { entries: 0, quantity: 0 },
      aligner_delivered: { entries: 0, quantity: 0 },
    });
  });
});

describe('notice dedupe keys', () => {
  it('one delivered notice per declaration × channel, one correction per cancel request × channel (keyed on its lowest newly cancelled row)', () => {
    expect(deliveredNoticeKey('d-1', 'email')).toBe('delivered:d-1:email');
    expect(correctionNoticeKey('e-1', 'in_app')).toBe('correction:e-1:in_app');
  });
});
