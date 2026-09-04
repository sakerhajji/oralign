/**
 * Showcase navigation model.
 *
 * The public site is the PATIENT website. The nav is a grouped mega-menu:
 * a few top-level entries open a dropdown of `children`, the rest are plain
 * links. An entry with no `children` is a plain link; one with `children`
 * opens a dropdown (desktop) / accordion (mobile).
 *
 * `labelKey` indexes `dict.nav` (resolved by the renderer, so this file
 * stays free of the i18n import). `href` is where the top-level click
 * lands — a route or a `route#section` anchor within a patient page.
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
    href: "/",
    children: [
      { id: "oralign", labelKey: "navOralign", href: "/#oralign" },
      { id: "oralign-prime", labelKey: "oralignPrime", href: "/#oralign-prime" },
      { id: "parcours", labelKey: "howItWorks", href: "/#parcours" },
      // Points at the public practitioner finder, not an in-page anchor.
      { id: "find-practitioner", labelKey: "findPractitioner", href: "/trouver-un-praticien" },
    ],
  },
  {
    id: "clinical-cases",
    labelKey: "clinicalCases",
    href: "/cas",
    children: [
      { id: "before-after", labelKey: "beforeAfter", href: "/cas#avant-apres" },
      { id: "act-early", labelKey: "actEarly", href: "/cas#agir-tot" },
    ],
  },
  {
    id: "community",
    labelKey: "community",
    href: "/communaute",
    children: [
      { id: "testimonials", labelKey: "temoignages", href: "/communaute#temoignages" },
      { id: "share-experience", labelKey: "shareExperience", href: "/communaute#partager" },
    ],
  },
  {
    id: "guide",
    labelKey: "guide",
    href: "/guide",
    children: [
      // High-intent patient questions. Linking them from the nav is what
      // makes them discoverable — an orphan page is one Google has to be
      // told about through the sitemap alone.
      { id: "pricing", labelKey: "navPricing", href: "/prix" },
      { id: "comparison", labelKey: "navComparison", href: "/oralign-ou-invisalign" },
      { id: "teens", labelKey: "navTeens", href: "/aligneurs-adolescents" },
    ],
  },
  { id: "blogs", labelKey: "blogs", href: "/blog" },
] as const;

/** The single public nav (patient website). */
export const NAV_ITEMS = PATIENT_NAV_ITEMS;

/** Kept for the Header/MobileNav call site — always the patient nav now. */
export function getShowcaseNavItems(): readonly NavItem[] {
  return PATIENT_NAV_ITEMS;
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
