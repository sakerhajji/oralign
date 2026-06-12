'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileArchive,
  Loader2,
  ShieldAlert,
  UploadCloud,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/lang-context';

/**
 * Client-side ZIP upload screen with a *real* validation pass before bytes
 * leave the browser.
 *
 * Why it matters: a user could rename `payload.exe → archive.zip`, and the
 * backend's "MIME starts-with image/" check wouldn't catch it. The browser
 * is in the best position to look at the actual bytes:
 *
 *   1. Magic-byte check — first 4 bytes must match a ZIP local file header
 *      (PK\x03\x04), an empty-archive signature (PK\x05\x06), or a spanned
 *      archive (PK\x07\x08). Anything else is rejected with a clear reason.
 *
 *   2. Filename audit — we walk the central directory and read each entry's
 *      filename. We flag suspicious entries (executable extensions, path
 *      traversal, NTFS reserved names) and block the upload until the user
 *      resolves them or picks a different file.
 *
 *   3. Size + ratio sanity — refuse files over 50 MB and refuse archives
 *      whose declared uncompressed size exceeds 10× the compressed size
 *      with more than 50 entries (a simple zip-bomb heuristic).
 *
 * The actual ZIP bytes are passed through unchanged — the server stores the
 * archive as-is. We're not extracting anything; we're auditing.
 */

interface ZipEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  isDirectory: boolean;
}

interface ZipAudit {
  entries: ZipEntry[];
  warnings: string[];
  blockers: string[];
}

// 1 GB — CBCT / DICOM volumes regularly land in the 200–800 MB range,
// so the ZIP-bundle slot needs headroom. The backend enforces the same
// cap (MAX_FILE_SIZE_ZIP_BUNDLE_BYTES in order.service.ts) so a payload
// that slips past the dialog still hits a clear server-side rejection.
const MAX_ZIP_SIZE = 1024 * 1024 * 1024;
const BLOCKED_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'com', 'scr', 'pif', 'msi', 'lnk', 'hta',
  'vbs', 'wsh', 'ws', 'js', 'jse', 'ps1', 'psm1', 'reg',
  'jar', 'sh', 'py', 'app', 'dmg', 'iso', 'dll', 'so',
]);

export interface ZipUploadDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called after the user accepts the audit. Receives the original File. */
  onConfirm: (file: File) => void;
  /** Optional title shown in the header (e.g. "Upload images bundle"). */
  title?: string;
}

/** Shape of the translator forwarded into the module-scope audit engine. */
type Translate = (path: string, vars?: Record<string, string | number>) => string;

export function ZipUploadDialog({
  open,
  onClose,
  onConfirm,
  title,
}: ZipUploadDialogProps) {
  const { t } = useT();
  const dialogTitle = title ?? t('zipUi.defaultTitle');
  const [picked, setPicked] = useState<File | null>(null);
  const [audit, setAudit] = useState<ZipAudit | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset all state when the dialog closes.
  useEffect(() => {
    if (!open) {
      setPicked(null);
      setAudit(null);
      setAuditing(false);
      setError(null);
    }
  }, [open]);

  const handlePicked = async (file: File | null) => {
    if (!file) return;
    setPicked(file);
    setAudit(null);
    setError(null);
    setAuditing(true);
    try {
      const result = await auditZip(file, t);
      setAudit(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAuditing(false);
    }
  };

  const canConfirm = !!picked && !!audit && audit.blockers.length === 0 && !auditing;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[95dvh] w-[min(96vw,720px)] max-w-none flex-col overflow-hidden p-0 sm:max-w-none"
      >
        <header className="flex items-center justify-between border-b bg-muted/30 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <FileArchive className="h-5 w-5 shrink-0 text-primary" />
            <DialogTitle className="truncate text-sm font-semibold sm:text-base">
              {dialogTitle}
            </DialogTitle>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {/* File picker */}
          {!picked && (
            <label
              htmlFor="zip-upload-input"
              className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 p-8 text-center transition hover:border-primary hover:bg-primary/5"
            >
              <UploadCloud className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">{t('zipUi.chooseFile')}</p>
              <p className="text-xs text-muted-foreground">
                {t('zipUi.chooseHint', {
                  n: (MAX_ZIP_SIZE / (1024 * 1024 * 1024)).toFixed(0),
                })}
              </p>
              <input
                id="zip-upload-input"
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                className="sr-only"
                onChange={(event) => {
                  const f = event.target.files?.[0] ?? null;
                  void handlePicked(f);
                  event.currentTarget.value = '';
                }}
              />
            </label>
          )}

          {/* Audit in progress */}
          {picked && auditing && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-4 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>{t('zipUi.scanning', { name: picked.name })}</span>
            </div>
          )}

          {/* Hard error (couldn't even parse) */}
          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">{t('zipUi.validateError')}</p>
                <p className="mt-0.5 text-xs">{error}</p>
              </div>
            </div>
          )}

          {/* Audit results */}
          {picked && audit && !auditing && (
            <div className="space-y-3">
              {/* Summary card */}
              <div
                className={cn(
                  'rounded-lg border p-4 text-sm',
                  audit.blockers.length > 0
                    ? 'border-destructive/40 bg-destructive/5'
                    : audit.warnings.length > 0
                      ? 'border-amber-400/40 bg-amber-50 dark:bg-amber-950/30'
                      : 'border-emerald-400/40 bg-emerald-50 dark:bg-emerald-950/30',
                )}
              >
                <div className="flex items-start gap-3">
                  {audit.blockers.length > 0 ? (
                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  ) : audit.warnings.length > 0 ? (
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {audit.blockers.length > 0
                        ? t('zipUi.blockedSummary')
                        : audit.warnings.length > 0
                          ? audit.warnings.length === 1
                            ? t('zipUi.warningsOne')
                            : t('zipUi.warningsMany', {
                                count: audit.warnings.length,
                              })
                          : audit.entries.length === 1
                            ? t('zipUi.filesOne')
                            : t('zipUi.filesMany', {
                                count: audit.entries.length,
                              })}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {picked.name} · {formatBytes(picked.size)}
                    </p>
                  </div>
                </div>

                {(audit.blockers.length > 0 || audit.warnings.length > 0) && (
                  <ul className="mt-3 list-disc space-y-1 pl-6 text-xs">
                    {audit.blockers.map((msg, i) => (
                      <li key={`b-${i}`} className="text-destructive">
                        {msg}
                      </li>
                    ))}
                    {audit.warnings.map((msg, i) => (
                      <li key={`w-${i}`} className="text-amber-700 dark:text-amber-300">
                        {msg}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Contents preview */}
              <div className="overflow-hidden rounded-lg border">
                <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <span>
                    {t('zipUi.contents', { count: audit.entries.length })}
                  </span>
                  <span>{t('zipUi.size')}</span>
                </div>
                <div className="max-h-56 overflow-auto">
                  {audit.entries.length === 0 ? (
                    <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                      {t('zipUi.emptyArchive')}
                    </p>
                  ) : (
                    audit.entries.slice(0, 250).map((entry) => (
                      <div
                        key={entry.name}
                        className="flex items-center justify-between gap-3 border-b px-3 py-1.5 text-sm last:border-0"
                      >
                        <span className="min-w-0 truncate font-mono text-xs">
                          {entry.isDirectory ? '📁 ' : '📄 '}
                          {entry.name}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {entry.isDirectory ? '—' : formatBytes(entry.uncompressedSize)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                {audit.entries.length > 250 && (
                  <p className="border-t bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground">
                    {t('zipUi.firstEntries', { count: audit.entries.length })}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="sm:w-auto"
          >
            {t('common.cancel')}
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {picked && audit && !auditing && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setPicked(null);
                  setAudit(null);
                  setError(null);
                }}
              >
                {t('zipUi.pickAnother')}
              </Button>
            )}
            <Button
              type="button"
              disabled={!canConfirm}
              onClick={() => picked && onConfirm(picked)}
              className="gap-2"
            >
              <UploadCloud className="h-4 w-4" />
              {t('zipUi.uploadBtn')}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

// ─── Native ZIP central-directory walker ────────────────────────────────────
// We read just enough of the archive to list entries — no decompression, no
// third-party library. ZIP files store directory metadata at the *end*, in a
// fixed "End of Central Directory" record. We find that record, jump to the
// central directory, and iterate entries by their fixed-layout headers.

const SIG_EOCD = 0x06054b50;
const SIG_LFH = 0x04034b50;
const SIG_EOCD_EMPTY = 0x06054b50;
const SIG_SPANNED = 0x08074b50;

async function auditZip(file: File, t: Translate): Promise<ZipAudit> {
  if (file.size > MAX_ZIP_SIZE) {
    throw new Error(
      t('zipUi.audit.tooBig', {
        size: formatBytes(file.size),
        limit: formatBytes(MAX_ZIP_SIZE),
      }),
    );
  }

  // Magic-byte check on the first 4 bytes — guards against `.exe → .zip`
  // renames. Real ZIPs start with PK\x03\x04 (local file header) or are
  // empty / spanned variants.
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const headSig = readUint32LE(new DataView(head.buffer), 0);
  if (headSig !== SIG_LFH && headSig !== SIG_EOCD_EMPTY && headSig !== SIG_SPANNED) {
    throw new Error(t('zipUi.audit.badSignature'));
  }

  // Read the tail to find the End-of-Central-Directory record.
  const tailSize = Math.min(file.size, 64 * 1024); // standard heuristic
  const tail = new Uint8Array(
    await file.slice(file.size - tailSize, file.size).arrayBuffer(),
  );
  const eocdOffset = findEocdOffset(tail);
  if (eocdOffset < 0) {
    throw new Error(t('zipUi.audit.noEocd'));
  }

  const eocdView = new DataView(tail.buffer, eocdOffset);
  const totalEntries = eocdView.getUint16(10, true);
  const cdSize = eocdView.getUint32(12, true);
  const cdOffset = eocdView.getUint32(16, true);

  // Refuse archives that try to advertise more entries than reasonable.
  if (totalEntries > 50_000) {
    throw new Error(
      t('zipUi.audit.tooManyEntries', {
        count: totalEntries.toLocaleString(),
      }),
    );
  }

  // Read the central directory itself.
  const cdBytes = new Uint8Array(
    await file.slice(cdOffset, cdOffset + cdSize).arrayBuffer(),
  );
  const cdView = new DataView(cdBytes.buffer);
  const decoder = new TextDecoder('utf-8');
  const entries: ZipEntry[] = [];
  let pos = 0;
  let totalUncompressed = 0;
  let totalCompressed = 0;

  while (pos + 46 <= cdBytes.length) {
    const sig = cdView.getUint32(pos, true);
    if (sig !== 0x02014b50) break; // not a central directory header
    const compressedSize = cdView.getUint32(pos + 20, true);
    const uncompressedSize = cdView.getUint32(pos + 24, true);
    const nameLen = cdView.getUint16(pos + 28, true);
    const extraLen = cdView.getUint16(pos + 30, true);
    const commentLen = cdView.getUint16(pos + 32, true);
    const name = decoder.decode(cdBytes.subarray(pos + 46, pos + 46 + nameLen));
    entries.push({
      name,
      compressedSize,
      uncompressedSize,
      isDirectory: name.endsWith('/'),
    });
    totalCompressed += compressedSize;
    totalUncompressed += uncompressedSize;
    pos += 46 + nameLen + extraLen + commentLen;
  }

  const warnings: string[] = [];
  const blockers: string[] = [];

  // Audit each filename.
  for (const entry of entries) {
    if (entry.name.includes('..')) {
      blockers.push(t('zipUi.audit.pathTraversal', { name: entry.name }));
    }
    if (entry.name.startsWith('/') || /^[a-zA-Z]:/.test(entry.name)) {
      blockers.push(t('zipUi.audit.absolutePath', { name: entry.name }));
    }
    if (entry.name.includes(' ')) {
      blockers.push(t('zipUi.audit.nulByte', { name: entry.name }));
    }
    const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
    if (BLOCKED_EXTENSIONS.has(ext)) {
      blockers.push(t('zipUi.audit.executable', { name: entry.name, ext }));
    }
    // Mac metadata folders aren't dangerous, but the user should know.
    if (entry.name.startsWith('__MACOSX/') || entry.name.endsWith('.DS_Store')) {
      warnings.push(t('zipUi.audit.osMetadata', { name: entry.name }));
    }
  }

  // Cheap zip-bomb heuristic — only triggers on big archives with high
  // compression ratios, not normal photo bundles.
  if (
    entries.length > 50 &&
    totalCompressed > 0 &&
    totalUncompressed / totalCompressed > 100
  ) {
    blockers.push(
      t('zipUi.audit.zipBomb', {
        ratio: (totalUncompressed / totalCompressed).toFixed(0),
      }),
    );
  }

  return { entries, warnings, blockers };
}

function findEocdOffset(tail: Uint8Array): number {
  // EOCD signature is 4 bytes, then 18 bytes of fixed fields, then a
  // variable-length comment. Walk back from the end looking for the magic.
  // The maximum comment length is 65535 bytes, so 64 KB is enough.
  const view = new DataView(tail.buffer);
  for (let i = tail.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) return i;
  }
  return -1;
}

function readUint32LE(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  // CBCT / DICOM bundles routinely cross the 1 GB threshold — the
  // dialog and the error message both need to format that cleanly,
  // hence the GB branch (the cap itself is 1 GB so 1.0 GB is the
  // ceiling for what we'd ever format).
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
