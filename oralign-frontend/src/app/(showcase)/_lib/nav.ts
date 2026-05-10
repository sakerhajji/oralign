/**
 * Navigation order mirrors the visual order of sections on the homepage.
 * Update this array first when adding or moving a section so the active-link
 * IntersectionObserver and the smooth-scroll links stay in sync.
 */
export const NAV_ITEMS = [
  { id: "why", labelKey: "forDentists" as const, href: "#problem" },
  { id: "how-it-works", labelKey: "howItWorks" as const, href: "#how-it-works" },
  { id: "what-we-treat", labelKey: "platform" as const, href: "#features" },
  { id: "reviews", labelKey: "forPatients" as const, href: "#testimonials" },
  { id: "pricing", labelKey: "pricing" as const, href: "#pricing" },
  { id: "faq", labelKey: "about" as const, href: "#faq" },
] as const;
