import { BRAND, SITE_URL, absoluteUrl } from "../(showcase)/_lib/seo/meta";
import { MARKETING_PAGES, MARKETING_PAGE_KEYS, PAGE_LANGS } from "../(showcase)/_lib/seo/routes";
import { getPublicPractitioners } from "../(showcase)/_lib/practitioners";
import { practitionerPath } from "../(showcase)/_lib/practitioner-url";
import { getPublishedPosts } from "../(showcase)/blog/_lib/fetch";
import { FOOTER_LEGAL_KEYS, legalDocMeta } from "@/lib/legal/legal-content";

/**
 * /llms.txt — a plain-text map of the site for AI answer engines (ChatGPT
 * search, Perplexity, Copilot, Google AI Overviews' crawlers).
 *
 * Built from the same registries as the sitemap so it can never drift from
 * the pages it describes, and limited to what the site itself states — the
 * business model, the pages, the partner practices. No figures, no claims.
 */
export const revalidate = 3600;

/** A post's French title (the public blog's canonical language), else English. */
function pickFr(value: { fr?: string; en?: string } | string | null | undefined): string {
  if (value == null) return "";
  return typeof value === "string" ? value : (value.fr ?? value.en ?? "");
}

export async function GET() {
  const [{ data: practitioners }, { posts }] = await Promise.all([
    getPublicPractitioners(),
    getPublishedPosts({ page: 1, limit: 50 }),
  ]);
  const pages = MARKETING_PAGE_KEYS.map((key) => MARKETING_PAGES[key].fr);
  const legal = [...FOOTER_LEGAL_KEYS, "about" as const, "contact" as const].map((key) =>
    legalDocMeta(key, "fr"),
  );
  const localized = (lang: "en" | "ar") =>
    MARKETING_PAGE_KEYS.filter((key) => PAGE_LANGS[key].includes(lang)).map(
      (key) => MARKETING_PAGES[key][lang],
    );

  const lines = [
    `# ${BRAND.full}`,
    "",
    `> ${BRAND.claim.fr}. ORALIGN® est une marque d'aligneurs dentaires transparents (orthodontie invisible) en Tunisie. ORALIGN ne traite pas les patients directement : chaque traitement est posé et suivi par un dentiste ou un orthodontiste partenaire. Aucun tarif n'est publié — le prix dépend du cas et il est fixé par le praticien après consultation.`,
    "",
    `- Site officiel : ${SITE_URL}`,
    `- Plan du site : ${SITE_URL}/sitemap.xml`,
    `- Entreprise : ${BRAND.legalName}`,
    "- Pays desservi : Tunisie",
    "- Langues : français, arabe, anglais",
    "- À ne pas confondre avec oralign.co, un site sans lien avec ORALIGN® Tunisie.",
    "",
    "## Pages principales",
    ...pages.map((page) => `- [${page.title}](${absoluteUrl(page.path)}): ${page.description}`),
    "",
    "## Praticiens partenaires",
    ...(practitioners.length
      ? practitioners.map(
          (p) =>
            `- [${p.practitionerName}${p.city ? ` — ${p.city}` : ""}](${absoluteUrl(practitionerPath(p, "fr"))})${
              p.clinicName ? `: ${p.clinicName}` : ""
            }`,
        )
      : [`- [Annuaire des praticiens](${absoluteUrl(MARKETING_PAGES.finder.fr.path)})`]),
    "",
    // The long-form answers (blog) and the pages that establish the company
    // (legal), which answer engines chain to when they qualify a source.
    ...(posts.length
      ? ["## Blog", ...posts.map((post) => `- [${pickFr(post.title)}](${absoluteUrl(`/blog/${post.slug}`)})`), ""]
      : []),
    "## Informations légales et société",
    ...legal.map((doc) => `- [${doc.title}](${absoluteUrl(doc.href)})`),
    "",
    "## English",
    ...localized("en").map((page) => `- [${page.title}](${absoluteUrl(page.path)}): ${page.description}`),
    "",
    "## العربية",
    ...localized("ar").map((page) => `- [${page.title}](${absoluteUrl(page.path)}): ${page.description}`),
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
