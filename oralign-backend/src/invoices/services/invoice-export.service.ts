import { Injectable, Logger } from '@nestjs/common';
import { InvoiceStatus, PaymentMethod, Prisma } from '@prisma/client';
import type { Archiver, ArchiverOptions } from 'archiver';
import { dec, toAmount } from '../../common/billing/tax-split';
import { BadRequestException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import {
  InvoiceFilterDto,
  InvoiceSortBy,
  InvoiceSortOrder,
} from '../dto/invoice.dto';
import { InvoiceAccountingService } from './invoice-accounting.service';
import { InvoiceService } from './invoice.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { businessDayOf, issueDateFilter } from './invoice-period';

// Same typed-require dance as OrderExportService: archiver's runtime
// export is the callable factory, its bundled types only declare the
// named class exports. See order-export.service.ts for the full note.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const createArchive: (
  format: 'zip' | 'tar',
  options?: ArchiverOptions,
) => Archiver = require('archiver');

/** Hard ceiling on a bulk PDF export — each entry is a Puppeteer render. */
const MAX_ZIP_INVOICES = 200;

/**
 * Ceiling on a whole-period archive (a month is a few hundred factures;
 * a year of a busy lab still fits). Above it: 400, narrow the period.
 */
export const MAX_PERIOD_ZIP_INVOICES = 1000;

/**
 * What a period archive holds: every facture that carries a number in
 * the sequence — issued, paid AND cancelled (a cancelled facture keeps its
 * number, the accountant files it too). Drafts and archived rows never.
 */
export const PERIOD_ZIP_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.issued,
  InvoiceStatus.paid,
  InvoiceStatus.cancelled,
];

/** A file added at the top of an archive (the period recap, its journal). */
interface ZipExtra {
  name: string;
  build: () => Promise<Buffer | string>;
}

/** The journal's TOTAL row sums the factures comptabilisées only. */
const COUNTED_STATUSES: InvoiceStatus[] = [InvoiceStatus.issued, InvoiceStatus.paid];

/** The accountant reads French: same words as the printed invoice. */
const METHOD_LABELS: Record<PaymentMethod, string> = {
  card: 'Carte bancaire',
  bank_transfer: 'Virement bancaire',
  cash: 'Espèces',
  cheque: 'Chèque',
};

/** The journal speaks the accountant's French, never the enum. */
export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Brouillon',
  issued: 'Émise',
  paid: 'Payée',
  cancelled: 'Annulée',
};

/**
 * Accountant-facing exports: the whole filtered period as one CSV, or the
 * selected invoices as one ZIP of PDFs.
 *
 * On the CSV format: it is written as UTF-8 **with a BOM** and separated
 * by **semicolons**. That is what makes Excel — in the French/Tunisian
 * locale the accountant actually runs — open the file straight into
 * columns with the accents intact, instead of one mojibake column. No
 * xlsx dependency is pulled in for that.
 */
@Injectable()
export class InvoiceExportService {
  private readonly logger = new Logger(InvoiceExportService.name);

  constructor(
    private readonly invoices: InvoiceService,
    private readonly invoicePdf: InvoicePdfService,
    private readonly prisma: PrismaService,
    private readonly accounting: InvoiceAccountingService,
  ) {}

  /** Excel-safe CSV cell: quote-escape, and neutralise formula injection. */
  private cell(value: unknown): string {
    if (value === null || value === undefined) return '';
    let text = String(value);
    // A cell starting with = + - @ is executed as a formula by Excel and
    // LibreOffice. Prefix it so a client name like "=cmd" stays text.
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    if (/[";\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  private money(value: unknown): string {
    // Comma decimal separator: the same Excel locale that wants `;`.
    return Number(value ?? 0).toFixed(3).replace('.', ',');
  }

  /** The Tunis calendar day, the same day the period filter counts it in. */
  private date(value: Date | null | undefined): string {
    return value ? businessDayOf(new Date(value)) : '';
  }

  /**
   * CSV of every invoice matching the filter — NOT just the current page,
   * which is the whole point: "give me March" has to mean March.
   */
  async buildCsv(
    filters: InvoiceFilterDto,
  ): Promise<{ content: string; fileName: string; mimeType: string }> {
    const rows = await this.collect(filters);

    const header = [
      'Numero',
      'Statut',
      'Date emission',
      'Date echeance',
      // The customer of every invoice is the practitioner.
      'Docteur',
      'Email',
      'Telephone',
      'Matricule fiscal',
      'Commande',
      'Devise',
      // Every row adds up the way the facture prints it: Total HT +
      // Montant TVA + Droit de timbre = Total TTC (the stamp is added to
      // every facture, one per payment), and Net à payer = Total TTC -
      // Montant retenue (the retenue is taken on the TTC without the
      // stamp). The columns are the stored figures, never recomputed.
      'Total HT',
      'Remise',
      'TVA (%)',
      'Montant TVA',
      'Droit de timbre',
      'Total TTC',
      'Mode de paiement',
      'Retenue %',
      'Montant retenue',
      'Net à payer',
      'Notes',
    ];

    const lines = rows.map((inv) =>
      [
        inv.invoiceNumber,
        STATUS_LABELS[inv.status] ?? inv.status,
        this.date(inv.issueDate),
        this.date(inv.dueDate),
        inv.clientName,
        inv.clientEmail,
        inv.clientPhone,
        inv.clientTaxId,
        inv.order?.orderCode ?? '',
        inv.currency,
        this.money(inv.subTotalHt),
        this.money(inv.discountAmount),
        String(inv.tvaRate ?? ''),
        this.money(inv.tvaAmount),
        this.money(inv.stampDuty),
        this.money(inv.totalTtc),
        inv.paymentMethod ? METHOD_LABELS[inv.paymentMethod] : '',
        inv.withholdingRate === null
          ? ''
          : String(inv.withholdingRate).replace('.', ','),
        this.money(inv.withholdingAmount),
        this.money(inv.netPayable),
        inv.notes,
      ]
        .map((v) => this.cell(v))
        .join(';'),
    );

    // Trailing totals row — what the accountant reconciles against. Every
    // row stays VISIBLE as a detail line (its status says what it is), but
    // only the factures comptabilisées — issued or paid — are summed, the
    // same rule as the accounting summary: a draft is not a sale and a
    // cancelled facture is voided. Two totals for one period is how
    // reconciliation dies. Decimal sums, never floats.
    const counted = rows.filter((r) => COUNTED_STATUSES.includes(r.status));
    const sum = (pick: (r: (typeof rows)[number]) => unknown): string =>
      this.money(
        toAmount(
          counted.reduce(
            (acc, r) => acc.plus(dec(pick(r) as number | null)),
            dec(0),
          ),
        ),
      );
    lines.push(
      [
        this.cell(
          `TOTAL factures comptabilisées (émises + payées) : ${counted.length} sur ${rows.length}`,
        ),
        '', '', '', '', '', '', '', '', '',
        sum((r) => r.subTotalHt),
        sum((r) => r.discountAmount),
        '',
        sum((r) => r.tvaAmount),
        sum((r) => r.stampDuty),
        sum((r) => r.totalTtc),
        '',
        '',
        sum((r) => r.withholdingAmount),
        sum((r) => r.netPayable),
        '',
      ].join(';'),
    );

    // ﻿ = BOM. Without it Excel reads the file as ANSI and every
    // accented character in a client name turns to mojibake.
    const content = `﻿${[header.map((h) => this.cell(h)).join(';'), ...lines].join('\r\n')}\r\n`;

    return {
      content,
      fileName: this.exportFileName(filters, 'csv'),
      mimeType: 'text/csv; charset=utf-8',
    };
  }

  /**
   * ZIP of the selected invoices' PDFs, streamed. Each entry is rendered
   * through the SAME `renderInvoiceRecordBuffer` a single download uses,
   * so the accountant's archive and the one-off download are byte-for-byte
   * the same document.
   */
  async buildPdfZip(ids: string[]): Promise<{ archive: Archiver; fileName: string }> {
    if (ids.length === 0) {
      throw new BadRequestException(
        'Select at least one invoice to export.',
        'NO_INVOICE_SELECTED',
      );
    }
    if (ids.length > MAX_ZIP_INVOICES) {
      throw new BadRequestException(
        `Too many invoices selected (${ids.length}). The limit is ${MAX_ZIP_INVOICES} per archive.`,
        'TOO_MANY_INVOICES',
      );
    }
    const stamp = new Date().toISOString().slice(0, 10);
    return {
      archive: this.streamZip(ids, []),
      fileName: `factures-${stamp}.zip`,
    };
  }

  /**
   * The accountant's pack of a period: every issued, paid and cancelled
   * facture issued in it (Tunis days, both bounds included; not drafts,
   * not archived), oldest first, plus the period's "Récapitulatif
   * comptable" PDF and its sales journal CSV at the top of the archive.
   * 400 NO_INVOICE_IN_PERIOD when there is none, 400 TOO_MANY_INVOICES
   * above MAX_PERIOD_ZIP_INVOICES — both before a single render.
   */
  async buildPeriodPdfZip(range: {
    issuedFrom?: string;
    issuedTo?: string;
  }): Promise<{ archive: Archiver; fileName: string; count: number }> {
    const issueDate = issueDateFilter(range.issuedFrom, range.issuedTo);
    const where: Prisma.InvoiceWhereInput = {
      deletedAt: null,
      status: { in: PERIOD_ZIP_STATUSES },
      ...(issueDate ? { issueDate } : {}),
    };
    const count = await this.prisma.invoice.count({ where });
    if (count === 0) {
      throw new BadRequestException(
        'No issued, paid or cancelled invoice in this period: there is nothing to export.',
        'NO_INVOICE_IN_PERIOD',
      );
    }
    if (count > MAX_PERIOD_ZIP_INVOICES) {
      throw new BadRequestException(
        `This period holds ${count} invoices; an archive takes ${MAX_PERIOD_ZIP_INVOICES} at most. Narrow the period (one month at a time, for example).`,
        'TOO_MANY_INVOICES',
      );
    }
    const rows = await this.prisma.invoice.findMany({
      where,
      select: { id: true },
      orderBy: [{ issueDate: 'asc' }, { invoiceNumber: 'asc' }, { id: 'asc' }],
      take: MAX_PERIOD_ZIP_INVOICES,
    });
    const period = this.periodSlug(range.issuedFrom, range.issuedTo);
    const extras: ZipExtra[] = [
      {
        name: `00-recap-comptable-${period}.pdf`,
        build: async () =>
          (
            await this.accounting.renderPdf({
              issuedFrom: range.issuedFrom,
              issuedTo: range.issuedTo,
            })
          ).buffer,
      },
      {
        name: `00-journal-des-ventes-${period}.csv`,
        build: async () =>
          (
            await this.buildCsv({
              issuedFrom: range.issuedFrom,
              issuedTo: range.issuedTo,
              statuses: PERIOD_ZIP_STATUSES,
              sortBy: InvoiceSortBy.issueDate,
              sortOrder: InvoiceSortOrder.asc,
            })
          ).content,
      },
    ];
    return {
      archive: this.streamZip(
        rows.map((r) => r.id),
        extras,
      ),
      fileName: `factures-${period}.zip`,
      count: rows.length,
    };
  }

  /**
   * The archive stream: `extras` first, then one PDF per id. Detached:
   * the controller pipes the stream immediately and the renders fill it
   * as they complete. Mirrors OrderExportService.
   */
  private streamZip(ids: string[], extras: ZipExtra[]): Archiver {
    // A PDF is already compressed — storing beats deflating it.
    const archive = createArchive('zip', { store: true });
    archive.on('warning', (err) =>
      this.logger.warn(`Invoice ZIP warning: ${err.message}`),
    );
    // Flipped by abort() — the controller aborts on client disconnect and
    // on stream error. Checked before every render so a cancelled download
    // does not burn one Puppeteer render per remaining id.
    let aborted = false;
    archive.on('abort', () => {
      aborted = true;
    });

    void (async () => {
      const used = new Set<string>();
      let appended = 0;
      try {
        for (const extra of extras) {
          if (aborted) return;
          try {
            archive.append(await extra.build(), { name: extra.name });
            used.add(extra.name);
          } catch (error) {
            // The recap or the journal failing must not sink the archive.
            this.logger.warn(
              `${extra.name} skipped in ZIP: ${(error as Error).message}`,
            );
            archive.append(
              `${extra.name} could not be generated: ${(error as Error).message}\n`,
              { name: `_skipped/${extra.name}.txt` },
            );
          }
        }
        for (const id of ids) {
          if (aborted) {
            this.logger.log(
              `Invoice ZIP aborted by the client after ${appended}/${ids.length} PDF(s)`,
            );
            return;
          }
          try {
            const { buffer, fileName } =
              await this.invoicePdf.renderInvoiceRecordBuffer({ invoiceId: id });
            let name = fileName;
            // Two invoices can't collide, but a forced number could.
            let n = 2;
            while (used.has(name)) name = fileName.replace(/\.pdf$/i, `-${n++}.pdf`);
            used.add(name);
            archive.append(buffer, { name });
            appended += 1;
          } catch (error) {
            // One bad invoice must not sink the whole archive: record it
            // in the ZIP so the accountant sees what is missing.
            this.logger.warn(
              `Invoice ${id} skipped in ZIP: ${(error as Error).message}`,
            );
            archive.append(
              `Invoice ${id} could not be rendered: ${(error as Error).message}\n`,
              { name: `_skipped/${id}.txt` },
            );
          }
        }
        this.logger.log(`Invoice ZIP: ${appended}/${ids.length} PDF(s) appended`);
      } finally {
        if (!aborted) void archive.finalize();
      }
    })();

    return archive;
  }

  /**
   * Every row matching the filter, paged through so a wide period can't
   * blow the heap on one query.
   */
  private async collect(filters: InvoiceFilterDto) {
    const out: Awaited<ReturnType<InvoiceService['list']>>['data'] = [];
    let page = 1;
    // 20 pages x 100 = 20 000 invoices, well past any monthly export.
    for (; page <= 200; page += 1) {
      const chunk = await this.invoices.list({ ...filters, page, limit: 100 });
      out.push(...chunk.data);
      if (page >= chunk.totalPages || chunk.data.length === 0) break;
    }
    return out;
  }

  private exportFileName(filters: InvoiceFilterDto, ext: string): string {
    return `factures-${this.periodSlug(filters.issuedFrom, filters.issuedTo)}.${ext}`;
  }

  /** "2026-11-01_2026-11-30", "depuis-2026-11-01", "jusqu-au-2026-11-30", "toutes". */
  private periodSlug(issuedFrom?: string, issuedTo?: string): string {
    const from = issuedFrom?.slice(0, 10);
    const to = issuedTo?.slice(0, 10);
    if (from && to) return `${from}_${to}`;
    if (from) return `depuis-${from}`;
    if (to) return `jusqu-au-${to}`;
    return 'toutes';
  }
}
