import {
  InstallmentStatus,
  PaymentMethod,
  PaymentRecordStatus,
  UserRole,
} from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Caller } from '../../common/access/caller';
import type { OrderAccessPolicy } from '../../common/access/order-access.policy';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PackService } from '../../packs/services/pack.service';
import type { LoyaltyService } from '../../loyalty/services/loyalty.service';
import type { ProductionEventsService } from '../../production/production-events.service';
import type { CompanyBillingSettingsService } from './company-billing-settings.service';
import type { QuotationPdfService } from './quotation-pdf.service';

// The PDF renderer pulls in puppeteer (ESM-only).
jest.mock('./quotation-pdf.service', () => ({
  QuotationPdfService: class QuotationPdfService {},
}));

import { QuotationPaymentPlanService } from './quotation-payment-plan.service';

const dentist: Caller = { userId: 'u-doc', role: UserRole.dentist };
const admin: Caller = { userId: 'u-admin', role: UserRole.admin };

interface PaymentFindManyArgs {
  where: { installmentId: { in: string[] }; paymentMethod: PaymentMethod };
  orderBy: unknown;
  select: Record<string, boolean>;
}

function world(options: { payments?: Array<Record<string, unknown>> } = {}) {
  const installments = [
    {
      id: 'i-1',
      installmentNumber: 1,
      status: InstallmentStatus.paid,
      dueDate: null,
    },
    {
      id: 'i-2',
      installmentNumber: 2,
      status: InstallmentStatus.pending,
      dueDate: new Date('2099-01-01T00:00:00.000Z'),
    },
    {
      id: 'i-3',
      installmentNumber: 3,
      status: InstallmentStatus.pending,
      dueDate: null,
    },
  ];
  // Newest first, as the query orders them: i-2 has a refused declaration
  // superseded by a newer one awaiting review; i-1 was confirmed.
  const payments = options.payments ?? [
    {
      id: 'p-new',
      installmentId: 'i-2',
      status: PaymentRecordStatus.awaiting_confirmation,
      declaredAt: new Date('2026-11-27T09:00:00.000Z'),
      reviewOpenedAt: new Date('2026-11-27T10:00:00.000Z'),
      rejectionReason: null,
      proofUrl: 'orders/o-1/payment-proofs/new.pdf',
    },
    {
      id: 'p-old',
      installmentId: 'i-2',
      status: PaymentRecordStatus.rejected,
      declaredAt: new Date('2026-11-26T09:00:00.000Z'),
      reviewOpenedAt: new Date('2026-11-26T10:00:00.000Z'),
      rejectionReason: 'Montant illisible',
      proofUrl: 'orders/o-1/payment-proofs/old.jpg',
    },
    {
      id: 'p-1',
      installmentId: 'i-1',
      status: PaymentRecordStatus.success,
      declaredAt: new Date('2026-11-20T09:00:00.000Z'),
      reviewOpenedAt: null,
      rejectionReason: null,
      proofUrl: null,
    },
  ];
  const prisma = {
    quotation: {
      findUnique: jest.fn().mockResolvedValue({
        deletedAt: null,
        order: { doctorId: 'u-doc', assignedDesignerId: null, deletedAt: null },
      }),
    },
    quoteInstallment: { findMany: jest.fn().mockResolvedValue(installments) },
    quoteStepBatch: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'b-2',
          batchNumber: 2,
          installmentId: 'i-2',
          unlockReason: 'Accord direction',
        },
      ]),
    },
    payment: {
      findMany: jest.fn((args: PaymentFindManyArgs) =>
        Promise.resolve(
          payments.filter((row) =>
            args.where.installmentId.in.includes(row.installmentId as string),
          ),
        ),
      ),
    },
  };
  const access = { assertCanRead: jest.fn() };
  const service = new QuotationPaymentPlanService(
    prisma as unknown as PrismaService,
    access as unknown as OrderAccessPolicy,
    {} as PackService,
    {} as LoyaltyService,
    {} as ProductionEventsService,
    { emit: jest.fn() } as unknown as EventEmitter2,
    {} as CompanyBillingSettingsService,
    {} as QuotationPdfService,
  );
  return { service, prisma, access };
}

describe('QuotationPaymentPlanService.getPlan: latestTransfer per installment (CONTRACT §2.1)', () => {
  it('reads every installment’s declarations in ONE bank-transfer query', async () => {
    const { service, prisma } = world();
    await service.getPlan('q-1', dentist);
    expect(prisma.payment.findMany).toHaveBeenCalledTimes(1);
    const [args] = prisma.payment.findMany.mock.calls[0];
    expect(args.where).toEqual({
      installmentId: { in: ['i-1', 'i-2', 'i-3'] },
      paymentMethod: PaymentMethod.bank_transfer,
    });
    expect(args.select.proofUrl).toBe(true);
  });

  it('attaches the LATEST declaration of each installment, null when it has none', async () => {
    const { service } = world();
    const { installments } = await service.getPlan('q-1', dentist);
    const byId = new Map(installments.map((row) => [row.id, row]));
    expect(byId.get('i-2')?.latestTransfer).toEqual({
      paymentId: 'p-new',
      status: PaymentRecordStatus.awaiting_confirmation,
      state: 'to_verify',
      declaredAt: new Date('2026-11-27T09:00:00.000Z'),
      reviewOpenedAt: new Date('2026-11-27T10:00:00.000Z'),
      rejectionReason: null,
      hasProof: true,
    });
    expect(byId.get('i-1')?.latestTransfer).toMatchObject({
      paymentId: 'p-1',
      state: 'paid',
      hasProof: false,
    });
    expect(byId.get('i-3')?.latestTransfer).toBeNull();
  });

  it('a refused declaration carries its reason for the doctor', async () => {
    const { service } = world({
      payments: [
        {
          id: 'p-old',
          installmentId: 'i-2',
          status: PaymentRecordStatus.rejected,
          declaredAt: new Date('2026-11-26T09:00:00.000Z'),
          reviewOpenedAt: null,
          rejectionReason: 'Montant illisible',
          proofUrl: 'orders/o-1/payment-proofs/old.jpg',
        },
      ],
    });
    const { installments } = await service.getPlan('q-1', dentist);
    expect(
      installments.find((row) => row.id === 'i-2')?.latestTransfer,
    ).toMatchObject({ state: 'refused', rejectionReason: 'Montant illisible' });
  });

  it('never serves a file path (hasProof only)', async () => {
    const { service } = world();
    const plan = await service.getPlan('q-1', admin);
    const body = JSON.stringify(plan);
    expect(body).not.toContain('payment-proofs');
    expect(body).not.toContain('proofUrl');
  });

  it('keeps the overdue derivation and the staff-only unlock reason', async () => {
    const { service } = world();
    const doctorView = await service.getPlan('q-1', dentist);
    expect(doctorView.batches[0].unlockReason).toBeNull();
    const adminView = await service.getPlan('q-1', admin);
    expect(adminView.batches[0].unlockReason).toBe('Accord direction');
    expect(doctorView.installments.map((row) => [row.id, row.status])).toEqual([
      ['i-1', InstallmentStatus.paid],
      ['i-2', InstallmentStatus.pending],
      ['i-3', InstallmentStatus.pending],
    ]);
  });

  it('checks read access before any plan read', async () => {
    const { service, prisma, access } = world();
    access.assertCanRead.mockImplementation(() => {
      throw new Error('forbidden');
    });
    await expect(service.getPlan('q-1', dentist)).rejects.toThrow('forbidden');
    expect(prisma.quoteInstallment.findMany).not.toHaveBeenCalled();
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
  });
});

describe('QuotationPaymentPlanService: one route, one half of the plan', () => {
  it('getBatches reads the batches only: no installments, no transfer query', async () => {
    const { service, prisma, access } = world();
    const batches = await service.getBatches('q-1', dentist);
    expect(access.assertCanRead).toHaveBeenCalledTimes(1);
    expect(prisma.quoteInstallment.findMany).not.toHaveBeenCalled();
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
    // The manual unlock reason stays staff-only.
    expect(batches[0].unlockReason).toBeNull();
    const staff = await service.getBatches('q-1', admin);
    expect(staff[0].unlockReason).toBe('Accord direction');
  });

  it('getInstallments reads the schedule with its transfers, never the batches', async () => {
    const { service, prisma } = world();
    const installments = await service.getInstallments('q-1', dentist);
    expect(prisma.quoteStepBatch.findMany).not.toHaveBeenCalled();
    expect(prisma.payment.findMany).toHaveBeenCalledTimes(1);
    expect(installments.map((row) => row.id)).toEqual(['i-1', 'i-2', 'i-3']);
    expect(installments[1].latestTransfer).toMatchObject({ hasProof: true });
  });

  it('both check read access first', async () => {
    const { service, prisma, access } = world();
    access.assertCanRead.mockImplementation(() => {
      throw new Error('forbidden');
    });
    await expect(service.getBatches('q-1', dentist)).rejects.toThrow(
      'forbidden',
    );
    await expect(service.getInstallments('q-1', dentist)).rejects.toThrow(
      'forbidden',
    );
    expect(prisma.quoteStepBatch.findMany).not.toHaveBeenCalled();
    expect(prisma.quoteInstallment.findMany).not.toHaveBeenCalled();
  });
});
