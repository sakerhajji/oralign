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

/**
 * Google Search Console ownership token (the `content` value of the
 * "HTML tag" verification method). Set NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
 * in the deployment env and the meta tag ships on every page — no code
 * change, and the property stays verified across redeploys. Unset in
 * dev, so nothing is emitted locally.
 */
const GOOGLE_SITE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  ...(GOOGLE_SITE_VERIFICATION
    ? { verification: { google: GOOGLE_SITE_VERIFICATION } }
    : {}),
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
    // Google's crawler wants a real raster favicon (48px multiples);
    // src/app/favicon.ico is the auto-served multi-size ICO built from
    // the site icon (it used to be the Next.js default logo, which is
    // what search results were showing). SVG stays for modern browsers.
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
      { url: "/iconLogo.svg", type: "image/svg+xml" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/icon-192.png" }],
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
    // `lang` + `dir` are seeded as `fr` / `ltr` so the SSR HTML stays
    // identical for every request. French, because the indexable surface
    // (the showcase at the root paths) server-renders in French; the
    // /en and /ar trees + the app declare their own language on a
    // wrapper element and the language providers flip these attributes
    // client-side after hydration. `suppressHydrationWarning` keeps
    // React quiet about that attribute swap on the first client commit.
    <html lang="fr" dir="ltr" suppressHydrationWarning className="h-full antialiased">
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
