import {
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentRecordStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import {
  mapOrderToDto,
  mapTreatmentFeeTransfer,
  type OrderWithRelations,
} from './order.mapper';

const PROOF = '/uploads/orders/o-1/payment-proofs/r.jpg';
const declaredAt = new Date('2026-11-27T09:30:00.000Z');
const rejectedAt = new Date('2026-11-27T11:00:00.000Z');

/** The columns mapOrderToDto reads, a fee transfer refused by the admin. */
function order(over: Record<string, unknown> = {}): OrderWithRelations {
  return {
    id: 'o-1',
    orderCode: 'ORD-1',
    doctorId: 'u-doc',
    patientId: 'pt-1',
    assignedDesignerId: 'u-des',
    status: OrderStatus.treatment_planning,
    orderType: OrderType.initial,
    parentOrderId: null,
    treatBothArch: true,
    useCbctWithScans: false,
    wantsManufacturing: true,
    materials: [],
    toothInstructions: [],
    files: [],
    doctor: null,
    patient: { id: 'pt-1', fullName: 'Ines' },
    createdAt: declaredAt,
    updatedAt: declaredAt,
    treatmentFeePaymentMethod: PaymentMethod.bank_transfer,
    treatmentFeePaymentStatus: PaymentRecordStatus.rejected,
    treatmentFeeAmount: new Prisma.Decimal('351.000'),
    treatmentFeeProofPath: PROOF,
    treatmentFeeDeclaredAt: declaredAt,
    treatmentFeeReviewOpenedAt: declaredAt,
    treatmentFeeRejectedAt: rejectedAt,
    treatmentFeeRejectionReason: 'Reçu illisible',
    treatmentFeeWithholdingThreshold: new Prisma.Decimal('1000.000'),
    welcomeGiftAppliedAt: null,
    treatmentPlans: [],
    ...over,
  } as unknown as OrderWithRelations;
}

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const doctor: Caller = { userId: 'u-doc', role: UserRole.dentist };
const otherDoctor: Caller = { userId: 'u-other', role: UserRole.dentist };
const designer: Caller = { userId: 'u-des', role: UserRole.designer };

describe('mapOrderToDto: the fee receipt path, owner and admins only', () => {
  it.each([admin, doctor])('%p keeps the stored path', (viewer) => {
    expect(mapOrderToDto(order(), viewer).treatmentFeeProofPath).toBe(PROOF);
  });

  it.each([designer, otherDoctor, null, undefined])(
    '%p reads hasProof only (the lab ZIP passes no viewer)',
    (viewer) => {
      const dto = mapOrderToDto(order(), viewer);
      expect(dto.treatmentFeeProofPath).toBeUndefined();
      expect(dto.treatmentFeeHasProof).toBe(true);
      expect(JSON.stringify(dto)).not.toContain('payment-proofs');
    },
  );

  it('carries the declaration, its review and its refusal', () => {
    expect(mapOrderToDto(order(), doctor)).toMatchObject({
      treatmentFeeHasProof: true,
      treatmentFeeDeclaredAt: declaredAt,
      treatmentFeeReviewOpenedAt: declaredAt,
      treatmentFeeRejectedAt: rejectedAt,
      treatmentFeeRejectionReason: 'Reçu illisible',
      treatmentFeeWithholdingThreshold: 1000,
    });
  });
});

describe('mapTreatmentFeeTransfer', () => {
  it('nothing declared: no receipt, nulls', () => {
    expect(
      mapTreatmentFeeTransfer({
        treatmentFeePaidAt: null,
        treatmentFeePaymentStatus: null,
        treatmentFeeProofPath: null,
        treatmentFeeDeclaredAt: null,
        treatmentFeeReviewOpenedAt: null,
        treatmentFeeRejectedAt: null,
        treatmentFeeRejectionReason: null,
        treatmentFeeWithholdingThreshold: null,
      }),
    ).toEqual({
      treatmentFeeHasProof: false,
      treatmentFeeDeclaredAt: null,
      treatmentFeeReviewOpenedAt: null,
      treatmentFeeRejectedAt: null,
      treatmentFeeRejectionReason: null,
      treatmentFeeWithholdingThreshold: null,
    });
  });

  const refused = {
    treatmentFeePaidAt: null,
    treatmentFeePaymentStatus: PaymentRecordStatus.rejected,
    treatmentFeeProofPath: PROOF,
    treatmentFeeDeclaredAt: declaredAt,
    treatmentFeeReviewOpenedAt: null,
    treatmentFeeRejectedAt: rejectedAt,
    treatmentFeeRejectionReason: 'Reçu illisible',
    treatmentFeeWithholdingThreshold: new Prisma.Decimal('0'),
  };

  it('a refusal is shown while the fee stands refused', () => {
    expect(mapTreatmentFeeTransfer(refused)).toMatchObject({
      treatmentFeeRejectedAt: rejectedAt,
      treatmentFeeRejectionReason: 'Reçu illisible',
      treatmentFeeWithholdingThreshold: 0,
    });
  });

  it.each([
    ['without its stamp', { treatmentFeeRejectedAt: null }],
    [
      'once paid since (card)',
      {
        treatmentFeePaidAt: rejectedAt,
        treatmentFeePaymentStatus: PaymentRecordStatus.success,
      },
    ],
    [
      'once declared again',
      { treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation },
    ],
  ])('a stale refusal is never shown (%s)', (_label, over) => {
    expect(mapTreatmentFeeTransfer({ ...refused, ...over })).toMatchObject({
      treatmentFeeRejectedAt: null,
      treatmentFeeRejectionReason: null,
    });
  });
});
