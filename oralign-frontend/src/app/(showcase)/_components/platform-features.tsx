"use client";

import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";

export function PlatformFeatures() {
  const { lang } = useShowcaseLang();
  return (
    <section
      id="features"
      data-section-tone="dark"
      aria-labelledby="features-h2"
      className="bg-[var(--sc-black)] text-[var(--sc-white)]"
      style={{ padding: "120px 24px" }}
    >
      <div className="mx-auto max-w-[1400px] lg:px-12">
        <Reveal>
          <div className="max-w-2xl">
            <div className="flex items-center gap-3" style={{ fontSize: "0.55rem", letterSpacing: "0.42em", textTransform: "uppercase", color: "var(--sc-sun)" }}>
              <span className="sc-eyebrow-line w-[18px] h-px bg-[var(--sc-sun)]" aria-hidden="true" />
              <span>{dict.features.eyebrow[lang]}</span>
            </div>
            <h2 id="features-h2" className="sc-serif mt-3.5" style={{ fontSize: "clamp(2rem, 3.5vw, 3.6rem)", fontWeight: 300, lineHeight: 1.08, color: "var(--sc-white)" }}>
              {dict.features.h2Part1[lang]}{" "}
              <em style={{ fontStyle: "italic", color: "var(--sc-sun)" }}>{dict.features.h2Em[lang]}</em>{" "}
              {dict.features.h2Part3[lang]}
            </h2>
          </div>
        </Reveal>

        <Reveal delay>
          <ul className="list-none mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[#1e1e1e]">
            {dict.features.cards.map((c, i) => (
              <li
                key={i}
                className="bg-[var(--sc-black)] relative overflow-hidden transition-colors hover:bg-[#0f0f0f]"
                style={{ padding: "44px 32px", minHeight: 200 }}
              >
                <span
                  className="sc-serif block"
                  style={{ fontSize: "3rem", fontWeight: 300, lineHeight: 1, color: "rgba(255,255,255,0.06)", marginBottom: 18 }}
                  aria-hidden="true"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="sc-serif" style={{ fontSize: "1.15rem", fontWeight: 400, color: "var(--sc-white)" }}>
                  {c[lang]}
                </h3>
                <span aria-hidden="true" className="absolute left-0 top-0 w-[2px] h-0 bg-[var(--sc-sun)] transition-all duration-500 group-hover:h-full" />
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
