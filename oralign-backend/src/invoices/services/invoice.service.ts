import { Injectable, Logger } from '@nestjs/common';
import { InvoiceStatus, Prisma, UserRole } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanyBillingSettingsService } from '../../quotations/services/company-billing-settings.service';
import { lookupActorName } from '../../common/access/actor-snapshot';
import type { Caller } from '../../common/access/caller';
import {
  assertInvoiceNumberFree,
  invoiceNumberTaken,
  type InvoiceNumberOwner,
} from '../../common/billing/invoice-number';
import {
  computeWithholding,
  dec,
  inclusiveInvoiceTotals,
  percentOf,
  round3,
  toAmount,
} from '../../common/billing/tax-split';
import {
  CreateInvoiceDto,
  InvoiceFilterDto,
  InvoiceLineInputDto,
  InvoiceSortBy,
  InvoiceSortOrder,
  UpdateInvoiceDto,
} from '../dto/invoice.dto';
import { issueDateFilter } from './invoice-period';

/**
 * TND carries 3 decimals — the same rounding QuotationService uses, so a
 * manual invoice and a quote never disagree by a millime.
 */
const round = (n: number): number =>
  Math.round((Number.isFinite(n) ? n : 0) * 1000) / 1000;

/**
 * What an invoice bills, stamp excluded: its Total TTC minus the droit de
 * timbre added on top (every facture carries its own). Never negative.
 */
const billedWithoutStamp = (inv: {
  totalTtc: Prisma.Decimal | number;
  stampDuty: Prisma.Decimal | number;
}): Prisma.Decimal => Prisma.Decimal.max(0, dec(inv.totalTtc).minus(dec(inv.stampDuty)));

const num = (v: Prisma.Decimal | number | null | undefined): number =>
  v === null || v === undefined ? 0 : Number(v);

export interface InvoiceTotals {
  subTotalHt: number;
  tvaAmount: number;
  totalTtc: number;
  /**
   * The discount ACTUALLY applied — clamped to the gross HT. This is the
   * value that gets persisted: storing the raw request value while
   * computing with the clamped one made the PDF reconstruct a gross HT
   * (subTotalHt + discount) that no line ever added up to.
   */
  discountApplied: number;
  /** Per-line HT, index-aligned with the input lines. */
  lineHt: number[];
}

/** Everything an invoice stores about money, in either pricing mode. */
export interface InvoiceMoney extends InvoiceTotals {
  /** The stamp actually added on top (TTC mode: 0 when the lines bill nothing). */
  stampApplied: number;
  /** Stored per line as `unitPrice`: the HT unit price (derived in TTC mode). */
  unitPrice: number[];
  /** Stored per line as `unitPriceTtc`: the typed TTC price, null in HT mode. */
  unitPriceTtc: (number | null)[];
  withholdingRate: number | null;
  withholdingAmount: number;
  netPayable: number;
}

export interface InvoiceMoneyInput {
  pricesIncludeTax: boolean;
  tvaRate: number;
  /** HT in HT mode, TTC in TTC mode — the same unit as the lines. */
  discountAmount: number;
  stampDuty: number;
  /** Retenue à la source (%), null/0 = none. */
  withholdingRate: number | null;
}

/** Statuses past which an edit must leave a trace. */
const LOCKED_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.issued,
  InvoiceStatus.paid,
];

/** Row shape every read path returns, so the DTO mapping stays in one place. */
const INVOICE_INCLUDE = {
  lines: { orderBy: { position: 'asc' } },
  order: { select: { id: true, orderCode: true } },
  patient: { select: { id: true, fullName: true } },
  doctor: { select: { id: true, fullName: true, email: true } },
} as const;

// ─── JSON shape ───────────────────────────────────────────────────────
// Prisma serialises Decimal as a string. The API contract says "numbers
// as numbers": every money column of an invoice and of its lines goes out
// as a JS number with 3 decimals, so the screens never parse strings.

type DecimalToNumber<V> = V extends Prisma.Decimal ? number : V;
type PlainLine<L> = { [P in keyof L]: DecimalToNumber<L[P]> };
export type InvoiceJson<T> = {
  [K in keyof T]: K extends 'lines'
    ? T[K] extends Array<infer L>
      ? PlainLine<L>[]
      : T[K]
    : DecimalToNumber<T[K]>;
};

const isDecimal = (v: unknown): v is Prisma.Decimal =>
  v instanceof Prisma.Decimal || Prisma.Decimal.isDecimal(v);

function plainObject<T extends object>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = isDecimal(value) ? toAmount(value) : value;
  }
  return out;
}

/** Decimal columns -> numbers, on the invoice and on each of its lines. */
export function toInvoiceJson<T extends object>(row: T): InvoiceJson<T> {
  const out = plainObject(row);
  if (Array.isArray(out.lines)) {
    out.lines = (out.lines as object[]).map((line) => plainObject(line));
  }
  return out as InvoiceJson<T>;
}

/**
 * Manual / admin invoicing.
 *
 * Deliberately NOT a second billing system: the numbering counter, the
 * company header and the PDF template all come from the existing stack.
 * What lives here is only what the on-the-fly receipts could not express —
 * free line items, an editable client block, a status, and an audit trail.
 *
 * The one rule that matters: **no currency figure is ever taken from the
 * client**. The DTOs carry no totals at all; `computeMoney` derives
 * everything from (quantity, unitPrice, per-line VAT, discount, stamp
 * duty, withholding rate) on every create and every update.
 */
@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billingSettings: CompanyBillingSettingsService,
  ) {}

  // ─── Money ──────────────────────────────────────────────────────────

  /**
   * Legacy HT pricing: lines typed HT, TVA and stamp added on top.
   *
   * VAT is computed PER LINE (a line may override the invoice rate), so a
   * mixed-rate invoice is exact rather than approximated from a blended
   * rate. The global discount is applied to the HT subtotal and clamped to
   * it — a discount can never produce a negative invoice — then spread
   * across the lines proportionally so each line's VAT shrinks with it.
   *
   * Stamp duty is a flat fiscal charge: it is added to the TTC and is NOT
   * subject to VAT.
   */
  static computeTotals(
    lines: InvoiceLineInputDto[],
    invoiceTvaRate: number,
    discountAmount: number,
    stampDuty: number,
  ): InvoiceTotals {
    const safeInvoiceRate = Math.max(0, Math.min(100, invoiceTvaRate));

    const lineHt = lines.map((l) =>
      round(Math.max(0, l.quantity ?? 1) * Math.max(0, l.unitPrice ?? 0)),
    );
    const grossHt = round(lineHt.reduce((sum, v) => sum + v, 0));

    // Clamp: a remise larger than the invoice zeroes it, never inverts it.
    const discount = Math.min(Math.max(0, discountAmount), grossHt);
    const subTotalHt = round(grossHt - discount);

    // Proportional spread so per-line VAT follows the discount. When the
    // invoice is fully discounted (grossHt === 0) every line weighs 0.
    const ratio = grossHt > 0 ? subTotalHt / grossHt : 0;

    let tvaAmount = 0;
    lines.forEach((line, i) => {
      const rate = Math.max(
        0,
        Math.min(100, line.tvaRate ?? safeInvoiceRate),
      );
      tvaAmount += (lineHt[i] * ratio * rate) / 100;
    });
    tvaAmount = round(tvaAmount);

    const stamp = round(Math.max(0, stampDuty));
    const totalTtc = round(subTotalHt + tvaAmount + stamp);

    return {
      subTotalHt,
      tvaAmount,
      totalTtc,
      discountApplied: round(discount),
      lineHt,
    };
  }

  /**
   * A remise typed as a percentage: that % of the lines' gross (quantity x
   * unit price, in the invoice's own unit, TTC or HT), to the millime.
   */
  static discountFromPercent(
    lines: InvoiceLineInputDto[],
    percent: number,
  ): number {
    const gross = lines.reduce(
      (sum, l) =>
        sum.plus(
          round3(
            dec(Math.max(0, Number(l.quantity ?? 1) || 0)).mul(
              dec(Math.max(0, Number(l.unitPrice ?? 0) || 0)),
            ),
          ),
        ),
      dec(0),
    );
    return toAmount(percentOf(gross, percent));
  }

  /**
   * The single source of truth for every amount an invoice stores.
   *
   * TTC mode (the company's normal pricing, every automatic invoice): the
   * line prices are typed TTC (TVA included, stamp NOT included), HT/TVA
   * are derived BACKWARDS by the shared helper, and the droit de timbre
   * is ADDED on top (owner decision 2026-11-20: every payment, so every
   * facture, carries its own stamp): HT + TVA + timbre = total exactly.
   * HT mode keeps the historical forward maths (TVA and stamp on top).
   *
   * The retenue à la source is taken on the TTC WITHOUT the stamp in both
   * modes (owner decision), and net = total - retenue.
   */
  static computeMoney(
    lines: InvoiceLineInputDto[],
    input: InvoiceMoneyInput,
  ): InvoiceMoney {
    if (input.pricesIncludeTax) {
      const t = inclusiveInvoiceTotals(
        lines.map((l) => ({
          quantity: l.quantity ?? 1,
          unitPriceTtc: l.unitPrice ?? 0,
          tvaRate: l.tvaRate,
        })),
        input.tvaRate,
        input.discountAmount,
        input.stampDuty,
        input.withholdingRate,
      );
      return {
        subTotalHt: toAmount(t.subTotalHt),
        tvaAmount: toAmount(t.tvaAmount),
        totalTtc: toAmount(t.totalTtc),
        discountApplied: toAmount(t.discountApplied),
        lineHt: t.lineHt.map((v) => toAmount(v)),
        stampApplied: toAmount(t.stamp),
        unitPrice: t.unitHt.map((v) => toAmount(v)),
        unitPriceTtc: lines.map((l) => toAmount(l.unitPrice ?? 0)),
        withholdingRate: t.withholdingRate ? toAmount(t.withholdingRate) : null,
        withholdingAmount: toAmount(t.withholdingAmount),
        netPayable: toAmount(t.netPayable),
      };
    }

    const legacy = InvoiceService.computeTotals(
      lines,
      input.tvaRate,
      input.discountAmount,
      input.stampDuty,
    );
    const stampApplied = round(Math.max(0, input.stampDuty));
    // Retenue on the TTC without the stamp; the net still pays the stamp.
    const withholding = computeWithholding(
      dec(legacy.totalTtc).minus(stampApplied),
      input.withholdingRate,
    );
    return {
      ...legacy,
      stampApplied,
      unitPrice: lines.map((l) => l.unitPrice ?? 0),
      unitPriceTtc: lines.map(() => null),
      withholdingRate: withholding.rate ? toAmount(withholding.rate) : null,
      withholdingAmount: toAmount(withholding.amount),
      netPayable: toAmount(dec(legacy.totalTtc).minus(withholding.amount)),
    };
  }

  // ─── Reads ──────────────────────────────────────────────────────────

  async list(filters: InvoiceFilterDto) {
    const page = Math.max(filters.page ?? 1, 1);
    const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100);
    const where = this.buildWhere(filters);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        include: INVOICE_INCLUDE,
        orderBy: this.buildOrderBy(filters),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: data.map((row) => toInvoiceJson(row)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Aggregate of the CURRENT filter, not of the current page — the admin
   * needs "total billed in March", which pagination would otherwise hide.
   * Cancelled invoices are excluded from the money figures on purpose.
   */
  async summarise(filters: InvoiceFilterDto) {
    const where = this.buildWhere(filters);
    // Tab badges need the split per status WITHOUT the status filter —
    // clicking "Payées" must not zero the other tabs' counts. Everything
    // else (search, period, trash) still applies.
    const whereNoStatus = this.buildWhere({ ...filters, statuses: undefined });
    const [all, billable] = await this.prisma.$transaction([
      this.prisma.invoice.aggregate({ where, _count: { _all: true } }),
      this.prisma.invoice.aggregate({
        where: { ...where, status: { not: InvoiceStatus.cancelled } },
        _sum: {
          subTotalHt: true,
          tvaAmount: true,
          totalTtc: true,
          withholdingAmount: true,
          netPayable: true,
        },
        _count: { _all: true },
      }),
    ]);
    // Separate call: groupBy's strict generics don't fit the PrismaPromise
    // array of $transaction, and `_count: true` types each group count as
    // a plain number. Tab counts one request behind the totals is fine.
    const grouped = await this.prisma.invoice.groupBy({
      by: ['status'],
      where: whereNoStatus,
      _count: true,
    });

    const byStatus: Record<string, number> = {};
    let totalAllStatuses = 0;
    for (const g of grouped) {
      byStatus[g.status] = g._count;
      totalAllStatuses += g._count;
    }

    return {
      count: all._count._all,
      billableCount: billable._count._all,
      subTotalHt: num(billable._sum.subTotalHt),
      tvaAmount: num(billable._sum.tvaAmount),
      totalTtc: num(billable._sum.totalTtc),
      withholdingAmount: num(billable._sum.withholdingAmount),
      netPayable: num(billable._sum.netPayable),
      byStatus,
      totalAllStatuses,
    };
  }

  async getById(id: string, opts: { allowDeleted?: boolean } = {}) {
    const row = await this.prisma.invoice.findFirst({
      where: { id, ...(opts.allowDeleted ? {} : { deletedAt: null }) },
      include: {
        ...INVOICE_INCLUDE,
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!row) throw new NotFoundException('Invoice not found');
    return toInvoiceJson(row);
  }

  /**
   * Practitioner lookup for the create form (owner decision: the invoice
   * customer is the "Docteur", never a patient). Each match carries the
   * clinic block the form prefills and the practitioner's recent orders,
   * with what each one already owes and what was already invoiced on it.
   */
  async searchPractitioners(search?: string) {
    const term = (search ?? '').trim();
    if (term.length < 2) return { data: [] };
    const contains = { contains: term, mode: 'insensitive' as const };

    const doctors = await this.prisma.user.findMany({
      where: {
        role: UserRole.dentist,
        deletedAt: null,
        OR: [
          { fullName: contains },
          { email: contains },
          { phone: contains },
          { dentistProfile: { is: { clinicName: contains } } },
        ],
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        dentistProfile: {
          select: {
            clinicName: true,
            clinicAddress: true,
            city: true,
            country: true,
            clinicPhone: true,
            clinicEmail: true,
            taxId: true,
          },
        },
        doctorOrders: {
          where: { deletedAt: null },
          select: {
            id: true,
            orderCode: true,
            status: true,
            createdAt: true,
            patientId: true,
            patient: { select: { fullName: true } },
            treatmentFeeAmount: true,
            treatmentFeeWithholdingAmount: true,
            treatmentFeeStampAmount: true,
            quotation: {
              select: {
                id: true,
                totalTtc: true,
                packName: true,
                status: true,
                deletedAt: true,
              },
            },
            // What the order already carries on paper, so the admin does
            // not invoice the same money twice. The treatment-fee facture
            // also points at the order (orderId), so it is told apart by
            // treatmentFeeOrderId and summed on its own. Each facture adds
            // its own stamp on top, so what it bills against the quote or
            // the fee is its total WITHOUT the stamp.
            invoices: {
              where: {
                deletedAt: null,
                status: { not: InvoiceStatus.cancelled },
              },
              select: {
                totalTtc: true,
                stampDuty: true,
                treatmentFeeOrderId: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
      orderBy: { fullName: 'asc' },
      take: 10,
    });

    return {
      data: doctors.map((d) => ({
        id: d.id,
        fullName: d.fullName,
        email: d.email,
        phone: d.phone,
        clinicName: d.dentistProfile?.clinicName ?? null,
        clinicAddress: d.dentistProfile?.clinicAddress ?? null,
        city: d.dentistProfile?.city ?? null,
        country: d.dentistProfile?.country ?? null,
        clinicPhone: d.dentistProfile?.clinicPhone ?? null,
        clinicEmail: d.dentistProfile?.clinicEmail ?? null,
        taxId: d.dentistProfile?.taxId ?? null,
        orders: d.doctorOrders.map((o) => ({
          id: o.id,
          orderCode: o.orderCode,
          status: o.status,
          createdAt: o.createdAt,
          patientId: o.patientId,
          patientName: o.patient?.fullName ?? null,
          // Cash collected, and the fee due (TTC, stamp excluded): cash +
          // what was withheld - the stamp charged on top with the payment.
          treatmentFeeAmount:
            o.treatmentFeeAmount === null ? null : toAmount(o.treatmentFeeAmount),
          treatmentFeeDue:
            o.treatmentFeeAmount === null
              ? null
              : toAmount(
                  Prisma.Decimal.max(
                    0,
                    dec(o.treatmentFeeAmount)
                      .plus(dec(o.treatmentFeeWithholdingAmount))
                      .minus(dec(o.treatmentFeeStampAmount)),
                  ),
                ),
          quotation:
            o.quotation && !o.quotation.deletedAt
              ? {
                  id: o.quotation.id,
                  totalTtc: o.quotation.totalTtc,
                  packName: o.quotation.packName,
                  status: o.quotation.status,
                }
              : null,
          // Two figures, never one: "bill the quote" must not subtract the
          // fee's facture, and "bill the fee" must see that facture. Both
          // are TTC WITHOUT the stamps, comparable to the quote's TTC and
          // to the fee due.
          quoteInvoicedTotal: toAmount(
            o.invoices
              .filter((inv) => inv.treatmentFeeOrderId === null)
              .reduce((sum, inv) => sum.plus(billedWithoutStamp(inv)), dec(0)),
          ),
          feeInvoicedTotal: toAmount(
            o.invoices
              .filter((inv) => inv.treatmentFeeOrderId === o.id)
              .reduce((sum, inv) => sum.plus(billedWithoutStamp(inv)), dec(0)),
          ),
        })),
      })),
    };
  }

  private buildWhere(filters: InvoiceFilterDto): Prisma.InvoiceWhereInput {
    const where: Prisma.InvoiceWhereInput = {
      // includeDeleted flips the filter (trash view), never widens it.
      deletedAt: filters.includeDeleted ? { not: null } : null,
    };

    if (filters.statuses?.length) where.status = { in: filters.statuses };
    if (filters.patientId) where.patientId = filters.patientId;
    if (filters.doctorId) where.doctorId = filters.doctorId;
    if (filters.orderId) where.orderId = filters.orderId;

    // Period filter — this is what makes "every invoice of March" a
    // one-click export. Bare dates are Tunis days, both included (the
    // server runs in UTC, where 00:30 in Tunis is still the day before):
    // the list, the totals, the accounting summary, the CSV and the ZIP
    // all cut the period the same way.
    const issueDate = issueDateFilter(filters.issuedFrom, filters.issuedTo);
    if (issueDate) where.issueDate = issueDate;

    const search = filters.search?.trim();
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { clientName: { contains: search, mode: 'insensitive' } },
        { clientEmail: { contains: search, mode: 'insensitive' } },
        { clientPhone: { contains: search, mode: 'insensitive' } },
        { order: { orderCode: { contains: search, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  private buildOrderBy(
    filters: InvoiceFilterDto,
  ): Prisma.InvoiceOrderByWithRelationInput[] {
    const dir = filters.sortOrder ?? InvoiceSortOrder.desc;
    const field = filters.sortBy ?? InvoiceSortBy.issueDate;
    // Secondary + unique final key: rows sharing the same date must have
    // a total order, or offset pagination can show one row twice and
    // drop another at page boundaries.
    return [
      { [field]: dir } as Prisma.InvoiceOrderByWithRelationInput,
      { createdAt: 'desc' },
      { id: 'desc' },
    ];
  }

  // ─── Writes ─────────────────────────────────────────────────────────

  async create(dto: CreateInvoiceDto, caller: Caller) {
    const lines = dto.lines ?? [];
    if (lines.length === 0) {
      throw new BadRequestException(
        'An invoice needs at least one line.',
        'INVOICE_NO_LINES',
      );
    }

    const settings = await this.billingSettings.requireActive();
    await this.assertLinksExist(dto);

    const tvaRate = dto.tvaRate ?? Number(settings.defaultTvaRate ?? 19);
    // Snapshot, not a live read: changing the company stamp duty later
    // must not rewrite invoices that were already issued.
    const stampDuty = dto.stampDuty ?? num(settings.stampDuty);
    const pricesIncludeTax = dto.pricesIncludeTax ?? false;
    // A remise typed as a percentage becomes its amount on the lines' gross.
    const discountPercent = dto.discountPercent ?? null;
    const money = InvoiceService.computeMoney(lines, {
      pricesIncludeTax,
      tvaRate,
      discountAmount:
        discountPercent !== null
          ? InvoiceService.discountFromPercent(lines, discountPercent)
          : (dto.discountAmount ?? 0),
      stampDuty,
      withholdingRate: dto.withholdingRate ?? null,
    });

    const invoiceNumber = dto.invoiceNumber?.trim()
      ? await this.assertNumberFree(dto.invoiceNumber.trim())
      : await this.billingSettings.allocateInvoiceNumber();

    const status = dto.status ?? InvoiceStatus.draft;
    const now = new Date();

    let created;
    try {
      created = await this.prisma.invoice.create({
      data: {
        invoiceNumber,
        status,
        orderId: dto.orderId ?? null,
        patientId: dto.patientId ?? null,
        doctorId: dto.doctorId ?? null,
        clientName: dto.clientName,
        clientEmail: dto.clientEmail ?? null,
        clientPhone: dto.clientPhone ?? null,
        clientAddress: dto.clientAddress ?? null,
        clientCity: dto.clientCity ?? null,
        clientCountry: dto.clientCountry ?? null,
        clientTaxId: dto.clientTaxId ?? null,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : now,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        currency: settings.defaultCurrency || 'TND',
        language: dto.language ?? 'fr',
        tvaRate,
        discountAmount: money.discountApplied,
        discountPercent,
        stampDuty: money.stampApplied,
        subTotalHt: money.subTotalHt,
        tvaAmount: money.tvaAmount,
        totalTtc: money.totalTtc,
        pricesIncludeTax,
        paymentMethod: dto.paymentMethod ?? null,
        paymentReference: dto.paymentReference?.trim() || null,
        withholdingRate: money.withholdingRate,
        withholdingAmount: money.withholdingAmount,
        netPayable: money.netPayable,
        notes: dto.notes ?? null,
        companySnapshot: this.buildCompanySnapshot(settings),
        createdById: caller.userId,
        createdByName: await lookupActorName(this.prisma, caller.userId),
        // Only an invoice that actually reaches issued/paid was issued;
        // creating one straight as "cancelled" stamps nothing, so it
        // stays purgeable like any never-issued draft.
        issuedAt:
          status === InvoiceStatus.issued || status === InvoiceStatus.paid
            ? now
            : null,
        paidAt: status === InvoiceStatus.paid ? now : null,
        lines: {
          create: lines.map((line, i) => ({
            position: i,
            description: line.description,
            quantity: line.quantity ?? 1,
            unitPrice: money.unitPrice[i],
            unitPriceTtc: money.unitPriceTtc[i],
            tvaRate: line.tvaRate ?? null,
            lineHt: money.lineHt[i],
          })),
        },
      },
        include: INVOICE_INCLUDE,
      });
    } catch (error) {
      // TOCTOU on the manual-number pre-check: another writer committed
      // the same number between assertNumberFree and here. A clean 409
      // instead of a raw 500.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw invoiceNumberTaken(invoiceNumber);
      }
      throw error;
    }

    this.logger.log(`Invoice ${created.invoiceNumber} created by ${caller.userId}`);
    return toInvoiceJson(created);
  }

  /**
   * Full update. `lines` provided => the set is REPLACED (delete + insert
   * inside one transaction) because that is how the editor works: the
   * admin adds, edits and removes rows, then saves once.
   *
   * Editing an issued/paid invoice is allowed — the admin desk needs it —
   * but it is recorded: `writeAuditLog` diffs the fields that actually
   * moved and stores who changed what. Cancelling one is how an issued or
   * paid invoice is "deleted": it keeps its number in the sequence.
   */
  async update(id: string, dto: UpdateInvoiceDto, caller: Caller) {
    const before = await this.getById(id, { allowDeleted: true });
    // GET shows an archived invoice (the trash detail); WRITING to one is
    // refused with an explanation instead of a misleading 404.
    if (before.deletedAt) {
      throw new ConflictException(
        `Invoice ${before.invoiceNumber} is archived. Restore it before editing.`,
        'INVOICE_ARCHIVED',
      );
    }
    await this.assertLinksExist(dto);

    // Money is only RECOMPUTED when a money field was actually touched.
    // Editing notes or the client block must not move a millime — that
    // matters most for automatic invoices, whose HT/TVA were derived
    // BACKWARDS from the paid amount.
    const moneyTouched =
      dto.lines !== undefined ||
      dto.tvaRate !== undefined ||
      dto.discountAmount !== undefined ||
      dto.discountPercent !== undefined ||
      dto.stampDuty !== undefined ||
      dto.pricesIncludeTax !== undefined ||
      dto.withholdingRate !== undefined;

    const tvaRate = dto.tvaRate ?? num(before.tvaRate);
    const discountAmount = dto.discountAmount ?? num(before.discountAmount);
    // A remise typed as a percentage stays a percentage until the admin
    // types an amount (or sends null): line or price edits recompute it.
    const storedPercent =
      before.discountPercent === null ? null : num(before.discountPercent);
    // An echoed (unchanged) amount is not "typed as an amount".
    const newAmount =
      dto.discountAmount !== undefined &&
      round(dto.discountAmount) !== round(num(before.discountAmount));
    const discountPercent =
      dto.discountPercent !== undefined
        ? dto.discountPercent
        : newAmount
          ? null
          : storedPercent;
    const stampDuty = dto.stampDuty ?? num(before.stampDuty);
    const pricesIncludeTax = dto.pricesIncludeTax ?? before.pricesIncludeTax;
    const storedRate =
      before.withholdingRate === null ? null : num(before.withholdingRate);
    const requestedRate =
      dto.withholdingRate === undefined ? storedRate : dto.withholdingRate;
    const rateChanged =
      dto.withholdingRate !== undefined &&
      num(dto.withholdingRate) !== num(storedRate);

    let money: InvoiceMoney;
    // The replacement line set, when the lines must be rewritten.
    let pendingLines: InvoiceLineInputDto[] | null = null;
    if (moneyTouched) {
      const lines: InvoiceLineInputDto[] =
        dto.lines ??
        before.lines.map((l) => ({
          description: l.description,
          quantity: num(l.quantity),
          // TTC mode recomputes from the price as typed, never from the
          // derived HT (which already has the TVA and discount out).
          unitPrice:
            pricesIncludeTax && l.unitPriceTtc !== null
              ? num(l.unitPriceTtc)
              : num(l.unitPrice),
          tvaRate: l.tvaRate ?? undefined,
        }));
      if (lines.length === 0) {
        throw new BadRequestException(
          'An invoice needs at least one line.',
          'INVOICE_NO_LINES',
        );
      }
      money = InvoiceService.computeMoney(lines, {
        pricesIncludeTax,
        tvaRate,
        discountAmount:
          discountPercent !== null
            ? InvoiceService.discountFromPercent(lines, discountPercent)
            : discountAmount,
        stampDuty,
        withholdingRate: requestedRate,
      });
      // In TTC mode every line's derived HT depends on the discount and
      // the rate, so the stored lines follow any money edit.
      pendingLines = dto.lines || pricesIncludeTax ? lines : null;

      // An automatic invoice states what the payment really carried: the
      // amount the practitioner withheld stays the one recorded at payment
      // time unless the admin changes the rate on purpose. Like any
      // retenue it is taken on the TTC without the stamp, so it is capped
      // there; the net still pays the stamp.
      const automatic = Boolean(before.paymentId || before.treatmentFeeOrderId);
      if (automatic && !rateChanged) {
        const base = Math.max(0, round(money.totalTtc - money.stampApplied));
        const kept = Math.min(Math.max(0, num(before.withholdingAmount)), base);
        money = {
          ...money,
          withholdingRate: storedRate,
          withholdingAmount: kept,
          netPayable: round(money.totalTtc - kept),
        };
      }
    } else {
      money = {
        subTotalHt: num(before.subTotalHt),
        tvaAmount: num(before.tvaAmount),
        totalTtc: num(before.totalTtc),
        discountApplied: num(before.discountAmount),
        lineHt: [],
        stampApplied: num(before.stampDuty),
        unitPrice: [],
        unitPriceTtc: [],
        withholdingRate: storedRate,
        withholdingAmount: num(before.withholdingAmount),
        netPayable: num(before.netPayable),
      };
    }

    let invoiceNumber = before.invoiceNumber;
    const numberChanged =
      Boolean(dto.invoiceNumber) &&
      dto.invoiceNumber!.trim() !== before.invoiceNumber;
    if (numberChanged) {
      // An automatic invoice shares its number with its payment's receipt
      // and, for a treatment fee, with its order: those are renamed with
      // it below, so they do not count as taken.
      invoiceNumber = await this.assertNumberFree(dto.invoiceNumber!.trim(), {
        invoiceId: before.id,
        paymentId: before.paymentId,
        orderId: before.treatmentFeeOrderId,
      });
    }

    const status = dto.status ?? before.status;
    const now = new Date();
    const entersIssuedOrPaid =
      status === InvoiceStatus.issued || status === InvoiceStatus.paid;

    // Lifecycle stamps as a real state machine:
    //   issuedAt — set the first time the invoice actually reaches
    //     issued/paid, kept afterwards (it WAS issued). Cancelling a
    //     draft that was never issued stamps nothing, so such a draft
    //     stays purgeable.
    //   paidAt — meaningful ONLY while status is paid: entering paid
    //     stamps now, staying paid keeps the original date, leaving paid
    //     clears it. A "paid on" date on an unpaid invoice is a lie.
    const data: Prisma.InvoiceUncheckedUpdateInput = {
      invoiceNumber,
      status,
      clientName: dto.clientName ?? before.clientName,
      clientEmail: dto.clientEmail ?? before.clientEmail,
      clientPhone: dto.clientPhone ?? before.clientPhone,
      clientAddress: dto.clientAddress ?? before.clientAddress,
      clientCity: dto.clientCity ?? before.clientCity,
      clientCountry: dto.clientCountry ?? before.clientCountry,
      clientTaxId: dto.clientTaxId ?? before.clientTaxId,
      issueDate: dto.issueDate ? new Date(dto.issueDate) : before.issueDate,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : before.dueDate,
      language: dto.language ?? (before.language as 'fr' | 'en'),
      tvaRate,
      discountAmount: money.discountApplied,
      discountPercent,
      stampDuty: money.stampApplied,
      subTotalHt: money.subTotalHt,
      tvaAmount: money.tvaAmount,
      totalTtc: money.totalTtc,
      pricesIncludeTax,
      paymentMethod:
        dto.paymentMethod === undefined
          ? before.paymentMethod
          : dto.paymentMethod,
      paymentReference:
        dto.paymentReference === undefined
          ? before.paymentReference
          : dto.paymentReference?.trim() || null,
      withholdingRate: money.withholdingRate,
      withholdingAmount: money.withholdingAmount,
      netPayable: money.netPayable,
      notes: dto.notes ?? before.notes,
      issuedAt: before.issuedAt ?? (entersIssuedOrPaid ? now : null),
      paidAt:
        status === InvoiceStatus.paid
          ? before.status === InvoiceStatus.paid
            ? before.paidAt
            : now
          : null,
    };
    // Scalar FKs (unchecked input) so the optimistic updateMany below can
    // carry them; assertLinksExist has already vetted the targets.
    if (dto.orderId !== undefined) data.orderId = dto.orderId || null;
    if (dto.patientId !== undefined) data.patientId = dto.patientId || null;
    if (dto.doctorId !== undefined) data.doctorId = dto.doctorId || null;

    try {
      await this.prisma.$transaction(async (tx) => {
        if (pendingLines) {
          const lines = pendingLines;
          await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
          await tx.invoiceLine.createMany({
            data: lines.map((line, i) => ({
              invoiceId: id,
              position: i,
              description: line.description,
              quantity: line.quantity ?? 1,
              unitPrice: money.unitPrice[i],
              unitPriceTtc: money.unitPriceTtc[i],
              tvaRate: line.tvaRate ?? null,
              lineHt: money.lineHt[i],
            })),
          });
        }
        // Optimistic guard: the row must still be the one this edit was
        // computed FROM. Two admins saving concurrently would otherwise
        // silently combine half of each edit (lost update); the loser
        // now gets a 409 and refreshes instead.
        const guarded = await tx.invoice.updateMany({
          where: { id, updatedAt: before.updatedAt },
          data,
        });
        if (guarded.count === 0) {
          throw new ConflictException(
            'This invoice was modified by someone else. Reload and retry.',
            'INVOICE_MODIFIED',
          );
        }
        // An automatic invoice and its payment receipt must never show
        // two different numbers: renumbering one renames both, in the
        // same transaction. Same for a treatment fee and its order.
        if (numberChanged && before.paymentId) {
          await tx.payment.update({
            where: { id: before.paymentId },
            data: { invoiceNumber },
          });
        }
        if (numberChanged && before.treatmentFeeOrderId) {
          // Only while the order prints this invoice's number. An order
          // that still prints its legacy TF- receipt keeps it: that is the
          // document the practitioner holds (the facture's notes name it).
          await tx.dentalOrder.updateMany({
            where: {
              id: before.treatmentFeeOrderId,
              OR: [
                { treatmentFeeInvoiceNumber: before.invoiceNumber },
                { treatmentFeeInvoiceNumber: null },
              ],
            },
            data: { treatmentFeeInvoiceNumber: invoiceNumber },
          });
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // TOCTOU on the number check: another writer took it between the
        // pre-check and the commit. Same 409 as the pre-check.
        throw invoiceNumberTaken(invoiceNumber);
      }
      throw error;
    }

    const updated = await this.getById(id);

    // Audit whenever the invoice IS or BECOMES issued/paid. Gating only
    // on the previous status let paid → draft → edit → paid launder a
    // money change without a trace.
    if (
      LOCKED_STATUSES.includes(before.status) ||
      LOCKED_STATUSES.includes(updated.status)
    ) {
      await this.writeAuditLog(
        id,
        caller,
        before,
        updated,
        Boolean(dto.lines),
      );
    }

    return updated;
  }

  async archive(id: string, caller: Caller): Promise<{ id: string }> {
    const row = await this.getById(id, { allowDeleted: true });
    if (row.deletedAt) return { id: row.id }; // already archived — idempotent
    await this.prisma.invoice.update({
      where: { id: row.id },
      data: { deletedAt: new Date() },
    });
    this.logger.log(`Invoice ${row.invoiceNumber} archived by ${caller.userId}`);
    return { id: row.id };
  }

  async restore(id: string) {
    const row = await this.getById(id, { allowDeleted: true });
    if (!row.deletedAt) return row;
    const restored = await this.prisma.invoice.update({
      where: { id },
      data: { deletedAt: null },
      include: INVOICE_INCLUDE,
    });
    return toInvoiceJson(restored);
  }

  /**
   * Trash-first permanent delete, mirroring every other purge in the app.
   * A DRAFT can go for good; anything that was ever issued or paid is a
   * fiscal document: it is cancelled (status cancelled, number kept),
   * never purged — the sequence must have no holes.
   */
  async permanentDelete(id: string): Promise<{ message: string }> {
    const row = await this.getById(id, { allowDeleted: true });
    if (!row.deletedAt) {
      throw new BadRequestException(
        'Archive this invoice before deleting it permanently.',
        'NOT_ARCHIVED',
      );
    }
    if (row.status !== InvoiceStatus.draft || row.issuedAt) {
      throw new ConflictException(
        `Invoice ${row.invoiceNumber} was issued and cannot be permanently deleted — ` +
          'a fiscal sequence may not have holes. Cancel it instead: it keeps its number.',
        'INVOICE_ISSUED',
      );
    }
    await this.prisma.invoice.delete({ where: { id } });
    return { message: 'Invoice permanently deleted' };
  }

  // ─── Internals ──────────────────────────────────────────────────────

  /**
   * Reject a number another document prints (an invoice, an installment
   * receipt, a treatment-fee number) or one inside the future range of
   * the automatic counters. The rules are shared with the receipt-number
   * editor of the payments desk (PaymentsService.updateInvoiceNumber), so
   * neither desk accepts a number the other refuses.
   */
  private async assertNumberFree(
    candidate: string,
    owner?: InvoiceNumberOwner,
  ): Promise<string> {
    await assertInvoiceNumberFree(this.prisma, candidate, owner);
    return candidate;
  }

  /**
   * A supplied order / patient / doctor id must exist and be live.
   * Without this a typo (or a probe) would create an invoice pointing at
   * nothing, and Prisma's FK error would surface as a raw 500.
   */
  private async assertLinksExist(
    dto: Pick<CreateInvoiceDto, 'orderId' | 'patientId' | 'doctorId'>,
  ): Promise<void> {
    if (dto.orderId) {
      const order = await this.prisma.dentalOrder.findFirst({
        where: { id: dto.orderId, deletedAt: null },
        select: { id: true },
      });
      if (!order) throw new NotFoundException('Order not found');
    }
    if (dto.patientId) {
      const patient = await this.prisma.patient.findFirst({
        where: { id: dto.patientId, deletedAt: null },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException('Patient not found');
    }
    if (dto.doctorId) {
      const doctor = await this.prisma.user.findFirst({
        where: { id: dto.doctorId, deletedAt: null },
        select: { id: true },
      });
      if (!doctor) throw new NotFoundException('Doctor not found');
    }
  }

  /** Company header frozen on the row, same idea as Quotation.companySnapshot. */
  private buildCompanySnapshot(settings: {
    companyName: string;
    companyLogoPath: string | null;
    companyAddress: string | null;
    companyCity: string | null;
    companyCountry: string | null;
    companyPhone: string | null;
    companyEmail: string | null;
    taxRegistrationNumber: string | null;
    legalTextTranslations: Prisma.JsonValue | null;
    footerTextTranslations: Prisma.JsonValue | null;
    bankDetails: Prisma.JsonValue | null;
  }): Prisma.InputJsonValue {
    return {
      companyName: settings.companyName,
      companyLogoPath: settings.companyLogoPath ?? null,
      companyAddress: settings.companyAddress ?? null,
      companyCity: settings.companyCity ?? null,
      companyCountry: settings.companyCountry ?? null,
      companyPhone: settings.companyPhone ?? null,
      companyEmail: settings.companyEmail ?? null,
      // The matricule fiscal the PDF prints in the "Emis par" block.
      taxRegistrationNumber: settings.taxRegistrationNumber ?? null,
      legalTextTranslations: settings.legalTextTranslations ?? null,
      footerTextTranslations: settings.footerTextTranslations ?? null,
      bankDetails: settings.bankDetails ?? null,
    } as Prisma.InputJsonValue;
  }

  /** Diff of what actually moved. Nothing moved => no entry. */
  private async writeAuditLog(
    invoiceId: string,
    caller: Caller,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    linesReplaced: boolean,
  ): Promise<void> {
    const watched = [
      'orderId',
      'patientId',
      'doctorId',
      'invoiceNumber',
      'status',
      'clientName',
      'clientEmail',
      'clientPhone',
      'clientAddress',
      'clientCity',
      'clientCountry',
      'clientTaxId',
      'issueDate',
      'dueDate',
      'tvaRate',
      'discountAmount',
      'discountPercent',
      'stampDuty',
      'subTotalHt',
      'tvaAmount',
      'totalTtc',
      'pricesIncludeTax',
      'paymentMethod',
      'paymentReference',
      'withholdingRate',
      'withholdingAmount',
      'netPayable',
      'treatmentFeeOrderId',
      'notes',
      'language',
    ];

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const field of watched) {
      const from = this.plain(before[field]);
      const to = this.plain(after[field]);
      if (from !== to) changes[field] = { from, to };
    }
    if (linesReplaced) changes.lines = { from: 'replaced', to: 'replaced' };

    if (Object.keys(changes).length === 0) return;

    await this.prisma.invoiceAuditLog.create({
      data: {
        invoiceId,
        actorId: caller.userId,
        actorName: await lookupActorName(this.prisma, caller.userId),
        action: changes.status ? 'status_changed' : 'updated',
        changes: changes as Prisma.InputJsonValue,
      },
    });
  }

  /** Decimal/Date -> comparable primitive, so the diff isn't fooled by types. */
  private plain(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'number') return String(value);
    if (typeof value === 'object' && 'toString' in (value as object)) {
      return String(value);
    }
    return value;
  }
}
