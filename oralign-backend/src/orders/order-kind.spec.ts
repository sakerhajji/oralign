import { OrderStatus, OrderType, ToothInstructionType } from '@prisma/client';
import {
  assertInitialOrder,
  assertTreatmentFeeApplies,
  isPlannerToothScope,
  openChildrenOf,
  ORDER_KIND_ERROR,
} from './order-kind';

/** The error a guard throws, or undefined when it lets the call through. */
function thrownBy(guard: () => void): unknown {
  try {
    guard();
    return undefined;
  } catch (error) {
    return error;
  }
}

const CHILD_TYPES = [
  OrderType.additional_aligners,
  OrderType.replacement,
  OrderType.transfer_template,
  OrderType.warranty,
];

describe('order kind guards', () => {
  it('let an initial case through', () => {
    const initial = { orderType: OrderType.initial };
    expect(thrownBy(() => assertInitialOrder(initial))).toBeUndefined();
    expect(thrownBy(() => assertTreatmentFeeApplies(initial))).toBeUndefined();
  });

  it.each(CHILD_TYPES)(
    'send a %s request to its dedicated flow (409)',
    (orderType) => {
      expect(thrownBy(() => assertInitialOrder({ orderType }))).toMatchObject({
        statusCode: 409,
        errorCode: ORDER_KIND_ERROR.DEDICATED_FLOW,
      });
    },
  );

  it.each(CHILD_TYPES)(
    'owe no treatment fee on a %s request (400)',
    (orderType) => {
      expect(
        thrownBy(() => assertTreatmentFeeApplies({ orderType })),
      ).toMatchObject({
        statusCode: 400,
        errorCode: ORDER_KIND_ERROR.TREATMENT_FEE_INITIAL_ONLY,
      });
    },
  );
});

describe('isPlannerToothScope', () => {
  it('accepts the plan editor scope: attachments only', () => {
    expect(isPlannerToothScope([ToothInstructionType.attachment])).toBe(true);
  });

  it.each([
    ['no scope (replace everything)', undefined],
    ['an empty scope', []],
    ['a doctor prescription type', [ToothInstructionType.do_not_move]],
    [
      'attachments mixed with a doctor type',
      [ToothInstructionType.attachment, ToothInstructionType.no_ipr],
    ],
  ])('refuses %s', (_label, scope) => {
    expect(isPlannerToothScope(scope)).toBe(false);
  });
});

describe('openChildrenOf', () => {
  it('is the live, not closed children of the case (a draft counts)', () => {
    expect(openChildrenOf('case-1')).toEqual({
      parentOrderId: 'case-1',
      deletedAt: null,
      status: {
        notIn: [
          OrderStatus.finished,
          OrderStatus.canceled,
          OrderStatus.cancelled,
          OrderStatus.rejected,
        ],
      },
    });
  });
});
