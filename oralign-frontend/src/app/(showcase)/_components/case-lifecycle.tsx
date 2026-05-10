"use client";

import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";

export function CaseLifecycle() {
  const { lang } = useShowcaseLang();
  return (
    <section
      id="lifecycle"
      data-section-tone="dark"
      aria-labelledby="lifecycle-h2"
      className="bg-[var(--sc-black)] text-[var(--sc-white)] overflow-hidden"
      style={{ padding: "120px 24px" }}
    >
      <div className="mx-auto max-w-[1400px] lg:px-12">
        <Reveal>
          <div className="max-w-2xl">
            <div className="flex items-center gap-3" style={{ fontSize: "0.55rem", letterSpacing: "0.42em", textTransform: "uppercase", color: "var(--sc-sun)" }}>
              <span className="sc-eyebrow-line w-[18px] h-px bg-[var(--sc-sun)]" aria-hidden="true" />
              <span>{dict.lifecycle.eyebrow[lang]}</span>
            </div>
            <h2 id="lifecycle-h2" className="sc-serif mt-3.5" style={{ fontSize: "clamp(2rem, 3.5vw, 3.6rem)", fontWeight: 300, lineHeight: 1.08, color: "var(--sc-white)" }}>
              {dict.lifecycle.h2Part1[lang]}{" "}
              <em style={{ fontStyle: "italic", color: "var(--sc-sun)" }}>{dict.lifecycle.h2Em[lang]}</em>
            </h2>
          </div>
        </Reveal>
        <Reveal delay>
          <ol className="list-none mt-14 flex gap-4 overflow-x-auto pb-4 snap-x" style={{ scrollSnapType: "x mandatory" }}>
            {dict.lifecycle.stages.map((st, i) => (
              <li
                key={i}
                className="flex-shrink-0 w-44 snap-start text-center relative"
              >
                <div
                  className="mx-auto mb-3 rounded-full flex items-center justify-center sc-serif"
                  style={{
                    width: 54,
                    height: 54,
                    background: "var(--sc-sun)",
                    color: "var(--sc-black)",
                    fontSize: "1.05rem",
                    fontWeight: 300,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </div>
                <span style={{ fontSize: "0.78rem", color: "rgba(248,246,242,0.75)", lineHeight: 1.4 }}>{st[lang]}</span>
                {i < dict.lifecycle.stages.length - 1 && (
                  <span aria-hidden="true" className="absolute top-[27px] right-[-18px] w-9 h-px" style={{ background: "linear-gradient(to right, rgba(245,200,66,0.4), transparent)" }} />
                )}
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
