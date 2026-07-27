import type { GuideCopy } from "./guide-copy";

type GuideManifestoProps = {
  manifesto: GuideCopy["manifesto"];
};

export function GuideManifesto({ manifesto }: GuideManifestoProps) {
  return (
    <section
      data-section-tone="sun"
      className="bg-[var(--sc-sun)] px-5 py-14 text-center text-[var(--sc-black)] sm:px-8 sm:py-16 lg:px-12"
    >
      <p className="sc-serif mx-auto max-w-[820px] text-balance text-[clamp(2rem,4vw,3.55rem)] leading-[1.18]">
        « {manifesto.line1}
        <br />
        {manifesto.line2}{" "}
        <em className="font-normal not-italic">{manifesto.emphasis}</em> »
      </p>
      <p className="mt-6 text-[0.62rem] uppercase tracking-[0.34em] opacity-55">
        {manifesto.signature}
      </p>
    </section>
  );
}
