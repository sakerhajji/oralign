/**
 * Upload content-security scanner.
 *
 * The upload endpoints already allow-list file EXTENSIONS, but an
 * extension is attacker-controlled metadata — `payload.exe` renamed to
 * `scan.dcm` sails straight through a name-only check. This module adds
 * the missing layer: it looks at the actual BYTES and refuses anything
 * whose content is a script or an executable, or a ZIP that carries such
 * content.
 *
 * Design (defense in depth, low false-positive):
 *   1. Denylist by signature  — reject if the leading bytes are a known
 *      executable / script format (PE, ELF, Mach-O, shebang, Java class),
 *      regardless of the claimed extension. Catches disguised binaries.
 *   2. Allowlist by magic     — for formats with a stable signature
 *      (JPEG/PNG/GIF/WebP/PDF/ZIP/MP4/AVI/HEIC) the content MUST match the
 *      declared extension. A `.jpg` that isn't a JPEG is rejected.
 *   3. Text-marker scan       — for the "loose" formats that have no hard
 *      magic (STL/PLY/OBJ, preamble-less DICOM) scan a bounded prefix for
 *      active-script markers (`<script`, `<?php`, `#!/`, …).
 *   4. ZIP entry inspection   — open the archive's central directory ONLY
 *      (yauzl, no inflation → zip-bomb-safe) and reject dangerous entry
 *      extensions, path traversal, absolute paths, and bomb-like ratios.
 *
 * Nothing here is ever executed or extracted server-side; this is a
 * gatekeeper so malicious payloads never land in storage in the first
 * place. Returns a verdict; the caller decides how to surface it.
 */

import * as fs from 'fs';
import * as yauzl from 'yauzl';
import {
  ZIP_MAX_LISTED_ENTRIES,
  ZIP_SUSPICIOUS_RATIO,
  ZIP_SUSPICIOUS_TOTAL_BYTES,
} from './media.constants';

export type FileSecurityCode =
  | 'executable'
  | 'script'
  | 'type_mismatch'
  | 'zip_dangerous_entry'
  | 'zip_traversal'
  | 'zip_bomb'
  | 'zip_unreadable'
  | 'empty';

export interface FileSecurityVerdict {
  safe: boolean;
  /** Machine-readable reason code (stable; usable for i18n on the client). */
  code?: FileSecurityCode;
  /** Human-readable English reason (fallback message / logs). */
  reason?: string;
  /** For ZIPs: the offending entry name, when applicable. */
  detail?: string;
}

export interface ScannableFile {
  originalname: string;
  buffer: Buffer;
  mimetype?: string;
}

// ── Executable / script binary signatures ───────────────────────────────
// Matched at offset 0. If a file STARTS like one of these it is an
// executable or script no matter what extension it wears.
const EXECUTABLE_SIGNATURES: { bytes: number[]; label: string }[] = [
  { bytes: [0x4d, 0x5a], label: 'DOS/Windows executable (MZ)' }, // .exe/.dll
  { bytes: [0x7f, 0x45, 0x4c, 0x46], label: 'ELF executable' }, // Linux
  { bytes: [0xfe, 0xed, 0xfa, 0xce], label: 'Mach-O executable' },
  { bytes: [0xfe, 0xed, 0xfa, 0xcf], label: 'Mach-O executable' },
  { bytes: [0xce, 0xfa, 0xed, 0xfe], label: 'Mach-O executable' },
  { bytes: [0xcf, 0xfa, 0xed, 0xfe], label: 'Mach-O executable' },
  { bytes: [0xca, 0xfe, 0xba, 0xbe], label: 'Java class / Mach-O fat binary' },
  { bytes: [0x23, 0x21], label: 'script with shebang (#!)' }, // #!/bin/sh …
  { bytes: [0xd0, 0xcf, 0x11, 0xe0], label: 'OLE compound (legacy Office/exe)' },
];

// ── Active-content text markers ─────────────────────────────────────────
// Scanned (case-insensitively) in a bounded prefix for the "loose"
// formats. Presence means the file carries runnable script / markup.
const SCRIPT_MARKERS = [
  // ── Active markup / web script ──
  '<?php',
  '<script',
  '</script',
  '<%@',
  '<%=',
  'javascript:',
  'vbscript:',
  '<!doctype html',
  '<html',
  '<svg', // SVG can carry onload/script handlers
  // ── Shell / OS scripting ──
  '#!/bin/',
  '#!/usr/bin/',
  'powershell',
  'wscript.shell',
  'cscript',
  'cmd.exe',
  '/bin/sh',
  '/bin/bash',
  'activexobject',
  'createobject(',
  'shell.application',
  // ── High-signal source-code / command-execution tokens ──
  // These catch a plain-text script/code payload disguised as a loose,
  // magic-less format (e.g. `import os; os.popen(...)` renamed .stl/.txt)
  // WITHOUT tripping on ASCII STL/OBJ/PLY geometry or normal clinical
  // notes, none of which contain these exact substrings.
  'os.popen',
  'os.system',
  'subprocess',
  'child_process',
  'require(',
  'eval(',
  'exec(',
  'system(',
  'passthru(',
  'shell_exec',
  'proc_open',
  'runtime.getruntime',
  'processbuilder',
  '__import__',
  'base64_decode',
];

// ── Dangerous "code" extensions ──────────────────────────────────────────
// Scripts, executables, installers, macro-enabled documents, and shortcuts.
// These are the "files with scripts of code" that are ALWAYS refused — both
// as a top-level upload and as a ZIP entry — regardless of what the bytes
// look like. Documents, data, media and 3D models are NOT here (the upload
// policy is a denylist: any file is accepted unless it is dangerous).
const CODE_EXTENSIONS: string[] = [
  // native executables / libraries
  '.exe', '.dll', '.so', '.dylib', '.bin', '.msi', '.msp', '.com', '.scr',
  '.cpl', '.sys', '.drv', '.ocx', '.efi', '.o',
  // installers / packages
  '.apk', '.app', '.dmg', '.pkg', '.deb', '.rpm', '.appimage', '.msix',
  // shell / windows scripting
  '.sh', '.bash', '.zsh', '.ksh', '.csh', '.bat', '.cmd', '.ps1', '.psm1',
  '.psd1', '.vbs', '.vbe', '.js', '.mjs', '.cjs', '.jse', '.wsf', '.wsh',
  '.hta', '.ahk', '.ps2', '.msh', '.msh1', '.msh2',
  // interpreted languages
  '.py', '.pyc', '.pyo', '.pyw', '.rb', '.pl', '.pm', '.php', '.php3',
  '.php4', '.php5', '.php7', '.phtml', '.phar', '.lua', '.tcl', '.groovy',
  // server pages / web-executable
  '.asp', '.aspx', '.ashx', '.asmx', '.jsp', '.jspx', '.cgi', '.htaccess',
  '.cshtml', '.vbhtml',
  // markup with active content
  '.html', '.htm', '.xhtml', '.shtml', '.svg', '.svgz', '.mht', '.mhtml',
  '.url', '.xml', '.xsl', '.xslt',
  // jvm / android / .net
  '.jar', '.class', '.dex', '.war', '.ear',
  // macro-enabled office
  '.docm', '.xlsm', '.pptm', '.dotm', '.xltm', '.potm', '.xlam', '.ppam',
  '.sldm', '.xll',
  // windows shortcuts / registry / scriptlets / help
  '.lnk', '.reg', '.scf', '.inf', '.sct', '.wsc', '.job', '.msc', '.gadget',
  '.chm', '.pif', '.application', '.appref-ms',
];

// Nested archives — dangerous ONLY as a ZIP entry (they hide payloads and
// invite unzip recursion). A top-level `.zip` is fine (it gets deep-scanned)
// and other top-level archives are inert opaque blobs (never extracted).
const NESTED_ARCHIVE_EXTENSIONS: string[] = [
  '.zip', '.rar', '.7z', '.gz', '.bz2', '.tar', '.tgz', '.tbz', '.xz', '.z',
  '.cab', '.iso', '.arj', '.lzh', '.ace', '.cpio', '.lz', '.lz4', '.zst',
];

// Top-level upload denylist: code/scripts/executables only (archives allowed).
const DANGEROUS_UPLOAD_EXTENSIONS = new Set<string>(CODE_EXTENSIONS);

// ZIP-entry denylist: code/scripts/executables PLUS nested archives.
const DANGEROUS_ENTRY_EXTENSIONS = new Set<string>([
  ...CODE_EXTENSIONS,
  ...NESTED_ARCHIVE_EXTENSIONS,
]);

/**
 * True when a file NAME carries a script/executable extension that must be
 * refused at upload time no matter its content. Callers use this in place
 * of a strict allow-list so any other file type is accepted (and still
 * runs through the byte-level content scan below).
 */
export function isDangerousUploadExtension(name: string): boolean {
  return DANGEROUS_UPLOAD_EXTENSIONS.has(extOf(name));
}

const PREFIX_SCAN_BYTES = 64 * 1024; // 64 KB is plenty for headers/markers.

function startsWith(buf: Buffer, sig: number[], offset = 0): boolean {
  if (buf.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (buf[offset + i] !== sig[i]) return false;
  }
  return true;
}

/** ASCII match at an offset (e.g. "ftyp", "WEBP", "DICM"). */
function asciiAt(buf: Buffer, text: string, offset: number): boolean {
  if (buf.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (buf[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

/** True if the string carries any C0/DEL control byte — never valid in a
 *  legitimate archive member name. Implemented as a loop so no control
 *  byte ever appears in this source file. */
function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f) return true;
  }
  return false;
}

function hasExecutableSignature(buf: Buffer): string | null {
  for (const { bytes, label } of EXECUTABLE_SIGNATURES) {
    if (startsWith(buf, bytes)) return label;
  }
  return null;
}

function hasScriptMarker(buf: Buffer): string | null {
  const slice = buf.subarray(0, PREFIX_SCAN_BYTES).toString('latin1').toLowerCase();
  for (const marker of SCRIPT_MARKERS) {
    if (slice.includes(marker)) return marker;
  }
  return null;
}

/**
 * True when the header is (almost) entirely printable text. A real DICOM
 * volume is binary (tag lengths, pixel data → many high/low bytes); a
 * disguised script/markup (`.js`/`.sh`/`.php`/HTML renamed `.dcm`) is
 * pure text. This is the discriminator that catches a plain-code payload
 * with none of the HTML/shebang markers above. Sampled over 1 KB with a
 * high threshold so a genuine binary file is never misjudged.
 */
function looksLikeText(buf: Buffer): boolean {
  const n = Math.min(buf.length, 1024);
  if (n < 8) return false;
  let printable = 0;
  for (let i = 0; i < n; i++) {
    const c = buf[i];
    // Tab/LF/CR or the printable ASCII range.
    if (c === 0x09 || c === 0x0a || c === 0x0d || (c >= 0x20 && c <= 0x7e)) {
      printable++;
    }
  }
  return printable / n >= 0.95;
}

// Magic checks for the strongly-typed formats. Returns true when the
// content matches the given extension. Extensions not covered here have
// no reliable magic and are handled by the loose-format path.
function magicMatchesExtension(buf: Buffer, ext: string): boolean {
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return startsWith(buf, [0xff, 0xd8, 0xff]);
    case '.png':
      return startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case '.gif':
      return asciiAt(buf, 'GIF8', 0);
    case '.webp':
      return asciiAt(buf, 'RIFF', 0) && asciiAt(buf, 'WEBP', 8);
    case '.pdf':
      // Spec allows the %PDF- header within the first 1024 bytes.
      return buf.subarray(0, 1024).includes(Buffer.from('%PDF-'));
    case '.zip':
      // Local file header, empty archive, or spanned marker.
      return (
        startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) ||
        startsWith(buf, [0x50, 0x4b, 0x05, 0x06]) ||
        startsWith(buf, [0x50, 0x4b, 0x07, 0x08])
      );
    case '.mp4':
    case '.mov':
      return asciiAt(buf, 'ftyp', 4);
    case '.avi':
      return asciiAt(buf, 'RIFF', 0) && asciiAt(buf, 'AVI ', 8);
    case '.heic':
      // ISO-BMFF: `....ftyp` + a heif brand.
      return (
        asciiAt(buf, 'ftyp', 4) &&
        (asciiAt(buf, 'heic', 8) ||
          asciiAt(buf, 'heix', 8) ||
          asciiAt(buf, 'mif1', 8) ||
          asciiAt(buf, 'heif', 8) ||
          asciiAt(buf, 'hevc', 8))
      );
    default:
      return true; // no hard magic for this extension → not decisive here
  }
}

const STRICT_MAGIC_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.zip',
  '.mp4', '.mov', '.avi', '.heic',
]);

/**
 * Judge a file's PREFIX bytes (first 64 KB is enough for every check
 * below). Returns 'zip' when the content is a valid ZIP whose entries
 * still need inspecting — the caller picks the buffer- or file-based
 * ZIP walk. Shared by the single-shot (RAM buffer) and chunked
 * (assembled-on-disk) upload paths so both enforce identical rules.
 */
function judgePrefix(
  buf: Buffer,
  ext: string,
): FileSecurityVerdict | 'zip' {
  // 1) Disguised executable / script — reject no matter the extension.
  const exe = hasExecutableSignature(buf);
  if (exe) {
    return {
      safe: false,
      code: 'executable',
      reason: `File looks like an executable (${exe}) and cannot be uploaded.`,
    };
  }

  // 2) Strong-magic formats must match their declared extension.
  if (STRICT_MAGIC_EXTENSIONS.has(ext)) {
    if (!magicMatchesExtension(buf, ext)) {
      return {
        safe: false,
        code: 'type_mismatch',
        reason: `File content does not match its "${ext}" type.`,
      };
    }
    // ZIP gets a full entry inspection by the caller.
    if (ext === '.zip') return 'zip';
    // Other strong-magic formats are validated binary blobs — done.
    return { safe: true };
  }

  // 3) Loose formats (.dcm/.stl/.ply/.obj/…): no hard magic. Accept only
  //    if there's no active-script marker in the header. DICOM with the
  //    standard preamble (`DICM` @128) is trusted outright; a preamble-less
  //    `.dcm` that is plain TEXT is a disguised script (a real DICOM is
  //    binary) — reject it even when it has no HTML/shebang marker.
  if (ext === '.dcm') {
    if (asciiAt(buf, 'DICM', 128)) return { safe: true };
    if (looksLikeText(buf)) {
      return {
        safe: false,
        code: 'script',
        reason:
          'File does not look like a DICOM image (its content is text/code).',
      };
    }
  }
  const marker = hasScriptMarker(buf);
  if (marker) {
    return {
      safe: false,
      code: 'script',
      reason: `File contains script/code ("${marker}") and cannot be uploaded.`,
    };
  }

  return { safe: true };
}

/**
 * Scan a single uploaded file. Extension allow-listing / size limits stay
 * with the caller — this only judges CONTENT.
 */
export async function scanUploadContent(
  file: ScannableFile,
): Promise<FileSecurityVerdict> {
  const buf = file.buffer;
  if (!buf || buf.length === 0) {
    return { safe: false, code: 'empty', reason: 'The file is empty.' };
  }

  const verdict = judgePrefix(buf, extOf(file.originalname));
  if (verdict === 'zip') return scanZipBuffer(buf);
  return verdict;
}

/**
 * Scan a file that already lives ON DISK (chunked-upload assembly) with
 * the exact same rules as scanUploadContent — but without ever loading
 * the payload into RAM: the prefix checks read the first 64 KB and the
 * ZIP walk streams the central directory via yauzl.open().
 */
export async function scanUploadFile(
  absolutePath: string,
  originalName: string,
): Promise<FileSecurityVerdict> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(absolutePath);
  } catch {
    return { safe: false, code: 'empty', reason: 'The file is missing.' };
  }
  if (stat.size === 0) {
    return { safe: false, code: 'empty', reason: 'The file is empty.' };
  }

  const prefixLength = Math.min(stat.size, 64 * 1024);
  const prefix = Buffer.alloc(prefixLength);
  const fd = await fs.promises.open(absolutePath, 'r');
  try {
    await fd.read(prefix, 0, prefixLength, 0);
  } finally {
    await fd.close();
  }

  const verdict = judgePrefix(prefix, extOf(originalName));
  if (verdict !== 'zip') return verdict;

  return new Promise((resolve) => {
    yauzl.open(absolutePath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        resolve({
          safe: false,
          code: 'zip_unreadable',
          reason: 'The ZIP archive is corrupt or unreadable.',
        });
        return;
      }
      inspectZipEntries(zipfile, stat.size, resolve);
    });
  });
}

/**
 * Inspect a ZIP archive's central directory (no extraction / inflation).
 * Rejects dangerous entry types, path traversal, and bomb-like archives.
 */
export function scanZipBuffer(buf: Buffer): Promise<FileSecurityVerdict> {
  return new Promise((resolve) => {
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        resolve({
          safe: false,
          code: 'zip_unreadable',
          reason: 'The ZIP archive is corrupt or unreadable.',
        });
        return;
      }
      inspectZipEntries(zipfile, buf.length, resolve);
    });
  });
}

/**
 * Shared central-directory walk used by both the buffer- and file-based
 * ZIP scans. `archiveBytes` (compressed size on the wire) feeds the
 * bomb-ratio guard.
 */
function inspectZipEntries(
  zipfile: yauzl.ZipFile,
  archiveBytes: number,
  resolve: (verdict: FileSecurityVerdict) => void,
): void {
  let entryCount = 0;
  let totalUncompressed = 0;
  let settled = false;

  const done = (verdict: FileSecurityVerdict) => {
    if (settled) return;
    settled = true;
    try {
      zipfile.close();
    } catch {
      /* already closed */
    }
    resolve(verdict);
  };

  zipfile.on('entry', (entry: yauzl.Entry) => {
    entryCount += 1;
    totalUncompressed += entry.uncompressedSize || 0;

    const raw = entry.fileName || '';
    const normalized = raw.replace(/\\/g, '/');

    // Control chars / null bytes in a member name — never legitimate.
    if (hasControlChar(raw)) {
      done({
        safe: false,
        code: 'zip_traversal',
        reason: 'The archive contains an entry with an invalid name.',
        detail: raw,
      });
      return;
    }

    // Path traversal / absolute paths → Zip-Slip.
    const segments = normalized.split('/');
    const isAbsolute =
      normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized);
    if (isAbsolute || segments.some((s) => s === '..')) {
      done({
        safe: false,
        code: 'zip_traversal',
        reason: 'The archive contains an unsafe path (directory traversal).',
        detail: raw,
      });
      return;
    }

    // Dangerous member type (skip pure directory entries).
    const isDir = normalized.endsWith('/');
    if (!isDir) {
      const entryExt = extOf(normalized);
      if (DANGEROUS_ENTRY_EXTENSIONS.has(entryExt)) {
        done({
          safe: false,
          code: 'zip_dangerous_entry',
          reason: `The archive contains a script/executable file (${entryExt}).`,
          detail: raw,
        });
        return;
      }
    }

    // Bomb guards — declared sizes only (nothing is inflated).
    if (
      entryCount > ZIP_MAX_LISTED_ENTRIES ||
      totalUncompressed > ZIP_SUSPICIOUS_TOTAL_BYTES ||
      totalUncompressed / Math.max(1, archiveBytes) > ZIP_SUSPICIOUS_RATIO
    ) {
      done({
        safe: false,
        code: 'zip_bomb',
        reason: 'The archive looks like a zip bomb and was rejected.',
      });
      return;
    }

    zipfile.readEntry();
  });

  zipfile.on('end', () => {
    if (entryCount === 0) {
      done({ safe: false, code: 'empty', reason: 'The ZIP archive is empty.' });
      return;
    }
    done({ safe: true });
  });

  zipfile.on('error', () => {
    done({
      safe: false,
      code: 'zip_unreadable',
      reason: 'The ZIP archive is corrupt or unreadable.',
    });
  });

  zipfile.readEntry();
}
