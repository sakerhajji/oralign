# Self-hosted brand fonts

The brand faces are served from these files through `next/font/local`.
They are **not** loaded with `next/font/google`.

## Why

`next/font/google` downloads the font files from Google during `next build`.
On 2026-11-05 the production build on the VPS failed for this reason:

- Google answered with file URLs of the form `fonts.gstatic.com/l/font?kit=…&skey=…`.
  Which URLs come back depends on the Google edge the build reaches.
- Turbopack (Next 16.2) cannot parse a font URL that contains `&`.
  It stops with "next/font/google queries have exactly one entry".

Keeping the files in the repo makes the build deterministic and offline.

## Files

| File | Family | Axis | Source (Google Fonts CDN) |
| --- | --- | --- | --- |
| `jost-latin.woff2` | Jost 3.710, normal | wght 100–900 | `fonts.gstatic.com/s/jost/v20/92zatBhPNqw73oTd4jQmfxI.woff2` |
| `dm-sans-latin.woff2` | DM Sans 4.004 (9pt optical size), normal | wght 100–1000 | `fonts.gstatic.com/s/dmsans/v17/rP2Yp2ywxg089UriI5-g4vlH9VoD8Cmcqbu0-K6z9mXg.woff2` |
| `playfair-display-latin.woff2` | Playfair Display 1.203, normal | wght 400–900 | `fonts.gstatic.com/s/playfairdisplay/v40/nuFiD-vYSZviVYUb_rj3ij__anPXDTzYgEM86xQ.woff2` |
| `playfair-display-italic-latin.woff2` | Playfair Display 1.203, italic | wght 400–900 | `fonts.gstatic.com/s/playfairdisplay/v40/nuFkD-vYSZviVYUb_rj3ij__anPXDTnogkk7yRZrPA.woff2` |

Each file is the variable font that `next/font/google` used to download for the "latin" subset.
It holds the same bytes, and one file serves every weight.

- **Coverage:** the latin subset covers French and English completely (é, œ, €, ’ and so on).
- **Other characters** fall back to the system font. Before, some were separate lazy downloads: latin-ext for all three families, and also Cyrillic and Vietnamese for Jost and Playfair. Arabic was never covered.

## Using them

The loaders that use these files:

- `src/app/(showcase)/_components/showcase-chrome.tsx`
- `src/app/created_for_you/layout.tsx`
- `src/components/welcome-gift/fonts.ts`

Each loader declares the same discrete weights its `next/font/google` call used, all pointing at the one variable file.
That keeps the rendering identical: the brand allows only those weights, and other weights snap to the nearest declared one.

To add a weight, add a `src` entry with the same path.
Do not download another file.

### Naming

Turbopack names a local font's family after the `const` the loader is assigned to, with no hash.
So always name the `const` after the typeface: `jost`, `dmSans`, `playfairDisplay`.

- Never use a generic name such as `serif` or `sans`.
  Two loaders would share it for different faces and their `@font-face` rules would collide.
- `declarations: [{ prop: 'font-family', … }]` does not work.
  Turbopack renames the `@font-face` but keeps the `const` name in the CSS variable, so the variable points at no font.
- Code that names a family literally, rather than through a CSS variable, must use these names (`dmSans`, `jost`, `playfairDisplay`).
  Example: the error screens' stacks in `src/lib/error-pages/copy.ts`.

## Licence

All three families are under the SIL Open Font License 1.1.
The licences are `OFL-jost.txt`, `OFL-dm-sans.txt` and `OFL-playfair-display.txt`, copied from github.com/google/fonts.
