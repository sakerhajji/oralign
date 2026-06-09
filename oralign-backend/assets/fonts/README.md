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
image bundles **Noto Naskh Arabic** (`font-noto-arabic`), which the PDF
template's RTL font stack prefers — so Arabic PDFs render with a clean
Naskh face even when the optional Amiri file below is absent. (Plain
`ttf-dejavu` has **no** Arabic glyphs, so without an Arabic font package
Arabic would print as tofu boxes.) Adding Amiri embeds the font directly
in the PDF, keeping Arabic identical across every environment, including
local dev where the host may lack a good Arabic face.

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
