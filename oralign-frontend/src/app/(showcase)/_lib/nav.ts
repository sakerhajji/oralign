/**
 * Navigation order — mirrors the visual order of sections on the
 * homepage so the active-link IntersectionObserver and smooth-scroll
 * jump targets stay in sync.
 *
 * Update this array first when adding, moving, or removing a section.
 *
 * The page renders sections in this order (per page.tsx):
 *   Hero → Ribbon → Indications → Confidence → Solution → HowItWorks
 *     → AdultBrochure → Prime → ParentBrochure → DashboardPreview
 *     → Testimonials → FAQ
 *
 * Anchorable sections (those with an `id`) that the nav exposes:
 *   1. #indications        — Indications
 *   2. #how-it-works       — Patient journey
 *   3. #dashboard-preview  — Results / before-after gallery
 *   4. #faq                — FAQ
 *
 * Removed (no longer rendered on the page — links here would scroll
 * to nothing):
 *   • #practitioner-call   (PractitionerCallSection imported but not
 *                           rendered in page.tsx)
 *   • #pricing             (PricingSection imported but not rendered)
 */
export const NAV_ITEMS = [
  { id: "indications", labelKey: "platform" as const, href: "#indications" },
  { id: "how-it-works", labelKey: "howItWorks" as const, href: "#how-it-works" },
  { id: "dashboard-preview", labelKey: "results" as const, href: "#dashboard-preview" },
  { id: "faq", labelKey: "about" as const, href: "#faq" },
] as const;
