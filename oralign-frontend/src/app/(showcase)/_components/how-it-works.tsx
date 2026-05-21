"use client";

import { ClipboardCheck, Eye, ScanFace, Smile, Stethoscope } from "lucide-react";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";
import { SectionHeading } from "./shared/section-heading";

const stepIcons = [Stethoscope, ScanFace, Eye, ClipboardCheck, Smile];

export function HowItWorks() {
  const { lang } = useShowcaseLang();
  return (
    <section
      id="how-it-works"
      data-section-tone="light"
      aria-labelledby="how-h2"
      className="bg-[var(--sc-white)]"
      style={{ padding: "120px 24px" }}
    >
      <div className="mx-auto max-w-[1400px] lg:px-12">
        <Reveal>
          <div className="text-center max-w-3xl mx-auto">
            <SectionHeading eyebrow={dict.how.eyebrow[lang]} tone="light" align="center" id="how-h2">
              {dict.how.h2Part1[lang]}{" "}
              <em style={{ fontStyle: "italic", color: "var(--sc-sun)" }}>{dict.how.h2Em[lang]}</em>
            </SectionHeading>
          </div>
        </Reveal>

        <Reveal delay>
          <ol className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-12 lg:gap-6 mt-16 list-none">
            {dict.how.steps.map((s, i) => (
              <li key={i} className="relative flex flex-col items-center text-center px-2">
                <div
                  className="mb-6 grid aspect-square w-full max-w-[180px] place-items-center border border-[var(--sc-grey)] bg-[rgba(254,202,22,0.08)]"
                  aria-hidden="true"
                >
                  {(() => {
                    const Icon = stepIcons[i] ?? Smile;
                    return <Icon className="h-10 w-10 text-[var(--sc-black)]" strokeWidth={1.35} />;
                  })()}
                </div>
                <div
                  className="rounded-full flex items-center justify-center relative z-[1] mb-4"
                  style={{
                    width: 56,
                    height: 56,
                    background: "var(--sc-sun)",
                    color: "var(--sc-black)",
                    fontFamily: "var(--font-sc-serif, 'Playfair Display', serif)",
                    fontSize: "1.2rem",
                    fontWeight: 300,
                    boxShadow: "0 4px 18px rgba(245,200,66,0.25)",
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3 className="sc-serif" style={{ fontSize: "1rem", marginBottom: 8, color: "var(--sc-black)" }}>
                  {s[lang]}
                </h3>
                <p style={{ fontSize: "0.78rem", lineHeight: 1.6, color: "var(--sc-text-mid)", maxWidth: 220 }}>
                  {dict.how.stepDescs[i][lang]}
                </p>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
