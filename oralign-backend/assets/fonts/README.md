# Bundled fonts for the Quotation PDF

The Quotation PDF service (`src/quotations/services/quotation-pdf.service.ts`)
embeds the fonts in this folder. Files are loaded lazily at runtime
and never committed binaries — the operator deploys whichever they
are licensed to ship.

| File                  | Used for | Required? |
|-----------------------|----------|-----------|
| `Amiri-Regular.ttf`   | Arabic (`language=ar`) | Optional but strongly recommended |

## Why Arabic needs its own font

`pdfkit`'s built-in fonts (Helvetica, Times, Courier) don't include
Arabic glyphs. With no Arabic-capable TTF in this folder, an Arabic
Quote PDF will still generate but Arabic strings will render as
missing-glyph rectangles.

## How to enable Arabic rendering

1. Download **Amiri Regular** (SIL OFL 1.1, free for commercial use):
   <https://github.com/aliftype/amiri> → `fonts/ttf/Amiri-Regular.ttf`
2. Drop the file in this directory as `Amiri-Regular.ttf`.
3. Restart the backend container — the file is read on first PDF
   generation and cached for the process lifetime.

## Arabic shaping limitation

`pdfkit` does not perform RTL bidirectional reordering or Arabic glyph
shaping (contextual letter joining). Even with the Amiri font, Arabic
text in the PDF will render letter-by-letter (isolated forms) rather
than as proper cursive script.

The PDF service does its best: right-aligns Arabic blocks, picks the
Amiri font when available, and reverses string direction at the line
level for headings.

If you need fully shaped Arabic output, swap the PDF backend to
**puppeteer** (HTML → PDF, full browser-grade shaping). That's a
separate, larger PR — track it as a follow-up.
