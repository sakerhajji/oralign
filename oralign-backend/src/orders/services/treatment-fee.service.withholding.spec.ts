import {
  OrderType,
  PaymentMethod,
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../prisma/prisma.service';
import type { Caller } from '../../common/access/caller';
import { NotificationEvents } from '../../notifications/events/notification-events';
import type { OrderAuditService } from './order-audit.service';
import type { OrderService } from './order.service';
import { TreatmentFeeService } from './treatment-fee.service';

jest.mock('./order-storage', () => ({
  purgeStoredMedia: jest.fn(),
  removeFileFromDisk: jest.fn(),
  purgeOrderDirectory: jest.fn(),
}));
// The mapper needs every relation of a real row; identity is enough here.
jest.mock('./order.mapper', () => ({
  orderInclude: {},
  mapOrderToDto: (order: unknown) => order,
}));

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const doctor: Caller = { userId: 'u-doc', role: UserRole.dentist };
const d = (value: string) => new Prisma.Decimal(value);

const order = (over: Record<string, unknown> = {}) => ({
  id: 'o-1',
  orderCode: 'ORD-1',
  doctorId: 'u-doc',
  treatmentFeePaidAt: null,
  treatmentFeePaymentMethod: null,
  treatmentFeePaymentStatus: null,
  treatmentFeeAmount: null,
  treatmentFeeWithholdingRate: null,
  treatmentFeeWithholdingAmount: null,
  treatmentFeeStampAmount: null,
  cbctFeeAmount: d('50.000'),
  welcomeGiftAppliedAt: null,
  orderType: OrderType.initial,
  doctor: { fullName: 'Dr Test' },
  patient: { fullName: 'Patient' },
  ...over,
});

function makeService(
  current: ReturnType<typeof order>,
  options: {
    withholdingRate?: string;
    /** settings.stampDuty: the 1 TND droit de timbre by default. */
    stampDuty?: string;
    cardInFlight?: boolean;
    paidWhenLocked?: boolean;
  } = {},
) {
  const update = jest.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...current, ...args.data }),
  );
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    dentalOrder: {
      update,
      findUnique: jest.fn().mockResolvedValue({
        treatmentFeePaidAt: options.paidWhenLocked ? new Date() : null,
        treatmentFeePaymentStatus: current.treatmentFeePaymentStatus,
      }),
    },
    payment: {
      findFirst: jest
        .fn()
        .mockResolvedValue(options.cardInFlight ? { id: 'p-card' } : null),
    },
    orderAuditLog: { create: jest.fn() },
  };
  const prisma = {
    companyBillingSettings: {
      findFirst: jest.fn().mockResolvedValue({
        defaultTreatmentFee: d('300.000'),
        withholdingRate: d(options.withholdingRate ?? '1'),
        stampDuty: d(options.stampDuty ?? '1'),
        bankDetails: { rib: '123', bankName: 'Bank' },
      }),
    },
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const orders = {
    ensureCanCreateOrModify: jest.fn(),
    findAccessibleOrder: jest.fn().mockResolvedValue(current),
  };
  const events = { emit: jest.fn() };
  const audit = { entry: jest.fn().mockResolvedValue({ action: 'x' }) };
  const service = new TreatmentFeeService(
    prisma as unknown as PrismaService,
    orders as unknown as OrderService,
    events as unknown as EventEmitter2,
    audit as unknown as OrderAuditService,
  );
  return { service, prisma, tx, update, events, audit };
}

const written = (update: jest.Mock) =>
  (update.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;
const money = (value: unknown) => (value as Prisma.Decimal).toFixed(3);
/** The metadata argument of the (first) order audit entry. */
const auditMetadata = (audit: { entry: jest.Mock }) =>
  (audit.entry.mock.calls[0] as unknown[])[3];

describe('TreatmentFeeService — the stamp and the retenue à la source', () => {
  it('cash with the retenue: 300 + 50 CBCT + 1 stamp - 3.500 = 347.500 received, retenue and stamp beside it', async () => {
    const { service, update, events, audit } = makeService(order());

    await service.payTreatmentFee('o-1', PaymentMethod.cash, admin, true);

    const data = written(update);
    // Due 300 + 50 = 350; stamp 1 on top; 1 % of 350 (stamp excluded) =
    // 3.500; cash 351 - 3.500 = 347.500.
    expect(money(data.treatmentFeeAmount)).toBe('347.500');
    expect(money(data.treatmentFeeWithholdingAmount)).toBe('3.500');
    expect(money(data.treatmentFeeStampAmount)).toBe('1.000');
    expect(String(data.treatmentFeeWithholdingRate)).toBe('1');
    expect(data.treatmentFeePaymentStatus).toBe(PaymentRecordStatus.success);
    expect(data.treatmentFeePaidAt).toBeInstanceOf(Date);
    expect(events.emit).toHaveBeenCalledWith(
      NotificationEvents.TreatmentFeePaid,
      expect.objectContaining({
        amount: '347.5',
        withholdingAmount: '3.5',
        stampAmount: '1',
        method: PaymentMethod.cash,
      }),
    );
    // The audit trail keeps the fee due and the split.
    expect(auditMetadata(audit)).toEqual({
      method: PaymentMethod.cash,
      amount: 350,
      stampAmount: 1,
      withholdingRate: 1,
      withholdingAmount: 3.5,
      cashAmount: 347.5,
    });
  });

  it('an admin records a cheque: paid at once, method cheque, the fee + the stamp', async () => {
    const { service, update, audit } = makeService(order());
    await service.payTreatmentFee('o-1', PaymentMethod.cheque, admin);
    const data = written(update);
    expect(data.treatmentFeePaymentMethod).toBe(PaymentMethod.cheque);
    expect(data.treatmentFeePaymentStatus).toBe(PaymentRecordStatus.success);
    expect(money(data.treatmentFeeAmount)).toBe('351.000');
    expect(money(data.treatmentFeeStampAmount)).toBe('1.000');
    expect(data.treatmentFeeWithholdingRate).toBeNull();
    expect(data.treatmentFeeWithholdingAmount).toBeNull();
    expect(auditMetadata(audit)).toEqual({
      method: PaymentMethod.cheque,
      amount: 350,
      stampAmount: 1,
      cashAmount: 351,
    });
  });

  it('no stamp configured: the fee alone, stamp 0, the audit as before', async () => {
    const { service, update, audit } = makeService(order(), { stampDuty: '0' });
    await service.payTreatmentFee('o-1', PaymentMethod.cash, admin);
    const data = written(update);
    expect(money(data.treatmentFeeAmount)).toBe('350.000');
    expect(money(data.treatmentFeeStampAmount)).toBe('0.000');
    expect(auditMetadata(audit)).toEqual({
      method: PaymentMethod.cash,
      amount: 350,
    });
  });

  it.each([PaymentMethod.cash, PaymentMethod.cheque])(
    'a dentist can never mark the fee paid by %s (403), before anything is read',
    async (method) => {
      const { service, prisma } = makeService(order());
      await expect(
        service.payTreatmentFee('o-1', method, doctor),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(prisma.companyBillingSettings.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('refuses the retenue when the company rate is 0 (400 WITHHOLDING_DISABLED)', async () => {
    const { service, prisma } = makeService(order(), { withholdingRate: '0' });
    await expect(
      service.payTreatmentFee('o-1', PaymentMethod.cash, admin, true),
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'WITHHOLDING_DISABLED',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('a transfer proof stores the declared retenue; confirming keeps it', async () => {
    const { service, update } = makeService(order());
    await service.uploadTreatmentFeeProof(
      'o-1',
      '/uploads/treatment-fee-proofs/x.pdf',
      doctor,
      true,
    );
    const data = written(update);
    expect(data.treatmentFeePaymentStatus).toBe(
      PaymentRecordStatus.awaiting_confirmation,
    );
    expect(money(data.treatmentFeeAmount)).toBe('347.500');
    expect(money(data.treatmentFeeWithholdingAmount)).toBe('3.500');
    expect(money(data.treatmentFeeStampAmount)).toBe('1.000');

    const declared = order({
      treatmentFeePaymentMethod: PaymentMethod.bank_transfer,
      treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
      treatmentFeeAmount: d('347.500'),
      treatmentFeeWithholdingRate: d('1'),
      treatmentFeeWithholdingAmount: d('3.500'),
      treatmentFeeStampAmount: d('1.000'),
    });
    // The stamp setting changed since the declaration: confirming keeps
    // the declared figures all the same.
    const confirm = makeService(declared, { stampDuty: '2' });
    await confirm.service.confirmTreatmentFeePayment('o-1', admin);
    const confirmed = written(confirm.update);
    // Only the status and the date change: the amounts stay as declared.
    expect(Object.keys(confirmed).sort()).toEqual([
      'treatmentFeePaidAt',
      'treatmentFeePaymentStatus',
    ]);
    expect(confirm.events.emit).toHaveBeenCalledWith(
      NotificationEvents.TreatmentFeeConfirmed,
      expect.objectContaining({
        amount: '347.5',
        withholdingAmount: '3.5',
        stampAmount: '1',
      }),
    );
    // The fee due: 347.500 + 3.500 - 1.
    expect(auditMetadata(confirm.audit)).toMatchObject({ amount: 350 });
  });

  it('confirming a transfer declared before the stamp (null) keeps cash + retenue as the due', async () => {
    const declared = order({
      treatmentFeePaymentMethod: PaymentMethod.bank_transfer,
      treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
      treatmentFeeAmount: d('346.500'),
      treatmentFeeWithholdingRate: d('1'),
      treatmentFeeWithholdingAmount: d('3.500'),
      treatmentFeeStampAmount: null,
    });
    const confirm = makeService(declared);
    await confirm.service.confirmTreatmentFeePayment('o-1', admin);
    expect(auditMetadata(confirm.audit)).toMatchObject({ amount: 350 });
    expect(confirm.events.emit).toHaveBeenCalledWith(
      NotificationEvents.TreatmentFeeConfirmed,
      expect.objectContaining({ amount: '346.5', stampAmount: '0' }),
    );
  });

  it('a re-declaration without the retenue clears the earlier one', async () => {
    const { service, update } = makeService(
      order({
        treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
        treatmentFeeWithholdingRate: d('1'),
        treatmentFeeWithholdingAmount: d('3.500'),
      }),
    );
    await service.uploadTreatmentFeeProof(
      'o-1',
      '/uploads/x.pdf',
      doctor,
      false,
    );
    const data = written(update);
    expect(money(data.treatmentFeeAmount)).toBe('351.000');
    expect(money(data.treatmentFeeStampAmount)).toBe('1.000');
    expect(data.treatmentFeeWithholdingRate).toBeNull();
    expect(data.treatmentFeeWithholdingAmount).toBeNull();
  });

  it('a bank-transfer declaration through /pay stores the same charge', async () => {
    const { service, update, events } = makeService(order());
    await service.payTreatmentFee(
      'o-1',
      PaymentMethod.bank_transfer,
      doctor,
      true,
    );
    const data = written(update);
    expect(data.treatmentFeePaymentStatus).toBe(
      PaymentRecordStatus.awaiting_confirmation,
    );
    expect(data.treatmentFeePaidAt).toBeUndefined();
    expect(money(data.treatmentFeeAmount)).toBe('347.500');
    expect(money(data.treatmentFeeWithholdingAmount)).toBe('3.500');
    expect(money(data.treatmentFeeStampAmount)).toBe('1.000');
    expect(events.emit).toHaveBeenCalledWith(
      NotificationEvents.TreatmentFeeDeclared,
      expect.objectContaining({ amount: '347.5', stampAmount: '1' }),
    );
  });
});

describe('TreatmentFeeService — one payment at a time', () => {
  it.each([
    ['cash recorded by an admin', () => [PaymentMethod.cash, admin] as const],
    [
      'a cheque recorded by an admin',
      () => [PaymentMethod.cheque, admin] as const,
    ],
    [
      'a transfer declared by the doctor',
      () => [PaymentMethod.bank_transfer, doctor] as const,
    ],
  ])('refuses %s while a card payment is in flight (409)', async (_l, args) => {
    const [method, caller] = args();
    const { service, tx, update } = makeService(order(), {
      cardInFlight: true,
    });
    await expect(
      service.payTreatmentFee('o-1', method, caller),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'PAYMENT_ATTEMPT_IN_PROGRESS',
    });
    // Checked under the order lock, against the fee's open card attempts.
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.payment.findFirst).toHaveBeenCalledWith({
      where: {
        orderId: 'o-1',
        purpose: PaymentPurpose.treatment_fee,
        paymentMethod: PaymentMethod.card,
        status: {
          in: [
            PaymentRecordStatus.pending,
            PaymentRecordStatus.unknown,
            PaymentRecordStatus.awaiting_confirmation,
          ],
        },
      },
      select: { id: true },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a transfer proof while a card payment is in flight (409)', async () => {
    const { service, update } = makeService(order(), { cardInFlight: true });
    await expect(
      service.uploadTreatmentFeeProof('o-1', '/uploads/x.pdf', doctor),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(update).not.toHaveBeenCalled();
  });

  it('a fee paid meanwhile (seen under the lock) is not paid twice', async () => {
    const { service, update, events } = makeService(order(), {
      paidWhenLocked: true,
    });
    await service.payTreatmentFee('o-1', PaymentMethod.cash, admin);
    expect(update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });
});
