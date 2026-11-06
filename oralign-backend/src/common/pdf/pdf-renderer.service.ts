import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import puppeteer, { type Browser, type PDFOptions } from 'puppeteer-core';

export interface PdfRenderOptions {
  /**
   * Chromium's running header/footer, printed in the page margins of
   * every page. Inline styles only (the page's own CSS does not reach
   * them); `<span class="pageNumber">` / `<span class="totalPages">` are
   * filled in by Chromium.
   */
  headerTemplate?: string;
  footerTemplate?: string;
  /** Page margins; the running header/footer print inside them. */
  margin?: PDFOptions['margin'];
  landscape?: boolean;
}

/** A document is plain HTML: it never takes this long. */
const RENDER_TIMEOUT_MS = 60_000;

/**
 * HTML → A4 PDF with puppeteer-core and the system Chromium (the same
 * engine as the invoice, quote and order-sheet PDFs; installed in the
 * Docker image, PUPPETEER_EXECUTABLE_PATH elsewhere).
 *
 * One browser per process, launched on the first document and reused;
 * each document gets its own page, closed when printed. The page may only
 * load what the HTML carries (data: URLs): every network request is
 * refused, so a document can never fetch, or leak to, anything outside.
 */
@Injectable()
export class PdfRendererService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfRendererService.name);
  private browserPromise: Promise<Browser> | null = null;

  async onModuleDestroy(): Promise<void> {
    if (!this.browserPromise) return;
    try {
      const browser = await this.browserPromise;
      await browser.close();
    } catch {
      // The process is shutting down; a stale browser is not worth a report.
    } finally {
      this.browserPromise = null;
    }
  }

  async render(html: string, options: PdfRenderOptions = {}): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      page.setDefaultTimeout(RENDER_TIMEOUT_MS);
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const url = request.url();
        if (url.startsWith('data:') || url === 'about:blank') {
          void request.continue();
        } else {
          void request.abort('blockedbyclient');
        }
      });
      await page.setContent(html, {
        waitUntil: 'load',
        timeout: RENDER_TIMEOUT_MS,
      });
      await page.emulateMediaType('print');
      const running = Boolean(options.headerTemplate || options.footerTemplate);
      const pdf = await page.pdf({
        format: 'A4',
        landscape: options.landscape ?? false,
        printBackground: true,
        displayHeaderFooter: running,
        // An empty template still has to be given: Chromium otherwise
        // prints its own (the date, the title, the URL).
        headerTemplate: options.headerTemplate ?? '<span></span>',
        footerTemplate: options.footerTemplate ?? '<span></span>',
        margin: options.margin ?? {
          top: '12mm',
          right: '12mm',
          bottom: '12mm',
          left: '12mm',
        },
        // The margins above, not an @page rule, frame the page: the
        // running header/footer live in them.
        preferCSSPageSize: false,
        timeout: RENDER_TIMEOUT_MS,
      });
      // puppeteer-core returns a Uint8Array; the response wants a Buffer.
      return Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
    } catch (err) {
      this.logger.error(
        `PDF rendering failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = this.launchBrowser().catch((err) => {
        this.browserPromise = null;
        throw err;
      });
    }
    const browser = await this.browserPromise;
    if (browser.connected) return browser;
    // Chromium died (OOM, killed): start a new one for this document.
    this.browserPromise = null;
    return this.getBrowser();
  }

  private async launchBrowser(): Promise<Browser> {
    const executablePath = resolveChromiumExecutable();
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
}

function resolveChromiumExecutable(): string {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_BIN,
    process.env.CHROMIUM_PATH,
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
  ].filter((candidate): candidate is string => Boolean(candidate));

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (found) return found;
  throw new Error(
    'Chromium executable was not found. Install chromium in Docker or set PUPPETEER_EXECUTABLE_PATH.',
  );
}
