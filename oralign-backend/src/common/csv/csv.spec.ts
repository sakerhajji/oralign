import { CSV_BOM, CSV_MIME_TYPE, csvCell, csvDocument, csvLine } from './csv';

describe('csvCell', () => {
  it('writes null and undefined as an empty cell, numbers and booleans as text', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(12)).toBe('12');
    expect(csvCell(0)).toBe('0');
    expect(csvCell(false)).toBe('false');
    expect(csvCell('Zoé Ben Salah')).toBe('Zoé Ben Salah');
  });

  it.each(['=cmd|"/c calc"!A0', '+33 1', '-2+3', '@SUM(A1)'])(
    'neutralises the formula start of %p',
    (value) => {
      expect(csvCell(value).replace(/^"/, '').startsWith(`'${value[0]}`)).toBe(
        true,
      );
    },
  );

  it('neutralises a formula hidden behind a leading tab or carriage return', () => {
    expect(csvCell('\t=HYPERLINK("x")')).toBe(`"'\t=HYPERLINK(""x"")"`);
    expect(csvCell('\tAna')).toBe(`'\tAna`);
    // A CR also forces the quoting, the guard sits inside the quotes.
    expect(csvCell('\r=1+1')).toBe(`"'\r=1+1"`);
  });

  it('leaves a tab or a carriage return in the middle of a cell unguarded', () => {
    expect(csvCell('Ana\tBen Ali')).toBe('Ana\tBen Ali');
    expect(csvCell('a\rb')).toBe('"a\rb"');
  });

  it('leaves a formula character in the middle of a cell alone', () => {
    expect(csvCell('a=b')).toBe('a=b');
    expect(csvCell('2026-11-03')).toBe('2026-11-03');
  });

  it('quotes a cell holding the separator, a quote or a line break, doubling the quotes', () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('dit "oui"')).toBe('"dit ""oui"""');
    expect(csvCell('ligne 1\nligne 2')).toBe('"ligne 1\nligne 2"');
    expect(csvCell('ligne 1\r\nligne 2')).toBe('"ligne 1\r\nligne 2"');
    // A comma is not our separator: no quoting needed.
    expect(csvCell('a, b')).toBe('a, b');
  });

  it('guards then quotes when both apply', () => {
    expect(csvCell('=1;2')).toBe(`"'=1;2"`);
  });
});

describe('csvLine', () => {
  it('runs every value through csvCell and joins them with ";"', () => {
    expect(csvLine(['a', null, 3, '=x', 'b;c'])).toBe(`a;;3;'=x;"b;c"`);
  });

  it('an empty list is an empty line', () => {
    expect(csvLine([])).toBe('');
  });
});

describe('csvDocument', () => {
  it('starts with the BOM, ends every line (the last too) with CRLF', () => {
    const doc = csvDocument(['Jour', 'Étape de'], ['2026-11-03;1', 'x;2']);
    expect(doc.charCodeAt(0)).toBe(0xfeff);
    expect(doc.startsWith(CSV_BOM)).toBe(true);
    expect(doc.slice(1)).toBe('Jour;Étape de\r\n2026-11-03;1\r\nx;2\r\n');
  });

  it('escapes the header cells like any other', () => {
    expect(csvDocument(['a;b'], []).slice(1)).toBe('"a;b"\r\n');
  });

  it('is served as UTF-8 text/csv', () => {
    expect(CSV_MIME_TYPE).toBe('text/csv; charset=utf-8');
  });
});
