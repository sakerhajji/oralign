/**
 * Showcase navigation model.
 *
 * The PATIENT nav is a grouped mega-menu (per the 2026 sitemap): a few
 * top-level entries open a dropdown of `children`, the rest are plain
 * links. The PRACTITIONER nav stays a flat list of section anchors.
 * Both render through the same Header / MobileNav — an entry with no
 * `children` is a plain link; one with `children` opens a dropdown
 * (desktop) / accordion (mobile).
 *
 * `labelKey` indexes `dict.nav` (resolved by the renderer, so this file
 * stays free of the i18n import). `href` is where the top-level click
 * lands — a `#section` on the current audience page or a route.
 *
 * Each grouped patient entry is ONE page whose dropdown children are
 * `#section` anchors within it (e.g. /patient/decouvrir + #oralign,
 * #oralign-prime …). The standalone entries (guide, shop, blogs) are
 * their own routes. Smooth scroll + the sticky-header offset for those
 * anchors are handled in showcase.css (`scroll-behavior` + the
 * `section[id]` scroll-margin); the active child is tracked by the
 * Header's IntersectionObserver.
 */
export type NavChild = {
  id: string;
  labelKey: string;
  href: string;
};

export type NavItem = {
  id: string;
  labelKey: string;
  href: string;
  children?: readonly NavChild[];
};

export const PATIENT_NAV_ITEMS: readonly NavItem[] = [
  {
    id: "why-oralign",
    labelKey: "whyOralign",
    href: "/patient/decouvrir",
    children: [
      { id: "oralign", labelKey: "navOralign", href: "/patient/decouvrir#oralign" },
      { id: "oralign-prime", labelKey: "oralignPrime", href: "/patient/decouvrir#oralign-prime" },
      { id: "parcours", labelKey: "howItWorks", href: "/patient/decouvrir#parcours" },
      { id: "find-practitioner", labelKey: "findPractitioner", href: "/patient/decouvrir#praticiens" },
    ],
  },
  {
    id: "clinical-cases",
    labelKey: "clinicalCases",
    href: "/patient/cas",
    children: [
      { id: "before-after", labelKey: "beforeAfter", href: "/patient/cas#avant-apres" },
      { id: "act-early", labelKey: "actEarly", href: "/patient/cas#agir-tot" },
    ],
  },
  {
    id: "community",
    labelKey: "community",
    href: "/patient/communaute",
    children: [
      { id: "testimonials", labelKey: "temoignages", href: "/patient/communaute#temoignages" },
      { id: "share-experience", labelKey: "shareExperience", href: "/patient/communaute#partager" },
    ],
  },
  { id: "guide", labelKey: "guide", href: "/patient/guide" },
  { id: "shop", labelKey: "shop", href: "/patient/shop" },
  { id: "blogs", labelKey: "blogs", href: "/patient/blog" },
] as const;

export const PRACTITIONER_NAV_ITEMS: readonly NavItem[] = [
  { id: "contrast", labelKey: "contrast", href: "#contrast" },
  { id: "workflow", labelKey: "workflow", href: "#workflow" },
  { id: "clinical", labelKey: "clinical", href: "#clinical" },
  { id: "platform-b2b", labelKey: "platformB2B", href: "#platform-b2b" },
  { id: "cta", labelKey: "challenge", href: "#cta" },
  // Real route (no `#hash`) — renders as a plain link, not an anchor.
  { id: "blog", labelKey: "blogs", href: "/practitioner/blog" },
] as const;

export const NAV_ITEMS = PATIENT_NAV_ITEMS;

export type ShowcaseAudience = "chooser" | "patient" | "practitioner";

export function getShowcaseAudience(pathname: string | null): ShowcaseAudience {
  if (pathname?.startsWith("/practitioner")) return "practitioner";
  if (pathname?.startsWith("/patient")) return "patient";
  if (pathname === "/" || !pathname) return "chooser";
  return "patient";
}

export function getShowcaseBasePath(pathname: string | null): "/patient" | "/practitioner" {
  return getShowcaseAudience(pathname) === "practitioner" ? "/practitioner" : "/patient";
}

export function getShowcaseNavItems(pathname: string | null): readonly NavItem[] {
  const audience = getShowcaseAudience(pathname);
  if (audience === "practitioner") return PRACTITIONER_NAV_ITEMS;
  if (audience === "patient") return PATIENT_NAV_ITEMS;
  return [];
}

/**
 * Every in-page section id the nav points at (top-level + children),
 * from either a bare `#section` href or a `route#section` href — fed to
 * the Header's active-link IntersectionObserver.
 */
function hrefHash(href: string): string | null {
  const i = href.indexOf("#");
  return i >= 0 ? href.slice(i + 1) : null;
}

export function getNavSectionIds(items: readonly NavItem[]): string[] {
  const ids: string[] = [];
  for (const item of items) {
    const top = hrefHash(item.href);
    if (top) ids.push(top);
    for (const child of item.children ?? []) {
      const hash = hrefHash(child.href);
      if (hash) ids.push(hash);
    }
  }
  return Array.from(new Set(ids));
}
