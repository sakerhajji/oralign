"use client";

import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";
import { SectionHeading } from "./shared/section-heading";

export function PatientsSection() {
  const { lang } = useShowcaseLang();
  return (
    <section
      id="patients"
      data-section-tone="light"
      aria-labelledby="patients-h2"
      className="bg-[var(--sc-white)]"
      style={{ padding: "120px 24px" }}
    >
      <div className="mx-auto max-w-[1400px] lg:px-12 grid gap-14 lg:grid-cols-2 items-start">
        <Reveal>
          <SectionHeading eyebrow={dict.patients.eyebrow[lang]} tone="light" id="patients-h2">
            {dict.patients.h2Part1[lang]}{" "}
            <em style={{ fontStyle: "italic", color: "var(--sc-sun)" }}>{dict.patients.h2Em[lang]}</em>
          </SectionHeading>
        </Reveal>
        <Reveal delay>
          <div
            className="border-2 border-[var(--sc-sun)] bg-[#fdf9ec] relative"
            style={{ padding: "32px 28px" }}
            role="note"
          >
            <p style={{ fontSize: "0.95rem", lineHeight: 1.7, color: "var(--sc-black)" }}>
              <strong style={{ fontWeight: 500 }}>{dict.patients.callout[lang]}</strong>
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
