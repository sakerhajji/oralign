import { ShowcaseSection } from "../showcase-section";

/**
 * Sections of the "Communauté" page (/communaute). Hash targets:
 * /communaute#temoignages, /communaute#partager.
 */

export function TemoignagesSection() {
  return <ShowcaseSection id="temoignages" titleKey="temoignages" heading="h1" />;
}

export function PartagerSection() {
  return (
    <ShowcaseSection id="partager" titleKey="shareExperience" tone="tinted" flip />
  );
}
