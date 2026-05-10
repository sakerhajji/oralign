"use client";

import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";
import { SectionHeading } from "./shared/section-heading";

export function ProblemSection() {
  const { lang } = useShowcaseLang();
  return (
    <section
      id="problem"
      data-section-tone="light"
      aria-labelledby="problem-h2"
      className="bg-[var(--sc-white)]"
      style={{ padding: "120px 24px" }}
    >
      <div className="mx-auto max-w-[1400px] lg:px-12 grid gap-16 lg:grid-cols-2 items-start">
        <Reveal>
          <SectionHeading eyebrow={dict.problem.eyebrow[lang]} tone="light" id="problem-h2">
            {dict.problem.h2Part1[lang]}{" "}
            <em style={{ fontStyle: "italic", color: "var(--sc-sun)" }}>{dict.problem.h2Em[lang]}</em>
          </SectionHeading>
          <div className="w-8 h-px mt-6 bg-[var(--sc-black)] opacity-30" />
        </Reveal>
        <Reveal delay>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[var(--sc-grey)]">
            {dict.problem.items.map((item, i) => (
              <div
                key={i}
                className="bg-[var(--sc-white)] sc-card-tint relative overflow-hidden transition-colors"
                style={{ padding: "32px 26px" }}
              >
                <span className="sc-serif block" style={{ fontSize: "2.4rem", fontWeight: 300, lineHeight: 1, color: "var(--sc-black)", marginBottom: 6 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="block" style={{ fontSize: "0.55rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--sc-text-mid)", marginBottom: 7 }}>
                  Problem {i + 1}
                </span>
                <p style={{ fontSize: "0.78rem", color: "var(--sc-text-mid)", lineHeight: 1.65 }}>{item[lang]}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
