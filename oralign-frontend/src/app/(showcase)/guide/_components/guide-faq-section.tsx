import { ChevronDown } from "lucide-react";
import type { GuideCopy } from "./guide-copy";
import { GuideSectionHeading } from "./guide-section-heading";

type GuideFaqSectionProps = {
  faq: GuideCopy["faq"];
};

export function GuideFaqSection({ faq }: GuideFaqSectionProps) {
  return (
    <section
      id={faq.id}
      data-section-tone="tinted"
      className="bg-[#eeebe3] px-5 py-16 text-[var(--sc-black)] sm:px-8 sm:py-20 lg:px-12 lg:py-24"
    >
      <div className="mx-auto w-full max-w-[960px]">
        <GuideSectionHeading
          number="?"
          eyebrow={faq.eyebrow}
          title={faq.title}
          emphasis={faq.emphasis}
        />

        <div className="mt-8 divide-y divide-[var(--sc-grey)]">
          {faq.items.map((item, index) => (
            <details
              key={item.question}
              className="group py-5"
              open={index === 0}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-[0.94rem] font-medium text-[var(--sc-black)] transition hover:text-[var(--sc-sun-deep)] [&::-webkit-details-marker]:hidden">
                <span>{item.question}</span>
                <ChevronDown
                  className="h-5 w-5 shrink-0 text-[var(--sc-text-mid)] transition group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="max-w-[760px] pt-4 text-[0.88rem] leading-8 text-[var(--sc-text-mid)]">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
