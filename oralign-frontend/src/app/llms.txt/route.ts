import { BRAND, SITE_URL, absoluteUrl } from "../(showcase)/_lib/seo/meta";
import { MARKETING_PAGES, MARKETING_PAGE_KEYS, PAGE_LANGS } from "../(showcase)/_lib/seo/routes";
import { getPublicPractitioners } from "../(showcase)/_lib/practitioners";
import { practitionerPath } from "../(showcase)/_lib/practitioner-url";

/**
 * /llms.txt — a plain-text map of the site for AI answer engines (ChatGPT
 * search, Perplexity, Copilot, Google AI Overviews' crawlers).
 *
 * Built from the same registries as the sitemap so it can never drift from
 * the pages it describes, and limited to what the site itself states — the
 * business model, the pages, the partner practices. No figures, no claims.
 */
export const revalidate = 3600;

export async function GET() {
  const { data: practitioners } = await getPublicPractitioners();
  const pages = MARKETING_PAGE_KEYS.map((key) => MARKETING_PAGES[key].fr);
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
