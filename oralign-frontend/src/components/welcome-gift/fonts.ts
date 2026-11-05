import localFont from 'next/font/local';

/*
 * The brand's two faces, as on the public site (showcase chrome): Jost
 * for display (the free Futura-model face closest to the Century Gothic
 * guideline) and DM Sans for text. The dashboard runs on the system
 * stack; only the welcome-gift surfaces speak in the brand's own voice,
 * so they load the faces here and expose them as CSS variables that
 * welcome-gift.module.css reads.
 *
 * Self-hosted from src/fonts (see its README), never next/font/google:
 * that loader downloads from Google during `next build`, and a Google
 * answer Turbopack could not parse broke the production build. One
 * variable file per face; the declared weights are the ones the
 * surfaces use, as before.
 *
 * Turbopack names a local font's family after the const it is assigned
 * to (no hash), so the consts are named after the typeface: the families
 * are "jost" and "dmSans", the same as in the showcase chrome (same
 * files, so the duplicate @font-face rules agree).
 */
const jost = localFont({
  src: [
    { path: '../../fonts/jost-latin.woff2', weight: '400', style: 'normal' },
    { path: '../../fonts/jost-latin.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--wg-font-display',
  display: 'swap',
});

const dmSans = localFont({
  src: [
    { path: '../../fonts/dm-sans-latin.woff2', weight: '400', style: 'normal' },
    { path: '../../fonts/dm-sans-latin.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--wg-font-text',
  display: 'swap',
});

/** Class names that define --wg-font-display / --wg-font-text. */
export const giftFonts = `${jost.variable} ${dmSans.variable}`;
