"use client";

import Image from "next/image";
import { showcaseCases } from "../_lib/case-gallery";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";
import { SectionHeading } from "./shared/section-heading";

const testimonialCases = [showcaseCases[0], showcaseCases[2], showcaseCases[5]];

export function Testimonials() {
  const { lang } = useShowcaseLang();

  return (
    <section
      id="testimonials"
      data-section-tone="light"
      aria-labelledby="testi-h2"
      className="bg-[var(--sc-white)]"
      style={{ padding: "120px 24px" }}
    >
      <div className="mx-auto max-w-[1400px] lg:px-12">
        <Reveal>
          <SectionHeading eyebrow={dict.testimonials.eyebrow[lang]} tone="light" id="testi-h2">
            {dict.testimonials.h2Part1[lang]}{" "}
            <em style={{ fontStyle: "italic", color: "var(--sc-sun)" }}>{dict.testimonials.h2Em[lang]}</em>
          </SectionHeading>
        </Reveal>

        <Reveal delay>
          <ul className="mt-14 grid list-none grid-cols-1 gap-px bg-[var(--sc-grey)] md:grid-cols-3">
            {dict.testimonials.items.map((t, i) => {
              const item = testimonialCases[i] ?? showcaseCases[i];
              return (
                <li
                  key={t.name.fr}
                  className="sc-card-tint flex flex-col gap-6 bg-[var(--sc-white)]"
                  style={{ padding: "32px 28px" }}
                >
                  <figure>
                    <div className="relative aspect-[4/3] overflow-hidden border border-[var(--sc-grey)] bg-[var(--sc-grey)]">
                      <Image
                        src={item.after}
                        alt={`${item.shortTitle[lang]} - ${dict.preview.after[lang]}`}
                        fill
                        sizes="(min-width: 768px) 33vw, 100vw"
                        unoptimized={item.after.endsWith(".webp")}
                        className="object-contain"
                      />
                    </div>
                    <figcaption
                      className="mt-3"
                      style={{ fontSize: "0.52rem", letterSpacing: "0.28em", textTransform: "uppercase", color: "var(--sc-text-mid)" }}
                    >
                      {item.shortTitle[lang]} · {dict.preview.after[lang]}
                    </figcaption>
                  </figure>

                  <p
                    className="sc-serif"
                    style={{ fontStyle: "italic", fontSize: "1.05rem", lineHeight: 1.6, color: "var(--sc-black)", flex: 1 }}
                  >
                    &ldquo;{t.quote[lang]}&rdquo;
                  </p>

                  <div className="mt-auto flex items-center gap-3">
                    <div
                      aria-hidden="true"
                      className="flex h-10 w-10 items-center justify-center rounded-full"
                      style={{
                        background: "var(--sc-black)",
                        color: "var(--sc-sun)",
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        letterSpacing: "0.08em",
                      }}
                    >
                      {t.name[lang].slice(0, 1)}
                    </div>
                    <div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--sc-black)" }}>{t.name[lang]}</div>
                      <div
                        style={{
                          fontSize: "0.65rem",
                          letterSpacing: "0.18em",
                          textTransform: "uppercase",
                          color: "var(--sc-text-mid)",
                        }}
                      >
                        {t.role[lang]}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
