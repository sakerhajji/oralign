import {
  BatchStatus,
  DeliveryRecipient,
  OrderStatus,
  ProductionArch,
  ProductionEventType,
  QuotationPaymentStatus,
  UserRole,
} from '@prisma/client';
import type { Caller } from '../common/access/caller';
import { businessInstant } from '../common/time/business-day';
import {
  PRODUCTION_ERROR,
  PRODUCTION_WARNING,
  type PlannedTotals,
} from './production.contract';
import {
  archesOf,
  assertCancelWindow,
  assertOwnEvent,
  assertPerformedAtInRange,
  assertStepRange,
  assertTechnicianGates,
  assertWarningsConfirmed,
  canCancel,
  declarationFingerprint,
  declareWindowOf,
  isRangeReleased,
  matchesFingerprint,
  releasedSteps,
  requestedPerformedAt,
  resolvedQuantity,
  rowWarnings,
  type RangeEvent,
  type RowRuleInput,
} from './production.rules';

const { upper, lower } = ProductionArch;
const {
  model_printed: printed,
  aligner_thermoformed: thermoformed,
  aligner_delivered: delivered,
} = ProductionEventType;

const technician: Caller = { userId: 'u-tech', role: UserRole.technician };
const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const superAdmin: Caller = { userId: 'u-super', role: UserRole.super_admin };

const NOW = businessInstant('2026-11-25', '10:00');
const ORDER_CREATED = businessInstant('2026-10-01', '09:00');

const fromPlan = (total: number) => ({
  total,
  source: 'approved_plan' as const,
  provisional: false,
});
const provisional = (total: number) => ({
  total,
  source: 'pack' as const,
  provisional: true,
});
const both: PlannedTotals = { upper: fromPlan(20), lower: fromPlan(20) };

const event = (over: Partial<RangeEvent>): RangeEvent => ({
  type: printed,
  arch: upper,
  stepFrom: 1,
  stepTo: 5,
  cancelledAt: null,
  ...over,
});

function row(over: Partial<RowRuleInput> = {}): RowRuleInput {
  return {
    type: printed,
    arch: upper,
    range: { from: 1, to: 5 },
    quantitySent: null,
    restricted: true,
    treatedArches: [upper, lower],
    planned: both,
    events: [],
    released: [{ from: 1, to: 20 }],
    ...over,
  };
}

/** The AppException a sync call throws (statusCode, errorCode, details). */
function thrown(run: () => unknown): Record<string, unknown> {
  try {
    run();
  } catch (error) {
    return error as Record<string, unknown>;
  }
  throw new Error('expected a throw');
}

describe('production.rules', () => {
  describe('arches, quantity, range', () => {
    it('writes one row per arch, upper first, for "both"', () => {
      expect(archesOf('both')).toEqual([upper, lower]);
      expect(archesOf(lower)).toEqual([lower]);
    });

    it('defaults the quantity to one per step, keeps a sent one', () => {
      expect(resolvedQuantity({ from: 3, to: 7 })).toBe(5);
      expect(resolvedQuantity({ from: 3, to: 7 }, 9)).toBe(9);
    });

    it('400 INVALID_STEP_RANGE when from > to (or below step 1)', () => {
      expect(() => assertStepRange({ from: 4, to: 4 })).not.toThrow();
      expect(thrown(() => assertStepRange({ from: 5, to: 4 }))).toMatchObject({
        statusCode: 400,
        errorCode: PRODUCTION_ERROR.INVALID_STEP_RANGE,
      });
      expect(thrown(() => assertStepRange({ from: 0, to: 4 }))).toMatchObject({
        errorCode: PRODUCTION_ERROR.INVALID_STEP_RANGE,
      });
    });
  });

  describe('performedAt (§3.1.3)', () => {
    it('is the Tunis wall clock sent, or null (server time) when none is', () => {
      expect(requestedPerformedAt(undefined, undefined)).toBeNull();
      expect(requestedPerformedAt('2026-11-25', '09:30')?.toISOString()).toBe(
        '2026-11-25T08:30:00.000Z',
      );
    });

    it('400 INVALID_DATE / INVALID_TIME when only one half is sent', () => {
      expect(
        thrown(() => requestedPerformedAt('2026-11-25', undefined)),
      ).toMatchObject({ errorCode: 'INVALID_TIME' });
      expect(
        thrown(() => requestedPerformedAt(undefined, '09:30')),
      ).toMatchObject({
        errorCode: 'INVALID_DATE',
      });
    });

    const check = (performedAt: Date, restricted = true) =>
      thrown(() =>
        assertPerformedAtInRange({
          performedAt,
          now: NOW,
          orderCreatedAt: ORDER_CREATED,
          restricted,
        }),
      );
    const ok = (performedAt: Date, restricted = true) =>
      expect(() =>
        assertPerformedAtInRange({
          performedAt,
          now: NOW,
          orderCreatedAt: ORDER_CREATED,
          restricted,
        }),
      ).not.toThrow();

    it('allows the clock skew, never later', () => {
      ok(new Date(NOW.getTime() + 2 * 60_000));
      expect(check(new Date(NOW.getTime() + 2 * 60_000 + 1))).toMatchObject({
        statusCode: 400,
        errorCode: PRODUCTION_ERROR.PERFORMED_AT_OUT_OF_RANGE,
      });
    });

    it('lets a technician backdate 7 Tunis days, from 00:00 of the floor day', () => {
      ok(businessInstant('2026-11-18', '00:00'));
      expect(check(businessInstant('2026-11-17', '23:59'))).toMatchObject({
        errorCode: PRODUCTION_ERROR.PERFORMED_AT_OUT_OF_RANGE,
      });
    });

    it('lets an admin go further back, never before the order existed', () => {
      ok(businessInstant('2026-10-02', '08:00'), false);
      expect(check(new Date(ORDER_CREATED.getTime() - 1), false)).toMatchObject(
        {
          errorCode: PRODUCTION_ERROR.PERFORMED_AT_OUT_OF_RANGE,
        },
      );
    });

    it('offers the same window to the date picker', () => {
      expect(
        declareWindowOf({
          now: NOW,
          orderCreatedAt: ORDER_CREATED,
          restricted: true,
        }),
      ).toEqual({ earliestDay: '2026-11-18', latestDay: '2026-11-25' });
      expect(
        declareWindowOf({
          now: NOW,
          orderCreatedAt: ORDER_CREATED,
          restricted: false,
        }),
      ).toEqual({ earliestDay: '2026-10-01', latestDay: '2026-11-25' });
      // A case created 2 days ago: the technician floor is its creation day.
      expect(
        declareWindowOf({
          now: NOW,
          orderCreatedAt: businessInstant('2026-11-23', '18:00'),
          restricted: true,
        }),
      ).toEqual({ earliestDay: '2026-11-23', latestDay: '2026-11-25' });
    });
  });

  describe('released steps (§3.1.5)', () => {
    const batch = (fromStep: number, toStep: number, status: BatchStatus) => ({
      fromStep,
      toStep,
      status,
    });

    it('with batches: the union of the unlocked and delivered ranges only', () => {
      const released = releasedSteps({
        status: OrderStatus.payment_pending,
        quotation: {
          paymentStatus: QuotationPaymentStatus.partially_paid,
          isUnlimitedSteps: false,
          batches: [
            batch(1, 5, BatchStatus.delivered),
            batch(6, 10, BatchStatus.unlocked),
            batch(11, 15, BatchStatus.locked),
          ],
        },
      });
      expect(released).toEqual([{ from: 1, to: 10 }]);
      expect(isRangeReleased({ from: 4, to: 10 }, released)).toBe(true);
      expect(isRangeReleased({ from: 9, to: 11 }, released)).toBe(false);
      // A step outside every batch is not released.
      expect(isRangeReleased({ from: 30, to: 30 }, released)).toBe(false);
    });

    it('without batches: everything once paid or in a production status, nothing before', () => {
      const all = releasedSteps({
        status: OrderStatus.payment_pending,
        quotation: {
          paymentStatus: QuotationPaymentStatus.paid,
          isUnlimitedSteps: false,
          batches: [],
        },
      });
      expect(isRangeReleased({ from: 1, to: 200 }, all)).toBe(true);
      expect(
        isRangeReleased(
          { from: 1, to: 3 },
          releasedSteps({ status: OrderStatus.fabrication, quotation: null }),
        ),
      ).toBe(true);
      expect(
        releasedSteps({
          status: OrderStatus.payment_pending,
          quotation: {
            paymentStatus: QuotationPaymentStatus.pending,
            isUnlimitedSteps: false,
            batches: [],
          },
        }),
      ).toEqual([]);
    });

    it('unlimited-step pack: its placeholder batches release every step once one is paid (CONC-01)', () => {
      const unlimited = (status: OrderStatus, ...batches: BatchStatus[]) =>
        releasedSteps({
          status,
          quotation: {
            paymentStatus: QuotationPaymentStatus.partially_paid,
            isUnlimitedSteps: true,
            // The plan editor's one-step placeholders: [1,1], [2,2], …
            batches: batches.map((state, index) =>
              batch(index + 1, index + 1, state),
            ),
          },
        });
      const paidOne = unlimited(
        OrderStatus.payment_pending,
        BatchStatus.unlocked,
        BatchStatus.locked,
      );
      expect(isRangeReleased({ from: 1, to: 30 }, paidOne)).toBe(true);
      expect(
        isRangeReleased(
          { from: 2, to: 10 },
          unlimited(OrderStatus.payment_pending, BatchStatus.delivered),
        ),
      ).toBe(true);
      // Nothing paid yet: nothing released, unless the case is in production.
      expect(
        unlimited(OrderStatus.payment_pending, BatchStatus.locked),
      ).toEqual([]);
      expect(
        isRangeReleased(
          { from: 1, to: 30 },
          unlimited(OrderStatus.fabrication, BatchStatus.locked),
        ),
      ).toBe(true);
    });
  });

  describe('technician hard gates (§3.1.4)', () => {
    it('400 STEP_BEYOND_PLANNED_TOTAL above the APPROVED plan total only', () => {
      expect(
        thrown(() =>
          assertTechnicianGates(row({ range: { from: 18, to: 21 } })),
        ),
      ).toMatchObject({
        statusCode: 400,
        errorCode: PRODUCTION_ERROR.STEP_BEYOND_PLANNED_TOTAL,
      });
      // A provisional total is only a warning.
      expect(() =>
        assertTechnicianGates(
          row({
            range: { from: 18, to: 21 },
            planned: { upper: provisional(20), lower: null },
          }),
        ),
      ).not.toThrow();
    });

    it('409 STEPS_NOT_RELEASED on a delivery of locked steps, with a neutral message', () => {
      const error = thrown(() =>
        assertTechnicianGates(
          row({
            type: delivered,
            range: { from: 18, to: 20 },
            released: [{ from: 1, to: 10 }],
          }),
        ),
      );
      expect(error).toMatchObject({
        statusCode: 409,
        errorCode: PRODUCTION_ERROR.STEPS_NOT_RELEASED,
      });
      expect(String(error.message)).not.toMatch(/pa(y|ie)|amount|montant|TND/i);
    });

    it('never gates an admin', () => {
      expect(() =>
        assertTechnicianGates(
          row({
            restricted: false,
            type: delivered,
            range: { from: 18, to: 25 },
            released: [],
          }),
        ),
      ).not.toThrow();
    });
  });

  describe('warnings (§3.1.5)', () => {
    it('previous_stage_missing: steps the previous act does not cover on this arch', () => {
      expect(
        rowWarnings(
          row({
            type: thermoformed,
            range: { from: 1, to: 6 },
            events: [event({ stepFrom: 1, stepTo: 5 })],
          }),
        ),
      ).toEqual([PRODUCTION_WARNING.previous_stage_missing]);
      // Printing has no previous act; the other arch does not count.
      expect(rowWarnings(row())).toEqual([]);
      expect(
        rowWarnings(
          row({
            type: thermoformed,
            events: [event({ arch: lower, stepFrom: 1, stepTo: 5 })],
          }),
        ),
      ).toEqual([PRODUCTION_WARNING.previous_stage_missing]);
    });

    it('already_declared: overlap with a LIVE event of the same act and arch', () => {
      expect(
        rowWarnings(row({ events: [event({ stepFrom: 5, stepTo: 9 })] })),
      ).toEqual([PRODUCTION_WARNING.already_declared]);
      expect(
        rowWarnings(row({ events: [event({ cancelledAt: new Date() })] })),
      ).toEqual([]);
    });

    it('quantity_differs only when a quantity was SENT and differs', () => {
      expect(rowWarnings(row({ quantitySent: 5 }))).toEqual([]);
      expect(rowWarnings(row({ quantitySent: 7 }))).toEqual([
        PRODUCTION_WARNING.quantity_differs,
      ]);
    });

    it('beyond_planned_total: provisional for anyone, approved for an admin', () => {
      const range = { from: 18, to: 22 };
      expect(
        rowWarnings(
          row({ range, planned: { upper: provisional(20), lower: null } }),
        ),
      ).toContain(PRODUCTION_WARNING.beyond_planned_total);
      expect(rowWarnings(row({ range, restricted: false }))).toContain(
        PRODUCTION_WARNING.beyond_planned_total,
      );
      // Unknown total: nothing to compare with.
      expect(
        rowWarnings(
          row({
            range,
            planned: {
              upper: { total: null, source: null, provisional: true },
              lower: null,
            },
          }),
        ),
      ).not.toContain(PRODUCTION_WARNING.beyond_planned_total);
    });

    it('arch_not_treated', () => {
      expect(
        rowWarnings(
          row({
            arch: lower,
            treatedArches: [upper],
            planned: { upper: fromPlan(20), lower: null },
          }),
        ),
      ).toEqual([PRODUCTION_WARNING.arch_not_treated]);
    });

    it('steps_not_released: any non-delivery act, and an ADMIN delivery', () => {
      const locked = {
        range: { from: 15, to: 18 },
        released: [{ from: 1, to: 10 }],
      };
      expect(rowWarnings(row(locked))).toEqual([
        PRODUCTION_WARNING.steps_not_released,
      ]);
      expect(
        rowWarnings(
          row({
            ...locked,
            restricted: false,
            type: delivered,
            events: [
              event({
                type: ProductionEventType.aligner_cut,
                stepFrom: 15,
                stepTo: 18,
              }),
            ],
          }),
        ),
      ).toEqual([PRODUCTION_WARNING.steps_not_released]);
      // The technician's delivery is the 409 gate instead, never a warning.
      expect(
        rowWarnings(
          row({
            ...locked,
            type: delivered,
            events: [
              event({
                type: ProductionEventType.aligner_cut,
                stepFrom: 15,
                stepTo: 18,
              }),
            ],
          }),
        ),
      ).toEqual([]);
    });

    it('returns the codes in PRODUCTION_WARNING order', () => {
      expect(
        rowWarnings(
          row({
            arch: lower,
            type: thermoformed,
            range: { from: 1, to: 30 },
            quantitySent: 3,
            restricted: false,
            treatedArches: [upper],
            planned: { upper: fromPlan(20), lower: provisional(20) },
            events: [event({ type: thermoformed, arch: lower })],
            released: [],
          }),
        ),
      ).toEqual(Object.values(PRODUCTION_WARNING));
    });
  });

  describe('confirmation (§3.1.6)', () => {
    const warnings = [
      PRODUCTION_WARNING.already_declared,
      PRODUCTION_WARNING.previous_stage_missing,
    ];

    it('409 PRODUCTION_CONFIRM_REQUIRED with the union, in canonical order', () => {
      expect(
        thrown(() =>
          assertWarningsConfirmed({
            warnings,
            confirmed: [PRODUCTION_WARNING.already_declared],
            note: 'x',
          }),
        ),
      ).toMatchObject({
        statusCode: 409,
        errorCode: PRODUCTION_ERROR.PRODUCTION_CONFIRM_REQUIRED,
        details: {
          warnings: [
            PRODUCTION_WARNING.previous_stage_missing,
            PRODUCTION_WARNING.already_declared,
          ],
        },
      });
    });

    it('400 NOTE_REQUIRED once confirmed without a note; nothing without warnings', () => {
      expect(
        thrown(() =>
          assertWarningsConfirmed({
            warnings,
            confirmed: warnings,
            note: null,
          }),
        ),
      ).toMatchObject({
        statusCode: 400,
        errorCode: PRODUCTION_ERROR.NOTE_REQUIRED,
      });
      expect(() =>
        assertWarningsConfirmed({
          warnings,
          confirmed: warnings,
          note: 'reprint',
        }),
      ).not.toThrow();
      expect(() =>
        assertWarningsConfirmed({ warnings: [], confirmed: [], note: null }),
      ).not.toThrow();
    });
  });

  describe('declaration fingerprint (§3.2)', () => {
    const stored = (over: Record<string, unknown> = {}) => ({
      orderId: 'o1',
      type: delivered,
      arch: upper,
      stepFrom: 1,
      stepTo: 5,
      quantity: 5,
      deliveredTo: DeliveryRecipient.courier,
      deliveredToName: 'Aramex',
      performedAt: businessInstant('2026-11-25', '09:30'),
      ...over,
    });
    const request = (
      over: Partial<Parameters<typeof declarationFingerprint>[0]> = {},
    ) =>
      declarationFingerprint({
        orderId: 'o1',
        type: delivered,
        arches: [upper, lower],
        range: { from: 1, to: 5 },
        deliveredTo: DeliveryRecipient.courier,
        deliveredToName: '  Aramex ',
        performedAt: null,
        ...over,
      });
    const pair = [stored(), stored({ arch: lower })];

    it('matches the same declaration (both arches, default quantity, trimmed name)', () => {
      expect(matchesFingerprint(request(), pair)).toBe(true);
      expect(matchesFingerprint(request({ quantity: 5 }), pair)).toBe(true);
    });

    it('never matches another order, other steps, quantity, recipient, or upper against both', () => {
      expect(matchesFingerprint(request({ orderId: 'o2' }), pair)).toBe(false);
      expect(
        matchesFingerprint(request({ range: { from: 1, to: 6 } }), pair),
      ).toBe(false);
      expect(matchesFingerprint(request({ quantity: 4 }), pair)).toBe(false);
      expect(
        matchesFingerprint(
          request({ deliveredTo: DeliveryRecipient.patient }),
          pair,
        ),
      ).toBe(false);
      expect(matchesFingerprint(request({ arches: [upper] }), pair)).toBe(
        false,
      );
      expect(matchesFingerprint(request(), [pair[0]])).toBe(false);
    });

    it('compares performedAt only when the request named it', () => {
      const at = businessInstant('2026-11-25', '09:30');
      expect(matchesFingerprint(request({ performedAt: at }), pair)).toBe(true);
      expect(
        matchesFingerprint(
          request({ performedAt: businessInstant('2026-11-25', '09:31') }),
          pair,
        ),
      ).toBe(false);
    });

    it('stores no recipient on a non-delivery', () => {
      const fp = declarationFingerprint({
        orderId: 'o1',
        type: printed,
        arches: [upper],
        range: { from: 1, to: 2 },
        deliveredTo: DeliveryRecipient.courier,
        deliveredToName: 'x',
        performedAt: null,
      });
      expect(fp).toMatchObject({ deliveredTo: null, deliveredToName: null });
    });
  });

  describe('cancel (§3.3)', () => {
    const own = {
      createdById: technician.userId,
      createdAt: new Date(NOW.getTime() - 23 * 3_600_000),
      cancelledAt: null,
    };
    const old = { ...own, createdAt: new Date(NOW.getTime() - 24 * 3_600_000) };
    const someoneElse = { ...own, createdById: 'u-other' };

    it('canCancel: a technician her own rows under 24 h from createdAt', () => {
      expect(canCancel(own, technician, NOW)).toBe(true);
      expect(canCancel(old, technician, NOW)).toBe(false);
      expect(canCancel(someoneElse, technician, NOW)).toBe(false);
    });

    it('canCancel: an admin any live row, nobody a cancelled one', () => {
      expect(canCancel(old, admin, NOW)).toBe(true);
      expect(
        canCancel({ ...someoneElse, createdById: null }, superAdmin, NOW),
      ).toBe(true);
      expect(canCancel({ ...own, cancelledAt: NOW }, admin, NOW)).toBe(false);
    });

    it('403 CANCEL_NOT_OWN_EVENT then 403 CANCEL_WINDOW_PASSED for the technician', () => {
      expect(
        thrown(() => assertOwnEvent(someoneElse, technician)),
      ).toMatchObject({
        statusCode: 403,
        errorCode: PRODUCTION_ERROR.CANCEL_NOT_OWN_EVENT,
      });
      expect(
        thrown(() => assertCancelWindow(old, technician, NOW)),
      ).toMatchObject({
        statusCode: 403,
        errorCode: PRODUCTION_ERROR.CANCEL_WINDOW_PASSED,
      });
      expect(() => assertOwnEvent(someoneElse, admin)).not.toThrow();
      expect(() => assertCancelWindow(old, admin, NOW)).not.toThrow();
    });
  });
});
