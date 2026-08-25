import { notFound, permanentRedirect } from "next/navigation";
import { isLocalizedLang, pathFor } from "../(showcase)/_lib/seo/routes";

/**
 * /en and /ar bare roots — 308 to the localized home, mirroring how "/"
 * permanently redirects to /decouvrir. A redirect (not a duplicate home)
 * keeps one canonical home URL per language.
 */
export default async function LocalizedRootPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocalizedLang(lang)) notFound();
  permanentRedirect(pathFor("home", lang));
}
