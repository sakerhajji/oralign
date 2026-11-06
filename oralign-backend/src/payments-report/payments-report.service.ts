import { Injectable, Logger } from '@nestjs/common';
import {
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
  type CompanyBillingSettings,
} from '@prisma/client';
import { isAdmin, type Caller } from '../common/access/caller';
import { BadRequestException } from '../common/exceptions/app.exception';
import { documentLogo } from '../common/pdf/document-logo';
import { PdfRendererService } from '../common/pdf/pdf-renderer.service';
import {
  businessDayRange,
  businessToday,
  type BusinessDayRange,
} from '../common/time/business-day';
import { SortOrder } from '../orders/dto/order.dto';
import { TreatmentFeeSortBy } from '../orders/dto/treatment-fee.dto';
import {
  treatmentFeeOrderBy,
  treatmentFeeWhere,
} from '../orders/services/treatment-fee-query';
import {
  compareIds,
  paymentEventDate,
  paymentListWhere,
} from '../payments/services/payment-list-query';
import {
  PaymentsSummaryService,
  resolveTakingsPeriod,
} from '../payments/services/payments-summary.service';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyBillingSettingsService } from '../quotations/services/company-billing-settings.service';
import {
  PaymentsReportKind,
  PaymentsReportSort,
  type PaymentsReportInstallmentsDto,
  type PaymentsReportRequestDto,
  type PaymentsReportSectionDto,
} from './dto/payments-report.dto';
import type {
  PaymentsReportModel,
  ReportCompany,
  ReportCriteria,
  ReportPeriod,
  ReportRow,
  ReportSection,
} from './payments-report.model';
import {
  REPORT_PAGE_MARGIN,
  paymentsReportFileName,
  renderPaymentsReportFooter,
  renderPaymentsReportHtml,
} from './payments-report.template';

/**
 * A report holds at most this many rows (both sections together), about
 * 130 A4 pages. Past it the request is refused rather than cut: an
 * accounting document must never silently miss rows.
 */
export const REPORT_MAX_ROWS = 5000;

/** The payments report as a PDF, ready to stream. */
export interface PaymentsReportFile {
  buffer: Buffer;
  fileName: string;
}

/** The orders a section reads, and the period its money is counted in. */
interface SectionScope {
  doctorId: string | undefined;
  period: ReportPeriod;
  received: BusinessDayRange;
}

const INSTALLMENT_ROW_SELECT = {
  id: true,
  amount: true,
  status: true,
  paymentMethod: true,
  transactionId: true,
  merchantOrderNumber: true,
  invoiceNumber: true,
  paidAt: true,
  createdAt: true,
  order: {
    select: {
      orderCode: true,
      doctor: { select: { fullName: true } },
      patient: { select: { fullName: true } },
    },
  },
  installment: { select: { installmentNumber: true } },
  quotation: {
    select: { packName: true, _count: { select: { installments: true } } },
  },
} satisfies Prisma.PaymentSelect;

const FEE_ROW_SELECT = {
  id: true,
  orderCode: true,
  treatmentFeeAmount: true,
  treatmentFeePaymentMethod: true,
  treatmentFeePaymentStatus: true,
  treatmentFeePaidAt: true,
  treatmentFeeInvoiceNumber: true,
  doctor: { select: { fullName: true } },
  patient: { select: { fullName: true } },
  // The card fee's settled ClicToPay attempt carries its references.
  payments: {
    where: {
      purpose: PaymentPurpose.treatment_fee,
      status: PaymentRecordStatus.success,
    },
    select: { transactionId: true, merchantOrderNumber: true },
    orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
    take: 1,
  },
} satisfies Prisma.DentalOrderSelect;

type InstallmentRow = Prisma.PaymentGetPayload<{
  select: typeof INSTALLMENT_ROW_SELECT;
}>;
type FeeRow = Prisma.DentalOrderGetPayload<{ select: typeof FEE_ROW_SELECT }>;

/**
 * The payments report: what the payments desk shows for a period and a
 * tab's filters — every matching row (all pages), and the money
 * collected, summed by PaymentsSummaryService's own queries so the PDF and
 * the desk's figures follow one definition of "received".
 *
 * Security: a dentist's report covers their own orders, whatever
 * doctorId they send (as every payments list); the rows come from the
 * same where-builders as the lists, archived orders excluded; the PDF is
 * printed from escaped HTML with no network access.
 */
@Injectable()
export class PaymentsReportService {
  private readonly logger = new Logger(PaymentsReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly summaries: PaymentsSummaryService,
    private readonly settings: CompanyBillingSettingsService,
    private readonly pdf: PdfRendererService,
  ) {}

  async render(
    request: PaymentsReportRequestDto,
    caller: Caller,
  ): Promise<PaymentsReportFile> {
    const model = await this.buildModel(request, caller);
    const buffer = await this.pdf.render(renderPaymentsReportHtml(model), {
      footerTemplate: renderPaymentsReportFooter(model),
      margin: REPORT_PAGE_MARGIN,
    });
    this.logger.log(
      `Payments report (${model.kind}, ${model.period.from ?? '…'} → ${model.period.to}, ${model.sections
        .map((s) => `${s.kind}:${s.rows.length}`)
        .join(' ')}) for user ${caller.userId}`,
    );
    return { buffer, fileName: paymentsReportFileName(model) };
  }

  /** Everything the report prints, without printing it. */
  async buildModel(
    request: PaymentsReportRequestDto,
    caller: Caller,
  ): Promise<PaymentsReportModel> {
    const admin = isAdmin(caller);
    const period = resolveReportPeriod(request);
    // Throws 400 INVALID_DATE_RANGE before any query when to < from.
    const received = businessDayRange(period.from, period.to);
    const kinds = sectionKinds(request.kind);
    const fees = request.treatmentFees ?? {};
    const installments = request.installments ?? {};
    const scopeOf = (section: PaymentsReportSectionDto): SectionScope => ({
      // A dentist reads their own orders only, whatever they send.
      doctorId: admin ? section.doctorId : caller.userId,
      period,
      received,
    });

    const feeScope = scopeOf(fees);
    const installmentScope = scopeOf(installments);
    const feeWhere = kinds.fees ? this.feeWhere(fees, feeScope) : null;
    const installmentWhere = kinds.installments
      ? this.installmentWhere(installments, installmentScope)
      : null;

    // Refuse an oversized report before reading a single row.
    const [feeCount, installmentCount] = await Promise.all([
      feeWhere ? this.prisma.dentalOrder.count({ where: feeWhere }) : 0,
      installmentWhere
        ? this.prisma.payment.count({ where: installmentWhere })
        : 0,
    ]);
    if (feeCount + installmentCount > REPORT_MAX_ROWS) {
      throw new BadRequestException(
        `This report would hold ${feeCount + installmentCount} payments; ${REPORT_MAX_ROWS} at most. Narrow the period or the filters.`,
        'REPORT_TOO_LARGE',
      );
    }

    const [feeSection, installmentSection, settings, names] = await Promise.all(
      [
        feeWhere ? this.feeSection(fees, feeScope, feeWhere) : null,
        installmentWhere
          ? this.installmentSection(
              installments,
              installmentScope,
              installmentWhere,
            )
          : null,
        this.settings.getActive(),
        this.userNames([
          caller.userId,
          admin ? fees.doctorId : undefined,
          admin ? installments.doctorId : undefined,
        ]),
      ],
    );

    // An admin's practitioner filter prints the dentist's name; a dentist
    // never gets the column (every row is theirs).
    const practitioner = (doctorId: string | undefined) =>
      admin && doctorId ? (names.get(doctorId) ?? doctorId) : null;
    const sections: ReportSection[] = [];
    if (feeSection) {
      sections.push({
        ...feeSection,
        criteria: {
          ...feeSection.criteria,
          practitioner: practitioner(fees.doctorId),
        },
      });
    }
    if (installmentSection) {
      sections.push({
        ...installmentSection,
        criteria: {
          ...installmentSection.criteria,
          practitioner: practitioner(installments.doctorId),
        },
      });
    }

    return {
      lang: request.lang ?? 'fr',
      kind: request.kind,
      period,
      generatedAt: new Date(),
      generatedBy: names.get(caller.userId) ?? null,
      showPractitioner: admin,
      brandName: brandName(settings),
      company: companyOf(settings),
      logo: documentLogo(settings?.companyLogoPath),
      sections,
      currency: settings?.defaultCurrency?.trim() || 'TND',
    };
  }

  // ─── Treatment fees ────────────────────────────────────────────────

  private feeWhere(
    filters: PaymentsReportSectionDto,
    scope: SectionScope,
  ): Prisma.DentalOrderWhereInput {
    return treatmentFeeWhere(
      {
        search: filters.search,
        // "Toutes les dates": no date filter, as the desk's list (a fee
        // still to confirm has no paid date and stays listed).
        from: scope.period.allDates
          ? undefined
          : (scope.period.from ?? undefined),
        to: scope.period.allDates ? undefined : scope.period.to,
        methods: filters.methods,
        statuses: filters.statuses,
      },
      scope.doctorId,
    );
  }

  private async feeSection(
    filters: PaymentsReportSectionDto,
    scope: SectionScope,
    where: Prisma.DentalOrderWhereInput,
  ): Promise<ReportSection> {
    const sort = filters.sort ?? PaymentsReportSort.recent;
    const byAmount =
      sort === PaymentsReportSort.amountDesc ||
      sort === PaymentsReportSort.amountAsc;
    const ascending =
      sort === PaymentsReportSort.oldest ||
      sort === PaymentsReportSort.amountAsc;
    const [rows, collected] = await Promise.all([
      this.prisma.dentalOrder.findMany({
        where,
        select: FEE_ROW_SELECT,
        orderBy: treatmentFeeOrderBy({
          sortBy: byAmount
            ? TreatmentFeeSortBy.amount
            : TreatmentFeeSortBy.paidAt,
          sortOrder: ascending ? SortOrder.asc : SortOrder.desc,
        }),
      }),
      this.summaries.treatmentFeesCollected(
        scope.received,
        ordersOf(scope.doctorId),
        where,
      ),
    ]);
    return {
      kind: 'treatment_fee',
      criteria: criteriaOf(filters, null),
      rows: rows.map(feeRow),
      collected,
    };
  }

  // ─── Installments ──────────────────────────────────────────────────

  private installmentWhere(
    filters: PaymentsReportInstallmentsDto,
    scope: SectionScope,
  ): Prisma.PaymentWhereInput {
    return paymentListWhere(
      {
        purpose: PaymentPurpose.installment,
        search: filters.search,
        from: scope.period.allDates
          ? undefined
          : (scope.period.from ?? undefined),
        to: scope.period.allDates ? undefined : scope.period.to,
        methods: filters.methods,
        statuses: filters.statuses,
        installmentMin: filters.installmentMin,
        installmentMax: filters.installmentMax,
      },
      scope.doctorId,
    );
  }

  private async installmentSection(
    filters: PaymentsReportInstallmentsDto,
    scope: SectionScope,
    where: Prisma.PaymentWhereInput,
  ): Promise<ReportSection> {
    const [rows, collected] = await Promise.all([
      this.prisma.payment.findMany({ where, select: INSTALLMENT_ROW_SELECT }),
      this.summaries.installmentsCollected(
        scope.received,
        ordersOf(scope.doctorId),
        where,
      ),
    ]);
    const installment = {
      min: filters.installmentMin ?? null,
      max: filters.installmentMax ?? null,
    };
    return {
      kind: 'installment',
      criteria: criteriaOf(filters, installment),
      rows: sortInstallments(
        rows,
        filters.sort ?? PaymentsReportSort.recent,
      ).map(installmentRow),
      collected,
    };
  }

  /** Full names by user id (the caller, the practitioners picked). */
  private async userNames(
    ids: (string | undefined)[],
  ): Promise<Map<string, string>> {
    const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (wanted.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: wanted } },
      select: { id: true, fullName: true },
    });
    return new Map(users.map((user) => [user.id, user.fullName]));
  }
}

// ─── Pure helpers ───────────────────────────────────────────────────

/**
 * The days a report covers. As the desk: no date → today; only `to` →
 * every date up to it; `allDates` → no date filter on the rows at all
 * (the money is still counted up to today).
 */
export function resolveReportPeriod(
  request: PaymentsReportRequestDto,
): ReportPeriod {
  if (request.allDates) {
    if (request.from) {
      throw new BadRequestException(
        '"All dates" has no start day: send allDates without from.',
        'INVALID_DATE_RANGE',
      );
    }
    return { from: null, to: request.to ?? businessToday(), allDates: true };
  }
  const { from, to } = resolveTakingsPeriod(request.from, request.to);
  if (to) return { from, to, allDates: false };
  // Only `from`: from that day up to today.
  const today = businessToday();
  return { from, to: from && from > today ? from : today, allDates: false };
}

function sectionKinds(kind: PaymentsReportKind): {
  fees: boolean;
  installments: boolean;
} {
  return {
    fees: kind !== PaymentsReportKind.installment,
    installments: kind !== PaymentsReportKind.treatmentFee,
  };
}

/** The orders whose money is counted: a dentist's (or every) live order. */
function ordersOf(doctorId: string | undefined): Prisma.DentalOrderWhereInput {
  return doctorId ? { deletedAt: null, doctorId } : { deletedAt: null };
}

function criteriaOf(
  filters: PaymentsReportSectionDto,
  installment: ReportCriteria['installment'],
): ReportCriteria {
  return {
    practitioner: null,
    methods: filters.methods ?? [],
    statuses: filters.statuses ?? [],
    search: filters.search?.trim() || null,
    installment,
  };
}

/**
 * The desk's order: the date each payment happened (newest or oldest
 * first), or the amount; the id settles ties, as on the desk.
 */
export function sortInstallments(
  rows: InstallmentRow[],
  sort: PaymentsReportSort,
): InstallmentRow[] {
  const sign =
    sort === PaymentsReportSort.oldest || sort === PaymentsReportSort.amountAsc
      ? 1
      : -1;
  const byAmount =
    sort === PaymentsReportSort.amountDesc ||
    sort === PaymentsReportSort.amountAsc;
  return [...rows].sort((a, b) => {
    if (byAmount) {
      const amount = a.amount.comparedTo(b.amount);
      if (amount !== 0) return sign * amount;
      // Equal amounts: newest first, then the id (buildPaymentOrderBy).
      const created = b.createdAt.getTime() - a.createdAt.getTime();
      if (created !== 0) return created;
      return sign * compareIds(a.id, b.id);
    }
    const at = paymentEventDate(a).getTime() - paymentEventDate(b).getTime();
    return sign * (at || compareIds(a.id, b.id));
  });
}

function installmentRow(payment: InstallmentRow): ReportRow {
  return {
    date: paymentEventDate(payment),
    orderCode: payment.order.orderCode,
    practitioner: payment.order.doctor?.fullName ?? null,
    patient: payment.order.patient?.fullName ?? null,
    method: payment.paymentMethod,
    status: payment.status,
    amount: payment.amount,
    transactionRef:
      payment.transactionId ?? payment.merchantOrderNumber ?? null,
    receiptNumber:
      payment.status === PaymentRecordStatus.success
        ? payment.invoiceNumber
        : null,
    installment: payment.installment
      ? {
          rank: payment.installment.installmentNumber,
          total: payment.quotation?._count.installments || null,
          packName: payment.quotation?.packName ?? null,
        }
      : null,
  };
}

function feeRow(order: FeeRow): ReportRow {
  const attempt = order.payments[0];
  return {
    date: order.treatmentFeePaidAt,
    orderCode: order.orderCode,
    practitioner: order.doctor?.fullName ?? null,
    patient: order.patient?.fullName ?? null,
    method: order.treatmentFeePaymentMethod,
    status: order.treatmentFeePaymentStatus,
    amount: order.treatmentFeeAmount,
    transactionRef:
      attempt?.transactionId ?? attempt?.merchantOrderNumber ?? null,
    receiptNumber:
      order.treatmentFeePaymentStatus === PaymentRecordStatus.success
        ? order.treatmentFeeInvoiceNumber
        : null,
    installment: null,
  };
}

/** The issuer block, from the billing settings only: nothing is invented. */
function companyOf(settings: CompanyBillingSettings | null): ReportCompany {
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
    website: text(settings?.websiteDomain),
  };
}

/** The brand over the title: the trade name, else ORALIGN. */
function brandName(settings: CompanyBillingSettings | null): string {
  return settings?.tradeName?.trim() || 'ORALIGN';
}
