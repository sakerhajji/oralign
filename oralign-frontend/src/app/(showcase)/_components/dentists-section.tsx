"use client";

import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";
import { ImagePlaceholder } from "./shared/image-placeholder";

export function DentistsSection() {
  const { lang } = useShowcaseLang();
  return (
    <section
      id="dentists"
      data-section-tone="dark"
      aria-labelledby="dentists-h2"
      className="bg-[var(--sc-black)] text-[var(--sc-white)]"
      style={{ padding: "120px 24px" }}
    >
      <div className="mx-auto max-w-[1400px] lg:px-12 grid gap-14 lg:grid-cols-2 items-start">
        <Reveal>
          <div>
            <div
              className="flex items-center gap-3"
              style={{ fontSize: "0.55rem", letterSpacing: "0.42em", textTransform: "uppercase", color: "var(--sc-sun)" }}
            >
              <span className="sc-eyebrow-line w-[18px] h-px bg-[var(--sc-sun)]" aria-hidden="true" />
              <span>{dict.dentists.eyebrow[lang]}</span>
            </div>
            <h2
              id="dentists-h2"
              className="sc-serif mt-3.5"
              style={{ fontSize: "clamp(2rem, 3.5vw, 3.6rem)", fontWeight: 300, lineHeight: 1.08, color: "var(--sc-white)" }}
            >
              {dict.dentists.h2Part1[lang]}{" "}
              <em style={{ fontStyle: "italic", color: "var(--sc-sun)" }}>{dict.dentists.h2Em[lang]}</em>
            </h2>
            <ul className="list-none flex flex-col gap-3.5 mt-10">
              {dict.dentists.items.map((it, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3"
                  style={{ fontSize: "0.92rem", color: "rgba(248,246,242,0.75)", lineHeight: 1.7 }}
                >
                  <span aria-hidden="true" className="text-[var(--sc-sun)] font-bold flex-shrink-0">—</span>
                  <span>{it[lang]}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
        <Reveal delay>
          <div className="grid grid-cols-2 gap-3">
            <ImagePlaceholder label={dict.common.imagePlaceholder[lang]} aspect="portrait" tone="dark" />
            <ImagePlaceholder label={dict.common.imagePlaceholder[lang]} aspect="square" tone="dark" className="self-end" />
            <ImagePlaceholder label={dict.common.imagePlaceholder[lang]} aspect="square" tone="dark" />
            <ImagePlaceholder label={dict.common.imagePlaceholder[lang]} aspect="portrait" tone="dark" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
