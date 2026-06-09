import { ShowcaseSection } from "../showcase-section";

/**
 * Sections of the "Communauté" page (/patient/communaute). Hash targets:
 * /patient/communaute#temoignages, /patient/communaute#partager.
 */

export function TemoignagesSection() {
  return <ShowcaseSection id="temoignages" titleKey="temoignages" heading="h1" />;
}

export function PartagerSection() {
  return (
    <ShowcaseSection id="partager" titleKey="shareExperience" tone="tinted" flip />
  );
}
