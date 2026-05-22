"use client";

import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";
import Image from "next/image";

/**
 * Confidence section — emotional pivot between "Indications" (when aligners are
 * right) and "Why ORALIGN" (Solution). Patient-first, transformation tone.
 * Image is intentionally a placeholder; user will provide an editorial lifestyle
 * photo later that follows ORALIGN IMAGERY STYLE 01 (golden hour, amber accent).
 */
export function ConfidenceSection() {
  const { lang } = useShowcaseLang();

  return (
    <section
      id="confidence"
      data-section-tone="light"
      aria-labelledby="confidence-h2"
      className="bg-[var(--sc-white)]"
      style={{ padding: "120px 24px" }}
    >
      <div className="mx-auto max-w-[1400px] lg:px-12">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-20">
          <Reveal>
            <Image
              src="/showcase/imageSmileShowcase.webp"
              alt={dict.confidence.imageLabel[lang]}
              width={480}
              height={640}
              unoptimized
              className="mx-auto max-w-[480px] rounded-lg object-cover"
            />
          </Reveal>

          <Reveal delay>
            <div className="max-w-[520px]">
              <div
                className="flex items-center gap-3"
                style={{
                  fontSize: "0.55rem",
                  letterSpacing: "0.42em",
                  textTransform: "uppercase",
                  color: "var(--sc-sun-deep)",
                  marginBottom: 14,
                }}
              >
                <span className="sc-eyebrow-line h-px w-[18px] bg-[var(--sc-sun-deep)]" aria-hidden="true" />
                <span>{dict.confidence.eyebrow[lang]}</span>
              </div>

              <h2
                id="confidence-h2"
                className="sc-serif"
                style={{
                  fontSize: "clamp(1.9rem, 3.4vw, 3.2rem)",
                  fontWeight: 400,
                  lineHeight: 1.12,
                  color: "var(--sc-black)",
                }}
              >
                {dict.confidence.h2Part1[lang]}{" "}
                <em style={{ fontStyle: "italic", color: "var(--sc-sun-deep)" }}>
                  {dict.confidence.h2Em[lang]}
                </em>
              </h2>

              <div className="mt-6 h-px w-8 bg-[var(--sc-black)] opacity-25" />

              <p
                className="mt-8"
                style={{
                  fontSize: "0.96rem",
                  lineHeight: 1.9,
                  color: "var(--sc-text-mid)",
                }}
              >
                {dict.confidence.intro[lang]}
              </p>

              <ul className="mt-10 grid gap-px bg-[var(--sc-grey)] sm:grid-cols-2">
                {dict.confidence.pillars.map((pillar) => (
                  <li
                    key={pillar.title.fr}
                    className="bg-[var(--sc-white)] p-6 transition-colors hover:bg-[#fdf9ec]"
                  >
                    <h3
                      className="sc-serif"
                      style={{
                        fontSize: "0.95rem",
                        fontWeight: 700,
                        color: "var(--sc-black)",
                        marginBottom: 8,
                      }}
                    >
                      {pillar.title[lang]}
                    </h3>
                    <p
                      style={{
                        fontSize: "0.82rem",
                        lineHeight: 1.7,
                        color: "var(--sc-text-mid)",
                      }}
                    >
                      {pillar.body[lang]}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
