import { Jost, DM_Sans } from "next/font/google";
import type { ReactNode } from "react";
import "../showcase.css";
import type { Lang } from "../_lib/i18n/dict";
import { LangProvider } from "../_lib/i18n/lang-context";
import { JsonLd, organizationLd, webSiteLd } from "../_lib/seo/jsonld";
import { getLegalCompany } from "../_lib/legal-info";
import { Header } from "./header";
import { Footer } from "./footer";
import { FloatingLang } from "./floating-lang";

// Jost = closest free Google equivalent to Century Gothic (geometric grotesque,
// near-circular O, similar x-height). Brand guidelines spec Century Gothic for
// display; we cascade to Jost when Century Gothic isn't installed locally.
// Two weights only per guidelines: 400 Regular + 700 Bold.
const serif = Jost({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-sc-serif",
  display: "swap",
});

// DM Sans for all body text. Three weights max per guidelines: 300 / 400 / 500.
const sans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-sc-sans",
  display: "swap",
});

/**
 * Shared shell of the public marketing site: fonts, skip link, language
 * provider, header/footer chrome and the sitewide JSON-LD (Organization +
 * WebSite, server-rendered inline so crawlers see it in the HTML source).
 *
 * Used by BOTH showcase trees:
 *  - the French tree at the root paths ((showcase)/layout.tsx) — no
 *    `forcedLang`, the visitor's stored choice applies after hydration
 *    while the SSR HTML stays in the default (French);
 *  - the localized /en and /ar trees ([lang]/layout.tsx) — `forcedLang`
 *    pins the language to the URL, and the switch NAVIGATES to the
 *    sibling URL instead of toggling in place.
 *
 * The wrapper div carries lang/dir so the SSR HTML declares the actual
 * content language even though the root <html> element is shared with
 * the (non-indexed) app surfaces.
 */
export async function ShowcaseChrome({
  children,
  forcedLang,
}: {
  children: ReactNode;
  forcedLang?: Lang;
}) {
  return (
    <div
      data-theme="showcase"
      // lang/dir ONLY on the forced trees, where the language is a
      // constant of the URL. On the French tree the visitor can still
      // toggle languages in place (blog, legal, …): a hardcoded
      // dir="ltr" here would OVERRIDE the <html dir="rtl"> the client
      // effect sets for Arabic and break the whole RTL rendering —
      // so that tree inherits from <html> exactly like before.
      {...(forcedLang
        ? { lang: forcedLang, dir: forcedLang === "ar" ? "rtl" : "ltr" }
        : {})}
      className={`${serif.variable} ${sans.variable}`}
    >
      <a
        href="#main"
        className="absolute -top-40 left-2 focus:top-2 z-[10000] bg-[var(--sc-black)] text-[var(--sc-white)] px-4 py-2"
        style={{ fontSize: "0.7rem", letterSpacing: "0.2em", textTransform: "uppercase" }}
      >
        Skip to content
      </a>
      <LangProvider forced={forcedLang}>
        <Header />
        <FloatingLang />
        <main id="main">{children}</main>
        <Footer />
      </LangProvider>
      <JsonLd data={organizationLd(await getLegalCompany())} />
      <JsonLd data={webSiteLd()} />
    </div>
  );
}
