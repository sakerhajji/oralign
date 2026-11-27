import {
  BatchStatus,
  BatchUnlockSource,
  InstallmentStatus,
  PaymentMode,
  Prisma,
  QuotationPaymentStatus,
  QuotationStatus,
  UserRole,
} from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Caller } from '../../common/access/caller';
import type { OrderAccessPolicy } from '../../common/access/order-access.policy';
import { BATCH_UNLOCK_ERROR } from '../../common/exceptions/domain-error-codes';
import { NotificationEvents } from '../../notifications/events/notification-events';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PackService } from '../../packs/services/pack.service';
import type { LoyaltyService } from '../../loyalty/services/loyalty.service';
import type { ProductionEventsService } from '../../production/production-events.service';
import type { CompanyBillingSettingsService } from './company-billing-settings.service';
import type { QuotationPdfService } from './quotation-pdf.service';

// The unlock writer has its own spec (production/batch-unlock.spec.ts):
// here, the route's checks, its lock order and what it emits.
jest.mock('../../production/batch-unlock', () => ({
  unlockStepBatch: jest.fn(),
}));
// The PDF renderer pulls in puppeteer (ESM-only).
jest.mock('./quotation-pdf.service', () => ({
  QuotationPdfService: class QuotationPdfService {},
}));

import { unlockStepBatch } from '../../production/batch-unlock';
import {
  PAYMENT_PLAN_ERROR,
  QuotationPaymentPlanService,
} from './quotation-payment-plan.service';

const unlock = jest.mocked(unlockStepBatch);

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const superAdmin: Caller = { userId: 'u-super', role: UserRole.super_admin };
const dentist: Caller = { userId: 'u-doc', role: UserRole.dentist };
const technician: Caller = { userId: 'u-tech', role: UserRole.technician };

const REASON = '  Accord direction : patient en voyage  ';
const D = (value: string) => new Prisma.Decimal(value);

function world(
  options: {
    target?: Record<string, unknown> | null;
    batchStatus?: BatchStatus;
    released?: boolean;
    /** The batch re-read under the locks; default: locked, on a sent quote. */
    live?: Record<string, unknown> | null;
  } = {},
) {
  const order: string[] = [];
  const target =
    options.target === undefined
      ? {
          id: 'b-2',
          quotationId: 'q-1',
          installmentId: 'i-2',
          quotation: {
            orderId: 'o-1',
            deletedAt: null,
            order: { deletedAt: null },
          },
        }
      : options.target;
  const live =
    options.live === undefined
      ? {
          quotationId: 'q-1',
          status: BatchStatus.locked,
          quotation: { status: QuotationStatus.sent, deletedAt: null },
        }
      : options.live;
  const stored = {
    id: 'b-2',
    quotationId: 'q-1',
    installmentId: 'i-2',
    batchNumber: 2,
    fromStep: 5,
    toStep: 7,
    status: options.batchStatus ?? BatchStatus.unlocked,
    unlockSource: BatchUnlockSource.manual,
    unlockReason: 'Accord direction : patient en voyage',
  };
  const tx = {
    $queryRaw: jest.fn((strings: TemplateStringsArray) => {
      order.push(strings.join('?'));
      return Promise.resolve([]);
    }),
    quoteStepBatch: {
      // First read (before the locks) names the installment; the second
      // re-reads the batch under them.
      findUnique: jest.fn((args: { select: Record<string, unknown> }) =>
        Promise.resolve('installmentId' in args.select ? target : live),
      ),
      findUniqueOrThrow: jest.fn().mockResolvedValue(stored),
    },
    dentalOrder: {
      findUnique: jest.fn().mockResolvedValue({
        orderCode: 'ORD-7',
        doctorId: 'u-doc',
        doctor: { fullName: 'Dr Salma' },
        patient: { fullName: 'Ines' },
      }),
    },
  };
  unlock.mockReset();
  unlock.mockImplementation(() => {
    order.push('unlockStepBatch');
    return Promise.resolve(
      options.released === false
        ? null
        : {
            id: 'b-2',
            quotationId: 'q-1',
            installmentId: 'i-2',
            orderId: 'o-1',
            batchNumber: 2,
            fromStep: 5,
            toStep: 7,
            installmentNumber: 2,
            source: BatchUnlockSource.manual,
            unlockedAt: new Date('2026-11-27T10:00:00.000Z'),
          },
    );
  });
  const prisma = {
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const events = { emit: jest.fn() };
  const service = new QuotationPaymentPlanService(
    prisma as unknown as PrismaService,
    {} as OrderAccessPolicy,
    {} as PackService,
    {} as LoyaltyService,
    {} as ProductionEventsService,
    events as unknown as EventEmitter2,
    {} as CompanyBillingSettingsService,
    {} as QuotationPdfService,
  );
  return { service, tx, prisma, events, order, stored };
}

async function refusal(
  call: Promise<unknown>,
): Promise<{ statusCode?: number; errorCode?: string }> {
  try {
    await call;
  } catch (error) {
    return error as { statusCode?: number; errorCode?: string };
  }
  throw new Error('expected a refusal');
}

describe('QuotationPaymentPlanService.unlockBatch (manual unlock, spec §3)', () => {
  it('locks the installment, then the order, then releases through the one writer with the trimmed reason', async () => {
    const { service, tx, order, stored } = world();

    const row = await service.unlockBatch('q-1', 'b-2', REASON, admin);

    expect(row).toBe(stored);
    expect(order).toEqual([
      expect.stringContaining('"QuoteInstallment"'),
      expect.stringContaining('"DentalOrder"'),
      'unlockStepBatch',
    ]);
    // The installment is the BATCH's own: never one the client names.
    expect(tx.$queryRaw.mock.calls[0]).toContain('i-2');
    expect(unlock).toHaveBeenCalledWith(tx, {
      batchId: 'b-2',
      source: BatchUnlockSource.manual,
      actor: admin,
      reason: 'Accord direction : patient en voyage',
    });
  });

  it('emits BatchUnlocked with source manual after the commit (the admins’ item; never the doctor)', async () => {
    const { service, prisma, events } = world();

    await service.unlockBatch('q-1', 'b-2', REASON, superAdmin);

    expect(events.emit).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(
      NotificationEvents.BatchUnlocked,
      expect.objectContaining({
        batchId: 'b-2',
        orderId: 'o-1',
        orderCode: 'ORD-7',
        fromStep: 5,
        toStep: 7,
        batchNumber: 2,
        source: BatchUnlockSource.manual,
        paymentId: null,
        installmentNumber: 2,
        actorId: superAdmin.userId,
      }),
    );
    expect(prisma.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
      events.emit.mock.invocationCallOrder[0],
    );
  });

  it('a repeat on a batch already unlocked or delivered: 200 with the row, no event, no name lookup', async () => {
    const { service, tx, events, stored } = world({
      released: false,
      batchStatus: BatchStatus.delivered,
    });

    await expect(
      service.unlockBatch('q-1', 'b-2', REASON, admin),
    ).resolves.toBe(stored);
    expect(events.emit).not.toHaveBeenCalled();
    expect(tx.dentalOrder.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['blank', '   '],
    ['too short once trimmed', ' ok '],
    ['too long', 'x'.repeat(501)],
    ['not a string', 42],
  ])(
    '400 UNLOCK_REASON_REQUIRED for a %s reason, before any read or lock',
    async (_label, reason) => {
      const { service, prisma } = world();
      expect(
        await refusal(service.unlockBatch('q-1', 'b-2', reason, admin)),
      ).toMatchObject({
        statusCode: 400,
        errorCode: BATCH_UNLOCK_ERROR.UNLOCK_REASON_REQUIRED,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(unlock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['an unknown batch', null],
    [
      'a batch of another quotation',
      {
        id: 'b-2',
        quotationId: 'q-OTHER',
        installmentId: 'i-2',
        quotation: {
          orderId: 'o-9',
          deletedAt: null,
          order: { deletedAt: null },
        },
      },
    ],
    [
      'an archived quotation',
      {
        id: 'b-2',
        quotationId: 'q-1',
        installmentId: 'i-2',
        quotation: {
          orderId: 'o-1',
          deletedAt: new Date(),
          order: { deletedAt: null },
        },
      },
    ],
    [
      'an archived order',
      {
        id: 'b-2',
        quotationId: 'q-1',
        installmentId: 'i-2',
        quotation: {
          orderId: 'o-1',
          deletedAt: null,
          order: { deletedAt: new Date() },
        },
      },
    ],
  ])('404 BATCH_NOT_FOUND for %s, before any lock', async (_label, target) => {
    const { service, tx } = world({ target });
    expect(
      await refusal(service.unlockBatch('q-1', 'b-2', REASON, admin)),
    ).toMatchObject({
      statusCode: 404,
      errorCode: BATCH_UNLOCK_ERROR.BATCH_NOT_FOUND,
    });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(unlock).not.toHaveBeenCalled();
  });

  it.each([
    QuotationStatus.draft,
    QuotationStatus.rejected,
    QuotationStatus.canceled,
  ])(
    '409 BATCH_UNLOCK_QUOTE_NOT_LIVE on a %s quote (nothing could be paid on it): nothing released',
    async (status) => {
      const { service, events } = world({
        live: {
          quotationId: 'q-1',
          status: BatchStatus.locked,
          quotation: { status, deletedAt: null },
        },
      });
      expect(
        await refusal(service.unlockBatch('q-1', 'b-2', REASON, admin)),
      ).toMatchObject({
        statusCode: 409,
        errorCode: PAYMENT_PLAN_ERROR.QUOTE_NOT_UNLOCKABLE,
      });
      expect(unlock).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    },
  );

  it('an accepted quote unlocks; a batch already released answers 200 even once the quote was recalled', async () => {
    const accepted = world({
      live: {
        quotationId: 'q-1',
        status: BatchStatus.locked,
        quotation: { status: QuotationStatus.approved, deletedAt: null },
      },
    });
    await accepted.service.unlockBatch('q-1', 'b-2', REASON, admin);
    expect(unlock).toHaveBeenCalledTimes(1);

    const recalled = world({
      released: false,
      live: {
        quotationId: 'q-1',
        status: BatchStatus.unlocked,
        quotation: { status: QuotationStatus.draft, deletedAt: null },
      },
    });
    await expect(
      recalled.service.unlockBatch('q-1', 'b-2', REASON, admin),
    ).resolves.toBe(recalled.stored);
    expect(recalled.events.emit).not.toHaveBeenCalled();
  });

  it('404 BATCH_NOT_FOUND when a re-plan deleted the batch while the call waited for the locks (never a 500)', async () => {
    const { service, tx } = world({ live: null });
    expect(
      await refusal(service.unlockBatch('q-1', 'b-2', REASON, admin)),
    ).toMatchObject({
      statusCode: 404,
      errorCode: BATCH_UNLOCK_ERROR.BATCH_NOT_FOUND,
    });
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(unlock).not.toHaveBeenCalled();
    expect(tx.quoteStepBatch.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it.each([dentist, technician])(
    'refuses a $role (403) whatever the guards upstream said',
    async (caller) => {
      const { service, prisma } = world();
      expect(
        await refusal(service.unlockBatch('q-1', 'b-2', REASON, caller)),
      ).toMatchObject({ statusCode: 403 });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
});

describe('QuotationPaymentPlanService: a batch released by hand is never wiped', () => {
  const quote = {
    id: 'q-1',
    orderId: 'o-1',
    quotationNumber: 'DEV-000001',
    status: QuotationStatus.approved,
    deletedAt: null,
    packId: 'p-1',
    packName: 'Pack Confort',
    totalPrice: D('2000.000'),
    totalTtc: 2000,
    maxStepsPerArch: 40,
    isUnlimitedSteps: false,
    paymentStatus: QuotationPaymentStatus.pending,
    pdfFilePath: null,
    companySnapshot: null,
  };

  function planWorld(released: BatchStatus[]) {
    const installments = released.map((status, index) => ({
      id: `i-${index + 1}`,
      installmentNumber: index + 1,
      amount: D('1000.000'),
      status: InstallmentStatus.pending,
      stepBatch: {
        id: `b-${index + 1}`,
        batchNumber: index + 1,
        fromStep: index * 10 + 1,
        toStep: index * 10 + 10,
        status,
      },
      payments: [],
    }));
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(),
      quotation: {
        findUnique: jest.fn(({ include }: { include?: object }) =>
          Promise.resolve(
            include
              ? { ...quote, installments, order: { doctorId: 'u-doc' } }
              : quote,
          ),
        ),
        update: jest.fn(),
      },
      quoteInstallment: { deleteMany: jest.fn(), create: jest.fn() },
      quoteStepBatch: {
        deleteMany: jest.fn(),
        create: jest.fn(),
        findMany: jest
          .fn()
          .mockResolvedValue(
            installments
              .filter((row) => row.stepBatch.status !== BatchStatus.locked)
              .map((row) => ({ id: row.stepBatch.id })),
          ),
      },
      payment: { groupBy: jest.fn().mockResolvedValue([]) },
      user: { findUnique: jest.fn().mockResolvedValue({ fullName: 'Admin' }) },
    };
    db.$transaction.mockImplementation((run: (tx: typeof db) => unknown) =>
      run(db),
    );
    const service = new QuotationPaymentPlanService(
      db as unknown as PrismaService,
      {} as OrderAccessPolicy,
      {
        getActivePriceForQuote: jest.fn().mockResolvedValue({
          pack: {
            id: 'p-2',
            name: 'Pack Premium',
            maxStepsPerArch: 60,
            includedCorrections: 2,
            treatmentValidityMonths: 18,
            isUnlimitedSteps: false,
            isUnlimitedCorrections: false,
            isForOrthodontists: false,
          },
          price: { price: D('2380.000'), currency: 'TND' },
        }),
      } as unknown as PackService,
      {
        activeRewardFor: jest.fn().mockResolvedValue({
          discountPercent: 0,
          sourceYear: null,
          sourceQuarter: null,
        }),
      } as unknown as LoyaltyService,
      {} as ProductionEventsService,
      { emit: jest.fn() } as unknown as EventEmitter2,
      {
        getActive: jest.fn().mockResolvedValue({ defaultTvaRate: 19 }),
      } as unknown as CompanyBillingSettingsService,
      { refreshStoredPdf: jest.fn() } as unknown as QuotationPdfService,
    );
    return { service, db };
  }

  it('a re-plan is a 409 QUOTE_PLAN_BATCH_RELEASED while an open installment’s batch is unlocked; nothing deleted', async () => {
    const { service, db } = planWorld([
      BatchStatus.locked,
      BatchStatus.unlocked,
    ]);
    expect(
      await refusal(
        service.configurePaymentPlan(
          'q-1',
          {
            paymentMode: PaymentMode.installments,
            installments: [
              { amount: 1000, batch: { fromStep: 1, toStep: 10 } },
              { amount: 1000, batch: { fromStep: 11, toStep: 20 } },
            ],
          },
          admin,
        ),
      ),
    ).toMatchObject({
      statusCode: 409,
      errorCode: PAYMENT_PLAN_ERROR.RELEASED_BATCH_IN_PLAN,
    });
    expect(db.quoteStepBatch.deleteMany).not.toHaveBeenCalled();
    expect(db.quoteInstallment.deleteMany).not.toHaveBeenCalled();
  });

  it('a pack change is a 409 QUOTE_PLAN_BATCH_RELEASED once a batch was released by hand (no money moved)', async () => {
    const { service, db } = planWorld([BatchStatus.unlocked]);
    expect(
      await refusal(service.attachPack('q-1', { packId: 'p-2' }, admin)),
    ).toMatchObject({
      statusCode: 409,
      errorCode: PAYMENT_PLAN_ERROR.RELEASED_BATCH_IN_PLAN,
    });
    expect(db.quoteStepBatch.deleteMany).not.toHaveBeenCalled();
    expect(db.quotation.update).not.toHaveBeenCalled();
  });
});
