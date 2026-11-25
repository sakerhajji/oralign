import { Injectable, Logger } from '@nestjs/common';
import {
  InvoiceStatus,
  PaymentMethod,
  Prisma,
  type CompanyBillingSettings,
} from '@prisma/client';
import { lookupActorName } from '../../common/access/actor-snapshot';
import {
  dec,
  round3,
  spreadProportionally,
  toAmount,
} from '../../common/billing/tax-split';
import { documentLogo } from '../../common/pdf/document-logo';
import { PdfRendererService } from '../../common/pdf/pdf-renderer.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanyBillingSettingsService } from '../../quotations/services/company-billing-settings.service';
import type {
  AccountingCompany,
  AccountingLanguage,
  AccountingReportModel,
} from './invoice-accounting.template';
import {
  ACCOUNTING_PAGE_MARGIN,
  accountingReportFileName,
  renderAccountingReportFooter,
  renderAccountingReportHtml,
} from './invoice-accounting.template';
import { businessMonthOf, issueDateFilter } from './invoice-period';

// ─── Contract ─────────────────────────────────────────────────────────
// Every amount is a JS number with 3 decimals (TND millimes), summed with
// Decimal maths, never through a float.

export interface AccountingRange {
  /** First Tunis day included, 'YYYY-MM-DD'. */
  issuedFrom?: string | null;
  /** Last Tunis day included, 'YYYY-MM-DD'. */
  issuedTo?: string | null;
}

export interface AccountingCounted {
  count: number;
  subTotalHt: number;
  /** Sum of the stored remises, each in its invoice's own unit (TTC for the automatic ones). */
  discountAmount: number;
  tvaAmount: number;
  stampDuty: number;
  /** Factures carrying a droit de timbre (> 0). */
  stampCount: number;
  totalTtc: number;
  withholdingAmount: number;
  netPayable: number;
}

export interface AccountingRateRow {
  /** TVA rate in %, e.g. 19. */
  rate: number;
  /** Factures with a part at this rate (a mixed-rate facture counts in each of its rates). */
  count: number;
  baseHt: number;
  tvaAmount: number;
}

export interface AccountingMethodRow {
  method: PaymentMethod | null;
  count: number;
  netPayable: number;
}

export interface AccountingWithholdingRow {
  doctorId: string | null;
  /** The practitioner as the latest of his factures names him. */
  name: string;
  /** Matricule fiscal: the latest non-empty one on his factures. */
  taxId: string | null;
  count: number;
  /** What the retenue was computed on: total TTC minus the stamp. */
  baseTtc: number;
  withholdingAmount: number;
}

export interface AccountingMonthRow {
  /** Tunis month, 'YYYY-MM'. */
  month: string;
  count: number;
  subTotalHt: number;
  tvaAmount: number;
  stampDuty: number;
  totalTtc: number;
  withholdingAmount: number;
  netPayable: number;
}

export interface AccountingSummary {
  period: { from: string | null; to: string | null };
  /** Factures comptabilisées: issued or paid, not archived, issued in the period. */
  counted: AccountingCounted;
  paid: { count: number; netPayable: number };
  /** Issued, still to collect. */
  unpaid: { count: number; netPayable: number };
  drafts: { count: number; totalTtc: number };
  cancelled: { count: number; totalTtc: number };
  /** Rate descending. Adds up to counted.subTotalHt / counted.tvaAmount exactly. */
  byRate: AccountingRateRow[];
  /** Paid factures only, by payment method (null = not stated). */
  byMethod: AccountingMethodRow[];
  /** Withholding descending. */
  withholdingByDoctor: AccountingWithholdingRow[];
  /** Tunis month ascending. */
  byMonth: AccountingMonthRow[];
}

// ─── Rows read ────────────────────────────────────────────────────────

/** The statuses an accountant books: a draft is not a sale, a cancelled facture is voided. */
export const COUNTED_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.issued,
  InvoiceStatus.paid,
];

const COUNTED_SELECT = {
  id: true,
  status: true,
  issueDate: true,
  tvaRate: true,
  subTotalHt: true,
  discountAmount: true,
  tvaAmount: true,
  stampDuty: true,
  totalTtc: true,
  withholdingAmount: true,
  netPayable: true,
  paymentMethod: true,
  doctorId: true,
  clientName: true,
  clientTaxId: true,
} as const;

type Amount = Prisma.Decimal | number | string | null;

export interface CountedInvoiceRow {
  id: string;
  status: InvoiceStatus;
  issueDate: Date;
  tvaRate: number;
  subTotalHt: Amount;
  discountAmount: Amount;
  tvaAmount: Amount;
  stampDuty: Amount;
  totalTtc: Amount;
  withholdingAmount: Amount;
  netPayable: Amount;
  paymentMethod: PaymentMethod | null;
  doctorId: string | null;
  clientName: string;
  clientTaxId: string | null;
}

export interface InvoiceLineRateRow {
  invoiceId: string;
  /** null = the invoice rate. */
  tvaRate: number | null;
  lineHt: Amount;
}

export interface ExcludedTally {
  count: number;
  totalTtc: Amount;
}

export interface AccountingInput {
  period: { from: string | null; to: string | null };
  rows: CountedInvoiceRow[];
  /** Every line of the mixed-rate invoices among `rows`, in position order. */
  mixedLines: InvoiceLineRateRow[];
  drafts: ExcludedTally;
  cancelled: ExcludedTally;
}

// ─── Maths ────────────────────────────────────────────────────────────

const ZERO = () => new Prisma.Decimal(0);

/** A TVA rate as a stable key: 19, 19.0 and 19.000 are the same rate. */
const rateKey = (rate: number | null | undefined): string =>
  dec(rate ?? 0).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP).toFixed(3);

/** Payment methods in the order the desk lists them. */
const METHOD_ORDER: (PaymentMethod | null)[] = [
  PaymentMethod.card,
  PaymentMethod.bank_transfer,
  PaymentMethod.cheque,
  PaymentMethod.cash,
  null,
];

interface RatePart {
  base: Prisma.Decimal;
  tva: Prisma.Decimal;
}

/**
 * How one invoice splits over the TVA rates.
 *
 * Single-rate (every line at one effective rate, the normal case): its
 * subTotalHt and tvaAmount go under that rate as stored. Mixed-rate: each
 * line's HT (after the discount) is its base, its TVA is
 * round3(base x rate / 100), and whatever the stored totals differ by
 * (millime rounding, a legacy row) goes to the invoice's own rate — or,
 * when no line uses it, to the rate carrying the largest base — so the
 * parts always add up to the stored subTotalHt and tvaAmount exactly.
 */
export function splitInvoiceByRate(
  invoice: Pick<CountedInvoiceRow, 'tvaRate' | 'subTotalHt' | 'tvaAmount'>,
  lines: Pick<InvoiceLineRateRow, 'tvaRate' | 'lineHt'>[],
): Map<string, RatePart> {
  const subTotalHt = round3(invoice.subTotalHt);
  const tvaAmount = round3(invoice.tvaAmount);
  const ownRate = rateKey(invoice.tvaRate);
  const effective = lines.map((line) => rateKey(line.tvaRate ?? invoice.tvaRate));
  const distinct = new Set(effective);

  const parts = new Map<string, RatePart>();
  if (distinct.size <= 1) {
    const only = effective[0] ?? ownRate;
    parts.set(only, { base: subTotalHt, tva: tvaAmount });
    return parts;
  }

  // The lines' HT after the discount. TTC-priced invoices store exactly
  // that; HT-priced ones store the gross, so the subtotal is spread back
  // over the lines in proportion.
  const weights = lines.map((line) => round3(line.lineHt));
  const weightSum = weights.reduce((acc, w) => acc.plus(w), ZERO());
  const bases = weightSum.equals(subTotalHt)
    ? weights
    : spreadProportionally(subTotalHt, weights);

  lines.forEach((_, index) => {
    const key = effective[index];
    const part = parts.get(key) ?? { base: ZERO(), tva: ZERO() };
    const base = bases[index] ?? ZERO();
    part.base = part.base.plus(base);
    part.tva = part.tva.plus(round3(base.mul(dec(key)).div(100)));
    parts.set(key, part);
  });

  let target = ownRate;
  if (!parts.has(target)) {
    let best: [string, Prisma.Decimal] | null = null;
    for (const [key, part] of parts) {
      if (
        !best ||
        part.base.greaterThan(best[1]) ||
        (part.base.equals(best[1]) && dec(key).greaterThan(dec(best[0])))
      ) {
        best = [key, part.base];
      }
    }
    target = best ? best[0] : ownRate;
  }
  const sumBase = [...parts.values()].reduce((acc, p) => acc.plus(p.base), ZERO());
  const sumTva = [...parts.values()].reduce((acc, p) => acc.plus(p.tva), ZERO());
  const remainder = parts.get(target) ?? { base: ZERO(), tva: ZERO() };
  remainder.base = remainder.base.plus(subTotalHt.minus(sumBase));
  remainder.tva = remainder.tva.plus(tvaAmount.minus(sumTva));
  parts.set(target, remainder);
  return parts;
}

interface MoneySums {
  count: number;
  subTotalHt: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  tvaAmount: Prisma.Decimal;
  stampDuty: Prisma.Decimal;
  totalTtc: Prisma.Decimal;
  withholdingAmount: Prisma.Decimal;
  netPayable: Prisma.Decimal;
}

const emptySums = (): MoneySums => ({
  count: 0,
  subTotalHt: ZERO(),
  discountAmount: ZERO(),
  tvaAmount: ZERO(),
  stampDuty: ZERO(),
  totalTtc: ZERO(),
  withholdingAmount: ZERO(),
  netPayable: ZERO(),
});

function addRow(sums: MoneySums, row: CountedInvoiceRow): void {
  sums.count += 1;
  sums.subTotalHt = sums.subTotalHt.plus(round3(row.subTotalHt));
  sums.discountAmount = sums.discountAmount.plus(round3(row.discountAmount));
  sums.tvaAmount = sums.tvaAmount.plus(round3(row.tvaAmount));
  sums.stampDuty = sums.stampDuty.plus(round3(row.stampDuty));
  sums.totalTtc = sums.totalTtc.plus(round3(row.totalTtc));
  sums.withholdingAmount = sums.withholdingAmount.plus(round3(row.withholdingAmount));
  sums.netPayable = sums.netPayable.plus(round3(row.netPayable));
}

/**
 * The accounting summary of a period, from the rows already read. Pure:
 * the service does the queries, this does the sums (exported for the spec).
 */
export function buildAccountingSummary(input: AccountingInput): AccountingSummary {
  const counted = emptySums();
  let stampCount = 0;
  const paid = { count: 0, net: ZERO() };
  const unpaid = { count: 0, net: ZERO() };
  const rates = new Map<string, { count: number; base: Prisma.Decimal; tva: Prisma.Decimal }>();
  const methods = new Map<PaymentMethod | null, { count: number; net: Prisma.Decimal }>();
  const doctors = new Map<
    string,
    {
      doctorId: string | null;
      name: string;
      taxId: string | null;
      count: number;
      base: Prisma.Decimal;
      withheld: Prisma.Decimal;
    }
  >();
  const months = new Map<string, MoneySums>();

  const linesByInvoice = new Map<string, InvoiceLineRateRow[]>();
  for (const line of input.mixedLines) {
    const list = linesByInvoice.get(line.invoiceId) ?? [];
    list.push(line);
    linesByInvoice.set(line.invoiceId, list);
  }

  // Oldest first, so the latest name / matricule of a practitioner wins.
  const rows = [...input.rows].sort(
    (a, b) =>
      new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime() ||
      a.id.localeCompare(b.id),
  );

  for (const row of rows) {
    addRow(counted, row);
    if (round3(row.stampDuty).greaterThan(0)) stampCount += 1;

    const net = round3(row.netPayable);
    if (row.status === InvoiceStatus.paid) {
      paid.count += 1;
      paid.net = paid.net.plus(net);
      const method = methods.get(row.paymentMethod ?? null) ?? { count: 0, net: ZERO() };
      method.count += 1;
      method.net = method.net.plus(net);
      methods.set(row.paymentMethod ?? null, method);
    } else {
      unpaid.count += 1;
      unpaid.net = unpaid.net.plus(net);
    }

    for (const [key, part] of splitInvoiceByRate(row, linesByInvoice.get(row.id) ?? [])) {
      const rate = rates.get(key) ?? { count: 0, base: ZERO(), tva: ZERO() };
      rate.count += 1;
      rate.base = rate.base.plus(part.base);
      rate.tva = rate.tva.plus(part.tva);
      rates.set(key, rate);
    }

    const withheld = round3(row.withholdingAmount);
    if (withheld.greaterThan(0)) {
      const name = row.clientName?.trim() || '—';
      const key = row.doctorId
        ? `doctor:${row.doctorId}`
        : `name:${name.toLocaleLowerCase('fr')}`;
      const doctor = doctors.get(key) ?? {
        doctorId: row.doctorId ?? null,
        name,
        taxId: null,
        count: 0,
        base: ZERO(),
        withheld: ZERO(),
      };
      doctor.name = name;
      const taxId = row.clientTaxId?.trim();
      if (taxId) doctor.taxId = taxId;
      doctor.count += 1;
      doctor.base = doctor.base.plus(
        Prisma.Decimal.max(0, round3(row.totalTtc).minus(round3(row.stampDuty))),
      );
      doctor.withheld = doctor.withheld.plus(withheld);
      doctors.set(key, doctor);
    }

    const month = businessMonthOf(new Date(row.issueDate));
    const monthSums = months.get(month) ?? emptySums();
    addRow(monthSums, row);
    months.set(month, monthSums);
  }

  return {
    period: input.period,
    counted: {
      count: counted.count,
      subTotalHt: toAmount(counted.subTotalHt),
      discountAmount: toAmount(counted.discountAmount),
      tvaAmount: toAmount(counted.tvaAmount),
      stampDuty: toAmount(counted.stampDuty),
      stampCount,
      totalTtc: toAmount(counted.totalTtc),
      withholdingAmount: toAmount(counted.withholdingAmount),
      netPayable: toAmount(counted.netPayable),
    },
    paid: { count: paid.count, netPayable: toAmount(paid.net) },
    unpaid: { count: unpaid.count, netPayable: toAmount(unpaid.net) },
    drafts: {
      count: input.drafts.count,
      totalTtc: toAmount(input.drafts.totalTtc),
    },
    cancelled: {
      count: input.cancelled.count,
      totalTtc: toAmount(input.cancelled.totalTtc),
    },
    byRate: [...rates.entries()]
      .sort(([a], [b]) => dec(b).comparedTo(dec(a)))
      .map(([key, rate]) => ({
        rate: toAmount(key),
        count: rate.count,
        baseHt: toAmount(rate.base),
        tvaAmount: toAmount(rate.tva),
      })),
    byMethod: [...methods.entries()]
      .sort(
        ([ma, a], [mb, b]) =>
          // "Non précisé" last; otherwise the largest amount first.
          Number(ma === null) - Number(mb === null) ||
          b.net.comparedTo(a.net) ||
          METHOD_ORDER.indexOf(ma) - METHOD_ORDER.indexOf(mb),
      )
      .map(([method, m]) => ({
        method,
        count: m.count,
        netPayable: toAmount(m.net),
      })),
    withholdingByDoctor: [...doctors.values()]
      .sort(
        (a, b) =>
          b.withheld.comparedTo(a.withheld) || a.name.localeCompare(b.name, 'fr'),
      )
      .map((d) => ({
        doctorId: d.doctorId,
        name: d.name,
        taxId: d.taxId,
        count: d.count,
        baseTtc: toAmount(d.base),
        withholdingAmount: toAmount(d.withheld),
      })),
    byMonth: [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, m]) => ({
        month,
        count: m.count,
        subTotalHt: toAmount(m.subTotalHt),
        tvaAmount: toAmount(m.tvaAmount),
        stampDuty: toAmount(m.stampDuty),
        totalTtc: toAmount(m.totalTtc),
        withholdingAmount: toAmount(m.withholdingAmount),
        netPayable: toAmount(m.netPayable),
      })),
  };
}

// ─── Service ──────────────────────────────────────────────────────────

export interface AccountingPdfFile {
  buffer: Buffer;
  fileName: string;
}

/**
 * The accountant's view of the invoice desk: for a period of Tunis days,
 * the turnover, the TVA collected per rate (the monthly return), the
 * stamps, the retenues à la source suffered per practitioner (a tax
 * credit backed by each one's certificat de retenue), the cash collected
 * per method — as JSON for the screen and as an A4 PDF for the file.
 */
@Injectable()
export class InvoiceAccountingService {
  private readonly logger = new Logger(InvoiceAccountingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: CompanyBillingSettingsService,
    private readonly pdf: PdfRendererService,
  ) {}

  async summarise(range: AccountingRange = {}): Promise<AccountingSummary> {
    const from = range.issuedFrom || null;
    const to = range.issuedTo || null;
    // Throws 400 INVALID_DATE / INVALID_DATE_RANGE before any query.
    const issueDate = issueDateFilter(from, to);
    const inPeriod: Prisma.InvoiceWhereInput = {
      deletedAt: null,
      ...(issueDate ? { issueDate } : {}),
    };
    const countedWhere: Prisma.InvoiceWhereInput = {
      ...inPeriod,
      status: { in: COUNTED_STATUSES },
    };

    const [rows, excluded, overrides] = await Promise.all([
      // Scalars only: the month split needs each facture's Tunis day, and
      // the practitioner split its latest name and matricule.
      this.prisma.invoice.findMany({
        where: countedWhere,
        select: COUNTED_SELECT,
        orderBy: [{ issueDate: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.invoice.groupBy({
        by: ['status'],
        where: {
          ...inPeriod,
          status: { in: [InvoiceStatus.draft, InvoiceStatus.cancelled] },
        },
        _count: { _all: true },
        _sum: { totalTtc: true },
      }),
      // Lines with their own rate: rare, and the only way a facture can
      // be mixed-rate. Distinct pairs, not every line.
      this.prisma.invoiceLine.findMany({
        where: { tvaRate: { not: null }, invoice: countedWhere },
        select: { invoiceId: true, tvaRate: true },
        distinct: ['invoiceId', 'tvaRate'],
      }),
    ]);

    const ownRate = new Map(rows.map((row) => [row.id, rateKey(row.tvaRate)]));
    const mixedIds = [
      ...new Set(
        overrides
          .filter(
            (line) =>
              ownRate.has(line.invoiceId) &&
              rateKey(line.tvaRate) !== ownRate.get(line.invoiceId),
          )
          .map((line) => line.invoiceId),
      ),
    ];
    const mixedLines = mixedIds.length
      ? await this.prisma.invoiceLine.findMany({
          where: { invoiceId: { in: mixedIds } },
          select: { invoiceId: true, tvaRate: true, lineHt: true },
          orderBy: [{ invoiceId: 'asc' }, { position: 'asc' }],
        })
      : [];

    const tally = (status: InvoiceStatus): ExcludedTally => {
      const group = excluded.find((g) => g.status === status);
      return {
        count: group?._count?._all ?? 0,
        totalTtc: group?._sum?.totalTtc ?? 0,
      };
    };

    return buildAccountingSummary({
      period: { from, to },
      rows,
      mixedLines,
      drafts: tally(InvoiceStatus.draft),
      cancelled: tally(InvoiceStatus.cancelled),
    });
  }

  /** The "Récapitulatif comptable" PDF of the period. */
  async renderPdf(
    range: AccountingRange,
    options: { language?: AccountingLanguage; userId?: string } = {},
  ): Promise<AccountingPdfFile> {
    const model = await this.buildReportModel(range, options);
    const buffer = await this.pdf.render(renderAccountingReportHtml(model), {
      footerTemplate: renderAccountingReportFooter(model),
      margin: ACCOUNTING_PAGE_MARGIN,
    });
    this.logger.log(
      `Accounting summary PDF (${model.summary.period.from ?? '…'} → ${model.summary.period.to ?? '…'}, ${model.summary.counted.count} factures)`,
    );
    return { buffer, fileName: accountingReportFileName(model) };
  }

  /** Everything the PDF prints, without printing it. */
  async buildReportModel(
    range: AccountingRange,
    options: { language?: AccountingLanguage; userId?: string } = {},
  ): Promise<AccountingReportModel> {
    const [summary, settings, generatedBy] = await Promise.all([
      this.summarise(range),
      this.settings.getActive(),
      options.userId
        ? lookupActorName(this.prisma, options.userId).catch(() => null)
        : Promise.resolve(null),
    ]);
    return {
      lang: options.language ?? 'fr',
      summary,
      generatedAt: new Date(),
      generatedBy,
      brandName: settings?.tradeName?.trim() || 'ORALIGN',
      company: companyOf(settings),
      logo: documentLogo(settings?.companyLogoPath),
      currency: settings?.defaultCurrency?.trim() || 'TND',
    };
  }
}

/** The issuer block, from the billing settings only: nothing is invented. */
function companyOf(settings: CompanyBillingSettings | null): AccountingCompany {
  const text = (value: string | null | undefined) => value?.trim() || null;
  return {
    name: text(settings?.companyName),
    tradeName: text(settings?.tradeName),
    legalForm: text(settings?.legalForm),
    address: text(settings?.companyAddress),
    city: text(settings?.companyCity),
    country: text(settings?.companyCountry),
    phone: text(settings?.companyPhone),
    email: text(settings?.companyEmail),
    taxNumber: text(settings?.taxRegistrationNumber),
    tradeRegister: text(settings?.registreDeCommerce),
  };
}
