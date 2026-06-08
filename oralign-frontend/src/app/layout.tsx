import type { Metadata, Viewport } from "next";
import "./globals.css";
import { QueryProvider, AuthProvider } from "@/lib/providers";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LangProvider } from "@/lib/i18n/lang-context";

/**
 * Root metadata — feeds the browser tab title, Google search-result
 * card, and social-network share previews (Open Graph + Twitter).
 *
 * Icon resolution priority (Next.js convention):
 *   1. src/app/icon.svg          → favicon + Google preview icon
 *   2. src/app/apple-icon.png    → iOS home-screen icon (optional)
 *   3. src/app/favicon.ico       → legacy fallback for IE/old browsers
 *
 * We've placed `icon.svg` (a copy of `/iconLogo.svg`) at the app
 * root so modern browsers + search engines pick up the brand mark
 * automatically. The `icons` block below is an explicit override
 * that also points at the public version of the icon — useful for
 * crawlers that don't honour the App-Router file-convention.
 */
const APP_NAME = "Oralign";
const APP_DESCRIPTION =
  "Oralign — clear-aligner orthodontic care. Doctor-supervised treatment, " +
  "transparent pricing, and a guided patient journey from first scan to " +
  "final smile.";
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://oralign.com.tn";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: `${APP_NAME} — Clear aligner care`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  keywords: [
    "oralign",
    "clear aligners",
    "orthodontics",
    "invisible aligners",
    "dental practice management",
    "Tunisia",
  ],
  authors: [{ name: "Oralign" }],
  icons: {
    icon: [
      // Modern browsers + Google preview — pulled from public/.
      { url: "/iconLogo.svg", type: "image/svg+xml" },
    ],
    shortcut: ["/iconLogo.svg"],
    apple: [{ url: "/iconLogo.svg" }],
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    alternateLocale: ["fr_FR", "ar_TN"],
    url: APP_URL,
    siteName: APP_NAME,
    title: `${APP_NAME} — Clear aligner care`,
    description: APP_DESCRIPTION,
    // `images` is intentionally omitted — Next.js auto-discovers
    // `src/app/opengraph-image.tsx` (a 1200×630 branded PNG) and
    // injects it here. Hard-coding `/iconLogo.svg` would override
    // with a 213×192 icon that Google can't crop into a search card
    // (it shows up as a small square that browsers and crawlers
    // largely ignore — that's how the stale "Nova Studio" template
    // card lingered on as the visible result).
  },
  twitter: {
    // `summary_large_image` picks up the 1200×630 OG card too, so the
    // Twitter / X share preview matches Google.
    card: "summary_large_image",
    title: `${APP_NAME} — Clear aligner care`,
    description: APP_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#feca16",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `lang` + `dir` are seeded as `en` / `ltr` so the SSR HTML stays
    // identical for every request. LangProvider then hydrates the
    // user's saved language on the client and flips both attributes
    // via the `useLang` effect — see `lib/i18n/use-lang.ts`. The
    // `suppressHydrationWarning` on `<html>` keeps React quiet about
    // that attribute swap on the first client commit.
    <html lang="en" dir="ltr" suppressHydrationWarning className="h-full antialiased">
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        <QueryProvider>
          <AuthProvider>
            <LangProvider>
              <TooltipProvider>
                {children}
                <Toaster />
              </TooltipProvider>
            </LangProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
