/**
 * Navigation order — mirrors the visual order of sections on the
 * homepage so the active-link IntersectionObserver and smooth-scroll
 * jump targets stay in sync.
 *
 * Update this array first when adding, moving, or removing a section.
 *
 * The patient page renders sections in this order:
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
export const PATIENT_NAV_ITEMS = [
  { id: "confidence", labelKey: "confidence" as const, href: "#confidence" },
  { id: "solution", labelKey: "solution" as const, href: "#solution" },
  { id: "how-it-works", labelKey: "howItWorks" as const, href: "#how-it-works" },
  { id: "adults", labelKey: "adults" as const, href: "#adults" },
  { id: "parents", labelKey: "parents" as const, href: "#parents" },
  { id: "dashboard-preview", labelKey: "results" as const, href: "#dashboard-preview" },
  { id: "testimonials", labelKey: "testimonials" as const, href: "#testimonials" },
  { id: "faq", labelKey: "about" as const, href: "#faq" },
] as const;

export const PRACTITIONER_NAV_ITEMS = [
  { id: "contrast", labelKey: "contrast" as const, href: "#contrast" },
  { id: "workflow", labelKey: "workflow" as const, href: "#workflow" },
  { id: "clinical", labelKey: "clinical" as const, href: "#clinical" },
  { id: "platform-b2b", labelKey: "platformB2B" as const, href: "#platform-b2b" },
  { id: "cta", labelKey: "challenge" as const, href: "#cta" },
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

export function getShowcaseNavItems(pathname: string | null) {
  const audience = getShowcaseAudience(pathname);
  if (audience === "practitioner") return PRACTITIONER_NAV_ITEMS;
  if (audience === "patient") return PATIENT_NAV_ITEMS;
  return [];
}
