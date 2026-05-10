"use client";

import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";
import { SectionHeading } from "./shared/section-heading";
import { ImagePlaceholder } from "./shared/image-placeholder";

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
          <ul className="list-none mt-14 grid grid-cols-1 md:grid-cols-3 gap-px bg-[var(--sc-grey)]">
            {dict.testimonials.items.map((t, i) => (
              <li
                key={i}
                className="bg-[var(--sc-white)] sc-card-tint flex flex-col gap-6"
                style={{ padding: "32px 28px" }}
              >
                <ImagePlaceholder
                  label={dict.common.imagePlaceholder[lang]}
                  aspect="landscape"
                  tone="light"
                  className="w-full"
                />
                <p
                  className="sc-serif"
                  style={{ fontStyle: "italic", fontSize: "1.05rem", lineHeight: 1.6, color: "var(--sc-black)", flex: 1 }}
                >
                  &ldquo;{t.quote[lang]}&rdquo;
                </p>
                <div className="flex items-center gap-3 mt-auto">
                  <ImagePlaceholder
                    label=""
                    aspect="square"
                    tone="gold"
                    bare
                    className="w-10 h-10 rounded-full overflow-hidden"
                  />
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
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
