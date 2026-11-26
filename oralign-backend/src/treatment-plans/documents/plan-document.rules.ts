import { TreatmentPlanDocumentKind } from '@prisma/client';

/**
 * The analysis PDFs of a treatment plan version (CBCT analysis,
 * cephalometric analysis): the upload contract, shared by the service,
 * the controller's multer limit and the specs. The frontend mirrors it in
 * lib/types/treatment-plan.ts; the server stays the judge.
 */

export const PLAN_DOCUMENT_KINDS: readonly TreatmentPlanDocumentKind[] =
  Object.values(TreatmentPlanDocumentKind);

/** 25 MB: an analysis report with its slices fits; a CBCT volume does not. */
export const PLAN_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;

export const PLAN_DOCUMENT_MIME = 'application/pdf';

/** Stable error codes, translated by the frontend. */
export const PLAN_DOCUMENT_ERROR = {
  FILE_REQUIRED: 'DOCUMENT_FILE_REQUIRED',
  TOO_LARGE: 'DOCUMENT_TOO_LARGE',
  NOT_PDF: 'DOCUMENT_NOT_PDF',
  UNSAFE: 'DOCUMENT_UNSAFE',
  ACTIVE_CONTENT: 'DOCUMENT_ACTIVE_CONTENT',
  NOT_FOUND: 'DOCUMENT_NOT_FOUND',
} as const;

export type PlanDocumentErrorCode =
  (typeof PLAN_DOCUMENT_ERROR)[keyof typeof PLAN_DOCUMENT_ERROR];

export interface PlanDocumentRejection {
  code: PlanDocumentErrorCode;
  message: string;
}

/**
 * What a browser may declare for a PDF: the real type, the old alias, and
 * "unknown" (some drag sources send no type at all). The bytes decide.
 */
const ACCEPTED_DECLARED_TYPES = new Set([
  'application/pdf',
  'application/x-pdf',
  'application/octet-stream',
  '',
]);

/** The PDF spec allows the header anywhere in the first 1024 bytes. */
const PDF_HEADER = Buffer.from('%PDF-');
const PDF_HEADER_WINDOW = 1024;

/**
 * Action names that make a PDF run something when a desktop reader opens
 * it: scripts and launching another program. Our viewer (pdf.js, no
 * scripting) never runs them, but the doctor downloads the file too.
 */
const ACTIVE_NAMES = new Set(['JavaScript', 'Launch']);

/**
 * A PDF name spelled with at least one `#xx` escape (`/J#61vaScript`).
 * Letters, digits and escapes are enough: the names we look for are
 * plain words.
 */
const ESCAPED_NAME = /\/([A-Za-z0-9#]*#[0-9A-Fa-f]{2}[A-Za-z0-9#]*)/g;

/**
 * Whether the raw bytes name a script or launch action, the escaped
 * spellings included. Objects inside a compressed object stream are not
 * inflated here: this is a cheap first line, the reader-side guard is
 * that nothing on our side ever executes the file.
 */
export function hasActivePdfContent(buffer: Buffer): boolean {
  const text = buffer.toString('latin1');
  for (const name of ACTIVE_NAMES) {
    if (text.includes(`/${name}`)) return true;
  }
  if (!text.includes('#')) return false;
  for (const match of text.matchAll(ESCAPED_NAME)) {
    const decoded = match[1].replace(/#([0-9A-Fa-f]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
    if (ACTIVE_NAMES.has(decoded)) return true;
  }
  return false;
}

/** The file's shape before anything is checked against the database. */
export function planDocumentShapeRejection(
  file: { size: number } | undefined | null,
): PlanDocumentRejection | null {
  if (!file || file.size === 0) {
    return {
      code: PLAN_DOCUMENT_ERROR.FILE_REQUIRED,
      message: 'A PDF file is required.',
    };
  }
  if (file.size > PLAN_DOCUMENT_MAX_BYTES) {
    return {
      code: PLAN_DOCUMENT_ERROR.TOO_LARGE,
      message: 'The PDF must be 25 MB or less.',
    };
  }
  return null;
}

/**
 * The PDF rules on the bytes: a `.pdf` name, a declared type a browser
 * really sends for a PDF, the `%PDF-` header, no script or launch action.
 * Returns the first rule broken, or null.
 */
export function planDocumentContentRejection(file: {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}): PlanDocumentRejection | null {
  const isPdfName = /\.pdf$/i.test(file.originalname.trim());
  const declared = (file.mimetype ?? '').toLowerCase();
  const header = file.buffer.subarray(0, PDF_HEADER_WINDOW);
  if (
    !isPdfName ||
    !ACCEPTED_DECLARED_TYPES.has(declared) ||
    !header.includes(PDF_HEADER)
  ) {
    return {
      code: PLAN_DOCUMENT_ERROR.NOT_PDF,
      message: 'The file must be a PDF.',
    };
  }
  if (hasActivePdfContent(file.buffer)) {
    return {
      code: PLAN_DOCUMENT_ERROR.ACTIVE_CONTENT,
      message:
        'This PDF contains a script or a launch action. Save it again as a plain PDF (Print → Save as PDF) and upload that copy.',
    };
  }
  return null;
}

/** A display name that is safe in headers and logs, extension kept. */
export function cleanDocumentName(originalName: string): string {
  const base = Array.from(originalName.replace(/[\\/]/g, '_'))
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f;
    })
    .join('')
    .trim();
  const name = base.length > 0 ? base : 'document.pdf';
  return name.length > 200 ? `${name.slice(0, 196)}.pdf` : name;
}
