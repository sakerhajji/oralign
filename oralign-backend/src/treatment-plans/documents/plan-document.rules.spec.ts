import {
  cleanDocumentName,
  hasActivePdfContent,
  PLAN_DOCUMENT_ERROR,
  PLAN_DOCUMENT_MAX_BYTES,
  planDocumentContentRejection,
  planDocumentShapeRejection,
} from './plan-document.rules';

const pdf = (body = '') =>
  Buffer.from(
    `%PDF-1.7\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n${body}\n%%EOF\n`,
    'latin1',
  );

const file = (
  over: Partial<{
    originalname: string;
    mimetype: string;
    buffer: Buffer;
  }> = {},
) => ({
  originalname: 'analyse-cbct.pdf',
  mimetype: 'application/pdf',
  buffer: pdf(),
  ...over,
});

describe('plan document rules', () => {
  describe('planDocumentShapeRejection', () => {
    it('requires a non-empty file', () => {
      expect(planDocumentShapeRejection(undefined)?.code).toBe(
        PLAN_DOCUMENT_ERROR.FILE_REQUIRED,
      );
      expect(planDocumentShapeRejection({ size: 0 })?.code).toBe(
        PLAN_DOCUMENT_ERROR.FILE_REQUIRED,
      );
    });

    it('accepts exactly 25 MB and refuses one byte more', () => {
      expect(
        planDocumentShapeRejection({ size: PLAN_DOCUMENT_MAX_BYTES }),
      ).toBeNull();
      expect(
        planDocumentShapeRejection({ size: PLAN_DOCUMENT_MAX_BYTES + 1 })?.code,
      ).toBe(PLAN_DOCUMENT_ERROR.TOO_LARGE);
    });
  });

  describe('planDocumentContentRejection', () => {
    it('accepts a plain PDF, whatever the case of its extension', () => {
      expect(planDocumentContentRejection(file())).toBeNull();
      expect(
        planDocumentContentRejection(file({ originalname: 'CEPH.PDF' })),
      ).toBeNull();
    });

    it.each(['application/x-pdf', 'application/octet-stream', ''])(
      'accepts the declared type %p when the bytes are a PDF',
      (mimetype) => {
        expect(planDocumentContentRejection(file({ mimetype }))).toBeNull();
      },
    );

    it('accepts a header after a short preamble (spec: first 1024 bytes)', () => {
      const buffer = Buffer.concat([Buffer.alloc(200, 0x20), pdf()]);
      expect(planDocumentContentRejection(file({ buffer }))).toBeNull();
    });

    it.each([
      ['another extension', { originalname: 'analyse.png' }],
      ['no extension', { originalname: 'analyse' }],
      ['a non-PDF declared type', { mimetype: 'image/png' }],
      [
        'a header beyond 1024 bytes',
        { buffer: Buffer.concat([Buffer.alloc(1100, 0x20), pdf()]) },
      ],
      [
        'an HTML body named .pdf',
        { buffer: Buffer.from('<html><script>alert(1)</script>') },
      ],
    ])('refuses %s as not a PDF', (_label, over) => {
      expect(planDocumentContentRejection(file(over))?.code).toBe(
        PLAN_DOCUMENT_ERROR.NOT_PDF,
      );
    });

    it('refuses a PDF with a script or a launch action', () => {
      for (const body of [
        '2 0 obj << /S /JavaScript /JS (app.alert(1)) >> endobj',
        '3 0 obj << /S /Launch /F (cmd.exe) >> endobj',
      ]) {
        expect(
          planDocumentContentRejection(file({ buffer: pdf(body) }))?.code,
        ).toBe(PLAN_DOCUMENT_ERROR.ACTIVE_CONTENT);
      }
    });
  });

  describe('hasActivePdfContent', () => {
    it('sees escaped spellings of the action names', () => {
      expect(hasActivePdfContent(pdf('<< /S /J#61vaScript >>'))).toBe(true);
      expect(hasActivePdfContent(pdf('<< /S /#4C#61unch >>'))).toBe(true);
    });

    it('ignores other names, escaped or not', () => {
      expect(hasActivePdfContent(pdf('<< /Font /F#31 /Name /A#42C >>'))).toBe(
        false,
      );
      expect(hasActivePdfContent(pdf('<< /OpenAction [3 0 R /Fit] >>'))).toBe(
        false,
      );
    });
  });

  describe('cleanDocumentName', () => {
    it('keeps a normal name', () => {
      expect(cleanDocumentName('Analyse céphalométrique.pdf')).toBe(
        'Analyse céphalométrique.pdf',
      );
    });

    it('drops path separators and control characters', () => {
      expect(cleanDocumentName('..\\..\\x/y\u0000\r\n.pdf')).toBe(
        '.._.._x_y.pdf',
      );
    });

    it('falls back on an empty name and bounds a long one', () => {
      expect(cleanDocumentName('   ')).toBe('document.pdf');
      const long = cleanDocumentName(`${'a'.repeat(300)}.pdf`);
      expect(long).toHaveLength(200);
      expect(long.endsWith('.pdf')).toBe(true);
    });
  });
});
