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
import { Playfair_Display, DM_Sans } from 'next/font/google';
import { LangProvider } from '../(showcase)/_lib/i18n/lang-context';
import { Header } from '../(showcase)/_components/header';
import { Footer } from '../(showcase)/_components/footer';
import { FloatingLang } from '../(showcase)/_components/floating-lang';
// Pull in the showcase CSS variables + behavioural rules. Next.js
// hoists global CSS imports so they apply to this subtree.
import '../(showcase)/showcase.css';

const serif = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-sc-serif',
  display: 'swap',
});

const sans = DM_Sans({
  subsets: ['latin'],
  weight: ['200', '300', '400', '500'],
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
      className={`${serif.variable} ${sans.variable} min-h-screen flex flex-col`}
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
