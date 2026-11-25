import { InvoiceStatus, PaymentMethod, Prisma } from '@prisma/client';

// puppeteer-core is ESM-only: the renderer is replaced by a stub.
jest.mock('../../common/pdf/pdf-renderer.service', () => ({
  PdfRendererService: class PdfRendererService {},
}));

import type { PdfRendererService } from '../../common/pdf/pdf-renderer.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { CompanyBillingSettingsService } from '../../quotations/services/company-billing-settings.service';
import {
  buildAccountingSummary,
  COUNTED_STATUSES,
  InvoiceAccountingService,
  splitInvoiceByRate,
  type CountedInvoiceRow,
  type InvoiceLineRateRow,
} from './invoice-accounting.service';

const D = (v: string | number) => new Prisma.Decimal(v);

function invoice(overrides: Partial<CountedInvoiceRow> & { id: string }): CountedInvoiceRow {
  return {
    status: InvoiceStatus.paid,
    issueDate: new Date('2026-11-03T09:00:00.000Z'),
    tvaRate: 19,
    subTotalHt: D('0'),
    discountAmount: D('0'),
    tvaAmount: D('0'),
    stampDuty: D('1'),
    totalTtc: D('0'),
    withholdingAmount: D('0'),
    netPayable: D('0'),
    paymentMethod: PaymentMethod.card,
    doctorId: null,
    clientName: 'Client',
    clientTaxId: null,
    ...overrides,
  };
}

/**
 * Six factures comptabilisées, two TVA rates:
 *  A1/A2  Dr Salma (doctor d1), 19 %, paid card / transfer, retenue 1 %.
 *  B      Dr Karim, TTC-priced, lines at 19 % and 7 %, still issued; a
 *         legacy millime: stored TVA 197.001 against 190 + 7 by line.
 *  C      a clinic without account, HT-priced, 19 % + 7 % lines, a 15 HT
 *         remise (lines store the GROSS HT), paid, method not stated.
 *  D      Dr Sami (no account), invoice rate 19 but its only line at 7 %.
 *  E      Dr Sami again (other spelling), paid by cheque at 00:30 Tunis on
 *         1 December (still 30 November in UTC).
 */
const ROWS: CountedInvoiceRow[] = [
  invoice({
    id: 'inv-a1',
    issueDate: new Date('2026-11-03T09:00:00.000Z'),
    subTotalHt: D('1000'),
    tvaAmount: D('190'),
    totalTtc: D('1191'),
    withholdingAmount: D('11.9'),
    netPayable: D('1179.1'),
    paymentMethod: PaymentMethod.card,
    doctorId: 'd1',
    clientName: 'Salma Trabelsi',
    clientTaxId: null,
  }),
  invoice({
    id: 'inv-a2',
    issueDate: new Date('2026-11-20T09:00:00.000Z'),
    subTotalHt: D('500'),
    tvaAmount: D('95'),
    totalTtc: D('596'),
    withholdingAmount: D('5.95'),
    netPayable: D('590.05'),
    paymentMethod: PaymentMethod.bank_transfer,
    doctorId: 'd1',
    clientName: 'Dr Salma Trabelsi',
    clientTaxId: '1234567/A/M/000',
  }),
  invoice({
    id: 'inv-b',
    status: InvoiceStatus.issued,
    issueDate: new Date('2026-11-10T09:00:00.000Z'),
    subTotalHt: D('1100'),
    tvaAmount: D('197.001'),
    totalTtc: D('1298.001'),
    netPayable: D('1298.001'),
    paymentMethod: null,
    doctorId: 'd2',
    clientName: 'Dr Karim Ben Ali',
  }),
  invoice({
    id: 'inv-c',
    issueDate: new Date('2026-11-12T09:00:00.000Z'),
    subTotalHt: D('135'),
    discountAmount: D('15'),
    tvaAmount: D('20.25'),
    totalTtc: D('156.25'),
    netPayable: D('156.25'),
    paymentMethod: null,
    clientName: 'Clinique Les Pins',
  }),
  invoice({
    id: 'inv-d',
    issueDate: new Date('2026-11-15T09:00:00.000Z'),
    subTotalHt: D('200'),
    tvaAmount: D('14'),
    totalTtc: D('215'),
    withholdingAmount: D('3.21'),
    netPayable: D('211.79'),
    paymentMethod: PaymentMethod.cash,
    clientName: 'Dr Sami Gharbi',
    clientTaxId: '',
  }),
  invoice({
    id: 'inv-e',
    issueDate: new Date('2026-11-30T23:30:00.000Z'),
    subTotalHt: D('100'),
    tvaAmount: D('19'),
    totalTtc: D('120'),
    withholdingAmount: D('1.19'),
    netPayable: D('118.81'),
    paymentMethod: PaymentMethod.cheque,
    clientName: 'DR SAMI GHARBI ',
  }),
];

const MIXED_LINES: InvoiceLineRateRow[] = [
  { invoiceId: 'inv-b', tvaRate: null, lineHt: D('1000') },
  { invoiceId: 'inv-b', tvaRate: 7, lineHt: D('100') },
  { invoiceId: 'inv-c', tvaRate: null, lineHt: D('100') },
  { invoiceId: 'inv-c', tvaRate: 7, lineHt: D('50') },
  { invoiceId: 'inv-d', tvaRate: 7, lineHt: D('200') },
];

const SUMMARY_INPUT = {
  period: { from: '2026-11-01', to: '2026-11-30' },
  rows: ROWS,
  mixedLines: MIXED_LINES,
  drafts: { count: 2, totalTtc: D('300.5') },
  cancelled: { count: 1, totalTtc: D('119') },
};

const sum = (values: number[]) =>
  values.reduce((acc, v) => acc.plus(v), new Prisma.Decimal(0)).toNumber();

describe('buildAccountingSummary', () => {
  const summary = buildAccountingSummary(SUMMARY_INPUT);

  it('totals the factures comptabilisées, amounts as 3-decimal numbers', () => {
    expect(summary.period).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(summary.counted).toEqual({
      count: 6,
      subTotalHt: 3035,
      discountAmount: 15,
      tvaAmount: 535.251,
      stampDuty: 6,
      stampCount: 6,
      totalTtc: 3576.251,
      withholdingAmount: 22.25,
      netPayable: 3554.001,
    });
    // The ledger identities hold on the totals.
    const c = summary.counted;
    expect(sum([c.subTotalHt, c.tvaAmount, c.stampDuty])).toBe(c.totalTtc);
    expect(sum([c.totalTtc, -c.withholdingAmount])).toBe(c.netPayable);
    for (const value of Object.values(c)) expect(typeof value).toBe('number');
  });

  it('splits paid (collected) from issued (to collect)', () => {
    expect(summary.paid).toEqual({ count: 5, netPayable: 2256 });
    expect(summary.unpaid).toEqual({ count: 1, netPayable: 1298.001 });
    expect(sum([summary.paid.netPayable, summary.unpaid.netPayable])).toBe(
      summary.counted.netPayable,
    );
  });

  it('reports drafts and cancelled apart, outside the totals', () => {
    expect(summary.drafts).toEqual({ count: 2, totalTtc: 300.5 });
    expect(summary.cancelled).toEqual({ count: 1, totalTtc: 119 });
  });

  it('TVA by rate: mixed-rate factures split by line, the table adds up to the totals exactly', () => {
    expect(summary.byRate).toEqual([
      // A1 1000 + A2 500 + B 1000 + C 90 (100 of 150 gross, after the
      // remise) + E 100; TVA: B's stray millime lands on its own rate.
      { rate: 19, count: 5, baseHt: 2690, tvaAmount: 511.101 },
      // B 100 + C 45 + D 200 (its only line is at 7 %: all of it).
      { rate: 7, count: 3, baseHt: 345, tvaAmount: 24.15 },
    ]);
    expect(sum(summary.byRate.map((r) => r.baseHt))).toBe(summary.counted.subTotalHt);
    expect(sum(summary.byRate.map((r) => r.tvaAmount))).toBe(summary.counted.tvaAmount);
  });

  it('collections by method: paid factures only, null = not stated, last', () => {
    expect(summary.byMethod).toEqual([
      { method: PaymentMethod.card, count: 1, netPayable: 1179.1 },
      { method: PaymentMethod.bank_transfer, count: 1, netPayable: 590.05 },
      { method: PaymentMethod.cash, count: 1, netPayable: 211.79 },
      { method: PaymentMethod.cheque, count: 1, netPayable: 118.81 },
      { method: null, count: 1, netPayable: 156.25 },
    ]);
    expect(sum(summary.byMethod.map((m) => m.netPayable))).toBe(summary.paid.netPayable);
  });

  it('retenues by practitioner: by doctor, else by name; latest name and non-empty matricule; largest first', () => {
    expect(summary.withholdingByDoctor).toEqual([
      {
        doctorId: 'd1',
        name: 'Dr Salma Trabelsi',
        taxId: '1234567/A/M/000',
        count: 2,
        baseTtc: 1785,
        withholdingAmount: 17.85,
      },
      {
        doctorId: null,
        name: 'DR SAMI GHARBI',
        taxId: null,
        count: 2,
        baseTtc: 333,
        withholdingAmount: 4.4,
      },
    ]);
    expect(sum(summary.withholdingByDoctor.map((w) => w.withholdingAmount))).toBe(
      summary.counted.withholdingAmount,
    );
  });

  it('months are Tunis months: 2026-11-30T23:30Z belongs to December', () => {
    expect(summary.byMonth).toEqual([
      {
        month: '2026-11',
        count: 5,
        subTotalHt: 2935,
        tvaAmount: 516.251,
        stampDuty: 5,
        totalTtc: 3456.251,
        withholdingAmount: 21.06,
        netPayable: 3435.191,
      },
      {
        month: '2026-12',
        count: 1,
        subTotalHt: 100,
        tvaAmount: 19,
        stampDuty: 1,
        totalTtc: 120,
        withholdingAmount: 1.19,
        netPayable: 118.81,
      },
    ]);
  });

  it('an empty period is all zeros, never NaN', () => {
    const empty = buildAccountingSummary({
      period: { from: null, to: null },
      rows: [],
      mixedLines: [],
      drafts: { count: 0, totalTtc: null },
      cancelled: { count: 0, totalTtc: null },
    });
    expect(empty.counted).toEqual({
      count: 0,
      subTotalHt: 0,
      discountAmount: 0,
      tvaAmount: 0,
      stampDuty: 0,
      stampCount: 0,
      totalTtc: 0,
      withholdingAmount: 0,
      netPayable: 0,
    });
    expect(empty.byRate).toEqual([]);
    expect(empty.byMethod).toEqual([]);
    expect(empty.byMonth).toEqual([]);
    expect(empty.drafts).toEqual({ count: 0, totalTtc: 0 });
  });
});

describe('splitInvoiceByRate', () => {
  it('per-line rounding is absorbed by the invoice rate', () => {
    // 0.004 x 19 % = 0.00076 -> 0.001 and 0.006 x 7 % = 0.00042 -> 0;
    // the stored TVA says 0.002: the extra millime goes to 19 %.
    const parts = splitInvoiceByRate(
      { tvaRate: 19, subTotalHt: D('0.01'), tvaAmount: D('0.002') },
      [
        { tvaRate: null, lineHt: D('0.004') },
        { tvaRate: 7, lineHt: D('0.006') },
      ],
    );
    expect(Object.fromEntries([...parts].map(([k, p]) => [k, [p.base.toNumber(), p.tva.toNumber()]]))).toEqual({
      '19.000': [0.004, 0.002],
      '7.000': [0.006, 0],
    });
  });

  it('when no line uses the invoice rate, the remainder goes to the largest base', () => {
    const parts = splitInvoiceByRate(
      // By line: 7 + 26 = 33; the stored 33.001 leaves one millime over.
      { tvaRate: 19, subTotalHt: D('300'), tvaAmount: D('33.001') },
      [
        { tvaRate: 7, lineHt: D('100') },
        { tvaRate: 13, lineHt: D('200') },
      ],
    );
    expect(parts.has('19.000')).toBe(false);
    expect(parts.get('13.000')?.tva.toNumber()).toBe(26.001);
    expect(parts.get('7.000')?.tva.toNumber()).toBe(7);
  });
});

// ─── The service: what it asks the database ──────────────────────────

function makeService(opts: { rows?: CountedInvoiceRow[] } = {}) {
  const rows = opts.rows ?? ROWS;
  const prisma = {
    invoice: {
      findMany: jest.fn().mockResolvedValue(rows),
      groupBy: jest.fn().mockResolvedValue([
        { status: InvoiceStatus.draft, _count: { _all: 2 }, _sum: { totalTtc: D('300.5') } },
        { status: InvoiceStatus.cancelled, _count: { _all: 1 }, _sum: { totalTtc: D('119') } },
      ]),
    },
    invoiceLine: {
      findMany: jest.fn().mockImplementation((args: { select: Record<string, boolean>; where: { invoiceId?: { in: string[] } } }) => {
        if (!args.select.lineHt) {
          // Distinct (invoice, own-rate) pairs. A2 has a line at 19 %:
          // its own rate, so it is NOT mixed.
          return Promise.resolve([
            { invoiceId: 'inv-a2', tvaRate: 19 },
            { invoiceId: 'inv-b', tvaRate: 7 },
            { invoiceId: 'inv-c', tvaRate: 7 },
            { invoiceId: 'inv-d', tvaRate: 7 },
          ]);
        }
        const wanted = new Set(args.where.invoiceId?.in ?? []);
        return Promise.resolve(MIXED_LINES.filter((l) => wanted.has(l.invoiceId)));
      }),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ fullName: 'Admin Oralign' }) },
  };
  const settings = { getActive: jest.fn().mockResolvedValue(null) };
  const pdf = { render: jest.fn().mockResolvedValue(Buffer.from('%PDF-recap')) };
  const service = new InvoiceAccountingService(
    prisma as unknown as PrismaService,
    settings as unknown as CompanyBillingSettingsService,
    pdf as unknown as PdfRendererService,
  );
  return { service, prisma, settings, pdf };
}

/** 2026-11-01 → 2026-11-30 in Tunis, as the UTC instants Prisma receives. */
const NOVEMBER = {
  gte: new Date('2026-10-31T23:00:00.000Z'),
  lt: new Date('2026-11-30T23:00:00.000Z'),
};

describe('InvoiceAccountingService.summarise', () => {
  it('counts issued + paid, not archived, issued in the Tunis days of the period', async () => {
    const { service, prisma } = makeService();
    const summary = await service.summarise({ issuedFrom: '2026-11-01', issuedTo: '2026-11-30' });

    const countedWhere = {
      deletedAt: null,
      issueDate: NOVEMBER,
      status: { in: COUNTED_STATUSES },
    };
    expect(COUNTED_STATUSES).toEqual([InvoiceStatus.issued, InvoiceStatus.paid]);
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: countedWhere }),
    );
    // 2026-11-30T23:30Z is 00:30 on 1 December in Tunis: past the bound.
    expect(new Date('2026-11-30T23:30:00.000Z') >= NOVEMBER.lt).toBe(true);
    // Drafts and cancelled: counted apart, same period, never archived.
    expect(prisma.invoice.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['status'],
        where: {
          deletedAt: null,
          issueDate: NOVEMBER,
          status: { in: [InvoiceStatus.draft, InvoiceStatus.cancelled] },
        },
      }),
    );
    expect(summary.drafts).toEqual({ count: 2, totalTtc: 300.5 });
    expect(summary.cancelled).toEqual({ count: 1, totalTtc: 119 });
    expect(summary.counted.count).toBe(6);
  });

  it('reads lines only for the mixed-rate factures', async () => {
    const { service, prisma } = makeService();
    const summary = await service.summarise({ issuedFrom: '2026-11-01', issuedTo: '2026-11-30' });

    const [overrides, lines] = prisma.invoiceLine.findMany.mock.calls.map((c) => c[0]);
    expect(overrides).toEqual(
      expect.objectContaining({
        where: {
          tvaRate: { not: null },
          invoice: { deletedAt: null, issueDate: NOVEMBER, status: { in: COUNTED_STATUSES } },
        },
        distinct: ['invoiceId', 'tvaRate'],
      }),
    );
    // inv-a2's own-rate line does not make it mixed.
    expect(lines.where.invoiceId.in.sort()).toEqual(['inv-b', 'inv-c', 'inv-d']);
    expect(summary.byRate).toEqual([
      { rate: 19, count: 5, baseHt: 2690, tvaAmount: 511.101 },
      { rate: 7, count: 3, baseHt: 345, tvaAmount: 24.15 },
    ]);
  });

  it('no mixed-rate facture: no line read at all', async () => {
    const { service, prisma } = makeService({ rows: [ROWS[0]] });
    prisma.invoiceLine.findMany.mockResolvedValueOnce([]);
    const summary = await service.summarise({});
    expect(prisma.invoiceLine.findMany).toHaveBeenCalledTimes(1);
    // No period: no issueDate filter, the period says so.
    expect(prisma.invoice.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      status: { in: COUNTED_STATUSES },
    });
    expect(summary.period).toEqual({ from: null, to: null });
    expect(summary.byRate).toEqual([{ rate: 19, count: 1, baseHt: 1000, tvaAmount: 190 }]);
  });

  it('refuses a period that ends before it starts (400) before any query', async () => {
    const { service, prisma } = makeService();
    await expect(
      service.summarise({ issuedFrom: '2026-11-30', issuedTo: '2026-11-01' }),
    ).rejects.toMatchObject({ statusCode: 400, errorCode: 'INVALID_DATE_RANGE' });
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });

  it('renders the PDF with the shared renderer, a running footer and the contract file name', async () => {
    const { service, pdf } = makeService();
    const file = await service.renderPdf(
      { issuedFrom: '2026-11-01', issuedTo: '2026-11-30' },
      { language: 'fr', userId: 'u-admin' },
    );
    expect(file.fileName).toBe('recap-comptable-2026-11-01_2026-11-30.pdf');
    expect(file.buffer.toString()).toBe('%PDF-recap');
    const [html, options] = pdf.render.mock.calls[0];
    expect(html).toContain('RÉCAPITULATIF COMPTABLE');
    expect(html).toContain('Admin Oralign');
    expect(options.footerTemplate).toContain('pageNumber');
  });
});
