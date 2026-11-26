'use client';

/**
 * PDF display with pdf.js, loaded only when a page shows a PDF.
 *
 * Why not the browser's viewer (`<iframe src=blob:>`)? Phones and tablets
 * do not show a PDF inside a frame (Android Chrome offers a download, iOS
 * shows one page), and the doctors read the analyses on them. pdf.js
 * draws the pages into canvases the same way everywhere.
 *
 * Safety: the document is parsed in a worker and drawn, never run. No
 * `eval` (`isEvalSupported: false`), no XFA forms, and pdf.js has no
 * scripting outside its own viewer app, which is not used here.
 *
 * The legacy build carries the polyfills older Safari versions need.
 * One worker serves every document of the session.
 */

import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from 'pdfjs-dist';

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type PdfWorker = InstanceType<PdfJs['PDFWorker']>;

let pdfjsPromise: Promise<{ pdfjs: PdfJs; worker: PdfWorker }> | null = null;

/**
 * The worker is pdf.js's own file, emitted as a static asset and started
 * by pdf.js as a module worker. Not `new Worker(new URL(…))`: Turbopack
 * would re-bundle it behind a classic-worker bootstrap (`importScripts`),
 * which a module worker refuses.
 */
function loadPdfJs(): Promise<{ pdfjs: PdfJs; worker: PdfWorker }> {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs')
    .then((pdfjs) => {
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();
      }
      return { pdfjs, worker: new pdfjs.PDFWorker() };
    })
    .catch((error: unknown) => {
      // A failed chunk load (offline, deploy in between) can be retried.
      pdfjsPromise = null;
      throw error;
    });
  return pdfjsPromise;
}

export type PdfOpenError = 'password' | 'unreadable';

/** Why a PDF could not be opened, for the message shown in its place. */
export function pdfOpenError(error: unknown): PdfOpenError {
  return (error as { name?: string } | null)?.name === 'PasswordException'
    ? 'password'
    : 'unreadable';
}

/**
 * Open a PDF from its bytes. The caller owns the returned task: calling
 * `destroy()` on it stops the parse and frees the document.
 */
export async function openPdf(blob: Blob): Promise<PDFDocumentLoadingTask> {
  const [{ pdfjs, worker }, buffer] = await Promise.all([
    loadPdfJs(),
    blob.arrayBuffer(),
  ]);
  return pdfjs.getDocument({
    // A copy the worker may take over: the blob stays readable for a
    // download or a second view.
    data: new Uint8Array(buffer),
    // One worker for every document; destroying a document leaves it up.
    worker,
    isEvalSupported: false,
    enableXfa: false,
  });
}

/**
 * Browsers refuse canvases past a few million pixels (iOS Safari: about
 * 16.7 M). A wide page on a 3x screen would go blank, so the backing
 * store is scaled down past this budget.
 */
const MAX_CANVAS_PIXELS = 12_000_000;

export interface PageRender {
  canvas: HTMLCanvasElement;
  task: RenderTask;
}

/**
 * Draw `page` at `cssWidth` CSS pixels into a NEW canvas, sharp on HiDPI
 * screens. A new canvas each time lets the caller keep showing the old
 * drawing until `task.promise` resolves, then swap: no blank flash on a
 * resize. Cancel with `task.cancel()`.
 */
export function renderPage(page: PDFPageProxy, cssWidth: number): PageRender {
  const base = page.getViewport({ scale: 1 });
  const cssScale = cssWidth / base.width;
  const cssHeight = base.height * cssScale;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
  const pixels = cssWidth * cssHeight * pixelRatio * pixelRatio;
  if (pixels > MAX_CANVAS_PIXELS) {
    pixelRatio *= Math.sqrt(MAX_CANVAS_PIXELS / pixels);
  }
  const viewport = page.getViewport({ scale: cssScale * pixelRatio });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = 'auto';
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas 2D is not available.');

  const task = page.render({ canvasContext: context, viewport });
  return { canvas, task };
}

/** Height / width of a page, to reserve its place before it is drawn. */
export function pageAspect(page: PDFPageProxy): number {
  const { width, height } = page.getViewport({ scale: 1 });
  return width > 0 ? height / width : Math.SQRT2;
}

/** pdf.js rejects a cancelled render with this; it is not a failure. */
export function isRenderCancelled(error: unknown): boolean {
  return (
    (error as { name?: string } | null)?.name === 'RenderingCancelledException'
  );
}

export type { PDFDocumentProxy, PDFPageProxy };
