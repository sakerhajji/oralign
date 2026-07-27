import type { GuideSection } from "./guide-copy";
import { GuideSectionHeading } from "./guide-section-heading";
import { GuideStepCard } from "./guide-step-card";

type GuideTreatmentSectionProps = {
  section: GuideSection;
  videoLabel: string;
  videoPlaceholder: string;
  videoCloseLabel: string;
  firstSection?: boolean;
};

const guideVideoUrlsBySection: Record<string, string[]> = {
  "step-first": [
    process.env.NEXT_PUBLIC_ORALIGN_GUIDE_OPEN_BOX_VIDEO_URL ?? "",
    process.env.NEXT_PUBLIC_ORALIGN_GUIDE_INSERT_VIDEO_URL ?? "",
    process.env.NEXT_PUBLIC_ORALIGN_GUIDE_REMOVE_VIDEO_URL ?? "",
  ],
  "step-daily": [
    process.env.NEXT_PUBLIC_ORALIGN_GUIDE_DAILY_ROUTINE_VIDEO_URL ?? "",
  ],
  "step-change": [
    process.env.NEXT_PUBLIC_ORALIGN_GUIDE_CHANGE_ALIGNER_VIDEO_URL ?? "",
  ],
  "step-clean": [
    process.env.NEXT_PUBLIC_ORALIGN_GUIDE_CLEANING_VIDEO_URL ?? "",
  ],
};

export function GuideTreatmentSection({
  section,
  videoLabel,
  videoPlaceholder,
  videoCloseLabel,
  firstSection = false,
}: GuideTreatmentSectionProps) {
  const isSoft = section.tone === "soft";

  return (
    <section
      id={section.id}
      data-section-tone={isSoft ? "tinted" : "light"}
      className={`px-5 py-16 text-[var(--sc-black)] sm:px-8 sm:py-20 lg:px-12 lg:py-24 ${
        isSoft ? "bg-[#eeebe3]" : "bg-[var(--sc-white)]"
      }`}
    >
      <div className="mx-auto w-full max-w-[960px]">
        <GuideSectionHeading
          number={section.number}
          eyebrow={section.eyebrow}
          title={section.title}
          emphasis={section.emphasis}
        />

        <div className="mt-9 space-y-1">
          {section.steps.map((step, index) => (
            <GuideStepCard
              key={step.title}
              step={step}
              videoLabel={videoLabel}
              videoPlaceholder={videoPlaceholder}
              videoCloseLabel={videoCloseLabel}
              videoUrl={guideVideoUrlsBySection[section.id]?.[index]}
              defaultOpen={firstSection && index === 0}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
