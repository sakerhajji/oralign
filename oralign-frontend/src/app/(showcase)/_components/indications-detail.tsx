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
            Layout: flex-wrap + justify-center so a partial trailing row
            (e.g. 5 items in a 3-up layout → 3 then 2) centres its two
            cards instead of leaving them flushed to the left edge.
            CSS Grid wouldn't centre the last row — its cells are fixed
            to a 3-column track regardless of how many items occupy it.

            Card sizing: every card is given an EXPLICIT width per
            breakpoint using `calc(% - gap-share)` so all cards are the
            same pixel width whether they're in a full row or a partial
            one. gap-5 = 1.25rem (20px). For 3-up the 2 gaps total 40px;
            each card therefore gets `calc(33.333% - 0.834rem)` (~13.3px
            of gap allowance per card). Same math for the 2-up sm
            breakpoint with one 20px gap.
          */}
          <ul className="mx-auto mt-12 flex max-w-[1200px] list-none flex-wrap justify-center gap-5 sm:mt-16">
            {featuredCases.map((item, i) => (
              <li
                key={item.id}
                className="group relative w-full max-w-[420px] overflow-hidden rounded-lg bg-[#111] ring-1 ring-white/5 transition-colors hover:ring-white/10 sm:w-[calc(50%-0.625rem)] sm:max-w-none lg:w-[calc(33.333%-0.834rem)]"
              >
                {/* Image frame — fixed aspect ratio so every card is
                    exactly the same height regardless of source-image
                    dimensions. `object-cover` fills the frame instead of
                    leaving white padding around portrait shots. */}
                <div className="relative w-full" style={{ aspectRatio: "4 / 3" }}>
                  <Image
                    src={item.before}
                    alt={`${item.title[lang]} — ${item.concern[lang]}`}
                    fill
                    sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
                <div style={{ padding: "22px 24px 24px" }}>
                  <span
                    className="block"
                    style={{
                      fontSize: "0.5rem",
                      letterSpacing: "0.4em",
                      textTransform: "uppercase",
                      color: "var(--sc-sun)",
                      marginBottom: 8,
                      fontWeight: 500,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")} ·{" "}
                    {lang === "fr" ? "Indication" : lang === "en" ? "Indication" : "استطباب"}
                  </span>
                  <h3
                    className="sc-serif"
                    style={{ fontSize: "1.15rem", fontWeight: 400, color: "var(--sc-white)", marginBottom: 8 }}
                  >
                    {item.shortTitle[lang]}
                  </h3>
                  <p style={{ fontSize: "0.82rem", color: "var(--sc-text-mid-on-dark)", lineHeight: 1.65 }}>
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
