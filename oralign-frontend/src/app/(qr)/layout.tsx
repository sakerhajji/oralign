import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ShowcaseChrome } from "../(showcase)/_components/showcase-chrome";
import { SITE_URL } from "../(showcase)/_lib/seo/meta";

/**
 * The QR welcome's own shell: the public site's fonts, language, footer
 * and identity, without its navigation header — the page a printed code
 * opens is an entrance of its own, and it carries its own language switch.
 * (Its URL is still /qr: a route group adds nothing to the path.)
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
};

export default function QrLayout({ children }: { children: ReactNode }) {
  return <ShowcaseChrome bare>{children}</ShowcaseChrome>;
}
