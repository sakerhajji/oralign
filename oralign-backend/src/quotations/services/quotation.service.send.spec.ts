import {
  DevisLanguage,
  OrderStatus,
  Prisma,
  type Quotation,
  QuotationStatus,
  UserRole,
} from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrderAccessPolicy } from '../../common/access/order-access.policy';
import type { Caller } from '../../common/access/caller';
import type { CompanyBillingSettingsService } from './company-billing-settings.service';
import type { QuotationPaymentPlanService } from './quotation-payment-plan.service';
import type { QuotationPdfService } from './quotation-pdf.service';

// The PDF renderer pulls in puppeteer (ESM-only); refreshStoredPdf is stubbed.
jest.mock('./quotation-pdf.service', () => ({
  QuotationPdfService: class QuotationPdfService {},
}));

import { QuotationService } from './quotation.service';

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const D = (v: string) => new Prisma.Decimal(v);

function draft(overrides: Partial<Quotation> = {}): Quotation {
  return {
    id: 'q-1',
    orderId: 'o-1',
    quotationNumber: null,
    language: DevisLanguage.fr,
    status: QuotationStatus.draft,
    currency: 'TND',
    tvaRate: 19,
    packId: 'p-1',
    // Frozen by an older draft PDF: send() must not keep it.
    companySnapshot: { companyName: 'Old name' },
    clinicSnapshot: { doctorFullName: 'Dr Old', clinicName: 'Old practice' },
    createdAt: new Date('2026-11-20T10:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  } as Quotation;
}

const SETTINGS = {
  companyName: 'Oralign',
  companyLogoPath: null,
  stampDuty: D('1.000'),
  withholdingEnabled: true,
  withholdingRate: D('1.00'),
  withholdingThreshold: D('1000.000'),
  legalTextTranslations: null,
  footerTextTranslations: null,
  bankDetails: null,
};

const ORDER = {
  doctor: {
    id: 'doc-1',
    fullName: 'Dr Amel Ben Salah',
    email: 'amel@mail.tn',
    phone: '+21620000000',
    dentistProfile: {
      clinicName: 'Cabinet Les Pins',
      clinicAddress: null,
      city: 'Tunis',
      country: 'TN',
      clinicPhone: '+21671000000',
      clinicEmail: null,
      taxId: null,
      registrationNumber: 'CNOMDT-42',
      logoUrl: null,
      deletedAt: null,
    },
  },
  patient: { fullName: 'Sami' },
};

function world(quote: Quotation = draft(), sentCount = 1) {
  const db = {
    quotation: {
      findUnique: jest.fn().mockResolvedValue(quote),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        ...quote,
        status: QuotationStatus.sent,
      }),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Partial<Quotation> }) => ({
          ...quote,
          ...data,
        })),
      updateMany: jest
        .fn()
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValue({ count: sentCount }),
    },
    quoteInstallment: { count: jest.fn().mockResolvedValue(2) },
    quoteStepBatch: { findMany: jest.fn().mockResolvedValue([]) },
    payment: { groupBy: jest.fn().mockResolvedValue([]) },
    dentalOrder: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(ORDER),
      findUnique: jest.fn().mockResolvedValue({
        doctorId: 'doc-1',
        orderCode: 'ORD-1',
        doctor: { fullName: 'Dr Amel Ben Salah' },
        patient: { fullName: 'Sami' },
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((run: (tx: typeof db) => unknown) =>
    run(db),
  );
  const settings = {
    requireActive: jest.fn().mockResolvedValue(SETTINGS),
    allocateQuotationNumber: jest.fn().mockResolvedValue('DEV-000042'),
  };
  const pdf = {
    refreshStoredPdf: jest.fn((q: Quotation) => Promise.resolve(q)),
  };
  const events = { emit: jest.fn() };
  const service = new QuotationService(
    db as unknown as PrismaService,
    {
      requireReadable: jest
        .fn()
        .mockResolvedValue({ id: 'o-1', doctorId: 'doc-1' }),
    } as unknown as OrderAccessPolicy,
    settings as unknown as CompanyBillingSettingsService,
    {} as QuotationPaymentPlanService,
    pdf as unknown as QuotationPdfService,
    events as unknown as EventEmitter2,
  );
  return { service, db, settings, pdf, events };
}

type UpdateManyCall = {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
};
const updateManyCalls = (db: ReturnType<typeof world>['db']) =>
  (db.quotation.updateMany.mock.calls as UpdateManyCall[][]).map(([c]) => c);

describe('QuotationService.send — snapshots rebuilt on draft -> sent (spec §6)', () => {
  it('numbers the quote, then REBUILDS both snapshots from the current data', async () => {
    const { service, db } = world();
    await service.send('q-1', admin);

    const [numbering, sending] = updateManyCalls(db);
    // The number first, guarded on null (a concurrent draft render agrees).
    expect(numbering).toEqual({
      where: { id: 'q-1', quotationNumber: null },
      data: { quotationNumber: 'DEV-000042' },
    });
    // Then the transition, guarded on draft, with fresh snapshots.
    expect(sending.where).toEqual({ id: 'q-1', status: QuotationStatus.draft });
    expect(sending.data).toMatchObject({
      status: QuotationStatus.sent,
      companySnapshot: expect.objectContaining({
        companyName: 'Oralign',
        stampDuty: 1,
        withholdingEnabled: true,
        withholdingRate: 1,
        withholdingThreshold: 1000,
      }) as unknown,
      clinicSnapshot: expect.objectContaining({
        doctorFullName: 'Dr Amel Ben Salah',
        clinicName: 'Cabinet Les Pins',
        contactPhone: '+21671000000',
        contactEmail: 'amel@mail.tn',
      }) as unknown,
    });
    expect(sending.data.clinicSnapshot).not.toHaveProperty(
      'registrationNumber',
    );
    expect(db.dentalOrder.update).toHaveBeenCalledWith({
      where: { id: 'o-1' },
      data: { status: OrderStatus.quotation_sent },
    });
  });

  it('a numbered draft keeps its number', async () => {
    const { service, db, settings } = world(
      draft({ quotationNumber: 'DEV-000007' }),
    );
    await service.send('q-1', admin);
    expect(settings.allocateQuotationNumber).not.toHaveBeenCalled();
    expect(updateManyCalls(db)).toHaveLength(1);
  });

  it('a second send that lost the race is refused, nothing else written', async () => {
    const { service, db, pdf } = world(
      draft({ quotationNumber: 'DEV-000007' }),
      0,
    );
    db.quotation.updateMany.mockReset().mockResolvedValue({ count: 0 });
    await expect(service.send('q-1', admin)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(db.dentalOrder.update).not.toHaveBeenCalled();
    expect(pdf.refreshStoredPdf).not.toHaveBeenCalled();
  });

  it('only a draft can be sent', async () => {
    const { service } = world(draft({ status: QuotationStatus.sent }));
    await expect(service.send('q-1', admin)).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe('QuotationService.ensureSnapshotAndNumber — a draft PDF freezes nothing', () => {
  it('a draft only gets its number', async () => {
    const { service, db } = world(
      draft({ companySnapshot: null, clinicSnapshot: null }),
    );
    const out = await service.ensureSnapshotAndNumber(
      draft({ companySnapshot: null, clinicSnapshot: null }),
    );
    expect(out.quotationNumber).toBe('DEV-000042');
    expect(out.companySnapshot).toBeNull();
    expect(db.quotation.update).not.toHaveBeenCalled();
    expect(db.dentalOrder.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('a legacy quote out of draft without snapshots gets them once', async () => {
    const sent = draft({
      status: QuotationStatus.sent,
      quotationNumber: 'DEV-000003',
      companySnapshot: null,
      clinicSnapshot: null,
    });
    const { service, db } = world(sent);
    await service.ensureSnapshotAndNumber(sent);
    const [[call]] = db.quotation.update.mock.calls as [
      [{ data: Record<string, unknown> }],
    ];
    expect(call.data).toMatchObject({
      quotationNumber: 'DEV-000003',
      clinicSnapshot: expect.objectContaining({
        doctorFullName: 'Dr Amel Ben Salah',
      }) as unknown,
    });
  });

  it('a quote out of draft with its snapshots is left as it is', async () => {
    const sent = draft({
      status: QuotationStatus.sent,
      quotationNumber: 'DEV-000003',
    });
    const { service, db } = world(sent);
    await expect(service.ensureSnapshotAndNumber(sent)).resolves.toBe(sent);
    expect(db.quotation.update).not.toHaveBeenCalled();
  });
});
