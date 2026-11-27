import {
  InstallmentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
  QuotationStatus,
  UserRole,
} from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Caller } from '../../common/access/caller';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PaymentGateway } from '../gateways/payment-gateway.interface';

// QuotationService's module imports the Puppeteer PDF renderer (ESM-only);
// these flows only need approveOnFirstPayment.
jest.mock('../../quotations/services/quotation.service', () => ({
  QuotationService: class QuotationService {},
}));
jest.mock('../../production/production-batch-projection', () => ({
  projectBatches: jest.fn().mockResolvedValue(undefined),
}));
// The receipt checks and storage have their own spec (receipt-file.spec).
jest.mock('../receipt-file', () => ({
  assertReceiptFile: jest
    .fn()
    .mockResolvedValue({ kind: 'pdf', ext: 'pdf', mime: 'application/pdf' }),
  writeReceiptFile: jest
    .fn()
    .mockResolvedValue('/uploads/orders/o-1/payment-proofs/new.pdf'),
  removeReceiptFile: jest.fn().mockResolvedValue(undefined),
  openReceipt: jest.fn(),
}));

import { AppException } from '../../common/exceptions/app.exception';
import { TRANSFER_ERROR } from '../../common/exceptions/domain-error-codes';
import { ORDER_AUDIT_ACTION } from '../../common/audit/order-audit-actions';
import { NotificationEvents } from '../../notifications/events/notification-events';
import type { QuotationService } from '../../quotations/services/quotation.service';
import {
  assertReceiptFile,
  openReceipt,
  removeReceiptFile,
  writeReceiptFile,
} from '../receipt-file';
import { PaymentsService } from './payments.service';

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
const past = new Date('2026-01-01T00:00:00.000Z');
const NEW_PROOF = '/uploads/orders/o-1/payment-proofs/new.pdf';
const OLD_PROOF = '/uploads/orders/o-1/payment-proofs/old.pdf';
const receipt = { buffer: Buffer.from('%PDF-1.4 receipt'), size: 16 };
const KEY = 'decl-key-0001';

type Row = Record<string, unknown> & { id: string };

/** A Prisma `where` over the flat columns the transfer paths filter on. */
function matches(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key];
    if (expected === null) return actual === null || actual === undefined;
    if (
      expected &&
      typeof expected === 'object' &&
      !(expected instanceof Date) &&
      'in' in expected
    ) {
      return (expected as { in: unknown[] }).in.includes(actual);
    }
    if (expected instanceof Date) {
      return actual instanceof Date && actual.getTime() === expected.getTime();
    }
    return actual === expected;
  });
}

interface World {
  /** Payment rows of the installment (an awaiting transfer by default). */
  payments?: Row[];
  installmentStatus?: InstallmentStatus;
  orderStatus?: OrderStatus;
  orderDoctorId?: string;
}

/** A pack-transfer declaration as stored. */
const transfer = (over: Partial<Row> = {}): Row => ({
  id: 'p-1',
  orderId: 'o-1',
  quotationId: 'q-1',
  installmentId: 'i-1',
  purpose: PaymentPurpose.installment,
  amount: d('1001.000'),
  withholdingRate: null,
  withholdingAmount: d('0'),
  stampAmount: d('1.000'),
  currency: 'TND',
  status: PaymentRecordStatus.awaiting_confirmation,
  paymentMethod: PaymentMethod.bank_transfer,
  transactionId: null,
  proofUrl: OLD_PROOF,
  notes: null,
  declaredAt: new Date('2026-11-20T10:00:00.000Z'),
  createdAt: new Date('2026-11-20T10:00:00.000Z'),
  initiatedById: 'u-doc',
  declarationKey: null,
  reviewOpenedAt: null,
  reviewOpenedById: null,
  reviewOpenedByName: null,
  cancelledAt: null,
  cancelledById: null,
  cancelledByName: null,
  rejectedAt: null,
  rejectedById: null,
  rejectionReason: null,
  ...over,
});

function setup(world: World = {}) {
  const rows = new Map<string, Row>(
    (world.payments ?? [transfer()]).map((row) => [row.id, { ...row }]),
  );
  const order = {
    id: 'o-1',
    orderCode: 'ORD-1',
    doctorId: world.orderDoctorId ?? 'u-doc',
    deletedAt: null,
    status: world.orderStatus ?? OrderStatus.payment_review,
    doctor: { fullName: 'Dr Salma' },
    patient: { fullName: 'Ines' },
  };
  const installment = {
    id: 'i-1',
    installmentNumber: 2,
    amount: d('1000.000'),
    status: world.installmentStatus ?? InstallmentStatus.pending,
    availableFrom: past,
    quotationId: 'q-1',
    quotation: {
      id: 'q-1',
      status: QuotationStatus.approved,
      orderId: 'o-1',
      totalPrice: d('3000.000'),
      currency: 'TND',
      deletedAt: null,
      order,
    },
    stepBatch: null,
  };
  /** A payment row with the relations every include reads. */
  const withRelations = (row: Row | undefined) =>
    row
      ? {
          ...row,
          order: { ...order },
          installment: row.installmentId
            ? { installmentNumber: installment.installmentNumber }
            : null,
        }
      : null;
  const audits: Array<Record<string, unknown>> = [];
  const steps: string[] = [];
  let created = 0;

  const payment = {
    findUnique: jest.fn(
      ({
        where,
      }: {
        where: {
          id?: string;
          initiatedById_declarationKey?: {
            initiatedById: string;
            declarationKey: string;
          };
        };
      }) => {
        if (where.initiatedById_declarationKey) {
          const { initiatedById, declarationKey } =
            where.initiatedById_declarationKey;
          const hit = [...rows.values()].find(
            (row) =>
              row.initiatedById === initiatedById &&
              row.declarationKey === declarationKey,
          );
          return Promise.resolve(hit ? { ...hit } : null);
        }
        return Promise.resolve(withRelations(rows.get(where.id ?? '')));
      },
    ),
    findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) => {
      // assertNoOtherPaymentInFlight: status / method `in` lists.
      const hit = [...rows.values()].find((row) => {
        const { status, paymentMethod, ...rest } = where as {
          status?: { in: unknown[] };
          paymentMethod?: { in: unknown[] };
        };
        return (
          matches(row, rest) &&
          (!status || status.in.includes(row.status)) &&
          (!paymentMethod || paymentMethod.in.includes(row.paymentMethod))
        );
      });
      return Promise.resolve(hit ?? null);
    }),
    findMany: jest.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        [...rows.values()]
          .filter((row) => matches(row, where))
          .reverse()
          .map((row) => ({ id: row.id })),
      ),
    ),
    count: jest.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        [...rows.values()].filter((row) => matches(row, where)).length,
      ),
    ),
    updateMany: jest.fn(
      ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        steps.push('payment.updateMany');
        let count = 0;
        for (const row of rows.values()) {
          if (matches(row, where)) {
            Object.assign(row, data);
            count++;
          }
        }
        return Promise.resolve({ count });
      },
    ),
    create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
      steps.push('payment.create');
      const row: Row = {
        ...transfer(),
        id: `p-new-${++created}`,
        reviewOpenedAt: null,
        createdAt: new Date(),
        ...data,
      };
      rows.set(row.id, row);
      return Promise.resolve({ ...row });
    }),
    update: jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = rows.get(where.id)!;
        Object.assign(row, data);
        return Promise.resolve({ ...row });
      },
    ),
    aggregate: jest.fn(() =>
      Promise.resolve({
        _sum: {
          amount: d('1001.000'),
          withholdingAmount: d('0'),
          stampAmount: d('1.000'),
        },
      }),
    ),
  };
  const settings = {
    withholdingRate: d('1'),
    stampDuty: d('1'),
    withholdingEnabled: true,
    withholdingThreshold: d('0'),
    bankDetails: { rib: '123', bankName: 'Bank' },
  };
  const tx = {
    $queryRaw: jest.fn((strings: TemplateStringsArray) => {
      steps.push(`lock:${strings.join('?').match(/"(\w+)"/)?.[1] ?? '?'}`);
      return Promise.resolve([]);
    }),
    payment,
    quoteInstallment: {
      findUnique: jest.fn(() => Promise.resolve({ ...installment })),
      update: jest.fn(),
    },
    quoteStepBatch: { findUnique: jest.fn(), updateMany: jest.fn() },
    quotation: { update: jest.fn() },
    companyBillingSettings: {
      findFirst: jest.fn(() => Promise.resolve(settings)),
    },
    // The actor's name snapshot (lookupActorName).
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
    dentalOrder: {
      findUnique: jest.fn(() => Promise.resolve({ ...order })),
      update: jest.fn(({ data }: { data: Partial<typeof order> }) => {
        Object.assign(order, data);
        return Promise.resolve({ ...order });
      }),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string; status?: OrderStatus | { in: OrderStatus[] } };
          data: Partial<typeof order>;
        }) => {
          steps.push('order.updateMany');
          const status = where.status;
          const hit =
            where.id === order.id &&
            (!status ||
              (typeof status === 'string'
                ? status === order.status
                : status.in.includes(order.status)));
          if (hit) Object.assign(order, data);
          return Promise.resolve({ count: hit ? 1 : 0 });
        },
      ),
    },
  };
  const prisma = {
    ...tx,
    quoteInstallment: {
      findUnique: jest.fn(() => Promise.resolve({ ...installment })),
    },
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const events = { emit: jest.fn() };
  const quotations = { approveOnFirstPayment: jest.fn() };
  const service = new PaymentsService(
    prisma as unknown as PrismaService,
    events as unknown as EventEmitter2,
    {} as PaymentGateway,
    quotations as unknown as QuotationService,
  );
  return {
    service,
    rows,
    order,
    audits,
    steps,
    events,
    tx,
    prisma,
    quotations,
    settings,
  };
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

beforeEach(() => {
  asserted.mockClear();
  written.mockClear();
  removed.mockClear();
  opened.mockReset();
});

describe('PaymentsService.declareBankTransfer (spec §1)', () => {
  it('a dentist must attach the receipt: 400 PROOF_REQUIRED, nothing written', async () => {
    const { service, tx } = setup({ payments: [] });
    const error = await rejection(
      service.declareBankTransfer({ installmentId: 'i-1', caller: doctor }),
    );
    expect(error.statusCode).toBe(400);
    expect(error.errorCode).toBe(TRANSFER_ERROR.PROOF_REQUIRED);
    expect(written).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('an admin declaring without the receipt gives a note (400 PROOF_OVERRIDE_NOTE_REQUIRED)', async () => {
    const { service } = setup({ payments: [] });
    const error = await rejection(
      service.declareBankTransfer({ installmentId: 'i-1', caller: admin }),
    );
    expect(error.errorCode).toBe(TRANSFER_ERROR.PROOF_OVERRIDE_NOTE_REQUIRED);
  });

  it('an admin with a note declares without a receipt; the note is the admin-only `notes`, journaled', async () => {
    const { service, audits } = setup({ payments: [] });
    const payment = await service.declareBankTransfer({
      installmentId: 'i-1',
      caller: admin,
      overrideNote: '  Virement vu sur le relevé  ',
    });
    expect(payment).toMatchObject({
      proofUrl: null,
      notes: 'Virement vu sur le relevé',
      status: PaymentRecordStatus.awaiting_confirmation,
      initiatedById: 'u-admin',
    });
    expect(audits[0]).toMatchObject({
      action: ORDER_AUDIT_ACTION.PAYMENT_TRANSFER_DECLARED,
      paymentId: payment.id,
      metadata: { hasProof: false, overrideNote: 'Virement vu sur le relevé' },
    });
  });

  it('checks the receipt, writes it under the order only once authorised, and journals the declaration', async () => {
    const { service, audits, order, events, steps } = setup({
      payments: [],
      orderStatus: OrderStatus.payment_pending,
    });
    const payment = await service.declareBankTransfer({
      installmentId: 'i-1',
      caller: doctor,
      receipt,
      bankReference: 'TRF-42',
    });
    expect(asserted).toHaveBeenCalledWith(receipt);
    expect(written).toHaveBeenCalledWith('o-1', receipt.buffer, {
      kind: 'pdf',
      ext: 'pdf',
      mime: 'application/pdf',
    });
    expect(payment).toMatchObject({
      proofUrl: NEW_PROOF,
      transactionId: 'TRF-42',
      notes: null,
      declarationKey: null,
      paymentMethod: PaymentMethod.bank_transfer,
    });
    expect(order.status).toBe(OrderStatus.payment_review);
    // Installment lock first, the audit row last (after the order write).
    expect(steps[0]).toBe('lock:QuoteInstallment');
    expect(steps.at(-1)).toBe('audit');
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      orderId: 'o-1',
      action: ORDER_AUDIT_ACTION.PAYMENT_TRANSFER_DECLARED,
      paymentId: payment.id,
      actorId: 'u-doc',
      actorRole: UserRole.dentist,
      metadata: { installmentNumber: 2, amount: 1000, hasProof: true },
    });
    expect(JSON.stringify(audits[0])).not.toMatch(/uploads|payment-proofs/);
    // The admins hear of it, about the ORDER's doctor.
    expect(emitted(events, NotificationEvents.PaymentDeclared)).toEqual([
      expect.objectContaining({
        paymentId: payment.id,
        doctorId: 'u-doc',
        installmentNumber: 2,
      }),
    ]);
  });

  it("an admin declaring for the doctor: the event names the order's doctor, not the admin", async () => {
    const { service, events } = setup({ payments: [] });
    await service.declareBankTransfer({
      installmentId: 'i-1',
      caller: admin,
      receipt,
    });
    expect(
      emitted(events, NotificationEvents.PaymentDeclared)[0],
    ).toMatchObject({
      doctorId: 'u-doc',
    });
  });

  it('another dentist cannot declare on the order (403), before any file is written', async () => {
    const { service } = setup({ payments: [] });
    const error = await rejection(
      service.declareBankTransfer({
        installmentId: 'i-1',
        caller: otherDoctor,
        receipt,
      }),
    );
    expect(error.statusCode).toBe(403);
    expect(asserted).not.toHaveBeenCalled();
    expect(written).not.toHaveBeenCalled();
  });

  it('a receipt refused by the checks stops everything before the disk', async () => {
    const { service, tx } = setup({ payments: [] });
    asserted.mockRejectedValueOnce(new Error('RECEIPT_TYPE'));
    await expect(
      service.declareBankTransfer({
        installmentId: 'i-1',
        caller: doctor,
        receipt,
      }),
    ).rejects.toThrow('RECEIPT_TYPE');
    expect(written).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('the written receipt is unlinked when the transaction fails', async () => {
    const { service, tx } = setup({ payments: [] });
    tx.payment.create.mockRejectedValueOnce(new Error('db down'));
    await expect(
      service.declareBankTransfer({
        installmentId: 'i-1',
        caller: doctor,
        receipt,
      }),
    ).rejects.toThrow('db down');
    expect(removed).toHaveBeenCalledWith(NEW_PROOF);
  });

  it('replaces the declaration still awaiting: cancelled and stamped, receipt kept, payment_proof_replaced, PaymentSuperseded first', async () => {
    const { service, rows, audits, events } = setup();
    const payment = await service.declareBankTransfer({
      installmentId: 'i-1',
      caller: doctor,
      receipt,
    });
    const old = rows.get('p-1')!;
    expect(old).toMatchObject({
      status: PaymentRecordStatus.cancelled,
      cancelledById: 'u-doc',
      cancelledByName: 'Dr Salma',
      // The file stays: it is part of the payment's history.
      proofUrl: OLD_PROOF,
    });
    expect(old.cancelledAt).toBeInstanceOf(Date);
    expect(removed).not.toHaveBeenCalled();
    expect(audits[0]).toMatchObject({
      action: ORDER_AUDIT_ACTION.PAYMENT_PROOF_REPLACED,
      paymentId: payment.id,
      metadata: { replacedPaymentId: 'p-1', hasProof: true },
    });
    const names = events.emit.mock.calls.map(([name]) => name as string);
    expect(names).toEqual([
      NotificationEvents.PaymentSuperseded,
      NotificationEvents.PaymentDeclared,
    ]);
    expect(emitted(events, NotificationEvents.PaymentSuperseded)[0]).toEqual({
      kind: 'installment',
      subjectKey: 'installment:p-1',
      reason: 'superseded',
      orderId: 'o-1',
      orderCode: 'ORD-1',
      doctorId: 'u-doc',
      paymentId: 'p-1',
      quotationId: 'q-1',
      installmentNumber: 2,
      actorId: 'u-doc',
      replacedBySubjectKey: `installment:${payment.id}`,
    });
  });

  describe('Idempotency-Key', () => {
    it('stores the key; a repeat by the same caller answers the same row, nothing written again', async () => {
      const { service, tx } = setup({ payments: [] });
      const first = await service.declareBankTransfer({
        installmentId: 'i-1',
        caller: doctor,
        receipt,
        idempotencyKey: KEY,
      });
      expect(first.declarationKey).toBe(KEY);
      written.mockClear();
      const again = await service.declareBankTransfer({
        installmentId: 'i-1',
        caller: doctor,
        receipt,
        idempotencyKey: KEY,
      });
      expect(again.id).toBe(first.id);
      expect(tx.payment.create).toHaveBeenCalledTimes(1);
      expect(written).not.toHaveBeenCalled();
    });

    it('a replay answers the row even once the installment is paid (no PROOF / payable checks first)', async () => {
      const { service } = setup({
        payments: [
          transfer({
            id: 'p-done',
            declarationKey: KEY,
            status: PaymentRecordStatus.success,
          }),
        ],
        installmentStatus: InstallmentStatus.paid,
      });
      const replay = await service.declareBankTransfer({
        installmentId: 'i-1',
        caller: doctor,
        idempotencyKey: KEY,
      });
      expect(replay.id).toBe('p-done');
    });

    it('the key of another installment is a 409 TRANSFER_IDEMPOTENCY_KEY_REUSED', async () => {
      const { service } = setup({
        payments: [
          transfer({ id: 'p-x', installmentId: 'i-9', declarationKey: KEY }),
        ],
      });
      const error = await rejection(
        service.declareBankTransfer({
          installmentId: 'i-1',
          caller: doctor,
          receipt,
          idempotencyKey: KEY,
        }),
      );
      expect(error.statusCode).toBe(409);
      expect(error.errorCode).toBe(TRANSFER_ERROR.IDEMPOTENCY_KEY_REUSED);
    });

    it('a malformed key is a 400 before anything else', async () => {
      const { service, prisma } = setup({ payments: [] });
      const error = await rejection(
        service.declareBankTransfer({
          installmentId: 'i-1',
          caller: doctor,
          receipt,
          idempotencyKey: 'bad key',
        }),
      );
      expect(error.errorCode).toBe(TRANSFER_ERROR.IDEMPOTENCY_KEY_INVALID);
      expect(prisma.quoteInstallment.findUnique).not.toHaveBeenCalled();
    });

    it('a concurrent repeat that won the insert is answered, its twin receipt unlinked', async () => {
      const { service, tx, rows } = setup({ payments: [] });
      tx.payment.create.mockImplementationOnce(() => {
        // The other request committed the same key meanwhile.
        rows.set('p-won', transfer({ id: 'p-won', declarationKey: KEY }));
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError('dup', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        );
      });
      const replay = await service.declareBankTransfer({
        installmentId: 'i-1',
        caller: doctor,
        receipt,
        idempotencyKey: KEY,
      });
      expect(replay.id).toBe('p-won');
      expect(removed).toHaveBeenCalledWith(NEW_PROOF);
    });
  });

  describe('refusals raised before the quote is accepted (approveOnFirstPayment)', () => {
    it('a retenue while it is switched off: 400 WITHHOLDING_DISABLED, the quote left as it was, no receipt written', async () => {
      const { service, quotations, settings, tx } = setup({ payments: [] });
      settings.withholdingEnabled = false;
      const error = await rejection(
        service.declareBankTransfer({
          installmentId: 'i-1',
          caller: doctor,
          receipt,
          applyWithholding: true,
        }),
      );
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe('WITHHOLDING_DISABLED');
      expect(quotations.approveOnFirstPayment).not.toHaveBeenCalled();
      expect(written).not.toHaveBeenCalled();
      expect(tx.payment.create).not.toHaveBeenCalled();
    });

    it('a retenue below the threshold: 400 WITHHOLDING_BELOW_THRESHOLD, the quote left as it was', async () => {
      const { service, quotations, settings } = setup({ payments: [] });
      settings.withholdingThreshold = d('1500');
      const error = await rejection(
        service.declareBankTransfer({
          installmentId: 'i-1',
          caller: doctor,
          receipt,
          applyWithholding: true,
        }),
      );
      expect(error.errorCode).toBe('WITHHOLDING_BELOW_THRESHOLD');
      expect(quotations.approveOnFirstPayment).not.toHaveBeenCalled();
      expect(written).not.toHaveBeenCalled();
    });

    it('a card attempt in flight: 409 PAYMENT_ATTEMPT_IN_PROGRESS, the quote left as it was', async () => {
      const { service, quotations } = setup({
        payments: [
          transfer({
            id: 'p-card',
            paymentMethod: PaymentMethod.card,
            status: PaymentRecordStatus.pending,
          }),
        ],
      });
      const error = await rejection(
        service.declareBankTransfer({
          installmentId: 'i-1',
          caller: doctor,
          receipt,
        }),
      );
      expect(error.statusCode).toBe(409);
      expect(error.errorCode).toBe('PAYMENT_ATTEMPT_IN_PROGRESS');
      expect(quotations.approveOnFirstPayment).not.toHaveBeenCalled();
      expect(written).not.toHaveBeenCalled();
    });

    it('an eligible retenue goes through and the quote is accepted', async () => {
      const { service, quotations } = setup({ payments: [] });
      const payment = await service.declareBankTransfer({
        installmentId: 'i-1',
        caller: doctor,
        receipt,
        applyWithholding: true,
      });
      expect(Number(payment.withholdingRate)).toBe(1);
      expect(quotations.approveOnFirstPayment).toHaveBeenCalledWith(
        'q-1',
        doctor,
      );
    });

    it('recordCash refuses an ineligible retenue before accepting the quote', async () => {
      const { service, quotations, settings, tx } = setup({ payments: [] });
      settings.withholdingEnabled = false;
      const error = await rejection(
        service.recordCash({
          installmentId: 'i-1',
          caller: admin,
          applyWithholding: true,
        }),
      );
      expect(error.errorCode).toBe('WITHHOLDING_DISABLED');
      expect(quotations.approveOnFirstPayment).not.toHaveBeenCalled();
      expect(tx.payment.create).not.toHaveBeenCalled();
    });
  });

  describe('an installment paid meanwhile (the transfer being replaced was confirmed)', () => {
    it('seen before the lock: 409 INSTALLMENT_ALREADY_PAID, nothing written', async () => {
      const { service, tx } = setup({
        payments: [transfer({ status: PaymentRecordStatus.success })],
        installmentStatus: InstallmentStatus.paid,
      });
      const error = await rejection(
        service.declareBankTransfer({
          installmentId: 'i-1',
          caller: doctor,
          receipt,
        }),
      );
      expect(error.statusCode).toBe(409);
      expect(error.errorCode).toBe('INSTALLMENT_ALREADY_PAID');
      expect(written).not.toHaveBeenCalled();
      expect(tx.payment.create).not.toHaveBeenCalled();
    });

    it('seen under the installment lock: 409 INSTALLMENT_ALREADY_PAID, the receipt unlinked', async () => {
      const { service, tx } = setup();
      // The unlocked read still sees it pending; the locked re-read paid.
      tx.quoteInstallment.findUnique.mockImplementationOnce(() =>
        Promise.resolve({
          id: 'i-1',
          amount: d('1000.000'),
          status: InstallmentStatus.paid,
          availableFrom: past,
          quotation: { status: QuotationStatus.approved },
        } as never),
      );
      const error = await rejection(
        service.declareBankTransfer({
          installmentId: 'i-1',
          caller: doctor,
          receipt,
        }),
      );
      expect(error.statusCode).toBe(409);
      expect(error.errorCode).toBe('INSTALLMENT_ALREADY_PAID');
      expect(tx.payment.create).not.toHaveBeenCalled();
      expect(removed).toHaveBeenCalledWith(NEW_PROOF);
    });

    it('cash on a paid installment keeps its 400 (not a declaration)', async () => {
      const { service } = setup({
        payments: [],
        installmentStatus: InstallmentStatus.paid,
      });
      const error = await rejection(
        service.recordCash({ installmentId: 'i-1', caller: admin }),
      );
      expect(error.statusCode).toBe(400);
    });
  });
});

describe('PaymentsService.rejectBankTransfer', () => {
  it('refuses with the trimmed reason under the installment lock, order back to payment_pending, journaled, the doctor told why', async () => {
    const { service, rows, order, audits, events, steps } = setup();
    const payment = await service.rejectBankTransfer(
      'p-1',
      '  Montant différent du relevé  ',
      admin,
    );
    expect(payment.status).toBe(PaymentRecordStatus.rejected);
    expect(rows.get('p-1')).toMatchObject({
      status: PaymentRecordStatus.rejected,
      rejectedById: 'u-admin',
      rejectionReason: 'Montant différent du relevé',
    });
    expect(order.status).toBe(OrderStatus.payment_pending);
    expect(steps.slice(0, 2)).toEqual([
      'lock:QuoteInstallment',
      'payment.updateMany',
    ]);
    expect(steps.at(-1)).toBe('audit');
    expect(audits[0]).toMatchObject({
      action: ORDER_AUDIT_ACTION.PAYMENT_REJECTED,
      paymentId: 'p-1',
      metadata: { reason: 'Montant différent du relevé', hasProof: true },
    });
    expect(
      emitted(events, NotificationEvents.PaymentRejected)[0],
    ).toMatchObject({
      paymentId: 'p-1',
      doctorId: 'u-doc',
      rejectionReason: 'Montant différent du relevé',
    });
  });

  it('keeps the order in review while another transfer of it awaits', async () => {
    const { service, order } = setup({
      payments: [transfer(), transfer({ id: 'p-2', installmentId: 'i-2' })],
    });
    await service.rejectBankTransfer('p-1', 'Reçu illisible', admin);
    expect(order.status).toBe(OrderStatus.payment_review);
  });

  it.each(['', '  ab ', 'x'.repeat(501)])(
    'a reason %p is a 400 REJECTION_REASON_INVALID, nothing read',
    async (reason) => {
      const { service, prisma } = setup();
      const error = await rejection(
        service.rejectBankTransfer('p-1', reason, admin),
      );
      expect(error.errorCode).toBe(TRANSFER_ERROR.REJECTION_REASON_INVALID);
      expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    },
  );

  it('a repeat on the refused transfer answers it (200), nothing journaled or told again', async () => {
    const { service, audits, events } = setup({
      payments: [transfer({ status: PaymentRecordStatus.rejected })],
    });
    const payment = await service.rejectBankTransfer(
      'p-1',
      'Reçu illisible',
      admin,
    );
    expect(payment.status).toBe(PaymentRecordStatus.rejected);
    expect(audits).toHaveLength(0);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it.each([PaymentRecordStatus.success, PaymentRecordStatus.cancelled])(
    'a transfer already %s is a 409 TRANSFER_ALREADY_PROCESSED',
    async (status) => {
      const { service } = setup({ payments: [transfer({ status })] });
      const error = await rejection(
        service.rejectBankTransfer('p-1', 'Reçu illisible', admin),
      );
      expect(error.statusCode).toBe(409);
      expect(error.errorCode).toBe(TRANSFER_ERROR.TRANSFER_ALREADY_PROCESSED);
    },
  );

  it('confirmed meanwhile (seen by the guarded write under the lock): 409, nothing journaled', async () => {
    const { service, tx, rows, audits } = setup();
    tx.$queryRaw.mockImplementationOnce(() => {
      rows.get('p-1')!.status = PaymentRecordStatus.success;
      return Promise.resolve([]);
    });
    const error = await rejection(
      service.rejectBankTransfer('p-1', 'Reçu illisible', admin),
    );
    expect(error.errorCode).toBe(TRANSFER_ERROR.TRANSFER_ALREADY_PROCESSED);
    expect(rows.get('p-1')!.status).toBe(PaymentRecordStatus.success);
    expect(audits).toHaveLength(0);
  });

  it('is admin-only', async () => {
    const { service } = setup();
    const error = await rejection(
      service.rejectBankTransfer('p-1', 'Reçu illisible', doctor),
    );
    expect(error.statusCode).toBe(403);
  });
});

describe('PaymentsService.withdrawBankTransfer', () => {
  it('the owning dentist withdraws: cancelled + stamped, receipt kept, journaled, order out of review, PaymentWithdrawn', async () => {
    const { service, rows, order, audits, events } = setup();
    const payment = await service.withdrawBankTransfer(
      'p-1',
      doctor,
      '  Mauvais fichier ',
    );
    expect(payment.status).toBe(PaymentRecordStatus.cancelled);
    expect(rows.get('p-1')).toMatchObject({
      status: PaymentRecordStatus.cancelled,
      cancelledById: 'u-doc',
      proofUrl: OLD_PROOF,
    });
    expect(removed).not.toHaveBeenCalled();
    expect(order.status).toBe(OrderStatus.payment_pending);
    expect(audits[0]).toMatchObject({
      action: ORDER_AUDIT_ACTION.PAYMENT_TRANSFER_WITHDRAWN,
      paymentId: 'p-1',
      metadata: { reason: 'Mauvais fichier', installmentNumber: 2 },
    });
    expect(emitted(events, NotificationEvents.PaymentWithdrawn)).toEqual([
      {
        kind: 'installment',
        subjectKey: 'installment:p-1',
        reason: 'withdrawn',
        orderId: 'o-1',
        orderCode: 'ORD-1',
        doctorId: 'u-doc',
        paymentId: 'p-1',
        quotationId: 'q-1',
        installmentNumber: 2,
        actorId: 'u-doc',
      },
    ]);
  });

  it('an admin may withdraw for the doctor', async () => {
    const { service } = setup();
    await expect(
      service.withdrawBankTransfer('p-1', admin),
    ).resolves.toMatchObject({
      status: PaymentRecordStatus.cancelled,
      cancelledById: 'u-admin',
    });
  });

  it('a repeat on the withdrawn row answers it (200), nothing journaled again', async () => {
    const { service, audits, events } = setup({
      payments: [transfer({ status: PaymentRecordStatus.cancelled })],
    });
    await expect(
      service.withdrawBankTransfer('p-1', doctor),
    ).resolves.toMatchObject({
      status: PaymentRecordStatus.cancelled,
    });
    expect(audits).toHaveLength(0);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it.each([PaymentRecordStatus.success, PaymentRecordStatus.rejected])(
    'a transfer already %s is a 409 TRANSFER_NOT_WITHDRAWABLE',
    async (status) => {
      const { service } = setup({ payments: [transfer({ status })] });
      const error = await rejection(
        service.withdrawBankTransfer('p-1', doctor),
      );
      expect(error.statusCode).toBe(409);
      expect(error.errorCode).toBe(TRANSFER_ERROR.TRANSFER_NOT_WITHDRAWABLE);
    },
  );

  it.each([otherDoctor, designer, technician])(
    '%p gets a 404 (never told the payment exists)',
    async (caller) => {
      const { service } = setup();
      const error = await rejection(
        service.withdrawBankTransfer('p-1', caller),
      );
      expect(error.statusCode).toBe(404);
    },
  );
});

describe('PaymentsService.markTransferReviewOpened', () => {
  it('the first opening stamps reviewOpenedAt / By / ByName and journals it; the event marks my rows read', async () => {
    const { service, rows, audits, events } = setup();
    const result = await service.markTransferReviewOpened('p-1', admin);
    expect(result.firstOpen).toBe(true);
    expect(result.reviewOpenedAt).toBeInstanceOf(Date);
    expect(rows.get('p-1')).toMatchObject({
      reviewOpenedById: 'u-admin',
      reviewOpenedByName: 'Admin One',
    });
    expect(audits).toEqual([
      expect.objectContaining({
        action: ORDER_AUDIT_ACTION.PAYMENT_REVIEW_OPENED,
        paymentId: 'p-1',
        metadata: {
          installmentNumber: 2,
          method: PaymentMethod.bank_transfer,
          amount: 1000,
          hasProof: true,
        },
      }),
    ]);
    expect(emitted(events, NotificationEvents.TransferReviewOpened)).toEqual([
      {
        kind: 'installment',
        subjectKey: 'installment:p-1',
        orderId: 'o-1',
        paymentId: 'p-1',
        adminId: 'u-admin',
        firstOpen: true,
        reviewOpenedAt: (result.reviewOpenedAt as Date).toISOString(),
      },
    ]);
  });

  it("a later opening stamps nothing but still marks this admin's rows read", async () => {
    const firstOpenedAt = new Date('2026-11-21T08:00:00.000Z');
    const { service, audits, events, tx } = setup({
      payments: [
        transfer({
          reviewOpenedAt: firstOpenedAt,
          reviewOpenedById: 'u-first',
        }),
      ],
    });
    const result = await service.markTransferReviewOpened('p-1', admin);
    expect(result).toEqual({
      paymentId: 'p-1',
      reviewOpenedAt: firstOpenedAt,
      firstOpen: false,
    });
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
    expect(audits).toHaveLength(0);
    expect(
      emitted(events, NotificationEvents.TransferReviewOpened)[0],
    ).toMatchObject({
      adminId: 'u-admin',
      firstOpen: false,
      reviewOpenedAt: firstOpenedAt.toISOString(),
    });
  });

  it('opening a processed transfer is allowed and stamps nothing', async () => {
    const { service, audits, tx } = setup({
      payments: [transfer({ status: PaymentRecordStatus.success })],
    });
    const result = await service.markTransferReviewOpened('p-1', admin);
    expect(result).toEqual({
      paymentId: 'p-1',
      reviewOpenedAt: null,
      firstOpen: false,
    });
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
    expect(audits).toHaveLength(0);
  });

  it('two admins racing: the guarded write stamps once', async () => {
    const { service, tx, rows, audits } = setup();
    const first = new Date('2026-11-21T08:00:00.000Z');
    tx.$queryRaw.mockImplementationOnce(() => {
      Object.assign(rows.get('p-1')!, {
        reviewOpenedAt: first,
        reviewOpenedById: 'u-first',
      });
      return Promise.resolve([]);
    });
    const result = await service.markTransferReviewOpened('p-1', admin);
    expect(result).toEqual({
      paymentId: 'p-1',
      reviewOpenedAt: first,
      firstOpen: false,
    });
    expect(audits).toHaveLength(0);
  });

  it('is admin-only, and a non-transfer is a 404', async () => {
    const { service } = setup({
      payments: [transfer({ paymentMethod: PaymentMethod.card })],
    });
    expect(
      (await rejection(service.markTransferReviewOpened('p-1', doctor)))
        .statusCode,
    ).toBe(403);
    expect(
      (await rejection(service.markTransferReviewOpened('p-1', admin)))
        .statusCode,
    ).toBe(404);
  });
});

describe('PaymentsService.confirmBankTransfer (receipt and idempotency rules)', () => {
  it('confirms and journals payment_confirmed after the settlement, in its transaction', async () => {
    const { service, audits, events, steps } = setup();
    const payment = await service.confirmBankTransfer('p-1', undefined, admin);
    expect(payment.status).toBe(PaymentRecordStatus.success);
    expect(steps.at(-1)).toBe('audit');
    expect(audits).toEqual([
      expect.objectContaining({
        action: ORDER_AUDIT_ACTION.PAYMENT_CONFIRMED,
        paymentId: 'p-1',
        actorId: 'u-admin',
        metadata: expect.objectContaining({
          hasProof: true,
          amount: 1000,
        }) as unknown,
      }),
    ]);
    expect(emitted(events, NotificationEvents.PaymentConfirmed)).toHaveLength(
      1,
    );
  });

  it('« Toutes les restantes »: confirming one of two declarations keeps the order in review; refusing the other then releases it', async () => {
    const { service, order, steps } = setup({
      payments: [transfer(), transfer({ id: 'p-3', installmentId: 'i-3' })],
    });

    await service.confirmBankTransfer('p-1', undefined, admin);

    // The quote is partially paid, but p-3 still awaits the admin.
    expect(order.status).toBe(OrderStatus.payment_review);
    // The order row is locked (FOR NO KEY UPDATE) after the installment.
    const locks = steps.filter((step) => step.startsWith('lock:'));
    expect(locks[0]).toBe('lock:QuoteInstallment');
    expect(locks).toContain('lock:DentalOrder');

    await service.rejectBankTransfer('p-3', 'Reçu illisible', admin);

    expect(order.status).toBe(OrderStatus.payment_pending);
  });

  it('confirming the only declaration of a partially paid quote moves the order to payment_pending', async () => {
    const { service, order } = setup();
    await service.confirmBankTransfer('p-1', undefined, admin);
    expect(order.status).toBe(OrderStatus.payment_pending);
  });

  it('a repeat on the confirmed transfer answers it (200), nothing settled or journaled again', async () => {
    const { service, audits, prisma } = setup({
      payments: [transfer({ status: PaymentRecordStatus.success })],
    });
    const payment = await service.confirmBankTransfer('p-1', undefined, admin);
    expect(payment.status).toBe(PaymentRecordStatus.success);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audits).toHaveLength(0);
  });

  it('a transfer without a receipt needs the override note (400), which is journaled', async () => {
    const noReceipt = { payments: [transfer({ proofUrl: null })] };
    const refused = setup(noReceipt);
    const error = await rejection(
      refused.service.confirmBankTransfer('p-1', undefined, admin),
    );
    expect(error.errorCode).toBe(TRANSFER_ERROR.PROOF_OVERRIDE_NOTE_REQUIRED);

    const { service, audits } = setup(noReceipt);
    await service.confirmBankTransfer('p-1', undefined, admin, {
      overrideNote: '  Relevé du 21/11 vérifié  ',
    });
    expect(audits[0]).toMatchObject({
      metadata: { overrideNote: 'Relevé du 21/11 vérifié', hasProof: false },
    });
  });

  it.each([PaymentRecordStatus.rejected, PaymentRecordStatus.cancelled])(
    'a transfer %s meanwhile is a 409 TRANSFER_ALREADY_PROCESSED',
    async (status) => {
      const { service } = setup({ payments: [transfer({ status })] });
      const error = await rejection(
        service.confirmBankTransfer('p-1', undefined, admin),
      );
      expect(error.statusCode).toBe(409);
      expect(error.errorCode).toBe(TRANSFER_ERROR.TRANSFER_ALREADY_PROCESSED);
    },
  );
});

describe('PaymentsService.readPaymentProof (authenticated stream)', () => {
  const file = {
    absolutePath: '/srv/uploads/orders/o-1/payment-proofs/old.pdf',
    contentType: 'application/pdf',
    size: 12,
    extension: 'pdf',
  };

  it.each([admin, doctor])('%p reads the receipt', async (caller) => {
    const { service } = setup();
    opened.mockResolvedValue(file);
    await expect(service.readPaymentProof('p-1', caller)).resolves.toEqual({
      receipt: file,
      downloadName: 'recu-ORD-1-echeance-2',
    });
    expect(opened).toHaveBeenCalledWith(OLD_PROOF);
  });

  it.each([otherDoctor, designer, technician])(
    '%p gets the same 404 PROOF_NOT_FOUND as a missing file',
    async (caller) => {
      const { service } = setup();
      opened.mockResolvedValue(file);
      const error = await rejection(service.readPaymentProof('p-1', caller));
      expect(error.statusCode).toBe(404);
      expect(error.errorCode).toBe(TRANSFER_ERROR.PROOF_NOT_FOUND);
    },
  );

  it('no receipt on the row, or none on disk: 404 PROOF_NOT_FOUND', async () => {
    const none = setup({ payments: [transfer({ proofUrl: null })] });
    expect(
      (await rejection(none.service.readPaymentProof('p-1', admin))).errorCode,
    ).toBe(TRANSFER_ERROR.PROOF_NOT_FOUND);

    const gone = setup();
    opened.mockResolvedValue(null);
    expect(
      (await rejection(gone.service.readPaymentProof('p-1', admin))).errorCode,
    ).toBe(TRANSFER_ERROR.PROOF_NOT_FOUND);
  });
});
