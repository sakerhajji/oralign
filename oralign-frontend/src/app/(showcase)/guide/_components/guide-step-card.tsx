import { ChevronDown, Check } from "lucide-react";
import type { GuideStep } from "./guide-copy";
import { GuideVideoCard } from "./guide-video-card";

type GuideStepCardProps = {
  step: GuideStep;
  videoLabel: string;
  videoPlaceholder: string;
  videoCloseLabel: string;
  videoUrl?: string;
  defaultOpen?: boolean;
};

export function GuideStepCard({
  step,
  videoLabel,
  videoPlaceholder,
  videoCloseLabel,
  videoUrl,
  defaultOpen = false,
}: GuideStepCardProps) {
  return (
    <details
      className="group border border-[var(--sc-grey)] bg-[var(--sc-white)] transition-colors open:border-[var(--sc-sun)]"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-5 transition hover:bg-[var(--sc-sun-3)] sm:gap-6 sm:px-8 sm:py-7 [&::-webkit-details-marker]:hidden">
        <span className="sc-serif flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--sc-sun)] text-lg text-[var(--sc-black)] transition group-open:scale-105">
          {step.marker}
        </span>

        <span className="min-w-0 flex-1">
          <span className="sc-serif block text-[1.05rem] leading-tight text-[var(--sc-black)] sm:text-[1.18rem]">
            {step.title}
          </span>
          <span className="mt-1 block text-[0.78rem] leading-5 text-[var(--sc-text-mid)]">
            {step.subtitle}
          </span>
        </span>

        <ChevronDown
          className="h-5 w-5 shrink-0 text-[var(--sc-text-mid)] transition group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div className="grid gap-7 px-5 pb-6 sm:px-8 sm:pb-8 lg:grid-cols-[0.98fr_1.02fr] lg:gap-10">
        <GuideVideoCard
          label={videoLabel}
          placeholder={videoPlaceholder}
          duration={step.duration}
          title={step.title}
          closeLabel={videoCloseLabel}
          youtubeUrl={videoUrl}
        />

        <div className="self-start">
          <h3 className="sc-serif text-[1.05rem] leading-tight text-[var(--sc-black)]">
            {step.contentTitle}
          </h3>

          <ul className="mt-4 space-y-3">
            {step.bullets.map((bullet) => (
              <li
                key={bullet}
                className="flex items-start gap-3 text-[0.86rem] leading-7 text-[var(--sc-text-mid)]"
              >
                <Check
                  className="mt-1 h-4 w-4 shrink-0 text-[var(--sc-sun-deep)]"
                  aria-hidden="true"
                />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 border-l-4 border-[var(--sc-sun)] bg-[var(--sc-sun-3)] px-5 py-4">
            <p className="text-[0.84rem] leading-7 text-[var(--sc-black)]">
              <strong className="font-medium">{step.noteTitle} :</strong>{" "}
              {step.note}
            </p>
          </div>
        </div>
      </div>
    </details>
  );
}
