"use client";

import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";
import { SectionHeading } from "./shared/section-heading";

export function MadeWhere() {
  const { lang } = useShowcaseLang();
  return (
    <section
      id="heritage"
      data-section-tone="light"
      aria-labelledby="heritage-h2"
      className="bg-[var(--sc-white)]"
      style={{ padding: "120px 24px" }}
    >
      <div className="mx-auto max-w-[1400px] lg:px-12 grid gap-16 lg:grid-cols-2 items-center">
        <Reveal>
          <div className="max-w-[480px]">
            <SectionHeading eyebrow={dict.madeWhere.eyebrow[lang]} tone="light" id="heritage-h2">
              {dict.madeWhere.h2Part1[lang]}{" "}
              <em style={{ fontStyle: "italic", color: "var(--sc-sun)" }}>{dict.madeWhere.h2Em[lang]}</em>
            </SectionHeading>
            <div className="w-8 h-px mt-6 bg-[var(--sc-black)] opacity-25" />
            <p
              className="mt-8"
              style={{ fontSize: "0.92rem", lineHeight: 1.95, color: "var(--sc-text-mid)" }}
            >
              {dict.madeWhere.body[lang]}
            </p>
          </div>
        </Reveal>

        <Reveal delay>
          <div className="relative">
            <div
              aria-hidden="true"
              className="absolute pointer-events-none"
              style={{
                inset: 0,
                opacity: 0.18,
                background:
                  "radial-gradient(circle at 50% 50%, rgba(245,200,66,0.4), transparent 60%)",
              }}
            />
            <div
              className="relative grid grid-cols-2 gap-px"
              style={{ background: "var(--sc-grey)", maxWidth: 520, marginLeft: "auto" }}
            >
              {dict.madeWhere.stats.map((stat, i) => (
                <div
                  key={i}
                  className="bg-[var(--sc-white)] sc-card-tint transition-colors relative overflow-hidden group"
                  style={{ padding: "32px 28px", minHeight: 180 }}
                >
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--sc-sun)] origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500"
                  />
                  <span
                    className="sc-serif block"
                    style={{
                      fontSize: "2.1rem",
                      fontWeight: 200,
                      lineHeight: 1,
                      color: "var(--sc-black)",
                      letterSpacing: "0.02em",
                      marginBottom: 14,
                    }}
                  >
                    {stat.num[lang]}
                  </span>
                  <span
                    className="block"
                    style={{
                      fontSize: "0.55rem",
                      letterSpacing: "0.3em",
                      textTransform: "uppercase",
                      color: "var(--sc-text-mid)",
                      marginBottom: 10,
                      fontWeight: 400,
                    }}
                  >
                    {stat.label[lang]}
                  </span>
                  <p
                    style={{
                      fontSize: "0.78rem",
                      color: "var(--sc-text-mid)",
                      lineHeight: 1.7,
                    }}
                  >
                    {stat.desc[lang]}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
