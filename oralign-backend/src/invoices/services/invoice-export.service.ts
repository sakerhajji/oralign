import { Injectable, Logger } from '@nestjs/common';
import type { Archiver, ArchiverOptions } from 'archiver';
import { BadRequestException } from '../../common/exceptions/app.exception';
import { InvoiceFilterDto } from '../dto/invoice.dto';
import { InvoiceService } from './invoice.service';
import { InvoicePdfService } from './invoice-pdf.service';

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

  private date(value: Date | null | undefined): string {
    return value ? new Date(value).toISOString().slice(0, 10) : '';
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
      'Client',
      'Email',
      'Telephone',
      'Matricule fiscal',
      'Commande',
      'Devise',
      'Total HT',
      'Remise',
      'TVA (%)',
      'Montant TVA',
      'Droit de timbre',
      'Total TTC',
      'Notes',
    ];

    const lines = rows.map((inv) =>
      [
        inv.invoiceNumber,
        inv.status,
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
        inv.notes,
      ]
        .map((v) => this.cell(v))
        .join(';'),
    );

    // Trailing totals row — what the accountant reconciles against.
    const sum = (pick: (r: (typeof rows)[number]) => unknown): string =>
      this.money(rows.reduce((acc, r) => acc + Number(pick(r) ?? 0), 0));
    lines.push(
      [
        this.cell(`TOTAL (${rows.length})`),
        '', '', '', '', '', '', '', '', '',
        sum((r) => r.subTotalHt),
        sum((r) => r.discountAmount),
        '',
        sum((r) => r.tvaAmount),
        sum((r) => r.stampDuty),
        sum((r) => r.totalTtc),
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

    // A PDF is already compressed — storing beats deflating it.
    const archive = createArchive('zip', { store: true });
    archive.on('warning', (err) =>
      this.logger.warn(`Invoice ZIP warning: ${err.message}`),
    );

    // Detached: the controller pipes the stream immediately and the
    // renders fill it as they complete. Mirrors OrderExportService.
    void (async () => {
      const used = new Set<string>();
      let appended = 0;
      try {
        for (const id of ids) {
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
        void archive.finalize();
      }
    })();

    const stamp = new Date().toISOString().slice(0, 10);
    return { archive, fileName: `factures-${stamp}.zip` };
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
    const from = filters.issuedFrom?.slice(0, 10);
    const to = filters.issuedTo?.slice(0, 10);
    const period = from && to ? `${from}_${to}` : (from ?? to ?? 'toutes');
    return `factures-${period}.${ext}`;
  }
}
