import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ArchType, DevisLanguage, Quotation, QuotationStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import puppeteer, { Browser } from 'puppeteer-core';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BadRequestException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { getQuotationLabels, isRtl, pickTranslation } from './quotation-i18n';
import { env } from '../../common/config/env';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
const ARABIC_FONT_PATH =
  env.arabicFontPath ??
  path.join(process.cwd(), 'assets', 'fonts', 'Amiri-Regular.ttf');

type JsonRecord = Record<string, unknown>;

interface QuoteLine {
  label: string;
  note?: string;
  amount: number;
  kind?: 'normal' | 'discount';
}

interface TotalLine {
  label: string;
  value: string;
  emphasis?: boolean;
}

/**
 * Browser-backed quotation PDF renderer.
 *
 * Why HTML -> PDF instead of drawing with PDFKit:
 * - CSS handles line wrapping, table widths, page breaks, and long text safely.
 * - Chromium + HarfBuzz shapes Arabic correctly, so Arabic text is readable.
 * - The template stays closer to the dashboard visual language while still
 *   printing like a clean clinical invoice.
 */
@Injectable()
export class QuotationPdfService implements OnModuleDestroy {
  private readonly logger = new Logger(QuotationPdfService.name);
  private browserPromise: Promise<Browser> | null = null;
  private arabicFontBuffer: Buffer | null = null;
  private arabicFontChecked = false;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleDestroy(): Promise<void> {
    if (!this.browserPromise) return;
    try {
      const browser = await this.browserPromise;
      await browser.close();
    } catch {
      // The process is shutting down; a stale browser is not useful to report.
    } finally {
      this.browserPromise = null;
    }
  }

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

    const safeName = this.safePdfFileName(quote.quotationNumber);
    const absPath = path.join(absDir, safeName);
    const relPath = path.posix.join(relDir, safeName);

    await this.renderToFile(quote, absPath);

    return this.prisma.quotation.update({
      where: { id: quote.id },
      data: { pdfFilePath: relPath },
    });
  }

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
      fileName: this.safePdfFileName(quote.quotationNumber ?? quote.id),
      mimeType: 'application/pdf',
    };
  }

  /**
   * Remove a rendered devis PDF from disk. Called when the row that owns
   * it is hard-deleted (admin cancel of a draft/sent quote, or an order
   * purge) — otherwise the file would linger with no DB pointer. Best
   * effort: a missing file is not an error, and a failure here must never
   * fail the business operation that already committed.
   */
  async deleteStoredPdf(relPath: string | null | undefined): Promise<void> {
    if (!relPath) return;
    try {
      await fs.promises.rm(this.resolveSafe(relPath), { force: true });
    } catch (err) {
      this.logger.warn(
        `Could not remove quotation PDF ${relPath}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async renderToFile(quote: Quotation, absPath: string): Promise<void> {
    let page: Awaited<ReturnType<Browser['newPage']>> | null = null;
    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();
      page.setDefaultTimeout(45_000);
      await page.setContent(this.renderHtml(quote), {
        waitUntil: 'load',
        timeout: 45_000,
      });
      await page.emulateMediaType('print');
      await page.pdf({
        path: absPath,
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
    } catch (err) {
      await fs.promises.rm(absPath, { force: true }).catch(() => undefined);
      this.logger.error(
        `Failed to render quotation PDF ${quote.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    } finally {
      if (page) await page.close().catch(() => undefined);
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = this.launchBrowser().catch((err) => {
        this.browserPromise = null;
        throw err;
      });
    }
    return this.browserPromise;
  }

  private async launchBrowser(): Promise<Browser> {
    const executablePath = this.resolveChromiumExecutable();
    this.logger.log(`Launching Chromium PDF renderer at ${executablePath}`);
    return puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=medium',
      ],
    });
  }

  private resolveChromiumExecutable(): string {
    const envCandidates = [
      process.env.PUPPETEER_EXECUTABLE_PATH,
      process.env.CHROME_BIN,
      process.env.CHROMIUM_PATH,
    ].filter(Boolean) as string[];

    const candidates = [
      ...envCandidates,
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/google-chrome-stable',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(
        process.env.LOCALAPPDATA ?? '',
        'Google\\Chrome\\Application\\chrome.exe',
      ),
    ].filter(Boolean);

    const found = candidates.find((candidate) => fs.existsSync(candidate));
    if (found) return found;

    throw new Error(
      'Chromium executable was not found. Install chromium in Docker or set PUPPETEER_EXECUTABLE_PATH.',
    );
  }

  private renderHtml(quote: Quotation): string {
    const labels = getQuotationLabels(quote.language);
    const rtl = isRtl(quote.language);
    const company = (quote.companySnapshot as JsonRecord | null) ?? {};
    const clinic = (quote.clinicSnapshot as JsonRecord | null) ?? {};
    const logo = this.resolveImageDataUrl(
      company.companyLogoPath as string | null | undefined,
    );
    const rows = this.buildLineItems(quote, labels);
    const totals = this.buildTotals(quote, labels);
    const legal = this.resolveSnapshotTranslation(
      company,
      'legalTextTranslations',
      'legalText',
      quote.language,
    );
    const footer = this.resolveSnapshotTranslation(
      company,
      'footerTextTranslations',
      'footerText',
      quote.language,
    );
    const bank = company.bankDetails as Record<string, string> | null;
    const cityCountry = [company.companyCity, company.companyCountry]
      .filter(Boolean)
      .join(', ');
    const clinicCity = [clinic.city, clinic.country].filter(Boolean).join(', ');
    const brandName = String(company.companyName ?? 'ORALIGN').trim() || 'ORALIGN';

    return `<!doctype html>
<html lang="${this.htmlAttr(quote.language)}" dir="${rtl ? 'rtl' : 'ltr'}">
  <head>
    <meta charset="utf-8" />
    <style>
      ${this.fontFaceCss()}
      @page { size: A4; margin: 11mm; }
      * { box-sizing: border-box; }
      html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body {
        margin: 0;
        color: #111111;
        background: #ffffff;
        font-family: Inter, Roboto, Arial, "DejaVu Sans", sans-serif;
        font-size: 10.5px;
        line-height: 1.42;
      }
      body.rtl {
        direction: rtl;
        font-family: "OralignArabic", "Noto Naskh Arabic", "Noto Sans Arabic", "DejaVu Sans", Arial, sans-serif;
        font-size: 11px;
        line-height: 1.6;
      }
      .document { width: 100%; }
      /* Centered logo masthead — the logo sits alone, centered, at the
         very top; the document title + meta follow it. */
      .masthead {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding-bottom: 12px;
        margin-bottom: 13px;
        border-bottom: 1.5px solid #111111;
        break-inside: avoid;
      }
      .logo-img { max-width: 168px; max-height: 66px; object-fit: contain; }
      .masthead-name {
        font-size: 22px;
        font-weight: 800;
        letter-spacing: .16em;
        text-transform: uppercase;
        text-align: center;
      }
      body.rtl .masthead-name { letter-spacing: 0; }
      .docrow {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 16px;
        align-items: start;
        break-inside: avoid;
      }
      body.rtl .docrow { grid-template-columns: auto 1fr; }
      .doc-meta { min-width: 188px; text-align: right; }
      body.rtl .doc-meta { text-align: left; }
      .title {
        margin: 0;
        font-size: 22px;
        line-height: 1;
        letter-spacing: .12em;
        font-weight: 800;
        text-transform: uppercase;
      }
      body.rtl .title { font-size: 20px; letter-spacing: 0; text-transform: none; }
      .meta-line { margin-top: 4px; color: #555555; font-size: 9.5px; overflow-wrap: anywhere; }
      .status {
        display: inline-flex;
        margin-top: 7px;
        max-width: 100%;
        align-items: center;
        border: 1px solid #111111;
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 9px;
        font-weight: 700;
        overflow-wrap: anywhere;
      }
      .section { margin-top: 11px; }
      .section.keep { break-inside: avoid; page-break-inside: avoid; }
      .section-title {
        margin: 0 0 6px;
        color: #666666;
        font-size: 8.5px;
        font-weight: 800;
        letter-spacing: .12em;
        text-transform: uppercase;
      }
      body.rtl .section-title { letter-spacing: 0; text-transform: none; }
      .party-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .box {
        min-width: 0;
        border: 1px solid #e2e4e8;
        border-radius: 10px;
        padding: 10px 11px;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .box-line {
        margin: 1.5px 0;
        overflow-wrap: anywhere;
        word-break: normal;
      }
      .box-line.strong { font-weight: 700; }
      table {
        width: 100%;
        border: 1px solid #111111;
        border-radius: 10px;
        border-collapse: separate;
        border-spacing: 0;
        table-layout: fixed;
        overflow: hidden;
      }
      thead { display: table-header-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      th {
        background: #111111;
        color: #ffffff;
        padding: 8px 11px;
        font-size: 8.5px;
        font-weight: 800;
        letter-spacing: .12em;
        text-transform: uppercase;
      }
      body.rtl th { letter-spacing: 0; text-transform: none; }
      th.desc, td.desc { width: 72%; text-align: start; }
      th.amount, td.amount { width: 28%; text-align: end; white-space: nowrap; }
      body.rtl th.amount, body.rtl td.amount { text-align: start; }
      td {
        padding: 8px 11px;
        border-top: 1px solid #ececec;
        vertical-align: top;
        overflow-wrap: anywhere;
      }
      .line-label { font-weight: 700; }
      .line-note { margin-top: 2px; color: #666666; font-size: 9px; overflow-wrap: anywhere; }
      .discount { color: #111111; }
      .totals {
        width: min(100%, 262px);
        margin-top: 10px;
        margin-left: auto;
        border: 1px solid #e2e4e8;
        border-radius: 10px;
        padding: 7px 8px;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      body.rtl .totals { margin-right: auto; margin-left: 0; }
      .total-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 4px 4px;
        border-bottom: 1px solid #eef0f2;
      }
      .total-row span:first-child { overflow-wrap: anywhere; }
      .total-row span:last-child { white-space: nowrap; font-variant-numeric: tabular-nums; font-weight: 650; }
      .total-row.final {
        margin-top: 4px;
        border: 0;
        border-radius: 8px;
        background: #111111;
        color: #ffffff;
        padding: 9px 10px;
        font-size: 12px;
        font-weight: 800;
      }
      .text-block {
        margin-top: 10px;
        border: 1px solid #e2e4e8;
        border-radius: 10px;
        padding: 9px 11px;
        break-inside: auto;
      }
      .text-block-title {
        margin: 0 0 5px;
        color: #666666;
        font-size: 8.5px;
        font-weight: 800;
        letter-spacing: .12em;
        text-transform: uppercase;
      }
      body.rtl .text-block-title { letter-spacing: 0; text-transform: none; }
      .text-block-body {
        margin: 0;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .footer {
        margin-top: 12px;
        padding-top: 9px;
        border-top: 1px solid #e2e4e8;
        color: #555555;
        font-size: 8.5px;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .footer p { margin: 0 0 4px; overflow-wrap: anywhere; }
      .bank-title {
        margin-top: 7px;
        color: #111111;
        font-weight: 800;
      }
      .bank-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 2px 14px;
        margin-top: 3px;
      }
      .bank-grid div { overflow-wrap: anywhere; }
    </style>
  </head>
  <body class="${rtl ? 'rtl' : 'ltr'}">
    <main class="document">
      <header class="masthead">
        ${
          logo
            ? `<img class="logo-img" src="${logo}" alt="${this.htmlAttr(brandName)}" />`
            : `<div class="masthead-name">${this.html(brandName)}</div>`
        }
      </header>

      <section class="docrow">
        <div>
          <h1 class="title">${this.html(this.titleLabel(labels.documentTitle, rtl))}</h1>
        </div>
        <div class="doc-meta">
          <div class="meta-line">${this.html(labels.number)}: <strong>${this.html(quote.quotationNumber ?? '—')}</strong></div>
          <div class="meta-line">${this.html(labels.date)}: ${this.html(this.formatDate(quote.createdAt, quote.language))}</div>
          <div class="status">${this.html(labels.status)}: ${this.html(this.statusLabel(quote.status, labels))}</div>
        </div>
      </section>

      <section class="section keep party-grid">
        <article class="box">
          <h2 class="section-title">${this.html(labels.issuedBy)}</h2>
          ${this.renderBoxLines([
            { text: String(company.companyName ?? ''), strong: true },
            { text: String(company.companyAddress ?? '') },
            { text: cityCountry },
            { text: String(company.companyPhone ?? '') },
            { text: String(company.companyEmail ?? '') },
            {
              text: company.taxRegistrationNumber
                ? `${labels.taxNumber}: ${company.taxRegistrationNumber}`
                : '',
            },
          ])}
        </article>

        <article class="box">
          <h2 class="section-title">${this.html(labels.billedTo)}</h2>
          ${this.renderBoxLines([
            {
              text: `${labels.doctor}: ${String(clinic.doctorFullName ?? '—')}`,
              strong: true,
            },
            {
              text: (clinic as { patientFullName?: string | null }).patientFullName
                ? `${labels.patient}: ${(clinic as { patientFullName?: string | null }).patientFullName}`
                : '',
            },
            { text: String(clinic.clinicName ?? '') },
            { text: String(clinic.clinicAddress ?? '') },
            { text: clinicCity },
            { text: String(clinic.clinicPhone ?? '') },
            { text: String(clinic.clinicEmail ?? '') },
          ])}
        </article>
      </section>

      <section class="section">
        <table>
          <thead>
            <tr>
              <th class="desc">${this.html(labels.description)}</th>
              <th class="amount">${this.html(labels.amount)}</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => this.renderLineRow(row, quote)).join('')}
          </tbody>
        </table>
        <section class="totals">
          ${totals.map((line) => this.renderTotalLine(line)).join('')}
        </section>
      </section>

      ${quote.adminMessage ? this.renderTextBlock(labels.adminMessage, quote.adminMessage) : ''}
      ${quote.notes ? this.renderTextBlock(labels.notes, quote.notes) : ''}

      <footer class="footer">
        ${legal ? `<p>${this.html(legal)}</p>` : ''}
        ${footer ? `<p>${this.html(footer)}</p>` : ''}
        ${
          bank && Object.values(bank).some(Boolean)
            ? `<div class="bank-title">${this.html(labels.bankDetails)}</div>
               <div class="bank-grid">
                 ${this.renderBankLine(labels.bankName, bank.bankName)}
                 ${this.renderBankLine(labels.accountName, bank.accountName)}
                 ${this.renderBankLine(labels.rib, bank.rib)}
                 ${this.renderBankLine(labels.iban, bank.iban)}
                 ${this.renderBankLine(labels.swift, bank.swift)}
               </div>`
            : ''
        }
      </footer>
    </main>
  </body>
</html>`;
  }

  private buildLineItems(
    quote: Quotation,
    labels: ReturnType<typeof getQuotationLabels>,
  ): QuoteLine[] {
    const rows: QuoteLine[] = [];
    const isPackQuote = !!(quote as { packId?: string | null }).packId;
    const deliveryFees = this.toNumber(quote.deliveryFees);
    const discountAmount = this.toNumber(quote.discountAmount);

    if (isPackQuote) {
      const packName = (quote as { packName?: string | null }).packName ?? '—';
      const archType = (quote as { archType?: ArchType | null }).archType ?? null;
      const packBase = this.toNumber(
        quote.treatmentFees,
        this.toNumber((quote as { totalPrice?: unknown }).totalPrice, quote.totalTtc),
      );
      rows.push({
        label: `${this.packLabel(quote.language)}: ${packName}${this.archSuffix(archType, quote.language)}`,
        note: this.packMeta(quote),
        amount: packBase,
      });
      if (deliveryFees > 0) {
        rows.push({ label: labels.deliveryFees, amount: deliveryFees });
      }
    } else {
      rows.push(
        { label: labels.treatmentFees, amount: this.toNumber(quote.treatmentFees) },
        {
          label: labels.fabricationFees,
          amount: this.toNumber(quote.fabricationFees),
        },
        { label: labels.deliveryFees, amount: deliveryFees },
      );
    }

    if (discountAmount > 0) {
      rows.push({
        label: labels.discount,
        amount: -discountAmount,
        kind: 'discount',
      });
    }
    return rows;
  }

  private buildTotals(
    quote: Quotation,
    labels: ReturnType<typeof getQuotationLabels>,
  ): TotalLine[] {
    const tvaRate = this.toNumber(quote.tvaRate);
    const showTva = tvaRate > 0 || this.toNumber(quote.tvaAmount) > 0;
    const lines: TotalLine[] = [
      {
        label: labels.subtotalHt,
        value: this.formatMoney(quote.subTotalHt, quote.currency, quote.language),
      },
    ];

    if (showTva) {
      lines.push({
        label: `${labels.vatRate} (${tvaRate.toFixed(2)} %)`,
        value: this.formatMoney(quote.tvaAmount, quote.currency, quote.language),
      });
    }

    lines.push({
      label: labels.totalTtc,
      value: this.formatMoney(quote.totalTtc, quote.currency, quote.language),
      emphasis: true,
    });
    return lines;
  }

  private renderLineRow(row: QuoteLine, quote: Quotation): string {
    return `<tr>
      <td class="desc ${row.kind === 'discount' ? 'discount' : ''}">
        <div class="line-label">${this.html(row.label)}</div>
        ${row.note ? `<div class="line-note">${this.html(row.note)}</div>` : ''}
      </td>
      <td class="amount ${row.kind === 'discount' ? 'discount' : ''}">
        ${this.html(this.formatMoney(row.amount, quote.currency, quote.language))}
      </td>
    </tr>`;
  }

  private renderTotalLine(line: TotalLine): string {
    return `<div class="total-row${line.emphasis ? ' final' : ''}">
      <span>${this.html(line.label)}</span>
      <span>${this.html(line.value)}</span>
    </div>`;
  }

  private renderTextBlock(title: string, body: string): string {
    return `<section class="text-block">
      <h2 class="text-block-title">${this.html(title)}</h2>
      <p class="text-block-body">${this.html(body)}</p>
    </section>`;
  }

  private renderBoxLines(lines: Array<{ text: string; strong?: boolean }>): string {
    const html = lines
      .map((line) => ({ ...line, text: line.text.trim() }))
      .filter((line) => line.text.length > 0)
      .map(
        (line) =>
          `<p class="box-line${line.strong ? ' strong' : ''}">${this.html(line.text)}</p>`,
      )
      .join('');

    return html || '<p class="box-line">—</p>';
  }

  private renderBankLine(label: string, value?: string): string {
    if (!value) return '';
    return `<div><strong>${this.html(label)}:</strong> ${this.html(value)}</div>`;
  }

  private resolveImageDataUrl(relPath: string | null | undefined): string | null {
    if (!relPath) return null;
    try {
      const abs = this.resolveSafe(relPath);
      if (!fs.existsSync(abs)) return null;
      const ext = path.extname(abs).toLowerCase();
      const mime =
        ext === '.png'
          ? 'image/png'
          : ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : ext === '.webp'
              ? 'image/webp'
              : null;
      if (!mime) return null;
      const stat = fs.statSync(abs);
      if (stat.size > 2 * 1024 * 1024) return null;
      return `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
    } catch {
      return null;
    }
  }

  private resolveSnapshotTranslation(
    snapshot: JsonRecord,
    translationsKey: string,
    fallbackKey: string,
    language: DevisLanguage,
  ): string {
    return String(
      pickTranslation(snapshot[translationsKey], language) ||
        snapshot[fallbackKey] ||
        '',
    ).trim();
  }

  private resolveSafe(relPath: string): string {
    if (!relPath || path.isAbsolute(relPath)) {
      throw new BadRequestException('Invalid stored file path.');
    }
    const root = path.resolve(UPLOAD_ROOT);
    const abs = path.resolve(root, relPath);
    const relative = path.relative(root, abs);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new BadRequestException('Invalid stored file path.');
    }
    return abs;
  }

  private loadArabicFont(): Buffer | null {
    if (this.arabicFontChecked) return this.arabicFontBuffer;
    this.arabicFontChecked = true;
    try {
      this.arabicFontBuffer = fs.readFileSync(ARABIC_FONT_PATH);
    } catch {
      this.arabicFontBuffer = null;
    }
    return this.arabicFontBuffer;
  }

  private fontFaceCss(): string {
    const font = this.loadArabicFont();
    if (!font) return '';
    return `
      @font-face {
        font-family: "OralignArabic";
        src: url("data:font/ttf;base64,${font.toString('base64')}") format("truetype");
        font-weight: 400 900;
        font-style: normal;
        font-display: swap;
      }
    `;
  }

  private safePdfFileName(input: string): string {
    const base =
      input
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/^[._-]+|[._-]+$/g, '')
        .slice(0, 120) || 'quotation';

    return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
  }

  private toNumber(value: unknown, fallback = 0): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }
    if (value && typeof value === 'object') {
      const decimalLike = value as {
        toNumber?: () => number;
        toString?: () => string;
      };
      if (typeof decimalLike.toNumber === 'function') {
        const parsed = decimalLike.toNumber();
        return Number.isFinite(parsed) ? parsed : fallback;
      }
      if (typeof decimalLike.toString === 'function') {
        const parsed = Number(decimalLike.toString());
        return Number.isFinite(parsed) ? parsed : fallback;
      }
    }
    return fallback;
  }

  private formatMoney(
    amount: unknown,
    currency: string,
    language: DevisLanguage,
  ): string {
    const numericAmount = this.toNumber(amount);
    const abs = Math.abs(numericAmount);
    const locale = language === DevisLanguage.ar ? 'ar-TN' : 'fr-FR';
    const formatted = abs.toLocaleString(locale, {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });
    const withSign = numericAmount < 0 ? `-${formatted}` : formatted;
    return `${withSign} ${currency}`;
  }

  private formatDate(date: Date, language: DevisLanguage): string {
    const locale =
      language === DevisLanguage.fr
        ? 'fr-FR'
        : language === DevisLanguage.ar
          ? 'ar-TN'
          : 'en-GB';
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(date);
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

  private titleLabel(title: string, rtl: boolean): string {
    return rtl ? title : title.toUpperCase();
  }

  private packLabel(language: DevisLanguage): string {
    switch (language) {
      case DevisLanguage.ar:
        return 'الباقة';
      case DevisLanguage.en:
        return 'Pack';
      default:
        return 'Pack';
    }
  }

  private archSuffix(archType: ArchType | null, language: DevisLanguage): string {
    if (!archType) return '';
    const label =
      archType === ArchType.two_arches
        ? language === DevisLanguage.ar
          ? 'القوسان'
          : language === DevisLanguage.en
            ? 'Two arches'
            : 'Deux arcades'
        : language === DevisLanguage.ar
          ? 'قوس واحد'
          : language === DevisLanguage.en
            ? 'Single arch'
            : 'Une arcade';
    return ` (${label})`;
  }

  private packMeta(quote: Quotation): string {
    const language = quote.language;
    const parts: string[] = [];
    const maxSteps = (quote as { maxStepsPerArch?: number | null }).maxStepsPerArch;
    const corrections = (quote as { includedCorrections?: number | null })
      .includedCorrections;
    const isUnlimitedSteps = (quote as { isUnlimitedSteps?: boolean | null })
      .isUnlimitedSteps;
    const isUnlimitedCorrections = (
      quote as { isUnlimitedCorrections?: boolean | null }
    ).isUnlimitedCorrections;

    if (isUnlimitedSteps) {
      parts.push(
        language === DevisLanguage.ar
          ? 'خطوات غير محدودة'
          : language === DevisLanguage.en
            ? 'Unlimited steps'
            : 'Étapes illimitées',
      );
    } else if (maxSteps) {
      parts.push(
        language === DevisLanguage.ar
          ? `${maxSteps} خطوة لكل قوس`
          : language === DevisLanguage.en
            ? `${maxSteps} steps per arch`
            : `${maxSteps} étapes par arcade`,
      );
    }

    if (isUnlimitedCorrections) {
      parts.push(
        language === DevisLanguage.ar
          ? 'تصحيحات غير محدودة'
          : language === DevisLanguage.en
            ? 'Unlimited corrections'
            : 'Corrections illimitées',
      );
    } else if (corrections) {
      parts.push(
        language === DevisLanguage.ar
          ? `${corrections} تصحيح مضمّن`
          : language === DevisLanguage.en
            ? `${corrections} included correction${corrections > 1 ? 's' : ''}`
            : `${corrections} correction${corrections > 1 ? 's' : ''} incluse${corrections > 1 ? 's' : ''}`,
      );
    }

    return parts.join(' · ');
  }

  private html(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private htmlAttr(value: unknown): string {
    return this.html(value).replace(/`/g, '&#96;');
  }
}
