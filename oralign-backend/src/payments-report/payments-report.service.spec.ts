import {
  PaymentMethod,
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { Caller } from '../common/access/caller';
import type { PdfRendererService } from '../common/pdf/pdf-renderer.service';

// puppeteer-core is ESM-only: the renderer is replaced by a stub below.
jest.mock('../common/pdf/pdf-renderer.service', () => ({
  PdfRendererService: class PdfRendererService {},
}));
import { PaymentsSummaryService } from '../payments/services/payments-summary.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { CompanyBillingSettingsService } from '../quotations/services/company-billing-settings.service';
import {
  PaymentsReportKind,
  PaymentsReportSort,
  type PaymentsReportRequestDto,
} from './dto/payments-report.dto';
import {
  PaymentsReportService,
  REPORT_MAX_ROWS,
  resolveReportPeriod,
} from './payments-report.service';

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const doctor: Caller = { userId: 'u-doc', role: UserRole.dentist };
const d = (value: string) => new Prisma.Decimal(value);

/** 2026-11-01 → 2026-11-06 in Tunis, as the UTC instants Prisma receives. */
const NOV_1_TO_6 = {
  gte: new Date('2026-10-31T23:00:00.000Z'),
  lt: new Date('2026-11-06T23:00:00.000Z'),
};

function installmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p-1',
    amount: d('850.5'),
    status: PaymentRecordStatus.success,
    paymentMethod: PaymentMethod.card,
    transactionId: 'GW-123',
    merchantOrderNumber: 'ORA-9',
    invoiceNumber: 'FAC-000010',
    paidAt: new Date('2026-11-05T10:00:00.000Z'),
    createdAt: new Date('2026-11-05T09:58:00.000Z'),
    order: {
      orderCode: 'ORD-1',
      doctor: { fullName: 'Dr Salma' },
      patient: { fullName: 'Ines Gharbi' },
    },
    installment: { installmentNumber: 2 },
    quotation: { packName: 'Pack Confort', _count: { installments: 3 } },
    ...overrides,
  };
}

function feeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'o-1',
    orderCode: 'ORD-2',
    treatmentFeeAmount: d('150'),
    treatmentFeePaymentMethod: PaymentMethod.card,
    treatmentFeePaymentStatus: PaymentRecordStatus.success,
    treatmentFeePaidAt: new Date('2026-11-04T08:00:00.000Z'),
    treatmentFeeInvoiceNumber: 'TF-000003',
    doctor: { fullName: 'Dr Salma' },
    patient: { fullName: 'Karim Haddad' },
    payments: [{ transactionId: null, merchantOrderNumber: 'ORA-TF-1' }],
    ...overrides,
  };
}

function setup(
  options: {
    installments?: unknown[];
    fees?: unknown[];
    counts?: { installments?: number; fees?: number };
    installmentGroups?: unknown[];
    feeGroups?: unknown[];
  } = {},
) {
  const prisma = {
    payment: {
      count: jest.fn().mockResolvedValue(options.counts?.installments ?? 1),
      findMany: jest
        .fn()
        .mockResolvedValue(options.installments ?? [installmentRow()]),
      groupBy: jest.fn().mockResolvedValue(options.installmentGroups ?? []),
    },
    dentalOrder: {
      count: jest.fn().mockResolvedValue(options.counts?.fees ?? 1),
      findMany: jest.fn().mockResolvedValue(options.fees ?? [feeRow()]),
      groupBy: jest.fn().mockResolvedValue(options.feeGroups ?? []),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'u-admin', fullName: 'Admin Oralign' },
        { id: 'u-doc', fullName: 'Dr Salma' },
        { id: 'd-picked', fullName: 'Dr Picked' },
      ]),
    },
  };
  const settings = {
    getActive: jest.fn().mockResolvedValue({
      companyName: 'ORALIGN by Aura Aligners',
      tradeName: null,
      legalForm: null,
      companyAddress: null,
      companyCity: 'Tunis',
      companyCountry: 'Tunisie',
      companyPhone: null,
      companyEmail: null,
      taxRegistrationNumber: null,
      registreDeCommerce: null,
      websiteDomain: null,
      companyLogoPath: null,
      defaultCurrency: 'TND',
    }),
  };
  const pdf = { render: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.7')) };
  const service = new PaymentsReportService(
    prisma as unknown as PrismaService,
    new PaymentsSummaryService(prisma as unknown as PrismaService),
    settings as unknown as CompanyBillingSettingsService,
    pdf as unknown as PdfRendererService,
  );
  return { service, prisma, pdf };
}

type Call = { where: Record<string, unknown> };
const firstWhere = (mock: jest.Mock) =>
  (mock.mock.calls as Call[][])[0][0].where;

const request = (
  overrides: Partial<PaymentsReportRequestDto> = {},
): PaymentsReportRequestDto => ({
  kind: PaymentsReportKind.consolidated,
  from: '2026-11-01',
  to: '2026-11-06',
  ...overrides,
});

describe('PaymentsReportService', () => {
  describe('scope', () => {
    it("a dentist's report covers their own orders, whatever doctorId they send", async () => {
      const { service, prisma } = setup();
      const model = await service.buildModel(
        request({
          treatmentFees: { doctorId: 'u-other' },
          installments: { doctorId: 'u-other' },
        }),
        doctor,
      );

      expect(firstWhere(prisma.dentalOrder.findMany)).toMatchObject({
        deletedAt: null,
        doctorId: 'u-doc',
      });
      expect(firstWhere(prisma.payment.findMany)).toMatchObject({
        order: { deletedAt: null, doctorId: 'u-doc' },
        purpose: PaymentPurpose.installment,
      });
      // The money too.
      expect(firstWhere(prisma.payment.groupBy)).toMatchObject({
        order: { deletedAt: null, doctorId: 'u-doc' },
      });
      expect(firstWhere(prisma.dentalOrder.groupBy)).toMatchObject({
        deletedAt: null,
        doctorId: 'u-doc',
      });
      expect(model.showPractitioner).toBe(false);
      expect(
        model.sections.every((s) => s.criteria.practitioner === null),
      ).toBe(true);
    });

    it("an admin's practitioner filter narrows the rows and prints the dentist's name", async () => {
      const { service, prisma } = setup();
      const model = await service.buildModel(
        request({
          kind: PaymentsReportKind.installment,
          installments: { doctorId: 'd-picked' },
        }),
        admin,
      );

      expect(firstWhere(prisma.payment.findMany)).toMatchObject({
        order: { deletedAt: null, doctorId: 'd-picked' },
      });
      expect(model.showPractitioner).toBe(true);
      expect(model.sections[0].criteria.practitioner).toBe('Dr Picked');
      expect(model.generatedBy).toBe('Admin Oralign');
    });

    it('an admin with no practitioner filter reads every live order', async () => {
      const { service, prisma } = setup();
      await service.buildModel(request(), admin);
      expect(firstWhere(prisma.payment.findMany)).toMatchObject({
        order: { deletedAt: null },
      });
      expect(firstWhere(prisma.dentalOrder.findMany)).not.toHaveProperty(
        'doctorId',
      );
    });
  });

  describe('kinds', () => {
    it('treatment fees only: no installment query at all', async () => {
      const { service, prisma } = setup();
      const model = await service.buildModel(
        request({ kind: PaymentsReportKind.treatmentFee }),
        admin,
      );
      expect(model.sections.map((s) => s.kind)).toEqual(['treatment_fee']);
      expect(prisma.payment.findMany).not.toHaveBeenCalled();
      expect(prisma.payment.groupBy).not.toHaveBeenCalled();
    });

    it('consolidated: fees first, then installments, as the desk tabs', async () => {
      const { service } = setup();
      const model = await service.buildModel(request(), admin);
      expect(model.sections.map((s) => s.kind)).toEqual([
        'treatment_fee',
        'installment',
      ]);
    });
  });

  describe('filters and period', () => {
    it("applies each tab's own filters to its section", async () => {
      const { service, prisma } = setup();
      await service.buildModel(
        request({
          treatmentFees: {
            search: 'Haddad',
            methods: [PaymentMethod.cash],
            statuses: [PaymentRecordStatus.success],
          },
          installments: {
            methods: [PaymentMethod.card],
            installmentMin: 2,
            installmentMax: 2,
          },
        }),
        admin,
      );

      const feeWhere = firstWhere(prisma.dentalOrder.findMany);
      expect(feeWhere).toMatchObject({
        treatmentFeePaymentMethod: { in: [PaymentMethod.cash] },
        treatmentFeePaymentStatus: { in: [PaymentRecordStatus.success] },
        treatmentFeePaidAt: NOV_1_TO_6,
      });
      expect(JSON.stringify(feeWhere.AND)).toContain('Haddad');

      const installmentWhere = firstWhere(prisma.payment.findMany);
      expect(installmentWhere).toMatchObject({
        paymentMethod: { in: [PaymentMethod.card] },
        installment: { installmentNumber: { gte: 2, lte: 2 } },
      });
      expect(installmentWhere.AND).toEqual([
        {
          OR: [{ paidAt: NOV_1_TO_6 }, { paidAt: null, createdAt: NOV_1_TO_6 }],
        },
      ]);
    });

    it('counts the money with the summary queries, narrowed by the same filters', async () => {
      const { service, prisma } = setup();
      await service.buildModel(
        request({ installments: { methods: [PaymentMethod.card] } }),
        admin,
      );
      const listWhere = firstWhere(prisma.payment.findMany);
      expect(firstWhere(prisma.payment.groupBy)).toEqual({
        purpose: PaymentPurpose.installment,
        status: PaymentRecordStatus.success,
        paidAt: NOV_1_TO_6,
        amount: { gt: 0 },
        order: { deletedAt: null },
        AND: [listWhere],
      });
      const feeListWhere = firstWhere(prisma.dentalOrder.findMany);
      expect(firstWhere(prisma.dentalOrder.groupBy)).toEqual({
        deletedAt: null,
        treatmentFeePaymentStatus: PaymentRecordStatus.success,
        treatmentFeePaidAt: NOV_1_TO_6,
        treatmentFeeAmount: { gt: 0 },
        AND: [feeListWhere],
      });
    });

    it('"all dates": no date filter on the rows, the money counted up to the end day', async () => {
      const { service, prisma } = setup();
      const model = await service.buildModel(
        request({ from: undefined, to: '2026-11-06', allDates: true }),
        admin,
      );
      expect(model.period).toEqual({
        from: null,
        to: '2026-11-06',
        allDates: true,
      });
      expect(firstWhere(prisma.dentalOrder.findMany)).not.toHaveProperty(
        'treatmentFeePaidAt',
      );
      expect(firstWhere(prisma.payment.findMany)).not.toHaveProperty('AND');
      expect(firstWhere(prisma.payment.groupBy).paidAt).toEqual({
        lt: new Date('2026-11-06T23:00:00.000Z'),
      });
    });

    it('a period ending before it starts is a 400, before any query', async () => {
      const { service, prisma } = setup();
      await expect(
        service.buildModel(
          request({ from: '2026-11-07', to: '2026-11-06' }),
          admin,
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: 'INVALID_DATE_RANGE',
      });
      expect(prisma.payment.count).not.toHaveBeenCalled();
    });

    it('"all dates" with a start day is a 400', () => {
      let error: unknown;
      try {
        resolveReportPeriod(request({ allDates: true, from: '2026-11-01' }));
      } catch (caught) {
        error = caught;
      }
      expect(error).toMatchObject({
        statusCode: 400,
        errorCode: 'INVALID_DATE_RANGE',
      });
    });

    it('no date at all: today in Tunis', () => {
      jest.useFakeTimers({ now: new Date('2026-11-05T23:30:00.000Z') });
      try {
        expect(
          resolveReportPeriod({ kind: PaymentsReportKind.installment }),
        ).toEqual({ from: '2026-11-06', to: '2026-11-06', allDates: false });
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('size', () => {
    it(`refuses more than ${REPORT_MAX_ROWS} rows instead of cutting the report`, async () => {
      const { service, prisma } = setup({
        counts: { installments: REPORT_MAX_ROWS, fees: 1 },
      });
      await expect(service.buildModel(request(), admin)).rejects.toMatchObject({
        statusCode: 400,
        errorCode: 'REPORT_TOO_LARGE',
      });
      expect(prisma.payment.findMany).not.toHaveBeenCalled();
      expect(prisma.dentalOrder.findMany).not.toHaveBeenCalled();
    });
  });

  describe('rows', () => {
    it('an installment row: event date, references, receipt, rank on its quote', async () => {
      const { service } = setup();
      const model = await service.buildModel(
        request({ kind: PaymentsReportKind.installment }),
        admin,
      );
      expect(model.sections[0].rows[0]).toEqual({
        date: new Date('2026-11-05T10:00:00.000Z'),
        orderCode: 'ORD-1',
        practitioner: 'Dr Salma',
        patient: 'Ines Gharbi',
        method: PaymentMethod.card,
        status: PaymentRecordStatus.success,
        amount: d('850.5'),
        transactionRef: 'GW-123',
        receiptNumber: 'FAC-000010',
        installment: { rank: 2, total: 3, packName: 'Pack Confort' },
      });
    });

    it('an unpaid attempt is dated when it was made and has no receipt', async () => {
      const { service } = setup({
        installments: [
          installmentRow({
            status: PaymentRecordStatus.failed,
            paidAt: null,
            invoiceNumber: 'FAC-STALE',
            transactionId: null,
          }),
        ],
      });
      const model = await service.buildModel(
        request({ kind: PaymentsReportKind.installment }),
        admin,
      );
      expect(model.sections[0].rows[0]).toMatchObject({
        date: new Date('2026-11-05T09:58:00.000Z'),
        receiptNumber: null,
        transactionRef: 'ORA-9',
      });
    });

    it("a fee row: the settled card attempt's reference, the TF receipt", async () => {
      const { service } = setup();
      const model = await service.buildModel(
        request({ kind: PaymentsReportKind.treatmentFee }),
        admin,
      );
      expect(model.sections[0].rows[0]).toMatchObject({
        date: new Date('2026-11-04T08:00:00.000Z'),
        orderCode: 'ORD-2',
        transactionRef: 'ORA-TF-1',
        receiptNumber: 'TF-000003',
        installment: null,
      });
    });

    it('newest first by default, by the date each payment happened', async () => {
      const { service } = setup({
        installments: [
          installmentRow({ id: 'a', paidAt: new Date('2026-11-02T10:00:00Z') }),
          installmentRow({
            id: 'b',
            paidAt: null,
            createdAt: new Date('2026-11-05T10:00:00Z'),
          }),
          installmentRow({ id: 'c', paidAt: new Date('2026-11-03T10:00:00Z') }),
        ],
      });
      const model = await service.buildModel(
        request({ kind: PaymentsReportKind.installment }),
        admin,
      );
      expect(model.sections[0].rows.map((r) => r.date?.toISOString())).toEqual([
        '2026-11-05T10:00:00.000Z',
        '2026-11-03T10:00:00.000Z',
        '2026-11-02T10:00:00.000Z',
      ]);
    });

    it('keeps the tab order: highest amount first when asked', async () => {
      const { service } = setup({
        installments: [
          installmentRow({ id: 'a', amount: d('100') }),
          installmentRow({ id: 'b', amount: d('900') }),
          installmentRow({ id: 'c', amount: d('500') }),
        ],
      });
      const model = await service.buildModel(
        request({
          kind: PaymentsReportKind.installment,
          installments: { sort: PaymentsReportSort.amountDesc },
        }),
        admin,
      );
      expect(model.sections[0].rows.map((r) => r.amount?.toFixed(0))).toEqual([
        '900',
        '500',
        '100',
      ]);
    });
  });

  describe('render', () => {
    it('prints the HTML with a numbered footer and names the file', async () => {
      const { service, pdf } = setup();
      const file = await service.render(request({ lang: 'en' }), admin);
      expect(file.fileName).toBe(
        'Oralign_Payments_Report_Consolidated_2026-11-01_2026-11-06.pdf',
      );
      const [html, options] = pdf.render.mock.calls[0] as [
        string,
        { footerTemplate: string },
      ];
      expect(html).toContain('PAYMENTS REPORT');
      expect(options.footerTemplate).toContain('class="totalPages"');
      expect(file.buffer.toString()).toBe('%PDF-1.7');
    });
  });
});
