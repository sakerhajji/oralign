# Bundled fonts for quotation PDFs

The Quotation PDF service (`src/quotations/services/quotation-pdf.service.ts`)
renders an HTML template with Chromium and embeds optional fonts from
this folder. Files are loaded lazily at runtime and never committed
binaries — the operator deploys whichever they are licensed to ship.

| File                  | Used for | Required? |
|-----------------------|----------|-----------|
| `Amiri-Regular.ttf`   | Arabic (`language=ar`) | Optional but strongly recommended |

## Arabic rendering

Chromium handles RTL direction and Arabic glyph shaping. The Docker
runtime also installs system fonts, so Arabic PDFs still generate when
this optional file is absent. Adding Amiri keeps the document style more
consistent and readable.

## How to enable Arabic rendering

1. Download **Amiri Regular** (SIL OFL 1.1, free for commercial use):
   <https://github.com/aliftype/amiri> → `fonts/ttf/Amiri-Regular.ttf`
2. Drop the file in this directory as `Amiri-Regular.ttf`.
3. Restart the backend container — the file is read on first PDF
   generation and cached for the process lifetime.

You can also point the backend to another mounted font path with:

```bash
ORALIGN_ARABIC_FONT_PATH=/app/secrets/fonts/Amiri-Regular.ttf
```
