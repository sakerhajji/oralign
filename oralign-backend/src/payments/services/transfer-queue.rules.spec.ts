import {
  PaymentMethod,
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
} from '@prisma/client';
import {
  compareQueueItems,
  installmentQueueRow,
  type InstallmentQueueSource,
  installmentQueueWhere,
  mergeQueuePage,
  NO_UNREAD_SUBJECTS,
  type QueueRunItem,
  queuePaging,
  recentSince,
  splitSubjectKeys,
  treatmentFeeQueueRow,
  type TreatmentFeeQueueSource,
  treatmentFeeQueueWhere,
  treatmentFeeRowSubjectKey,
} from './transfer-queue.rules';

const NOW = new Date('2026-11-27T12:00:00.000Z');
const SINCE = recentSince(NOW);
const DECLARED = new Date('2026-11-26T08:00:00.000Z');
const FEE_KEY = `treatment_fee:order-2:${DECLARED.getTime()}`;
const unread = splitSubjectKeys(['installment:pay-1', FEE_KEY]);
const ctx = { since: SINCE, unread };

describe('recentSince / queuePaging', () => {
  it('opens the Validé / Refusé window 30 days back', () => {
    expect(SINCE.toISOString()).toBe('2026-10-28T12:00:00.000Z');
  });

  it('clamps the page and the limit, À vérifier by default', () => {
    expect(queuePaging({})).toEqual({
      filter: 'a_verifier',
      page: 1,
      limit: 25,
      skip: 0,
    });
    expect(queuePaging({ filter: 'refuse', page: 3, limit: 500 })).toEqual({
      filter: 'refuse',
      page: 3,
      limit: 100,
      skip: 200,
    });
    expect(queuePaging({ page: 0, limit: 0 })).toMatchObject({
      page: 1,
      limit: 1,
    });
  });
});

describe('splitSubjectKeys', () => {
  it('decodes my subjects by kind, once each, dropping malformed keys', () => {
    const split = splitSubjectKeys([
      'installment:pay-1',
      'installment:pay-1',
      FEE_KEY,
      'garbage',
    ]);
    expect([...split.keys]).toEqual(['installment:pay-1', FEE_KEY]);
    expect(split.paymentIds).toEqual(['pay-1']);
    expect(split.fees).toEqual([{ orderId: 'order-2', declaredAt: DECLARED }]);
  });
});

describe('installmentQueueWhere', () => {
  const base = {
    paymentMethod: PaymentMethod.bank_transfer,
    purpose: PaymentPurpose.installment,
    order: { deletedAt: null },
  };

  it('Nouveau = still awaiting AND my row unread', () => {
    expect(installmentQueueWhere('nouveau', ctx)).toEqual({
      ...base,
      status: PaymentRecordStatus.awaiting_confirmation,
      id: { in: ['pay-1'] },
    });
  });

  it('Nouveau matches nothing (no query) when nothing is unread', () => {
    expect(
      installmentQueueWhere('nouveau', {
        since: SINCE,
        unread: NO_UNREAD_SUBJECTS,
      }),
    ).toBeNull();
  });

  it('À vérifier = every awaiting transfer of live orders', () => {
    expect(installmentQueueWhere('a_verifier', ctx)).toEqual({
      ...base,
      status: PaymentRecordStatus.awaiting_confirmation,
    });
  });

  it('Validé / Refusé = processed in the window', () => {
    expect(installmentQueueWhere('valide', ctx)).toEqual({
      ...base,
      status: PaymentRecordStatus.success,
      paidAt: { gte: SINCE },
    });
    expect(installmentQueueWhere('refuse', ctx)).toEqual({
      ...base,
      status: PaymentRecordStatus.rejected,
      rejectedAt: { gte: SINCE },
    });
  });
});

describe('treatmentFeeQueueWhere', () => {
  const base = {
    deletedAt: null,
    treatmentFeePaymentMethod: PaymentMethod.bank_transfer,
  };

  it('Nouveau names each declaration by its order AND declaredAt', () => {
    expect(treatmentFeeQueueWhere('nouveau', ctx)).toEqual({
      ...base,
      treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
      OR: [{ id: 'order-2', treatmentFeeDeclaredAt: DECLARED }],
    });
    expect(
      treatmentFeeQueueWhere('nouveau', {
        since: SINCE,
        unread: NO_UNREAD_SUBJECTS,
      }),
    ).toBeNull();
  });

  it('the other tabs mirror the installment rules on the fee columns', () => {
    expect(treatmentFeeQueueWhere('a_verifier', ctx)).toEqual({
      ...base,
      treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
    });
    expect(treatmentFeeQueueWhere('valide', ctx)).toEqual({
      ...base,
      treatmentFeePaymentStatus: PaymentRecordStatus.success,
      treatmentFeePaidAt: { gte: SINCE },
    });
    expect(treatmentFeeQueueWhere('refuse', ctx)).toEqual({
      ...base,
      treatmentFeePaymentStatus: PaymentRecordStatus.rejected,
      treatmentFeeRejectedAt: { gte: SINCE },
    });
  });
});

describe('mergeQueuePage', () => {
  const item = (
    kind: QueueRunItem['kind'],
    id: string,
    iso: string | null,
  ): QueueRunItem => ({ kind, id, declaredAt: iso ? new Date(iso) : null });

  const installments = [
    item('installment', 'p-3', '2026-11-27T10:00:00Z'),
    item('installment', 'p-2', '2026-11-25T10:00:00Z'),
    item('installment', 'p-1', null),
  ];
  const fees = [
    item('treatment_fee', 'o-2', '2026-11-26T10:00:00Z'),
    item('treatment_fee', 'o-1', '2026-11-25T10:00:00Z'),
  ];

  it('merges newest declaration first, undated last, installments first on a tie', () => {
    expect(mergeQueuePage(installments, fees, 0, 10).map((x) => x.id)).toEqual([
      'p-3',
      'o-2',
      'p-2',
      'o-1',
      'p-1',
    ]);
  });

  it('cuts the page out of the merged window', () => {
    expect(mergeQueuePage(installments, fees, 2, 2).map((x) => x.id)).toEqual([
      'p-2',
      'o-1',
    ]);
  });

  it('orders the same instant of one kind by id desc (the run order)', () => {
    const a = item('installment', 'aaa', '2026-11-27T10:00:00Z');
    const b = item('installment', 'bbb', '2026-11-27T10:00:00Z');
    expect([a, b].sort(compareQueueItems).map((x) => x.id)).toEqual([
      'bbb',
      'aaa',
    ]);
  });
});

const decimal = (value: string) => new Prisma.Decimal(value);

const installment = (
  over: Partial<InstallmentQueueSource> = {},
): InstallmentQueueSource => ({
  id: 'pay-1',
  orderId: 'order-1',
  quotationId: 'q-1',
  amount: decimal('983.000'),
  withholdingAmount: decimal('10.000'),
  withholdingRate: decimal('1.00'),
  stampAmount: decimal('1.000'),
  currency: 'TND',
  status: PaymentRecordStatus.awaiting_confirmation,
  proofUrl: '/uploads/orders/order-1/payment-proofs/x.pdf',
  declaredAt: DECLARED,
  reviewOpenedAt: null,
  paidAt: null,
  confirmedAt: null,
  rejectedAt: null,
  rejectionReason: null,
  installment: { installmentNumber: 2 },
  order: {
    orderCode: 'ORD-1',
    doctor: { id: 'u-doc', fullName: 'Amine' },
    patient: { id: 'pat-1', fullName: 'Sarah' },
  },
  ...over,
});

describe('installmentQueueRow', () => {
  it('splits the money and never exposes the receipt path', () => {
    const row = installmentQueueRow(installment(), unread.keys);
    expect(row).toMatchObject({
      kind: 'installment',
      subjectKey: 'installment:pay-1',
      paymentId: 'pay-1',
      orderId: 'order-1',
      orderCode: 'ORD-1',
      installmentNumber: 2,
      amounts: {
        due: 992,
        stamp: 1,
        withholdingRate: 1,
        withholding: 10,
        cash: 983,
        currency: 'TND',
      },
      state: 'receipt_sent',
      hasProof: true,
      declaredAt: DECLARED.toISOString(),
      processedAt: null,
      seenByMe: false,
    });
    expect(JSON.stringify(row)).not.toMatch(/uploads|proofUrl|payment-proofs/);
  });

  it('reads À vérifier once opened, Consulté once my row is read', () => {
    const row = installmentQueueRow(
      installment({ reviewOpenedAt: NOW }),
      new Set(),
    );
    expect(row.state).toBe('to_verify');
    expect(row.reviewOpenedAt).toBe(NOW.toISOString());
    expect(row.seenByMe).toBe(true);
  });

  it('dates a refusal and carries its reason; no rate without a retenue', () => {
    const row = installmentQueueRow(
      installment({
        status: PaymentRecordStatus.rejected,
        rejectedAt: NOW,
        rejectionReason: 'Illisible',
        withholdingAmount: decimal('0'),
        withholdingRate: decimal('1.00'),
        proofUrl: null,
      }),
      new Set(),
    );
    expect(row).toMatchObject({
      state: 'refused',
      processedAt: NOW.toISOString(),
      rejectionReason: 'Illisible',
      hasProof: false,
    });
    expect(row.amounts.withholdingRate).toBeNull();
  });

  it('dates a validation by its paid instant', () => {
    const row = installmentQueueRow(
      installment({ status: PaymentRecordStatus.success, paidAt: NOW }),
      new Set(),
    );
    expect(row.state).toBe('paid');
    expect(row.processedAt).toBe(NOW.toISOString());
    expect(row.rejectionReason).toBeNull();
  });
});

const feeOrder = (
  over: Partial<TreatmentFeeQueueSource> = {},
): TreatmentFeeQueueSource => ({
  id: 'order-2',
  orderCode: 'ORD-2',
  updatedAt: NOW,
  treatmentFeeAmount: decimal('301.000'),
  treatmentFeeWithholdingAmount: null,
  treatmentFeeWithholdingRate: null,
  treatmentFeeStampAmount: decimal('1.000'),
  treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
  treatmentFeeProofPath: '/uploads/treatment-fee-proofs/x.jpg',
  treatmentFeePaidAt: null,
  treatmentFeeDeclaredAt: DECLARED,
  treatmentFeeReviewOpenedAt: null,
  treatmentFeeRejectedAt: null,
  treatmentFeeRejectionReason: null,
  doctor: { id: 'u-doc', fullName: 'Amine' },
  patient: { id: 'pat-2', fullName: 'Lina' },
  ...over,
});

describe('treatmentFeeQueueRow', () => {
  it('reads a fee declaration as a queue row, named by its declaredAt', () => {
    const row = treatmentFeeQueueRow(feeOrder(), unread.keys);
    expect(row).toMatchObject({
      kind: 'treatment_fee',
      subjectKey: FEE_KEY,
      paymentId: null,
      quotationId: null,
      installmentNumber: null,
      orderId: 'order-2',
      amounts: {
        due: 300,
        stamp: 1,
        withholdingRate: null,
        withholding: 0,
        cash: 301,
        currency: 'TND',
      },
      state: 'receipt_sent',
      hasProof: true,
      seenByMe: false,
    });
    expect(JSON.stringify(row)).not.toMatch(/uploads|proof-path|ProofPath/);
  });

  it('keeps a key for a fee processed before declaredAt existed', () => {
    const legacy = feeOrder({
      treatmentFeeDeclaredAt: null,
      treatmentFeePaymentStatus: PaymentRecordStatus.success,
      treatmentFeePaidAt: NOW,
    });
    expect(treatmentFeeRowSubjectKey(legacy)).toBe(
      `treatment_fee:order-2:${NOW.getTime()}`,
    );
    const row = treatmentFeeQueueRow(legacy, unread.keys);
    expect(row).toMatchObject({
      state: 'paid',
      processedAt: NOW.toISOString(),
      declaredAt: null,
      seenByMe: true,
    });
  });

  it('carries the refusal reason of a refused fee', () => {
    const row = treatmentFeeQueueRow(
      feeOrder({
        treatmentFeePaymentStatus: PaymentRecordStatus.rejected,
        treatmentFeeRejectedAt: NOW,
        treatmentFeeRejectionReason: 'Mauvais RIB',
      }),
      new Set(),
    );
    expect(row).toMatchObject({
      status: PaymentRecordStatus.rejected,
      state: 'refused',
      processedAt: NOW.toISOString(),
      rejectionReason: 'Mauvais RIB',
    });
  });
});
