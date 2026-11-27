import {
  OrderStatus,
  ProductionArch,
  ProductionEventType,
  ProductionNoticeStatus,
} from '@prisma/client';
import {
  PRODUCTION_ANOMALY,
  type ProductionAnomaly,
} from '../production.contract';
import {
  batchKeptAnomalies,
  cancelledEventAnomalies,
  caseStateAnomalies,
  compareAnomalies,
  countAnomaliesByKind,
  coverageAnomalies,
  detectAnomalies,
  noticeAnomalies,
  stageSkippedAnomalies,
  warningAnomalies,
  type AnomalyLiveEvent,
  type AnomalyNotice,
  type AnomalyOrder,
  type AnomalyPeriodEvent,
} from './production-anomalies.rules';
import {
  DAY_3_END,
  DAY_3_START,
  tunisNov3,
} from './report-fixtures.helper-spec';

const { upper, lower } = ProductionArch;
const {
  model_printed: printed,
  aligner_thermoformed: thermoformed,
  aligner_cut: cut,
  aligner_delivered: delivered,
} = ProductionEventType;
const RANGE = { gte: DAY_3_START, lt: DAY_3_END };

let sequence = 0;
const nextId = (prefix: string) =>
  `${prefix}${String((sequence += 1)).padStart(3, '0')}`;

function periodEvent(
  over: Partial<AnomalyPeriodEvent> = {},
): AnomalyPeriodEvent {
  return {
    id: nextId('e'),
    orderId: 'o1',
    orderCode: 'ORD-001',
    patientName: 'Zoé Ben Salah',
    type: printed,
    arch: upper,
    stepFrom: 1,
    stepTo: 10,
    performedAt: tunisNov3('10:00'),
    warnings: [],
    cancelledAt: null,
    ...over,
  };
}

function live(over: Partial<AnomalyLiveEvent> = {}): AnomalyLiveEvent {
  return {
    id: nextId('l'),
    type: printed,
    arch: upper,
    stepFrom: 1,
    stepTo: 10,
    performedAt: tunisNov3('09:00'),
    ...over,
  };
}

const zeroCounters = { printed: 0, thermoformed: 0, cut: 0, delivered: 0 };

function order(over: Partial<AnomalyOrder> = {}): AnomalyOrder {
  return {
    orderId: 'o1',
    orderCode: 'ORD-001',
    patientName: 'Zoé Ben Salah',
    status: OrderStatus.fabrication,
    coverageStartedAt: null,
    planned: {
      upper: { total: 20, source: 'approved_plan', provisional: false },
      lower: { total: 12, source: 'approved_plan', provisional: false },
    },
    treatedArches: [upper, lower],
    counters: { upper: { ...zeroCounters }, lower: { ...zeroCounters } },
    lastActionAt: tunisNov3('10:00'),
    liveEvents: [],
    productionBatches: [],
    firstAlignerDeliveryAt: null,
    ...over,
  };
}

function notice(over: Partial<AnomalyNotice> = {}): AnomalyNotice {
  return {
    id: nextId('n'),
    orderId: 'o1',
    orderCode: 'ORD-001',
    patientName: 'Zoé Ben Salah',
    eventIds: ['e-b', 'e-a'],
    status: ProductionNoticeStatus.failed,
    attempts: 5,
    skipReason: null,
    lastError: 'SMTP 550',
    updatedAt: tunisNov3('12:00'),
    ...over,
  };
}

const mapOf = (...orders: AnomalyOrder[]) =>
  new Map(orders.map((item) => [item.orderId, item] as const));

describe('stage_skipped', () => {
  it('thermoformed steps the printing does not cover: the gaps, the row, its performedAt, the act', () => {
    const row = periodEvent({ type: thermoformed, stepFrom: 1, stepTo: 10 });
    const items = stageSkippedAnomalies(
      [row],
      mapOf(
        order({
          liveEvents: [live({ type: printed, stepFrom: 1, stepTo: 6 })],
        }),
      ),
    );
    expect(items).toEqual([
      {
        kind: PRODUCTION_ANOMALY.stage_skipped,
        orderId: 'o1',
        orderCode: 'ORD-001',
        patientName: 'Zoé Ben Salah',
        arch: upper,
        steps: [{ from: 7, to: 10 }],
        eventIds: [row.id],
        noticeId: null,
        warnings: [],
        at: row.performedAt.toISOString(),
        detail: thermoformed,
      },
    ]);
  });

  it('nothing when the previous act covers the range', () => {
    const items = stageSkippedAnomalies(
      [periodEvent({ type: cut, stepFrom: 3, stepTo: 8 })],
      mapOf(
        order({
          liveEvents: [
            live({ type: thermoformed, stepFrom: 1, stepTo: 4 }),
            live({ type: thermoformed, stepFrom: 5, stepTo: 9 }),
          ],
        }),
      ),
    );
    expect(items).toEqual([]);
  });

  it('printing has no previous act: never a finding', () => {
    expect(
      stageSkippedAnomalies([periodEvent({ type: printed })], mapOf(order())),
    ).toEqual([]);
  });

  it('judges the CURRENT state: the missing stage declared later clears it', () => {
    const items = stageSkippedAnomalies(
      [periodEvent({ type: delivered, performedAt: tunisNov3('08:00') })],
      mapOf(
        order({
          liveEvents: [
            live({
              type: cut,
              stepFrom: 1,
              stepTo: 10,
              performedAt: tunisNov3('18:00'),
            }),
          ],
        }),
      ),
    );
    expect(items).toEqual([]);
  });

  it('a cancelled row of the later act is not a finding (it is a cancelled_event)', () => {
    expect(
      stageSkippedAnomalies(
        [periodEvent({ type: thermoformed, cancelledAt: tunisNov3('11:00') })],
        mapOf(order()),
      ),
    ).toEqual([]);
  });

  it('one finding per case × arch × act: merged gaps, the rows that have one, the latest performedAt', () => {
    const early = periodEvent({
      type: thermoformed,
      stepFrom: 1,
      stepTo: 3,
      performedAt: tunisNov3('08:00'),
    });
    const covered = periodEvent({
      type: thermoformed,
      stepFrom: 4,
      stepTo: 6,
      performedAt: tunisNov3('20:00'),
    });
    const late = periodEvent({
      type: thermoformed,
      stepFrom: 7,
      stepTo: 9,
      performedAt: tunisNov3('15:00'),
    });
    const items = stageSkippedAnomalies(
      [late, covered, early],
      mapOf(
        order({
          liveEvents: [live({ type: printed, stepFrom: 4, stepTo: 6 })],
        }),
      ),
    );
    expect(items).toHaveLength(1);
    expect(items[0].steps).toEqual([
      { from: 1, to: 3 },
      { from: 7, to: 9 },
    ]);
    expect(items[0].eventIds).toEqual([early.id, late.id].sort());
    expect(items[0].at).toBe(tunisNov3('15:00').toISOString());
  });

  it('the other arch never covers: one finding per arch', () => {
    const items = stageSkippedAnomalies(
      [
        periodEvent({ type: thermoformed, arch: upper }),
        periodEvent({ type: thermoformed, arch: lower }),
      ],
      mapOf(order({ liveEvents: [live({ type: printed, arch: lower })] })),
    );
    expect(items.map((item) => item.arch)).toEqual([upper]);
  });

  it('acts are judged separately (cut vs thermoformed, delivered vs cut)', () => {
    const items = stageSkippedAnomalies(
      [
        periodEvent({ type: cut, stepFrom: 1, stepTo: 2 }),
        periodEvent({ type: delivered, stepFrom: 1, stepTo: 2 }),
      ],
      mapOf(order()),
    );
    expect(items.map((item) => item.detail).sort()).toEqual(
      [cut, delivered].sort(),
    );
  });

  it('a case missing from the loaded cases (archived meanwhile) is skipped', () => {
    expect(
      stageSkippedAnomalies(
        [periodEvent({ type: cut, orderId: 'gone' })],
        mapOf(order()),
      ),
    ).toEqual([]);
  });
});

describe('duplicate_declaration / unreleased_delivery / confirmed_warning', () => {
  it('already_declared → duplicate_declaration on that row', () => {
    const row = periodEvent({
      type: cut,
      arch: lower,
      stepFrom: 4,
      stepTo: 6,
      warnings: ['already_declared'],
    });
    expect(warningAnomalies([row])).toEqual([
      {
        kind: PRODUCTION_ANOMALY.duplicate_declaration,
        orderId: 'o1',
        orderCode: 'ORD-001',
        patientName: 'Zoé Ben Salah',
        arch: lower,
        steps: [{ from: 4, to: 6 }],
        eventIds: [row.id],
        noticeId: null,
        warnings: ['already_declared'],
        at: row.performedAt.toISOString(),
        detail: cut,
      },
    ]);
  });

  it('steps_not_released on a delivery → unreleased_delivery', () => {
    const items = warningAnomalies([
      periodEvent({ type: delivered, warnings: ['steps_not_released'] }),
    ]);
    expect(items.map((item) => [item.kind, item.warnings])).toEqual([
      [PRODUCTION_ANOMALY.unreleased_delivery, ['steps_not_released']],
    ]);
  });

  it('steps_not_released on ANY other act is an unreleased finding too, naming the act (spec §3)', () => {
    const items = warningAnomalies([
      periodEvent({ type: thermoformed, warnings: ['steps_not_released'] }),
      periodEvent({
        type: cut,
        warnings: ['steps_not_released', 'quantity_differs'],
      }),
    ]);
    expect(
      items.map((item) => [item.kind, item.warnings, item.detail]),
    ).toEqual([
      [
        PRODUCTION_ANOMALY.unreleased_delivery,
        ['steps_not_released'],
        thermoformed,
      ],
      [PRODUCTION_ANOMALY.unreleased_delivery, ['steps_not_released'], cut],
      [PRODUCTION_ANOMALY.confirmed_warning, ['quantity_differs'], cut],
    ]);
  });

  it('one row can give all three, the rest of its codes grouped in PRODUCTION_WARNING order', () => {
    const items = warningAnomalies([
      periodEvent({
        type: delivered,
        warnings: [
          'arch_not_treated',
          'steps_not_released',
          'already_declared',
          'previous_stage_missing',
          'quantity_differs',
        ],
      }),
    ]);
    expect(items.map((item) => [item.kind, item.warnings])).toEqual([
      [PRODUCTION_ANOMALY.duplicate_declaration, ['already_declared']],
      [PRODUCTION_ANOMALY.unreleased_delivery, ['steps_not_released']],
      [
        PRODUCTION_ANOMALY.confirmed_warning,
        ['previous_stage_missing', 'quantity_differs', 'arch_not_treated'],
      ],
    ]);
  });

  it('beyond_planned_total alone is a confirmed_warning', () => {
    expect(
      warningAnomalies([
        periodEvent({ warnings: ['beyond_planned_total'] }),
      ]).map((item) => item.kind),
    ).toEqual([PRODUCTION_ANOMALY.confirmed_warning]);
  });

  it('no warning, or only unknown strings: nothing', () => {
    expect(
      warningAnomalies([
        periodEvent(),
        periodEvent({ warnings: ['not_a_code', ''] }),
      ]),
    ).toEqual([]);
  });

  it('a cancelled row raises none of them', () => {
    expect(
      warningAnomalies([
        periodEvent({
          warnings: ['already_declared', 'quantity_differs'],
          cancelledAt: tunisNov3('11:00'),
        }),
      ]),
    ).toEqual([]);
  });
});

describe('cancelled_event', () => {
  it('every cancelled row of the period, dated by its cancel, with its stored warnings', () => {
    const row = periodEvent({
      type: delivered,
      stepFrom: 5,
      stepTo: 8,
      warnings: ['already_declared'],
      cancelledAt: tunisNov3('16:30'),
    });
    expect(cancelledEventAnomalies([row, periodEvent()])).toEqual([
      expect.objectContaining({
        kind: PRODUCTION_ANOMALY.cancelled_event,
        arch: upper,
        steps: [{ from: 5, to: 8 }],
        eventIds: [row.id],
        warnings: ['already_declared'],
        at: tunisNov3('16:30').toISOString(),
        detail: delivered,
      }),
    ]);
  });
});

describe('notice_failed / notice_skipped', () => {
  it('failed for good: the notice, its events (sorted), lastError, updatedAt', () => {
    const row = notice();
    expect(noticeAnomalies([row])).toEqual([
      {
        kind: PRODUCTION_ANOMALY.notice_failed,
        orderId: 'o1',
        orderCode: 'ORD-001',
        patientName: 'Zoé Ben Salah',
        arch: null,
        steps: null,
        eventIds: ['e-a', 'e-b'],
        noticeId: row.id,
        warnings: [],
        at: tunisNov3('12:00').toISOString(),
        detail: 'SMTP 550',
      },
    ]);
  });

  it('failed with attempts left is still being retried: nothing', () => {
    expect(noticeAnomalies([notice({ attempts: 4 })])).toEqual([]);
  });

  it.each(['not_configured', 'no_recipient'])(
    'skipped for %s → notice_skipped with the reason',
    (reason) => {
      const items = noticeAnomalies([
        notice({
          status: ProductionNoticeStatus.skipped,
          attempts: 0,
          skipReason: reason,
          lastError: null,
        }),
      ]);
      expect(items.map((item) => [item.kind, item.detail])).toEqual([
        [PRODUCTION_ANOMALY.notice_skipped, reason],
      ]);
    },
  );

  it.each(['cancelled_before_send', 'original_not_sent', null])(
    'skipped for %p is expected: nothing',
    (reason) => {
      expect(
        noticeAnomalies([
          notice({
            status: ProductionNoticeStatus.skipped,
            skipReason: reason,
          }),
        ]),
      ).toEqual([]);
    },
  );

  it.each([
    ProductionNoticeStatus.sent,
    ProductionNoticeStatus.pending,
    ProductionNoticeStatus.sending,
  ])('%s: nothing', (status) => {
    expect(noticeAnomalies([notice({ status })])).toEqual([]);
  });
});

describe('finished_incomplete / planned_total_unknown', () => {
  const finishedShort = order({
    status: OrderStatus.finished,
    counters: {
      upper: { ...zeroCounters, delivered: 10 },
      lower: { ...zeroCounters, delivered: 12 },
    },
    liveEvents: [
      live({ type: delivered, arch: upper, stepFrom: 1, stepTo: 10 }),
      live({ type: delivered, arch: lower, stepFrom: 1, stepTo: 12 }),
    ],
  });

  it('a finished case short on one arch: that arch, its undelivered steps, at lastActionAt', () => {
    expect(caseStateAnomalies([finishedShort], RANGE)).toEqual([
      {
        kind: PRODUCTION_ANOMALY.finished_incomplete,
        orderId: 'o1',
        orderCode: 'ORD-001',
        patientName: 'Zoé Ben Salah',
        arch: upper,
        steps: [{ from: 11, to: 20 }],
        eventIds: [],
        noticeId: null,
        warnings: [],
        at: tunisNov3('10:00').toISOString(),
        detail: null,
      },
    ]);
  });

  it('a finished, fully delivered case: nothing', () => {
    const complete = order({
      status: OrderStatus.finished,
      counters: {
        upper: { ...zeroCounters, delivered: 20 },
        lower: { ...zeroCounters, delivered: 12 },
      },
    });
    expect(caseStateAnomalies([complete], RANGE)).toEqual([]);
  });

  it('completion is count-based, like every list: 20 distinct steps of a 20 total is complete', () => {
    const counted = order({
      status: OrderStatus.finished,
      planned: {
        upper: { total: 20, source: 'approved_plan', provisional: false },
        lower: null,
      },
      treatedArches: [upper],
      counters: {
        upper: { ...zeroCounters, delivered: 20 },
        lower: { ...zeroCounters },
      },
    });
    expect(caseStateAnomalies([counted], RANGE)).toEqual([]);
  });

  it('a short case that is not finished is not an anomaly', () => {
    expect(
      caseStateAnomalies(
        [{ ...finishedShort, status: OrderStatus.shipped }],
        RANGE,
      ),
    ).toEqual([]);
  });

  it('a last action outside the period (or none) is left to its own period', () => {
    expect(
      caseStateAnomalies(
        [
          { ...finishedShort, lastActionAt: DAY_3_END },
          {
            ...finishedShort,
            lastActionAt: new Date(DAY_3_START.getTime() - 1),
          },
          { ...finishedShort, lastActionAt: null },
        ],
        RANGE,
      ),
    ).toEqual([]);
  });

  it('a treated arch without a total → planned_total_unknown; an untreated arch never', () => {
    const unknown = order({
      planned: {
        upper: { total: null, source: null, provisional: true },
        lower: null,
      },
      treatedArches: [upper],
    });
    expect(
      caseStateAnomalies([unknown], RANGE).map((item) => [
        item.kind,
        item.arch,
        item.steps,
      ]),
    ).toEqual([[PRODUCTION_ANOMALY.planned_total_unknown, upper, null]]);
  });

  it('a finished case with an unknown total gives both, without steps', () => {
    const items = caseStateAnomalies(
      [
        order({
          status: OrderStatus.finished,
          planned: {
            upper: { total: null, source: null, provisional: true },
            lower: { total: 12, source: 'pack', provisional: true },
          },
          counters: {
            upper: { ...zeroCounters, delivered: 9 },
            lower: { ...zeroCounters, delivered: 12 },
          },
        }),
      ],
      RANGE,
    );
    expect(items.map((item) => [item.kind, item.arch, item.steps])).toEqual([
      [PRODUCTION_ANOMALY.finished_incomplete, upper, null],
      [PRODUCTION_ANOMALY.planned_total_unknown, upper, null],
    ]);
  });
});

describe('coverage_started_by_cancelled_delivery', () => {
  const start = tunisNov3('10:00');
  const cancelledDelivery = (over: Partial<AnomalyPeriodEvent> = {}) =>
    periodEvent({
      type: delivered,
      stepFrom: 1,
      stepTo: 4,
      performedAt: start,
      cancelledAt: tunisNov3('14:00'),
      ...over,
    });

  it('the window started on a delivery later cancelled, with nothing else to justify it', () => {
    const row = cancelledDelivery();
    expect(
      coverageAnomalies([row], mapOf(order({ coverageStartedAt: start }))),
    ).toEqual([
      {
        kind: PRODUCTION_ANOMALY.coverage_started_by_cancelled_delivery,
        orderId: 'o1',
        orderCode: 'ORD-001',
        patientName: 'Zoé Ben Salah',
        arch: upper,
        steps: [{ from: 1, to: 4 }],
        eventIds: [row.id],
        noticeId: null,
        warnings: [],
        at: tunisNov3('14:00').toISOString(),
        detail: start.toISOString(),
      },
    ]);
  });

  it('both arches cancelled: no single arch, merged steps, the latest cancel', () => {
    const items = coverageAnomalies(
      [
        cancelledDelivery({ arch: upper }),
        cancelledDelivery({ arch: lower, cancelledAt: tunisNov3('15:00') }),
      ],
      mapOf(order({ coverageStartedAt: start })),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      arch: null,
      steps: [{ from: 1, to: 4 }],
      at: tunisNov3('15:00').toISOString(),
    });
    expect(items[0].eventIds).toHaveLength(2);
  });

  it('a live delivery at or before the start justifies it (a legacy import included)', () => {
    expect(
      coverageAnomalies(
        [cancelledDelivery()],
        mapOf(
          order({
            coverageStartedAt: start,
            liveEvents: [live({ type: delivered, performedAt: start })],
          }),
        ),
      ),
    ).toEqual([]);
  });

  it('a live delivery AFTER the start does not', () => {
    expect(
      coverageAnomalies(
        [cancelledDelivery()],
        mapOf(
          order({
            coverageStartedAt: start,
            liveEvents: [
              live({ type: delivered, performedAt: tunisNov3('11:00') }),
            ],
          }),
        ),
      ),
    ).toHaveLength(1);
  });

  it('an AlignerDelivery at the start (a calendar day at 00:00 UTC) justifies it; a later one does not', () => {
    const dayStart = new Date('2026-11-03T00:00:00.000Z');
    expect(
      coverageAnomalies(
        [cancelledDelivery({ performedAt: tunisNov3('00:30') })],
        mapOf(
          order({
            coverageStartedAt: dayStart,
            firstAlignerDeliveryAt: dayStart,
          }),
        ),
      ),
    ).toEqual([]);
    expect(
      coverageAnomalies(
        [cancelledDelivery()],
        mapOf(
          order({
            coverageStartedAt: start,
            firstAlignerDeliveryAt: new Date('2026-11-04T00:00:00.000Z'),
          }),
        ),
      ),
    ).toHaveLength(1);
  });

  it('a cancelled delivery performed after the start did not start it', () => {
    expect(
      coverageAnomalies(
        [cancelledDelivery({ performedAt: tunisNov3('10:01') })],
        mapOf(order({ coverageStartedAt: start })),
      ),
    ).toEqual([]);
  });

  it('no coverage window, or a live / non-delivery row: nothing', () => {
    expect(
      coverageAnomalies(
        [cancelledDelivery()],
        mapOf(order({ coverageStartedAt: null })),
      ),
    ).toEqual([]);
    expect(
      coverageAnomalies(
        [
          cancelledDelivery({ cancelledAt: null }),
          cancelledDelivery({ type: cut }),
        ],
        mapOf(order({ coverageStartedAt: start })),
      ),
    ).toEqual([]);
  });
});

describe('batch_kept_after_cancel', () => {
  const finished = (over: Partial<AnomalyOrder> = {}) =>
    order({
      status: OrderStatus.finished,
      productionBatches: [{ fromStep: 1, toStep: 10 }],
      liveEvents: [
        live({ type: delivered, arch: upper, stepFrom: 1, stepTo: 6 }),
        live({ type: delivered, arch: lower, stepFrom: 1, stepTo: 10 }),
      ],
      ...over,
    });
  const cancelledUpper = periodEvent({
    type: delivered,
    arch: upper,
    stepFrom: 7,
    stepTo: 10,
    cancelledAt: tunisNov3('17:00'),
  });

  it('a production-delivered batch of a finished case no longer covered on an arch', () => {
    expect(batchKeptAnomalies([cancelledUpper], mapOf(finished()))).toEqual([
      {
        kind: PRODUCTION_ANOMALY.batch_kept_after_cancel,
        orderId: 'o1',
        orderCode: 'ORD-001',
        patientName: 'Zoé Ben Salah',
        arch: upper,
        steps: [{ from: 7, to: 10 }],
        eventIds: [cancelledUpper.id],
        noticeId: null,
        warnings: [],
        at: tunisNov3('17:00').toISOString(),
        detail: '1-10',
      },
    ]);
  });

  it('a case that is not finished had its batch reverted: nothing', () => {
    expect(
      batchKeptAnomalies(
        [cancelledUpper],
        mapOf(finished({ status: OrderStatus.shipped })),
      ),
    ).toEqual([]);
  });

  it('still covered on every treated arch: nothing', () => {
    expect(
      batchKeptAnomalies(
        [cancelledUpper],
        mapOf(
          finished({
            liveEvents: [
              live({ type: delivered, arch: upper, stepFrom: 1, stepTo: 10 }),
              live({ type: delivered, arch: lower, stepFrom: 1, stepTo: 10 }),
            ],
          }),
        ),
      ),
    ).toEqual([]);
  });

  it('only an untreated arch uncovered: nothing', () => {
    expect(
      batchKeptAnomalies(
        [periodEvent({ ...cancelledUpper, arch: lower })],
        mapOf(
          finished({
            treatedArches: [upper],
            liveEvents: [
              live({ type: delivered, arch: upper, stepFrom: 1, stepTo: 10 }),
            ],
          }),
        ),
      ),
    ).toEqual([]);
  });

  it("reported in the cancel's period only: no overlapping cancelled delivery of the period on that arch, nothing", () => {
    expect(
      batchKeptAnomalies(
        [
          periodEvent({ ...cancelledUpper, stepFrom: 11, stepTo: 12 }),
          periodEvent({ ...cancelledUpper, arch: lower }),
        ],
        mapOf(finished()),
      ),
    ).toEqual([]);
  });

  it('one finding per batch × arch, each tied to the cancels that overlap it', () => {
    const items = batchKeptAnomalies(
      [
        cancelledUpper,
        periodEvent({
          ...cancelledUpper,
          id: 'e-lower',
          arch: lower,
          stepFrom: 1,
          stepTo: 12,
        }),
      ],
      mapOf(
        finished({
          productionBatches: [
            { fromStep: 1, toStep: 10 },
            { fromStep: 11, toStep: 12 },
          ],
          liveEvents: [
            live({ type: delivered, arch: upper, stepFrom: 1, stepTo: 6 }),
          ],
        }),
      ),
    );
    // Batch 11-12 upper is uncovered too, but no cancel of the period
    // touched it (the upper cancel was 7-10): not this period's finding.
    expect(
      items.map((item) => [item.detail, item.arch, item.steps, item.eventIds]),
    ).toEqual([
      ['1-10', upper, [{ from: 7, to: 10 }], [cancelledUpper.id]],
      ['1-10', lower, [{ from: 1, to: 10 }], ['e-lower']],
      ['11-12', lower, [{ from: 11, to: 12 }], ['e-lower']],
    ]);
  });

  describe('clipped to the approved totals, as the projection reverts (CONC-02)', () => {
    // Plan upper 20 / lower 14, one pack-max batch [1,20].
    const clipped = (over: Partial<AnomalyOrder> = {}) =>
      finished({
        planned: {
          upper: { total: 20, source: 'approved_plan', provisional: false },
          lower: { total: 14, source: 'approved_plan', provisional: false },
        },
        productionBatches: [{ fromStep: 1, toStep: 20 }],
        liveEvents: [
          live({ type: delivered, arch: upper, stepFrom: 1, stepTo: 14 }),
          live({ type: delivered, arch: lower, stepFrom: 1, stepTo: 14 }),
        ],
        ...over,
      });
    const cancel = (arch: ProductionArch, stepFrom: number, stepTo: number) =>
      periodEvent({
        type: delivered,
        arch,
        stepFrom,
        stepTo,
        cancelledAt: tunisNov3('17:00'),
      });

    it('steps past an arch approved total are never "uncovered"', () => {
      // Lower 15-20 do not exist on a 14-aligner plan: no finding for them.
      expect(
        batchKeptAnomalies([cancel(lower, 15, 20)], mapOf(clipped())),
      ).toEqual([]);
      // Upper 15-20 do: cancelling them uncovers the batch on upper.
      const items = batchKeptAnomalies(
        [cancel(upper, 15, 20)],
        mapOf(clipped()),
      );
      expect(items.map((item) => [item.arch, item.steps, item.detail])).toEqual(
        [[upper, [{ from: 15, to: 20 }], '1-20']],
      );
    });

    it('a batch wholly beyond both totals is uncovered only once no live delivery is left', () => {
      const beyond = { productionBatches: [{ fromStep: 21, toStep: 30 }] };
      const cancelled = cancel(upper, 1, 3);
      expect(batchKeptAnomalies([cancelled], mapOf(clipped(beyond)))).toEqual(
        [],
      );
      expect(
        batchKeptAnomalies(
          [cancelled],
          mapOf(clipped({ ...beyond, liveEvents: [] })),
        ),
      ).toEqual([
        expect.objectContaining({
          kind: PRODUCTION_ANOMALY.batch_kept_after_cancel,
          arch: null,
          steps: null,
          eventIds: [cancelled.id],
          at: tunisNov3('17:00').toISOString(),
          detail: '21-30',
        }),
      ]);
    });
  });
});

describe('ordering and counts', () => {
  const item = (over: Partial<ProductionAnomaly>): ProductionAnomaly => ({
    kind: PRODUCTION_ANOMALY.cancelled_event,
    orderId: 'o1',
    orderCode: 'ORD-001',
    patientName: 'P',
    arch: upper,
    steps: null,
    eventIds: ['e1'],
    noticeId: null,
    warnings: [],
    at: '2026-11-03T10:00:00.000Z',
    detail: null,
    ...over,
  });

  it('at desc, then kind order, orderCode, arch (upper, lower, none), first id, steps, detail', () => {
    const list = [
      item({ eventIds: ['e2'] }),
      item({ arch: null }),
      item({ arch: lower }),
      item({ orderCode: 'ORD-000' }),
      item({ kind: PRODUCTION_ANOMALY.stage_skipped }),
      item({ at: '2026-11-03T11:00:00.000Z' }),
      item({ eventIds: [], noticeId: 'e0' }),
      item({ steps: [{ from: 5, to: 6 }], eventIds: ['e1'] }),
      item({ steps: [{ from: 2, to: 3 }], eventIds: ['e1'], detail: 'b' }),
      item({ steps: [{ from: 2, to: 3 }], eventIds: ['e1'], detail: 'a' }),
    ];
    const sorted = [...list].sort(compareAnomalies);
    expect(sorted.map((entry) => list.indexOf(entry))).toEqual([
      5, 4, 3, 6, 9, 8, 7, 0, 2, 1,
    ]);
  });

  it('countsByKind lists every kind, zeros included', () => {
    const counts = countAnomaliesByKind([
      item({}),
      item({}),
      item({ kind: PRODUCTION_ANOMALY.notice_failed }),
    ]);
    expect(Object.keys(counts)).toEqual(Object.values(PRODUCTION_ANOMALY));
    expect(counts.cancelled_event).toBe(2);
    expect(counts.notice_failed).toBe(1);
    expect(counts.stage_skipped).toBe(0);
  });
});

describe('detectAnomalies', () => {
  it('runs every kind once, sorts the union and counts it', () => {
    const skipped = periodEvent({
      type: thermoformed,
      warnings: ['previous_stage_missing'],
      performedAt: tunisNov3('09:00'),
    });
    const cancelled = periodEvent({
      orderId: 'o2',
      orderCode: 'ORD-002',
      cancelledAt: tunisNov3('13:00'),
    });
    const result = detectAnomalies({
      range: RANGE,
      events: [skipped, cancelled],
      orders: [
        order(),
        order({
          orderId: 'o2',
          orderCode: 'ORD-002',
          planned: {
            upper: { total: null, source: null, provisional: true },
            lower: null,
          },
          treatedArches: [upper],
          lastActionAt: tunisNov3('11:00'),
        }),
      ],
      notices: [notice({ updatedAt: tunisNov3('12:00') })],
    });

    expect(result.items.map((entry) => [entry.kind, entry.at])).toEqual([
      [PRODUCTION_ANOMALY.cancelled_event, tunisNov3('13:00').toISOString()],
      [PRODUCTION_ANOMALY.notice_failed, tunisNov3('12:00').toISOString()],
      [
        PRODUCTION_ANOMALY.planned_total_unknown,
        tunisNov3('11:00').toISOString(),
      ],
      [PRODUCTION_ANOMALY.stage_skipped, tunisNov3('09:00').toISOString()],
      [PRODUCTION_ANOMALY.confirmed_warning, tunisNov3('09:00').toISOString()],
    ]);
    expect(result.countsByKind).toMatchObject({
      stage_skipped: 1,
      confirmed_warning: 1,
      cancelled_event: 1,
      notice_failed: 1,
      planned_total_unknown: 1,
      duplicate_declaration: 0,
      batch_kept_after_cancel: 0,
    });
  });

  it('an empty period: no items, every count at zero', () => {
    const result = detectAnomalies({
      range: RANGE,
      events: [],
      orders: [],
      notices: [],
    });
    expect(result.items).toEqual([]);
    expect(
      Object.values(result.countsByKind).every((count) => count === 0),
    ).toBe(true);
  });
});
