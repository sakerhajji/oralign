/**
 * Public Treatment Viewer layout.
 *
 * Wraps the patient-facing pages with the same Header + Footer used on
 * the marketing showcase so the patient's first impression matches the
 * brand they were referred from. This route group is OUTSIDE the
 * (showcase) group on purpose (the URL path is /created_for_you/<token>
 * instead of /), but reuses the same components, fonts, CSS variables,
 * and i18n context.
 */
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { LangProvider } from '../(showcase)/_lib/i18n/lang-context';
import { Header } from '../(showcase)/_components/header';
import { Footer } from '../(showcase)/_components/footer';
import { FloatingLang } from '../(showcase)/_components/floating-lang';
// Pull in the showcase CSS variables + behavioural rules. Next.js
// hoists global CSS imports so they apply to this subtree.
import '../(showcase)/showcase.css';

// Self-hosted from src/fonts (see its README), never next/font/google: that
// loader downloads from Google during `next build`, and a Google answer
// Turbopack could not parse broke the production build. One variable file
// per face and style; the declared weights are the ones used before. Paths
// stay literal: next/font only accepts static options.
// Turbopack names a local font's family after the const it is assigned to
// (no hash), so each const is named after its typeface: the generated
// families are "jost", "dmSans", "playfairDisplay", never a generic word
// two loaders could share for different faces. A custom font-family in
// `declarations` is not an option: Turbopack keeps the const name in the
// CSS variable, which then points at no @font-face.
const playfairDisplay = localFont({
  src: [
    { path: '../../fonts/playfair-display-latin.woff2', weight: '400', style: 'normal' },
    { path: '../../fonts/playfair-display-latin.woff2', weight: '500', style: 'normal' },
    { path: '../../fonts/playfair-display-latin.woff2', weight: '600', style: 'normal' },
    { path: '../../fonts/playfair-display-italic-latin.woff2', weight: '400', style: 'italic' },
    { path: '../../fonts/playfair-display-italic-latin.woff2', weight: '500', style: 'italic' },
    { path: '../../fonts/playfair-display-italic-latin.woff2', weight: '600', style: 'italic' },
  ],
  variable: '--font-sc-serif',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
});

const dmSans = localFont({
  src: [
    { path: '../../fonts/dm-sans-latin.woff2', weight: '200', style: 'normal' },
    { path: '../../fonts/dm-sans-latin.woff2', weight: '300', style: 'normal' },
    { path: '../../fonts/dm-sans-latin.woff2', weight: '400', style: 'normal' },
    { path: '../../fonts/dm-sans-latin.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-sc-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Your Treatment · Oralign',
  description:
    'A private, secure view of your aligner treatment plan shared by your dentist.',
  robots: { index: false, follow: false },
};

export default function CreatedForYouLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      data-theme="showcase"
      data-patient-viewer="true"
      className={`${playfairDisplay.variable} ${dmSans.variable} min-h-screen flex flex-col`}
    >
      {/* Patient-viewer overrides. The showcase layout normally hides the
          system cursor (>=1024px) and lets a custom dot+ring follow the
          pointer — that's a marketing-site flourish that's wrong here:
          patients need a real, predictable cursor to interact with the
          embedded treatment viewer + the "Open viewer" button. Force the
          default cursor back and restore a pointer over interactives. */}
      <style>{`
        [data-patient-viewer="true"],
        [data-patient-viewer="true"] * { cursor: auto !important; }
        [data-patient-viewer="true"] a,
        [data-patient-viewer="true"] button,
        [data-patient-viewer="true"] [role="button"],
        [data-patient-viewer="true"] summary { cursor: pointer !important; }
        [data-patient-viewer="true"] input,
        [data-patient-viewer="true"] textarea,
        [data-patient-viewer="true"] select { cursor: text !important; }
        /* Belt-and-braces: if the custom-cursor elements ever leak into
           this subtree (they don't, since we don't render the component
           here), make sure they're invisible. */
        [data-patient-viewer="true"] .sc-cursor-dot,
        [data-patient-viewer="true"] .sc-cursor-ring { display: none !important; }
      `}</style>
      <LangProvider>
        <Header />
        {/* Desktop-only, exactly as on the showcase: below `lg` the
            switcher lives in the burger menu (MobileNav), which this
            layout already renders via Header. */}
        <FloatingLang />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />
      </LangProvider>
    </div>
  );
}
