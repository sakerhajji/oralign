import type { Metadata } from "next";
import { ShowcaseChrome } from "./_components/showcase-chrome";
import { OG_LOCALE, SITE_NAME, SITE_URL } from "./_lib/seo/meta";

/**
 * Layout metadata = safety-net defaults for the French showcase tree.
 * Every indexable page overrides title/description/canonical/hreflang
 * with its own entry from _lib/seo/routes.ts — nothing here should leak
 * into search results except on pages that forgot to declare their own.
 *
 * Deliberately absent:
 *  - `alternates`: a layout-level canonical would silently apply to any
 *    child page that doesn't set one (that bug shipped once — every
 *    showcase page canonicalized to /decouvrir);
 *  - hreflang: only meaningful per page, where each language variant is
 *    a distinct URL (see marketingMetadata()).
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "ORALIGN® — Aligneurs dentaires invisibles en Tunisie",
  description:
    "ORALIGN® — aligneurs dentaires invisibles conçus en Allemagne et fabriqués en Tunisie. Orthodontie invisible supervisée par un praticien certifié, pour adultes, enfants et adolescents.",
  keywords: [
    "aligneur dentaire",
    "aligneurs invisibles",
    "aligneurs transparents",
    "orthodontie invisible",
    "aligneur dentaire Tunisie",
    "ORALIGN",
  ],
  openGraph: {
    type: "website",
    title: "ORALIGN® — Aligneurs dentaires invisibles en Tunisie",
    description:
      "Un sourire aligné aujourd'hui, une confiance durable demain. Aligneurs transparents, conçus en Allemagne, fabriqués en Tunisie et validés par votre praticien.",
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: OG_LOCALE.fr,
  },
  twitter: {
    card: "summary_large_image",
    title: "ORALIGN® — Aligneurs dentaires invisibles en Tunisie",
    description:
      "Aligneurs transparents supervisés par un praticien certifié, pour adultes, enfants et adolescents.",
  },
  robots: { index: true, follow: true },
};

export default function ShowcaseLayout({ children }: { children: React.ReactNode }) {
  return <ShowcaseChrome>{children}</ShowcaseChrome>;
}
