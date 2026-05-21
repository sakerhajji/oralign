/**
 * Navigation order mirrors the visual order of sections on the homepage.
 * Update this array first when adding or moving a section so the active-link
 * IntersectionObserver and the smooth-scroll links stay in sync.
 */
export const NAV_ITEMS = [
  { id: "indications", labelKey: "platform" as const, href: "#indications" },
  { id: "dashboard-preview", labelKey: "results" as const, href: "#dashboard-preview" },
  { id: "how-it-works", labelKey: "howItWorks" as const, href: "#how-it-works" },
  { id: "practitioner-call", labelKey: "practitioners" as const, href: "#practitioner-call" },
  { id: "pricing", labelKey: "pricing" as const, href: "#pricing" },
  { id: "faq", labelKey: "about" as const, href: "#faq" },
] as const;
