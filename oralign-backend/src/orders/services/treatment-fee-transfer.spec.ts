import { PaymentMethod, PaymentRecordStatus, Prisma } from '@prisma/client';
import {
  currentFeeRefusal,
  declaredFeeAuditMetadata,
  isAwaitingFee,
  LOCKED_FEE_SELECT,
  newDeclarationData,
  SETTLED_IN_PERSON_FEE_DATA,
  WITHDRAWN_FEE_DATA,
} from './treatment-fee-transfer';

const d = (value: string) => new Prisma.Decimal(value);
const at = new Date('2026-11-27T09:30:00.000Z');

describe('newDeclarationData (a new fee declaration)', () => {
  it('names the declaration by its instant and clears the review and any refusal', () => {
    expect(newDeclarationData(at, 'fee-key-0001')).toEqual({
      treatmentFeeDeclaredAt: at,
      treatmentFeeReviewOpenedAt: null,
      treatmentFeeRejectedAt: null,
      treatmentFeeRejectedById: null,
      treatmentFeeRejectedByName: null,
      treatmentFeeRejectionReason: null,
      treatmentFeeDeclarationKey: 'fee-key-0001',
    });
  });

  it('an admin declaration without a key clears the previous key', () => {
    expect(newDeclarationData(at, null).treatmentFeeDeclarationKey).toBeNull();
  });
});

describe('WITHDRAWN_FEE_DATA (the fee payable again)', () => {
  it('clears the method, status, amounts, receipt pointer, review and refusal', () => {
    for (const value of Object.values(WITHDRAWN_FEE_DATA)) {
      expect(value).toBeNull();
    }
    expect(Object.keys(WITHDRAWN_FEE_DATA)).toEqual(
      expect.arrayContaining([
        'treatmentFeePaymentMethod',
        'treatmentFeePaymentStatus',
        'treatmentFeeProofPath',
        'treatmentFeeAmount',
        'treatmentFeeStampAmount',
        'treatmentFeeDeclaredAt',
        'treatmentFeeReviewOpenedAt',
        'treatmentFeeRejectionReason',
      ]),
    );
  });

  it('never touches the paid date or the declaration key', () => {
    expect(WITHDRAWN_FEE_DATA).not.toHaveProperty('treatmentFeePaidAt');
    expect(WITHDRAWN_FEE_DATA).not.toHaveProperty('treatmentFeeDeclarationKey');
  });
});

describe('declaredFeeAuditMetadata (never a path)', () => {
  it('the fee due, the cash, the stamp and the retenue as declared', () => {
    // 350 due + 1 stamp - 3.500 retenue (1 %) = 347.500 cash.
    const metadata = declaredFeeAuditMetadata(
      {
        treatmentFeePaymentMethod: PaymentMethod.bank_transfer,
        treatmentFeeAmount: d('347.500'),
        treatmentFeeWithholdingRate: d('1.00'),
        treatmentFeeWithholdingAmount: d('3.500'),
        treatmentFeeStampAmount: d('1.000'),
        treatmentFeeProofPath: '/uploads/orders/o-1/payment-proofs/r.jpg',
      },
      { declaredAt: at, reason: 'Montant différent' },
    );
    expect(metadata).toEqual({
      method: 'bank_transfer',
      amount: 350,
      cashAmount: 347.5,
      stampAmount: 1,
      withholdingRate: 1,
      withholdingAmount: 3.5,
      hasProof: true,
      declaredAt: at.toISOString(),
      reason: 'Montant différent',
    });
    expect(JSON.stringify(metadata)).not.toMatch(/uploads|path/i);
  });

  it('a legacy declaration without stamp or method still reads as a transfer of its cash', () => {
    expect(
      declaredFeeAuditMetadata(
        { treatmentFeePaymentMethod: null, treatmentFeeAmount: d('350') },
        { overrideNote: 'Relevé vu' },
      ),
    ).toEqual({
      method: 'bank_transfer',
      amount: 350,
      hasProof: false,
      overrideNote: 'Relevé vu',
    });
  });
});

describe('isAwaitingFee', () => {
  it.each([
    [null, PaymentRecordStatus.awaiting_confirmation, true],
    [null, PaymentRecordStatus.rejected, false],
    [null, PaymentRecordStatus.success, false],
    [null, null, false],
    [at, PaymentRecordStatus.awaiting_confirmation, false],
  ])('paidAt %p, status %p → %p', (paidAt, status, expected) => {
    expect(
      isAwaitingFee({
        treatmentFeePaidAt: paidAt,
        treatmentFeePaymentStatus: status,
      }),
    ).toBe(expected);
  });

  it('the locked read covers what the guards compare', () => {
    expect(Object.keys(LOCKED_FEE_SELECT).sort()).toEqual(
      [
        'treatmentFeeDeclarationKey',
        'treatmentFeeDeclaredAt',
        'treatmentFeePaidAt',
        'treatmentFeePaymentStatus',
        'treatmentFeeProofPath',
        'treatmentFeeReviewOpenedAt',
      ].sort(),
    );
  });
});

describe('SETTLED_IN_PERSON_FEE_DATA (cash / cheque after a refused transfer)', () => {
  it('clears the declaration, its review, its refusal and the receipt pointer', () => {
    expect(SETTLED_IN_PERSON_FEE_DATA).toEqual({
      treatmentFeeProofPath: null,
      treatmentFeeDeclaredAt: null,
      treatmentFeeReviewOpenedAt: null,
      treatmentFeeRejectedAt: null,
      treatmentFeeRejectedById: null,
      treatmentFeeRejectedByName: null,
      treatmentFeeRejectionReason: null,
    });
  });
});

describe('currentFeeRefusal', () => {
  const refused = {
    treatmentFeePaidAt: null,
    treatmentFeePaymentStatus: PaymentRecordStatus.rejected,
    treatmentFeeRejectedAt: at,
    treatmentFeeRejectionReason: 'Reçu illisible',
  };

  it('shows the refusal while the fee stands refused', () => {
    expect(currentFeeRefusal(refused)).toEqual({
      rejectedAt: at,
      rejectionReason: 'Reçu illisible',
    });
  });

  it.each([
    { treatmentFeePaidAt: at },
    { treatmentFeePaymentStatus: PaymentRecordStatus.success },
    { treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation },
    { treatmentFeeRejectedAt: null },
  ])('a stale refusal reads as none (%p)', (over) => {
    expect(currentFeeRefusal({ ...refused, ...over })).toEqual({
      rejectedAt: null,
      rejectionReason: null,
    });
  });
});
