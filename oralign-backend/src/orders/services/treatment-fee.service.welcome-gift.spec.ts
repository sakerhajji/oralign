import {
  OrderType,
  PaymentMethod,
  PaymentRecordStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../prisma/prisma.service';
import type { Caller } from '../../common/access/caller';
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
// The receipt checks and storage have their own spec (receipt-file.spec):
// here a receipt is accepted and "written" without touching the disk.
jest.mock('../../payments/receipt-file', () => ({
  assertReceiptFile: jest
    .fn()
    .mockResolvedValue({ kind: 'pdf', ext: 'pdf', mime: 'application/pdf' }),
  writeReceiptFile: jest
    .fn()
    .mockResolvedValue('/uploads/orders/o-1/payment-proofs/r.pdf'),
  removeReceiptFile: jest.fn().mockResolvedValue(undefined),
  openReceipt: jest.fn(),
}));

/** A receipt as multer hands it over (its checks are mocked above). */
const receipt = { buffer: Buffer.from('%PDF-1.4 receipt'), size: 16 };
/** An admin declaring for the doctor without a receipt gives a note. */
const NOTE = 'Virement reçu, confirmé par la banque';

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const doctor: Caller = { userId: 'u-doc', role: UserRole.dentist };

const order = (over: Record<string, unknown> = {}) => ({
  id: 'o-1',
  orderCode: 'ORD-1',
  doctorId: 'u-doc',
  treatmentFeePaidAt: null,
  treatmentFeePaymentMethod: null,
  treatmentFeePaymentStatus: null,
  treatmentFeeAmount: null,
  cbctFeeAmount: new Prisma.Decimal('50.000'),
  welcomeGiftAppliedAt: null,
  orderType: OrderType.initial,
  doctor: { fullName: 'Dr Test' },
  patient: { fullName: 'Patient' },
  ...over,
});
const gifted = () => order({ welcomeGiftAppliedAt: new Date('2026-11-04') });

function makeService(current: ReturnType<typeof order>) {
  const update = jest.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...current, ...args.data }),
  );
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    dentalOrder: {
      update,
      findUnique: jest.fn().mockResolvedValue({ treatmentFeePaidAt: null }),
    },
    payment: { findFirst: jest.fn().mockResolvedValue(null) },
    orderAuditLog: { create: jest.fn() },
  };
  const prisma = {
    companyBillingSettings: {
      findFirst: jest.fn().mockResolvedValue({
        defaultTreatmentFee: new Prisma.Decimal('300.000'),
        bankDetails: { rib: '123', bankName: 'Bank' },
      }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ fullName: 'Admin One' }),
    },
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const orders = {
    ensureCanCreateOrModify: jest.fn(),
    findAccessibleOrder: jest.fn().mockResolvedValue(current),
  };
  const service = new TreatmentFeeService(
    prisma as unknown as PrismaService,
    orders as unknown as OrderService,
    { emit: jest.fn() } as unknown as EventEmitter2,
    {
      entry: jest.fn().mockResolvedValue({ action: 'x' }),
    } as unknown as OrderAuditService,
  );
  return { service, prisma, update };
}

const nothingDue = { statusCode: 400, errorCode: 'WELCOME_GIFT_NOTHING_DUE' };

describe('TreatmentFeeService — welcome-gift orders have nothing to pay', () => {
  it.each([
    ['cash recorded by an admin', PaymentMethod.cash, admin],
    [
      'a bank transfer an admin declares for the doctor',
      PaymentMethod.bank_transfer,
      admin,
    ],
  ])(
    'refuses %s (400 WELCOME_GIFT_NOTHING_DUE)',
    async (_l, method, caller) => {
      const { service, prisma } = makeService(gifted());

      await expect(
        service.payTreatmentFee('o-1', method, caller, undefined, NOTE),
      ).rejects.toMatchObject(nothingDue);
      // Refused before any amount is computed or anything is written.
      expect(prisma.companyBillingSettings.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('refuses a bank-transfer receipt upload', async () => {
    const { service, prisma } = makeService(gifted());

    await expect(
      service.uploadTreatmentFeeProof('o-1', receipt, doctor),
    ).rejects.toMatchObject(nothingDue);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps charging normal orders: live fee + the CBCT snapshot', async () => {
    const { service, update } = makeService(order());

    await service.payTreatmentFee('o-1', PaymentMethod.cash, admin);

    expect(update).toHaveBeenCalledTimes(1);
    const data = update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      treatmentFeePaymentMethod: PaymentMethod.cash,
      treatmentFeePaymentStatus: PaymentRecordStatus.success,
      treatmentFeeWithholdingRate: null,
      treatmentFeeWithholdingAmount: null,
    });
    expect(String(data.treatmentFeeAmount)).toBe('350');
  });
});

describe('TreatmentFeeService — supplemental requests carry no treatment fee', () => {
  const child = () => order({ orderType: OrderType.warranty });
  const initialOnly = {
    statusCode: 400,
    errorCode: 'TREATMENT_FEE_INITIAL_ONLY',
  };

  it.each([
    ['cash recorded by an admin', PaymentMethod.cash, admin],
    [
      'a bank transfer an admin declares for the doctor',
      PaymentMethod.bank_transfer,
      admin,
    ],
  ])('refuses %s', async (_l, method, caller) => {
    const { service, prisma } = makeService(child());

    await expect(
      service.payTreatmentFee('o-1', method, caller, undefined, NOTE),
    ).rejects.toMatchObject(initialOnly);
    expect(prisma.companyBillingSettings.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a bank-transfer receipt upload', async () => {
    const { service, prisma } = makeService(child());

    await expect(
      service.uploadTreatmentFeeProof('o-1', receipt, doctor),
    ).rejects.toMatchObject(initialOnly);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses an admin confirmation (mark paid)', async () => {
    const { service, prisma } = makeService(
      order({
        orderType: OrderType.replacement,
        treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation,
      }),
    );

    await expect(
      service.confirmTreatmentFeePayment('o-1', admin),
    ).rejects.toMatchObject(initialOnly);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
