import { ShowcaseSection } from "../showcase-section";

/**
 * Sections of the "Cas" page (/cas). Hash targets:
 * /cas#avant-apres, /cas#agir-tot.
 */

export function AvantApresSection() {
  return <ShowcaseSection id="avant-apres" titleKey="beforeAfter" heading="h1" />;
}

export function AgirTotSection() {
  return <ShowcaseSection id="agir-tot" titleKey="actEarly" tone="tinted" flip />;
}
