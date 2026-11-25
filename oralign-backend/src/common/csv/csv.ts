/**
 * The CSV dialect of every accountant / admin export (invoices, lab
 * production): UTF-8 with a BOM, `;` between cells, CRLF line ends.
 *
 * That is what French / Tunisian Excel opens straight into columns with
 * the accents intact: without the BOM it reads the file as ANSI (mojibake),
 * and with `,` it puts each line in one column. No xlsx dependency needed.
 */

export const CSV_SEPARATOR = ';';
export const CSV_EOL = '\r\n';
/** U+FEFF, built from its code so no invisible character sits in the source. */
export const CSV_BOM = String.fromCharCode(0xfeff);
export const CSV_MIME_TYPE = 'text/csv; charset=utf-8';

/** What a cell may hold: an object would print as "[object Object]". */
export type CsvValue = string | number | boolean | null | undefined;

/** Excel-safe CSV cell: quote-escape, and neutralise formula injection. */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // A cell starting with = + - @ is executed as a formula by Excel and
  // LibreOffice. Prefix it so a client name like "=cmd" stays text. A
  // leading tab or CR counts too: spreadsheets skip it, then read the
  // formula behind it (OWASP CSV injection list).
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[";\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** One line: every value through csvCell(), joined by the separator. */
export function csvLine(values: readonly CsvValue[]): string {
  return values.map((value) => csvCell(value)).join(CSV_SEPARATOR);
}

/**
 * The whole file: BOM, the header line, then `lines` (already built with
 * csvLine(), or joined by hand when some cells must stay raw), each ended
 * by CRLF.
 */
export function csvDocument(
  header: readonly string[],
  lines: readonly string[],
): string {
  return `${CSV_BOM}${[csvLine(header), ...lines].join(CSV_EOL)}${CSV_EOL}`;
}
