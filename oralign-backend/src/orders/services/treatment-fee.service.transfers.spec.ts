import {
  OrderType,
  PaymentMethod,
  PaymentRecordStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Caller } from '../../common/access/caller';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrderAuditService } from './order-audit.service';
import type { OrderService } from './order.service';

jest.mock('./order-storage', () => ({
  purgeStoredMedia: jest.fn(),
  removeFileFromDisk: jest.fn(),
  purgeOrderDirectory: jest.fn(),
}));
// The mapper needs every relation of a real row; identity is enough here
// (its receipt rule has its own spec, order.mapper.transfer.spec).
jest.mock('./order.mapper', () => ({
  orderInclude: {},
  mapOrderToDto: (order: unknown) => order,
}));
// The receipt checks and storage have their own spec (receipt-file.spec).
jest.mock('../../payments/receipt-file', () => ({
  assertReceiptFile: jest
    .fn()
    .mockResolvedValue({ kind: 'jpeg', ext: 'jpg', mime: 'image/jpeg' }),
  writeReceiptFile: jest
    .fn()
    .mockResolvedValue('/uploads/orders/o-1/payment-proofs/new.jpg'),
  removeReceiptFile: jest.fn().mockResolvedValue(undefined),
  openReceipt: jest.fn(),
}));

import { ORDER_AUDIT_ACTION } from '../../common/audit/order-audit-actions';
import { AppException } from '../../common/exceptions/app.exception';
import { TRANSFER_ERROR } from '../../common/exceptions/domain-error-codes';
import { NotificationEvents } from '../../notifications/events/notification-events';
import {
  assertReceiptFile,
  openReceipt,
  removeReceiptFile,
  writeReceiptFile,
} from '../../payments/receipt-file';
import { TreatmentFeeService } from './treatment-fee.service';

const asserted = jest.mocked(assertReceiptFile);
const written = jest.mocked(writeReceiptFile);
const removed = jest.mocked(removeReceiptFile);
const opened = jest.mocked(openReceipt);

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const doctor: Caller = { userId: 'u-doc', role: UserRole.dentist };
const otherDoctor: Caller = { userId: 'u-other', role: UserRole.dentist };
const designer: Caller = { userId: 'u-des', role: UserRole.designer };
const technician: Caller = { userId: 'u-tech', role: UserRole.technician };
const d = (value: string) => new Prisma.Decimal(value);
const receipt = { buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), size: 4 };
const NEW_PROOF = '/uploads/orders/o-1/payment-proofs/new.jpg';
const OLD_PROOF = '/uploads/orders/o-1/payment-proofs/old.jpg';
const DECLARED = new Date('2026-11-20T10:00:00.000Z');
const KEY = 'fee-key-0001';
const NOTE = 'Virement vu sur le relevé du 20/11';

type Order = Record<string, unknown> & { id: string };

/** An order whose fee transfer awaits the admin (with its receipt). */
const awaitingFee = (over: Partial<Order> = {}): Partial<Order> => ({
  treatmentFeePaymentMethod: PaymentMethod.bank_transfer,
  treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
  // 350 due + 1 stamp, no retenue.
  treatmentFeeAmount: d('351.000'),
  treatmentFeeStampAmount: d('1.000'),
  treatmentFeeProofPath: OLD_PROOF,
  treatmentFeeDeclaredAt: DECLARED,
  ...over,
});

function setup(
  over: Partial<Order> = {},
  options: { keyOnAnotherOrder?: boolean } = {},
) {
  const order: Order = {
    id: 'o-1',
    orderCode: 'ORD-1',
    doctorId: 'u-doc',
    orderType: OrderType.initial,
    welcomeGiftAppliedAt: null,
    cbctFeeAmount: d('50.000'),
    treatmentFeePaidAt: null,
    treatmentFeePaymentMethod: null,
    treatmentFeePaymentStatus: null,
    treatmentFeeAmount: null,
    treatmentFeeWithholdingRate: null,
    treatmentFeeWithholdingAmount: null,
    treatmentFeeStampAmount: null,
    treatmentFeeWithholdingThreshold: null,
    treatmentFeeProofPath: null,
    treatmentFeeDeclaredAt: null,
    treatmentFeeReviewOpenedAt: null,
    treatmentFeeRejectedAt: null,
    treatmentFeeRejectedById: null,
    treatmentFeeRejectedByName: null,
    treatmentFeeRejectionReason: null,
    treatmentFeeDeclarationKey: null,
    doctor: { fullName: 'Dr Salma' },
    patient: { fullName: 'Ines' },
    ...over,
  };
  const audits: Array<Record<string, unknown>> = [];
  const steps: string[] = [];
  const tx = {
    $queryRaw: jest.fn((strings: TemplateStringsArray) => {
      steps.push(`lock:${strings.join('?').match(/"(\w+)"/)?.[1] ?? '?'}`);
      return Promise.resolve([]);
    }),
    dentalOrder: {
      findUnique: jest.fn(() => Promise.resolve({ ...order })),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        steps.push('order.update');
        Object.assign(order, data);
        return Promise.resolve({ ...order });
      }),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          const hit = Object.entries(where).every(([key, expected]) => {
            const actual = order[key];
            if (expected === null)
              return actual === null || actual === undefined;
            if (expected instanceof Date) {
              return (
                actual instanceof Date &&
                actual.getTime() === expected.getTime()
              );
            }
            return actual === expected;
          });
          if (hit) Object.assign(order, data);
          return Promise.resolve({ count: hit ? 1 : 0 });
        },
      ),
    },
    // No ClicToPay fee attempt in flight.
    payment: { findFirst: jest.fn().mockResolvedValue(null) },
    user: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({
          fullName: where.id === 'u-doc' ? 'Dr Salma' : 'Admin One',
        }),
      ),
    },
    orderAuditLog: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        steps.push('audit');
        audits.push(data);
        return Promise.resolve({ id: `a-${audits.length}` });
      }),
    },
  };
  const prisma = {
    user: tx.user,
    companyBillingSettings: {
      findFirst: jest.fn().mockResolvedValue({
        defaultTreatmentFee: d('300.000'),
        withholdingRate: d('1'),
        stampDuty: d('1'),
        withholdingEnabled: true,
        withholdingThreshold: d('0'),
        bankDetails: { rib: '123', bankName: 'Bank' },
      }),
    },
    dentalOrder: {
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        if ('treatmentFeeDeclarationKey' in where) {
          // assertDeclarationKeyFree: another order of the doctor.
          return Promise.resolve(
            options.keyOnAnotherOrder ? { id: 'o-9' } : null,
          );
        }
        return Promise.resolve({ ...order });
      }),
      // The fee lists (one row: this order).
      findMany: jest.fn(() => Promise.resolve([{ ...order }])),
      count: jest.fn().mockResolvedValue(1),
    },
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const orders = {
    ensureCanCreateOrModify: jest.fn((caller: Caller) => {
      if (caller.role !== UserRole.dentist && caller.role !== UserRole.admin) {
        throw new AppException(403, 'Forbidden');
      }
    }),
    findAccessibleOrder: jest.fn(() => Promise.resolve({ ...order })),
  };
  const events = { emit: jest.fn() };
  const audit = { entry: jest.fn().mockResolvedValue({ action: 'x' }) };
  const service = new TreatmentFeeService(
    prisma as unknown as PrismaService,
    orders as unknown as OrderService,
    events as unknown as EventEmitter2,
    audit as unknown as OrderAuditService,
  );
  return { service, order, audits, steps, events, tx, prisma };
}

async function rejection(promise: Promise<unknown>): Promise<AppException> {
  const error = await promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (e: unknown) => e,
  );
  if (!(error instanceof AppException)) throw error;
  return error;
}

const emitted = (events: { emit: jest.Mock }, name: string) =>
  events.emit.mock.calls
    .filter(([event]) => event === name)
    .map(([, payload]) => payload as Record<string, unknown>);
const eventNames = (events: { emit: jest.Mock }) =>
  events.emit.mock.calls.map(([name]) => name as string);
const subjectOf = (at: Date) => `treatment_fee:o-1:${at.getTime()}`;

beforeEach(() => {
  asserted.mockClear();
  written.mockClear();
  removed.mockClear();
  opened.mockReset();
});

describe('TreatmentFeeService.payTreatmentFee with bank_transfer', () => {
  it('a dentist declares through the receipt upload: 400 PROOF_REQUIRED here, nothing read', async () => {
    const { service, prisma } = setup();
    const error = await rejection(
      service.payTreatmentFee('o-1', PaymentMethod.bank_transfer, doctor),
    );
    expect(error.statusCode).toBe(400);
    expect(error.errorCode).toBe(TRANSFER_ERROR.PROOF_REQUIRED);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('an admin without a note: 400 PROOF_OVERRIDE_NOTE_REQUIRED', async () => {
    const { service } = setup();
    const error = await rejection(
      service.payTreatmentFee(
        'o-1',
        PaymentMethod.bank_transfer,
        admin,
        false,
        'ok',
      ),
    );
    expect(error.errorCode).toBe(TRANSFER_ERROR.PROOF_OVERRIDE_NOTE_REQUIRED);
  });

  it('an admin with a note declares for the doctor: awaiting, no receipt, its own instant, journaled', async () => {
    const { service, order, audits, events } = setup();
    await service.payTreatmentFee(
      'o-1',
      PaymentMethod.bank_transfer,
      admin,
      false,
      `  ${NOTE}  `,
    );
    expect(order).toMatchObject({
      treatmentFeePaymentMethod: PaymentMethod.bank_transfer,
      treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
      treatmentFeeProofPath: null,
      treatmentFeePaidAt: null,
      treatmentFeeDeclarationKey: null,
    });
    const declaredAt = order.treatmentFeeDeclaredAt as Date;
    expect(declaredAt).toBeInstanceOf(Date);
    expect(audits).toEqual([
      expect.objectContaining({
        action: ORDER_AUDIT_ACTION.TREATMENT_FEE_DECLARED,
        actorId: 'u-admin',
        metadata: expect.objectContaining({
          method: PaymentMethod.bank_transfer,
          amount: 350,
          hasProof: false,
          declaredAt: declaredAt.toISOString(),
          overrideNote: NOTE,
        }) as unknown,
      }),
    ]);
    expect(emitted(events, NotificationEvents.TreatmentFeeDeclared)).toEqual([
      expect.objectContaining({
        orderId: 'o-1',
        doctorId: 'u-doc',
        declaredAt: declaredAt.toISOString(),
      }),
    ]);
  });
});

describe('TreatmentFeeService.payTreatmentFee in person (cash / cheque) beside a transfer', () => {
  it('a transfer still awaiting the admin is a 409 PAYMENT_ATTEMPT_IN_PROGRESS: confirm or refuse it first', async () => {
    const { service, order, audits } = setup(awaitingFee());
    const error = await rejection(
      service.payTreatmentFee('o-1', PaymentMethod.cash, admin),
    );
    expect(error.statusCode).toBe(409);
    expect(error.errorCode).toBe('PAYMENT_ATTEMPT_IN_PROGRESS');
    expect(order.treatmentFeePaymentStatus).toBe(
      PaymentRecordStatus.awaiting_confirmation,
    );
    expect(audits).toHaveLength(0);
  });

  it('after a refusal, the cheque settles the fee and the stale refusal is cleared', async () => {
    const { service, order } = setup(
      awaitingFee({
        treatmentFeePaymentStatus: PaymentRecordStatus.rejected,
        treatmentFeeRejectedAt: new Date('2026-11-21T10:00:00.000Z'),
        treatmentFeeRejectedById: 'u-admin',
        treatmentFeeRejectedByName: 'Admin One',
        treatmentFeeRejectionReason: 'Reçu illisible',
      }),
    );
    await service.payTreatmentFee('o-1', PaymentMethod.cheque, admin);
    expect(order).toMatchObject({
      treatmentFeePaymentMethod: PaymentMethod.cheque,
      treatmentFeePaymentStatus: PaymentRecordStatus.success,
      treatmentFeeProofPath: null,
      treatmentFeeDeclaredAt: null,
      treatmentFeeRejectedAt: null,
      treatmentFeeRejectionReason: null,
    });
    expect(order.treatmentFeePaidAt).toBeInstanceOf(Date);
    // The refused receipt stays on disk.
    expect(removed).not.toHaveBeenCalled();
  });
});

describe('TreatmentFeeService fee lists: the transfer fields', () => {
  it('a refused row shows its state, reason and receipt flag; a paid one never a stale reason', async () => {
    const refusedAt = new Date('2026-11-21T10:00:00.000Z');
    const refused = setup(
      awaitingFee({
        treatmentFeePaymentStatus: PaymentRecordStatus.rejected,
        treatmentFeeReviewOpenedAt: new Date('2026-11-21T09:00:00.000Z'),
        treatmentFeeRejectedAt: refusedAt,
        treatmentFeeRejectionReason: 'Reçu illisible',
      }),
    );
    const page = await refused.service.listTreatmentFees({}, doctor);
    expect(page.data[0]).toMatchObject({
      state: 'refused',
      hasProof: true,
      declaredAt: DECLARED,
      rejectedAt: refusedAt,
      rejectionReason: 'Reçu illisible',
    });

    const paid = setup(
      awaitingFee({
        treatmentFeePaymentStatus: PaymentRecordStatus.success,
        treatmentFeePaidAt: new Date(),
        treatmentFeeRejectedAt: refusedAt,
        treatmentFeeRejectionReason: 'Reçu illisible',
      }),
    );
    const paidPage = await paid.service.listTreatmentFees({}, admin);
    expect(paidPage.data[0]).toMatchObject({
      state: 'paid',
      rejectedAt: null,
      rejectionReason: null,
    });
  });

  it('an awaiting row reads receipt_sent, then to_verify once opened', async () => {
    const sent = setup(awaitingFee());
    expect(
      (await sent.service.listTreatmentFees({}, admin)).data[0].state,
    ).toBe('receipt_sent');
    const reviewed = setup(
      awaitingFee({
        treatmentFeeReviewOpenedAt: new Date('2026-11-21T09:00:00.000Z'),
      }),
    );
    expect(
      (await reviewed.service.listPendingTreatmentFees({ caller: admin }))
        .data[0].state,
    ).toBe('to_verify');
  });
});

describe('TreatmentFeeService.uploadTreatmentFeeProof (the doctor declares)', () => {
  it('no receipt: 400 PROOF_REQUIRED, nothing written', async () => {
    const { service, prisma } = setup();
    const error = await rejection(
      service.uploadTreatmentFeeProof('o-1', null, doctor),
    );
    expect(error.errorCode).toBe(TRANSFER_ERROR.PROOF_REQUIRED);
    expect(written).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('checks the receipt, writes it under the order, and starts a new declaration', async () => {
    const { service, order, audits, events, steps } = setup();
    await service.uploadTreatmentFeeProof('o-1', receipt, doctor, false, KEY);
    expect(asserted).toHaveBeenCalledWith(receipt);
    expect(written).toHaveBeenCalledWith('o-1', receipt.buffer, {
      kind: 'jpeg',
      ext: 'jpg',
      mime: 'image/jpeg',
    });
    const declaredAt = order.treatmentFeeDeclaredAt as Date;
    expect(order).toMatchObject({
      treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
      treatmentFeeProofPath: NEW_PROOF,
      treatmentFeeDeclarationKey: KEY,
      treatmentFeeReviewOpenedAt: null,
    });
    expect(steps[0]).toBe('lock:DentalOrder');
    expect(steps.at(-1)).toBe('audit');
    expect(audits[0]).toMatchObject({
      action: ORDER_AUDIT_ACTION.TREATMENT_FEE_PROOF_UPLOADED,
      metadata: { hasProof: true, declaredAt: declaredAt.toISOString() },
    });
    expect(JSON.stringify(audits[0])).not.toMatch(/uploads|payment-proofs/);
    expect(eventNames(events)).toEqual([
      NotificationEvents.TreatmentFeeDeclared,
    ]);
    expect(
      emitted(events, NotificationEvents.TreatmentFeeDeclared)[0],
    ).toMatchObject({
      declaredAt: declaredAt.toISOString(),
      method: PaymentMethod.bank_transfer,
    });
  });

  it('after a refusal: a new declaration, the refusal cleared, journaled as an upload', async () => {
    const { service, order, audits, events } = setup(
      awaitingFee({
        treatmentFeePaymentStatus: PaymentRecordStatus.rejected,
        treatmentFeeRejectedAt: new Date('2026-11-21T10:00:00.000Z'),
        treatmentFeeRejectedById: 'u-admin',
        treatmentFeeRejectedByName: 'Admin One',
        treatmentFeeRejectionReason: 'Reçu illisible',
        treatmentFeeReviewOpenedAt: new Date('2026-11-21T09:00:00.000Z'),
      }),
    );
    await service.uploadTreatmentFeeProof('o-1', receipt, doctor);
    expect(order).toMatchObject({
      treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
      treatmentFeeRejectedAt: null,
      treatmentFeeRejectedById: null,
      treatmentFeeRejectedByName: null,
      treatmentFeeRejectionReason: null,
      treatmentFeeReviewOpenedAt: null,
    });
    expect(audits[0].action).toBe(
      ORDER_AUDIT_ACTION.TREATMENT_FEE_PROOF_UPLOADED,
    );
    // The refused declaration is closed already: no supersede event.
    expect(eventNames(events)).toEqual([
      NotificationEvents.TreatmentFeeDeclared,
    ]);
  });

  it('replaces a declaration still awaiting: journaled as a replacement, the OLD subject closed first', async () => {
    const { service, order, audits, events } = setup(awaitingFee());
    await service.uploadTreatmentFeeProof('o-1', receipt, doctor);
    const declaredAt = order.treatmentFeeDeclaredAt as Date;
    expect(declaredAt.getTime()).not.toBe(DECLARED.getTime());
    expect(audits[0].action).toBe(
      ORDER_AUDIT_ACTION.TREATMENT_FEE_PROOF_REPLACED,
    );
    // The old file stays on disk (history).
    expect(removed).not.toHaveBeenCalled();
    expect(eventNames(events)).toEqual([
      NotificationEvents.TreatmentFeeSuperseded,
      NotificationEvents.TreatmentFeeDeclared,
    ]);
    expect(
      emitted(events, NotificationEvents.TreatmentFeeSuperseded)[0],
    ).toEqual({
      kind: 'treatment_fee',
      subjectKey: subjectOf(DECLARED),
      reason: 'superseded',
      orderId: 'o-1',
      orderCode: 'ORD-1',
      doctorId: 'u-doc',
      actorId: 'u-doc',
      replacedBySubjectKey: subjectOf(declaredAt),
    });
  });

  it('a repeat of the same Idempotency-Key answers the order as it stands, nothing written', async () => {
    const { service, prisma } = setup(
      awaitingFee({ treatmentFeeDeclarationKey: KEY }),
    );
    await expect(
      service.uploadTreatmentFeeProof('o-1', receipt, doctor, false, KEY),
    ).resolves.toMatchObject({ treatmentFeeDeclarationKey: KEY });
    expect(written).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('a repeat that lost the race (seen under the lock) answers the order, its twin file unlinked', async () => {
    const { service, tx, order, audits } = setup();
    tx.$queryRaw.mockImplementationOnce(() => {
      Object.assign(order, awaitingFee({ treatmentFeeDeclarationKey: KEY }));
      return Promise.resolve([]);
    });
    await service.uploadTreatmentFeeProof('o-1', receipt, doctor, false, KEY);
    expect(removed).toHaveBeenCalledWith(NEW_PROOF);
    expect(audits).toHaveLength(0);
  });

  it('the key of another order of the doctor is a 409 TRANSFER_IDEMPOTENCY_KEY_REUSED', async () => {
    const { service } = setup({}, { keyOnAnotherOrder: true });
    const error = await rejection(
      service.uploadTreatmentFeeProof('o-1', receipt, doctor, false, KEY),
    );
    expect(error.statusCode).toBe(409);
    expect(error.errorCode).toBe(TRANSFER_ERROR.IDEMPOTENCY_KEY_REUSED);
    expect(written).not.toHaveBeenCalled();
  });

  it('a malformed key is a 400 before any read', async () => {
    const { service } = setup();
    const error = await rejection(
      service.uploadTreatmentFeeProof('o-1', receipt, doctor, false, 'bad key'),
    );
    expect(error.errorCode).toBe(TRANSFER_ERROR.IDEMPOTENCY_KEY_INVALID);
  });

  it('a paid fee refuses the receipt before the disk: 409 TRANSFER_ALREADY_PROCESSED (« déjà traité »)', async () => {
    const { service } = setup({ treatmentFeePaidAt: new Date() });
    const error = await rejection(
      service.uploadTreatmentFeeProof('o-1', receipt, doctor),
    );
    expect(error.statusCode).toBe(409);
    expect(error.errorCode).toBe(TRANSFER_ERROR.TRANSFER_ALREADY_PROCESSED);
    expect(written).not.toHaveBeenCalled();
  });

  it('a replacement sent after the admin confirmed the transfer (seen under the lock): 409 TRANSFER_ALREADY_PROCESSED, the written file unlinked', async () => {
    const { service, tx, order } = setup();
    tx.$queryRaw.mockImplementationOnce(() => {
      order.treatmentFeePaidAt = new Date();
      return Promise.resolve([]);
    });
    const error = await rejection(
      service.uploadTreatmentFeeProof('o-1', receipt, doctor),
    );
    expect(error.statusCode).toBe(409);
    expect(error.errorCode).toBe(TRANSFER_ERROR.TRANSFER_ALREADY_PROCESSED);
    expect(removed).toHaveBeenCalledWith(NEW_PROOF);
  });

  it('the written file is unlinked when the transaction fails', async () => {
    const { service, tx } = setup();
    tx.dentalOrder.update.mockRejectedValueOnce(new Error('db down'));
    await expect(
      service.uploadTreatmentFeeProof('o-1', receipt, doctor),
    ).rejects.toThrow('db down');
    expect(removed).toHaveBeenCalledWith(NEW_PROOF);
  });

  it('a receipt the checks refuse never reaches the disk', async () => {
    const { service } = setup();
    asserted.mockRejectedValueOnce(new Error('RECEIPT_TYPE'));
    await expect(
      service.uploadTreatmentFeeProof('o-1', receipt, doctor),
    ).rejects.toThrow('RECEIPT_TYPE');
    expect(written).not.toHaveBeenCalled();
  });
});

describe('TreatmentFeeService.withdrawTreatmentFeeProof', () => {
  it('the fee is payable again, the file kept, journaled without a path, the subject closed', async () => {
    const { service, order, audits, events } = setup(
      awaitingFee({ treatmentFeeDeclarationKey: KEY }),
    );
    await service.withdrawTreatmentFeeProof('o-1', doctor);
    expect(order).toMatchObject({
      treatmentFeePaymentMethod: null,
      treatmentFeePaymentStatus: null,
      treatmentFeeProofPath: null,
      treatmentFeeAmount: null,
      treatmentFeeDeclaredAt: null,
      // Kept: a late repeat of the withdrawn upload declares nothing.
      treatmentFeeDeclarationKey: KEY,
    });
    expect(removed).not.toHaveBeenCalled();
    expect(audits).toEqual([
      expect.objectContaining({
        action: ORDER_AUDIT_ACTION.TREATMENT_FEE_PROOF_REMOVED,
        actorId: 'u-doc',
        metadata: {
          method: PaymentMethod.bank_transfer,
          amount: 350,
          declaredAt: DECLARED.toISOString(),
        },
      }),
    ]);
    expect(emitted(events, NotificationEvents.TreatmentFeeWithdrawn)).toEqual([
      {
        kind: 'treatment_fee',
        subjectKey: subjectOf(DECLARED),
        reason: 'withdrawn',
        orderId: 'o-1',
        orderCode: 'ORD-1',
        doctorId: 'u-doc',
        actorId: 'u-doc',
      },
    ]);
  });

  it('a repeat (nothing declared any more) answers the order, nothing written', async () => {
    const { service, prisma } = setup();
    await service.withdrawTreatmentFeeProof('o-1', doctor);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    [
      'refused',
      awaitingFee({ treatmentFeePaymentStatus: PaymentRecordStatus.rejected }),
    ],
    [
      'paid',
      awaitingFee({
        treatmentFeePaymentStatus: PaymentRecordStatus.success,
        treatmentFeePaidAt: new Date(),
      }),
    ],
  ])('a %s fee is a 409 TRANSFER_NOT_WITHDRAWABLE', async (_label, state) => {
    const { service } = setup(state);
    const error = await rejection(
      service.withdrawTreatmentFeeProof('o-1', doctor),
    );
    expect(error.statusCode).toBe(409);
    expect(error.errorCode).toBe(TRANSFER_ERROR.TRANSFER_NOT_WITHDRAWABLE);
  });

  it('confirmed meanwhile (seen under the lock): 409, nothing written', async () => {
    const { service, tx, order, audits } = setup(awaitingFee());
    tx.$queryRaw.mockImplementationOnce(() => {
      Object.assign(order, {
        treatmentFeePaymentStatus: PaymentRecordStatus.success,
        treatmentFeePaidAt: new Date(),
      });
      return Promise.resolve([]);
    });
    const error = await rejection(
      service.withdrawTreatmentFeeProof('o-1', doctor),
    );
    expect(error.errorCode).toBe(TRANSFER_ERROR.TRANSFER_NOT_WITHDRAWABLE);
    expect(audits).toHaveLength(0);
  });
});

describe('TreatmentFeeService.confirmTreatmentFeePayment', () => {
  it('confirms the declaration as declared and journals it with its instant', async () => {
    const { service, order, audits, events } = setup(awaitingFee());
    await service.confirmTreatmentFeePayment('o-1', admin);
    expect(order.treatmentFeePaymentStatus).toBe(PaymentRecordStatus.success);
    expect(order.treatmentFeePaidAt).toBeInstanceOf(Date);
    expect(order.treatmentFeeAmount).toEqual(d('351.000'));
    expect(audits[0]).toMatchObject({
      action: ORDER_AUDIT_ACTION.TREATMENT_FEE_CONFIRMED,
      metadata: {
        amount: 350,
        hasProof: true,
        declaredAt: DECLARED.toISOString(),
      },
    });
    expect(
      emitted(events, NotificationEvents.TreatmentFeeConfirmed)[0],
    ).toMatchObject({
      declaredAt: DECLARED.toISOString(),
    });
  });

  it('a repeat on the paid fee answers the order (200), nothing written', async () => {
    const { service, prisma } = setup(
      awaitingFee({
        treatmentFeePaymentStatus: PaymentRecordStatus.success,
        treatmentFeePaidAt: new Date(),
      }),
    );
    await service.confirmTreatmentFeePayment('o-1', admin);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('a declaration without a receipt needs the override note, journaled', async () => {
    const refused = setup(awaitingFee({ treatmentFeeProofPath: null }));
    expect(
      (
        await rejection(
          refused.service.confirmTreatmentFeePayment('o-1', admin),
        )
      ).errorCode,
    ).toBe(TRANSFER_ERROR.PROOF_OVERRIDE_NOTE_REQUIRED);

    const { service, audits } = setup(
      awaitingFee({ treatmentFeeProofPath: null }),
    );
    await service.confirmTreatmentFeePayment('o-1', admin, {
      overrideNote: NOTE,
    });
    expect(audits[0]).toMatchObject({
      metadata: { overrideNote: NOTE, hasProof: false },
    });
  });

  it.each([
    [
      'refused',
      awaitingFee({ treatmentFeePaymentStatus: PaymentRecordStatus.rejected }),
    ],
    ['withdrawn', {}],
  ])(
    'a %s declaration is a 409 TRANSFER_ALREADY_PROCESSED',
    async (_label, state) => {
      const { service } = setup(state);
      const error = await rejection(
        service.confirmTreatmentFeePayment('o-1', admin),
      );
      expect(error.statusCode).toBe(409);
      expect(error.errorCode).toBe(TRANSFER_ERROR.TRANSFER_ALREADY_PROCESSED);
    },
  );

  it('the receipt the admin reviewed was replaced since (declaredAt): 409', async () => {
    const { service } = setup(awaitingFee());
    const error = await rejection(
      service.confirmTreatmentFeePayment('o-1', admin, {
        declaredAt: '2026-11-19T10:00:00.000Z',
      }),
    );
    expect(error.errorCode).toBe(TRANSFER_ERROR.TRANSFER_ALREADY_PROCESSED);
  });

  it('replaced while waiting on the lock: 409, nothing confirmed unseen', async () => {
    const { service, tx, order, audits } = setup(awaitingFee());
    tx.$queryRaw.mockImplementationOnce(() => {
      order.treatmentFeeDeclaredAt = new Date('2026-11-22T10:00:00.000Z');
      return Promise.resolve([]);
    });
    const error = await rejection(
      service.confirmTreatmentFeePayment('o-1', admin),
    );
    expect(error.errorCode).toBe(TRANSFER_ERROR.TRANSFER_ALREADY_PROCESSED);
    expect(order.treatmentFeePaidAt).toBeNull();
    expect(audits).toHaveLength(0);
  });

  it('is admin-only', async () => {
    const { service } = setup(awaitingFee());
    expect(
      (await rejection(service.confirmTreatmentFeePayment('o-1', doctor)))
        .statusCode,
    ).toBe(403);
  });
});

describe('TreatmentFeeService.rejectTreatmentFeePayment', () => {
  it('refuses with the trimmed reason, keeps the declared amounts, journals and tells the doctor', async () => {
    const { service, order, audits, events, steps } = setup(awaitingFee());
    await service.rejectTreatmentFeePayment('o-1', admin, {
      rejectionReason: '  Montant différent du relevé  ',
    });
    expect(order).toMatchObject({
      treatmentFeePaymentStatus: PaymentRecordStatus.rejected,
      treatmentFeeRejectedById: 'u-admin',
      treatmentFeeRejectedByName: 'Admin One',
      treatmentFeeRejectionReason: 'Montant différent du relevé',
      treatmentFeePaidAt: null,
      treatmentFeeAmount: d('351.000'),
      treatmentFeeProofPath: OLD_PROOF,
    });
    expect(order.treatmentFeeRejectedAt).toBeInstanceOf(Date);
    expect(steps).toEqual(['lock:DentalOrder', 'order.update', 'audit']);
    expect(audits[0]).toMatchObject({
      action: ORDER_AUDIT_ACTION.TREATMENT_FEE_REJECTED,
      metadata: {
        reason: 'Montant différent du relevé',
        declaredAt: DECLARED.toISOString(),
      },
    });
    expect(emitted(events, NotificationEvents.TreatmentFeeRejected)).toEqual([
      expect.objectContaining({
        orderId: 'o-1',
        doctorId: 'u-doc',
        declaredAt: DECLARED.toISOString(),
        rejectionReason: 'Montant différent du relevé',
        rejectedById: 'u-admin',
      }),
    ]);
  });

  it.each(['', 'ab', 'x'.repeat(501)])(
    'a reason %p is a 400 REJECTION_REASON_INVALID',
    async (reason) => {
      const { service } = setup(awaitingFee());
      const error = await rejection(
        service.rejectTreatmentFeePayment('o-1', admin, {
          rejectionReason: reason,
        }),
      );
      expect(error.errorCode).toBe(TRANSFER_ERROR.REJECTION_REASON_INVALID);
    },
  );

  it('a repeat on the refused declaration answers the order (200), nothing written', async () => {
    const { service, prisma, events } = setup(
      awaitingFee({ treatmentFeePaymentStatus: PaymentRecordStatus.rejected }),
    );
    await service.rejectTreatmentFeePayment('o-1', admin, {
      rejectionReason: 'Reçu illisible',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('a paid fee is a 409 TRANSFER_ALREADY_PROCESSED', async () => {
    const { service } = setup(
      awaitingFee({
        treatmentFeePaymentStatus: PaymentRecordStatus.success,
        treatmentFeePaidAt: new Date(),
      }),
    );
    const error = await rejection(
      service.rejectTreatmentFeePayment('o-1', admin, {
        rejectionReason: 'Reçu illisible',
      }),
    );
    expect(error.errorCode).toBe(TRANSFER_ERROR.TRANSFER_ALREADY_PROCESSED);
  });

  it('confirmed while waiting on the lock: 409, the payment stands', async () => {
    const { service, tx, order } = setup(awaitingFee());
    tx.$queryRaw.mockImplementationOnce(() => {
      Object.assign(order, {
        treatmentFeePaymentStatus: PaymentRecordStatus.success,
        treatmentFeePaidAt: new Date(),
      });
      return Promise.resolve([]);
    });
    const error = await rejection(
      service.rejectTreatmentFeePayment('o-1', admin, {
        rejectionReason: 'Reçu illisible',
      }),
    );
    expect(error.errorCode).toBe(TRANSFER_ERROR.TRANSFER_ALREADY_PROCESSED);
    expect(order.treatmentFeePaymentStatus).toBe(PaymentRecordStatus.success);
  });

  it('is admin-only', async () => {
    const { service } = setup(awaitingFee());
    const error = await rejection(
      service.rejectTreatmentFeePayment('o-1', doctor, {
        rejectionReason: 'Reçu illisible',
      }),
    );
    expect(error.statusCode).toBe(403);
  });
});

describe('TreatmentFeeService.markTreatmentFeeReviewOpened', () => {
  it('the first opening stamps the declaration and journals it; the event names its subject', async () => {
    const { service, order, audits, events } = setup(awaitingFee());
    const result = await service.markTreatmentFeeReviewOpened('o-1', admin);
    expect(result.firstOpen).toBe(true);
    expect(result.subjectKey).toBe(subjectOf(DECLARED));
    expect(order.treatmentFeeReviewOpenedAt).toBeInstanceOf(Date);
    expect(audits).toEqual([
      expect.objectContaining({
        action: ORDER_AUDIT_ACTION.TREATMENT_FEE_REVIEW_OPENED,
        metadata: { declaredAt: DECLARED.toISOString() },
      }),
    ]);
    expect(emitted(events, NotificationEvents.TransferReviewOpened)).toEqual([
      {
        kind: 'treatment_fee',
        subjectKey: subjectOf(DECLARED),
        orderId: 'o-1',
        paymentId: null,
        adminId: 'u-admin',
        firstOpen: true,
        reviewOpenedAt: (result.reviewOpenedAt as Date).toISOString(),
      },
    ]);
  });

  it('a later opening stamps nothing, still marks this admin read', async () => {
    const first = new Date('2026-11-21T08:00:00.000Z');
    const { service, audits, events, prisma } = setup(
      awaitingFee({ treatmentFeeReviewOpenedAt: first }),
    );
    const result = await service.markTreatmentFeeReviewOpened('o-1', admin);
    expect(result).toEqual({
      orderId: 'o-1',
      subjectKey: subjectOf(DECLARED),
      reviewOpenedAt: first,
      firstOpen: false,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audits).toHaveLength(0);
    expect(
      emitted(events, NotificationEvents.TransferReviewOpened),
    ).toHaveLength(1);
  });

  it('opening a processed declaration stamps nothing', async () => {
    const { service, prisma } = setup(
      awaitingFee({ treatmentFeePaymentStatus: PaymentRecordStatus.rejected }),
    );
    const result = await service.markTreatmentFeeReviewOpened('o-1', admin);
    expect(result.firstOpen).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('replaced before the guarded write (another declaredAt): nothing stamped', async () => {
    const { service, tx, order, audits } = setup(awaitingFee());
    tx.$queryRaw.mockImplementationOnce(() => {
      order.treatmentFeeDeclaredAt = new Date('2026-11-22T10:00:00.000Z');
      return Promise.resolve([]);
    });
    const result = await service.markTreatmentFeeReviewOpened('o-1', admin);
    expect(result.firstOpen).toBe(false);
    expect(order.treatmentFeeReviewOpenedAt).toBeNull();
    expect(audits).toHaveLength(0);
  });

  it('an order without a declaration is a 404; a dentist gets a 403', async () => {
    const none = setup();
    expect(
      (await rejection(none.service.markTreatmentFeeReviewOpened('o-1', admin)))
        .statusCode,
    ).toBe(404);
    const fee = setup(awaitingFee());
    expect(
      (await rejection(fee.service.markTreatmentFeeReviewOpened('o-1', doctor)))
        .statusCode,
    ).toBe(403);
  });
});

describe('TreatmentFeeService.readTreatmentFeeProof (authenticated stream)', () => {
  const file = {
    absolutePath: '/srv/uploads/orders/o-1/payment-proofs/old.jpg',
    contentType: 'image/jpeg',
    size: 4,
    extension: 'jpg',
  };

  it.each([admin, doctor])('%p reads the receipt', async (caller) => {
    const { service } = setup(awaitingFee());
    opened.mockResolvedValue(file);
    await expect(service.readTreatmentFeeProof('o-1', caller)).resolves.toEqual(
      {
        receipt: file,
        downloadName: 'recu-frais-ORD-1',
      },
    );
    expect(opened).toHaveBeenCalledWith(OLD_PROOF);
  });

  it.each([otherDoctor, designer, technician])(
    '%p gets the 404 PROOF_NOT_FOUND of a missing file',
    async (caller) => {
      const { service } = setup(awaitingFee());
      opened.mockResolvedValue(file);
      const error = await rejection(
        service.readTreatmentFeeProof('o-1', caller),
      );
      expect(error.statusCode).toBe(404);
      expect(error.errorCode).toBe(TRANSFER_ERROR.PROOF_NOT_FOUND);
    },
  );

  it('no receipt, or none on disk: 404 PROOF_NOT_FOUND', async () => {
    const none = setup();
    expect(
      (await rejection(none.service.readTreatmentFeeProof('o-1', admin)))
        .errorCode,
    ).toBe(TRANSFER_ERROR.PROOF_NOT_FOUND);
    const gone = setup(awaitingFee());
    opened.mockResolvedValue(null);
    expect(
      (await rejection(gone.service.readTreatmentFeeProof('o-1', admin)))
        .errorCode,
    ).toBe(TRANSFER_ERROR.PROOF_NOT_FOUND);
  });
});
