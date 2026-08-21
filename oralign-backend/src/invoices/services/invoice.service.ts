import { Injectable, Logger } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
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
  CreateInvoiceDto,
  InvoiceFilterDto,
  InvoiceLineInputDto,
  InvoiceSortBy,
  InvoiceSortOrder,
  UpdateInvoiceDto,
} from '../dto/invoice.dto';

/**
 * TND carries 3 decimals — the same rounding QuotationService uses, so a
 * manual invoice and a quote never disagree by a millime.
 */
const round = (n: number): number =>
  Math.round((Number.isFinite(n) ? n : 0) * 1000) / 1000;

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

/**
 * Manual / admin invoicing.
 *
 * Deliberately NOT a second billing system: the numbering counter, the
 * company header and the PDF template all come from the existing stack.
 * What lives here is only what the on-the-fly receipts could not express —
 * free line items, an editable client block, a status, and an audit trail.
 *
 * The one rule that matters: **no currency figure is ever taken from the
 * client**. The DTOs carry no totals at all; `computeTotals` derives
 * everything from (quantity, unitPrice, per-line VAT, discount, stamp
 * duty) on every create and every update.
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
   * The single source of truth for every amount on an invoice.
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
      data,
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
        _sum: { subTotalHt: true, tvaAmount: true, totalTtc: true },
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
    return row;
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
    // one-click export. `issuedTo` is INCLUSIVE: a bare date lands at
    // 00:00, so we push it to the end of that day.
    if (filters.issuedFrom || filters.issuedTo) {
      const gte = filters.issuedFrom ? new Date(filters.issuedFrom) : undefined;
      let lte: Date | undefined;
      if (filters.issuedTo) {
        lte = new Date(filters.issuedTo);
        if (/^\d{4}-\d{2}-\d{2}$/.test(filters.issuedTo)) {
          lte.setHours(23, 59, 59, 999);
        }
      }
      where.issueDate = { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
    }

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
    const totals = InvoiceService.computeTotals(
      lines,
      tvaRate,
      dto.discountAmount ?? 0,
      stampDuty,
    );

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
        discountAmount: totals.discountApplied,
        stampDuty,
        subTotalHt: totals.subTotalHt,
        tvaAmount: totals.tvaAmount,
        totalTtc: totals.totalTtc,
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
            unitPrice: line.unitPrice ?? 0,
            tvaRate: line.tvaRate ?? null,
            lineHt: totals.lineHt[i],
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
        throw new ConflictException(
          `Invoice number ${invoiceNumber} is already used.`,
          'INVOICE_NUMBER_TAKEN',
        );
      }
      throw error;
    }

    this.logger.log(`Invoice ${created.invoiceNumber} created by ${caller.userId}`);
    return created;
  }

  /**
   * Full update. `lines` provided => the set is REPLACED (delete + insert
   * inside one transaction) because that is how the editor works: the
   * admin adds, edits and removes rows, then saves once.
   *
   * Editing an issued/paid invoice is allowed — the admin desk needs it —
   * but it is recorded: `writeAuditLog` diffs the fields that actually
   * moved and stores who changed what.
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
    // BACKWARDS from the paid amount: re-deriving forwards from the
    // stored line can land 0.001 away from what was actually charged.
    const moneyTouched =
      dto.lines !== undefined ||
      dto.tvaRate !== undefined ||
      dto.discountAmount !== undefined ||
      dto.stampDuty !== undefined;

    const tvaRate = dto.tvaRate ?? num(before.tvaRate);
    const discountAmount = dto.discountAmount ?? num(before.discountAmount);
    const stampDuty = dto.stampDuty ?? num(before.stampDuty);

    let totals: InvoiceTotals;
    // The replacement line set, only when the payload actually carries one.
    let pendingLines: InvoiceLineInputDto[] | null = null;
    if (moneyTouched) {
      const lines: InvoiceLineInputDto[] =
        dto.lines ??
        before.lines.map((l) => ({
          description: l.description,
          quantity: num(l.quantity),
          unitPrice: num(l.unitPrice),
          tvaRate: l.tvaRate ?? undefined,
        }));
      if (lines.length === 0) {
        throw new BadRequestException(
          'An invoice needs at least one line.',
          'INVOICE_NO_LINES',
        );
      }
      totals = InvoiceService.computeTotals(
        lines,
        tvaRate,
        discountAmount,
        stampDuty,
      );
      pendingLines = dto.lines ? lines : null;
    } else {
      totals = {
        subTotalHt: num(before.subTotalHt),
        tvaAmount: num(before.tvaAmount),
        totalTtc: num(before.totalTtc),
        discountApplied: num(before.discountAmount),
        lineHt: [],
      };
    }

    let invoiceNumber = before.invoiceNumber;
    const numberChanged =
      Boolean(dto.invoiceNumber) &&
      dto.invoiceNumber!.trim() !== before.invoiceNumber;
    if (numberChanged) {
      invoiceNumber = await this.assertNumberFree(dto.invoiceNumber!.trim());
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
      discountAmount: totals.discountApplied,
      stampDuty,
      subTotalHt: totals.subTotalHt,
      tvaAmount: totals.tvaAmount,
      totalTtc: totals.totalTtc,
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
          await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
          await tx.invoiceLine.createMany({
            data: pendingLines.map((line, i) => ({
              invoiceId: id,
              position: i,
              description: line.description,
              quantity: line.quantity ?? 1,
              unitPrice: line.unitPrice ?? 0,
              tvaRate: line.tvaRate ?? null,
              lineHt: totals.lineHt[i],
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
        // same transaction.
        if (numberChanged && before.paymentId) {
          await tx.payment.update({
            where: { id: before.paymentId },
            data: { invoiceNumber },
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
        throw new ConflictException(
          `Invoice number ${invoiceNumber} is already used.`,
          'INVOICE_NUMBER_TAKEN',
        );
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
      await this.writeAuditLog(id, caller, before, updated, Boolean(dto.lines));
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
    return this.prisma.invoice.update({
      where: { id },
      data: { deletedAt: null },
      include: INVOICE_INCLUDE,
    });
  }

  /**
   * Trash-first permanent delete, mirroring every other purge in the app.
   * A DRAFT can go for good; anything that was ever issued or paid is a
   * fiscal document and stays archived — the sequence must have no holes.
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
          'a fiscal sequence may not have holes. It stays archived.',
        'INVOICE_ISSUED',
      );
    }
    await this.prisma.invoice.delete({ where: { id } });
    return { message: 'Invoice permanently deleted' };
  }

  // ─── Internals ──────────────────────────────────────────────────────

  /**
   * Reject a number already taken. Checked against BOTH sequences: the
   * manual invoices and the payment receipts share one counter, so a
   * collision there would print two documents with the same number.
   */
  private async assertNumberFree(candidate: string): Promise<string> {
    const [invoice, payment] = await Promise.all([
      this.prisma.invoice.findUnique({ where: { invoiceNumber: candidate } }),
      this.prisma.payment.findUnique({ where: { invoiceNumber: candidate } }),
    ]);
    if (invoice || payment) {
      throw new ConflictException(
        `Invoice number ${candidate} is already used.`,
        'INVOICE_NUMBER_TAKEN',
      );
    }

    // The FUTURE range of the automatic counters is reserved. Accepting
    // FAC-000150 by hand while the counter sits at 100 would make the
    // 50th automatic allocation collide — and an automatic invoice that
    // cannot be created is a payment left without its document.
    const settings = await this.billingSettings.getActive();
    if (settings) {
      const counters: [prefix: string, next: number][] = [
        [settings.invoicePrefix || 'FAC', settings.invoiceNextNumber],
        [
          settings.treatmentFeeInvoicePrefix || 'TF',
          settings.treatmentFeeInvoiceNextNumber,
        ],
      ];
      for (const [prefix, next] of counters) {
        const head = `${prefix}-`;
        if (!candidate.startsWith(head)) continue;
        const tail = candidate.slice(head.length);
        if (/^\d+$/.test(tail) && Number(tail) >= next) {
          throw new ConflictException(
            `Invoice number ${candidate} is inside the automatic ${prefix} sequence (next: ${head}${String(next).padStart(6, '0')}). Pick a number below it or a different prefix.`,
            'INVOICE_NUMBER_RESERVED',
          );
        }
      }
    }
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
      'stampDuty',
      'subTotalHt',
      'tvaAmount',
      'totalTtc',
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
    if (typeof value === 'object' && 'toString' in (value as object)) {
      return String(value);
    }
    return value;
  }
}
