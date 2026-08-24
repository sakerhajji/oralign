import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
// `archiver`'s runtime export is the callable "vending" factory
// (`archiver('zip', opts)`), but the bundled @types only declare the
// named class exports — not the call signature. We import the `Archiver`
// + options TYPES from the named exports and grab the callable factory
// via a typed `require` (see `createArchive` below the imports) so
// `archiver('zip', …)` stays the documented API while the return value
// is strongly typed as an `Archiver` stream.
import type { Archiver, ArchiverOptions, ZipEntryData } from 'archiver';
import { ForbiddenException } from '../../common/exceptions/app.exception';
import { isAdmin, type Caller } from '../../common/access/caller';
import { OrderResponseDto } from '../dto/order.dto';
import { OrderPdfService } from './order-pdf.service';
import { OrderService } from './order.service';
import { mapOrderToDto } from './order.mapper';
import { resolveUploadPath } from './order-storage';

// Callable `archiver('zip', opts)` factory, typed via the named exports
// (see the import note above). Kept out of the import block so the
// `require` doesn't trip the `import/first` lint rule.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const createArchive: (
  format: 'zip' | 'tar',
  options?: ArchiverOptions,
) => Archiver = require('archiver');

/**
 * Extensions whose bytes are ALREADY compressed. Re-deflating them in
 * the export archive burns a lot of CPU for ~0% size gain — a 1 GB CBCT
 * bundle costs ~30s of pure compression and comes out marginally
 * LARGER. These entries are stored verbatim (zip "store" method), which
 * turns the export into an I/O copy. Everything else (STL, DICOM, text)
 * still deflates, at zlib's default level 6: level 9 triples the CPU for
 * a fraction of a percent of extra ratio.
 */
const PRECOMPRESSED_ARCHIVE_EXTENSIONS = new Set([
  '.zip', '.7z', '.rar', '.gz', '.tgz', '.bz2', '.xz',
  '.jpg', '.jpeg', '.png', '.webp', '.avif', '.heic', '.heif', '.gif',
  '.mp4', '.mov', '.webm', '.pdf',
]);

/** Language of the ZIP entry names, driven by the doctor's UI language. */
export type LabZipLanguage = 'fr' | 'en';

/**
 * Human folder names for the lab ZIP, per language. Two deliberate
 * decisions, both requested by the clinic:
 *
 *   • `other` is where the CBCT DICOM bundles land (the chunked CBCT
 *     upload stores its archives under this category), so the folder is
 *     labelled "CBCT DICOM" — a lab tech looking for the scan should not
 *     have to guess what "other" means.
 *
 *   • the RIGHT/LEFT photo labels are SWAPPED relative to the category
 *     names: intraoral side photos are taken through a mirror, so the
 *     file uploaded as `right_photo` actually shows the patient's LEFT
 *     side. The upload categories keep their historical names (nothing
 *     stored changes); only the label the lab sees is corrected.
 *
 * Accent-free on purpose: the ZIP spec's UTF-8 flag is honoured by
 * modern tools, but accentless names survive even the legacy ones.
 */
const LAB_FOLDER_LABELS: Record<LabZipLanguage, Record<string, string>> = {
  fr: {
    right_photo: 'PHOTO DENTS GAUCHE',
    left_photo: 'PHOTO DENTS DROITE',
    front_photo: 'PHOTO DENTS FACE',
    upper_photo: 'PHOTO ARCADE SUPERIEURE',
    lower_photo: 'PHOTO ARCADE INFERIEURE',
    orthopantomography: 'RADIO PANORAMIQUE',
    stl: 'SCAN STL',
    ply: 'SCAN PLY',
    obj: 'SCAN OBJ',
    zip: 'ARCHIVES ZIP',
    pdf: 'DOCUMENTS PDF',
    image: 'IMAGES',
    video: 'VIDEOS',
    other: 'CBCT DICOM',
  },
  en: {
    right_photo: 'LEFT TEETH PHOTO',
    left_photo: 'RIGHT TEETH PHOTO',
    front_photo: 'FRONT TEETH PHOTO',
    upper_photo: 'UPPER ARCH PHOTO',
    lower_photo: 'LOWER ARCH PHOTO',
    orthopantomography: 'PANORAMIC XRAY',
    stl: 'STL SCAN',
    ply: 'PLY SCAN',
    obj: 'OBJ SCAN',
    zip: 'ZIP ARCHIVES',
    pdf: 'PDF DOCUMENTS',
    image: 'IMAGES',
    video: 'VIDEOS',
    other: 'CBCT DICOM',
  },
};

/** Localised name of the order-sheet PDF inside the archive. */
const SHEET_NAMES: Record<LabZipLanguage, (code: string) => string> = {
  fr: (code) => `FICHE COMMANDE - ${code}.pdf`,
  en: (code) => `ORDER SHEET - ${code}.pdf`,
};

function isPrecompressedEntry(name: string): boolean {
  return PRECOMPRESSED_ARCHIVE_EXTENSIONS.has(path.extname(name).toLowerCase());
}

/**
 * True for the errors archiver raises once the stream has been torn
 * down — which the export controller does deliberately when the client
 * cancels a download. `QUEUECLOSED` is the same situation seen from the
 * other side: the order sheet finished rendering just as the archive
 * was aborted. Neither is a fault, so neither belongs in the error log.
 */
function isAbortedArchiveError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  const message = e?.message ?? '';
  return (
    e?.code === 'ABORTED' ||
    e?.code === 'QUEUECLOSED' ||
    message.includes('archive was aborted') ||
    message.includes('queue closed')
  );
}

/**
 * The lab export: one streaming ZIP of every file on an order plus the
 * branded order-sheet PDF. Isolated from OrderService because it owns
 * its own machinery (archiver, abort tracking, detached finalisation)
 * that nothing else in the order lifecycle needs.
 */
@Injectable()
export class OrderExportService {
  private readonly logger = new Logger(OrderExportService.name);

  /**
   * Export archives torn down because the client cancelled the download.
   * Weak so a cancelled export is collected with its archive; used by the
   * detached order-sheet task to know there is nothing left to write to.
   */
  private readonly abortedArchives = new WeakSet<Archiver>();

  constructor(
    private readonly orders: OrderService,
    private readonly orderPdf: OrderPdfService,
  ) {}

  /**
   * Build a single ZIP archive of EVERY non-deleted file on the order
   * (clinical photos, STL/scans, CBCT/ZIP bundles, …) organised into
   * `<category>/` folders, plus a branded order-sheet PDF (or a JSON
   * dump of the order DTO if that render fails) for the lab.
   *
   * Returns the live `archiver` stream so the controller can pipe it
   * straight to the HTTP response — nothing is buffered to disk, and
   * the first bytes leave before the PDF is ready.
   *
   * Finalisation is DEFERRED: this method returns with the archive still
   * open, and `appendOrderSheetAndFinalize` closes it once the render
   * settles. The caller must therefore (a) pipe the stream — nothing
   * drains otherwise — and (b) `abort()` it if the client goes away, or
   * that pending finalize never settles.
   *
   * RBAC: planner-only (admin / super_admin / designer). Designers see
   * the archive only for orders they're assigned to — `assertOrderReadable`
   * (via findAccessibleOrder) already scopes that. Doctors are excluded
   * on purpose: the bulk export is an internal lab/admin tool.
   *
   * Robustness: a file row whose blob is missing on disk is SKIPPED with
   * a logged warning rather than aborting the whole archive — a half-
   * migrated order should still yield a usable zip of what survives.
   */
  async downloadAllAsZip(
    orderId: string,
    caller: Caller,
    language: LabZipLanguage = 'fr',
  ): Promise<{ archive: Archiver; fileName: string; mimeType: string }> {
    // Planner gate. Designers are allowed but only for their assigned
    // orders, which findAccessibleOrder enforces below via accessWhere.
    const isPlanner =
      isAdmin(caller) || caller.role === UserRole.designer;
    if (!isPlanner) {
      throw new ForbiddenException(
        'Only admins and designers can download the full order archive.',
      );
    }

    // Reuse the canonical accessible-order load: enforces RBAC + soft-
    // delete + pulls the same relations mapToDto serialises, so the JSON
    // we embed is the exact order DTO the detail page shows.
    const order = await this.orders.findAccessibleOrder(orderId, caller);
    const dto = mapOrderToDto(order);

    // Kick the order-sheet render off NOW so Chromium works in parallel
    // with the file streaming below instead of delaying the first byte.
    // `.then/.catch` folds both outcomes into a value: the promise can
    // never reject, so nothing can become an unhandled rejection while
    // the archive streams.
    const sheetRender = this.orderPdf
      .renderOrderSheet(dto)
      .then((pdf) => ({ ok: true as const, pdf }))
      .catch((err: unknown) => ({ ok: false as const, err }));

    const archive = createArchive('zip', { zlib: { level: 6 } });

    // archiver emits `warning` for non-fatal issues (e.g. ENOENT on a
    // file we add) and `error` for fatal ones. We pre-check existence
    // below so warnings are rare, but log them rather than crash.
    archive.on('warning', (err) => {
      this.logger.warn(
        `Zip archive warning for order ${orderId}: ${err.message}`,
      );
    });
    archive.on('error', (err) => {
      // A cancelled download aborts the archive on purpose — that is a
      // normal user action, not a fault to page someone about.
      if (isAbortedArchiveError(err)) {
        this.abortedArchives.add(archive);
        this.logger.log(`Export cancelled by client for order ${orderId}`);
        return;
      }
      this.logger.error(
        `Zip archive error for order ${orderId}: ${err.message}`,
      );
    });

    // De-dupe identical entry names WITHIN a category folder — two files
    // can share an originalName ("scan.stl"). A per-folder Set tracks
    // taken names and we append a numeric suffix before the extension.
    const takenByFolder = new Map<string, Set<string>>();
    const uniqueName = (folder: string, name: string): string => {
      let taken = takenByFolder.get(folder);
      if (!taken) {
        taken = new Set<string>();
        takenByFolder.set(folder, taken);
      }
      if (!taken.has(name)) {
        taken.add(name);
        return name;
      }
      const ext = path.extname(name);
      const stem = ext ? name.slice(0, -ext.length) : name;
      let i = 2;
      let candidate = `${stem}-${i}${ext}`;
      while (taken.has(candidate)) {
        i += 1;
        candidate = `${stem}-${i}${ext}`;
      }
      taken.add(candidate);
      return candidate;
    };

    let appended = 0;
    for (const file of order.files) {
      // order.files is already filtered to deletedAt: null by includeOrder.
      let absolutePath: string;
      try {
        absolutePath = resolveUploadPath(file.relativePath);
      } catch (err) {
        // A path that fails the traversal guard is corrupt data, not a
        // reason to fail the whole export — skip + log.
        this.logger.warn(
          `Skipping order file ${file.id} (bad path '${file.relativePath}'): ${(err as Error).message}`,
        );
        continue;
      }

      if (!fs.existsSync(absolutePath)) {
        this.logger.warn(
          `Skipping order file ${file.id} for order ${orderId}: blob missing at ${absolutePath}`,
        );
        continue;
      }

      // Localised folder label; unknown categories fall back to the raw
      // enum value so a future category never breaks the export.
      const folder = LAB_FOLDER_LABELS[language][file.category] ?? file.category;
      const baseName =
        file.originalName?.trim() ||
        file.generatedName?.trim() ||
        path.basename(file.relativePath);
      const entryName = uniqueName(folder, baseName);

      // Typed as ZipEntryData: `store` is honoured by the zip backend for
      // file entries (zip-stream sets the STORE method from it), but
      // @types/archiver only declares it on `append()`, so the narrower
      // `EntryData` on `file()` would reject the literal.
      const entry: ZipEntryData = {
        name: path.posix.join(folder, entryName),
        // Photos / CBCT bundles are already compressed — store them.
        store: isPrecompressedEntry(entryName),
      };
      archive.file(absolutePath, entry);
      appended += 1;
    }

    this.logger.log(
      `Prepared full ZIP for order ${order.orderCode} (${orderId}): ` +
        `${appended}/${order.files.length} file(s) by user ${caller.userId}`,
    );

    // Append the order sheet and finalize OFF the request path. Returning
    // now lets the controller send headers and start piping file bytes
    // immediately; the PDF (which has been rendering since the top of
    // this method) lands as the last entry whenever it is ready. The
    // export therefore costs max(render, streaming) instead of their sum.
    void this.appendOrderSheetAndFinalize(
      archive,
      dto,
      sheetRender,
      orderId,
      language,
    );

    return {
      archive,
      // Sanitise the order code for a Content-Disposition filename:
      // strip anything that isn't a safe filename char.
      fileName: `order-${(order.orderCode || orderId).replace(/[^\w.-]+/g, '_')}.zip`,
      mimeType: 'application/zip',
    };
  }

  /**
   * Tail of `downloadAllAsZip`, run after the archive stream has been
   * handed to the controller: wait for the order-sheet render, append it
   * (or the legacy JSON dump if rendering failed), then finalize.
   *
   * Everything is caught: this runs detached from the request promise, so
   * a throw here would surface as an unhandled rejection rather than a
   * 500. `finalize()` is in the `finally` block because a client whose
   * archive never finalises hangs until it times out — ending the stream
   * matters more than the sheet.
   */
  private async appendOrderSheetAndFinalize(
    archive: Archiver,
    dto: OrderResponseDto,
    sheetRender: Promise<
      { ok: true; pdf: Buffer } | { ok: false; err: unknown }
    >,
    orderId: string,
    language: LabZipLanguage = 'fr',
  ): Promise<void> {
    const safeCode = (dto.orderCode || orderId).replace(/[^\w.-]+/g, '_');
    try {
      const result = await sheetRender;
      // The client may have cancelled while the sheet was rendering; the
      // controller then aborted the archive. Appending to (or finalizing)
      // a torn-down archive only raises noise, so stop here.
      if (this.abortedArchives.has(archive)) return;
      if (result.ok) {
        // Deflated, NOT stored: the sheet is mostly uncompressed vector
        // path data from the odontogram, so zip shrinks it by about half
        // (measured 6.4 MB -> 3.0 MB) for a fraction of a second of CPU.
        archive.append(result.pdf, { name: SHEET_NAMES[language](safeCode) });
      } else {
        this.logger.error(
          `Order sheet PDF failed for order ${orderId} — falling back to order-data.json: ${
            result.err instanceof Error ? result.err.message : String(result.err)
          }`,
        );
        archive.append(JSON.stringify(dto, null, 2), {
          name: 'order-data.json',
        });
      }
    } catch (err) {
      this.logger.error(
        `Failed to attach order sheet for order ${orderId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      if (this.abortedArchives.has(archive)) return;
      try {
        await archive.finalize();
      } catch (err) {
        // Aborted = the client cancelled and the controller tore the
        // archive down; finalize rejecting is how this task unblocks.
        if (isAbortedArchiveError(err)) return;
        this.logger.error(
          `Failed to finalize export archive for order ${orderId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }
}
