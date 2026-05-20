import { Injectable, Logger } from '@nestjs/common';
import { DevisLanguage, Quotation, QuotationStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BadRequestException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { getQuotationLabels, isRtl } from './quotation-i18n';
import { QuotationService } from './quotation.service';

// ── Filesystem layout ──────────────────────────────────────────────────────

/**
 * Where PDFs land on disk. Always written under `uploads/` so the
 * existing static-files middleware at `/uploads` could serve them in
 * theory — BUT note we never expose Quote PDFs via the static route;
 * download is gated through a controller endpoint with RBAC. The
 * relative path stored on the row is the unprefixed segment after
 * `uploads/`.
 */
const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

// Bundled font path (optional — see assets/fonts/README.md).
const ARABIC_FONT_PATH = path.join(
  process.cwd(),
  'assets',
  'fonts',
  'Amiri-Regular.ttf',
);

/**
 * PDF generation for the Quotation module.
 *
 * Layout strategy:
 *   • All amounts and PDF labels come from the i18n dictionary.
 *   • Header has company logo + name + tax block on top, document
 *     metadata on the right.
 *   • Two-column "Issued by" / "Billed to" block uses the snapshots
 *     stored on the Quotation row so the document remains correct even
 *     after admins or doctors edit their settings later.
 *   • Line-item table renders rows for treatment/fabrication/delivery/
 *     discount, then a totals block (HT, VAT, TTC).
 *   • Footer carries legal text + footer text (translated at snapshot
 *     time) + optional bank details.
 *
 * Arabic limitation:
 *   pdfkit doesn't shape Arabic letters (no contextual joining). With
 *   Amiri-Regular.ttf in `assets/fonts/`, Arabic strings render in
 *   isolated forms; without the font, they render as missing-glyph
 *   boxes. Both cases right-align the text. Document: see
 *   `assets/fonts/README.md`.
 */
@Injectable()
export class QuotationPdfService {
  private readonly logger = new Logger(QuotationPdfService.name);
  private arabicFontBuffer: Buffer | null = null;
  private arabicFontChecked = false;

  constructor(private readonly prisma: PrismaService) {}

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Generate the PDF for a quote, write it to disk, and persist the
   * relative path on the row. Quote must have a number + snapshots —
   * the caller is expected to have already invoked
   * QuotationService.ensureSnapshotAndNumber() before this.
   */
  async generateAndPersist(quote: Quotation): Promise<Quotation> {
    if (!quote.quotationNumber) {
      throw new BadRequestException(
        'Quote does not have a quotationNumber yet — cannot render PDF.',
      );
    }
    if (!quote.companySnapshot) {
      throw new BadRequestException(
        'Quote does not have a company snapshot yet — cannot render PDF.',
      );
    }

    const relDir = path.posix.join('orders', quote.orderId, 'quotes');
    const absDir = path.join(UPLOAD_ROOT, relDir);
    await fs.promises.mkdir(absDir, { recursive: true });

    const safeName = `${quote.quotationNumber}.pdf`;
    const absPath = path.join(absDir, safeName);
    const relPath = path.posix.join(relDir, safeName);

    await this.renderToFile(quote, absPath);

    return this.prisma.quotation.update({
      where: { id: quote.id },
      data: { pdfFilePath: relPath },
    });
  }

  /** Stream a generated PDF off disk. */
  async openPdfStream(
    quote: Quotation,
  ): Promise<{ stream: fs.ReadStream; fileName: string; mimeType: string }> {
    if (!quote.pdfFilePath) {
      throw new NotFoundException('No PDF has been generated for this quote.');
    }
    const abs = this.resolveSafe(quote.pdfFilePath);
    if (!fs.existsSync(abs)) {
      throw new NotFoundException('Generated PDF is missing on disk.');
    }
    return {
      stream: fs.createReadStream(abs),
      fileName: `${quote.quotationNumber ?? quote.id}.pdf`,
      mimeType: 'application/pdf',
    };
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private resolveSafe(relPath: string): string {
    const abs = path.resolve(UPLOAD_ROOT, relPath);
    const root = path.resolve(UPLOAD_ROOT) + path.sep;
    if (!abs.startsWith(root)) {
      throw new BadRequestException('Invalid stored file path.');
    }
    return abs;
  }

  /**
   * Lazy-load Amiri once per process. Returns null if the font isn't
   * present so callers can fall back to the built-in default — the PDF
   * still generates, Arabic just renders as missing-glyph boxes.
   */
  private loadArabicFont(): Buffer | null {
    if (this.arabicFontChecked) return this.arabicFontBuffer;
    this.arabicFontChecked = true;
    try {
      this.arabicFontBuffer = fs.readFileSync(ARABIC_FONT_PATH);
    } catch {
      this.arabicFontBuffer = null;
      this.logger.warn(
        `Arabic font not found at ${ARABIC_FONT_PATH} — Arabic glyphs in PDFs will be missing. See assets/fonts/README.md.`,
      );
    }
    return this.arabicFontBuffer;
  }

  private async renderToFile(quote: Quotation, absPath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: quote.quotationNumber ?? 'Quotation',
          Author: 'Oralign',
          Subject: getQuotationLabels(quote.language).documentTitle,
        },
      });

      const output = fs.createWriteStream(absPath);
      doc.pipe(output);
      output.on('finish', () => resolve());
      output.on('error', reject);

      try {
        this.renderDocument(doc, quote);
      } catch (err) {
        reject(err as Error);
        return;
      }

      doc.end();
    });
  }

  private renderDocument(doc: PDFKit.PDFDocument, quote: Quotation): void {
    const labels = getQuotationLabels(quote.language);
    const rtl = isRtl(quote.language);

    const company =
      (quote.companySnapshot as Record<string, unknown> | null) ?? {};
    const clinic =
      (quote.clinicSnapshot as Record<string, unknown> | null) ?? {};

    // Pick the right font for the document body. Latin (FR/EN) uses
    // pdfkit's built-in Helvetica. Arabic uses Amiri if bundled,
    // otherwise falls back to Helvetica with a documented loss.
    if (rtl) {
      const buf = this.loadArabicFont();
      if (buf) {
        doc.registerFont('Amiri', buf);
        doc.font('Amiri');
      } else {
        doc.font('Helvetica');
      }
    } else {
      doc.font('Helvetica');
    }

    this.renderHeader(doc, quote, labels, company, rtl);
    doc.moveDown(2);
    this.renderParties(doc, quote, labels, company, clinic, rtl);
    doc.moveDown(1.5);
    this.renderLineItems(doc, quote, labels, rtl);
    this.renderTotalsBlock(doc, quote, labels, rtl);
    doc.moveDown(1.5);
    if (quote.adminMessage) {
      this.renderTextBlock(doc, labels.adminMessage, quote.adminMessage, rtl);
      doc.moveDown(0.8);
    }
    if (quote.notes) {
      this.renderTextBlock(doc, labels.notes, quote.notes, rtl);
      doc.moveDown(0.8);
    }
    this.renderFooter(doc, quote, labels, company, rtl);
  }

  // ── Header ─────────────────────────────────────────────────────────────

  private renderHeader(
    doc: PDFKit.PDFDocument,
    quote: Quotation,
    labels: ReturnType<typeof getQuotationLabels>,
    company: Record<string, unknown>,
    rtl: boolean,
  ): void {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const startY = doc.y;

    // Logo (if available).
    const logoPath = company.companyLogoPath as string | null | undefined;
    if (logoPath) {
      try {
        const abs = this.resolveSafe(logoPath);
        if (fs.existsSync(abs)) {
          doc.image(abs, rtl ? right - 100 : left, startY, {
            fit: [100, 60],
          });
        }
      } catch {
        // logo missing — silently skip
      }
    }

    // Document title + number + date (opposite side from logo).
    const blockX = rtl ? left : right - 220;
    const blockW = 220;
    doc
      .fontSize(20)
      .fillColor('#0a0a0a')
      .text(labels.documentTitle, blockX, startY, {
        width: blockW,
        align: rtl ? 'left' : 'right',
      });

    doc.fontSize(10).fillColor('#555');
    doc.text(
      `${labels.number}: ${quote.quotationNumber ?? '—'}`,
      blockX,
      doc.y + 4,
      { width: blockW, align: rtl ? 'left' : 'right' },
    );
    doc.text(
      `${labels.date}: ${this.formatDate(quote.createdAt, quote.language)}`,
      blockX,
      doc.y,
      { width: blockW, align: rtl ? 'left' : 'right' },
    );

    // Status pill — small caps text.
    doc
      .fontSize(9)
      .fillColor('#0a0a0a')
      .text(
        `${labels.status}: ${this.statusLabel(quote.status, labels)}`,
        blockX,
        doc.y + 6,
        { width: blockW, align: rtl ? 'left' : 'right' },
      );

    doc.fillColor('#0a0a0a');
    // Advance the cursor below the taller of the two columns.
    doc.y = Math.max(doc.y, startY + 80);
  }

  // ── Issuer + Billed-to ─────────────────────────────────────────────────

  private renderParties(
    doc: PDFKit.PDFDocument,
    quote: Quotation,
    labels: ReturnType<typeof getQuotationLabels>,
    company: Record<string, unknown>,
    clinic: Record<string, unknown>,
    rtl: boolean,
  ): void {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const colW = (right - left - 20) / 2;
    const startY = doc.y;

    const issuedByX = rtl ? right - colW : left;
    const billedToX = rtl ? left : right - colW;

    // Issued by — company snapshot.
    doc
      .fontSize(9)
      .fillColor('#666')
      .text(labels.issuedBy.toUpperCase(), issuedByX, startY, {
        width: colW,
        align: rtl ? 'right' : 'left',
      });
    doc.fontSize(11).fillColor('#0a0a0a');
    this.lineRtl(
      doc,
      String(company.companyName ?? ''),
      issuedByX,
      colW,
      rtl,
      true,
    );
    this.lineRtl(
      doc,
      String(company.companyAddress ?? ''),
      issuedByX,
      colW,
      rtl,
    );
    const cityCountry = [company.companyCity, company.companyCountry]
      .filter(Boolean)
      .join(', ');
    if (cityCountry) this.lineRtl(doc, cityCountry, issuedByX, colW, rtl);
    if (company.companyPhone)
      this.lineRtl(doc, String(company.companyPhone), issuedByX, colW, rtl);
    if (company.companyEmail)
      this.lineRtl(doc, String(company.companyEmail), issuedByX, colW, rtl);
    if (company.taxRegistrationNumber) {
      this.lineRtl(
        doc,
        `${labels.taxNumber}: ${company.taxRegistrationNumber}`,
        issuedByX,
        colW,
        rtl,
      );
    }
    const issuedByBottom = doc.y;

    // Billed to — clinic snapshot.
    doc.y = startY;
    doc
      .fontSize(9)
      .fillColor('#666')
      .text(labels.billedTo.toUpperCase(), billedToX, startY, {
        width: colW,
        align: rtl ? 'right' : 'left',
      });
    doc.fontSize(11).fillColor('#0a0a0a');
    const doctorName = clinic.doctorFullName ?? '';
    this.lineRtl(
      doc,
      `${labels.doctor}: ${doctorName}`,
      billedToX,
      colW,
      rtl,
      true,
    );
    if (clinic.clinicName) {
      this.lineRtl(doc, String(clinic.clinicName), billedToX, colW, rtl);
    }
    if (clinic.clinicAddress) {
      this.lineRtl(doc, String(clinic.clinicAddress), billedToX, colW, rtl);
    }
    const clinicCity = [clinic.city, clinic.country].filter(Boolean).join(', ');
    if (clinicCity) this.lineRtl(doc, clinicCity, billedToX, colW, rtl);
    if (clinic.clinicPhone)
      this.lineRtl(doc, String(clinic.clinicPhone), billedToX, colW, rtl);
    if (clinic.clinicEmail)
      this.lineRtl(doc, String(clinic.clinicEmail), billedToX, colW, rtl);

    doc.y = Math.max(issuedByBottom, doc.y);
  }

  // ── Line-item table ────────────────────────────────────────────────────

  private renderLineItems(
    doc: PDFKit.PDFDocument,
    quote: Quotation,
    labels: ReturnType<typeof getQuotationLabels>,
    rtl: boolean,
  ): void {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const tableW = right - left;
    const amountColW = 120;
    const descColW = tableW - amountColW;

    const descX = rtl ? left + amountColW : left;
    const amountX = rtl ? left : left + descColW;

    // Header row.
    doc.fillColor('#0a0a0a').fontSize(10);
    doc.rect(left, doc.y, tableW, 24).fillAndStroke('#f4f4f5', '#e4e4e7');
    doc.fillColor('#111').fontSize(10);
    const headY = doc.y - 24 + 7;
    doc.text(labels.description, descX + 8, headY, {
      width: descColW - 16,
      align: rtl ? 'right' : 'left',
    });
    doc.text(labels.amount, amountX + 8, headY, {
      width: amountColW - 16,
      align: rtl ? 'left' : 'right',
    });
    doc.fillColor('#0a0a0a');

    const rows: Array<{ label: string; amount: number; muted?: boolean }> = [
      { label: labels.treatmentFees, amount: quote.treatmentFees },
      { label: labels.fabricationFees, amount: quote.fabricationFees },
      { label: labels.deliveryFees, amount: quote.deliveryFees },
    ];
    if (quote.discountAmount > 0) {
      rows.push({
        label: labels.discount,
        amount: -quote.discountAmount,
        muted: true,
      });
    }

    for (const row of rows) {
      const rowY = doc.y + 8;
      doc.fillColor(row.muted ? '#dc2626' : '#0a0a0a').fontSize(10);
      doc.text(row.label, descX + 8, rowY, {
        width: descColW - 16,
        align: rtl ? 'right' : 'left',
      });
      doc.text(
        this.formatMoney(row.amount, quote.currency, quote.language),
        amountX + 8,
        rowY,
        { width: amountColW - 16, align: rtl ? 'left' : 'right' },
      );
      doc.moveDown(0.6);
      doc
        .strokeColor('#e4e4e7')
        .lineWidth(0.5)
        .moveTo(left, doc.y)
        .lineTo(right, doc.y)
        .stroke();
      doc.strokeColor('#000').lineWidth(1);
    }
    doc.fillColor('#0a0a0a');
  }

  // ── Totals ─────────────────────────────────────────────────────────────

  private renderTotalsBlock(
    doc: PDFKit.PDFDocument,
    quote: Quotation,
    labels: ReturnType<typeof getQuotationLabels>,
    rtl: boolean,
  ): void {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const blockW = 240;
    const blockX = rtl ? left : right - blockW;

    const lines: Array<{ label: string; value: string; emphasis?: boolean }> = [
      {
        label: labels.subtotalHt,
        value: this.formatMoney(
          quote.subTotalHt,
          quote.currency,
          quote.language,
        ),
      },
      {
        label: `${labels.vatRate} (${quote.tvaRate.toFixed(2)} %)`,
        value: this.formatMoney(
          quote.tvaAmount,
          quote.currency,
          quote.language,
        ),
      },
      {
        label: labels.totalTtc,
        value: this.formatMoney(quote.totalTtc, quote.currency, quote.language),
        emphasis: true,
      },
    ];

    doc.moveDown(0.4);
    for (const ln of lines) {
      const fontSize = ln.emphasis ? 13 : 11;
      const color = ln.emphasis ? '#0a0a0a' : '#374151';
      doc.fillColor(color).fontSize(fontSize);
      const baseY = doc.y;
      doc.text(ln.label, blockX, baseY, {
        width: blockW / 2,
        align: rtl ? 'right' : 'left',
      });
      doc.fillColor(color).fontSize(fontSize);
      doc.text(ln.value, blockX + blockW / 2, baseY, {
        width: blockW / 2,
        align: rtl ? 'left' : 'right',
      });
      doc.moveDown(0.4);
    }
    doc.fillColor('#0a0a0a').fontSize(10);
  }

  // ── Notes / message blocks ────────────────────────────────────────────

  private renderTextBlock(
    doc: PDFKit.PDFDocument,
    title: string,
    body: string,
    rtl: boolean,
  ): void {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const w = right - left;
    doc
      .fontSize(9)
      .fillColor('#666')
      .text(title.toUpperCase(), left, doc.y, {
        width: w,
        align: rtl ? 'right' : 'left',
      });
    doc
      .fontSize(10)
      .fillColor('#0a0a0a')
      .text(body, left, doc.y + 2, {
        width: w,
        align: rtl ? 'right' : 'left',
      });
  }

  // ── Footer (legal + footer text + bank details) ───────────────────────

  private renderFooter(
    doc: PDFKit.PDFDocument,
    _quote: Quotation,
    labels: ReturnType<typeof getQuotationLabels>,
    company: Record<string, unknown>,
    rtl: boolean,
  ): void {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const w = right - left;
    doc.fontSize(9).fillColor('#666');

    const legal = String(company.legalText ?? '').trim();
    if (legal) {
      doc.text(legal, left, doc.y, {
        width: w,
        align: rtl ? 'right' : 'left',
      });
      doc.moveDown(0.5);
    }

    const footer = String(company.footerText ?? '').trim();
    if (footer) {
      doc.text(footer, left, doc.y, {
        width: w,
        align: rtl ? 'right' : 'left',
      });
      doc.moveDown(0.5);
    }

    const bank = company.bankDetails as Record<string, string> | null;
    if (bank && Object.values(bank).some(Boolean)) {
      doc.moveDown(0.5);
      doc
        .fontSize(9)
        .fillColor('#666')
        .text(labels.bankDetails.toUpperCase(), left, doc.y, {
          width: w,
          align: rtl ? 'right' : 'left',
        });
      doc.fontSize(10).fillColor('#0a0a0a');
      const pairs: Array<[string, string | undefined]> = [
        [labels.bankName, bank.bankName],
        [labels.accountName, bank.accountName],
        [labels.rib, bank.rib],
        [labels.iban, bank.iban],
        [labels.swift, bank.swift],
      ];
      for (const [label, value] of pairs) {
        if (!value) continue;
        doc.text(`${label}: ${value}`, left, doc.y, {
          width: w,
          align: rtl ? 'right' : 'left',
        });
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private lineRtl(
    doc: PDFKit.PDFDocument,
    text: string,
    x: number,
    width: number,
    rtl: boolean,
    bold = false,
  ): void {
    if (!text) return;
    const prev = doc.fontSize;
    doc.font(
      bold
        ? 'Helvetica-Bold'
        : doc.font('Helvetica')
          ? 'Helvetica'
          : 'Helvetica',
    );
    // Note: bold in Arabic falls back to non-bold gracefully if Amiri
    // doesn't expose a bold variant — that's fine for v1.
    doc.text(text, x, doc.y, {
      width,
      align: rtl ? 'right' : 'left',
    });
    void prev;
  }

  private formatMoney(
    amount: number,
    currency: string,
    _language: DevisLanguage,
  ): string {
    const abs = Math.abs(amount);
    const formatted = abs.toLocaleString('fr-FR', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });
    const withSign = amount < 0 ? `-${formatted}` : formatted;
    return `${withSign} ${currency}`;
  }

  private formatDate(date: Date, language: DevisLanguage): string {
    const locale =
      language === DevisLanguage.fr
        ? 'fr-FR'
        : language === DevisLanguage.ar
          ? 'ar-TN'
          : 'en-GB';
    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  private statusLabel(
    status: QuotationStatus,
    labels: ReturnType<typeof getQuotationLabels>,
  ): string {
    switch (status) {
      case QuotationStatus.draft:
        return labels.statusDraft;
      case QuotationStatus.sent:
        return labels.statusSent;
      case QuotationStatus.approved:
        return labels.statusApproved;
      case QuotationStatus.rejected:
        return labels.statusRejected;
      case QuotationStatus.canceled:
        return labels.statusCanceled;
      default:
        return labels.statusPending;
    }
  }
}

// Keep a non-`unused` reference to the QuotationService import so the
// dependency graph stays unambiguous to readers.
void QuotationService;
