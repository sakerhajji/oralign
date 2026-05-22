/**
 * Navigation order — mirrors the visual order of sections on the
 * homepage so the active-link IntersectionObserver and smooth-scroll
 * jump targets stay in sync.
 *
 * Update this array first when adding, moving, or removing a section.
 *
 * The page renders sections in this order (per page.tsx):
 *   Hero → Ribbon → Confidence → Solution → HowItWorks
 *     → AdultBrochure → ParentBrochure → DashboardPreview
 *     → Testimonials → FAQ → FinalCta
 *
 * Anchorable sections (those with an `id`) that the nav exposes:
 *   1. #confidence         — Confidence
 *   2. #solution           — Why ORALIGN
 *   3. #how-it-works       — Patient journey
 *   4. #adults             — Adults
 *   5. #parents            — Children / parents
 *   6. #dashboard-preview  — Results / before-after gallery
 *   7. #testimonials       — Patient stories
 *   8. #faq                — FAQ
 *
 * Keep the public nav intentionally compact on mobile; the practitioner
 * and CTA sections remain reachable through page CTAs.
 */
export const NAV_ITEMS = [
  { id: "confidence", labelKey: "confidence" as const, href: "#confidence" },
  { id: "solution", labelKey: "solution" as const, href: "#solution" },
  { id: "how-it-works", labelKey: "howItWorks" as const, href: "#how-it-works" },
  { id: "adults", labelKey: "adults" as const, href: "#adults" },
  { id: "parents", labelKey: "parents" as const, href: "#parents" },
  { id: "dashboard-preview", labelKey: "results" as const, href: "#dashboard-preview" },
  { id: "testimonials", labelKey: "testimonials" as const, href: "#testimonials" },
  { id: "faq", labelKey: "about" as const, href: "#faq" },
] as const;
