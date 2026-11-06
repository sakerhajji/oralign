import type { Metadata } from "next";
import { connection } from "next/server";
import { QrWelcome } from "../../(showcase)/_components/qr/qr-welcome";
import { getLegalCompany } from "../../(showcase)/_lib/legal-info";
import { OG_IMAGE, OG_LOCALE, SITE_NAME, SITE_URL } from "../../(showcase)/_lib/seo/meta";

/**
 * /qr — where the QR codes printed on the ORALIGN kits lead (/qr2, the
 * second print run, redirects here; see next.config.ts and src/proxy.ts):
 * ORALIGN's welcome and the four things a visitor comes for — the wear
 * guide film, the official contact, the practitioner finder, the
 * practitioner space. #guide and #contact open their panel directly.
 *
 * Kept out of search by its noindex alone: robots.txt lets crawlers in so
 * they can read it (a disallowed URL can still be listed bare), and so link
 * previews can read the card below.
 */

const TITLE = "ORALIGN® — Bienvenue : guide vidéo, contact et praticiens";
const DESCRIPTION =
  "Le guide vidéo ORALIGN pour bien porter vos aligneurs, nos coordonnées officielles, un praticien partenaire près de chez vous.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  robots: { index: false, follow: false },
  // A page-level openGraph replaces any inherited block, so the card image
  // and site name are listed here (a shared link previews this page).
  openGraph: {
    type: "website",
    url: `${SITE_URL}/qr`,
    title: TITLE,
    description: DESCRIPTION,
    siteName: SITE_NAME,
    locale: OG_LOCALE.fr,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

export default async function QrPage() {
  // Rendered for each scan, never prerendered: a build that cannot reach
  // the API (the VPS image build) would otherwise bake a card without a
  // phone or e-mail, and a failed refresh would replace a good snapshot.
  // The settings fetch keeps its own 5-minute cache, and an unreachable
  // API then costs one visitor the fallback line, not five minutes of them.
  await connection();
  const company = await getLegalCompany();
  return <QrWelcome phone={company.phone} email={company.email} company={company.companyName} />;
}
