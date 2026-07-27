import { BriefcaseBusiness, Droplets, Dumbbell, Moon } from "lucide-react";
import type { GuideCopy, GuideTip } from "./guide-copy";
import { GuideSectionHeading } from "./guide-section-heading";

const tipIcons = {
  hydration: Droplets,
  travel: BriefcaseBusiness,
  sport: Dumbbell,
  night: Moon,
} satisfies Record<GuideTip["icon"], typeof Droplets>;

type GuideTipsSectionProps = {
  tips: GuideCopy["tips"];
};

export function GuideTipsSection({ tips }: GuideTipsSectionProps) {
  return (
    <section
      id={tips.id}
      data-section-tone="light"
      className="bg-[var(--sc-white)] px-5 py-16 text-[var(--sc-black)] sm:px-8 sm:py-20 lg:px-12 lg:py-24"
    >
      <div className="mx-auto w-full max-w-[960px]">
        <GuideSectionHeading
          number={tips.number}
          eyebrow={tips.eyebrow}
          title={tips.title}
          emphasis={tips.emphasis}
        />

        <div className="mt-9 grid gap-px bg-[var(--sc-grey)] sm:grid-cols-2 lg:grid-cols-4">
          {tips.cards.map((tip) => {
            const Icon = tipIcons[tip.icon];

            return (
              <article
                key={tip.title}
                className="bg-[var(--sc-white)] p-7 transition-colors hover:bg-[#fdf9ec] sm:p-8"
              >
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--sc-sun-3)] text-[var(--sc-black)]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="sc-serif mt-5 text-[1.08rem] text-[var(--sc-black)]">
                  {tip.title}
                </h3>
                <p className="mt-3 text-[0.84rem] leading-7 text-[var(--sc-text-mid)]">
                  {tip.body}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
