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

    return { subTotalHt, tvaAmount, totalTtc, lineHt };
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
    const [all, billable] = await this.prisma.$transaction([
      this.prisma.invoice.aggregate({ where, _count: { _all: true } }),
      this.prisma.invoice.aggregate({
        where: { ...where, status: { not: InvoiceStatus.cancelled } },
        _sum: { subTotalHt: true, tvaAmount: true, totalTtc: true },
        _count: { _all: true },
      }),
    ]);
    return {
      count: all._count._all,
      billableCount: billable._count._all,
      subTotalHt: num(billable._sum.subTotalHt),
      tvaAmount: num(billable._sum.tvaAmount),
      totalTtc: num(billable._sum.totalTtc),
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
    // Secondary key keeps pagination stable when many rows share a date.
    return [{ [field]: dir } as Prisma.InvoiceOrderByWithRelationInput, { createdAt: 'desc' }];
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

    const created = await this.prisma.invoice.create({
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
        discountAmount: dto.discountAmount ?? 0,
        stampDuty,
        subTotalHt: totals.subTotalHt,
        tvaAmount: totals.tvaAmount,
        totalTtc: totals.totalTtc,
        notes: dto.notes ?? null,
        companySnapshot: this.buildCompanySnapshot(settings),
        createdById: caller.userId,
        createdByName: await lookupActorName(this.prisma, caller.userId),
        issuedAt: status === InvoiceStatus.draft ? null : now,
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
    const before = await this.getById(id);
    await this.assertLinksExist(dto);

    const settings = await this.billingSettings.requireActive();

    // Lines: the payload when given, otherwise the stored ones re-fed
    // through the SAME maths so totals can never drift from the lines.
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

    const tvaRate = dto.tvaRate ?? num(before.tvaRate);
    const discountAmount = dto.discountAmount ?? num(before.discountAmount);
    const stampDuty = dto.stampDuty ?? num(before.stampDuty);
    const totals = InvoiceService.computeTotals(
      lines,
      tvaRate,
      discountAmount,
      stampDuty,
    );

    let invoiceNumber = before.invoiceNumber;
    if (dto.invoiceNumber && dto.invoiceNumber.trim() !== before.invoiceNumber) {
      invoiceNumber = await this.assertNumberFree(dto.invoiceNumber.trim());
    }

    const status = dto.status ?? before.status;
    const now = new Date();

    const data: Prisma.InvoiceUpdateInput = {
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
      discountAmount,
      stampDuty,
      subTotalHt: totals.subTotalHt,
      tvaAmount: totals.tvaAmount,
      totalTtc: totals.totalTtc,
      notes: dto.notes ?? before.notes,
      // Stamp the lifecycle dates the first time each state is reached.
      issuedAt:
        before.issuedAt ??
        (status === InvoiceStatus.draft ? null : now),
      paidAt:
        status === InvoiceStatus.paid ? (before.paidAt ?? now) : before.paidAt,
    };

    if (dto.orderId !== undefined) {
      data.order = dto.orderId ? { connect: { id: dto.orderId } } : { disconnect: true };
    }
    if (dto.patientId !== undefined) {
      data.patient = dto.patientId ? { connect: { id: dto.patientId } } : { disconnect: true };
    }
    if (dto.doctorId !== undefined) {
      data.doctor = dto.doctorId ? { connect: { id: dto.doctorId } } : { disconnect: true };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.lines) {
        await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
        await tx.invoiceLine.createMany({
          data: lines.map((line, i) => ({
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
      return tx.invoice.update({ where: { id }, data, include: INVOICE_INCLUDE });
    });

    // Audit only where it earns its keep: an invoice already issued or
    // paid. Editing a draft is normal work, not an event.
    if (LOCKED_STATUSES.includes(before.status)) {
      await this.writeAuditLog(id, caller, before, updated, Boolean(dto.lines));
    }

    // A settings row is required above; keep the reference so a future
    // reader sees the snapshot is intentionally NOT refreshed on update.
    void settings;

    return updated;
  }

  async archive(id: string, caller: Caller): Promise<{ id: string }> {
    const row = await this.getById(id);
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
