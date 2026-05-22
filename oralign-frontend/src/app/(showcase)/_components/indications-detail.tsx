"use client";

import Image from "next/image";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { featuredCases } from "../_lib/case-gallery";
import { Reveal } from "./shared/reveal";
import { SectionHeading } from "./shared/section-heading";

export function IndicationsDetail() {
  const { lang } = useShowcaseLang();
  return (
    <section
      id="indications"
      data-section-tone="dark"
      aria-labelledby="indications-h2"
      className="bg-[var(--sc-black)] text-[var(--sc-white)]"
      style={{ padding: "120px 24px" }}
    >
      <div className="mx-auto max-w-[1400px] lg:px-12">
        <Reveal>
          <div className="max-w-3xl mx-auto text-center">
            <SectionHeading eyebrow={dict.indicationsDetail.eyebrow[lang]} tone="dark" align="center" id="indications-h2">
              {dict.indicationsDetail.h2Part1[lang]}{" "}
              <em style={{ fontStyle: "italic", color: "var(--sc-sun)" }}>{dict.indicationsDetail.h2Em[lang]}</em>
            </SectionHeading>
            <p
              className="mt-6 mx-auto"
              style={{ fontSize: "0.92rem", lineHeight: 1.85, color: "var(--sc-text-mid-on-dark)", maxWidth: 560 }}
            >
              {dict.indicationsDetail.intro[lang]}
            </p>
          </div>
        </Reveal>

        <Reveal delay>
          {/*
            Premium indication-cards layout
            ─────────────────────────────────────────────────────────────
            Goals (premium medical-brand aesthetic):
              • Every card identical width AND height across ALL rows,
                regardless of description length.
              • Every image identical visible size — fixed aspect-[4/3]
                frame + object-cover so portrait + landscape sources
                read the same way.
              • Last partial row stays centred so the grid never feels
                truncated.
              • Smooth Tailwind hover treatment: subtle lift + ring
                brighten + image zoom. No JS, GPU-friendly transforms.

            How equal height across DIFFERENT rows is achieved
            ─────────────────────────────────────────────────────────────
            Flex-wrap by itself only equalises heights WITHIN a row, not
            across rows. Two techniques layered to get a uniform look:
              1. The card itself is `flex flex-col` — the image frame
                 has a fixed aspect ratio and the content area uses
                 `flex-1` to fill whatever's left.
              2. The description is `line-clamp-2` with a deterministic
                 line-height, so the natural content height is the same
                 for every card. Combined with a consistent fixed
                 content padding, every card lands on the same pixel
                 height by construction — no min-height hacks.

            Card width math
            ─────────────────────────────────────────────────────────────
            gap-6 = 1.5 rem (24 px). Per breakpoint:
              lg+   3 per row, 2 gaps total 48 px  → w-[calc(33.333%-1rem)]
              sm    2 per row, 1 gap of 24 px      → w-[calc(50%-0.75rem)]
              base  1 per row, no gap              → w-full + max-w cap
          */}
          <ul className="mx-auto mt-12 flex max-w-[1200px] list-none flex-wrap justify-center gap-6 sm:mt-16">
            {featuredCases.map((item, i) => (
              <li
                key={item.id}
                className={[
                  // Sizing: identical per-breakpoint width for every card
                  "w-full max-w-[420px] sm:w-[calc(50%-0.75rem)] sm:max-w-none lg:w-[calc(33.333%-1rem)]",
                  // Internal layout: flex column so the content area can
                  // grow to keep card heights equal within a row.
                  "group flex flex-col overflow-hidden",
                  // Premium surface: card sits on a slightly-lighter-than-
                  // section background, hairline ring, soft shadow, rounded.
                  "rounded-xl bg-[#101010] ring-1 ring-white/5",
                  "shadow-[0_10px_30px_-12px_rgba(0,0,0,0.55)]",
                  // Hover: lift + ring brighten + image will zoom via its
                  // own group-hover rule below. All GPU-friendly transforms.
                  "transition-all duration-500 ease-out",
                  "hover:-translate-y-1 hover:ring-white/15 hover:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.65)]",
                ].join(" ")}
              >
                {/* Image frame — aspect-[4/3] gives every card the SAME
                    image height. overflow-hidden + object-cover means
                    portrait shots are cropped to fit instead of letterboxed. */}
                <div className="relative w-full overflow-hidden aspect-[4/3]">
                  <Image
                    src={item.before}
                    alt={`${item.title[lang]} — ${item.concern[lang]}`}
                    fill
                    sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
                    unoptimized={item.before.endsWith(".webp")}
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                  {/* Subtle bottom fade — adds premium depth, separates
                      image from the text block without a hard border. */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/55 to-transparent"
                  />
                </div>

                {/* Content area — flex-1 ensures it grows to match the
                    tallest card in the row, so every card is the SAME
                    visible height. Description is line-clamped to 2
                    lines so a long medical concern doesn't push the
                    card taller than its neighbours. */}
                <div className="flex flex-1 flex-col gap-2 p-6 sm:p-7">
                  <span
                    className="block text-[var(--sc-sun)]"
                    style={{
                      fontSize: "0.5rem",
                      letterSpacing: "0.4em",
                      textTransform: "uppercase",
                      fontWeight: 500,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")} ·{" "}
                    {lang === "fr" ? "Indication" : lang === "en" ? "Indication" : "استطباب"}
                  </span>
                  <h3
                    className="sc-serif text-[var(--sc-white)]"
                    style={{ fontSize: "1.18rem", fontWeight: 400, lineHeight: 1.3 }}
                  >
                    {item.shortTitle[lang]}
                  </h3>
                  <p
                    className="line-clamp-2 text-[var(--sc-text-mid-on-dark)]"
                    style={{ fontSize: "0.85rem", lineHeight: 1.65 }}
                  >
                    {item.concern[lang]}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay>
          <p
            className="mt-14 mx-auto text-center"
            style={{
              fontSize: "0.78rem",
              color: "var(--sc-sun)",
              maxWidth: 720,
              lineHeight: 1.75,
              fontWeight: 400,
              letterSpacing: "0.02em",
            }}
          >
            {dict.indicationsDetail.disclaimer[lang]}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
