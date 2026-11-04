import { DM_Sans, Jost } from 'next/font/google';

/*
 * The brand's two faces, as on the public site (showcase chrome): Jost
 * for display (the free Futura-model face closest to the Century Gothic
 * guideline) and DM Sans for text. The dashboard runs on the system
 * stack; only the welcome-gift surfaces speak in the brand's own voice,
 * so they load the faces here and expose them as CSS variables that
 * welcome-gift.module.css reads.
 */
const display = Jost({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--wg-font-display',
  display: 'swap',
});

const text = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--wg-font-text',
  display: 'swap',
});

/** Class names that define --wg-font-display / --wg-font-text. */
export const giftFonts = `${display.variable} ${text.variable}`;
